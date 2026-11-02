"""Independent XMLDSig verification gate using libxmlsec1.

Signs a DGII fixture with an ephemeral certificate, then verifies the emitted
signature with libxmlsec1 (via the ``xmlsec`` Python binding). This catches
canonicalization regressions that a self-consistent test would miss.

Run in CI with: ``uv run --with xmlsec python scripts/verify_signing.py``.
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import xmlsec
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from lxml import etree

from py_dgii_ecf import Signature

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE = REPO_ROOT / "examples" / "fixtures" / "invoice-31.xml"


def _ephemeral_keys() -> tuple[str, str]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "dgii-ecf-xmlsec")])
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
    key_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode("utf-8")
    cert_pem = certificate.public_bytes(serialization.Encoding.PEM).decode("utf-8")
    return key_pem, cert_pem


def _verify(signed: str, cert_pem: str) -> None:
    root = etree.fromstring(signed.encode("utf-8"))
    signature_node = xmlsec.tree.find_node(root, xmlsec.Node.SIGNATURE)
    if signature_node is None:
        raise RuntimeError("no <Signature> element found")
    context = xmlsec.SignatureContext()
    context.key = xmlsec.Key.from_memory(cert_pem, xmlsec.KeyFormat.CERT_PEM, None)
    context.verify(signature_node)


def main() -> int:
    key_pem, cert_pem = _ephemeral_keys()
    xml = FIXTURE.read_text(encoding="utf-8")

    signed = Signature(key_pem, cert_pem).sign_xml(xml)
    if signed.is_err():
        print(f"error: {signed.unwrap_err()}", file=sys.stderr)
        return 1

    try:
        _verify(signed.unwrap(), cert_pem)
    except Exception as exc:
        print(f"xmlsec verification FAILED: {exc}", file=sys.stderr)
        return 1

    print("xmlsec verification PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
