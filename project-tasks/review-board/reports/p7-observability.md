# Observability Review

**Dimension:** P7 — observability (telemetry, diagnosability, cross-language parity of signals)
**Scope:** `packages/typescript` (`@deuriib/dgii-ecf`) and `packages/python` (`py-dgii-ecf`)
**Mode:** read-only audit. No repo file was modified. Scratch scripts ran from `/tmp` against the
working trees.
**Baseline:** taken as given — TS 212 passed / 3 skipped, PY 244 passed / 3 skipped, all lints green.
Nothing in this report disputes the baseline; the gaps below are green tests over absent signals.

---

## Verdict

**BLACK BOX** — with a structured error object as the only window into the SDK.

Justification, in order of weight:

1. **The SDK emits nothing.** Neither package contains a single log statement, counter, timer or
   span. Verified mechanically: a walk of every module in `py_dgii_ecf` for `import logging` /
   `logger.` / `logging.` returns `NONE`, and `grep` for `console.` / `log.` across
   `packages/typescript/src` matches only doc-comment prose (`signing.ts:111`,
   `types/signing.py:6,47,168`).
2. **No seam reaches the client.** The one hook pair that exists —
   `HttpClientOptions.beforeRequest` / `onUnauthorized` (`http.ts:104-106`, `http.py:94-96`) — is
   consumed internally by `ECF` and hardwired to token refresh (`client.ts:208-211`,
   `client.py:179-180`). `EcfOptions` (`client.ts:48-78`) and `ECF.__init__` (`client.py:150-181`)
   expose no field through which a caller can observe anything. There is no instrumentation point.
3. **There is no correlation handle.** No request id, transmission id or trackId is minted, returned
   or attached to an error. The natural correlation key exists —
   `RNC:eNCF:sha256(signedXml)` — but is `private` in the published `.d.ts`
   (`dist/index.d.ts:651`, `client.ts:215`) and `_private` in Python (`client.py:218`). A host can
   only reach it by casting (`(ecf as any).buildIdempotencyKey(...)`) or by re-deriving it.
4. **The two packages cannot be observed the same way.** TypeScript attaches `resource`, `method`
   and `baseURL` to every wire failure (`http.ts:228-236`); Python attaches none of the three
   (`http.py:172-178`). An operator who moves from one SDK to the other loses the answer to "which
   endpoint failed".

What keeps this from being a total void is the error object, which in TypeScript is genuinely good:
`code`, `status`, `statusText`, `resource`, `method`, `baseURL`, `data`, `mensajes`, `retryable`
(`errors.ts:197-211`). That is a real signal — returned to the caller, structured, and stable. It
answers *what* failed. It cannot answer *what happened*: attempts, retries, latency, breaker
transitions, duplicate suppression, or which of two identical submissions this one was.

Net: **4 of the 7 three-a.m. questions are unanswerable from telemetry alone in both packages.**
Two more are answerable only in TypeScript. One is unanswerable in both by construction.

---

## Signal inventory

### Legend

- ✅ present and reachable from `ECF`
- ⚠️ present but weakened (incomplete, unreachable, or asymmetric)
- ❌ absent

| # | Signal | TS | PY | What an operator learns from it |
|---|--------|----|----|----------------------------------|
| 1 | Log statements (any level) | ❌ | ❌ | Nothing. There is no log output to search. |
| 2 | Metrics / counters / histograms | ❌ | ❌ | Nothing. No rate, no error ratio, no latency. |
| 3 | Traces / spans | ❌ | ❌ | Nothing. No causal chain across seed → sign → send. |
| 4 | Hook for host instrumentation | ❌ | ❌ | `HttpClient` has `beforeRequest`/`onUnauthorized` (`http.ts:104-106`, `http.py:94-96`) but `ECF` occupies both slots for token refresh (`client.ts:208-211`, `client.py:179-180`). Nothing reaches the host. |
| 5 | `DgiiError.code` (10 values) | ✅ | ✅ | Failure *class*. Parity is exact (`errors.ts:4-14`, `errors.py:33-44`) — but see F-OBS-03: only 8 of 10 are ever emitted. |
| 6 | `DgiiError.status` / `statusText` | ✅ | ✅ | The HTTP status of a DGII reply. Absent on transport failure in both (`tsx` run: `status=undefined`; `python` run: `status=None`). |
| 7 | `DgiiError.resource` | ✅ | ❌ | *Which endpoint failed.* TS threads it from every call site (`client.ts:96,413,515,522,536,582,598,652,685,714,740,760,794,836,856,875`); Python's `HttpClient.request` has no `resource` parameter at all (`http.py:183-193`), so the field is structurally unreachable. Verified: PY `resource=None` on both a 500 and a transport error. |
| 8 | `DgiiError.method` / `baseURL` | ✅ | ❌ | HTTP verb and DGII host. Set in TS (`http.ts:233-234`), never set in PY. TS drops `baseURL` again on serialization (F-OBS-09). |
| 9 | `DgiiError.data` (raw DGII body) | ✅ | ✅ | DGII's verbatim reply — the best `(g)` answer. Unbounded (F-OBS-14). |
| 10 | `DgiiError.mensajes` (structured) | ⚠️ | ⚠️ | DGII's `{codigo, valor}` pairs. **Never populated on the HTTP path in either package** (`http.ts:228-236`, `http.py:172-178` omit it). TS recovers it in `toDgiiError` (`errors.ts:290`); PY never does (`errors.py:198-231`). Empty in practice. |
| 11 | `DgiiError.retryable` | ✅ | ✅ | Whether the SDK considered the failure transient. Correct and useful — but it says nothing about what actually happened (F-OBS-04). |
| 12 | Retry events (attempt n of m) | ❌ | ❌ | Nothing. cockatiel exposes `retry.onRetry` (`resilience.ts:88`) but the policy never leaves `HttpClient` (`http.ts:139`). tenacity's `Retry` is held privately (`resilience.py:70`) and never read. |
| 13 | Breaker state / transitions | ⚠️ | ❌ | TS: `createResiliencePolicies()` is exported with a live `circuitBreaker.state` and `onBreak`/`onHalfOpen`/`onReset` (`resilience.ts:88-105`) — but `EcfOptions` has no `policies` field (`client.ts:48-78`), so a host cannot reach it from an `ECF`. PY: `self._breaker` is private (`resilience.py:63`) with no accessor. Neither records *when* the breaker opened. |
| 14 | Per-attempt latency | ❌ | ❌ | Nothing. No wall-clock call in either HTTP layer — only `signing.ts:162` and the idempotency store clock (`http.py:44`) use time. |
| 15 | Attempt index on the emitted error | ❌ | ❌ | Nothing. Attempt 1 of 3 and attempt 3 of 3 are the same object. |
| 16 | Idempotency store (host-owned) | ⚠️ | ⚠️ | The one genuine seam: the host may inject `idempotencyStore` (`client.ts:210-211`) / `idempotency_store` (`client.py:167-169`) and therefore *see the key* `RNC:eNCF:sha256`. But the stored value is `{pending:true}` or DGII's raw body — no timestamp, no attempt count, no outcome. |
| 17 | Idempotency outcome (hit / miss / joined) | ❌ | ❌ | All three collapse into one indistinguishable `Ok` (`client.ts:242-262`, `client.py:277-290`). Verified: a cached replay returns the identical `Ok` value with no marker. |
| 18 | Token expiry | ❌ | ❌ | `tokenExpiresAt` / `_token_expires_at` are private (`client.ts:176`, `client.py:174`). A host cannot know the credential is about to lapse. |
| 19 | Certificate expiry | ⚠️ | ⚠️ | `P12Reader.getCertificateInfo` / `get_certificate_info` publish `validTo`/`valid_to` (`certificate.ts:114-141`, `certificate.py:116-172`) and `validateXMLCertificate` exists (`signing.ts:151`, `signing.py:204`) — but `ECF` calls neither (`grep` returns `NONE` for both clients). Nothing warns before an expired cert reaches DGII. |
| 20 | Validation violations (path + message) | ✅ | ✅ | Both put `SchemaViolation[]` on `error.data` (`client.ts:568`, `client.py:398-403`). Good, structured, bounded. |
| 21 | Reception routing decision | ⚠️ | ⚠️ | `resolveReceptionRoute` / `resolve_reception_route` returns the route to the caller (`reception.ts`, `reception.py`) but `sendDocument` discards it — an operator cannot tell which DGII endpoint a document was routed to without re-deriving it. |
| 22 | Reconcile chain (which reads ran) | ❌ | ❌ | `ReconciliationResult` is `{inquiry, delivered, canReuseSequence, cleared}` (`reconciliation.ts:8-26`, `reconciliation.py:21-39`). The 1/2/3-read decision at `client.ts:486` / `client.py:548` is not reported. |
| 23 | CLI failure output | ❌ (n/a) | ⚠️ | `cli.py` prints `f"error: {result.unwrap_err()}"` — `__str__` returns `message` only (`errors.py:194-195`), so `code`, `status`, `resource`, `mensajes` and `retryable` are discarded (F-OBS-11). |
| 24 | CLI token output | ❌ (n/a) | ❌ | `cli.py:95` prints the bearer token in plaintext (F-OBS-05). |

**Parity summary.** Ten of these 24 signal rows are materially asymmetric (`#7`, `#8`, `#10`, `#13`,
`#16`, `#17`, `#22`, `#23`, `#24`, and the retry-event detail in `#12`). Every asymmetry is a signal
the host loses when it switches language, which is the parity contract `AGENTS.md` states as a
hard requirement ("any behavioural change lands in **both** packages").

---

## 3 a.m. questions

### (a) Which document failed, by RNC + e-NCF + trackId?

**Not answerable in either package.**

- **RNC + e-NCF:** never attached to any error. The client extracts them only inside
  `buildIdempotencyKey` (`client.ts:215-231`, `client.py:218-236`) and throws the result away except
  as a store key. `reconcileSubmission` extracts them too (`client.ts:441-448`, `client.py:509-517`),
  but the `reconcileSubmission` failure path at `client.ts:449-455` returns a `VALIDATION` error with
  **no RNC and no e-NCF in it** — the one place the SDK has the identifiers in hand, it drops them.
