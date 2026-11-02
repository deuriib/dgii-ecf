"""Query the DGII customer directory for an RNC."""

from __future__ import annotations

import json
import os
import sys
from dataclasses import asdict
from pathlib import Path

from py_dgii_ecf import ECF, Environment, P12Reader


def main() -> int:
    p12_path = Path(os.environ["DGII_P12_PATH"])
    password = os.environ["DGII_P12_PASSWORD"]
    environment = Environment(os.environ.get("DGII_ENVIRONMENT", "TesteCF"))
    rnc = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("DGII_RNC", "")

    credentials = P12Reader(password).get_key_from_file(p12_path)
    if credentials.is_err():
        print(f"error: {credentials.unwrap_err()}", file=sys.stderr)
        return 1

    ecf = ECF(credentials.unwrap(), environment)
    auth = ecf.authenticate()
    if auth.is_err():
        print(f"auth error: {auth.unwrap_err()}", file=sys.stderr)
        return 1

    directory = ecf.get_customer_directory(rnc)
    if directory.is_err():
        print(f"error: {directory.unwrap_err()}", file=sys.stderr)
        return 1
    items = directory.unwrap()
    payload = None if items is None else [asdict(item) for item in items]
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
