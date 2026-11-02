# dgii-ecf — Technical Architecture

> Companion to `project-specs/dgii-ecf-setup.md` (canonical requirements + Appendix A) and
> `project-tasks/dgii-ecf-tasklist.md`. This document defines the contracts developers implement
> against. Where the spec is silent, this document states an explicit resolution (see §12).
> Nothing here introduces a dependency or feature absent from the spec.

---

## 1. Context & scope

Two publishable SDKs for the Dominican Republic's **DGII e-CF** electronic invoicing system,
sharing one behaviour contract and implemented in two languages:

| Package | Language / runtime | Registry | Dist name |
| --- | --- | --- | --- |
| `packages/typescript` | TypeScript, Bun-first, Node-compatible | npm | `@deuriib/dgii-ecf` |
| `packages/python` | Python ≥3.11, uv | PyPI | `dgii-ecf` |

Both SDKs: authenticate against DGII web services, sign documents with **XMLDSig (inclusive C14N
+ RSA-SHA256)**, and transmit them reliably with **Result-pattern errors**, **idempotency**, and
**retry/circuit-breaker/timeout**.

---

## 2. Architectural principles

1. **Dependency direction inward.** `client` → `http`/`signing`/`certificate`/`transformer` →
   `resilience`/`utils` → `result`/`errors`/`types`/`environment`. Leaf modules
   (`environment`, `types`, `errors`, `result`) import nothing from higher layers. Nothing imports
   the transport library (native `fetch` / `httpx2`) except `http.ts`/`http.py`.
2. **Result pattern everywhere.** Domain and IO failures are *returned*, never thrown. Only
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

| Module | Responsibility |
| --- | --- |
| `index.ts` | Public re-exports (package surface) |
| `environment.ts` | `Environment`, `BaseUrl`, `Endpoints`, path builder |
| `types.ts` | Wire/response models (`AuthToken`, `InvoiceResponse`, …) |
| `errors.ts` | `DgiiError`, `DgiiErrorCode`, `toDgiiError()` |
| `result.ts` | `neverthrow` re-exports + `DgiiResult<T>` |
| `resilience.ts` | cockatiel policy factory + retry predicate |
| `http.ts` | `HttpClient`, `IdempotencyStore`, `InMemoryIdempotencyStore` |
| `certificate.ts` | `P12Reader` (node-forge) |
| `signing.ts` | `Signature`, custom `Digest`, `validateXMLCertificate` |
| `transformer.ts` | `Transformer` (xml-js json2xml/xml2json) |
| `utils.ts` | security code, QR URLs, date/time, RFCE, XML-body helpers |
| `client.ts` | `ECFClient` (auth + all endpoints) |

### Python (`packages/python/src/dgii_ecf/`)

Mirrors the TS map 1:1, with `cli.py` (Python-only) replacing `index.ts` as the "extra" module;
`__init__.py` is the package surface (analogous to `index.ts`).

| Module | Responsibility |
| --- | --- |
| `__init__.py` | Public re-exports |
| `environment.py` | `Environment`, `BaseUrl`, `Endpoints`, path builder |
| `types.py` | Models (`AuthToken`, response types) |
| `errors.py` | `DgiiError`, `DgiiErrorCode`, `to_dgii_error()` |
| `result.py` | `result` re-exports + `DgiiResult[T]` |
| `resilience.py` | tenacity + pybreaker wrapper + retry predicate |
| `http.py` | `HttpClient`, `IdempotencyStore`, `InMemoryIdempotencyStore` |
| `certificate.py` | `P12Reader` (cryptography) |
| `signing.py` | `Signature`, `validate_xml_certificate` |
| `transformer.py` | `Transformer` (internal `dict_to_xml`/`xml_to_dict`) |
| `utils.py` | security code, QR URLs, date/time, RFCE, XML-body helpers |
| `client.py` | `ECFClient` (auth + all endpoints) |
| `cli.py` | typer `app` → `dgii-ecf` entry point |

---

## 4. Module contracts — TypeScript

### 4.1 `environment.ts`

