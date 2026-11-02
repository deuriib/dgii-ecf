# Python

Paquete: [`py-dgii-ecf`](https://pypi.org/project/py-dgii-ecf/) · importa `py_dgii_ecf`

[`httpx2`](https://pypi.org/project/httpx2/) síncrono, `tenacity` + `pybreaker` y
**Patrón Result** ([`result`](https://github.com/rustedpy/result)). Con
verificación de tipos mediante `mypy --strict`.

## Autentícate

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

## Firma un documento

```python
from py_dgii_ecf import Signature

data = credentials.unwrap()
signed = Signature(data.key, data.cert).sign_xml(xml)
if signed.is_err():
    raise SystemExit(signed.unwrap_err())
```

Para construir el firmador directamente desde un archivo `.p12`, usa
`try_from_p12` — devuelve un `Result` en lugar de lanzar una excepción:

```python
signer = Signature.try_from_p12("identity.p12", password)
if signer.is_err():
    raise SystemExit(signer.unwrap_err())
signed = signer.unwrap().sign_xml(xml)
```

## Envía el documento

```python
response = ecf.send_electronic_document(
    signed.unwrap(), "130862346E310000000001.xml"
)
if response.is_err():
    raise SystemExit(response.unwrap_err())
print(response.unwrap())
```

## Patrón Result

```python
result = ecf.status_track_id("track-id")
if result.is_ok():
    print(result.unwrap().estado)
else:
    error = result.unwrap_err()
    print(error.code, error.message)
```

## API

Cada método devuelve un modelo tipado, no un `dict`.

| Método                                                      | Devuelve                                         |
| ----------------------------------------------------------- | ------------------------------------------------ |
| `authenticate(buyer_host=None)`                             | `Result[AuthToken]`                              |
| `send_electronic_document(xml, file_name, buyer_host=None)` | `Result[InvoiceResponse]`                        |
| `send_summary(xml, file_name)`                              | `Result[InvoiceSummaryResponse]`                 |
| `status_track_id(track_id)`                                 | `Result[TrackingStatusResponse]`                 |
| `inquiry_status(rnc, ncf, comprador=None, codigo=None)`     | `Result[InquiryStatusResponse]`                  |
| `track_statuses(rnc, encf)`                                 | `Result[list[SummaryTrackingStatusResponse]]`    |
| `get_customer_directory(rnc)`                               | `Result[list[ServiceDirectoryResponse] \| None]` |
| `get_summary_invoice_inquiry(rnc, encf, codigo)`            | `Result[InquiryInvoiceSummary]`                  |
| `send_commercial_approval(xml, file_name)`                  | `Result[CommercialApprovalResponse]`             |
| `void_encf(xml, file_name)`                                 | `Result[VoidNCFResponse]`                        |

### Endpoints exclusivos de producción

`get_summary_invoice_inquiry` (consulta de RFCE, `fc.dgii.gov.do/consultarfce`)
solo lo expone la DGII en **producción** (`Environment.PROD` / `eCF`). En
`TesteCF` o `CerteCF` devuelve un error `VALIDATION` sin emitir la solicitud:

```python
inquiry = ecf.get_summary_invoice_inquiry(rnc, encf, codigo_seguridad)
if inquiry.is_err():
    print(inquiry.unwrap_err().code)   # VALIDATION outside production
```

### Redondeo monetario

`Transformer.json_to_xml(..., round_monetary=True)` redondea los valores
decimales a dos posiciones con **ROUND_HALF_UP** (`2.665` → `2.67`,
`-2.675` → `-2.68`), igual que el SDK de TypeScript. `Version` y el texto no
monetario nunca se redondean.

## CLI

```bash
py-dgii-ecf sign invoice.xml identity.p12 --output signed.xml
py-dgii-ecf authenticate identity.p12 --environment CerteCF
py-dgii-ecf status <track-id> identity.p12 --environment CerteCF
```

Consulta [Firma](guides/signing.md), [Resiliencia](guides/resilience.md) y el
[README del paquete](https://github.com/deuriib/dgii-ecf/tree/main/packages/python).
