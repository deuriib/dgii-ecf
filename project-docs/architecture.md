# dgii-ecf — Technical Architecture

> Companion to `project-specs/dgii-ecf-setup.md` (canonical requirements + Appendix A) and
> `project-tasks/dgii-ecf-tasklist.md`. This document defines the contracts developers implement
> against, and is kept in sync with what both packages actually export. Where the spec is silent,
> this document states an explicit resolution (see §12). Nothing here introduces a dependency or
> feature absent from the spec.
>
> When a signature here and the source disagree, the source wins: `packages/typescript/src/index.ts`
> and `packages/python/src/py_dgii_ecf/__init__.py` are the authoritative public surface. Update
> this file in the same change that alters a contract.

---

## 1. Context & scope

Two publishable SDKs for the Dominican Republic's **DGII e-CF** electronic invoicing system,
sharing one behaviour contract and implemented in two languages:

| Package               | Language / runtime                     | Registry | Dist name           |
| --------------------- | -------------------------------------- | -------- | ------------------- |
| `packages/typescript` | TypeScript, Bun-first, Node-compatible | npm      | `@deuriib/dgii-ecf` |
| `packages/python`     | Python ≥3.11, uv                       | PyPI     | `py-dgii-ecf`       |

Both SDKs: authenticate against DGII web services, sign documents with **XMLDSig (inclusive C14N

- RSA-SHA256)**, and transmit them reliably with **Result-pattern errors**, **idempotency**, and
  **retry/circuit-breaker/timeout**.

---

## 2. Architectural principles

1. **Dependency direction inward.** `client` → `http`/`signing`/`certificate`/`transformer` →
   `resilience`/`utils` → `result`/`errors`/`types`/`environment`. Leaf modules
   (`environment`, `types`, `errors`, `result`) import nothing from higher layers. Nothing imports
   the transport library (native `fetch` / `httpx2`) except `http.ts`/`http.py`.
2. **Result pattern everywhere.** Domain and IO failures are _returned_, never thrown. Only
   programmer errors (bugs) may throw. Every public async call returns `Promise<Result<T, DgiiError>>`
   (TS) or `Result[T, DgiiError]` (Python, synchronous `httpx2`).
3. **Money is never floating-point.** Python `Decimal`; TypeScript `string` in the document model,
   formatted to 2 decimals only at output boundaries.
4. **No secrets in source.** `.p12`, `.pem`, private keys, tokens, and production URLs come from
   config/secret manager.
5. **1:1 parity.** The Python module map mirrors the TypeScript map (spec §5.3). Signatures are
   snake_case in Python, camelCase in TypeScript; semantics identical.

---

## 3. Module map

### TypeScript (`packages/typescript/src/`)

| Module              | Responsibility                                               |
| ------------------- | ------------------------------------------------------------ |
| `index.ts`          | Public re-exports (package surface)                          |
| `environment.ts`    | `Environment`, `BaseUrl`, `Endpoint`, URL builders           |
| `types.ts`          | Wire/response models (`AuthToken`, `InvoiceResponse`, …)     |
| `errors.ts`         | `DgiiError`, `DgiiErrorCode`, `toDgiiError()`                |
| `result.ts`         | `neverthrow` re-exports + `DgiiResult<T>`                    |
| `resilience.ts`     | cockatiel policy factory + retry predicate                   |
| `http.ts`           | `HttpClient`, `IdempotencyStore`, `InMemoryIdempotencyStore` |
| `xml.ts`            | Strict parse, root/element extraction                        |
| `certificate.ts`    | `P12Reader` (node-forge)                                     |
| `signing.ts`        | `Signature`, `validateXMLCertificate`                        |
| `transformer.ts`    | `Transformer` (xml-js json2xml/xml2json)                     |
| `reception.ts`      | Reception routing + B2B applicability (A.2)                  |
| `reconciliation.ts` | Pending-marker reconciliation, sequence reuse                |
| `validation.ts`     | XSD validation via `xmllint` (ADR 0002)                      |
| `utils.ts`          | security code, QR URLs, date/time, RFCE, XML-body helpers    |
| `client.ts`         | `ECF` (auth + all endpoints)                                 |

### Python (`packages/python/src/py_dgii_ecf/`)

Mirrors the TS map 1:1, with `cli.py` (Python-only) replacing `index.ts` as the "extra" module;
`__init__.py` is the package surface (analogous to `index.ts`).

| Module              | Responsibility                                               |
| ------------------- | ------------------------------------------------------------ |
| `__init__.py`       | Public re-exports                                            |
| `environment.py`    | `Environment`, `BaseUrl`, `Endpoint`, URL builders           |
| `types.py`          | Models (`AuthToken`, response types)                         |
| `errors.py`         | `DgiiError`, `DgiiErrorCode`, `to_dgii_error()`              |
| `result.py`         | `result` re-exports + `DgiiResult[T]`                        |
| `resilience.py`     | tenacity + pybreaker wrapper + retry predicate               |
| `http.py`           | `HttpClient`, `IdempotencyStore`, `InMemoryIdempotencyStore` |
| `_xml.py`           | Strict parse, root/element extraction                        |
| `_json.py`          | JSON value types used by the transformer                     |
| `certificate.py`    | `P12Reader` (cryptography)                                   |
| `signing.py`        | `Signature`, `validate_xml_certificate`                      |
| `transformer.py`    | `Transformer` (internal `dict_to_xml`/`xml_to_dict`)         |
| `reception.py`      | Reception routing + B2B applicability (A.2)                  |
| `reconciliation.py` | Pending-marker reconciliation, sequence reuse                |
| `validation.py`     | XSD validation via `lxml` (offline, bundled schemas)         |
| `utils.py`          | security code, QR URLs, date/time, RFCE, XML-body helpers    |
| `client.py`         | `ECF` (auth + all endpoints)                                 |
| `cli.py`            | typer `app` → `py-dgii-ecf` entry point                      |

---

## 4. Module contracts — TypeScript

### 4.1 `environment.ts`

```ts
enum Environment {
  Dev = 'TesteCF',
  Cert = 'CerteCF',
  Prod = 'eCF',
}

const BaseUrl = {
  ECF: 'https://ecf.dgii.gov.do', // crédito fiscal
  CF: 'https://fc.dgii.gov.do', // factura de consumo (< 250K)
  STATUS: 'https://statusecf.dgii.gov.do',
} as const;

enum Endpoint {
  Seed = 'Autenticacion/api/Autenticacion/Semilla',
  ValidateSeed = 'autenticacion/api/Autenticacion/ValidarSemilla',
  SendInvoice = 'recepcion/api/FacturasElectronicas',
  SendSummary = 'recepcionfc/api/recepcion/ecf', // base = BaseUrl.CF
  InquiryInvoiceSummary = 'consultarfce/api/Consultas/Consulta', // base = BaseUrl.CF, PROD only
  CommercialApproval = 'aprobacionComercial/api/AprobacionComercial',
  TrackResultStatus = 'consultaresultado/api/Consultas/Estado',
  InquiryStatus = 'consultaestado/api/Consultas/Estado',
  AllTrackingEcf = 'ConsultaTrackIds/api/TrackIds/Consulta',
  Directory = 'consultadirectorio/api/consultas/obtenerdirectorioporrnc',
  DirectoryList = 'consultadirectorio/api/consultas/listado',
  Void = 'anulacionrangos/api/operaciones/anularrango',
}

function buildUrl(
  env: Environment,
  endpoint: Endpoint,
  baseUrl?: string,
): string; // `${baseUrl}/${env}/${endpoint}`

function buildSenderReceiverUrl(
  host: string,
  endpoint: SenderReceiverEndpoint,
): string;
```

Constants must match Appendix A.1/A.2 **byte-for-byte**. Sender↔Receiver (buyer-host) paths are
prefixed `fe/...` and hit `buyerHost` directly (no `/env` prefix):
`fe/autenticacion/api/semilla`, `fe/autenticacion/api/validacioncertificado`,
`fe/recepcion/api/ecf`, `fe/aprobacioncomercial/api/ecf`. The service-status host uses
`StatusEndpoint` (`api/estatusservicios/...`) and takes an `Apikey` header, not a bearer token.

### 4.2 `types.ts`

```ts
interface AuthToken {
  token: string;
  expira: string;
  expedido: string;
}

// Response models for the ten §4.4 methods. Monetary fields are `string`, never `number`.
interface InvoiceResponse {
  /* DGII recepcion result: estado, trackId, mensajes, ... */
}
interface InvoiceSummaryResponse {
  /* ... */
}
interface TrackingStatusResponse {
  /* ... */
}
interface InquiryStatusResponse {
  /* ... */
}
interface SummaryTrackingStatusResponse {
  /* ... */
}
interface ServiceDirectoryResponse {
  /* ... */
}
interface InquiryInvoiceSummary {
  /* ... */
}
interface CommercialApprovalResponse {
  /* ... */
}
interface VoidNCFResponse {
  /* ... */
}
```