```ts
enum Environment { Dev = 'TesteCF', Cert = 'CerteCF', Prod = 'eCF' }

const BaseUrl = {
  ECF:    'https://ecf.dgii.gov.do',       // crédito fiscal
  CF:     'https://fc.dgii.gov.do',        // factura de consumo (< 250K)
  STATUS: 'https://statusecf.dgii.gov.do',
} as const;

const Endpoints = {
  SEED:                 'Autenticacion/api/Autenticacion/Semilla',
  VALIDATE_SEED:        'autenticacion/api/Autenticacion/ValidarSemilla',
  SEND_INVOICE:         'recepcion/api/FacturasElectronicas',
  SEND_SUMMARY:         'recepcionfc/api/recepcion/ecf',          // base = BaseUrl.CF
  INQUIRY_SUMMARY:      'consultarfce/api/Consultas/Consulta',    // base = BaseUrl.CF, PROD only
  COMMERCIAL_APPROVAL:  'aprobacionComercial/api/AprobacionComercial',
  TRACK_RESULT_STATUS:  'consultaresultado/api/Consultas/Estado',
  INQUIRY_STATUS:       'consultaestado/api/Consultas/Estado',
  ALL_TRACKING_ECF:     'ConsultaTrackIds/api/TrackIds/Consulta',
  DIRECTORY:            'consultadirectorio/api/consultas/obtenerdirectorioporrnc',
  VOID:                 'anulacionrangos/api/operaciones/anularrango',
} as const;

function buildPath(env: Environment, endpoint: string): string; // `/${env}/${endpoint}`
```

Constants must match Appendix A.1/A.2 **byte-for-byte**. Sender↔Receiver (buyer-host) paths are
prefixed `fe/...` and hit `buyerHost` directly (no `/env` prefix).

### 4.2 `types.ts`

```ts
interface AuthToken { token: string; expira: string; expedido: string; }

// Response models for the ten §4.4 methods. Monetary fields are `string`, never `number`.
interface InvoiceResponse { /* DGII recepcion result: estado, trackId, mensajes, ... */ }
interface InvoiceSummaryResponse { /* ... */ }
interface TrackingStatusResponse { /* ... */ }
interface InquiryStatusResponse { /* ... */ }
interface SummaryTrackingStatusResponse { /* ... */ }
interface ServiceDirectoryResponse { /* ... */ }
interface InquiryInvoiceSummary { /* ... */ }
interface CommercialApprovalResponse { /* ... */ }
interface VoidNCFResponse { /* ... */ }
```

Field shapes follow the DGII wire responses; monetary/amount fields are `string`. The DGII status
enum values (`RECIBIDO`, `EN_PROCESO`, `RECHAZADO`, `ACEPTADO`, …) may be modeled as string-literal
unions, not invented enums.

### 4.3 `errors.ts`

```ts
enum DgiiErrorCode {
  Network = 'network',        // DNS/TCP/TLS, undici fetch failure
  Timeout = 'timeout',
  Http = 'http',              // non-2xx after retries
  Auth = 'auth',              // 401/403, token rejected
  Signing = 'signing',
  Certificate = 'certificate',
  Parse = 'parse',            // XML/JSON malformed
  Validation = 'validation',
  Idempotency = 'idempotency',
  Unknown = 'unknown',
}

class DgiiError extends Error {
  readonly code: DgiiErrorCode;
  readonly status?: number;      // HTTP status if any
  readonly resource?: string;    // endpoint path attempted
  readonly data?: unknown;       // raw response body
  readonly mensajes?: string[];  // normalized DGII `mensajes` array (if any)
}

function toDgiiError(error: unknown): DgiiError; // A.8 normalizer
```

`toDgiiError` reduces every Appendix A.8 shape to one `DgiiError`: bare string, `{ mensajes: [...] }`,
ProblemDetails, and HTML bodies all collapse to a single `message`; `status`/`resource`/`data`/
`mensajes` are preserved when present. On **401**, keep DGII's body message (it explains *why*
credentials were rejected) — do not replace with a generic "unauthorized".

### 4.4 `result.ts`

```ts
export { Result, Ok, Err, ok, err, okAsync, errAsync } from 'neverthrow';
export type DgiiResult<T> = Result<T, DgiiError>;
```

