"""Sign a DGII e-CF XML document with a .p12 certificate."""

from __future__ import annotations

import sys
from pathlib import Path

from py_dgii_ecf import P12Reader, Signature, validate_xml_certificate

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"
OUTPUT = Path(__file__).resolve().parent.parent / "output"


def main() -> int:
    xml_path = Path(sys.argv[1]) if len(sys.argv) > 1 else FIXTURES / "invoice-31.xml"
    p12_path = Path(sys.argv[2]) if len(sys.argv) > 2 else OUTPUT / "test.p12"
    password = sys.argv[3] if len(sys.argv) > 3 else "test"

    credentials = P12Reader(password).get_key_from_file(p12_path)
    if credentials.is_err():
        print(f"error: {credentials.unwrap_err()}", file=sys.stderr)
        return 1

    data = credentials.unwrap()
    if not data.key or not data.cert:
        print("error: certificate is missing a key or certificate", file=sys.stderr)
        return 1

    signed = Signature(data.key, data.cert).sign_xml(
        xml_path.read_text(encoding="utf-8")
    )
    if signed.is_err():
        print(f"error: {signed.unwrap_err()}", file=sys.stderr)
        return 1

    OUTPUT.mkdir(exist_ok=True)
    output = OUTPUT / f"{xml_path.stem}.signed.xml"
    output.write_text(signed.unwrap(), encoding="utf-8")

    validation = validate_xml_certificate(signed.unwrap())
    print(f"Signed -> {output}")
    print(f"Certificate valid: {validation.is_valid} ({validation.subject})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