- **trackId:** DGII returns it on a successful send (`types.ts:76`, `types.py:397`), so a *successful*
  transmission correlates. A *failed* one has no trackId by definition, and the
  `PENDING_SUBMISSION_MESSAGE` error (`reconciliation.ts:6-7`, `reconciliation.py:14-17`) names
  neither the document nor the key, so the operator cannot even find which submission is stuck.
- The idempotency key carries all three facts but is not exposed (F-OBS-06).

Evidence: `tsx` probe of a 500 on `postMultipart` returns
`{"resource":"https://example.test/x","method":"POST","data":{…}}` — no RNC, no e-NCF, no hash.
Python probe of the same returns `{'resource': None, 'method': None, 'base_url': None}`.

### (b) Did it fail before transmission, at the transport, at DGII validation, or at signature verification?

**Answerable in both, but only partially, and asymmetrically after the fact.**

| Stage | Discriminator | TS | PY |
|---|---|---|---|
| Before transmission (routing / B2B / schema) | `code: 'VALIDATION'` / `'INVALID_XML'` | ✅ `client.ts:568,625,782` | ✅ `client.py:396,449,589` |
| Signature | `code: 'SIGNING'` | ✅ `signing.ts:127` | ✅ `signing.py:140` |
| Certificate load | `code: 'CERTIFICATE'` | ✅ `certificate.ts:66,136` | ✅ `certificate.py:61,111` |
| Transport | `code: 'HTTP'`, `status: undefined` | ⚠️ indistinguishable from a 5xx except by `status` | ⚠️ `status=None`, `resource=None` — indistinguishable from anything |
| DGII validation (4xx reject) | `code: 'HTTP'`, `status: 4xx` | ✅ `http.ts:229-230` | ✅ `http.py:171-176` |
| Auth | `code: 'AUTH'`, `status: 401` | ✅ `http.ts:229` | ✅ `http.py:171` |
| Breaker / timeout | — | ❌ `UNKNOWN` (F-OBS-03) | ❌ `UNKNOWN` (F-OBS-03) |

The `TIMEOUT` and `CIRCUIT_OPEN` codes exist precisely to close the last row and are never assigned.
So "did it fail at the transport or because the breaker was open" is **not** answerable — and the
operator cannot tell "DGII rejected this document" from "we never asked DGII".

### (c) How many attempts, and what was each attempt's outcome and latency?

**Not answerable in either package.**

- No attempt counter is emitted, incremented, or exposed. cockatiel retries internally
  (`resilience.ts:83-95`) and tenacity retries internally (`resilience.py:68-74`); the composed
  policy is invoked once per logical request (`http.ts:280`, `http.py:246`).
- No latency is measured anywhere (`grep` for `performance.now|duration|elapsed|latency` across both
  `src` trees: zero hits in the HTTP layer).
- The final error is the *last* attempt's error, so the caller cannot see that attempts 1 and 2
  returned 502 before attempt 3 returned 500.

Verified: with `maxRetries: 1` / `max_retries=1`, five logical calls against a 500 yielded
`fetch calls: 2` (TS) and `handler calls: 2` (PY) while the returned error reported nothing about
either attempt.

### (d) Was the request retried or re-sent, and can I prove no duplicate was delivered?

**Not answerable in either package.**

Three distinct outcomes are collapsed into one `Ok`:

- a fresh send,
- a cache hit on the idempotency store (`client.ts:242-249`, `client.py:277-284`),
- a join onto an in-flight identical send (TS only — `singleFlight`, `client.ts:263-280`; Python has
  no equivalent, so the same input from two threads can race the pending-marker write at
  `client.py:287`).

Verified: `submitIdempotent` returns `ok(cached)` (`client.ts:249`) — byte-identical to a fresh
success, with no flag, no event, and no header. The one artefact that could prove a duplicate
(`documentHash`) is private. On the failure side, the `IDEMPOTENCY` error carries only a message
(`reconciliation.ts:6-7`, `reconciliation.py:14-17`) — not the key, not the document.

The host *can* build a proof by injecting its own idempotency store, since the key is passed to it
(`http.ts:12-16`, `http.py:21-29`) — but only by implementing the store, and even then the store sees
writes with no timestamp or attempt number.

### (e) Is the breaker open, and since when?

**Not answerable in either package.** This one is worse than "absent", because the code claims
otherwise.

`CIRCUIT_OPEN` is declared in both error enums (`errors.ts:10`, `errors.py:43`) and assigned nowhere
(`grep` for `CIRCUIT_OPEN` outside `errors.*`: zero hits). Verified by driving each client to the
breaker threshold:

```
TS  attempt 1: code=UNKNOWN status=undefined retryable=false
    msg="Execution prevented because the circuit breaker is open"
PY  attempt 1: code=UNKNOWN status=None retryable=False
    msg="DGII request failed: Failures threshold reached, circuit breaker opened"
PY  attempt 2: code=UNKNOWN status=None retryable=False
    msg="DGII request failed: Timeout not elapsed yet, circuit breaker still open"
```

So the operator must regex a **third-party English message string**, that string is **different in
each package**, and it **changes within Python** between "threshold reached" and "still open". None of
them carries an open-timestamp, so "since when" is unanswerable even by regex.

Reading the state directly is possible in neither case: PY `ResiliencePolicy` exposes only
`execute` and `options` (probe output), and TS `ECF` cannot be handed a `policies` object
(`client.ts:48-78` has no such field) even though `HttpClientOptions.policies` would accept one
(`http.ts:100`).

### (f) Is the certificate close to expiry?

**Not answerable from the runtime path.** The primitive exists and is correct —
`CertificateInfo.validTo` (`certificate.ts:16`), `CertificateInfo.valid_to`
(`certificate.py:36`), plus `validateXMLCertificate`/`validate_xml_certificate`
(`signing.ts:151-176`, `signing.py:204-227`) — but `ECF` never calls any of it. Verified:
`grep -n "CertificateInfo|validTo|getCertificateInfo" packages/typescript/src/client.ts` → `NONE`;
same for Python.

Consequence: an expired signing certificate is discovered by DGII rejecting a *legally binding tax
document*, not by the SDK refusing to sign. Nothing in either package computes days-remaining or
warns at a threshold.

### (g) For a rejected e-CF, what did DGII actually say, verbatim?

**Answerable in both, with caveats, and not identically.**

- The verbatim body survives in `error.data` in both (`http.ts:235`, `http.py:177`). That is the
  strongest answer available today.
- `error.message` is a *lossy rendering*: whitespace-collapsed, HTML-stripped, joined with `' | '`,
  and truncated to 1000 chars (`errors.ts:35-58,120-218`, `errors.py:19-27,150-157`).
- **`error.mensajes` is always empty on the HTTP path in both packages** — `parseResponse`
  (`http.ts:228-236`) and `_parse` (`http.py:172-178`) never pass it, even though both just decoded
  the body that contains it.
- **Parity gap:** TS recovers `mensajes` (with `codigo`) in `toDgiiError` (`errors.ts:290-292`);
  Python's `to_dgii_error` does not (`errors.py:198-231`). Verified:
  `toDgiiError({mensajes:[{codigo:'05',valor:'Firma no valida'}]}).mensajes` →
  `[ { valor: 'Firma no valida', codigo: '05' } ]`; the equivalent Python call → `None`.

So a Python operator who reads `error.mensajes` (the documented structured field) gets `None` where a
TypeScript operator gets DGII's coded list.

---

## Findings

| ID | Severity | Title | Package | Verified by |
|----|----------|-------|---------|-------------|
| F-OBS-01 | **BLOCKER** | No instrumentation seam is reachable from `ECF` | both | reading + running |
| F-OBS-02 | **BLOCKER** | Python errors carry no endpoint identity (`resource`/`method`/`baseURL`) | PY (parity with TS) | running |
| F-OBS-03 | HIGH | `TIMEOUT` and `CIRCUIT_OPEN` are declared but never emitted; breaker-open surfaces as `UNKNOWN` with a library-specific string | both | running |
| F-OBS-04 | HIGH | No attempt-level record: no index, no per-attempt latency, no per-attempt outcome | both | reading + running |
| F-OBS-05 | HIGH | Bearer token egress: printed to stdout by the CLI and taught by both doc sets | PY CLI + docs (TS docs) | reading |
| F-OBS-06 | HIGH | No correlation id; the natural key is private in both packages | both | reading + running |
| F-OBS-07 | HIGH | Idempotency outcomes are invisible; the stale-pending error is anonymous | both | reading + running |
| F-OBS-08 | HIGH | No certificate-expiry signal before signing | both | reading |
| F-OBS-09 | MEDIUM | TS `toJSON()` drops `baseURL` and `retryable` | TS | running |
| F-OBS-10 | MEDIUM | `mensajes` is never populated on the wire path in either package; PY drops it in `to_dgii_error` | both | running |
| F-OBS-11 | MEDIUM | `str(err)` / `String(err)` yields only `message`; the CLI therefore discards the whole error | both (PY CLI) | running |
| F-OBS-12 | MEDIUM | `ReconciliationResult` reports no record of the reads it performed | both | reading |
| F-OBS-13 | MEDIUM | Retry/breaker events exist in TS only; Python exposes none, and `timeout_s` can report a value nothing enforces | PY | reading + running |
| F-OBS-14 | MEDIUM | `err.data` is uncapped — a DGII HTML error page ships in full on every rejection | both | reading |
| F-OBS-15 | LOW | CLI offers one exit code, no structured output, and dumps the whole signed document on `sign` | PY | reading |
| F-OBS-16 | LOW | `unknown-rnc` / `unknown-ncf` sentinels silently merge distinct documents into one idempotency key | both | reading |
| F-OBS-17 | LOW | No shared field vocabulary is documented, so cross-language dashboards cannot share a query | both | reading |

---

### F-OBS-01 — BLOCKER — No instrumentation seam is reachable from `ECF`