Field shapes follow the DGII wire responses; monetary/amount fields are `string`. The DGII status
enum values (`RECIBIDO`, `EN_PROCESO`, `RECHAZADO`, `ACEPTADO`, …) may be modeled as string-literal
unions, not invented enums.

The models the sequence-reuse question rests on are fixed (§9.4 states the behaviour):

```ts
// `consultaresultado` — the read that publishes the reuse flag for a general e-CF.
interface TrackingStatusResponse {
  codigo: TrackStatusCode;
  estado: TrackStatusEnum;
  trackId: string;
  rnc: string;
  encf: string;
  /** Absent or `null` when DGII did not scope the answer to a rejection. */
  secuenciaUtilizada?: boolean | null;
  fechaRecepcion: string;
  mensajes?: Mensaje[];
}

// `consultaestado` — existence only; DGII publishes no reuse flag on this response.
interface InquiryStatusResponse {
  codigo: InquiryStatusCode;
  estado: InquiryStatus; // required: `estado` alone decides existence
  // no `secuenciaUtilizada` — DGII does not publish it here; do not add it back
  rncEmisor?: string;
  ncfElectronico?: string;
  /* …the remaining documented output parameters… */
}

// One `consultatrackids` entry: `estado` is required, `trackId` is not.
interface SummaryTrackingStatusResponse {
  trackId?: string;
  estado: string;
  fechaRecepcion: string;
}

export interface ReconciliationResult {
  inquiry: InquiryStatusResponse; // always populated — the existence read never moves
  delivered: boolean;
  canReuseSequence: boolean; // see §9.4 for what `false` means
  cleared: boolean;
}
```

Three properties of that surface are contract, not style:

- **`canReuseSequence` takes only a response that carries the flag:**
  `TrackingStatusResponse | InquiryInvoiceSummary`. Passing an `InquiryStatusResponse` is a type
  error in both languages. In TypeScript this **narrows** the parameter — the RFCE reception
  response (`InvoiceSummaryResponse`), which the previous structural type accepted, no longer
  matches; in Python it **widens** it, because `InquiryInvoiceSummary` is now accepted. The
  asymmetry is deliberate: both packages accept exactly the two responses DGII publishes
  `secuenciaUtilizada` on.
- **`InquiryStatusResponse.secuenciaUtilizada` is removed in both packages.** DGII's eleven
  documented output parameters for `consultaestado` do not include it (register `TEC-02`,
  _Consulta de estado e-CF_ — `project-tasks/124-source-register.md` register §6), so a caller that
  read it was reading `undefined`/`None` — which is the defect #126 reports.
- **`estado` stays declared required on every status model**, while `trackId` on a listing entry and
  `secuenciaUtilizada` on a track result are optional, because DGII may omit them: an entry without
  a `trackId` is a state DGII's own text does not exclude, and an answer that is not a rejection
  need not carry the flag. Where `estado` decides something it is also enforced at runtime — an
  unreadable `estado` fails `inquiryStatus` and `trackStatuses` — and where it only corroborates
  (`statusTrackId`) it is classified by the predicate and withholds reuse instead of failing the
  read (§4.11). `fechaRecepcion` nullability is unchanged (§14).

### 4.3 `errors.ts`

```ts
type DgiiErrorCode =
  | 'INVALID_XML' // XML well-formedness failure
  | 'CERTIFICATE' // P12/key/certificate problem
  | 'SIGNING' // XMLDSig failure
  | 'HTTP' // non-2xx after retries
  | 'AUTH' // 401/403, token rejected
  | 'TIMEOUT'
  | 'CIRCUIT_OPEN' // breaker rejected the call locally
  | 'IDEMPOTENCY' // a submission marker is already pending
  | 'VALIDATION'
  | 'UNKNOWN';

class DgiiError extends Error {
  readonly code: DgiiErrorCode;
  readonly status?: number; // HTTP status if any
  readonly resource?: string; // endpoint path attempted
  readonly data?: unknown; // raw response body
  readonly mensajes?: Mensaje[]; // normalized DGII `mensajes` array (if any)
  readonly retryable?: boolean;
}

function toDgiiError(error: unknown): DgiiError; // A.8 normalizer
function isRetryableStatus(status: number | undefined): boolean; // 408/429/5xx
```

`toDgiiError` reduces every Appendix A.8 shape to one `DgiiError`: bare string, `{ mensajes: [...] }`,
ProblemDetails, and HTML bodies all collapse to a single `message`; `status`/`resource`/`data`/
`mensajes` are preserved when present. On **401**, keep DGII's body message (it explains _why_
credentials were rejected) — do not replace with a generic "unauthorized".

### 4.4 `result.ts`

```ts
export { Result, Ok, Err, ok, err, okAsync, errAsync } from 'neverthrow';
export type DgiiResult<T> = Result<T, DgiiError>;
```

### 4.5 `resilience.ts`

```ts
interface ResilienceOptions {
  /**
   * Retries after the first attempt, passed straight to cockatiel's
   * `maxAttempts`. Default 3 — i.e. **4** transport attempts per logical call,
   * where Python's `stop_after_attempt(3)` means 3 (§14, F-126-8).
   */
  maxRetries?: number;
  /** Consecutive failures before the circuit opens. Default 5. */
  breakerThreshold?: number;
  /** Milliseconds the circuit stays open before half-opening. Default 30s. */
  halfOpenAfterMs?: number;
  /** Per-attempt timeout in milliseconds. Default 15s. */
  timeoutMs?: number;
  /** Initial retry backoff, in milliseconds. Default 100. */
  retryInitialDelayMs?: number;
  /** Maximum concurrent in-flight requests. Default 20. */
  bulkheadLimit?: number;
  /** Maximum queued requests while the bulkhead is saturated. Default 40. */
  bulkheadQueue?: number;
}

function isRetryable(error: unknown): boolean; // network | 408 | 429 | 5xx
function createResiliencePolicies(opts?: ResilienceOptions): ResiliencePolicies;
```

The composed policy wraps, innermost→outermost: `bulkhead → timeout → breaker → retry`, so retries
re-enter the breaker and respect the overall timeout. See §8 for the retry predicate contract.

### 4.6 `http.ts`

```ts
interface IdempotencyStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

class InMemoryIdempotencyStore implements IdempotencyStore {
  constructor(options?: { ttlMs?: number; now?: () => number });
  /* process-local Map, 24h TTL, swept past 1,000 entries */
}

interface HttpClientOptions {
  baseUrl: string;
  token?: string;
  resilience?: ResilienceOptions;
  policies?: ResiliencePolicies;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  beforeRequest?: () => Promise<void>; // token refresh hook
  onUnauthorized?: () => Promise<boolean>; // 401 replay hook
}

class HttpClient {
  constructor(options: HttpClientOptions);
  setToken(token: string): void;
  getToken(): string | undefined;
  clearToken(): void;
  request<T>(options: RequestOptions): Promise<DgiiResult<T>>;
  get<T>(path: string, query?: Query): Promise<DgiiResult<T>>;
  postMultipart<T>(
    path: string,
    fileName: string,
    xml: string,
    options?: RequestOptions,
  ): Promise<DgiiResult<T>>;
}
```

- Multipart is built with `FormData` + `Blob` (`formData.append('xml', new Blob([xml],
{ type: 'application/xml' }), fileName)`). **Never** hand-set `Content-Length` — native fetch
  computes it from the Blob.
- `get`/`postMultipart` inject `Authorization: Bearer <token>` and `Accept: application/json`, run
  through the composed policy, and map failures through `toDgiiError`.
- The idempotency key is derived by the client (`ECF#buildIdempotencyKey`), not by `HttpClient`:
  `RNC + eNCF + SHA-256(signed XML)` (see §9).

### 4.7 `certificate.ts`

```ts
interface P12ReaderData {
  key?: string; // private key PEM
  cert?: string; // certificate PEM
  publicKey?: string; // public key PEM
}

interface CertificateInfo {
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  serialNumber: string;
}

class P12Reader {
  constructor(passphrase: string);
  getKeyFromFile(fileName: string): Result<P12ReaderData, DgiiError>;
  getKeyFromStringBase64(base64: string): Result<P12ReaderData, DgiiError>;
  getCertificateInfo(fileName: string): Result<CertificateInfo, DgiiError>;
  getCertificateInfoFromBase64(
    base64: string,
  ): Result<CertificateInfo, DgiiError>;
}
```

Per A.6: `forge.pkcs12.pkcs12FromAsn1(asn1, false, passphrase)`, pull the `certBag` (→ PEM cert)
and the `pkcs8ShroudedKeyBag` — falling back to a plain `keyBag` for unencrypted bundles. A
`certBag` never holds a private key, so it must not be used as a fallback. Every method returns
`Err(DgiiError)` on a bad passphrase or a malformed P12.

