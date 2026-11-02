"""Read .p12 certificate metadata (subject, issuer, validity window)."""

from __future__ import annotations

import os
from pathlib import Path

from py_dgii_ecf import P12Reader


def main() -> int:
    p12_path = Path(os.environ["DGII_P12_PATH"])
    password = os.environ["DGII_P12_PASSWORD"]

    info = P12Reader(password).get_certificate_info(p12_path)
    if info.is_err():
        print(f"error: {info.unwrap_err()}")
        return 1

    certificate = info.unwrap()
    print("subject:", certificate.subject)
    print("issuer:", certificate.issuer)
    print("valid from:", certificate.valid_from)
    print("valid to:", certificate.valid_to)
    print("serial:", certificate.serial_number)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