### 4.5 `resilience.ts`

```ts
interface ResilienceOptions {
  retry?:    { maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number; };
  breaker?:  { threshold?: number; halfOpenAfterMs?: number };
  timeoutMs?: number;
  bulkhead?: { limit?: number; queue?: number };
}

function isRetryable(error: unknown): boolean; // network | 408 | 429 | 5xx
function createHttpPolicy(opts?: ResilienceOptions): Policy; // cockatiel composed policy
```

The composed policy wraps, innermost→outermost: `bulkhead → timeout → breaker → retry` (cockatiel
`retryPolicy.wrap(breakerPolicy).wrap(timeoutPolicy).wrap(bulkheadPolicy)`), so retries re-enter the
breaker and respect the overall timeout. See §8 for the retry predicate contract.

### 4.6 `http.ts`

```ts
interface IdempotencyStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

class InMemoryIdempotencyStore implements IdempotencyStore { /* Map<string, string> */ }

interface MultipartXmlOptions {
  xml: string;                    // signed XML body
  fileName: string;               // `{RNC}{eNCF}.xml`
  extraFields?: Record<string, string>;
}

class HttpClient {
  constructor(config: {
    baseUrl: string;
    policy?: Policy;                       // from createHttpPolicy()
    store?: IdempotencyStore;              // default: InMemoryIdempotencyStore
  });
  setToken(token: string): void;
  get<T>(path: string): Promise<DgiiResult<T>>;
  postMultipartXml<T>(path: string, opts: MultipartXmlOptions): Promise<DgiiResult<T>>;
  buildIdempotencyKey(rnc: string, encf: string, signedXml: string): string;
}
```

- Multipart is built with `FormData` + `Blob` (`formData.append('xml', new Blob([xml],
  { type: 'application/xml' }), fileName)`). **Never** hand-set `Content-Length` — native fetch
  computes it from the Blob.
- `get`/`postMultipartXml` inject `Authorization: Bearer <token>` and `Accept: application/json`,
  run through the composed policy, and map failures through `toDgiiError`.
- `buildIdempotencyKey` implements `RNC + eNCF + SHA-256(signed XML)` (see §9).

### 4.7 `certificate.ts`

```ts
interface P12Payload { certificatePem: string; privateKeyPem: string; }

class P12Reader {
  static read(data: Uint8Array, passphrase: string): DgiiResult<P12Payload>;
}
```

Per A.6: `forge.pkcs12.pkcs12FromAsn1(asn1, false, passphrase)`, pull the `certBag` (→ PEM cert)
and `pkcs8ShroudedKeyBag` (→ PEM private key). `read` returns `Err(DgiiError)` on bad passphrase
or malformed P12.

### 4.8 `signing.ts`

```ts
class Digest {
  getHash(xml: string): string;                 // SHA-256 base64 of xmlns-sorted doc
  getAlgorithmName(): string;                   // 'http://www.w3.org/2001/04/xmlenc#sha256'
}

class Signature {
  static signXml(xml: string, rootName: string, keyPem: string, certPem: string): DgiiResult<string>;
}

function validateXMLCertificate(certPem: string): boolean;
```

The custom `Digest` is registered as `sig.HashAlgorithms['http://myDigestAlgorithm'] = Digest` and
used as the reference digest algorithm (Appendix A.5). Full algorithm in §10.

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
function getCodeSixDigitfromSignature(xml: string): string;                     // first 6 of <SignatureValue>
function generateFcQRCodeURL(rnc: string, encf: string, monto: string, codigo: string, env: Environment): string;
function generateEcfQRCodeURL(
  rnc: string, rncComprador: string | undefined, encf: string, monto: string,
  fechaEmision: string, fechaFirma: string, codigo: string, env: Environment,
): string;   // omit RncComprador query param for E43/E47
function getCurrentFormattedDateTime(): string;                                 // DD-MM-YYYY HH:mm:ss, America/Santo_Domingo
function getXmlFromBodyResponse(body: string, lastTag?: string): string | undefined; // regex <\?xml[\s\S]*?</{tag}>
function convertECF32ToRFCE(ecf32Xml: string): { xml: string; securityCode: string };
```

All behaviours match Appendix A.7 exactly (QR query shapes, E43/E47 omission, RFCE empty-drop +
lone `ImpuestoAdicional`→list wrap).

### 4.11 `client.ts`

```ts
class ECFClient {
  constructor(config: {
    environment: Environment;
    certificate?: { certificatePem: string; privateKeyPem: string }; // for authenticate
    token?: string;
    http?: HttpClient;          // default: constructed from BaseUrl.ECF
    store?: IdempotencyStore;   // default: InMemoryIdempotencyStore
  });

