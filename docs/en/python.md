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
| `status_track_id(track_id)`                                 | `Result[TrackingStatusResponse]`                                      |
| `inquiry_status(rnc, ncf, comprador=None, codigo=None)`     | `Result[InquiryStatusResponse]`                                       |
| `track_statuses(rnc, encf)`                                 | `Result[list[SummaryTrackingStatusResponse]]`                         |
| `get_customer_directory(rnc)`                               | `Result[list[ServiceDirectoryResponse] \| None]`                      |
| `get_summary_invoice_inquiry(rnc, encf, codigo)`            | `Result[InquiryInvoiceSummary]`                                       |
| `send_commercial_approval(xml, file_name, buyer_host=None)` | `Result[CommercialApprovalResponse \| B2BCommercialApprovalResponse]` |
| `void_encf(xml, file_name)`                                 | `Result[VoidNCFResponse]`                                             |

### B2B applicability

A direct Emisor↔Receptor delivery (`buyerHost` / `buyer_host`) is not allowed for
every document type. DGII excludes **E32 below RD$250,000** (only the RFCE
summary applies) plus **E41, E43, E45, E46 and E47**. E31, E33, E34, E44 and an
E32 at or above the threshold can be delivered peer-to-peer.

The client checks this before issuing the request and fails with `VALIDATION`
without calling the buyer host. Disable the check with `enforceB2BRules: false`
(TypeScript) or `enforce_b2b_rules=False` (Python) when you need to reproduce a
certification scenario:

```ts
const result = await ecf.sendElectronicDocument(xml, 'f.xml', buyerHost);
if (result.isErr() && result.error.code === 'VALIDATION') {
  // The type or amount is not eligible for direct delivery.
}
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

```ts
const ack = await ecf.sendCommercialApproval(acecf, 'acecf.xml', buyerHost);
if (ack.isOk() && !ack.value.accepted) {
  // The receiver rejected the approval; the issuer must answer with an E34.
}
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
ecf = ECF(credentials, Environment.PROD, validate_before_send=True)
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

See [Signing](guides/signing.md), [Resilience](guides/resilience.md), and the
[package README](https://github.com/deuriib/dgii-ecf/tree/main/packages/python).
