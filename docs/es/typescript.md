# TypeScript

Paquete: [`@deuriib/dgii-ecf`](https://www.npmjs.com/package/@deuriib/dgii-ecf)

Pensado primero para Bun, `fetch` nativo, TypeScript estricto y **patrón
result** ([`neverthrow`](https://github.com/supermacro/neverthrow)). Resiliencia
con [`cockatiel`](https://github.com/connor4312/cockatiel).

## Autentícate

```ts
import { ECF, Environment, P12Reader } from '@deuriib/dgii-ecf';

const credentials = new P12Reader(
  process.env.CERT_PASSWORD ?? '',
).getKeyFromFile('/secure/identity.p12');
if (credentials.isErr()) throw credentials.error;

const ecf = new ECF(credentials.value, Environment.Cert);
const auth = await ecf.authenticate();
if (auth.isErr()) throw auth.error;

console.log(auth.value.token);
```

## Firma un documento

```ts
import { Signature } from '@deuriib/dgii-ecf';

const signed = new Signature(
  credentials.value.key!,
  credentials.value.cert!,
).signXml(xml);
if (signed.isErr()) throw signed.error;
```

## Envía el documento

```ts
const response = await ecf.sendElectronicDocument(
  signed.value,
  '130862346E310000000001.xml',
);
response.match(
  (invoice) => console.log(invoice.trackId),
  (error) => console.error(error.code, error.message),
);
```

## Patrón Result

Toda operación que puede fallar devuelve un `Result`:

```ts
const result = await ecf.statusTrackId('track-id');
if (result.isOk()) {
  console.log(result.value.estado);
} else {
  console.error(result.error.code, result.error.message);
}
```

## API

| Método                                              | Devuelve                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| `authenticate(buyerHost?)`                          | `Result<AuthToken>`                                                   |
| `sendElectronicDocument(xml, fileName, buyerHost?)` | `Result<InvoiceResponse>`                                             |
| `sendSummary(xml, fileName)`                        | `Result<InvoiceSummaryResponse>`                                      |
| `statusTrackId(trackId)`                            | `Result<TrackingStatusResponse>`                                      |
| `inquiryStatus(rnc, ncf, comprador?, codigo?)`      | `Result<InquiryStatusResponse>`                                       |
| `trackStatuses(rnc, encf)`                          | `Result<SummaryTrackingStatusResponse[]>`                             |
| `getCustomerDirectory(rnc)`                         | `Result<ServiceDirectoryResponse[] \| undefined>`                     |
| `getSummaryInvoiceInquiry(rnc, encf, codigo)`       | `Result<InquiryInvoiceSummary>`                                       |
| `sendCommercialApproval(xml, fileName, buyerHost?)` | `Result<CommercialApprovalResponse \| B2BCommercialApprovalResponse>` |
| `voidENCF(xml, fileName)`                           | `Result<VoidNCFResponse>`                                             |

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

`getSummaryInvoiceInquiry` (consulta de RFCE, `fc.dgii.gov.do/consultarfce`) solo
lo expone la DGII en **producción** (`Environment.Prod` / `eCF`). En `Dev` o
`Cert` devuelve un error `VALIDATION` sin emitir la solicitud:

```ts
const inquiry = await ecf.getSummaryInvoiceInquiry(rnc, encf, codigoSeguridad);
if (inquiry.isErr()) {
  console.error(inquiry.error.code); // 'VALIDATION' outside production
}
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

### Redondeo monetario

`Transformer.json2xml(data, true)` redondea los valores decimales a dos
posiciones con **ROUND_HALF_UP** (`2.665` → `2.67`, `-2.675` → `-2.68`),
calculado sobre la cadena decimal y no con `toFixed` (que pierde precisión:
`(2.675).toFixed(2) === '2.67'`). `Version` y el texto no monetario nunca se
redondean.

Consulta [Firma](guides/signing.md), [Resiliencia](guides/resilience.md) y el
[README del paquete](https://github.com/deuriib/dgii-ecf/tree/main/packages/typescript).
