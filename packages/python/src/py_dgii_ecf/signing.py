"""XMLDSig signing (enveloped signature, inclusive C14N 1.0, RSA-SHA256).

The digest is computed over the canonicalized root element *before* the
``<Signature>`` is appended. ``SignedInfo`` is kept attached to its
``Signature`` element so the namespace context used for canonicalization is
exactly the one that is emitted.

The ``<Signature>`` element (and its children) use the XMLDSig namespace as the
*default* namespace — matching the serialization DGII publishes in its own
sample documents.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from cryptography import x509
from cryptography.exceptions import UnsupportedAlgorithm
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from lxml import etree

from .errors import DgiiError, DgiiErrorCode
from .result import DgiiResult, Err, Ok

DSIG = "http://www.w3.org/2000/09/xmldsig#"
C14N_INCLUSIVE = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256"
RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"
ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature"


def _ds(name: str) -> str:
    return f"{{{DSIG}}}{name}"


def _canonicalize(node: etree._Element) -> bytes:
    """Inclusive C14N 1.0 without comments — the bytes DGII will hash.

    lxml emits spurious ``xmlns=""`` attributes when canonicalizing a detached
    subtree that lives in a default namespace. Serializing the node to a
    standalone document and re-parsing it before canonicalizing yields the
    spec-correct bytes (the ones a .NET/DGII verifier will compute).
    """
    standalone = etree.fromstring(etree.tostring(node))
    result: bytes = etree.tostring(
        standalone, method="c14n", exclusive=False, with_comments=False
    )
    return result


class Signature:
    """Sign DGII XML documents with an RSA private key + X.509 certificate."""

    def __init__(self, private_key_pem: str, certificate_pem: str) -> None:
        loaded_key = serialization.load_pem_private_key(
            private_key_pem.encode("utf-8"), password=None
        )
        if not isinstance(loaded_key, rsa.RSAPrivateKey):
            raise ValueError("DGII signing requires an RSA private key")
        self._private_key: rsa.RSAPrivateKey = loaded_key
        self._certificate: x509.Certificate = x509.load_pem_x509_certificate(
            certificate_pem.encode("utf-8")
        )

    @classmethod
    def from_p12(cls, file_name: str | Path, password: str) -> Signature:
        """Build a signer directly from a .p12 file."""
        data = Path(file_name).read_bytes()
        key, certificate, _ = pkcs12.load_key_and_certificates(
            data, password.encode("utf-8") if password else None
        )
        if key is None or certificate is None:
            raise ValueError("PKCS#12 must contain a private key and certificate")
        key_pem = key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ).decode("utf-8")
        cert_pem = certificate.public_bytes(serialization.Encoding.PEM).decode("utf-8")
        return cls(key_pem, cert_pem)

    @classmethod
    def try_from_p12(
        cls, file_name: str | Path, password: str
    ) -> DgiiResult[Signature]:
        """Build a signer from a .p12 file, reporting failures as ``Err``.

        Additive counterpart to :meth:`from_p12`, which raises. Prefer this
        when the caller already threads ``Result``: an unreadable file, a wrong
        password or a PKCS#12 without a key pair becomes a ``DgiiError`` with
        code ``CERTIFICATE`` instead of an exception.
        """
        try:
            return Ok(cls.from_p12(file_name, password))
        except (OSError, TypeError, ValueError, UnsupportedAlgorithm) as exc:
            return Err(
                DgiiError(
                    f"Failed to load PKCS#12: {exc}",
                    code=DgiiErrorCode.CERTIFICATE,
                    cause=exc,
                )
            )

    def sign_xml(self, xml: str, root_name: str | None = None) -> DgiiResult[str]:
        """Sign ``xml`` and return the signed document (declaration included)."""
        try:
            parser = etree.XMLParser(remove_blank_text=True, remove_comments=True)
            root = etree.fromstring(xml.encode("utf-8"), parser=parser)
        except etree.XMLSyntaxError as exc:
            return Err(
                DgiiError(
                    f"Invalid XML: {exc}",
                    code=DgiiErrorCode.INVALID_XML,
                    cause=exc,
                )
            )
        if root is None:
            return Err(
                DgiiError(
                    "Unable to parse XML or find root element",
                    code=DgiiErrorCode.INVALID_XML,
                )
            )
        try:
            self._sign_element(root)
            body: str = etree.tostring(root, encoding="unicode")
            return Ok(f'<?xml version="1.0" encoding="utf-8"?>{body}')
        except Exception as exc:
            return Err(
                DgiiError(
                    f"Failed to sign XML: {exc}",
                    code=DgiiErrorCode.SIGNING,
                    cause=exc,
                )
            )

    def _sign_element(self, root: etree._Element) -> None:
        digest = hashlib.sha256(_canonicalize(root)).digest()

        # DSIG namespace as the default namespace (matches DGII sample docs).
        signature = etree.Element(_ds("Signature"), nsmap={None: DSIG})
        signed_info = etree.SubElement(signature, _ds("SignedInfo"))
        etree.SubElement(signed_info, _ds("CanonicalizationMethod")).set(
            "Algorithm", C14N_INCLUSIVE
        )
        etree.SubElement(signed_info, _ds("SignatureMethod")).set(
            "Algorithm", RSA_SHA256
        )
        reference = etree.SubElement(signed_info, _ds("Reference"))
        reference.set("URI", "")
        transforms = etree.SubElement(reference, _ds("Transforms"))
        etree.SubElement(transforms, _ds("Transform")).set("Algorithm", ENVELOPED)
        etree.SubElement(transforms, _ds("Transform")).set("Algorithm", C14N_INCLUSIVE)
        etree.SubElement(reference, _ds("DigestMethod")).set("Algorithm", SHA256)
        etree.SubElement(reference, _ds("DigestValue")).text = base64.b64encode(
            digest
        ).decode("ascii")

        # Attach the Signature before signing it so the ancestor namespace
        # context used for canonicalization matches the emitted document.
        root.append(signature)

        signature_value = self._private_key.sign(
            _canonicalize(signed_info),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        etree.SubElement(signature, _ds("SignatureValue")).text = base64.b64encode(
            signature_value
        ).decode("ascii")

        key_info = etree.SubElement(signature, _ds("KeyInfo"))
        x509_data = etree.SubElement(key_info, _ds("X509Data"))
        etree.SubElement(x509_data, _ds("X509Certificate")).text = base64.b64encode(
            self._certificate.public_bytes(serialization.Encoding.DER)
        ).decode("ascii")


@dataclass(frozen=True, slots=True)
class XmlCertificateValidation:
    """Result of validating the X509 certificate embedded in a document."""

    is_valid: bool
    subject: str | None = None
    issuer: str | None = None
    valid_from: str | None = None
    valid_to: str | None = None
    error: str | None = None


_CERT_RE = re.compile(
    r"<(?:[\w]+:)?X509Certificate>([\s\S]*?)</(?:[\w]+:)?X509Certificate>"
)


def validate_xml_certificate(xml: str) -> XmlCertificateValidation:
    """Validate the embedded X509 certificate of a signed XML document."""
    match = _CERT_RE.search(xml)
    if match is None:
        return XmlCertificateValidation(
            is_valid=False, error="X509Certificate not found"
        )
    try:
        der = base64.b64decode(re.sub(r"\s+", "", match.group(1)))
        certificate = x509.load_der_x509_certificate(der)
    except (ValueError, binascii.Error) as exc:
        return XmlCertificateValidation(is_valid=False, error=str(exc))

    now = datetime.now(UTC)
    not_before = certificate.not_valid_before_utc
    not_after = certificate.not_valid_after_utc
    is_valid = not_before <= now <= not_after
    return XmlCertificateValidation(
        is_valid=is_valid,
        subject=certificate.subject.rfc4514_string(),
        issuer=certificate.issuer.rfc4514_string(),
        valid_from=not_before.isoformat(),
        valid_to=not_after.isoformat(),
        error=None if is_valid else "Certificate expired or not yet valid",
    )
