# Examples

The [`examples/`](https://github.com/deuriib/dgii-ecf/tree/main/examples)
directory contains runnable examples for both SDKs and DGII sample fixtures.

## Fixtures

| File | Description |
| --- | --- |
| `fixtures/test.xml` | Full DGII e-CF sample document. |
| `fixtures/invoice-31.xml` | Minimal unsigned ECF-31. |
| `fixtures/invoice-31.json` | The same invoice as compact JSON. |
| `fixtures/invoice-32.xml` | Minimal ECF-32 for the summary (RFCE) flow. |
| `fixtures/acecf.xml` | Illustrative ACECF (commercial approval). |
| `fixtures/anecf.xml` | Illustrative ANECF (range voiding). |

## Flows

| Flow | Python | TypeScript |
| --- | --- | --- |
| Sign an e-CF | `sign_xml.py` | `sign-xml.ts` |
| JSON → XML | `transform.py` | `transform.ts` |
| Submit an e-CF | `send_invoice.py` | `send-invoice.ts` |
| Submit a summary (RFCE) | `send_summary.py` | `send-summary.ts` |
| Customer directory | `customer_directory.py` | `customer-directory.ts` |
| Commercial approval | `commercial_approval.py` | `commercial-approval.ts` |
| Void a range | `void.py` | `void.ts` |

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

The `send_*` / `send*` flows require a real DGII certificate and network access.
Configure `DGII_P12_PATH`, `DGII_P12_PASSWORD`, `DGII_RNC` and
`DGII_ENVIRONMENT`.

!!! warning
    `generate_cert` creates a throwaway self-signed certificate for offline
    testing. It is **not** a DGII certificate.