  authenticate(buyerHost?: string): Promise<DgiiResult<AuthToken>>;
  sendElectronicDocument(signedXml: string, fileName: string, buyerHost?: string): Promise<DgiiResult<InvoiceResponse>>;
  sendSummary(signedXml: string, fileName: string): Promise<DgiiResult<InvoiceSummaryResponse>>;
  statusTrackId(trackId: string): Promise<DgiiResult<TrackingStatusResponse>>;
  inquiryStatus(rncEmisor: string, ncf: string, rncComprador?: string, codigoSeguridad?: string): Promise<DgiiResult<InquiryStatusResponse>>;
  trackStatuses(rncEmisor: string, encf: string): Promise<DgiiResult<SummaryTrackingStatusResponse[]>>;
  getCustomerDirectory(rnc: string): Promise<DgiiResult<ServiceDirectoryResponse[]>>;
  getSummaryInvoiceInquiry(rnc: string, encf: string, codSeguridad: string): Promise<DgiiResult<InquiryInvoiceSummary>>;
  sendCommercialApproval(signedXml: string, fileName: string): Promise<DgiiResult<CommercialApprovalResponse>>;
  voidENCF(signedXml: string, fileName: string): Promise<DgiiResult<VoidNCFResponse>>;
}
```

Endpoint wiring (Appendix A.2): `authenticate` → `SEED` then `VALIDATE_SEED`; `sendElectronicDocument`
→ `SEND_INVOICE`; `sendSummary` → `SEND_SUMMARY` (BaseUrl.CF); `statusTrackId` →
`TRACK_RESULT_STATUS`; `inquiryStatus` → `INQUIRY_STATUS`; `trackStatuses` → `ALL_TRACKING_ECF`;
`getCustomerDirectory` → `DIRECTORY`; `getSummaryInvoiceInquiry` → `INQUIRY_SUMMARY` (BaseUrl.CF,
**PROD-only**); `sendCommercialApproval` → `COMMERCIAL_APPROVAL`; `voidENCF` → `VOID`.

### 4.12 `index.ts`

Re-exports every §4.4 symbol: `ECFClient`, `P12Reader`, `Signature`, `Transformer`,
`getCodeSixDigitfromSignature`, `generateFcQRCodeURL`, `generateEcfQRCodeURL`,
`getCurrentFormattedDateTime`, `getXmlFromBodyResponse`, `convertECF32ToRFCE`,
`validateXMLCertificate`, plus `Environment`, `BaseUrl`, `Endpoints`, `DgiiError`,
`DgiiErrorCode`, `DgiiResult`.

---

## 5. Module contracts — Python (`dgii_ecf`)

Mirror of §4 with snake_case naming, `DgiiResult[T] = Result[T, DgiiError]`, and synchronous
`httpx2` (no `async`). Only deviations from the TS contract are shown.

### 5.1 `environment.py`

```python
class Environment(str, Enum):
    DEV = "TesteCF"
    CERT = "CerteCF"
    PROD = "eCF"

BASE_URL = {"ECF": "...", "CF": "...", "STATUS": "..."}   # same A.1 values
ENDPOINTS = {...}                                          # same A.2 keys/values

def build_path(env: Environment, endpoint: str) -> str: ...
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

### 5.3 `errors.py`

