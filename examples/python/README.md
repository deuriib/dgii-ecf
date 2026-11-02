# Python examples

Runnable examples for [`py-dgii-ecf`](../../packages/python).

## Setup

```bash
cd examples/python
uv sync
```

## Run

```bash
# 1. Generate an ephemeral self-signed .p12 (for local signing only)
uv run python generate_cert.py

# 2. Convert the sample JSON invoice to XML
uv run python transform.py

# 3. Sign a DGII e-CF document
uv run python sign_xml.py

# 4. Authenticate + submit to DGII (requires a real certificate + network)
export DGII_P12_PATH=/secure/identity.p12
export DGII_P12_PASSWORD=secret
export DGII_RNC=130862346
export DGII_ENVIRONMENT=TesteCF
uv run python send_invoice.py
```

Outputs are written to `../output/` (gitignored).

> ⚠️ `generate_cert.py` creates a throwaway self-signed certificate for local,
> offline testing. It is **not** a DGII certificate and will be rejected by DGII.
