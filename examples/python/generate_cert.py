"""Generate an ephemeral self-signed .p12 for the local examples."""

from __future__ import annotations

import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

OUTPUT = Path(__file__).resolve().parent.parent / "output"


def main() -> int:
    output = Path(sys.argv[1]) if len(sys.argv) > 1 else OUTPUT / "test.p12"
    password = sys.argv[2] if len(sys.argv) > 2 else "test"
    output.parent.mkdir(parents=True, exist_ok=True)

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "dgii-ecf-example")])
    now = datetime.now(UTC).replace(tzinfo=None)
    certificate = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(hours=1))
        .not_valid_after(now + timedelta(days=30))
        .sign(key, hashes.SHA256())
    )
    p12 = pkcs12.serialize_key_and_certificates(
        name=b"dgii-ecf-example",
        key=key,
        cert=certificate,
        cas=None,
        encryption_algorithm=serialization.BestAvailableEncryption(password.encode()),
    )
    output.write_bytes(p12)
    print(f"Wrote {output} (password: {password})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
