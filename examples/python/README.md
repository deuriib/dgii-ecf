# Python examples

Runnable examples for [`py-dgii-ecf`](../../packages/python).

## Setup

```bash
cd examples/python
uv sync
```

## Offline examples

```bash
uv run python generate_cert.py   # ephemeral self-signed .p12 (local signing only)
uv run python transform.py       # JSON -> XML
uv run python sign_xml.py        # sign + validate certificate
```

## Network flows

These require a real DGII certificate and network access. Configure the
environment:

```bash
export DGII_P12_PATH=/secure/identity.p12
export DGII_P12_PASSWORD=secret
export DGII_RNC=130862346
export DGII_ENVIRONMENT=TesteCF   # TesteCF | CerteCF | eCF
```

```bash
uv run python send_invoice.py          # authenticate + submit a signed e-CF
uv run python send_summary.py          # sign ECF-32 -> RFCE -> submit summary
uv run python customer_directory.py <rnc>
uv run python commercial_approval.py   # sign ACECF -> submit commercial approval
uv run python void.py                  # sign ANECF -> void a range
```

Outputs are written to `../output/` (gitignored).

> ⚠️ `generate_cert.py` creates a throwaway self-signed certificate for local,
> offline testing. It is **not** a DGII certificate and will be rejected by DGII.
