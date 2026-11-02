"""Query the validity/status of an e-CF."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from py_dgii_ecf import ECF, Environment, P12Reader


def main() -> int:
    p12_path = Path(os.environ["DGII_P12_PATH"])
    password = os.environ["DGII_P12_PASSWORD"]
    environment = Environment(os.environ.get("DGII_ENVIRONMENT", "TesteCF"))
    rnc_emisor = os.environ["DGII_RNC"]

    ncf = sys.argv[1] if len(sys.argv) > 1 else "E310000000001"
    rnc_comprador = sys.argv[2] if len(sys.argv) > 2 else None
    codigo_seguridad = sys.argv[3] if len(sys.argv) > 3 else None

    credentials = P12Reader(password).get_key_from_file(p12_path)
    if credentials.is_err():
        print(f"error: {credentials.unwrap_err()}", file=sys.stderr)
        return 1

    ecf = ECF(credentials.unwrap(), environment)
    auth = ecf.authenticate()
    if auth.is_err():
        print(f"auth error: {auth.unwrap_err()}", file=sys.stderr)
        return 1

    result = ecf.inquiry_status(
        rnc_emisor, ncf, rnc_comprador, codigo_seguridad
    )
    if result.is_err():
        print(f"error: {result.unwrap_err()}", file=sys.stderr)
        return 1
    print(json.dumps(result.unwrap(), indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
