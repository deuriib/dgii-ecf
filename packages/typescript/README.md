# @deuriib/dgii-ecf

> DGII e-CF electronic invoicing SDK for the Dominican Republic.

Bun-first, native `fetch`, strict TypeScript, and **result-pattern** (neverthrow)
— no hidden exceptions. Signs XMLDSig documents (inclusive C14N + RSA-SHA256)
and transmits them to DGII reliably with retry, circuit breaker, timeout, and
idempotent submission.

## Install

```bash
bun add @deuriib/dgii-ecf
# or
npm install @deuriib/dgii-ecf
```

> Server-side only. Never use in a browser — it handles private keys.

## Quick start

```ts
import { ECF, Environment, P12Reader, Signature } from '@deuriib/dgii-ecf';

// 1. Read the certificate (.p12)
const reader = new P12Reader(process.env.CERT_PASSWORD ?? '');
const credentials = reader.getKeyFromFile('/secure/identity.p12');
if (credentials.isErr()) throw credentials.error;

// 2. Authenticate against DGII
const ecf = new ECF(credentials.value, Environment.Cert);
const auth = await ecf.authenticate();
if (auth.isErr()) throw auth.error;

// 3. Sign and submit
const signature = new Signature(
  credentials.value.key!,
  credentials.value.cert!,
);
const signed = signature.signXml(xml);
if (signed.isErr()) throw signed.error;

const response = await ecf.sendElectronicDocument(
  signed.value,
  '101672919E3100000001.xml',
);
response.match(
  (invoice) => console.log('trackId', invoice.trackId),
  (error) => console.error('DGII error', error.message),
);
```

## Result pattern

Every fallible operation returns a `Result`:

```ts
const result = await ecf.statusTrackId('some-track-id');
if (result.isOk()) {
  console.log(result.value.estado);
} else {
  console.error(result.error.code, result.error.message);
}
```

## Resilience & idempotency

- Transient failures (network, timeout, 408/429/5xx) are retried with
  exponential backoff and guarded by a consecutive-failure circuit breaker.
- `sendElectronicDocument` / `sendSummary` are keyed by
  `RNC + eNCF + SHA-256(signed XML)`; provide a persistent `IdempotencyStore`
  (Redis/Postgres) in production:

```ts
const ecf = new ECF(credentials, Environment.Prod, {
  idempotencyStore: myRedisStore, // { get, set, delete }
});
```

## Modules

`environment`, `types`, `errors`, `result`, `resilience`, `http`, `certificate`,
`signing`, `transformer`, `utils`, `client`.

## License

MIT © 2026 Deuri Vasquez
