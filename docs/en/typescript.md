# TypeScript

Package: [`@deuriib/dgii-ecf`](https://www.npmjs.com/package/@deuriib/dgii-ecf)

Bun-first, native `fetch`, strict TypeScript, and **result-pattern**
([`neverthrow`](https://github.com/supermacro/neverthrow)). Resilience via
[`cockatiel`](https://github.com/connor4312/cockatiel).

## Authenticate

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

## Sign a document

```ts
import { Signature } from '@deuriib/dgii-ecf';

const signed = new Signature(
  credentials.value.key!,
  credentials.value.cert!,
).signXml(xml);
if (signed.isErr()) throw signed.error;
```

## Submit

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

## Result pattern

Every fallible operation returns a `Result`:

```ts
const result = await ecf.statusTrackId('track-id');
if (result.isOk()) {
  console.log(result.value.estado);
} else {
  console.error(result.error.code, result.error.message);
}
```

## API

| Method                                              | Returns                                           |
| --------------------------------------------------- | ------------------------------------------------- |
| `authenticate(buyerHost?)`                          | `Result<AuthToken>`                               |
| `sendElectronicDocument(xml, fileName, buyerHost?)` | `Result<InvoiceResponse>`                         |
| `sendSummary(xml, fileName)`                        | `Result<InvoiceSummaryResponse>`                  |
| `statusTrackId(trackId)`                            | `Result<TrackingStatusResponse>`                  |
| `inquiryStatus(rnc, ncf, comprador?, codigo?)`      | `Result<InquiryStatusResponse>`                   |
| `trackStatuses(rnc, encf)`                          | `Result<SummaryTrackingStatusResponse[]>`         |
| `getCustomerDirectory(rnc)`                         | `Result<ServiceDirectoryResponse[] \| undefined>` |
| `getSummaryInvoiceInquiry(rnc, encf, codigo)`       | `Result<InquiryInvoiceSummary>`                   |
| `sendCommercialApproval(xml, fileName)`             | `Result<CommercialApprovalResponse>`              |
| `voidENCF(xml, fileName)`                           | `Result<VoidNCFResponse>`                         |

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

`getSummaryInvoiceInquiry` (RFCE inquiry, `fc.dgii.gov.do/consultarfce`) is only
exposed by DGII in **production** (`Environment.Prod` / `eCF`). In `Dev` or
`Cert` it returns a `VALIDATION` error without issuing a request:

```ts
const inquiry = await ecf.getSummaryInvoiceInquiry(rnc, encf, codigoSeguridad);
if (inquiry.isErr()) {
  console.error(inquiry.error.code); // 'VALIDATION' outside production
}
```

### Monetary rounding

`Transformer.json2xml(data, true)` rounds decimal values to two places with
**ROUND_HALF_UP** (`2.665` → `2.67`, `-2.675` → `-2.68`), computed on the
decimal string rather than via `toFixed` (which loses precision:
`(2.675).toFixed(2) === '2.67'`). `Version` and non-monetary text are never
rounded.

See [Signing](guides/signing.md), [Resilience](guides/resilience.md), and the
[package README](https://github.com/deuriib/dgii-ecf/tree/main/packages/typescript).