**Package:** both. **Verified by:** reading (`client.ts:48-78,165-201`; `client.py:150-181`) and
running (attribute enumeration of `ECF.prototype` and `HttpClient`; no logging call found by module
walk).

**Unanswered operator question:** all of them. Without a seam there is no telemetry to ask anything
of; the host can only infer from return values, and only for the calls it makes itself.

**What exists and why it does not help.** `HttpClientOptions` carries exactly two callbacks —
`beforeRequest` (`http.ts:104-106`) and `onUnauthorized` (`http.ts:106`) / their Python twins
(`http.py:94-96`). Both slots are claimed by the client during construction:
`beforeRequest: async () => { await this.ensureToken(); }` and
`onUnauthorized: () => this.reauthenticate()` (`client.ts:208-211`); identically at
`client.py:179-180`. `EcfOptions` therefore has no field that could carry a user callback, and a host
that constructs its own `HttpClient` loses `ECF`'s routing, idempotency, token management and
reception logic — i.e. it stops using the SDK.

`EcfOptions` full surface, for the record (`client.ts:48-78`): `token`, `idempotencyStore`,
`resilience`, `timeoutMs`, `fetchImpl`, `tokenRefreshSkewMs`, `now`, `statusApiKey`,
`enforceB2BRules`, `validateBeforeSend`, `xmllintBin`. Not one of them observes anything.

The one *transport-level* seam that does work is host-supplied transport: `fetchImpl`
(`client.ts:78`) and `http_client` (`client.py:159`). A host can wrap `fetch` or pass an
`httpx2.Client` with `event_hooks` and see URL + method + status. That is real and should be
credited — but it sees no document identity, no operation name, no attempt index, no idempotency
outcome, no breaker state, and it re-implements the SDK's own concern in the host.

**What to emit instead.** A single optional callback per client that receives a plain event object
(the full shape is in *Smallest viable seam*). Minimum field set:
`type`, `correlationId`, `operation`, `resource`, `environment`, `rnc`, `encf`, `documentHash`,
`attempt`, `maxAttempts`, `durationMs`, `httpStatus`, `errorCode`, `idempotency`, `timestamp`.

**Fix in both packages.**

- TS: add `onEvent?: (event: EcfEvent) => void` to `EcfOptions` (`client.ts:48-78`); thread it into
  `HttpClient` as a third option alongside `beforeRequest`/`onUnauthorized` (`http.ts:104-106`) rather
  than competing with them; emit from `execute` (`http.ts:267-291`) and `submitIdempotent`
  (`client.ts:238-262`).
- PY: add `on_event: Callable[[EcfEvent], None] | None = None` to `ECF.__init__`
  (`client.py:150-181`); the same threading through `HttpClientOptions` (`http.py:97-112`) and
  `_execute` (`http.py:223-262`).
- Invariants for the callback, non-negotiable: it is optional (`undefined`/`None` → today's exact
  behaviour), it is never `await`ed and never called on a hot path with I/O, an exception raised
  inside it is swallowed (`try/catch` / `contextlib.suppress(Exception)`), and it can never turn an
  `Ok` into a throw or a failure into a success. The "results, not exceptions" contract is untouched:
  the callback observes, it does not participate.

**How to verify.** One test per package: construct `ECF` with an `onEvent`/`on_event` collector
against a mocked transport, run `sendElectronicDocument`, assert the collected sequence is
`transmission.started` → `transmission.succeeded` and that no stdout/stderr was written (capture with
`capsys` in pytest and a `process.stdout.write` spy in vitest). Second test: a callback that raises
must still yield the original `Ok`/`Err`.

---

### F-OBS-02 — BLOCKER — Python errors carry no endpoint identity

**Package:** PY (parity against TS). **Verified by:** running.

**Unanswered operator question:** (b) — "which DGII endpoint failed?" — and, downstream, the
architecture doc's own instruction to "Instrument … `Err` by `resource` in TypeScript"
(`project-docs/architecture.md:1225`), which is impossible in Python.

**Evidence.** `DgiiError` in both packages has `resource`, `method` and `base_url`/`baseURL`
(`errors.ts:200-202`, `errors.py:171-173`). TypeScript populates all three at the only place that
knows them (`http.ts:228-236`). Python's `HttpClient.request` signature has **no `resource`
parameter** at all (`http.py:183-193`), and `_parse` builds the error with `code`, `status`,
`status_text` and `data` only (`http.py:172-178`).

Probe output, mocked 500:

```
TS  {"code":"HTTP","status":500,"resource":"https://example.test/x","method":"POST", …}
PY  {'code': 'HTTP', 'status': 500, 'resource': None, 'method': None, 'base_url': None}
```

Probe output, mocked `ConnectError`:

```
TS  {"code":"UNKNOWN","resource":"SEED","retryable":false}     # resource preserved
PY  {'code': 'HTTP', 'status': None, 'resource': None}
```

The Python client also never passes a `resource`: `_status_request` (`client.py:672-687`) sets none,
while TS's twin sets `resource: \`status:${endpoint}\`` (`client.ts:413`). So even the *shape* of the
log key is asymmetric (`status:services` in TS, nothing in PY).

With no resource and no status, a Python transport failure is diagnosable only by reading
`str(exc)` from the wrapped `cause` — which is not a documented field and is not JSON-serializable
(F-OBS-09 sibling).

**What to emit instead.** `resource` (stable endpoint token, e.g. `SEND_INVOICE`, `SEED`,
`status:SERVICES`), `method`, `base_url` — on every `DgiiError` produced by the HTTP layer, in both
packages, with identical values.

**Fix in both packages.**

