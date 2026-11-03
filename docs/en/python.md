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

To build the signer directly from a `.p12` file, use `try_from_p12` — it
returns a `Result` instead of raising:

```python
signer = Signature.try_from_p12("identity.p12", password)
if signer.is_err():
    raise SystemExit(signer.unwrap_err())
signed = signer.unwrap().sign_xml(xml)
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

| Method                                                      | Returns                                                               |
| ----------------------------------------------------------- | --------------------------------------------------------------------- |
| `authenticate(buyer_host=None)`                             | `Result[AuthToken]`                                                   |
| `send_electronic_document(xml, file_name, buyer_host=None)` | `Result[InvoiceResponse]`                                             |
| `send_summary(xml, file_name)`                              | `Result[InvoiceSummaryResponse]`                                      |
| `send_document(xml, file_name, buyer_host=None)`            | `Result[InvoiceResponse \| InvoiceSummaryResponse]`                   |
| `status_track_id(track_id)`                                 | `Result[TrackingStatusResponse]`                                      |
| `inquiry_status(rnc, ncf, comprador=None, codigo=None)`     | `Result[InquiryStatusResponse]`                                       |
| `track_statuses(rnc, encf)`                                 | `Result[list[SummaryTrackingStatusResponse]]`                         |
| `get_customer_directory(rnc)`                               | `Result[list[ServiceDirectoryResponse] \| None]`                      |
| `get_directory_listing()`                                   | `Result[list[ServiceDirectoryResponse]]`                              |
| `get_summary_invoice_inquiry(rnc, encf, codigo)`            | `Result[InquiryInvoiceSummary]`                                       |
| `send_commercial_approval(xml, file_name, buyer_host=None)` | `Result[CommercialApprovalResponse \| B2BCommercialApprovalResponse]` |
| `void_encf(xml, file_name)`                                 | `Result[VoidNCFResponse]`                                             |
| `reconcile_submission(xml)`                                 | `Result[ReconciliationResult]`                                        |
| `get_service_status()`                                      | `Result[list[ServiceStatusEntry]]`                                    |
| `get_maintenance_windows()`                                 | `Result[list[MaintenanceWindow]]`                                     |
| `check_service_availability(ambiente)`                      | `Result[ServiceAvailabilityResponse]`                                 |

### Routing with `send_document`

`send_document` reads the root element, `TipoeCF` and `MontoTotal` from the **signed** XML and picks
the endpoint for you: an `RFCE` goes to the summary reception, an `ECF` to the general reception. An
E32 below RD$250,000 is rejected with `VALIDATION` — build the RFCE first — and an RFCE cannot be
delivered directly to a `buyer_host`.

Use `resolve_reception_route(signed_xml)` when you need the decision without sending it.

### Service status

`get_service_status`, `get_maintenance_windows` and `check_service_availability` talk to the
`statusecf.dgii.gov.do` host. It authenticates with an **API key**, not the bearer token, so pass
`status_api_key` to the constructor and skip `authenticate()`:

```python
import os

ecf = ECF(credentials.unwrap(), Environment.PROD, status_api_key=os.environ["DGII_STATUS_API_KEY"])
availability = ecf.check_service_availability(StatusEnvironment.PRODUCTION)
if availability.is_ok() and availability.unwrap().estado == "No Disponible":
    ...  # Inside a maintenance window — defer the batch.
```

### B2B applicability

A direct Emisor↔Receptor delivery (`buyerHost` / `buyer_host`) is not allowed for
every document type. DGII excludes **E32 below RD$250,000** (only the RFCE
summary applies) plus **E41, E43, E45, E46 and E47**. E31, E33, E34, E44 and an
E32 at or above the threshold can be delivered peer-to-peer.

The client checks this before issuing the request and fails with `VALIDATION`
without calling the buyer host. Disable the check with `enforce_b2b_rules=False`
when you need to reproduce a certification scenario:

```python
result = ecf.send_electronic_document(signed_xml, "f.xml", buyer_host)
if result.is_err() and result.unwrap_err().code is DgiiErrorCode.VALIDATION:
    ...  # The type or amount is not eligible for direct delivery.
```

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

A direct ACECF delivery goes to the buyer's `fe/aprobacioncomercial/api/ecf`
endpoint and returns `B2BCommercialApprovalResponse` instead of DGII's
`{codigo, estado}` payload. DGII documents **HTTP 200** as satisfactory and
**HTTP 400** as unsatisfactory, so a 400 is reported as `accepted: false`
rather than as a transport failure:

```python
ack = ecf.send_commercial_approval(acecf, "acecf.xml", buyer_host)
if ack.is_ok() and not ack.unwrap().accepted:
    ...  # The receiver rejected the approval; the issuer must answer with an E34.
```

### Schema validation

`validate_document` checks a document against the official DGII XML Schema and
reports each violation with its element path. The schemas are bundled, so
validation works offline.

```python
from py_dgii_ecf import validate_document

result = validate_document(signed_xml)
if result.is_ok():
    for violation in result.unwrap():
        print(violation.path, violation.message)
```

`validate_before_send=True` runs the same check before a **general e-CF**
submission and fails with `VALIDATION` without calling DGII:

```python
ecf = ECF(credentials.unwrap(), Environment.PROD, validate_before_send=True)
```

Twelve schemas are bundled: `e-CF` 32, 33, 34, 41, 43, 44, 45, 46, 47, `ANECF`,
`ARECF` and `Semilla`. Three published schemas do not compile — `e-CF 31`,
`RFCE 32` and `ACECF` — so those document types are reported as _schema
unavailable_ rather than passing silently. See
`examples/fixtures/schemas/README.md` for the exact reasons.

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

Each command prompts for the `.p12` password (`--password`, hidden input). `--environment` accepts
`TesteCF` / `CerteCF` / `eCF`, or the aliases `dev`, `cert` and `prod`.

See [Signing](guides/signing.md), [Resilience](guides/resilience.md), and the
[package README](https://github.com/deuriib/dgii-ecf/tree/main/packages/python).