```python
class DgiiErrorCode(str, Enum):
    NETWORK = "network"; TIMEOUT = "timeout"; HTTP = "http"; AUTH = "auth"
    SIGNING = "signing"; CERTIFICATE = "certificate"; PARSE = "parse"
    VALIDATION = "validation"; IDEMPOTENCY = "idempotency"; UNKNOWN = "unknown"

@dataclass
class DgiiError(Exception):
    code: DgiiErrorCode
    message: str
    status: int | None = None
    resource: str | None = None
    data: Any = None
    mensajes: list[str] | None = None

def to_dgii_error(error: object) -> DgiiError: ...
```

### 5.4 `result.py`

```python
from result import Result, Ok, Err
DgiiResult = Result  # used as Result[T, DgiiError]
```

### 5.5 `resilience.py`

```python
@dataclass
class ResilienceOptions:
    retry_max_attempts: int = 3
    retry_base_seconds: float = 0.5
    breaker_fail_max: int = 5
    breaker_reset_timeout: float = 60.0
    timeout_seconds: float = 30.0

def is_retryable(error: BaseException) -> bool: ...   # network | 408 | 429 | 5xx
class HttpCall:                                        # tenacity + pybreaker wrapper
    def execute(self, fn: Callable[[], T]) -> Result[T, DgiiError]: ...
```

Python composes **retry (tenacity) + circuit breaker (pybreaker) + timeout (httpx2 client
`timeout=`)**, per spec §3.3/§5.1. There is **no bulkhead** in Python — the spec lists only
tenacity + pybreaker; this is an intentional, documented parity difference (see §12.8).

### 5.6 `http.py`

```python
class IdempotencyStore(ABC):
    @abstractmethod
    def get(self, key: str) -> str | None: ...
    @abstractmethod
    def set(self, key: str, value: str) -> None: ...
    @abstractmethod
    def delete(self, key: str) -> None: ...

class InMemoryIdempotencyStore(IdempotencyStore): ...

class HttpClient:
    def __init__(self, base_url: str, policy: HttpCall | None = None,
                 store: IdempotencyStore | None = None) -> None: ...
    def set_token(self, token: str) -> None: ...
    def get(self, path: str) -> Result[T, DgiiError]: ...
    def post_multipart_xml(self, path: str, xml: str, file_name: str,
                           extra_fields: dict[str, str] | None = None) -> Result[T, DgiiError]: ...
    @staticmethod
    def build_idempotency_key(rnc: str, encf: str, signed_xml: str) -> str: ...
```

Multipart via `httpx2` `files={"xml": (file_name, xml_bytes, "application/xml")}` — the client
computes `Content-Length` automatically. Underlying transport is `httpx2.Client` (requests-compatible,
sync). Do **not** set `Content-Length` by hand.

### 5.7 `certificate.py`

```python
@dataclass
class P12Payload:
    certificate_pem: str
    private_key_pem: str

class P12Reader:
    @staticmethod
    def read(data: bytes, passphrase: str) -> Result[P12Payload, DgiiError]: ...
```

Per A.6: `cryptography.hazmat.primitives.serialization.pkcs12.load_key_and_certificates`.

### 5.8 `signing.py`

```python
class Signature:
    @staticmethod
    def sign_xml(xml: str, root_name: str, key_pem: str, cert_pem: str) -> Result[str, DgiiError]: ...

def validate_xml_certificate(cert_pem: str) -> bool: ...
```

No custom digest — uses `etree.tostring(node, method="c14n", exclusive=False, with_comments=False)`
(inclusive 1.0 C14N). Full algorithm in §10.

### 5.9 `transformer.py`