### 4.8 `signing.ts`

```ts
class Signature {
  constructor(privateKeyPem: string, certificatePem: string);
  signXml(
    xml: string,
    rootElName?: DgiiDocumentType,
  ): Result<string, DgiiError>;
}

function validateXMLCertificate(xml: string): XmlCertificateValidation;
```

The reference digest is xml-crypto's built-in SHA-256, over the node-set it has already
canonicalized with inclusive C14N 1.0 (Appendix A.5). `rootElName` defaults to the parsed root
element, so callers rarely pass it. Full algorithm in §10.

### 4.9 `transformer.ts`

```ts
class Transformer {
  static json2xml(json: unknown, opts?: { compact?: boolean }): string;
  static xml2json(xml: string, opts?: { compact?: boolean }): unknown;
}
```

Thin wrapper over `xml-js` in **compact** mode. JSON shape contract in §11.

### 4.10 `utils.ts`

```ts
function getCodeSixDigitfromSignature(xml: string): string; // first 6 of <SignatureValue>
function generateFcQRCodeURL(
  rnc: string,
  encf: string,
  monto: string,
  codigo: string,
  env: Environment,
): string;
function generateEcfQRCodeURL(
  rnc: string,
  rncComprador: string | undefined,
  encf: string,
  monto: string,
  fechaEmision: string,
  fechaFirma: string,
  codigo: string,
  env: Environment,
): string; // omit RncComprador query param for E43/E47
function getCurrentFormattedDateTime(): string; // DD-MM-YYYY HH:mm:ss, America/Santo_Domingo
function getXmlFromBodyResponse(
  body: string,
  lastTag?: string,
): string | undefined; // regex <\?xml[\s\S]*?</{tag}>
function convertECF32ToRFCE(ecf32Xml: string): {
  xml: string;
  securityCode: string;
};
```

All behaviours match Appendix A.7 exactly (QR query shapes, E43/E47 omission, RFCE empty-drop +
lone `ImpuestoAdicional`→list wrap).

### 4.11 `client.ts`

```ts
interface EcfOptions {
  token?: string; // pre-existing bearer token
  idempotencyStore?: IdempotencyStore; // default: InMemoryIdempotencyStore
  resilience?: ResilienceOptions;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  tokenRefreshSkewMs?: number; // default 5 minutes
  now?: () => number;
  statusApiKey?: string; // `Apikey` header for the status host
  enforceB2BRules?: boolean; // default true
  validateBeforeSend?: boolean; // default false, requires xmllint
  xmllintBin?: string;
}

class ECF {
  constructor(
    credentials: P12ReaderData,
    environment?: Environment, // default Environment.Dev
    options?: EcfOptions,
  );

  authenticate(buyerHost?: string): Promise<DgiiResult<AuthToken>>;

  // Submissions — idempotent, persist-before-transmit.
  sendElectronicDocument(
    signedXml: string,
    fileName: string,
    buyerHost?: string,
  ): Promise<DgiiResult<InvoiceResponse>>;
  sendSummary(
    signedXml: string,
    fileName: string,
  ): Promise<DgiiResult<InvoiceSummaryResponse>>;
  sendDocument(
    signedXml: string,
    fileName: string,
    buyerHost?: string,
  ): Promise<DgiiResult<InvoiceResponse | InvoiceSummaryResponse>>;
  sendCommercialApproval(
    signedXml: string,
    fileName: string,
  ): Promise<DgiiResult<CommercialApprovalResponse>>;
  sendCommercialApproval(
    signedXml: string,
    fileName: string,
    buyerHost: string,
  ): Promise<DgiiResult<B2BCommercialApprovalResponse>>;
  voidENCF(
    signedXml: string,
    fileName: string,
  ): Promise<DgiiResult<VoidNCFResponse>>;

  // Queries — never idempotency-keyed.
  statusTrackId(trackId: string): Promise<DgiiResult<TrackingStatusResponse>>;
  inquiryStatus(
    rncEmisor: string,
    ncfElectronico: string,
    rncComprador?: string,
    codigoSeguridad?: string,
  ): Promise<DgiiResult<InquiryStatusResponse>>;
  trackStatuses(
    rncEmisor: string,
    encf: string,
  ): Promise<DgiiResult<SummaryTrackingStatusResponse[]>>;
  getCustomerDirectory(
    rnc: string,
  ): Promise<DgiiResult<ServiceDirectoryResponse[] | undefined>>;
  getDirectoryListing(): Promise<DgiiResult<ServiceDirectoryResponse[]>>;
  getSummaryInvoiceInquiry(
    rnc: string,
    encf: string,
    codSeguridad: string,
  ): Promise<DgiiResult<InquiryInvoiceSummary>>;
  reconcileSubmission(
    signedXml: string,
  ): Promise<DgiiResult<ReconciliationResult>>;

  // Service status (Apikey, no environment segment, no bearer token).
  getServiceStatus(): Promise<DgiiResult<ServiceStatusEntry[]>>;
  getMaintenanceWindows(): Promise<DgiiResult<MaintenanceWindow[]>>;
  checkServiceAvailability(
    ambiente: StatusEnvironment,
  ): Promise<DgiiResult<ServiceAvailabilityResponse>>;
}
```

Endpoint wiring (Appendix A.2): `authenticate` → `Seed` then `ValidateSeed`; `sendElectronicDocument`
→ `SendInvoice`; `sendSummary` → `SendSummary` (BaseUrl.CF); `sendDocument` → routing decided by
`resolveReceptionRoute`; `statusTrackId` → `TrackResultStatus`; `inquiryStatus` → `InquiryStatus`;
`trackStatuses` → `AllTrackingEcf`; `getCustomerDirectory` → `Directory`; `getDirectoryListing` →
`DirectoryList`; `getSummaryInvoiceInquiry` → `InquiryInvoiceSummary` (BaseUrl.CF, **PROD-only**);
`sendCommercialApproval` → `CommercialApproval`; `voidENCF` → `Void`.

`sendDocument` rejects an E32 below RD$250,000 (the caller must build the RFCE first) and rejects a
`buyerHost` for an RFCE summary. `sendElectronicDocument` additionally enforces the B2B
applicability rules and, when enabled, XSD validation before any network call.

`reconcileSubmission` composes the query chain of §9.4 — it is not a single endpoint: `inquiryStatus`
(`consultaestado`, existence) runs first and alone decides `delivered`/`cleared`; only for a rejected
general `<ECF>` do `trackStatuses` (`consultatrackids`) and `statusTrackId` (`consultaresultado`)
follow, and only they can set `canReuseSequence`.

