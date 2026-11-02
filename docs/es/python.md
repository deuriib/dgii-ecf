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

| Método                                                      | Devuelve                                                              |
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

### Aplicabilidad B2B

El envío directo Emisor↔Receptor (`buyerHost` / `buyer_host`) no aplica a todos
los tipos. La DGII excluye la **E32 menor a RD$250,000** (solo aplica el resumen
RFCE) y los tipos **E41, E43, E45, E46 y E47**. La E31, E33, E34, E44 y una E32
igual o mayor al umbral sí pueden entregarse entre pares.

El cliente lo verifica antes de emitir la solicitud y falla con `VALIDATION` sin
llamar al host del comprador. Desactiva la validación con
`enforceB2BRules: false` (TypeScript) o `enforce_b2b_rules=False` (Python)
cuando necesites reproducir un escenario de certificación:

```ts
const result = await ecf.sendElectronicDocument(xml, 'f.xml', buyerHost);
if (result.isErr() && result.error.code === 'VALIDATION') {
  // El tipo o el monto no son elegibles para envío directo.
}
```

### Endpoints exclusivos de producción

`get_summary_invoice_inquiry` (consulta de RFCE, `fc.dgii.gov.do/consultarfce`)
solo lo expone la DGII en **producción** (`Environment.PROD` / `eCF`). En
`TesteCF` o `CerteCF` devuelve un error `VALIDATION` sin emitir la solicitud:

```python
inquiry = ecf.get_summary_invoice_inquiry(rnc, encf, codigo_seguridad)
if inquiry.is_err():
    print(inquiry.unwrap_err().code)   # VALIDATION outside production
```

El envío directo de un ACECF va al endpoint `fe/aprobacioncomercial/api/ecf`
del comprador y devuelve `B2BCommercialApprovalResponse` en lugar del payload
`{codigo, estado}` de la DGII. La DGII documenta **HTTP 200** como satisfactorio
y **HTTP 400** como insatisfactorio, así que un 400 se reporta como
`accepted: false` y no como un fallo de transporte:

```ts
const ack = await ecf.sendCommercialApproval(acecf, 'acecf.xml', buyerHost);
if (ack.isOk() && !ack.value.accepted) {
  // El receptor rechazó la aprobación; el emisor debe responder con una E34.
}
```

### Validación por esquema

`validate_document` verifica un documento contra el XML Schema oficial de la
DGII y reporta cada violación con la ruta del elemento. Los esquemas vienen
empaquetados, así que la validación funciona sin red.

```python
from py_dgii_ecf import validate_document

result = validate_document(signed_xml)
if result.is_ok():
    for violation in result.unwrap():
        print(violation.path, violation.message)
```

`validate_before_send=True` ejecuta la misma verificación antes de un envío
**general de e-CF** y falla con `VALIDATION` sin llamar a la DGII:

```python
ecf = ECF(credentials, Environment.PROD, validate_before_send=True)
```

Se empaquetan doce esquemas: `e-CF` 32, 33, 34, 41, 43, 44, 45, 46, 47, `ANECF`,
`ARECF` y `Semilla`. Tres esquemas publicados no compilan — `e-CF 31`,
`RFCE 32` y `ACECF` — así que esos tipos se reportan como _esquema no
disponible_ en vez de pasar en silencio. Ver
`examples/fixtures/schemas/README.md` para las razones exactas.

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
