# Python

Package: [`py-dgii-ecf`](https://pypi.org/project/py-dgii-ecf/) · import `py_dgii_ecf`

Sync [`httpx2`](https://pypi.org/project/httpx2/), `tenacity` + `pybreaker`, and
**result-pattern** ([`result`](https://github.com/rustedpy/result)). Type-checked
with `mypy --strict`.

## Authenticate

```python
from py_dgii_ecf import ECF, Environment, P12Reader

credentials = P12Reader(password).get_key_from_file("/secure/identity.p12")
if credentials.is_err():
    raise SystemExit(credentials.unwrap_err())

ecf = ECF(credentials.unwrap(), Environment.CERT)
auth = ecf.authenticate()
if auth.is_err():
    raise SystemExit(auth.unwrap_err())

print(auth.unwrap().token)
```

## Sign a document

```python
from py_dgii_ecf import Signature

data = credentials.unwrap()
signed = Signature(data.key, data.cert).sign_xml(xml)
if signed.is_err():
    raise SystemExit(signed.unwrap_err())
```

## Submit

```python
response = ecf.send_electronic_document(
    signed.unwrap(), "130862346E310000000001.xml"
)
if response.is_err():
    raise SystemExit(response.unwrap_err())
print(response.unwrap())
```

## Result pattern

```python
result = ecf.status_track_id("track-id")
if result.is_ok():
    print(result.unwrap().estado)
else:
    error = result.unwrap_err()
    print(error.code, error.message)
```

## API

Every method returns a typed model, not a `dict`.

| Method | Returns |
| --- | --- |
| `authenticate(buyer_host=None)` | `Result[AuthToken]` |
| `send_electronic_document(xml, file_name, buyer_host=None)` | `Result[InvoiceResponse]` |
| `send_summary(xml, file_name)` | `Result[InvoiceSummaryResponse]` |
| `status_track_id(track_id)` | `Result[TrackingStatusResponse]` |
| `inquiry_status(rnc, ncf, comprador=None, codigo=None)` | `Result[InquiryStatusResponse]` |
| `track_statuses(rnc, encf)` | `Result[list[SummaryTrackingStatusResponse]]` |
| `get_customer_directory(rnc)` | `Result[list[ServiceDirectoryResponse] \| None]` |
| `get_summary_invoice_inquiry(rnc, encf, codigo)` | `Result[InquiryInvoiceSummary]` |
| `send_commercial_approval(xml, file_name)` | `Result[CommercialApprovalResponse]` |
| `void_encf(xml, file_name)` | `Result[VoidNCFResponse]` |

### Production-only endpoints

`get_summary_invoice_inquiry` (RFCE inquiry, `fc.dgii.gov.do/consultarfce`) is
only exposed by DGII in **production** (`Environment.PROD` / `eCF`). In
`TesteCF` or `CerteCF` it returns a `VALIDATION` error without issuing a
request:

```python
inquiry = ecf.get_summary_invoice_inquiry(rnc, encf, codigo_seguridad)
if inquiry.is_err():
    print(inquiry.unwrap_err().code)   # VALIDATION outside production
```

### Monetary rounding

`Transformer.json_to_xml(..., round_monetary=True)` rounds decimal values to two
places with **ROUND_HALF_UP** (`2.665` → `2.67`, `-2.675` → `-2.68`), matching
the TypeScript SDK. `Version` and non-monetary text are never rounded.

## CLI

```bash
py-dgii-ecf sign invoice.xml identity.p12 --output signed.xml
py-dgii-ecf authenticate identity.p12 --environment CerteCF
py-dgii-ecf status <track-id> identity.p12 --environment CerteCF
```

See [Signing](guides/signing.md), [Resilience](guides/resilience.md), and the
[package README](https://github.com/deuriib/dgii-ecf/tree/main/packages/python).