```python
class Transformer:
    @staticmethod
    def json2xml(data: Any) -> str: ...
    @staticmethod
    def xml2json(xml: str) -> Any: ...
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
class ECFClient:
    def __init__(self, environment: Environment, *, certificate: P12Payload | None = None,
                 token: str | None = None, http: HttpClient | None = None,
                 store: IdempotencyStore | None = None) -> None: ...

    def authenticate(self, buyer_host: str | None = None) -> Result[AuthToken, DgiiError]: ...
    def send_electronic_document(self, signed_xml: str, file_name: str,
                                 buyer_host: str | None = None) -> Result[InvoiceResponse, DgiiError]: ...
    def send_summary(self, signed_xml: str, file_name: str) -> Result[InvoiceSummaryResponse, DgiiError]: ...
    def status_track_id(self, track_id: str) -> Result[TrackingStatusResponse, DgiiError]: ...
    def inquiry_status(self, rnc_emisor: str, ncf: str, rnc_comprador: str | None = None,
                       codigo_seguridad: str | None = None) -> Result[InquiryStatusResponse, DgiiError]: ...
    def track_statuses(self, rnc_emisor: str, encf: str) -> Result[list[SummaryTrackingStatusResponse], DgiiError]: ...
    def get_customer_directory(self, rnc: str) -> Result[list[ServiceDirectoryResponse], DgiiError]: ...
    def get_summary_invoice_inquiry(self, rnc: str, encf: str, cod_seguridad: str) -> Result[InquiryInvoiceSummary, DgiiError]: ...
    def send_commercial_approval(self, signed_xml: str, file_name: str) -> Result[CommercialApprovalResponse, DgiiError]: ...
    def void_encf(self, signed_xml: str, file_name: str) -> Result[VoidNCFResponse, DgiiError]: ...
```

Endpoint wiring identical to §4.11. `get_summary_invoice_inquiry` raises/returns a validation
`Err` when `environment is not Environment.PROD` (A.9).

### 5.12 `cli.py` (Python-only)

```python
import typer
app = typer.Typer(name="dgii-ecf", no_args_is_help=True)

@app.command()
def sign(xml: str, key: str, cert: str, root: str = "ECF") -> None: ...
@app.command()
def authenticate(env: str, p12: str, password: str) -> None: ...
@app.command()
def status(track_id: str) -> None: ...
```

Entry point (pyproject `[project.scripts] dgii-ecf = "dgii_ecf.cli:app"`). Minimal surface — see §12.3.

### 5.13 `__init__.py`

Re-exports the full public surface (mirror of TS `index.ts`, plus `app` from `cli`).

---

## 6. Result-pattern contract

| Concern | TypeScript (`neverthrow`) | Python (`result`) |
| --- | --- | --- |
| Success value | `ok(value)` / `new Ok(value)` | `Ok(value)` |
| Failure value | `err(error)` / `new Err(error)` | `Err(error)` |
| Error type | `DgiiError` (class) | `DgiiError` (dataclass) |
| Async public API | `Promise<DgiiResult<T>>` | `DgiiResult[T]` (sync `httpx2`) |
| Type alias | `DgiiResult<T> = Result<T, DgiiError>` | `DgiiResult = Result` (always `[T, DgiiError]`) |

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

`DgiiErrorCode` (identical in both languages): `network`, `timeout`, `http`, `auth`, `signing`,
`certificate`, `parse`, `validation`, `idempotency`, `unknown`.

`DgiiError` carries: `code`, `message`, and optional `status`, `resource`, `data`, `mensajes`.

`toDgiiError`/`to_dgii_error` normalization table (Appendix A.8):

| Input shape | Result |
| --- | --- |
| bare string body | `message = body` |
| `{ mensajes: [...] }` | `message = joined mensajes`; `mensajes = [...]` |
| ProblemDetails | `message` from `title`/`detail`; preserve `status` |
| HTML body | `message = stripped text` (or generic fallback) |
| network/undici/httpx2 exception | `code = network` (or `timeout` if timeout) |
| non-2xx | `code = auth` if 401/403, else `http`; keep `status`, `data` |

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
2. `store.get(key)` → if present, return the stored response (`Ok`), **no re-transmit**.
3. `store.set(key, "pending")` **before** transmitting (hard rule).
4. Transmit via `HttpClient.postMultipartXml`.
5. On success → `store.set(key, serializedResponse)`; on failure → `store.delete(key)` so a future
   call may retry.

Query methods (`statusTrackId`, `inquiryStatus`, `trackStatuses`, `getCustomerDirectory`,
`getSummaryInvoiceInquiry`, `authenticate`) are **not** idempotency-keyed.

---

## 10. Signing contract (Appendix A.5)

Identical algorithm both languages; must verify byte-for-byte against the reference.