**Payload classification — the three query reads parse their own answer.** Each method decodes its
body as `unknown` and refuses a payload it cannot classify with `VALIDATION` and the message
`Unexpected DGII response payload` (Python's existing literal, reused verbatim). A body the SDK
cannot read is never evidence, so none of these failures can produce a delivery, a clearance or a
reuse answer:

| Method → endpoint                     | Accepted                                                                                                                               | `Err(VALIDATION)`                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `inquiryStatus` → `consultaestado`    | a JSON object whose `estado` is a string                                                                                               | absent/`null`/non-object body, an object without a string `estado` |
| `trackStatuses` → `consultatrackids`  | a JSON object (treated as a one-element list), an array (an empty one included), where every entry is an object with a string `estado` | absent/`null`/scalar body, or any entry without a string `estado`  |
| `statusTrackId` → `consultaresultado` | any JSON object                                                                                                                        | absent/`null`/array/scalar body                                    |

`estado` is the only field with a rule on these reads, because it is the only field a decision
branches on. `codigo`, the fiscal fields, `trackId` on a result and `mensajes` are published but
read by nothing that decides, so they are not validated; `estado` and `secuenciaUtilizada` on a
track result are classified by `canReuseSequence` (§9.4) and never fail the read.

**Two public behaviour changes** a caller can observe:

- `statusTrackId` and `trackStatuses` used to hand back whatever the decode produced
  (`Ok(undefined)` for an empty body, `Ok` for a body of the wrong shape). Both now answer
  `Err(VALIDATION)` and name the endpoint in `error.resource`, so an `isOk()` branch written against
  the old behaviour changes for those bodies. `inquiryStatus` gained the same guard: a body it
  cannot classify is `Err(VALIDATION)` where it previously returned `Ok`.
- TypeScript performs **no field-level validation** beyond that shape guard: a malformed
  non-classifying value (`codigo: "abc"`, `montoTotal: "abc"`) reaches the caller verbatim, where
  Python drops it (`null`/`0`). See §14.

### 4.12 `index.ts`

Re-exports the whole package surface: `ECF`, `P12Reader`, `Signature`, `Transformer`,
`validateDocument`, `formatViolations`, `resolveReceptionRoute`, `checkB2BApplicability`,
`canReuseSequence`, `getCodeSixDigitfromSignature`, `generateFcQRCodeURL`,
`generateEcfQRCodeURL`, `getCurrentFormattedDateTime`, `getXmlFromBodyResponse`,
`convertECF32ToRFCE`, `validateXMLCertificate`, plus `Environment`, `BaseUrl`, `Endpoint`,
`SenderReceiverEndpoint`, `StatusEndpoint`, `StatusEnvironment`, `DgiiError`, `DgiiErrorCode`,
`DgiiResult`, `HttpClient`, `IdempotencyStore`.

---

## 5. Module contracts — Python (`py_dgii_ecf`)

Mirror of §4 with snake_case naming, `DgiiResult[T] = Result[T, DgiiError]`, and synchronous
`httpx2` (no `async`). Only deviations from the TS contract are shown.

### 5.1 `environment.py`

```python
class Environment(StrEnum):
    DEV = "TesteCF"
    CERT = "CerteCF"
    PROD = "eCF"

class BaseUrl(StrEnum):        # same A.1 values
    ECF = "https://ecf.dgii.gov.do"
    CF = "https://fc.dgii.gov.do"
    STATUS = "https://statusecf.dgii.gov.do"

class Endpoint(StrEnum): ...           # same A.2 keys/values as TS
class SenderReceiverEndpoint(StrEnum): ...
class StatusEndpoint(StrEnum): ...
class StatusEnvironment(IntEnum): ...  # ambiente: 1 | 2 | 3

def build_url(env: Environment, endpoint: Endpoint, base_url: BaseUrl = BaseUrl.ECF) -> str: ...
def build_sender_receiver_url(host: str, endpoint: SenderReceiverEndpoint) -> str: ...
def build_status_url(endpoint: StatusEndpoint) -> str: ...
```

### 5.2 `types.py`

```python
@dataclass(frozen=True)
class AuthToken:
    token: str
    expira: str
    expedido: str

# Response models; monetary fields typed as `Decimal` (or `str` where DGII wire requires).
```

Use dataclasses or Pydantic models; mypy-strict clean. Monetary fields are `Decimal` per §3.4.

The response models mirror §4.2 field for field, with one difference in how a payload is read:
Python's models are typed, so parsing is where tolerance lives. The split follows the same rule as
the TypeScript guard — **a field that decides something is read strictly; a field that only
corroborates is tolerated** —

| Model                           | Read without coercion (the fields a decision branches on)                                        | Tolerated (dropped, never an error)                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `TrackingStatusResponse`        | `secuenciaUtilizada` — only a literal `bool` counts; `"false"`/`0` ⇒ `None`                      | `codigo` ⇒ `0`; `estado` ⇒ `""`; `trackId`/`rnc`/`encf`/`fechaRecepcion` ⇒ `None`; `mensajes` ⇒ `()` |
| `SummaryTrackingStatusResponse` | `estado` (a non-string is `VALIDATION`); `trackId`, when present, becomes `None` if not a string | `fechaRecepcion` ⇒ `None`                                                                            |
| `InquiryStatusResponse`         | `estado` (a non-string is `VALIDATION`)                                                          | `codigo` ⇒ `0`; every optional fiscal field ⇒ `None`                                                 |
| `InquiryInvoiceSummary`         | `estado`                                                                                         | `secuenciaUtilizada` ⇒ `None`                                                                        |

The direction matters for callers: on these reads Python became **more** permissive — a payload
with a malformed non-classifying field used to raise `ResponseShapeError` and now returns `Ok` —
while a payload with a non-string `estado` is still refused. `InquiryStatusResponse` carries no
`secuencia_utilizada` (§4.2). `TrackingStatusResponse.secuencia_utilizada` is already `bool | None`,
which is the shape TypeScript now mirrors.

### 5.3 `errors.py`

```python
class DgiiErrorCode(StrEnum):
    INVALID_XML = "INVALID_XML"
    CERTIFICATE = "CERTIFICATE"
    SIGNING = "SIGNING"
    HTTP = "HTTP"
    AUTH = "AUTH"
    TIMEOUT = "TIMEOUT"
    CIRCUIT_OPEN = "CIRCUIT_OPEN"
    IDEMPOTENCY = "IDEMPOTENCY"
    VALIDATION = "VALIDATION"
    UNKNOWN = "UNKNOWN"

@dataclass
class DgiiError(Exception):
    message: str
    code: DgiiErrorCode = DgiiErrorCode.UNKNOWN  # keyword-only
    status: int | None = None
    status_text: str | None = None
    resource: str | None = None
    method: str | None = None
    base_url: str | None = None
    data: object = None
    mensajes: list[Mensaje] | None = None
    retryable: bool | None = None
    cause: object = None

def to_dgii_error(error: object) -> DgiiError: ...
def is_retryable_status(status: int | None) -> bool: ...
```

Only `message` is positional; every other field is keyword-only. Raw payloads are typed as
`JsonValue` (`_json.py`) on the parsing path, because mypy runs with `disallow_any_explicit`.

### 5.4 `result.py`

```python
from result import Result, Ok, Err
DgiiResult = Result  # used as Result[T, DgiiError]
```

### 5.5 `resilience.py`

```python
@dataclass
class ResilienceOptions:
    max_retries: int = 3  # stop_after_attempt(3) -> 3 total attempts (TS: 4, §14 F-126-8)
    breaker_threshold: int = 5
    reset_timeout_s: float = 30.0
    timeout_s: float = 15.0

def is_retryable_error(error: BaseException) -> bool: ...   # network | 408 | 429 | 5xx
class ResiliencePolicy:                                     # tenacity + pybreaker wrapper
    def execute(self, fn: Callable[[], T]) -> Result[T, DgiiError]: ...
```

Python composes **retry (tenacity) + circuit breaker (pybreaker) + timeout (httpx2 client
`timeout=`)**, per spec §3.3/§5.1. There is **no bulkhead** in Python — the spec lists only
tenacity + pybreaker; this is an intentional, documented parity difference (see §12.8).

### 5.6 `http.py`

```python
class IdempotencyStore(Protocol):
    def get(self, key: str) -> JsonObject | None: ...
    def set(self, key: str, value: JsonObject) -> None: ...
    def delete(self, key: str) -> None: ...

class InMemoryIdempotencyStore(IdempotencyStore): ...   # 24h TTL, swept past 1,000 entries

@dataclass
class HttpClientOptions:
    base_url: str
    token: str | None = None
    resilience: ResilienceOptions | None = None
    timeout_s: float = 15.0
    before_request: Callable[[], None] | None = None   # token refresh hook
    on_unauthorized: Callable[[], bool] | None = None  # 401 replay hook

class HttpClient:
    def __init__(self, options: HttpClientOptions,
                 *, client: httpx2.Client | None = None) -> None: ...
    def set_token(self, token: str) -> None: ...
    def clear_token(self) -> None: ...
    def request(self, method: str, url: str, ...) -> DgiiResult[JsonValue]: ...
    def get(self, url: str, params: Mapping[str, object] | None = None, *,
            headers: Mapping[str, str] | None = None,
            skip_auth_hooks: bool = False,
            omit_auth: bool = False) -> DgiiResult[JsonValue]: ...
    def post_multipart(self, url: str, file_name: str, xml: str, *,
                       headers: Mapping[str, str] | None = None) -> DgiiResult[JsonValue]: ...
```

Multipart via `httpx2` `files={"xml": (file_name, xml_bytes, "application/xml")}` — the client
computes `Content-Length` automatically. Underlying transport is `httpx2.Client` (requests-compatible,
sync). Do **not** set `Content-Length` by hand.

### 5.7 `certificate.py`

```python
@dataclass(frozen=True)
class P12ReaderData:
    key: str | None
    cert: str | None
    public_key: str | None

class P12Reader:
    def __init__(self, passphrase: str) -> None: ...
    def get_key_from_file(self, file_name: str | Path) -> DgiiResult[P12ReaderData]: ...
    def get_key_from_base64(self, base64_data: str) -> DgiiResult[P12ReaderData]: ...
    def get_key_from_bytes(self, data: bytes) -> DgiiResult[P12ReaderData]: ...
    def get_certificate_info(self, file_name: str | Path) -> DgiiResult[CertificateInfo]: ...
    def get_certificate_info_from_base64(self, base64_data: str) -> DgiiResult[CertificateInfo]: ...
    def get_certificate_info_from_bytes(self, data: bytes) -> DgiiResult[CertificateInfo]: ...
```

Per A.6: `cryptography.hazmat.primitives.serialization.pkcs12.load_key_and_certificates`.

### 5.8 `signing.py`

```python
class Signature:
    def __init__(self, private_key_pem: str, certificate_pem: str) -> None: ...
    @classmethod
    def try_from_p12(cls, p12_path: str | Path, passphrase: str) -> DgiiResult[Signature]: ...
    def sign_xml(self, xml: str, root_name: str | None = None) -> DgiiResult[str]: ...

def validate_xml_certificate(xml: str) -> XmlCertificateValidation: ...
```

No custom digest — uses `etree.tostring(node, method="c14n", exclusive=False, with_comments=False)`
(inclusive 1.0 C14N). Full algorithm in §10.

### 5.9 `transformer.py`

```python
class Transformer:
    @staticmethod
    def json_to_xml(data: Mapping[str, object], round_monetary: bool = False) -> str: ...
    @staticmethod
    def xml_to_json(xml: str) -> DgiiResult[dict[str, object]]: ...
```

Implemented with `lxml` + a small internal `dict_to_xml`/`xml_to_dict` mirroring xml-js **compact**
semantics — **no extra dependency** (see §11 and §12.2).

### 5.10 `utils.py`

```python
def get_code_six_digit_from_signature(xml: str) -> str: ...
def generate_fc_qr_code_url(rnc: str, encf: str, monto: str, codigo: str, env: Environment) -> str: ...
def generate_ecf_qr_code_url(rnc: str, rnc_comprador: str | None, encf: str, monto: str,
                             fecha_emision: str, fecha_firma: str, codigo: str,
                             env: Environment) -> str: ...   # omit RncComprador for E43/E47
def get_current_formatted_datetime() -> str: ...             # DD-MM-YYYY HH:mm:ss, America/Santo_Domingo
def get_xml_from_body_response(body: str, last_tag: str = "ACECF") -> str | None: ...
def convert_ecf32_to_rfce(ecf32_xml: str) -> dict[str, str]: ...  # {"xml": ..., "security_code": ...}
```

### 5.11 `client.py`

```python
class ECF:
    def __init__(
        self,
        credentials: P12ReaderData,
        environment: Environment = Environment.DEV,
        *,
        token: str | None = None,
        idempotency_store: IdempotencyStore | None = None,
        resilience: ResilienceOptions | None = None,
        timeout_s: float = 15.0,
        http_client: httpx2.Client | None = None,
        token_refresh_skew_s: float = 5 * 60,
        now: Callable[[], float] = time.time,
        status_api_key: str | None = None,
        enforce_b2b_rules: bool = True,
        validate_before_send: bool = False,
    ) -> None: ...

    def authenticate(self, buyer_host: str | None = None) -> DgiiResult[AuthToken]: ...
    def send_electronic_document(self, signed_xml: str, file_name: str,
                                 buyer_host: str | None = None) -> DgiiResult[InvoiceResponse]: ...
    def send_summary(self, signed_xml: str, file_name: str) -> DgiiResult[InvoiceSummaryResponse]: ...
    def send_document(self, signed_xml: str, file_name: str,
                      buyer_host: str | None = None) -> DgiiResult[InvoiceResponse | InvoiceSummaryResponse]: ...
    def send_commercial_approval(self, signed_xml: str, file_name: str,
                                 buyer_host: str | None = None) -> DgiiResult[
        CommercialApprovalResponse | B2BCommercialApprovalResponse]: ...
    def void_encf(self, signed_xml: str, file_name: str) -> DgiiResult[VoidNCFResponse]: ...
    def status_track_id(self, track_id: str) -> DgiiResult[TrackingStatusResponse]: ...
    def inquiry_status(self, rnc_emisor: str, ncf_electronico: str,
                       rnc_comprador: str | None = None,
                       codigo_seguridad: str | None = None) -> DgiiResult[InquiryStatusResponse]: ...
    def track_statuses(self, rnc_emisor: str, encf: str) -> DgiiResult[list[SummaryTrackingStatusResponse]]: ...
    def get_customer_directory(self, rnc: str) -> DgiiResult[list[ServiceDirectoryResponse] | None]: ...
    def get_directory_listing(self) -> DgiiResult[list[ServiceDirectoryResponse]]: ...
    def get_summary_invoice_inquiry(self, rnc: str, encf: str,
                                    cod_seguridad: str) -> DgiiResult[InquiryInvoiceSummary]: ...
    def reconcile_submission(self, signed_xml: str) -> DgiiResult[ReconciliationResult]: ...
    def get_service_status(self) -> DgiiResult[list[ServiceStatusEntry]]: ...
    def get_maintenance_windows(self) -> DgiiResult[list[MaintenanceWindow]]: ...
    def check_service_availability(self, ambiente: StatusEnvironment) -> DgiiResult[ServiceAvailabilityResponse]: ...
```

Endpoint wiring identical to §4.11, including `reconcile_submission`'s query chain (`inquiry_status`
first and alone for `delivered`/`cleared`; `track_statuses` → `status_track_id` only for a rejected
general `<ECF>`) — and synchronous throughout, like the rest of this package (`httpx2`, no `async`;
§5.1). `get_summary_invoice_inquiry` raises/returns a validation
`Err` when `environment is not Environment.PROD` (A.9).

