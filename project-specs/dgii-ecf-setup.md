# DGII e-CF — Project Specification

> Canonical source of truth for the `dgii-ecf` monorepo.
> Agents implementing this project MUST read this document first.

## 1. Mission

Build a professional, polyglot monorepo that ships two publishable SDKs for the
Dominican Republic's **DGII e-CF** (electronic invoicing) system:

| Package    | Language               | Registry | Distribution name                    |
| ---------- | ---------------------- | -------- | ------------------------------------ |
| TypeScript | TypeScript (Bun-first) | npm      | `@deuriib/dgii-ecf`                  |
| Python     | Python (uv)            | PyPI     | `py-dgii-ecf` (import `py_dgii_ecf`) |

Both SDKs authenticate against DGII web services, sign electronic tax documents
with **XMLDSig (inclusive C14N + RSA-SHA256)**, and transmit them reliably.

## 2. Monorepo layout

The monorepo is grouped by language:

```text
dgii-ecf/
├── packages/
│   ├── typescript/          # @deuriib/dgii-ecf (bun, tsup, vitest)
│   │   ├── src/
│   │   └── test/
│   └── python/              # dgii-ecf (uv, ruff, mypy, pytest)
│       ├── src/dgii_ecf/
│       └── tests/
├── project-specs/           # this spec
├── project-tasks/           # PM task list (generated)
├── project-docs/            # architecture + docs (generated)
├── .github/                 # workflows, templates, CODEOWNERS, labels
├── release-please-config.json
├── .release-please-manifest.json
├── mise.toml
├── .pre-commit-config.yaml
├── SECURITY.md / CODE_OF_CONDUCT.md / CONTRIBUTING.md
└── README.md
```

## 3. Cross-cutting requirements (BOTH packages)

