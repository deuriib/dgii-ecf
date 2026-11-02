# Examples

The [`examples/`](https://github.com/deuriib/dgii-ecf/tree/main/examples)
directory contains runnable examples for both SDKs and DGII sample fixtures.

## Fixtures

| File                       | Description                                                                 |
| -------------------------- | --------------------------------------------------------------------------- |
| `fixtures/test.xml`        | Full DGII e-CF sample document. **Reference only** — see the warning below. |
| `fixtures/invoice-31.xml`  | Minimal unsigned ECF-31.                                                    |
| `fixtures/invoice-31.json` | The same invoice as compact JSON.                                           |
| `fixtures/invoice-32.xml`  | Minimal ECF-32 for the summary (RFCE) flow.                                 |
| `fixtures/acecf.xml`       | Illustrative ACECF (commercial approval).                                   |
| `fixtures/anecf.xml`       | Illustrative ANECF (range voiding).                                         |

!!! warning "Expired fixture certificate"
`fixtures/test.xml` is a historical reference only and **must not** be used as
signing ground truth. The certificate embedded in it expired on **2024-12-04**,
and its `DigestValue` no longer matches the payload because the document was
edited after it was signed.

    `utilities.py` / `utilities.ts` therefore report `certificate valid: false`
    for it, and that is the expected result.

    To sign end to end, use `fixtures/invoice-31.xml` (or
    `fixtures/invoice-32.xml` for the RFCE flow) together with a generated
    `output/test.p12`.

## Flows

| Flow                                     | Python                   | TypeScript               |
| ---------------------------------------- | ------------------------ | ------------------------ |
| Sign an e-CF                             | `sign_xml.py`            | `sign-xml.ts`            |
| JSON → XML                               | `transform.py`           | `transform.ts`           |
| Utilities (QR, code, cert)               | `utilities.py`           | `utilities.ts`           |
| Certificate info                         | `certificate_info.py`    | `certificate-info.ts`    |
| Submit an e-CF                           | `send_invoice.py`        | `send-invoice.ts`        |
| Submit a summary (RFCE)                  | `send_summary.py`        | `send-summary.ts`        |
| Status by track id                       | `status_track_id.py`     | `status-track-id.ts`     |
| Inquiry status                           | `inquiry_status.py`      | `inquiry-status.ts`      |
| Track statuses                           | `track_statuses.py`      | `track-statuses.ts`      |
| Summary inquiry (RFCE) — production only | `summary_inquiry.py`     | `summary-inquiry.ts`     |
| Customer directory                       | `customer_directory.py`  | `customer-directory.ts`  |
| Commercial approval                      | `commercial_approval.py` | `commercial-approval.ts` |
| Void a range                             | `void.py`                | `void.ts`                |

## Python

```bash
cd examples/python
uv sync
uv run python generate_cert.py   # ephemeral self-signed .p12
uv run python utilities.py       # offline helpers
uv run python sign_xml.py        # sign + validate certificate
```

## TypeScript

```bash
cd examples/typescript
bun install
bun run generate-cert
bun run utilities
bun run sign
```

The `send_*` / `send*` and query flows require a real DGII certificate and
network access. Configure `DGII_P12_PATH`, `DGII_P12_PASSWORD`, `DGII_RNC` and
`DGII_ENVIRONMENT`.

!!! warning
`generate_cert` creates a throwaway self-signed certificate for offline
testing. It is **not** a DGII certificate.