**Payload classification.** The same rule as §4.11, stated for this package: `inquiry_status`
returns `Err(VALIDATION)` for a body that is not a JSON object or whose `estado` is not a string;
`track_statuses` returns `Err(VALIDATION)` for an absent or `null` body **before** delegating to the
shared `_parse_list` — that helper keeps mapping `None` to `Ok([])` for its other callers, and an
absent body must not read as "no records" — and, through that helper, for a scalar body or for any
entry it cannot classify (a non-object entry, or one whose `estado` is not a string);
`status_track_id` returns `Err(VALIDATION)` only for a body that is not a JSON object. The error
message for a non-object or absent body is `Unexpected DGII response payload` in both packages; a
body whose `estado` is missing reports the same `VALIDATION` code with this package's field-level
text (`field 'estado' must be a string, got NoneType`), so `code` matches and `message` does not
(§14, F-126-7).

**`status_track_id` tolerates a partial answer** — this is a public behaviour change. An absent or
unreadable `codigo` becomes `0` and an absent or unreadable `estado` becomes `""`, so a caller that
previously received `Err` for such a body now receives `Ok`. The reason is structural: on this read
the verdict only corroborates a flag that DGII already published, so an unreadable one withholds
reuse (`can_reuse_sequence` ⇒ `False`) instead of failing a read that did happen. A payload that is
not an object at all is still `Err`.

**No `resource` on the query path.** Unlike TypeScript, this package does not populate
`DgiiError.resource` for these failures, so the only discriminator a Python caller gets is `Ok` vs
`Err` (§9.4, §14, F-126-12).

### 5.12 `cli.py` (Python-only)

```python
import typer
app = typer.Typer(no_args_is_help=True)   # entry point: `py-dgii-ecf`

@app.command()
def sign(xml_file: Path, p12: Path, password: str, output: Path | None = None) -> None: ...
@app.command()
def authenticate(p12: Path, password: str, environment: str = "CerteCF") -> None: ...
@app.command()
def status(track_id: str, p12: Path, password: str, environment: str = "CerteCF") -> None: ...
```

`password` is a required `--password` option with `prompt=True, hide_input=True`, so the CLI asks
for it when omitted. `--environment` accepts the DGII values or the aliases
`test`/`dev`, `cert`, `prod`. Entry point (`pyproject`):
`py-dgii-ecf = "py_dgii_ecf.cli:app"`. Minimal surface — see §12.3.

### 5.13 `__init__.py`

Re-exports the full public surface (mirror of TS `index.ts`): the client `ECF`, `P12Reader`,
`Signature`, `Transformer`, `validate_document`, `format_violations`, `resolve_reception_route`,
`check_b2b_applicability`, `can_reuse_sequence`, `InMemoryIdempotencyStore`, the URL builders, the
environment/endpoint enums, `DgiiError`, `DgiiErrorCode`, `DgiiResult`, and the response models.

---

## 6. Result-pattern contract

| Concern          | TypeScript (`neverthrow`)              | Python (`result`)                               |
| ---------------- | -------------------------------------- | ----------------------------------------------- |
| Success value    | `ok(value)` / `new Ok(value)`          | `Ok(value)`                                     |
| Failure value    | `err(error)` / `new Err(error)`        | `Err(error)`                                    |
| Error type       | `DgiiError` (class)                    | `DgiiError` (dataclass)                         |
| Async public API | `Promise<DgiiResult<T>>`               | `DgiiResult[T]` (sync `httpx2`)                 |
| Type alias       | `DgiiResult<T> = Result<T, DgiiError>` | `DgiiResult = Result` (always `[T, DgiiError]`) |

Rules:

- **Domain/IO errors are returned, never thrown.** Only programmer errors (null deref, type misuse)
  may throw. `toDgiiError`/`to_dgii_error` is the single choke-point that wraps any `unknown`/`object`
  into a `DgiiError` before wrapping in `Err`.
- **No naked `throw` in `client`/`http`/`signing`/`certificate`/`transformer`.** Any library call
  that can fail is captured and normalized.
- **Async calls return `Promise<Result<...>>`** in TS; Python has no async public surface because
  `httpx2.Client` is synchronous (§5.1). If a caller needs concurrency, they drive it outside the
  SDK — the SDK exposes only synchronous `httpx2`.

