"""Convert a compact JSON invoice to a DGII e-CF XML document."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from py_dgii_ecf import Transformer

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"
OUTPUT = Path(__file__).resolve().parent.parent / "output"


def main() -> int:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else FIXTURES / "invoice-31.json"
    payload = json.loads(source.read_text(encoding="utf-8"))

    result = Transformer().json_to_xml(payload, round_monetary=True)
    if result.is_err():
        print(f"error: {result.unwrap_err()}", file=sys.stderr)
        return 1

    OUTPUT.mkdir(exist_ok=True)
    output = OUTPUT / f"{source.stem}.generated.xml"
    output.write_text(result.unwrap(), encoding="utf-8")
    print(f"Wrote {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
