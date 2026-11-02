# TypeScript

Package: [`@deuriib/dgii-ecf`](https://www.npmjs.com/package/@deuriib/dgii-ecf)

Bun-first, native `fetch`, strict TypeScript, and **result-pattern**
([`neverthrow`](https://github.com/supermacro/neverthrow)). Resilience via
[`cockatiel`](https://github.com/connor4312/cockatiel).

## Authenticate

```ts
import { ECF, Environment, P12Reader } from '@deuriib/dgii-ecf';

const credentials = new P12Reader(process.env.CERT_PASSWORD ?? '')
  .getKeyFromFile('/secure/identity.p12');
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

| Method | Returns |
| --- | --- |
| `authenticate(buyerHost?)` | `Result<AuthToken>` |
| `sendElectronicDocument(xml, fileName, buyerHost?)` | `Result<InvoiceResponse>` |
| `sendSummary(xml, fileName)` | `Result<InvoiceSummaryResponse>` |
| `statusTrackId(trackId)` | `Result<TrackingStatusResponse>` |
| `inquiryStatus(rnc, ncf, comprador?, codigo?)` | `Result<InquiryStatusResponse>` |
| `trackStatuses(rnc, encf)` | `Result<SummaryTrackingStatusResponse[]>` |
| `getCustomerDirectory(rnc)` | `Result<ServiceDirectoryResponse[] \| undefined>` |
| `getSummaryInvoiceInquiry(rnc, encf, codigo)` | `Result<InquiryInvoiceSummary>` |
| `sendCommercialApproval(xml, fileName)` | `Result<CommercialApprovalResponse>` |
| `voidENCF(xml, fileName)` | `Result<VoidNCFResponse>` |

See [Signing](guides/signing.md), [Resilience](guides/resilience.md), and the
[package README](https://github.com/deuriib/dgii-ecf/tree/main/packages/typescript).