- Signature algorithm: `http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`
- Canonicalization: inclusive 1.0 (`http://www.w3.org/TR/2001/REC-xml-c14n-20010315`)
- Reference `URI=""`, transform enveloped-signature, digest SHA-256 base64
- `<Signature>` appended as **last child** of root; `X509Certificate` = base64(DER of cert)
- Strip whitespace-only text nodes + comments before signing

### TypeScript (xml-crypto)

Register a **custom digest** (because xml-crypto's built-in sha256 sorts the root `xmlns`
attributes differently from the DGII .NET stack):

```ts
getHash(xml) {
  const doc = new DOMParser().parseFromString(xml);
  const attrs = doc.childNodes[0].attributes;
  const sorted = Array.from(attrs).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  Object.assign(doc.childNodes[0].attributes, sorted); // reorder xmlns:xsd/xmlns:xsi
  return createHash('sha256').update(doc.toString(), 'utf8').digest('base64');
}
getAlgorithmName() { return 'http://www.w3.org/2001/04/xmlenc#sha256'; }
```

Registered as `sig.HashAlgorithms['http://myDigestAlgorithm'] = Digest`, used with
`digestAlgorithm: 'http://myDigestAlgorithm'`, `xpath: //*[local-name(.)='<root>']`,
`isEmptyUri: true`, enveloped-signature transform.

### Python (lxml + cryptography)

No custom digest: `etree.tostring(node, method="c14n", exclusive=False, with_comments=False)` for
inclusive C14N. Digest the canonicalized root **before** appending `<Signature>`, build `SignedInfo`
(ds namespace), canonicalize + RSA-PKCS1v15-SHA256 sign it, append.

### Verification gate

Both packages' test suites verify signed output with **`xmlsec1 --verify`** against the certificate,
and assert the digest matches a hardcoded fixture value (guards byte-for-byte fidelity of A.5).

---

## 11. Transformer / JSON↔XML shape contract

TS uses `xml-js` **compact** mode; Python re-implements the identical semantics internally with
`lxml` (no extra dependency — §12.2). The JSON shape contract:

| XML construct | Compact JSON |
| --- | --- |
| element | dict key = element name |
| repeated sibling elements | list under that key |
| attributes | `_attributes` object under the element key |
| text content | scalar `string` value |
| mixed / no children | `null` / `undefined` per xml-js compact defaults |

Example (illustrative):

```text
<ImpuestoTotal>18.00</ImpuestoTotal>
<ImpuestoAdicional><Tipo>01</Tipo></ImpuestoAdicional>
```

```json
{ "ImpuestoTotal": { "_text": "18.00" },
  "ImpuestoAdicional": { "Tipo": { "_text": "01" } } }
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
3. **CLI surface (minimal, concrete).** typer `app`, entry point `dgii-ecf`, `no_args_is_help=True`.
   Commands: `sign` (xml/key/cert/root), `authenticate` (env/p12/password), `status <track_id>`.
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

| Area | TS (vitest) | Python (pytest) |
| --- | --- | --- |
| Signing | fixture XML → assert digest equals **hardcoded** value; verify with `xmlsec1 --verify` | same fixture/algorithm; cross-check vs TS output where feasible |
| P12Reader | generated `.p12` → valid PEM cert + key | same |
| Result/errors | `Ok`/`Err`; `toDgiiError` over all A.8 shapes | `Ok`/`Err`; `to_dgii_error` shapes |
| Transformer | round-trip fixtures; money stays `string` | round-trip; `Decimal`↔`str` |
| Resilience | 5xx/429/408/network retried; other 4xx not; breaker opens | same via mocked transport |
| Idempotency | store `get`/`set`/`delete`; key derivation matches spec; persist-before-transmit ordering | same |
| Client | mocked transport (undici/fetch mock; `httpx2.MockTransport`) asserts endpoint paths, auth header, multipart part name `xml`, directory single→array, PROD-only guard | same |
| Utils | every A.7 helper incl. E43/E47 QR omission + RFCE wrap | same |
| CLI | n/a | `dgii-ecf --help` renders; subcommands parse |

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

---

*End of architecture document.*