- PY: add `resource: str | None = None` to `HttpClient.request` and to `_execute`
  (`http.py:183-193`, `http.py:223`), populate `resource`/`method`/`base_url` in `_parse` (needs the context passed
  down — a small frozen `_RequestContext` mirroring TS's `RequestContext` at `http.ts:124-128`), and
  pass a resource token from every `ECF` call site (`client.py:331,353,411,424,465,479,581,600,611,
  630,682,711,727,736`) exactly as the TS call sites do (`client.ts:515,522,536,582,598,652,685,714,
  740,760,794,836,856,875`, plus `413` for the status host).
- TS: no behaviour change required; only add `environment` alongside `baseURL` (see F-OBS-09) so the
  two field sets match.

**How to verify.** Table-driven test in each package: for every `ECF` public method, force an `Err`
through a mocked transport and assert `error.resource` equals the documented token. Assert the two
packages' token lists are identical (a shared fixture file is the cheapest way). Add a parity test
that serializes one TS error and one PY error into the same JSON shape and diffs the key sets.

---

### F-OBS-03 — HIGH — `TIMEOUT` and `CIRCUIT_OPEN` are declared but never emitted

**Package:** both. **Verified by:** running (breaker driven to open in each package) and reading.

**Unanswered operator question:** (b) — transport vs. breaker vs. DGII — and (e) entirely.

**Evidence.** Both enums declare the codes: `errors.ts:9-10` (`'TIMEOUT'`, `'CIRCUIT_OPEN'`),
`errors.py:42-43`. Neither is assigned anywhere outside the enum: `grep -rn "CIRCUIT_OPEN|'TIMEOUT'"
packages/*/src` returns only the declarations.

Instead, `pybreaker.CircuitBreakerError` falls into the catch-all at `http.py:257-262` →
`code=UNKNOWN`, and cockatiel's `BrokenCircuitError` reaches `toDgiiError` at `http.ts:290` →
default `code='UNKNOWN'` (`errors.ts:213`).

Measured, five logical calls with `breakerThreshold=2` / `breaker_threshold=2`, `maxRetries=1`:

```
TS  attempt 0: code=HTTP    status=500       msg="boom"
TS  attempt 1: code=UNKNOWN status=undefined msg="Execution prevented because the circuit breaker is open"
PY  attempt 0: code=HTTP    status=500       msg='boom'
PY  attempt 1: code=UNKNOWN status=None      msg='DGII request failed: Failures threshold reached, circuit breaker opened'
PY  attempt 2: code=UNKNOWN status=None      msg='DGII request failed: Timeout not elapsed yet, circuit breaker still open'
```

Three problems in one: the code is wrong (`UNKNOWN`), the only discriminator is a third-party English
prose string, and the two packages emit **different** prose for the same condition — so no single
cross-language alert rule exists. Python additionally changes its own prose between the opening
failure and every subsequent one.

No open-timestamp exists anywhere, so "since when" cannot be derived.

**What to emit instead.** `code: 'CIRCUIT_OPEN'` with `resource`, `environment`, `retryable: false`,
and — on the event stream — `breaker.opened` / `breaker.half_open` / `breaker.closed` carrying
`state` and `since` (epoch ms) and `correlationId`. A timeout maps to `code: 'TIMEOUT'` with
`timeoutMs` / `timeout_s` so the operator knows which bound was hit.

**Fix in both packages.**

- TS: in `execute`'s catch (`http.ts:290`), classify before normalizing: if the thrown value is a
  cockatiel `BrokenCircuitError` (`isBrokenCircuitError`), build
  `new DgiiError(msg, { code: 'CIRCUIT_OPEN', resource: ctx.resource, method, baseURL })`; if it is a
  `TaskCancelledError`/timeout, use `code: 'TIMEOUT'`. Subscribe to `policies.circuitBreaker`
  (`resilience.ts:88`) inside `HttpClient` and forward transitions to `onEvent`.
- PY: in `_execute` (`http.py:223-262`), add `except pybreaker.CircuitBreakerError` **before** the
  generic `except Exception` and map it to `DgiiErrorCode.CIRCUIT_OPEN`; catch
  `httpx2.TimeoutException` → `DgiiErrorCode.TIMEOUT`. Expose
  `ResiliencePolicy.breaker_state` (a read-only property returning `self._breaker.current_state` +
  `self._breaker._state_storage.opened_at`, or a listener registered with
  `pybreaker.CircuitBreaker.add_listener`) so the state is readable, then forward it through the
  event seam.
- Both: the code must be assigned **by classification, never by matching a message substring**. The
  prose is the vendor's and will change on upgrade.

**How to verify.** Run the breaker-open probe above in each package as a test and assert
`error.code == 'CIRCUIT_OPEN'` for attempts ≥ 1 while the transport handler was called exactly
`breaker_threshold` times. Assert a `breaker.opened` event with a `since` was observed exactly once.
Add a parity test asserting both packages produce byte-identical `code` values for the same five
scenarios (500, 401, 4xx, breaker-open, timeout).

---

### F-OBS-04 — HIGH — No attempt-level record

**Package:** both. **Verified by:** reading (`resilience.ts:83-95`, `resilience.py:68-74`,
`http.ts:267-291`, `http.py:223-262`) and running (probe showed 2 transport calls per logical call
with zero attempt data on the result).

**Unanswered operator question:** (c) — how many attempts, and what was each attempt's outcome and
latency. Also (b) at the retry level: "was the 500 we finally saw a regression or the third of three
identical 500s?"

**Evidence.** The retry loop is wholly inside a third-party policy. `policies.policy.execute`
(`http.ts:280`) and `self._policy.execute(_do)` (`http.py:246`) hide every intermediate attempt. No
timer is started anywhere in either HTTP layer — `grep` for `performance.now|duration|elapsed|
latency|perf_counter` across both `src` trees finds only `signing.ts:162` (certificate expiry, not
timing) and `http.py:44` (the idempotency store clock).

The composed policy is invoked exactly once per logical request, so the caller receives the *last*
attempt's error with no evidence that earlier attempts existed or what they said. A run of
`maxRetries: 1` produced `fetch calls: 2` and one error object.

**What to emit instead.** Per attempt, on the event stream:
`{ type: 'attempt', correlationId, attempt: 1..n, maxAttempts, durationMs, httpStatus, errorCode,
retryable, willRetry }`. `durationMs` must be measured with a monotonic clock around the single
`fetch`/`client.request` call. The final `DgiiError` must carry `attempts: n` so a returned error is
self-describing without the event stream.

**Fix in both packages.**

- TS: start `const started = performance.now()` inside the policy callback at `http.ts:266`, and stop
  it in a `finally`. Wrap the callback in a local counter increased per invocation; emit
  `attempt` there; stamp `attempts` onto the final `DgiiError` in `execute`'s catch. Subscribe to
  `retryPolicy.onRetry` (`resilience.ts:88`) to emit `willRetry: true` with the backoff delay.
- PY: use `time.perf_counter()` around `self._client.request(...)` at `http.py:220-225` (do not
  reuse the idempotency store's `time.monotonic` default — it is a separate concern); increment a
  counter in the closure; emit per attempt; attach `attempts` to the final `DgiiError`. Register a
  tenacity `before_sleep` callback on the `Retry` object at `resilience.py:68-74` for the retry
  signal.
- Both: `attempts` is an `int`, `durationMs` a `float` rounded to 0.1 — same units, same name.

**How to verify.** Test: transport returns 502, 502, then 200 with `maxRetries=3`. Assert three
`attempt` events with `attempt` 1, 2, 3 and non-null `durationMs`, and `willRetry` true for 1–2,
false for 3. Test 2: transport always 500 → the returned `DgiiError.attempts === 3` in both
packages.

---

### F-OBS-05 — HIGH — Bearer token egress

**Package:** PY CLI plus both doc sets. **Verified by:** reading.

**Unanswered operator question:** not a 3 a.m. question — this is the one that *creates* the 2 a.m.
incident. A DGII bearer token is a live credential for a tax-authority API, and it is being written
to a place that is routinely retained.

**Evidence.**

- `packages/python/src/py_dgii_ecf/cli.py:95` — `typer.echo(f"token: {token.token}")`. This is the
  `authenticate` command; its whole purpose (`cli.py:87` docstring, "print the access token") is to
  emit the credential to stdout. In CI that reaches the build log; on a workstation it reaches
  terminal scrollback and, commonly, `.bash_history` via a piped `tee`; in a container it reaches
  the orchestrator's log aggregation.
- `docs/en/python.md:23` — `print(auth.unwrap().token)`.
- `docs/en/typescript.md:23` — `console.log(auth.value.token);`, mirrored at
  `docs/es/typescript.md:23`. Both are the first code block a new user copies.
- `AuthToken` has no redacted representation: Python is a plain `@dataclass(slots=True)`
  (`types.py:48-53`) so `repr()` prints the secret. Verified:
  `AuthToken(token='SECRET-BEARER-TOKEN', …)`. One `logger.info("auth %s", result.unwrap())` in a
  host application puts the token in the log permanently. TypeScript's `AuthToken` is an `interface`
  (`types.ts:10-14`), so `console.log` has the same problem but requires the host to pass the object
  rather than a string.

Also in scope, though not a leak of an emitted signal: `.p12` passphrases do **not** leak. Both
packages surface only the library's message (`certificate.ts:83-88` `Unable to parse .p12:
${asErrorMessage(error)}`, `certificate.py:99-104` `Unable to parse .p12: {exc}`), and both
`node-forge` and `cryptography` report a wrong passphrase without echoing it. Verified by reading;
no passphrase appears in any construction path.

**What to emit instead.** The CLI must print metadata, not the credential:
`token: <redacted> (30 chars, expires 2026-01-01T00:00:00Z)` and a `--show-token` opt-in flag for the
one legitimate use (piping into a local script). `AuthToken` must have a redacted representation:
Python `__repr__` returning `AuthToken(token='<redacted>', expira=…, expedido=…)`; TypeScript a
`toJSON()`/`[Symbol.for('nodejs.util.inspect.custom')]` returning the redacted shape. Docs must be
corrected in **all three** files, in both locales.

**Fix in both packages.**

- PY: `types.py:48-53` — add `def __repr__(self) -> str` that masks `token`. `cli.py:95` — mask by
  default, add `--show-token` to `authenticate` (`cli.py:82-96`) for explicit opt-in.
- TS: `types.ts:10-14` — add an `AuthToken.toLogString()` or a `toJSON`-style redaction; the type is
  an interface so the redaction must live in a helper the docs use, e.g.
  `redactAuthToken(t)` exported from `index.ts`.
- Docs: `docs/en/python.md:23`, `docs/en/typescript.md:23`, `docs/es/typescript.md:23` (and
  `docs/es/python.md` if it carries the same line) — print `token.expira` and a redacted token.
- Do **not** mask `expira`/`expedido`: expiry is the signal an operator needs.

**How to verify.** `pytest` with `capsys`: run the `authenticate` command against a mocked transport
and assert the captured stdout contains neither the token nor any 20-char substring of it, while
`--show-token` asserts the opposite. TS: a vitest asserting `JSON.stringify(redactAuthToken(t))`
excludes the token. Add a `grep`-based doc test, or a review checklist entry, that no `.md` under
`docs/` contains `.token` inside a `console.log`/`print`.

---

### F-OBS-06 — HIGH — No correlation id; the natural key is private

**Package:** both. **Verified by:** reading and running (`buildIdempotencyKey` appears as `private
buildIdempotencyKey;` at `dist/index.d.ts:651`; attribute enumeration confirms it is callable at
runtime only via a cast).

**Unanswered operator question:** (a) and (d), and the whole of "can the host join its own logs to
the SDK's". Without a shared identifier, the host's `order 8812 → send called` line and the SDK's
`SIGNING` failure cannot be joined except by timestamp adjacency — which is exactly what fails under
load.

**Evidence.** No id is minted, returned, or attached to anything. The document-level identity is
computed and immediately consumed as a cache key: `buildIdempotencyKey` (`client.ts:215-231`) and
`_build_idempotency_key` (`client.py:218-236`) both produce `RNC:eNCF:sha256(signedXml)` and both are
private. `ReconciliationResult` (`reconciliation.ts:8-26`, `reconciliation.py:21-39`) has no id
field. `DgiiError` has no id field. `submitIdempotent` returns the cached payload only
(`client.ts:249`, `client.py:284`).

A host *can* reproduce the key by copying the extraction logic and hashing — meaning every serious
consumer forks the derivation, and a diverging copy silently stops matching when the derivation
changes (the `RncEmisor`/`SECUENCIAeNCFDESDE` fallbacks at `client.ts:217-230` are exactly the kind
of detail that gets copied wrong).

**What to emit instead.** Two identifiers with distinct jobs, both on every event and on every
`DgiiError`:

- `documentHash` — hex SHA-256 of the signed XML. Stable, groups every attempt at the same document.
  Not secret (a hash of content the host already holds).
- `correlationId` — 128-bit random hex, minted once per **transmission** (i.e. per public `ECF` call,
  shared across its internal retries and its reconcile chain). Two different `correlationId`s under
  one `documentHash` is the proof that a duplicate transmission was attempted.

Plus one exported pure function in both packages so the host can compute the same triple *before*
calling:

```ts
export const documentIdentity = (signedXml: string): {
  rnc: string | undefined; encf: string | undefined; documentHash: string;
};
```
```python
def document_identity(signed_xml: str) -> DocumentIdentity: ...  # rnc, encf, document_hash
```

and `buildIdempotencyKey` must be reimplemented in terms of it, so there is exactly one derivation.

**Fix in both packages.** Export `documentIdentity`/`document_identity` from
`client.ts`/`__init__.py` and have `buildIdempotencyKey` (`client.ts:215`) /
`_build_idempotency_key` (`client.py:218`) delegate to it. Mint `correlationId` at the top of every
public `ECF` method and pass it down as a `context` argument to `HttpClient`; attach both ids to
`DgiiError` (`errors.ts:197-211`, `errors.py:157-179`) and to `ReconciliationResult`.

**How to verify.** Test: call `sendElectronicDocument` twice with the same XML. Assert both
`correlationId`s differ, both `documentHash`es are equal, and `documentIdentity(xml).documentHash`
equals the value the idempotency store received. Test: `documentIdentity(xml)` and the store key
agree in **both** packages for the same fixture (this is the parity assertion that matters).

---

### F-OBS-07 — HIGH — Idempotency outcomes are invisible

**Package:** both. **Verified by:** reading (`client.ts:238-262`, `client.py:264-290`) and running.

**Unanswered operator question:** (d) — was this retried or re-sent, and can I prove no duplicate
was delivered.

**Evidence.** `submitIdempotent` has four exits and three of them return an indistinguishable `Ok`:

| Path | Line | Returned |
|---|---|---|
| cache hit on a stored response | `client.ts:249` / `client.py:284` | `ok(cached)` — no marker |
| in-flight join | `client.ts:265-267` (TS only) | the other call's promise |
| fresh send, success | `client.ts:252-256` / `client.py:287-290` | `ok(parsed)` — no marker |
| stale pending marker | `client.ts:244-248` / `client.py:278-283` | `err(IDEMPOTENCY)` |

So the caller cannot distinguish "DGII created this document just now" from "you already did this
yesterday". For a legally binding tax document, that is the distinction that matters.

The stale-pending error is also anonymous: `PENDING_SUBMISSION_MESSAGE` is a fixed string
(`reconciliation.ts:6-7`, `reconciliation.py:14-17`) with `code: 'IDEMPOTENCY'` and nothing else —
no key, no RNC, no e-NCF, no hash (`client.ts:245-247`, `client.py:279-282`). An operator reading it
cannot tell *which* submission is stuck without scanning the store.

Related asymmetry worth flagging for the reliability pipeline: TS coalesces concurrent identical
sends (`singleFlight`, `client.ts:263-280`); Python has no equivalent, so two threads can both read
`None` at `client.py:277` before either writes the marker at `client.py:287`. From an observability
standpoint the consequence is that Python has no `transmission.joined` outcome at all, so the event
vocabulary cannot be identical — see the parity rule in *Smallest viable seam*.

**What to emit instead.** On every submission call, one event:
`{ type: 'idempotency', outcome: 'miss' | 'hit' | 'pending' | 'joined', correlationId,
documentHash, rnc, encf, keyAgeSeconds }` — `hit` must also carry `originallySentAt` derived from
the store if the host's store can report it (optional field). The stale-pending `DgiiError` must
carry `rnc`, `encf`, `documentHash` and `key` so the operator can act on it directly.

**Fix in both packages.** Add an `outcome` local in `submitIdempotent` / `_submit_idempotent` and a
`submit_idempotent(..., context)` signature that carries `rnc`/`encf`/`documentHash` (available from
the new `documentIdentity`, F-OBS-06). Populate `DgiiError` with those three on the pending branch
(`client.ts:245`, `client.py:279`). Give Python a `singleFlight` equivalent so `'joined'` exists in
both — until then, the event schema must document `joined` as TS-only (see the parity rule).

**How to verify.** Test: send once (assert `outcome: 'miss'`), send again with the same XML (assert
`outcome: 'hit'` and that the transport was called exactly once in total). Test: pre-seed the store
with the pending marker and assert the returned error carries `rnc`, `encf` and `documentHash`.
Python-only test: two concurrent threads → assert the transport was called once (this test will fail
today; that is the point of writing it).

---

### F-OBS-08 — HIGH — No certificate-expiry signal before signing

**Package:** both. **Verified by:** reading. `grep -n "CertificateInfo|validTo|getCertificateInfo"
packages/typescript/src/client.ts` → `NONE`; `grep -n "certificate_info|valid_to|get_certificate_info"
packages/python/src/py_dgii_ecf/client.py` → `NONE`.

**Unanswered operator question:** (f) — is the certificate close to expiry? Today the answer arrives
from DGII as a `Rechazado` on a document that has already been transmitted and assigned a sequence.

**Evidence.** The data is available and correct in both packages —
`CertificateInfo.validTo: Date` (`certificate.ts:16`), `CertificateInfo.valid_to: datetime`
(`certificate.py:36`), populated from the real certificate at `certificate.ts:99-112` and
`certificate.py:162-172`. A second, independent checker exists for a *document's embedded* cert:
`validateXMLCertificate` (`signing.ts:151-176`) and `validate_xml_certificate`
(`signing.py:204-227`). `ECF` uses neither. `authenticate` (`client.ts:318-357`, `client.py:294-330`)
is the one moment the SDK holds the certificate and could compare `validTo` against `now` — and it
does not.

An operator can only learn the expiry by calling `P12Reader(...).getCertificateInfo(path)`
themselves in a separate cron job, and nothing in the SDK tells them to.

**What to emit instead.** At construction and at every `authenticate`: an event
`{ type: 'certificate', subject, issuer, validTo, daysRemaining, expiresSoon: boolean }` with
`expiresSoon` true below a documented threshold (30 days is the conventional default), and — at
`authenticate` only, when `daysRemaining <= 0` — a `CERTIFICATE` error *before* the seed round-trip
rather than after DGII rejects a document. Plus `DgiiError.certificateValidTo` on any
`CERTIFICATE`-coded failure.

**Fix in both packages.** Compute `validTo` once in `ECF`'s constructor from
`credentials.cert` (TS: `new crypto.X509Certificate(der)` — the same primitive `signing.ts:161`
already uses; PY: `x509.load_pem_x509_certificate`) and store `certificateValidTo` +
`certificateDaysRemaining`. Emit the event there. Guard `authenticate` (`client.ts:318`,
`client.py:294`) with the expiry check. **Do not** make the guard a hard failure by default — an
expired cert still signs and a host may be mid-migration; emit, and let `validateBeforeSend`-style
opt-in hardening come later.

**How to verify.** Test with an ephemeral self-signed cert generated with `notAfter` = now + 10 days
(both suites already generate in-test certificates, per `AGENTS.md`): assert one `certificate` event
with `daysRemaining ≈ 10` and `expiresSoon: true`, and that no network call was made. Test 2:
`notAfter` in the past → `authenticate` returns `CERTIFICATE` with `certificateValidTo` set and the
seed endpoint was never hit.

---

### F-OBS-09 — MEDIUM — TS `toJSON()` drops `baseURL` and `retryable`

**Package:** TS. **Verified by:** running.

**Unanswered operator question:** (b) at the environment level — "was this production (`eCF`) or
certification (`CerteCF`)?" — which is the first question anyone asks when the answer differs between
environments.

**Evidence.** `DgiiError` carries both fields (`errors.ts:195,199`) and `toJSON()` emits nine keys:
`name, message, code, status, statusText, resource, method, mensajes, data` (`errors.ts:233-245`).
Neither `baseURL` nor `retryable` is among them. Probe:

```
1 toJSON keys      : [ 'name','message','code','status','statusText','resource','method','mensajes','data' ]
1 toJSON.baseURL   : undefined
1 toJSON.retryable : undefined
1 stack has fields : false
```

So `JSON.stringify(error)` — the single most common logging call in a Node service — loses the DGII
host and the retry verdict. `DgiiError` also has no `environment` field at all; the host is only in
`baseURL`, and even that is not always set (`unexpectedPayload` at `client.ts:92-99` sets `resource`
and `method` but not `baseURL`).

**What to emit instead.** `toJSON()` must include `baseURL`, `environment` and `retryable`. Add
`environment: 'TesteCF' | 'CerteCF' | 'eCF' | 'status'` to `DgiiErrorOptions` and populate it
wherever `resource` is populated.

**Fix in both packages.** TS: extend `DgiiErrorOptions` (`errors.ts:20-31`) and `toJSON()`
(`errors.ts:233-245`) with `baseURL`, `environment`, `retryable`. PY: Python has no `toJSON`
equivalent at all — add `to_log_dict()` / `to_dict()` on `DgiiError` (`errors.py:157-195`) returning
the same key set, and `environment` on the constructor. Both: `environment` is a stable enum token,
not the URL.

**How to verify.** Assert `Object.keys(error.toJSON())` in TS equals `set(error.to_log_dict().keys())`
in Python — a single parity test over a shared fixture list. Then assert `'baseURL' in
JSON.stringify(error)`.

---

### F-OBS-10 — MEDIUM — `mensajes` never populated on the wire path; PY drops it in normalization

**Package:** both. **Verified by:** running.

**Unanswered operator question:** (g), for the structured half of DGII's answer — the `codigo`. DGII
codes a rejection numerically/string-wise; the text is for humans and is localized prose that changes
between services (`errors.ts:41-53` vs `errors.py:16-30` handle both because both exist).

**Evidence.** Two independent omissions:

1. **Both packages** decode the body, extract a message from `mensajes`, and then construct the error
   without the structured list. `parseResponse` (`http.ts:228-236`) and `_parse`
   (`http.py:172-178`) both omit `mensajes`. Verified: a 500 with
   `{"mensajes":[{"codigo":"05","valor":"Firma no valida"}]}` yields
   `error.mensajes === undefined` (TS) and `error.mensajes is None` (PY), while `error.message` is
   `'Firma no valida'`.
2. **Python only:** the normalizer drops it even when the input is a dict. TS sets
   `mensajes: isObject(err) ? readMensajes(err.mensajes ?? err.Mensajes) : undefined`
   (`errors.ts:290-292`); `to_dgii_error` (`errors.py:198-231`) has no `mensajes` argument in either
   branch. Verified: `to_dgii_error({"mensajes":[{"codigo":"05","valor":"Firma no valida"}]}).mensajes`
   → `None`, while `toDgiiError(...).mensajes` → `[ { valor: 'Firma no valida', codigo: '05' } ]`.

`codigo` is still recoverable from `error.data` in both packages, so this is a convenience-field
regression, not data loss — but it is the field the docs imply is structured, and it is asymmetric.

**What to emit instead.** `error.mensajes` populated with DGII's `{codigo, valor}` pairs on every
path, in both packages, with `codigo` preserved as the raw `number | string` DGII sent (never
coerced — `Mensaje.codigo` is already typed `int | str` at `types.py:44`).

**Fix in both packages.** TS: pass `mensajes: readMensajes(data.mensajes ?? data.Mensajes)` into the
`DgiiError` at `http.ts:228`. PY: same at `http.py:172` (build a `list[Mensaje]` before constructing),
and add the `mensajes=` argument to both `DgiiError(...)` calls in `to_dgii_error`
(`errors.py:206-217,221-231`), reusing `_parse_mensajes` if it is exported from `types.py`, otherwise
factoring the tuple-to-list read into `errors.py`.

**How to verify.** A shared fixture with three DGII payload shapes (bare string, `{mensajes:[…]}`,
ASP.NET `ModelState`) run through both packages; assert `mensajes` arrays are element-wise equal,
including `codigo`.

---

### F-OBS-11 — MEDIUM — `str(err)` / `String(err)` yields only `message`

**Package:** both, with the damage concentrated in the Python CLI. **Verified by:** running.

**Unanswered operator question:** (b) and (g) *as experienced by an operator at a terminal*. The
information exists and is then thrown away one layer above the SDK.

**Evidence.** `DgiiError.__str__` returns `self.message` (`errors.py:194-195`), so:

```
5 str: boom
PY  {'code': 'HTTP', 'status': 500, 'resource': None, ...}
```

and TypeScript's `String(e)` renders as `DgiiError: DGII request failed with status 500` — the name
and the message, nothing else. Neither inherits a helpful `toString`.

`cli.py` formats every failure through `str()`:

- `cli.py:47` — `typer.echo(f"error: {result.unwrap_err()}", err=True)`
- `cli.py:92` — same, authentication
- `cli.py:111` — same, the `status` command's auth step
- `cli.py:115` — same, the `status` command's query

So the CLI's entire failure output is one prose line: no `code`, no `status`, no `resource`, no
`mensajes`, no `retryable`. An operator cannot tell a 401 from a 500 from a breaker-open except by
reading English.

**What to emit instead.** Keep `str()`/`toString()` returning the message — changing it would break
the "results, not exceptions" ergonomics and every existing log call. Add a separate, explicit
serializer and use it in the CLI:

- TS: `DgiiError.toJSON()` already exists (fixed per F-OBS-09); document it as the logging entry
  point.
- PY: `DgiiError.to_log_dict()` returning the same key set (F-OBS-09).
- CLI: emit `error: <code> <status> <resource>: <message>` on one line, and the full dict with
  `--verbose`.

**Fix in both packages.** PY: add `to_log_dict()`; rewrite the four `cli.py` echo sites to a single
`_report(err, verbose)` helper. TS: no CLI, but document `toJSON()` in
`docs/en/typescript.md` next to the `console.error(error.code, error.message)` example at line 47,
which currently teaches the lossy form.

**How to verify.** `pytest` asserting the `status` command's stderr contains `HTTP`, the status
number, and the resource token for a mocked 500. TS: a vitest asserting
`JSON.parse(JSON.stringify(error)).code === 'HTTP'` (regression guard for F-OBS-09).

---

### F-OBS-12 — MEDIUM — `ReconciliationResult` reports no record of the reads it performed

**Package:** both. **Verified by:** reading.

**Unanswered operator question:** (b) inside `reconcileSubmission` — "did this cost one read or
three, and what did the extra reads say?" This is the same concern `project-docs/architecture.md:1225`
raises ("Instrument reconcile outcomes …, not raw request counts"), and the result type is where it
would have to live.

**Evidence.** `ReconciliationResult` is four fields:
`inquiry`, `delivered`, `canReuseSequence`, `cleared` (`reconciliation.ts:8-26`,
`reconciliation.py:21-39`). The branch that decides `canReuseSequence` makes three silent decisions:

- whether the root element is a general e-CF (`client.ts:456`, `client.py:528`);
- how many followable tracks DGII returned and whether exactly one was usable
  (`client.ts:481-486`, `client.py:542-548`);
- what `consultaresultado` said (`client.ts:488-494`, `client.py:550-555`).

None of these is reported. When `canReuseSequence` is `false`, the five distinct reasons collapsed
into it are documented at length (`reconciliation.ts:16-25`, `reconciliation.py:26-38`) precisely
because a caller cannot tell them apart — but the SDK *did* compute which one applied, and discards
it. `cleared` does not say whether a marker actually existed.

**What to emit instead.** `ReconciliationResult.reads: ReadOutcome[]` where
`ReadOutcome = { resource: string; outcome: 'ok' | 'err'; httpStatus?: number; errorCode?: string }`
in call order, plus `reuseReason: 'not_general_ecf' | 'not_delivered' | 'not_rejected' |
'track_count' | 'flag_false' | 'reusable'` and `markerCleared: boolean` (distinct from `cleared`).

**Fix in both packages.** Thread a small accumulator through `reconcileSubmission`
(`client.ts:438-505`) / `reconcile_submission` (`client.py:490-568`); push one entry per HTTP read
and set `reuseReason` at the existing decision points (`client.ts:458,478-495`,
`client.py:537,542-555`). Emit one `reconcile.completed` event with the same payload.

**How to verify.** Three tests per package, one per documented call count (1, 2, 3 reads —
`architecture.md:1200-1204` tabulates them): assert `reads.length` matches and `reuseReason` is the
expected literal. Assert `reuseReason` is absent from the `1`-read path only when DGII reported
delivery (not just `undefined`).

---

### F-OBS-13 — MEDIUM — Retry/breaker events exist in TS only; Python exposes none, and `timeout_s` can lie

**Package:** PY (parity against TS). **Verified by:** reading and running.

**Unanswered operator question:** (c) and (e) — see F-OBS-03 and F-OBS-04 for the user-facing half;
this finding is about the *asymmetry* that guarantees the two SDKs cannot be monitored with one
dashboard.

**Evidence.**

- TS: `createResiliencePolicies` is exported (`index.ts` re-exports `resilience.js`) and returns
  named policies whose event streams are live: probe output
  `policies keys: [ 'retry', 'circuitBreaker', 'timeout', 'bulkhead', 'policy' ]`,
  `breaker .state: 0`, `retry has onRetry: function`, `breaker onBreak: function`
  (`resilience.ts:88-105`). So a TS consumer can subscribe to `onRetry`, `onBreak`, `onHalfOpen`,
  `onReset` — if it builds its own `HttpClient`.
- PY: `ResiliencePolicy` exposes only `execute` and `options` (probe output), wrapping a private
  `pybreaker.CircuitBreaker` (`resilience.py:63`) and a private tenacity `Retry`
  (`resilience.py:68-74`). No listener registration point, no state accessor.
- PY has no bulkhead and no policy-level timeout object: `ResilienceOptions` carries
  `max_retries`, `breaker_threshold`, `reset_timeout_s`, `timeout_s` (`resilience.py:36-46`); TS
  carries the same plus `retryInitialDelayMs`, `bulkheadLimit`, `bulkheadQueue`
  (`resilience.ts:16-33`). So Python has no concurrency saturation signal at all — the fourth golden
  signal has nothing behind it in either package, but Python has not even a configured limit to
  report.
- `HttpClient.timeout_s` returns `self._policy.options.timeout_s` (`http.py:130-133`) even when the
  host supplied its own `httpx2.Client` (`http.py:127`, `client or httpx2.Client(timeout=...)`) — a
  host client constructed with `timeout=60` makes `timeout_s` report `15.0`, i.e. the property
  describes a bound nothing enforces.

**What to emit instead.** Parity of *observability surface*, not of implementation:
`ResiliencePolicy.breaker_state` (read-only property → `'closed' | 'open' | 'half_open'` + `since`),
a `ResiliencePolicy.add_listener(listener)` (or the event seam from F-OBS-01 with
`breaker.opened`/`breaker.closed`), and `HttpClient.timeout_s` derived from the client actually in
use.

**Fix in both packages.**

- PY: add `breaker_state` and `since` properties to `ResiliencePolicy` (`resilience.py:57-92`),
  reading `self._breaker.current_state` and the state storage's open timestamp; register a
  `pybreaker` listener that forwards to the event seam. Add `bulkhead_limit` / `bulkhead_queue` to
  `ResilienceOptions` for vocabulary parity, even if Python honours them with a semaphore.
- PY: fix `timeout_s` (`http.py:130-133`) to read the effective timeout from `self._client` when one
  was injected, or refuse injection and keep ownership — one of the two, but not a third answer.
- TS: expose `policies` through `EcfOptions` (`client.ts:48-78`) so the already-existing event streams
  are reachable without abandoning `ECF`. This is the smallest change that makes TS's advantage real.

**How to verify.** A shared "surface parity" list (field names + types) asserted by a test in each
package — e.g. a JSON file in `examples/fixtures/` listing the expected observable names, checked in
both suites. Assert `HttpClient(HttpClientOptions(timeout_s=1), client=httpx2.Client(timeout=60)).timeout_s`
does not report `1.0`.

---

### F-OBS-14 — MEDIUM — `err.data` is uncapped

**Package:** both. **Verified by:** reading.

**Unanswered operator question:** none — this is a cost and safety question, not a diagnostic one.
It is what turns a rejection storm into an ingestion bill and a redaction problem.

**Evidence.** DGII has been observed returning ASP.NET/HTML error pages; both packages handle that
case explicitly, which confirms it happens (`errors.ts:41-58` `looksLikeHtml`/`stripHtml`;
`errors.py:60-64`). The *message* is truncated to 1000 chars (`errors.ts:36-38`, `errors.py:27-28`)
— but `data` is not. `data` holds the fully decoded body: a string for non-JSON content
(`http.ts:205-208`, `http.py:159-162`) or the parsed object. A 100 KB HTML error page therefore lands
intact in `error.data`, and the natural host behaviour —

```ts
logger.error({ err }, 'dgii send failed')
```
```python
logger.error("dgii send failed", extra={"err": err.data})
```

— ships 100 KB per rejected document. It is also the field most likely to contain reflected content
from the request (an ASP.NET error page can echo request details).

**What to emit instead.** `data` bounded by a documented cap with an explicit marker, e.g. keep the
first 4 KB and set `dataTruncated: true` + `dataBytes: n`. Or add `dataSummary: { status,
mensajes: [{codigo, valor}] }` as the log-safe field and demote `data` to an opt-in
`includeRawPayload` flag.

**Fix in both packages.** TS: cap in `HttpClient.readBody` (`http.ts:202-215`) or at the
`new DgiiError(...)` site (`http.ts:228-236`) — the latter keeps the full body available to a caller
that wants it and only bounds the error. PY: same at `http.py:172-178`. Both: bounded constant
exported so the two packages agree (`MAX_RAW_DATA = 4096`).

**How to verify.** Test: transport returns a 200 KB HTML page with status 500. Assert
`error.message.length <= 1001`, `String(error.data).length <= ~4100`, and `dataTruncated === true`.

---

### F-OBS-15 — LOW — CLI offers one exit code, no structured output, and dumps the whole document

**Package:** PY. **Verified by:** reading.

**Unanswered operator question:** not a 3 a.m. question so much as "can I automate my own smoke
test?" — a shell script cannot distinguish a credential problem from a DGII outage.

**Evidence.** Every failure is `raise typer.Exit(code=1)` (`cli.py:48,61,71,93,104,112,116`) — one
code for every failure class, so `authenticate || alert` cannot say why. `sign` with no `--output`
writes the entire signed XML to stdout (`cli.py:76-77`), which will land in CI logs (the document
itself is not secret, but it is a full fiscal record with emitter and receiver details). There is no
`--json`, no `--verbose`, and no `--quiet`.

**What to emit instead.** Distinct exit codes (`2` usage, `3` certificate, `4` auth, `5` transport,
`6` DGII rejection, `7` validation) documented in the command help; `--json` emitting
`DgiiError.to_log_dict()` (F-OBS-11); `sign` writing to stdout only when `--output -` is explicit.

**Fix in both packages.** PY only — TypeScript ships no CLI, so record that asymmetry rather than
inventing one. Add a small `_EXIT_CODES` mapping keyed on `DgiiErrorCode` and use it in the four echo
sites. Keep `typer` (already a declared dependency; no new dependency).

**How to verify.** `pytest` invoking each command with a mocked failure and asserting
`result.exit_code` matches the mapping.

---

### F-OBS-16 — LOW — `unknown-rnc` / `unknown-ncf` sentinels silently merge documents

**Package:** both. **Verified by:** reading.

**Unanswered operator question:** (d) — whether two different documents could share an idempotency
slot.

**Evidence.** `client.ts:222` / `client.py:227` fall back to `'unknown-rnc'`, and `client.ts:228` /
`client.py:235` to `'unknown-ncf'`, when the element cannot be read. The distinctness of the key then
rests entirely on `sha256(signedXml)` (`client.ts:231`, `client.py:236`), so it does not actually
collide — but the *log field* an operator would use for grouping reads `unknown-rnc:unknown-ncf`,
merging every such document into one apparent bucket.

**What to emit instead.** Never put a sentinel in a field an operator groups by. Emit `rnc: null` /
`encf: null` and `identityIncomplete: true`, keeping the sentinel only inside the cache key.

**Fix in both packages.** Have `documentIdentity` (F-OBS-06) return `rnc?: string` / `encf?: string`
as `undefined`/`None`, and have the key builder substitute the sentinel locally.

**How to verify.** Test: an XML with no `RNCEmisor` → `documentIdentity(xml).rnc === undefined` while
the store key still contains `unknown-rnc`.

---

### F-OBS-17 — LOW — No shared field vocabulary is documented

**Package:** both. **Verified by:** reading.

**Unanswered operator question:** none directly, but it guarantees that every future parity drift in
telemetry becomes an incident.

**Evidence.** The two packages name the same concepts differently at the serialization boundary
(`statusText`/`status_text`, `baseURL`/`base_url`, `canReuseSequence`/`can_reuse_sequence`,
`sendElectronicDocument`/`send_electronic_document`) which is idiomatic and correct *inside* each
language. But nothing declares which of these names a host should use in a log query, so a Python
operator who writes `resource:SEND_INVOICE` and a TypeScript operator who writes
`resource:"sendElectronicDocument"` are querying different universes. `architecture.md` mentions
`resource` once (`:1225`) without defining its value set.

**What to emit instead.** A documented, language-neutral vocabulary of stable tokens — `operation`,
`resource`, `environment`, `errorCode`, `idempotency`, `breakerState` — with the exact value sets,
published in both doc locales, and asserted by the parity test from F-OBS-02.

**Fix in both packages.** Add the table to `docs/en/` and `docs/es/` (the tree is mirrored and CI
enforces it) and cross-check it in a test over a shared fixture, so a new `resource` token cannot
land in one package only.

**How to verify.** The parity test from F-OBS-02 doubles as this gate.

---

## Smallest viable seam

The design goal is a *seam*, not an implementation. Both packages already hold every field an
operator needs at the moment it matters; the seam is one optional callback that hands them over as a
plain record. No logging framework, no metrics dependency, no new required dependency in either
package.

### The API (identical vocabulary, idiomatic spelling)

```ts
// packages/typescript/src/telemetry.ts  (new, re-exported from index.ts)
export interface EcfEvent {
  readonly type:
    | 'transmission.started'
    | 'transmission.succeeded'
    | 'transmission.failed'
    | 'attempt'
    | 'idempotency'
    | 'reconcile.completed'
    | 'breaker.changed'
    | 'token.changed'
    | 'certificate.checked';
  readonly correlationId: string;        // 128-bit hex, one per public ECF call
  readonly documentHash?: string;        // hex sha256 of the signed XML, when known
  readonly operation: string;            // 'sendElectronicDocument' | 'reconcileSubmission' | ...
  readonly resource?: string;            // 'SEND_INVOICE' | 'SEED' | 'status:SERVICES' | ...
  readonly environment?: string;         // 'TesteCF' | 'CerteCF' | 'eCF' | 'status'
  readonly rnc?: string;                 // EMITTER only — never the buyer's RNC
  readonly encf?: string;
  readonly attempt?: number;
  readonly maxAttempts?: number;
  readonly durationMs?: number;
  readonly httpStatus?: number;
  readonly errorCode?: string;           // the DgiiErrorCode token
  readonly retryable?: boolean;
  readonly idempotency?: 'miss' | 'hit' | 'pending' | 'joined';
  readonly breakerState?: 'closed' | 'open' | 'half_open';
  readonly breakerSince?: number;        // epoch ms
  readonly expiresAt?: string;           // ISO-8601, token or certificate
  readonly timestamp: string;            // ISO-8601 UTC, SDK-supplied
  readonly sdkVersion: string;           // so a dashboard can pin behaviour to a release
}

// EcfOptions gains exactly one field:
//   onEvent?: (event: EcfEvent) => void;

// and one new exported pure function:
export const documentIdentity = (signedXml: string): {
  rnc?: string; encf?: string; documentHash: string;
};
```

```python
# packages/python/src/py_dgii_ecf/telemetry.py  (new, re-exported from __init__.py)
@dataclass(frozen=True, slots=True)
class EcfEvent:
    type: str          # same nine literals as TS
    correlation_id: str
    timestamp: str
    sdk_version: str
    document_hash: str | None = None
    operation: str = ""
    resource: str | None = None
    environment: str | None = None
    rnc: str | None = None
    encf: str | None = None
    attempt: int | None = None
    max_attempts: int | None = None
    duration_ms: float | None = None
    http_status: int | None = None
    error_code: str | None = None
    retryable: bool | None = None
    idempotency: str | None = None      # 'miss' | 'hit' | 'pending' | 'joined'
    breaker_state: str | None = None
    breaker_since: float | None = None
    expires_at: str | None = None

# ECF.__init__ gains exactly one keyword argument:
#   on_event: Callable[[EcfEvent], None] | None = None

def document_identity(signed_xml: str) -> DocumentIdentity: ...
```

The **field set**, the **type literals** and the **token values** are byte-identical across the two
packages; only the case convention differs (`correlationId` / `correlation_id`), which is the same
rule the rest of both public surfaces already follows.

### The parity rule

> Every `EcfEvent.type` literal and every `errorCode` token must exist in **both** packages, with the
> same spelling and the same field set, in the same release.

Concretely: one shared fixture (`examples/fixtures/telemetry-vocabulary.json`) lists the type
literals, the error codes and the resource tokens. Both suites read it and assert their emitted
vocabulary is a superset. If a release cannot fill a field in one package — the only current case is
`idempotency: 'joined'`, which Python cannot produce until it gains single-flight (F-OBS-07) — then
the field must be **present and `None`**, not absent, and the fixture must carry a
`knownPartiallySupported` entry naming the package and the follow-up. Silence is what breaks a
dashboard; `None` never does.

### What it must NOT do

1. **Must not log.** No `console.*`, no `import logging`, no `print`, no `warn`. The callback is the
   only output path; if no callback is supplied the SDK stays exactly as silent as it is today.
2. **Must not carry secrets or documents.** Never: the signed XML, the private key, the certificate
   PEM, the `.p12` passphrase, the bearer token, the `statusApiKey`, DGII's raw response body, or the
   **buyer's** RNC (`documentHash` is a hash and is fine; the emitter's RNC and e-NCF are business
   identifiers the operator must have and are already on the wire).
3. **Must not throw, and must not become part of the control flow.** A callback that raises is
   swallowed and the SDK's `Ok`/`Err` is returned unchanged. The "results, not exceptions" contract
   is inviolable — the callback observes a decision, it never makes one.
4. **Must not be `await`ed or block.** Synchronous callback, no I/O on the hot path, no buffering or
   batching inside the SDK (batching is the host's business).
5. **Must not add a mandatory dependency.** `telemetry.ts` imports nothing; `telemetry.py` imports only
   `dataclasses`/`typing`. No OpenTelemetry, Prometheus, structlog, pino — the host adapts. The
   zero-mandatory-dependency posture is preserved.
6. **Must not be used as a metric label source for per-document values.** `documentHash`, `encf` and
   `correlationId` are for logs and trace attributes only — see cardinality below.
7. **Must not change a return type.** No `Result` variant gains a field because of the seam; the event
   stream is additive and orthogonal.
8. **Must not let a host mutate SDK state** through the event object (frozen dataclass / `readonly`
   interface).

### Cardinality & cost

The seam must be designed so that the obvious misuse — turning every event field into a metric label
— is visibly wrong:

| Field | Safe as a metric label? | Why |
|---|---|---|
| `type`, `operation`, `resource`, `environment`, `errorCode`, `httpStatus`, `attempt`, `maxAttempts`, `idempotency`, `breakerState`, `retryable`, `sdkVersion` | **Yes** | Bounded, finite value sets. A `resource` per endpoint is ~12 values; `errorCode` is 10. |
| `rnc`, `encf`, `documentHash`, `correlationId`, `durationMs` | **No** — logs and span attributes only | `encf` is unique per document and `documentHash`/`correlationId` per transmission. A high-volume issuer emits thousands per hour; as labels these are an unbounded series count and a hard cost event. `durationMs` is a measurement, so it belongs in a histogram, not a label. |

Recommended metric shape (host-side, from the event stream): counters
`dgii_transmissions_total{operation,resource,errorCode,idempotency}` and
`dgii_attempts_total{operation,resource,attempt,errorCode}`, a histogram
`dgii_attempt_duration_seconds{operation,resource}`, and a gauge
`dgii_breaker_state{environment}`. That is the four golden signals with bounded cardinality, derived
without the SDK depending on any of it.

Note also: emitting on `transmission.started/succeeded/failed` is one event trio per *document*, which
is the correct volume — it is the same rate as the business fact being recorded. Per-attempt events
multiply by `maxAttempts` only when retries actually happen.

### Staged cuts (each is independently shippable)

- **Cut 0 (~15 lines/package, no new file):** export `documentIdentity`/`document_identity`; add
  `environment`, `rnc`, `encf`, `documentHash` and `attempts` to `DgiiError`; populate
  `resource`/`method`/`baseURL` in Python (F-OBS-02); assign `CIRCUIT_OPEN`/`TIMEOUT` (F-OBS-03);
  add `to_log_dict()` to Python and fix TS `toJSON()` (F-OBS-09/F-OBS-11). This alone moves four of
  the seven questions from unanswerable to answerable.
- **Cut 1:** `onEvent`/`on_event` with the six transmission/attempt/idempotency event types.
- **Cut 2:** breaker, token and certificate events.

---

## Coverage

### Coverage score for critical paths

Scored against the seven 3 a.m. questions; a path scores the fraction it can answer from SDK telemetry
alone, **without** the host wrapping the transport.

| Critical path | TS | PY | Missing | Blocking findings |
|---|---|---|---|---|
| `authenticate` (seed → sign → validate) | 3/7 | 2/7 | (a) identity, (c) attempts, (e) breaker, (f) cert | 01, 02, 03, 04, 06, 08 |
| `sendElectronicDocument` | 3/7 | 2/7 | (a) identity, (c) attempts, (d) duplicate proof, (e) breaker | 01, 02, 03, 04, 06, 07 |
| `sendSummary` (RFCE) | 3/7 | 2/7 | same as above | same |
| `sendCommercialApproval` / `voidENCF` | 3/7 | 2/7 | same as above | same |
| `reconcileSubmission` | 3/7 | 2/7 | (a), (c), (d), (e) + read chain | 01, 02, 03, 04, 07, 12 |
| Query paths (`statusTrackId`, `inquiryStatus`, `trackStatuses`, directories) | 4/7 | 3/7 | (a), (c), (e) | 01, 02, 03, 04, 06 |
| CLI (`sign`, `authenticate`, `status`) | n/a | 1/7 | everything but (g) | 05, 11, 15 |

**Critical-path coverage: 40% (TS) / 29% (Python)**, where 100% means every question is answerable
from SDK-emitted telemetry. The 29 vs 40 gap is entirely F-OBS-02.

### What I checked

- **Read in full:** `http.ts`, `http.py`, `errors.ts`, `errors.py`, `resilience.ts`, `resilience.py`,
  `cli.py`, `reconciliation.ts`, `reconciliation.py`, `certificate.ts`, `certificate.py`,
  `validation.ts`, `validation.py`, `signing.ts` (error paths + `validateXMLCertificate`),
  `signing.py` (same), `client.ts`, `client.py` (all public methods, idempotency, token
  management, reconcile), `index.ts`, `__init__.py`, `types.ts`/`types.py` (the response models named
  in the questions), `AGENTS.md`, `project-specs/dgii-ecf-setup.md` (§5.2–5.3),
  `project-docs/architecture.md` (§9 reconcile, §10 signing, `:1225` instrumentation note).
- **Read partially:** `transformer.ts`/`transformer.py`, `utils.ts`/`utils.py`, `xml.ts`/`_xml.py`,
  `reception.ts`/`reception.py` — only their error-construction sites, to confirm no document content
  or key material reaches `message`/`data`.
- **Ran:** a Python probe of `DgiiError` field population, `to_dgii_error`, `AuthToken.__repr__`,
  `HttpClient` on both a mocked 500 and a mocked `ConnectError`, breaker-open behaviour, and a module
  walk for logging imports. A TypeScript probe of `toJSON()` key coverage, `toDgiiError` `mensajes`
  recovery, `createResiliencePolicies()` event surface, `ECF.prototype` enumeration, `HttpClient` on a
  mocked 500 and a mocked transport throw, and breaker-open behaviour. Both probes ran from `/tmp`
  against the working trees; no repo file was touched.
- **Also ran:** `grep` for logging, timing, `CIRCUIT_OPEN`/`TIMEOUT` assignment, and certificate
  access in both clients.

### What I did **not** check

- **No real DGII traffic.** Per the run ledger's pen-test scope, `ecf.dgii.gov.do`,
  `fc.dgii.gov.do` and `statusecf.dgii.gov.do` were not contacted. Every HTTP observation above comes
  from mocked transports, so real DGII payload shapes are inferred from the parsing code, not
  observed. A real rejection body may contain fields neither parser expects (see F-OBS-14's
  truncation concern for why that matters).
- **No integration-test run.** `DGII_P12_PATH` / `DGII_P12_PASSWORD` / `DGII_RNC` were not set, so the
  opt-in suites under `test/integration` and `tests/integration` were not executed. Their assertions
  about error shape are therefore unverified.
- **No load or cardinality measurement.** The cost projection above is derived from the event rate
  (one per document) and the value sets, not from a measured issuer volume.
- **No OTel/Prometheus/structlog integration built.** I judged the seam, not an adapter; a working
  adapter is the right follow-up test for the proposal.
- **No review of the `dist/` bundles** beyond confirming which members are `private` in
  `dist/index.d.ts` (used for F-OBS-06).
- **Signing correctness, retry semantics, breaker tuning, XSD behaviour and cryptographic decisions**
  are other pipelines' dimensions and are deliberately out of scope here. Where I touched them (e.g.
  the missing Python single-flight at `client.py:277-287`) it is only as context for a telemetry gap.

---

## Needs follow-up

Hand-offs to other pipelines in this run — each is a real issue I found while auditing signals, but
outside the observability dimension:

1. **P3/P4 (reliability, resilience) — breaker and retry are not per-path.** `architecture.md:1218-1223`
   already records that the breaker and bulkhead are shared between submissions and reconciliation, so
   a `consultatrackids` outage consumes the failure budget submissions need. My breaker probe confirms
   it empirically: after two 500s, *every* subsequent call on that client fails instantly with
   `CIRCUIT_OPEN`, including a `statusTrackId` query. A separate policy for the query path is the
   structural fix and is listed as `F-126-2` in the architecture doc.
2. **P3/P4 — Python has no single-flight** for concurrent identical submissions (`client.py:264-290`
   has no analogue of `client.ts:263-280`). Two threads can both observe `None` at `client.py:277`
   before either writes the pending marker at `client.py:287`, which defeats the "persist before
   transmit" invariant the `AGENTS.md` calls out as load-bearing. Observability cannot compensate for
   it — there is no event to emit for a race that was never detected.
3. **P5 (security) — token egress** (F-OBS-05) is as much a security finding as an observability one:
   three files teach printing a live DGII bearer token, and one ships a command whose purpose is to do
   so. Coordinate the fix so the docs and the CLI change in one commit.
4. **P2 (testing) — the parity test does not exist.** Both suites test their own error shape; neither
   asserts the two packages produce the same field set. That is why F-OBS-02 and F-OBS-10 stayed green.
   The shared-fixture parity test proposed in F-OBS-02/F-OBS-17 is the missing gate.
5. **P1 (DGII domain) — confirm DGII's `codigo` types** so `Mensaje.codigo: int | str` (`types.py:44`)
   is documented as intentional rather than incidental. F-OBS-10 asks for it to be preserved verbatim;
   a domain confirmation that DGII really mixes types would close it.
6. **P10 (fix loop) — Cut 0 first.** The staged seam is ordered so that Cut 0 (no new public callback,
   no new file, ~15 lines per package) converts four of the seven questions from unanswerable to
   answerable. If only one cut ships this cycle, ship Cut 0.
7. **Ledger update needed.** `project-tasks/review-board/ledger.md` lists P7 with owner "Observability
   Reviewer" and validator "Reliability Reviewer", status PENDING, and its findings table is still
   `(triage pending)`. The 17 findings above are the triage input; the ledger's `## Findings` table
   should be populated from the table in this report.

---

## Outcome
Outcome: done — P7 observability audit complete; verdict **BLACK BOX**, 17 findings (2 BLOCKER, 6 HIGH, 6 MEDIUM, 3 LOW), all cited `file:line` and marked verified-by-reading or verified-by-running. Report at `/home/deuriib/projects/dgii-ecf/project-tasks/review-board/reports/p7-observability.md`.
Details: The SDK emits zero telemetry and exposes no seam reachable from `ECF`; 4 of 7 three-a.m. questions are unanswerable in both packages and Python loses endpoint identity entirely (40% TS / 29% PY critical-path coverage). Smallest viable seam proposed as one optional `onEvent`/`on_event` callback plus a public `documentIdentity()` helper — zero new dependencies, no change to the results-not-exceptions contract; "Cut 0" (~15 lines/package) converts 4 of 7 questions without adding the callback.
Files: `project-tasks/review-board/reports/p7-observability.md` — full P7 report (verdict, 24-row signal inventory, 7 questions, 17 findings, seam spec, coverage, follow-ups). No repo file was created or modified beyond this report.
