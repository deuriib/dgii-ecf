"""PKCS#12 reader tests, including secret-hygiene assertions.

Both suites sign with ephemeral, in-test certificates, so the bundle used here
is generated on the fly — no committed key material.
"""

from __future__ import annotations

import base64
from datetime import UTC, datetime, timedelta

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

from py_dgii_ecf import AuthToken, P12Reader, P12ReaderData

PASSPHRASE = "ephemeral-test-passphrase"


def _ephemeral_p12() -> bytes:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "dgii-ecf-test")])
    now = datetime.now(UTC).replace(tzinfo=None)
    certificate = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(hours=1))
        .not_valid_after(now + timedelta(days=1))
        .sign(key, hashes.SHA256())
    )
    return pkcs12.serialize_key_and_certificates(
        name=b"dgii-ecf-test",
        key=key,
        cert=certificate,
        cas=None,
        encryption_algorithm=serialization.BestAvailableEncryption(
            PASSPHRASE.encode("utf-8")
        ),
    )


def test_reads_key_certificate_and_public_key() -> None:
    result = P12Reader(PASSPHRASE).get_key_from_bytes(_ephemeral_p12())

    assert result.is_ok()
    credentials = result.unwrap()
    assert credentials.key is not None
    assert "PRIVATE KEY" in credentials.key
    assert credentials.cert is not None
    assert "CERTIFICATE" in credentials.cert
    assert credentials.public_key is not None


def test_wrong_passphrase_is_a_certificate_error() -> None:
    result = P12Reader("wrong").get_key_from_bytes(_ephemeral_p12())

    assert result.is_err()


def test_reads_from_base64() -> None:
    payload = base64.b64encode(_ephemeral_p12()).decode("ascii")

    result = P12Reader(PASSPHRASE).get_key_from_base64(payload)

    assert result.is_ok()
    assert result.unwrap().cert is not None


def test_reads_from_file(tmp_path: object) -> None:
    path = tmp_path / "cert.p12"  # type: ignore[operator]
    path.write_bytes(_ephemeral_p12())

    result = P12Reader(PASSPHRASE).get_key_from_file(path)

    assert result.is_ok()


def test_certificate_info_reports_validity() -> None:
    info = P12Reader(PASSPHRASE).get_certificate_info_from_bytes(_ephemeral_p12())

    assert info.is_ok()
    assert "dgii-ecf-test" in info.unwrap().subject
    assert info.unwrap().valid_to > datetime.now(UTC)


def test_private_key_is_redacted_from_repr() -> None:
    credentials = P12Reader(PASSPHRASE).get_key_from_bytes(_ephemeral_p12()).unwrap()

    rendered = repr(credentials)

    assert "PRIVATE KEY" not in rendered
    assert "redacted" in rendered


def test_auth_token_is_redacted_from_repr() -> None:
    token = AuthToken(token="live-bearer-token", expira="2030-01-01", expedido="2029")

    rendered = repr(token)

    assert "live-bearer-token" not in rendered
    assert "redacted" in rendered
    assert token.token == "live-bearer-token"


def test_p12_reader_data_fields_are_positional_as_documented() -> None:
    data = P12ReaderData("k", "c", "p")

    assert (data.key, data.cert, data.public_key) == ("k", "c", "p")
