"""PKCS#12 (.p12) certificate reader."""

from __future__ import annotations

import base64
import binascii
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.types import PrivateKeyTypes
from cryptography.hazmat.primitives.serialization import pkcs12

from .errors import DgiiError, DgiiErrorCode
from .result import DgiiResult, Err, Ok


@dataclass(frozen=True, slots=True)
class P12ReaderData:
    """PEM-encoded private key, certificate and public key."""

    key: str | None = None
    cert: str | None = None
    public_key: str | None = None


@dataclass(frozen=True, slots=True)
class CertificateInfo:
    """Basic metadata about an X.509 certificate."""

    subject: str
    issuer: str
    valid_from: datetime
    valid_to: datetime
    serial_number: str


class P12Reader:
    """Read a PKCS#12 bundle and extract the private key + certificate."""

    def __init__(self, passphrase: str) -> None:
        self._passphrase = passphrase

    def _load(self, data: bytes) -> tuple[PrivateKeyTypes, x509.Certificate]:
        password = self._passphrase.encode("utf-8") if self._passphrase else None
        key, certificate, _ = pkcs12.load_key_and_certificates(data, password)
        if key is None or certificate is None:
            raise ValueError("PKCS#12 must contain a private key and certificate")
        return key, certificate

    def get_key_from_file(self, file_name: str | Path) -> DgiiResult[P12ReaderData]:
        """Read a .p12 file from disk."""
        try:
            return self.get_key_from_bytes(Path(file_name).read_bytes())
        except OSError as exc:
            return Err(
                DgiiError(
                    f"Unable to read .p12 file: {file_name}",
                    code=DgiiErrorCode.CERTIFICATE,
                    cause=exc,
                )
            )

    def get_key_from_base64(self, base64_data: str) -> DgiiResult[P12ReaderData]:
        """Read a base64-encoded .p12 payload."""
        try:
            decoded = base64.b64decode(base64_data)
        except (ValueError, binascii.Error) as exc:
            return Err(
                DgiiError(
                    f"Invalid base64 .p12 payload: {exc}",
                    code=DgiiErrorCode.CERTIFICATE,
                    cause=exc,
                )
            )
        return self.get_key_from_bytes(decoded)

    def get_key_from_bytes(self, data: bytes) -> DgiiResult[P12ReaderData]:
        """Read a raw PKCS#12 byte string."""
        try:
            key, certificate = self._load(data)
            key_pem = key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption(),
            ).decode("utf-8")
            cert_pem = certificate.public_bytes(serialization.Encoding.PEM).decode(
                "utf-8"
            )
            public_key_pem = (
                key.public_key()
                .public_bytes(
                    serialization.Encoding.PEM,
                    serialization.PublicFormat.SubjectPublicKeyInfo,
                )
                .decode("utf-8")
            )
            return Ok(
                P12ReaderData(
                    key=key_pem,
                    cert=cert_pem,
                    public_key=public_key_pem,
                )
            )
        except ValueError as exc:
            return Err(
                DgiiError(
                    f"Unable to parse .p12: {exc}",
                    code=DgiiErrorCode.CERTIFICATE,
                    cause=exc,
                )
            )

    def get_certificate_info(
        self,
        file_name: str | Path,
    ) -> DgiiResult[CertificateInfo]:
        """Read certificate metadata from a .p12 file."""
        try:
            return self.get_certificate_info_from_bytes(Path(file_name).read_bytes())
        except OSError as exc:
            return Err(
                DgiiError(
                    f"Unable to read .p12 file: {file_name}",
                    code=DgiiErrorCode.CERTIFICATE,
                    cause=exc,
                )
            )

    def get_certificate_info_from_base64(
        self,
        base64_data: str,
    ) -> DgiiResult[CertificateInfo]:
        """Read certificate metadata from a base64-encoded .p12 payload."""
        try:
            decoded = base64.b64decode(base64_data)
        except (ValueError, binascii.Error) as exc:
            return Err(
                DgiiError(
                    f"Invalid base64 .p12 payload: {exc}",
                    code=DgiiErrorCode.CERTIFICATE,
                    cause=exc,
                )
            )
        return self.get_certificate_info_from_bytes(decoded)

    def get_certificate_info_from_bytes(
        self,
        data: bytes,
    ) -> DgiiResult[CertificateInfo]:
        """Read certificate metadata from raw PKCS#12 bytes."""
        try:
            _, certificate = self._load(data)
        except ValueError as exc:
            return Err(
                DgiiError(
                    f"Unable to extract certificate info: {exc}",
                    code=DgiiErrorCode.CERTIFICATE,
                    cause=exc,
                )
            )
        return Ok(
            CertificateInfo(
                subject=certificate.subject.rfc4514_string(),
                issuer=certificate.issuer.rfc4514_string(),
                valid_from=certificate.not_valid_before_utc,
                valid_to=certificate.not_valid_after_utc,
                serial_number=format(certificate.serial_number, "x"),
            )
        )
