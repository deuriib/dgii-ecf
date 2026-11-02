"""Sign and submit a range-voiding request (ANECF)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from py_dgii_ecf import ECF, Environment, P12Reader, Signature

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def main() -> int:
    p12_path = Path(os.environ["DGII_P12_PATH"])
    password = os.environ["DGII_P12_PASSWORD"]
    environment = Environment(os.environ.get("DGII_ENVIRONMENT", "TesteCF"))
    xml_path = Path(sys.argv[1]) if len(sys.argv) > 1 else FIXTURES / "anecf.xml"

    credentials = P12Reader(password).get_key_from_file(p12_path)
    if credentials.is_err():
        print(f"error: {credentials.unwrap_err()}", file=sys.stderr)
        return 1
    data = credentials.unwrap()
    if not data.key or not data.cert:
        print("error: certificate is missing a key or certificate", file=sys.stderr)
        return 1

    signed = Signature(data.key, data.cert).sign_xml(
        xml_path.read_text(encoding="utf-8"), "ANECF"
    )
    if signed.is_err():
        print(f"error: {signed.unwrap_err()}", file=sys.stderr)
        return 1

    ecf = ECF(data, environment)
    auth = ecf.authenticate()
    if auth.is_err():
        print(f"auth error: {auth.unwrap_err()}", file=sys.stderr)
        return 1

    response = ecf.void_encf(signed.unwrap(), "void.xml")
    if response.is_err():
        print(f"send error: {response.unwrap_err()}", file=sys.stderr)
        return 1
    print(response.unwrap())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