1. **Result pattern** (no thrown exceptions for domain/IO errors):
   - TypeScript → [`neverthrow`](https://github.com/supermacro/neverthrow)
     (`Result<T, E>`, `Ok`, `Err`; `Promise<Result<T, E>>` for async).
   - Python → [`result`](https://github.com/rustedpy/result)
     (`Result[T, E]`, `Ok`, `Err`).
2. **Idempotency** for document submission. Key = `RNC + eNCF + SHA-256(signed XML)`.
   Provide an injectable `IdempotencyStore` interface + an in-memory default so
   callers can plug Redis/Postgres. Persist-before-transmit is a hard rule.
3. **Retry + circuit breaker + timeout** for every external HTTP call:
   - TypeScript → `cockatiel` (retry, `ConsecutiveBreaker`, timeout, bulkhead).
   - Python → `tenacity` (retry) + `pybreaker` (circuit breaker).
     Retry only transient failures (network error, 408, 429, 5xx). Never retry 4xx
     (except 408/429) — a rejected e-CF must not be blindly re-sent.
4. **Money is `Decimal`** (Python) / **string or big-int-safe numeric** (TypeScript:
   keep monetary values as strings in the document model; round only when formatting
   to 2 decimals). Floating-point money is forbidden.
5. **No secrets in source**: `.p12`, `.pem`, private keys, tokens, and production
   URLs come from config/secret manager. `.gitignore` must cover them.
6. **Comprehensive tests** in both languages (unit + integration-skipped-by-default).

## 4. TypeScript package — `@deuriib/dgii-ecf`

### 4.1 Toolchain

- Package manager / runtime: **bun** (`packageManager: bun@1.4.4`, `bun.lock`).
- Build: **tsup** → dual ESM (`.js`) + CJS (`.cjs`) + `.d.ts`.
- Test: **vitest**.
- HTTP: **native `fetch`** (no axios). Multipart via `FormData` + `Blob`.
- Resilience: **cockatiel**. Result: **neverthrow**. Types: TypeScript strict.

### 4.2 Dependencies

```
@xmldom/xmldom   (DOM for signing)
xml-crypto       (XMLDSig signing)
xml-js           (JSON <-> XML transformer)
node-forge       (PKCS#12 (.p12) parsing)
cockatiel        (retry / circuit breaker / timeout / bulkhead)
neverthrow       (result pattern)
```

dev: `typescript`, `tsup`, `vitest`, `@types/node`, `@types/node-forge`, `prettier`.

### 4.3 Module map (`src/`)

```
index.ts        public exports
environment.ts  Environment enum + BaseUrl + Endpoints
types.ts        AuthToken, InvoiceResponse, TrackingStatusResponse, ...
errors.ts       DgiiError (+ DgiiErrorCode) + toDgiiError() normalizer
result.ts       neverthrow re-exports + DgiiResult<T> alias
resilience.ts   cockatiel policy factory (retry/breaker/timeout/bulkhead)
http.ts         HttpClient (native fetch) + IdempotencyStore + InMemory store
certificate.ts  P12Reader (node-forge)
signing.ts      Signature (xml-crypto) + custom Digest + validateXMLCertificate
transformer.ts  Transformer (xml-js): json2xml / xml2json
utils.ts        security code, QR URLs, date/time, convertECF32ToRFCE, getXmlFromBodyResponse
client.ts       ECF client (auth + all endpoints) — uses http + resilience + idempotency
```

### 4.4 Public API (ECF client methods, all `Promise<Result<T, DgiiError>>`)

- `authenticate(buyerHost?)` → `AuthToken`
- `sendElectronicDocument(signedXml, fileName, buyerHost?)` → `InvoiceResponse`
- `sendSummary(signedXml, fileName)` → `InvoiceSummaryResponse`
- `statusTrackId(trackId)` → `TrackingStatusResponse`
- `inquiryStatus(rncEmisor, ncf, rncComprador?, codigoSeguridad?)` → `InquiryStatusResponse`
- `trackStatuses(rncEmisor, encf)` → `SummaryTrackingStatusResponse[]`
- `getCustomerDirectory(rnc)` → `ServiceDirectoryResponse[]` (normalize single→array)
- `getSummaryInvoiceInquiry(rnc, encf, codSeguridad)` → `InquiryInvoiceSummary`
- `sendCommercialApproval(signedXml, fileName)` → `CommercialApprovalResponse`
- `voidENCF(signedXml, fileName)` → `VoidNCFResponse`

Standalone helpers: `P12Reader`, `Signature`, `Transformer`, `getCodeSixDigitfromSignature`,
`generateFcQRCodeURL`, `generateEcfQRCodeURL`, `getCurrentFormattedDateTime`,
`getXmlFromBodyResponse`, `convertECF32ToRFCE`, `validateXMLCertificate`.

## 5. Python package — `py-dgii-ecf` (import `py_dgii_ecf`)

### 5.1 Toolchain

- Env/build: **uv** (src layout, `hatchling` backend). Lint/format: **ruff**.
- Types: **mypy** (strict). CLI: **typer** (`dgii-ecf` entry point). Test: **pytest**.
- HTTP: **httpx2** (Pydantic continuation of httpx — requests-compatible,
  HTTP/1.1 + HTTP/2; `import httpx2`). Resilience: **tenacity** + **pybreaker**.
  Result: **result**.
- XML: **lxml** (signing + parsing). Crypto: **cryptography** (PKCS#12 + RSA-SHA256).

### 5.2 Dependencies

```
httpx2, tenacity, pybreaker, result, lxml, cryptography, typer
```

> **`requires-python = ">=3.11"`** — httpx2 dropped Python 3.9/3.10. `httpx2`
> exposes the same public API as `httpx` (renamed CLI/logger/UA only):
> `httpx2.Client`, `httpx2.AsyncClient`, `httpx2.HTTPStatusError`,
> `httpx2.ConnectError`, `httpx2.MockTransport`.

dev: `ruff`, `mypy`, `pytest`, `pytest-cov`.

### 5.3 Module map (`src/py_dgii_ecf/`)

Mirror the TypeScript module map 1:1 (environment, types, errors, result,
resilience, http, certificate, signing, transformer, utils, client, cli).

## 6. Release & governance

- **Automatic releases**: [`release-please`](https://github.com/googleapis/release-please)
  in **manifest mode** (independent versions per package). Tags `typescript-v*`,
  `python-v*`. npm publish → `@deuriib/dgii-ecf`; PyPI publish → `dgii-ecf`.
- **Labels, issue templates, PR template, CODEOWNERS, FUNDING.yml, dependabot.yml**.
- **pre-commit** (ruff + prettier + general hooks), **mise.toml** (tool pinning + tasks).
- **SECURITY.md, CODE_OF_CONDUCT.md, CONTRIBUTING.md**.
- Conventional Commits (required for release-please semver + changelog).

---

# Appendix A — Technical reference (reverse-engineered)

> Faithfully ported from `github.com/victors1681/dgii-ecf` (MIT) and the DGII spec.
> Implementations MUST match these exact values/behaviors.

## A.1 Environment + base URLs

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
};
```

Request path = `/{environment}/{endpoint}` (e.g. `/TesteCF/autenticacion/api/Autenticacion/ValidarSemilla`).

## A.2 Endpoints

```ts
SEED = 'Autenticacion/api/Autenticacion/Semilla';
VALIDATE_SEED = 'autenticacion/api/Autenticacion/ValidarSemilla';
SEND_INVOICE = 'recepcion/api/FacturasElectronicas';
SEND_SUMMARY = 'recepcionfc/api/recepcion/ecf'; // baseUrl = BaseUrl.CF
INQUIRY_SUMMARY = 'consultarfce/api/Consultas/Consulta'; // baseUrl = BaseUrl.CF, PROD only
COMMERCIAL_APPROVAL = 'aprobacionComercial/api/AprobacionComercial';
TRACK_RESULT_STATUS = 'consultaresultado/api/Consultas/Estado';
INQUIRY_STATUS = 'consultaestado/api/Consultas/Estado';
ALL_TRACKING_ECF = 'ConsultaTrackIds/api/TrackIds/Consulta';
DIRECTORY = 'consultadirectorio/api/consultas/obtenerdirectorioporrnc';
VOID = 'anulacionrangos/api/operaciones/anularrango';
```

Sender↔Receiver (buyer host) endpoints are prefixed `fe/...` and hit `buyerHost`
directly (no `/env` prefix).

## A.3 Authentication flow

1. `GET {SEED}` → returns a `<SemillaModel>` XML string.
2. Sign the seed with `Signature.signXml(seed, 'SemillaModel')`.
3. `POST {VALIDATE_SEED}` with `multipart/form-data`, field `xml` = the signed seed
   (as a file part), `Accept: application/json` → `AuthToken { token, expira, expedido }`.
4. Store token; send as `Authorization: Bearer <token>` on subsequent requests.

## A.4 Document submission (multipart)

- Field name `xml`, value = signed XML as a **file part** with `fileName`
  (`{RNC}{eNCF}.xml`, e.g. `101672919E3100000001.xml`).
- **Critical**: DGII rejects requests without a correct `Content-Length`.
  With native fetch (undici) / httpx2 (`files={"xml": (fileName, xml_bytes, "application/xml")}`),
  sending a `Blob`/bytes file part computes this automatically — do NOT hand-set
  `Content-Length`.
- `SEND_SUMMARY` uses `BaseUrl.CF`; `INQUIRY_SUMMARY` uses `BaseUrl.CF` (PROD only).

## A.5 XMLDSig signing — exact algorithm (MUST match byte-for-byte)

- Signature algorithm: `http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`
- Canonicalization: `http://www.w3.org/TR/2001/REC-xml-c14n-20010315` (inclusive 1.0)
- Reference: `URI=""`, transform `http://www.w3.org/2000/09/xmldsig#enveloped-signature`
- Digest: SHA-256, base64. `<Signature>` is appended as the **last child** of the root.

**TypeScript (xml-crypto)** — the reference registers a **custom digest** because
xml-crypto's built-in sha256 does not sort the root element's `xmlns` attributes the
way the DGII .NET stack does. The custom digest:

```ts
getHash(xml) {
  const doc = new DOMParser().parseFromString(xml);
  const attrs = doc.childNodes[0].attributes;         // NamedNodeMap
  const sorted = Array.from(attrs).sort((a,b) => a < b ? -1 : a > b ? 1 : 0);
  Object.assign(doc.childNodes[0].attributes, sorted); // reorder xmlns:xsd/xmlns:xsi
  return crypto.createHash('sha256').update(doc.toString(), 'utf8').digest('base64');
}
getAlgorithmName() { return 'http://www.w3.org/2001/04/xmlenc#sha256'; }
```

Register as `sig.HashAlgorithms['http://myDigestAlgorithm'] = Digest` and use
`digestAlgorithm: 'http://myDigestAlgorithm'` on the reference, with
`xpath: //*[local-name(.)='<root>']`, `isEmptyUri: true`, transform enveloped-signature.
Before signing, strip whitespace-only text nodes + comments from the DOM.

**Python (lxml + cryptography)** — no custom digest needed: use
`etree.tostring(node, method="c14n", exclusive=False, with_comments=False)` for
inclusive C14N. Digest the canonicalized root _before_ appending `<Signature>`,
build `SignedInfo` (ds namespace), canonicalize + RSA-PKCS1v15-SHA256 sign it, append.
X509Certificate = base64(DER of the cert).

## A.6 PKCS#12 reading

- TS: `node-forge` — `forge.pkcs12.pkcs12FromAsn1(asn1, false, passphrase)`; pull
  `certBag` (cert → PEM) and `pkcs8ShroudedKeyBag` (key → PEM).
- Python: `cryptography.hazmat.primitives.serialization.pkcs12.load_key_and_certificates`.

## A.7 Utils

- `getCodeSixDigitfromSignature(xml)` → first 6 chars of `<SignatureValue>`.
- `generateFcQRCodeURL(rnc, encf, monto, codigo, env)` → `BaseUrl.CF/{env}/consultatimbrefc?...`.
- `generateEcfQRCodeURL(rnc, rncComprador, encf, monto, fechaEmision, fechaFirma, codigo, env)`
  → `BaseUrl.ECF/{env}/consultatimbre?...` (omit `RncComprador` for E43/E47).
- `getCurrentFormattedDateTime()` → `DD-MM-YYYY HH:mm:ss` in `America/Santo_Domingo`.
- `getXmlFromBodyResponse(body, lastTag='ACECF')` → regex `<\?xml[\s\S]*?</{tag}>`.
- `convertECF32ToRFCE(ecf32Xml)` → `{ xml, securityCode }` (drop empty values; wrap
  lone `ImpuestoAdicional` into a list).

## A.8 Response normalization

- `getCustomerDirectory`: DGII returns either an array or a single object → always
  normalize to an array (or `undefined` when empty).
- Error extraction: DGII returns inconsistent error shapes (bare string,
  `{ mensajes: [...] }`, ProblemDetails, HTML). Normalize to a single message; keep
  `status`, `resource`, raw `data`, and `mensajes` on the error object.

## A.9 Environment caveats

- `getSummaryInvoiceInquiry` / `INQUIRY_SUMMARY`: **PROD only**.
- `SEND_SUMMARY` / summary invoice: `BaseUrl.CF` (factura de consumo < 250K).
- 401 response: keep DGII's body message (it explains _why_ credentials were rejected).
