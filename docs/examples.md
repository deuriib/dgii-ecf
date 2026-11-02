# Examples

The [`examples/`](https://github.com/deuriib/dgii-ecf/tree/main/examples)
directory contains runnable examples for both SDKs and DGII sample fixtures.

## Fixtures

| File | Description |
| --- | --- |
| `fixtures/test.xml` | Full DGII e-CF sample document. |
| `fixtures/invoice-31.xml` | Minimal unsigned ECF-31. |
| `fixtures/invoice-31.json` | The same invoice as compact JSON. |

## Python

```bash
cd examples/python
uv sync
uv run python generate_cert.py   # ephemeral self-signed .p12
uv run python transform.py       # JSON -> XML
uv run python sign_xml.py        # sign + validate certificate
```

## TypeScript

```bash
cd examples/typescript
bun install
bun run generate-cert
bun run transform
bun run sign
```

The `send_invoice` / `send` examples require a real DGII certificate and network
access. Configure `DGII_P12_PATH`, `DGII_P12_PASSWORD`, `DGII_RNC` and
`DGII_ENVIRONMENT`.

!!! warning
    `generate_cert` creates a throwaway self-signed certificate for offline
    testing. It is **not** a DGII certificate.