---

## 7. Error model

`DgiiErrorCode` (identical in both languages): `INVALID_XML`, `CERTIFICATE`, `SIGNING`, `HTTP`,
`AUTH`, `TIMEOUT`, `CIRCUIT_OPEN`, `IDEMPOTENCY`, `VALIDATION`, `UNKNOWN`.

`DgiiError` carries: `code`, `message`, and optional `status`, `resource`, `data`, `mensajes`,
`retryable`.

`toDgiiError`/`to_dgii_error` normalization table (Appendix A.8):

| Input shape                     | Result                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| bare string body                | `message = body`                                                                                                 |
| `{ mensajes: [...] }`           | `message = joined mensajes`; `mensajes = [...]`                                                                  |
| ProblemDetails                  | `message` from `title`/`detail`; preserve `status`                                                               |
| HTML body                       | `message = stripped text` (or generic fallback)                                                                  |
| transport exception             | TypeScript `code = UNKNOWN`, Python `code = HTTP` (§14, F-126-13); the retry decision inspects the raw exception |
| non-2xx                         | `code = AUTH` if 401/403, else `HTTP`; keep `status`, `data`                                                     |
| payload the SDK cannot classify | `code = VALIDATION`, `message = 'Unexpected DGII response payload'` (§4.11)                                      |

`TIMEOUT` and `CIRCUIT_OPEN` are part of the enum for callers that classify their own failures; the
SDK does not currently emit them — a timeout arrives as `UNKNOWN` (TypeScript) or `HTTP` (Python)
with a retryable cause.

**401 special case (A.9):** keep DGII's body message verbatim — it explains the rejection reason.

---

## 8. Resilience design

### 8.1 Retry predicate (`isRetryable` / `is_retryable`)

Retry **only**:

- network/transport errors (DNS, TCP, TLS, connection reset, `ConnectError`),
- HTTP **408**, **429**, **5xx**.

**Never** retry: any other **4xx** (400, 401, 403, 404, 422, …). A rejected e-CF must not be
blindly re-sent (spec §3.3).

### 8.2 TypeScript (cockatiel)

Composed policy (innermost → outermost): `bulkhead → timeout → breaker → retry`.

- **Retry** (`retry(handleWhen(isRetryable), { maxAttempts, backoff })`) — exponential backoff with
  jitter; default `maxAttempts = 3`.
- **ConsecutiveBreaker** (`consecutiveBreaker(threshold)`) — opens after `threshold` consecutive
  failures; half-open after `halfOpenAfterMs`.
- **Timeout** (`timeout(timeoutMs)`) — per-attempt and overall.
- **Bulkhead** (`bulkhead(limit, queue)`) — caps concurrent in-flight calls.

Policy factory returns a single composed `Policy` used by `HttpClient`.

### 8.3 Python (tenacity + pybreaker)

- **Retry** (tenacity `@retry(stop=..., wait=..., retry=is_retryable)`) — retries when
  `is_retryable(exception)` is true; `retry_error_clause` not used. No retry on 4xx (except 408/429).
- **Circuit breaker** (`pybreaker.CircuitBreaker(fail_max, reset_timeout)`) — opens on `fail_max`
  consecutive failures; `reset_timeout` (half-open) closes after quiet period.
- **Timeout** — `httpx2.Client(timeout=timeout_seconds)`; additionally the tenacity stop condition
  bounds total wall-clock.
- **No bulkhead** (spec lists only tenacity + pybreaker) — documented parity difference.

`HttpCall.execute(fn)` runs `fn` inside the breaker, with tenacity retry wrapping the breaker call,
so each retry passes through the breaker.

---

## 9. Idempotency design

### 9.1 Key derivation

```
key = RNC + eNCF + SHA-256(signed XML)
```

Concretely: `"${rnc}:${encf}:${sha256hex(signedXml)}"`, where:

- `rnc` / `encf` are extracted from the signed XML (emisor RNC and eNCF); `fileName` `{RNC}{eNCF}.xml`
  is the fallback when the document does not expose them.
- `sha256hex` is lowercase hex of SHA-256 over the exact signed XML string bytes.

Implemented by `HttpClient.buildIdempotencyKey` / `build_idempotency_key`.

### 9.2 Store contract

`get(key)`, `set(key, value)`, `delete(key)` — async in TS, sync in Python. `InMemoryIdempotencyStore`
(`Map`/`dict`) is the default; callers can inject Redis/Postgres backends.

### 9.3 Flow (submissions only)

Applied in `sendElectronicDocument`/`sendSummary` (and `send_commercial_approval`/`void_encf`, which
are also submissions) — **persist-before-transmit**:

1. Compute `key`.
2. `store.get(key)` → if present, return the stored response (`Ok`), **no re-transmit**. A stored
   `"pending"` marker surfaces as `IDEMPOTENCY`; `reconcileSubmission` clears it only when DGII has
   no record of the document (§9.4).
3. `store.set(key, pending)` **before** transmitting (hard rule).
4. Transmit via `HttpClient.postMultipart` / `HttpClient.post_multipart`.
5. On success → `store.set(key, serializedResponse)`; on failure → `store.delete(key)` so a future
   call may retry.

Query methods (`statusTrackId`, `inquiryStatus`, `trackStatuses`, `getCustomerDirectory`,
`getDirectoryListing`, `getSummaryInvoiceInquiry`, `getServiceStatus`, `getMaintenanceWindows`,
`checkServiceAvailability`, `authenticate`) are **not** idempotency-keyed.

### 9.4 Reconcile: the existence read, then a gated reuse chain

Every DGII fact in this section — which response publishes `secuenciaUtilizada`, the track-id
listing semantics, the `No encontrado` states, the per-document-type sources — is cited from
`project-tasks/124-source-register.md` rows `TEC-02` and `TEC-01` (register §6 track, §7 reconcile),
never re-derived from the PDFs. The design record that froze this contract is
`project-tasks/126-contract-design.md` (§2 decision, §5 ordered operations).

