"""Sign an ECF-32, convert it to RFCE, sign it, and submit the summary.

Requires a real DGII certificate and network access (same env vars as
``send_invoice.py``).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from py_dgii_ecf import (
    ECF,
    Environment,
    P12Reader,
    Signature,
    convert_ecf32_to_rfce,
)

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def main() -> int:
    p12_path = Path(os.environ["DGII_P12_PATH"])
    password = os.environ["DGII_P12_PASSWORD"]
    environment = Environment(os.environ.get("DGII_ENVIRONMENT", "TesteCF"))
    xml_path = Path(sys.argv[1]) if len(sys.argv) > 1 else FIXTURES / "invoice-32.xml"

    credentials = P12Reader(password).get_key_from_file(p12_path)
    if credentials.is_err():
        print(f"error: {credentials.unwrap_err()}", file=sys.stderr)
        return 1
    data = credentials.unwrap()
    if not data.key or not data.cert:
        print("error: certificate is missing a key or certificate", file=sys.stderr)
        return 1

    signer = Signature(data.key, data.cert)

    signed_ecf = signer.sign_xml(xml_path.read_text(encoding="utf-8"), "ECF")
    if signed_ecf.is_err():
        print(f"error: {signed_ecf.unwrap_err()}", file=sys.stderr)
        return 1

    converted = convert_ecf32_to_rfce(signed_ecf.unwrap())
    if converted.is_err():
        print(f"error: {converted.unwrap_err()}", file=sys.stderr)
        return 1
    payload = converted.unwrap()

    signed_rfce = signer.sign_xml(payload["xml"], "RFCE")
    if signed_rfce.is_err():
        print(f"error: {signed_rfce.unwrap_err()}", file=sys.stderr)
        return 1

    ecf = ECF(data, environment)
    auth = ecf.authenticate()
    if auth.is_err():
        print(f"auth error: {auth.unwrap_err()}", file=sys.stderr)
        return 1

    encf = "E320000000001"
    response = ecf.send_summary(
        signed_rfce.unwrap(), f"{os.environ['DGII_RNC']}{encf}.xml"
    )
    if response.is_err():
        print(f"send error: {response.unwrap_err()}", file=sys.stderr)
        return 1
    print(response.unwrap())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