`reconcileSubmission` / `reconcile_submission` answers two questions with two different DGII reads,
and the order is part of the contract, not an implementation detail. `[READ n]` is a logical call
(subject to the package's attempt budget), `[PURE]` has no I/O, `[WRITE]` touches the store.

```text
1. [PURE]  rnc  = extractElementText(signedXml, 'RNCEmisor') ?? 'RncEmisor'
           encf = extractElementText(signedXml, 'eNCF')      ?? 'SecuenciaeNCFDesde'
           missing either -> Err(VALIDATION); no I/O, marker untouched
2. [PURE]  root = local name of the root element
3. [READ 1] inquiry = inquiryStatus(rnc, encf)            // consultaestado -- the only existence source
           on Err -> propagate unchanged; marker untouched
4. [PURE]  cleared   = inquiry.estado === 'No encontrado'  // RAW equality, untrimmed
           delivered = !cleared
5. [PURE]  gate = root === 'ECF' && delivered && inquiry.estado.trim() === 'Rechazado'
6. [READ 2, 3] only when the gate holds:
     tracks = trackStatuses(rnc, encf)                     // consultatrackids
     on Err -> propagate unchanged; marker untouched
     usable     = entries whose estado !== 'No encontrado'
     followable = usable entries whose trackId is a non-empty string
     if exactly one usable AND one followable:
       canReuseSequence = canReuseSequence(statusTrackId(followable[0].trackId))  // consultaresultado
       on Err -> propagate unchanged; marker untouched
     else canReuseSequence = false
7. [PURE]  otherwise canReuseSequence = false              // no error, and no extra call
8. [PURE]  key = buildIdempotencyKey(signedXml)             // the derivation the send used
9. [WRITE] if cleared: idempotency.delete(key)              // last fallible statement, exactly once
10. [PURE] return Ok({ inquiry, delivered, canReuseSequence, cleared })
```

**Existence is unchanged, and it is the only thing that can clear a marker.** `delivered` and
`cleared` still come from `consultaestado`, by raw equality on `estado`, computed before any other
call. The listing is never an existence source: an empty listing, an entry saying `No encontrado`
and a missing `trackId` can withhold reuse but cannot un-deliver a document or touch the marker.
Because `cleared` and the gate are mutually exclusive (`cleared ⇒ !delivered ⇒ !gate`), no read can
occur between the clearing decision and the delete.

**The reuse flag's source, per document type.** `secuenciaUtilizada` is published on
`consultaresultado` (reached through `consultatrackids`) and on an RFCE summary inquiry
(`consultarfce`); it is **not** on `consultaestado` (§4.2). On the reconcile path the only route is
the track result, and both track services are documented for a document sent through the general
e-CF reception — hence the gate. A reconcile of an `<RFCE>`, `<ACECF>`, `<ANECF>` or unknown root
therefore answers `canReuseSequence: false`: no consult on that path publishes the flag. For an
RFCE the reception response does carry it, but that response exists only on the success path, and a
pending marker exists precisely because no response was stored; `consultarfce`'s flag has no
textual definition and licenses reuse on another _Resumen de Factura de Consumo_, never on a general
e-CF. Callers who hold an RFCE summary can still ask `getSummaryInvoiceInquiry` and pass it to
`canReuseSequence` themselves.

**The predicate, in full.** `true` requires both facts DGII states for a reusable rejection — the
flag _and_ the verdict — and the function is total: it cannot throw for any input the models admit.

```ts
const canReuseSequence = (
  response: TrackingStatusResponse | InquiryInvoiceSummary,
): boolean => {
  const estado: unknown = response.estado; // unchecked cast: `estado` can be anything on the wire
  return (
    response.secuenciaUtilizada === false &&
    (typeof estado === 'string' ? estado.trim() : '') === 'Rechazado'
  );
};
```

```python
def can_reuse_sequence(response: TrackingStatusResponse | InquiryInvoiceSummary) -> bool:
    return response.secuencia_utilizada is False and (
        response.estado if isinstance(response.estado, str) else ""
    ).strip() == "Rechazado"
```

An absent, `null` or non-boolean flag is not the literal `false`, so it answers `false`; an absent or
non-string `estado` answers `false` instead of raising; comparison is exact after trimming, with no
case folding (`rechazado`/`RECHAZADO` ⇒ `false`); `No encontrado` is never compared here, because
that is the existence rule and it stays raw.

**What `false` means.** `canReuseSequence: false` does not mean DGII consumed the sequence; it
means the SDK did not obtain a positive reusable answer. The cases it collapses, all `Ok`:

| Cause                                                                                     | What the caller can see                                               |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| root is not a general `<ECF>`                                                             | `inquiry` populated, document type known                              |
| DGII holds no record                                                                      | `delivered: false`, `cleared: true`                                   |
| the verdict is not a rejection                                                            | `inquiry.estado`                                                      |
| rejected, but the listing gave 0 or >1 usable tracks, or none with a `trackId`            | `inquiry.estado === 'Rechazado'`, one `consultatrackids` in the trace |
| rejected with one track, but its verdict is not `Rechazado`, the flag is absent or `true` | call the public `statusTrackId(trackId)` for the per-track facts      |

The sixth cause — **a flag read that could not be completed — is not in that table: it is `Err`**.
See §4.11 for which bodies each read refuses and §7 for the codes.

**Failure semantics.** Every failed read fails the call. The error is propagated unchanged (the
single `toDgiiError`/`to_dgii_error` normalizer, no new code, no wrapper) and the marker is never
touched; no partial `Ok` is returned. A `false` produced by a failed flag read would be
indistinguishable from DGII answering "not reusable", which is the silent dead capability #126
reports.

- `Err` after this change means either "the existence question could not be answered" (as before)
  or "DGII holds the document, but the reuse flag could not be read". `Ok` vs `Err` is the parity-safe
  discriminator: it separates "DGII answered" from "could not ask".
- **TypeScript only:** `error.resource` names the failing read with the real endpoint value
  (`Endpoint.InquiryStatus`, `Endpoint.AllTrackingEcf`, `Endpoint.TrackResultStatus`), including on
  the `VALIDATION` failures those reads raise themselves. **Python has no equivalent** — `resource`
  is not populated on the query path (§14, F-126-12).
- Recovery: on `Err`, do **not** re-send — the marker is intact, so retrying reconcile later cannot
  double-issue. If the caller needs an existence answer sooner, call `inquiryStatus(rnc, encf)`
  directly; that read decides `delivered`/`cleared` and cannot touch the marker. A permanent `Err` on
  the track services is a delegation problem, not an outage: `consultatrackids` requires the token to
  be delegated **for the emitter**, where `consultaestado` accepts the emitter **or** the receiver,
  so a receiver-delegated integrator now gets a visible `Err` on any rejected document it cannot
  follow (F-126-11 records the option that would remove it).
- **`canReuseSequence: true` always arrives with `cleared: false`.** A rejected document never clears
  its marker, so re-sending the identical document keeps returning `IDEMPOTENCY` until the store's
  TTL: a reusable sequence means _re-sign the same e-NCF as a new document_, never _re-send this
  one_.
- Reconcile is not usable in `CerteCF`: DGII documents `consultaestado` and `consultatrackids` as
  not available to the public in certification, so the first read fails and the chain is
  unreachable by construction.

### 9.5 What a reconcile costs, and the lease the caller owes

Logical calls, before and after:

| Path                                                          | Calls                         | Before |
| ------------------------------------------------------------- | ----------------------------- | ------ |
| any non-`ECF` root, no record, or verdict ≠ `Rechazado`       | **1** (`consultaestado`)      | 1      |
| `<ECF>`, delivered, `Rechazado`, ≠1 followable track          | **2** (+ `consultatrackids`)  | 1      |
| `<ECF>`, delivered, `Rechazado`, exactly one followable track | **3** (+ `consultaresultado`) | 1      |

So the common paths cost what they always did and only a **rejected document** pays the chain — but
that path can now take minutes and can fail where it used to succeed. With the default 15 s
per-attempt timeout and no auth refresh, one reconcile is bounded by ≈61 s (TypeScript, 4 transport
attempts per call) / ≈45 s (Python, 3) for one call, ≈121 s / ≈90 s for two, and ≈182 s / ≈135 s for
the full chain. One token refresh (Seed + ValidarSemilla) adds the same again, so size a queue
lease against ≈**303 s** (TypeScript) / ≈**225 s** (Python).

Therefore, at the caller:

- **The queue lease (visibility timeout) must exceed the reconcile worst case**, or reconcile must
  run in a lease-renewing or leader-elected context. Two workers reconciling the same document
  concurrently is not made safe by the marker: once one of them deletes it, the other can re-send.
- **Do not nest a retry loop around reconcile.** The SDK's retry policy is the retry policy; schedule
  the next attempt through the queue's own backoff.
- **Give reconcile its own worker/limit.** The breaker and the bulkhead are shared with
  `sendElectronicDocument` (one `HttpClient` per client), so a `consultatrackids` outage can consume
  the failure budget and the permits submissions need. A separate `HttpClient`/policy for the query
  path is the structural fix and is not in this release (§14, F-126-2).
- Instrument reconcile outcomes (delivered/cleared/reusable, `Err` by `resource` in TypeScript), not
  raw request counts, or the extra reads look like a traffic regression.

---

## 10. Signing contract (Appendix A.5)

Identical algorithm both languages; must verify byte-for-byte against the reference.

- Signature algorithm: `http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`
- Canonicalization: inclusive 1.0 (`http://www.w3.org/TR/2001/REC-xml-c14n-20010315`)
- Reference `URI=""`, transform enveloped-signature, digest SHA-256 base64
- `<Signature>` appended as **last child** of root; `X509Certificate` = base64(DER of cert)
- Strip whitespace-only text nodes + comments before signing

### TypeScript (xml-crypto)

No custom digest is registered. xml-crypto canonicalizes the referenced node-set with inclusive
C14N 1.0 before hashing, so the built-in SHA-256 produces the bytes DGII expects and emits the
standard `DigestMethod` URI:

```ts
const sig = new SignedXml({
  privateKey,
  publicCert,
  signatureAlgorithm: RSA_SHA256,
  canonicalizationAlgorithm: C14N_INCLUSIVE,
});
sig.addReference({
  xpath: `//*[local-name(.)='${elementName}']`,
  transforms: [ENVELOPED],
  digestAlgorithm: SHA256,
  isEmptyUri: true,
});
cleanNodes(doc); // strip whitespace-only text nodes + comments
sig.computeSignature(doc.toString());
```

An earlier revision registered a hand-sorted digest because the built-in SHA-256 was assumed to
order root `xmlns` attributes differently; that assumption was wrong, and the custom digest was
removed. Do not reintroduce it — the libxmlsec1 gate would fail.

### Python (lxml + cryptography)

No custom digest: `etree.tostring(node, method="c14n", exclusive=False, with_comments=False)` for
inclusive C14N. Digest the canonicalized root **before** appending `<Signature>`, build `SignedInfo`
(ds namespace), canonicalize + RSA-PKCS1v15-SHA256 sign it, append.

### Verification gate

The unit suites pin the digest (Python also verifies the RSA signature with `cryptography`), but
they recompute the same code path. The independent gate is the pair of scripts below, which sign
real fixtures and verify them with **libxmlsec1** — the library DGII's `.NET` stack uses — and run
in CI on every push:

```bash
mise run verify-signing-typescript                                  # bun run scripts/verify-signing.ts
cd packages/python && uv run --with xmlsec python scripts/verify_signing.py
```

The TypeScript script signs a second, deliberately C14N-sensitive document (attributes out of C14N
order) because `invoice-31.xml` has no attributes and would not catch a raw-serialization regression.

---

## 11. Transformer / JSON↔XML shape contract

TS uses `xml-js` **compact** mode; Python re-implements the identical semantics internally with
`lxml` (no extra dependency — §12.2). The JSON shape contract:

| XML construct             | Compact JSON                                     |
| ------------------------- | ------------------------------------------------ |
| element                   | dict key = element name                          |
| repeated sibling elements | list under that key                              |
| attributes                | `_attributes` object under the element key       |
| text content              | scalar `string` value                            |
| mixed / no children       | `null` / `undefined` per xml-js compact defaults |

Example (illustrative):

```text
<ImpuestoTotal>18.00</ImpuestoTotal>
<ImpuestoAdicional><Tipo>01</Tipo></ImpuestoAdicional>
```

```json
{
  "ImpuestoTotal": { "_text": "18.00" },
  "ImpuestoAdicional": { "Tipo": { "_text": "01" } }
}
```

(Exact `_text`/`_attributes` key names follow xml-js compact output; the Python `dict_to_xml`/
`xml_to_dict` must reproduce these exact keys so the two packages are interchangeable on the wire.)

Money round-trips as `string` (TS) / `Decimal`→`str` (Python); no numeric coercion.

---

## 12. Resolutions to open questions

1. **`httpx2` is real.** It exists on PyPI (Pydantic continuation of httpx; v2.16.0, requests-compatible,
   HTTP/1.1 + HTTP/2, `import httpx2`, `requires-python >=3.11`). Exposes `httpx2.Client`,
   `httpx2.AsyncClient`, `httpx2.HTTPStatusError`, `httpx2.ConnectError`, `httpx2.MockTransport`.
   **Pin `httpx2>=2.13,<3`.** The SDK uses the **synchronous** `httpx2.Client`.
2. **Python transformer — no extra dependency.** Implement a small internal `dict_to_xml`/`xml_to_dict`
   over `lxml` that mirrors xml-js compact semantics (§11). No `xmltodict`/`dicttoxml` added.
3. **CLI surface (minimal, concrete).** typer `app`, entry point `py-dgii-ecf`, `no_args_is_help=True`.
   Commands: `sign <xml> <p12>`, `authenticate <p12>`, `status <track_id> <p12>`, each taking a
   prompted `--password` and, where relevant, `--environment` (DGII value or alias) and `--output`.
   Plus `--help` on every command. No invented features beyond these three.
4. **Endpoint mapping confirmed:** `statusTrackId` → `TRACK_RESULT_STATUS`
   (`consultaresultado/api/Consultas/Estado`); `inquiryStatus` → `INQUIRY_STATUS`
   (`consultaestado/api/Consultas/Estado`).
5. **Lockfile name:** bun 1.4.x produces a **text `bun.lock`** (not `bun.lockb`). Commit `bun.lock`.

6. **Python `get_summary_invoice_inquiry` PROD guard** — return `Err(validation)` when
   `environment != Environment.PROD` (A.9).
7. **`getCustomerDirectory` normalization** — DGII may return an object or array; always normalize
   to a `list` (or `[]`/empty when absent) (A.8).
8. **Bulkhead parity** — TS includes bulkhead (cockatiel); Python does not (spec §5.1 lists only
   tenacity + pybreaker). Documented as an intentional asymmetry, not a gap.

---

## 13. Testing strategy

### Unit (both, always run)

| Area          | TS (vitest)                                                                                                                                                          | Python (pytest)                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Signing       | fixture XML → assert digest equals **hardcoded** value; verify with `xmlsec1 --verify`                                                                               | same fixture/algorithm; cross-check vs TS output where feasible |
| P12Reader     | generated `.p12` → valid PEM cert + key                                                                                                                              | same                                                            |
| Result/errors | `Ok`/`Err`; `toDgiiError` over all A.8 shapes                                                                                                                        | `Ok`/`Err`; `to_dgii_error` shapes                              |
| Transformer   | round-trip fixtures; money stays `string`                                                                                                                            | round-trip; `Decimal`↔`str`                                     |
| Resilience    | 5xx/429/408/network retried; other 4xx not; breaker opens                                                                                                            | same via mocked transport                                       |
| Idempotency   | store `get`/`set`/`delete`; key derivation matches spec; persist-before-transmit ordering                                                                            | same                                                            |
| Client        | mocked transport (undici/fetch mock; `httpx2.MockTransport`) asserts endpoint paths, auth header, multipart part name `xml`, directory single→array, PROD-only guard | same                                                            |
| Utils         | every A.7 helper incl. E43/E47 QR omission + RFCE wrap                                                                                                               | same                                                            |
| CLI           | n/a                                                                                                                                                                  | `py-dgii-ecf --help` renders; subcommands parse                 |

### Integration (skipped by default)

Real DGII network calls (seed/auth/submission/status). Gated behind an env flag / credentials
presence; `describe.skip` (vitest) / `pytest.mark.skipif` + `pytest.mark.integration` (pytest),
skipped when credentials absent. Never run in CI without secrets.

---

## 14. Spec gaps & risks

- **`convertECF32ToRFCE` exact XSLT-like transform** (A.7) is described behaviorally, not as a full
  element-by-element mapping. Implementers should follow the described invariants (drop empties;
  wrap lone `ImpuestoAdicional`); the reference implementation is the tie-breaker.
- **Exact response type field sets** for the ten §4.4 methods are not enumerated in the spec — only
  `AuthToken { token, expira, expedido }` is explicit. Implementers model the remaining fields from
  the DGII wire responses and the reference (`victors1681/dgii-ecf`), keeping monetary fields
  `string`/`Decimal`.
- **QR URL query parameter order/encoding** is asserted as "exact" in A.7 but only behaviorally
  described; match the reference URL shapes and verify against fixtures.

### 14.1 Registered parity divergences

The two packages are behaviourally identical on the reconcile path for every response DGII answers:
same payload classification, same `delivered`/`cleared`/`canReuseSequence`, same marker outcome, same
requests. These divergences are known, permanent until their follow-up lands, and a reader of the
parity promise must know them:

| #                      | Divergence                                                                                                                                                                                                                                                                                                                                                                              | Where              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| **F-126-8**            | TypeScript performs **4** transport attempts per logical call where Python performs **3**, under the same nominal setting (cockatiel's `maxAttempts` counts retries, tenacity's `stop_after_attempt` counts attempts). Every 5xx or transport failure is therefore retried one extra time — a difference in attempt count only, never in the outcome. Resource configuration is frozen. | §4.5, §5.5, §9.5   |
| **F-126-13**           | A **transport** failure normalises to different codes: TypeScript `UNKNOWN`, Python `HTTP`. `code` and `message` match for failures **DGII answered**; the parity claim is scoped to those.                                                                                                                                                                                             | §7                 |
| **F-126-12**           | `DgiiError.resource` is populated in TypeScript and **not** on the Python query path, so only a TypeScript caller can name the failing read. Python's discriminator is `Ok` vs `Err`, plus a direct `inquiry_status` call.                                                                                                                                                              | §4.11, §5.11, §9.4 |
| **F-126-7**            | For a body whose `estado` is missing or not a string, both packages answer `VALIDATION` but with their own message text (TypeScript's `Unexpected DGII response payload`, Python's field-level `field 'estado' must be a string, …`). The identical-message requirement covers only the non-object and absent-body cases.                                                               | §4.11, §5.11       |
| **F-126-1**            | An open breaker costs Python three immediate probes per call (`is_retryable_error` matches pybreaker's message text) and no wall clock; TypeScript treats it as `UNKNOWN`, non-retryable. Not a #126 regression.                                                                                                                                                                        | §5.5, §8.3         |
| **F-126-2**            | The query path shares the submission's breaker and bulkhead, so a track-service outage can borrow the budget `sendElectronicDocument` needs. Mitigation is operational (a dedicated reconcile worker) until a separate policy lands.                                                                                                                                                    | §9.5               |
| **Model echo** (RES-1) | TypeScript performs no field-level validation beyond the shape guard, so a malformed **non-classifying** value (`codigo: "abc"`, `montoTotal: "abc"`) reaches the caller verbatim while Python drops it (`0`/`null`). No decision reads these fields; the difference is each type system's, not a decision's.                                                                           | §4.11, §5.11, §5.2 |
| **Off-path** (RES-2)   | `InquiryInvoiceSummary` (`consultarfce`) still parses its non-classifying fields strictly in Python and passes them through in TypeScript. Pre-existing, and **not** on the reconcile path: `secuenciaUtilizada` on that model is read without coercion in both packages, so the reuse answer agrees.                                                                                   | §5.2               |

One ambiguity inside `canReuseSequence: false` is documented rather than fixed: the boolean cannot
distinguish "several tracks" from "no followable `trackId`" (§9.4). F-126-6 records the additive
field that would.

---

_End of architecture document._
