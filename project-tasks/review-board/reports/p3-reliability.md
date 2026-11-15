# Reliability Review

Scope: `packages/typescript` (`@deuriib/dgii-ecf`, bun/native `fetch`/neverthrow/cockatiel) and
`packages/python` (`py-dgii-ecf`, `httpx2`/`result`/tenacity/pybreaker).

Dimension: **reliability** — correctness, determinism and graceful failure under hostile
conditions: idempotency, retry predicates, timeouts, circuit breaking, error classification,
determinism, concurrency and resource lifecycle. Every behaviour that differs between the two
packages is treated as a finding in its own right, because `AGENTS.md` requires them to be
behaviourally identical.

Baseline taken as given (not re-measured): TS 212 tests / PY 244 tests pass, lints pass, both
XMLDSig gates pass against libxmlsec1 1.3.9.

Method: read-only. No repository file was modified. Every probe below was executed against the
real package source from scratch files under `/tmp/rel/` (bun 1.4.4, CPython 3.12 via `uv run
--frozen`, local `http.server` stand-ins for DGII where a real socket was needed). Each claim is
marked **verified by running** or **verified by reading**, with `file:line` for every finding.

---

## Verdict

**UNRELIABLE**

Not because the design is wrong — the persist-before-transmit protocol, the narrow retry predicate
and the reconciliation state machine are all real, deliberate work — but because **five independent
paths silently duplicate or silently lose a legally binding transmission**, which is precisely the
failure the idempotency layer exists to prevent. All five are proven by running, not inferred:

1. One `send_electronic_document` call with a read timeout put **three copies of the same e-NCF
   into DGII's hands** and then **cleared its own lock**, so the caller's retry sent more
   (F-REL-01).
2. Sending one signed document to buyer A, buyer B and DGII general reception produced
   **one transmission and three `Ok` results** (F-REL-02).
3. Two concurrent callers in Python — or two worker processes in either package — **transmit the
   same document twice** (F-REL-03; independently found as F-TEST-03 in `p2-testing.md`).
4. A document left pending by one SDK is reported as a **delivered `Ok`** by the other, because the
   two packages encode the marker differently (F-REL-04).
5. TypeScript returns **`Ok` for a 200 whose body is an HTML error page** — a lost filing reported
   as a delivered one (F-REL-05).

Each is a silent fiscal-integrity failure: the caller's `Ok` is wrong, nothing is logged as an
error, and the failure surfaces later as an audit finding (a duplicate e-CF) or a missed filing
(an e-CF DGII never received). The blast radius is bounded and the fixes are small and localized —
five changes, listed per finding — which is why the verdict is "unreliable as shipped" rather than
"fundamentally unsound". But it cannot ship as-is.

Secondary, and less alarming: Python loses most of its concurrency (peak in-flight = 1, proven) and
two of the five resilience tunables either do nothing or report a value that is not the one in
force. TypeScript spends up to four attempts where the documentation says three.

---

## Invariant-by-invariant table

The contract being tested is the invariants section of `AGENTS.md`.

| Invariant (`AGENTS.md`) | TypeScript | Python | Holds? |
|---|---|---|---|
| Results, not exceptions; `toDgiiError`/`to_dgii_error` is the single normalizer | Store `get`/`set`/`delete` reject out of the public API (`client.ts:242,252,255,257`); otherwise clean | Store failures **raise** (`client.py:276,287,290,292`); a bad PEM raises `ValueError` from `authenticate()` (`signing.py:62-65` via `client.py:309`); `_load` raises from `validate_document` (`validation.py:63-65`) | **No** — both (F-REL-06, F-REL-17) |
| Money is never floating point | `compareDecimal` on decimal strings (`reception.ts:64-84`); `roundHalfUpToCents` (`transformer.ts:32-46`). But `InquiryStatusResponse.montoTotal/totalITBIS` are `number` (`types.ts:59-60`) | `compare_decimal` (`reception.py:44-65`); `_round_monetary` with `Decimal`/`ROUND_HALF_UP` (`transformer.py:35-43`). But the same two fields are `float` (`types.py:350-351`) | **Mostly** — violated identically on one response model (F-REL-15) |
| Signing is byte-fidelity work; never simplify canonicalization | Untouched by this review; gate green. Verified no clock/randomness enters the signature (`signing.ts:80-140`), so signing one document twice is byte-identical | Same (`signing.py:110-190`) | **Yes** |
| Retry predicate is narrow: network/transport + 408/429/5xx, never other 4xx | 408/429/500/502/503/504 exactly (`errors.ts:15-18`), 400/401/404/422 not retried (proven). But the predicate misses cockatiel's own timeout error and matches any `Error` mentioning "network"/"aborted" | Same status set (`errors.py:12`); 4xx never retried (proven). But `ReadError`/`WriteError` are missed while `CircuitBreakerError` **is** treated as retryable | **4xx half holds; transport half is wrong in both, differently** (F-REL-08, F-REL-12) |
| Idempotency persists `"pending"` before transmit, deletes on failure; query methods are not keyed | Ordering correct (`client.ts:242→252→send→255/257`). In-process coalescing (`client.ts:263-278`) | Ordering correct (`client.py:276→287→send→290/292`). **No coalescing at all** | **Ordering yes; the key and the failure rule are both unsound** (F-REL-01, F-REL-02, F-REL-03, F-REL-04) |
| Query methods are not keyed | Confirmed by reading: no idempotency reference in `statusTrackId`, `inquiryStatus`, `trackStatuses`, directories, status service (`client.ts:360-419,645-796`) | Confirmed (`client.py:455-688`) | **Yes** |
| Reception routing derived from the signed XML (`RFCE`→`recepcionfc`; E32 ≥ RD$250,000 → general; below → reject) | `resolveReceptionRoute` reads root + `TipoeCF` + `MontoTotal` (`reception.ts:101-148`), decimal-string compare | `resolve_reception_route` identical (`reception.py:72-121`) | **Yes** — behaviourally identical, both reject below threshold |
| Strictness on (`strict`, `mypy --strict`, no `Any`) | Not this dimension | Not this dimension | n/a |

---

## Findings

| ID | Severity | Title | Package | Verified-by |
|----|----------|-------|---------|-------------|
| F-REL-01 | BLOCKER | Ambiguous transmit failures are retried and the pending marker is then deleted — the same e-CF reaches DGII 3× in one call and again on every caller retry | both (PY worse) | running |
| F-REL-02 | BLOCKER | The idempotency key omits the destination: buyer-A, buyer-B and DGII submissions of one document collapse into one transmission; the other two return a cached `Ok` | both | running |
| F-REL-03 | BLOCKER | The store protocol is check-then-act with no atomic claim: concurrent or multi-process sends duplicate; Python has no in-process guard at all | both (PY worse) | running |
| F-REL-04 | BLOCKER | The two packages encode the pending marker differently, so a pending document written by one SDK is reported as a delivered `Ok` by the other | both | running |
| F-REL-05 | BLOCKER | TS reports `Ok` for any 2xx whose body it cannot parse (empty, HTML, malformed JSON, `null`, array); `readBody` swallows the cause | TS | running |
| F-REL-06 | HIGH | Idempotency-store failures escape the public API as exceptions; a post-transmit `set` failure loses a successful submission's result | both | running |
| F-REL-07 | HIGH | Python serializes every DGII call behind pybreaker's lock: peak in-flight = 1, no concurrency, head-of-line blocking for the whole client | PY | running |
| F-REL-08 | HIGH | Attempt budgets and the transport half of the predicate diverge: TS makes 4 attempts, PY 3; TS never retries a timeout, PY retries it 3×; PY ignores `ReadError`/`WriteError` | both | running |
| F-REL-09 | HIGH | Python has no total request deadline (per-phase timeouts only) and `ResilienceOptions.timeout_s` is dead — the documented tunable changes nothing | PY | running |
| F-REL-10 | HIGH | A pending marker can become permanently stuck: `reconcileSubmission` refuses to clear a delivered-but-consumed sequence and no public API can clear it | both | running |
| F-REL-11 | MEDIUM | `validateDocument` shells out with `spawnSync` and no timeout — an unbounded synchronous block of the whole process | TS | reading |
| F-REL-12 | MEDIUM | `CIRCUIT_OPEN` and `TIMEOUT` are dead codes: breaker-open, bulkhead rejection and timeouts all surface as `UNKNOWN`; PY additionally replaces the real 5xx cause with pybreaker's message and retries it | both | running |
| F-REL-13 | MEDIUM | `Retry-After` is ignored by both packages and Python's backoff has no jitter | both | reading + running |
| F-REL-14 | MEDIUM | `expira` parsing is host-timezone dependent and the two packages disagree on the same string | both | running |
| F-REL-15 | MEDIUM | Money invariant broken in `InquiryStatusResponse`: `float` in Python, `number` in TypeScript | both | reading |
| F-REL-16 | MEDIUM | Python never closes its `httpx2.Client`; `ECF` has no `close()` and no context manager | PY | running |
| F-REL-17 | MEDIUM | A failed proactive token refresh is silently dropped and the request goes out unauthenticated; Python turns a bad PEM into a raise where TS returns `Err(SIGNING)` | both | running |
| F-REL-18 | LOW | TS expires idempotency entries on the wall clock, Python on `time.monotonic` | both | reading |
| F-REL-19 | LOW | Python re-parses a cached payload, so a cache hit can fail where the original send succeeded; TS caches the decoded value instead | both | running |

---

### F-REL-01 — Ambiguous transmit failures are retried, then the lock is deleted — BLOCKER (both, PY worse)

**Verified by running.**

The retry predicate deliberately includes transport failures (`AGENTS.md`, `resilience.ts:47-66`,
`resilience.py:45-56`), and every submission is a **`POST` of a document DGII may already have
accepted**. The retry happens *inside* `HttpClient`, below the idempotency layer, so the store never
sees it. When retries are exhausted the failure is treated as "not delivered":
`client.ts:257` / `client.py:290` delete the pending marker, which is exactly the signal that says
"we do not know whether DGII got it".

Failing sequence (proven against a local HTTP server that reads the whole body — i.e. DGII *has* the
document — and answers after the client deadline):

1. Caller invokes `send_electronic_document(xml, …)`.
2. `_submit_idempotent` writes `pending` (`client.py:287`) and transmits.
3. Server receives the multipart body. The client hits its read timeout and raises `ReadTimeout`.
4. `is_retryable_error` matches `readtimeout` (`resilience.py:21-32`) → tenacity retries. **Server
   receives copy 2, then copy 3.** Three copies of the same e-NCF, one sequence.
5. Retries exhausted → `Err(HTTP: timed out)` → `client.py:290` **deletes the marker**
   (`store size = 0`).
6. The caller retries the send, exactly as the returned error invites → two more copies. Five
   copies total before DGII's duplicate detector is the only thing standing in the way.

Observed output (`/tmp/rel/py_timeout_dup2.py`, real socket, `timeout_s=0.15`, server sleep 0.4 s):

```
1st send: Err(HTTP: timed out) | DGII received 3 copies | store size = 0
2nd send (caller retries): Err(UNKNOWN) | DGII now holds 5 copies
```

TypeScript has the same protocol and the same delete-on-failure, but *accidentally* retries less
(see F-REL-08), so it duplicates once per caller retry rather than three times per call
(`/tmp/rel/ts_timeout_dup2.ts`: `RECEIVED 1`, `RECEIVED 2` — one copy per call, marker still
deleted):

```
1st send: Err(UNKNOWN: Operation timed out after 150ms)
2nd send: Err(UNKNOWN: Operation timed out after 150ms)   # 2 copies at DGII for 1 document
```

User-visible consequence: **a duplicate e-CF**. Two fiscally valid documents exist for one sale,
with different `trackId`s; the sequence may be consumed twice, and the issuer's and DGII's records
diverge.

The distinction that is missing in both packages is *definite* vs *ambiguous* non-delivery. A
connection refused, a DNS failure or a 4xx means the document certainly did not land, and the lock
may be dropped. A read timeout, a 5xx after the body was written, or a connection reset after the
request was flushed means it may have landed, and the lock must survive until
`reconcileSubmission` resolves it.

Fix (both packages):

1. Classify the failure at the point where it is known, not in the retry predicate. Add
   `maybeDelivered: boolean` to the failure channel of the send (or a `DgiiError` flag), set by
   `HttpClient` from the transport class: `connect`/DNS/refused → `false`; timeout, 5xx, reset
   after write, unreadable 2xx body → `true`.
2. In the submit path, delete the marker only when `maybeDelivered === false`; otherwise leave
   `pending` and return `Err(IDEMPOTENCY)` from then on, pointing at `reconcileSubmission`
   (`client.ts:238-261`, `client.py:264-292`).
3. Never retry a non-idempotent POST on an ambiguous transport failure inside the HTTP layer.
   Either pass a `retry: false` flag from `sendElectronicDocument`/`sendSummary`/
   `sendCommercialApproval`/`voidENCF`, or make the retry predicate refuse when the request has a
   body that is not safe to replay. Retrying is fine for the `GET` consults, which is where the
   transient-failure tolerance actually earns its keep.

Test that proves it (both suites): start a stub server that reads the body, records it, and does not
answer within the client timeout; call `send*` once with a short timeout; assert (a) exactly one
body was received by the server, (b) the returned failure says `maybeDelivered`, (c) the idempotency
store still holds the pending marker, (d) a second call returns `IDEMPOTENCY` without transmitting.

---

### F-REL-02 — The idempotency key omits the destination — BLOCKER (both)

**Verified by running.**

`buildIdempotencyKey` is `RNC:eNCF:SHA-256(xml)` and nothing else (`client.ts:215-229`,
`client.py:223-239`). The destination URL is not part of it, and the same key space is shared by
`sendElectronicDocument` (DGII **and** a buyer host), `sendCommercialApproval` (DGII **and** a buyer
host), `sendSummary` and `voidENCF`.

Failing sequence:

1. `send_electronic_document(xml, f, "https://buyer-a.example")` → transmits to buyer A, caches `Ok`.
2. `send_electronic_document(xml, f, "https://buyer-b.example")` → **no transmission at all**;
   returns buyer A's cached response with `Ok` (`client.ts:242-250`, `client.py:276-285`).
3. `send_electronic_document(xml, f)` (DGII general reception) → **no transmission**; returns `Ok`.

Observed (both packages, identical):

```
TS: buyer A -> true | buyer B -> true | DGII general -> true
    transmissions: 1 buyer-a.example
PY: buyer A -> True | buyer B -> True | DGII general -> True
    transmissions: 1 ['buyer-a.example']
```

User-visible consequence: **a lost filing and a lost delivery, both reported as success.** Buyer B
never receives the commercial document it is legally entitled to, and the e-CF is never filed with
DGII, yet the caller's log says `Ok` three times. The mirror case is just as reachable: an ACECF
delivered peer-to-peer and then to DGII shares a key too (`client.ts:821-858`,
`client.py:704-728`), so the DGII approval never happens.

Also in this family: a B2B `ACECF` rejected with HTTP 400 is converted to `Ok({status:400,
accepted:false})` (`client.ts:839-847`, `client.py:712-717`) and that **rejection is then cached** —
so re-submitting the corrected approval returns the cached rejection without transmitting.

Fix (both packages): include the effective destination in the key —
`${method}:${host}${path}:${rnc}:${ncf}:${sha256}` — where `host`/`path` come from the URL the
request is actually built against, and `method` distinguishes send / approve / void. Keep the
`RNC + eNCF + hash` triple inside it so the fiscal identity stays the dominant part (it is what
`reconcileSubmission` searches by). Do **not** cache a B2B 400 as an accepted entry: it is a
business outcome the caller is expected to answer with an E34, and it must stay retryable.

Test that proves it (both suites): one document, three destinations, assert three transmissions and
three distinct store keys; and a fourth call to destination 1, assert one transmission total
(i.e. the cache still works).

---

### F-REL-03 — The store protocol is check-then-act with no atomic claim — BLOCKER (both, PY worse)

**Verified by running.** (Cross-reference: `p2-testing.md` F-TEST-03 found the same race from the
testing angle.)

`_submit_idempotent` does `get` → (decide) → `set(pending)`. Nothing makes that pair atomic, and
the `IdempotencyStore` Protocol (`http.ts:9-13`, `http.py:21-29`) has no conditional-write
primitive to make it atomic with — `set` unconditionally overwrites.

TypeScript masks the race **inside one process** with `singleFlight` (`client.ts:263-278`). Python
has no equivalent at all (`client.py:276-292`), so two threads are enough:

```
PY, two threads, store with a 50 ms get() (a Redis round-trip, as both docstrings recommend):
  POST count: 2
  0 is_ok= True
  1 is_ok= True          # both callers told the document was delivered
```

TypeScript with the same slow store coalesces correctly (`POST count: 1`), but the guard is
per-instance and in-memory, so **two worker processes sharing the store both transmit** — the exact
deployment the store abstraction exists for ("Provide a Redis/Postgres-backed implementation in
production", `http.ts:14-17`):

```
TS, two ECF instances, one shared store -> posts = 2 | a = true b = true
```

User-visible consequence: **a duplicate e-CF** under any horizontal scale-out, and — in Python —
under any thread pool.

Fix (both packages):

1. Add an atomic claim to the store contract: `setIfAbsent(key, value): Promise<boolean>` /
   `set_if_absent(key, value) -> bool` (`SET NX` in Redis, `INSERT … ON CONFLICT DO NOTHING` in
   Postgres). `InMemoryIdempotencyStore` implements it as a single map check-and-set. Accept the old
   three-method store as a legacy shape only by wrapping it — do not silently fall back to
   check-then-act.
2. Submit becomes: `claim = setIfAbsent(key, PENDING)`; if `!claim` → read the entry and either
   return the cached value or `Err(IDEMPOTENCY)`. Only the claimer transmits.
3. Port `singleFlight` to Python (`client.py`, keyed `dict` + `threading.Lock`) so a single process
   does not depend on store latency.
4. Document that `set` must be durable before it returns (write-through, not fire-and-forget).

Test that proves it: a store whose `get` sleeps (both packages) and a concurrent-send test in each
suite asserting one transmission and two `Ok`; plus a two-instance-plus-shared-store test asserting
one transmission.

---

### F-REL-04 — The two packages encode the pending marker differently — BLOCKER (both)

**Verified by running.**

TypeScript writes `{ pending: true }` and recognises it by `value.pending === true`
(`client.ts:137-146`). Python writes `{"__pending__": True}` and recognises it by
`value.get("__pending__") is True` (`client.py:63-67`). Any store shared between a TypeScript
worker and a Python worker — the documented multi-instance deployment — reads the other side's
marker as a **cached success**:

```
TS reading a Python pending marker -> Ok({"__pending__":true})            | posts = 0
PY reading a TS pending marker     -> Ok(InvoiceResponse(track_id=None, error=None, …)) | posts = 0
```

Failing sequence:

1. Python worker writes `{"__pending__": true}`, transmits, and the process is killed mid-flight
   (the crash the marker exists for).
2. The retry hits the TypeScript worker.
3. TypeScript's `isPendingSubmission` returns `false`, so `submitIdempotent` returns
   `ok({__pending__: true})` — **`Ok`, no transmission**.
4. The caller records the invoice as filed. It may or may not be at DGII, and nobody knows.

User-visible consequence: **a lost filing reported as delivered** (or, in the mirror direction, a
`InvoiceResponse` with every field `None` handed to the caller as a success).

Fix (both packages): one wire format, versioned, defined once and asserted by a shared fixture — for
example `{"__dgii_pending__": 1, "at": <epoch_ms>, "resource": "<endpoint>"}`. Read the legacy
shapes as pending during a deprecation window (`pending === true` **and** `__pending__ === true`).
Put the literal in `examples/fixtures/` (the byte-sensitive tree already shared by both suites) and
have both test suites load it, so the next divergence fails a test instead of losing a filing.

Test that proves it: a table-driven test in both packages that reads the *other* package's literal
from the shared fixture and asserts `Err(IDEMPOTENCY)`.

---

### F-REL-05 — TS reports `Ok` for any 2xx it cannot parse — BLOCKER (TS)

**Verified by running.**

`readBody` (`http.ts:202-213`) gates JSON decoding on the `content-type` header and swallows every
failure:

```ts
} catch {
  return undefined;      // http.ts:210-212
}
```

`parseResponse` then returns `ok(data as T)` for **any** 2xx (`http.ts:221-223`). An unparseable
body is not an error in TypeScript: it is a successful send with a `undefined` payload.

| 200 response | TypeScript | Python |
|---|---|---|
| empty body | `Ok(undefined)` — and re-transmits on every call | `Err(VALIDATION)`, marker kept |
| HTML error page (`text/html`) | `Ok("<html><body>Bad Gateway</body></html>")` | `Err(VALIDATION)`, marker kept |
| malformed JSON `{"trackId":` | `Ok(undefined)` — re-transmits every call | `Err(VALIDATION)`, marker kept |
| JSON `null` | `Ok(null)` | `Err(VALIDATION)` |
| JSON array | `Ok([{…}])` | `Err(VALIDATION)` |
| valid JSON sent as `text/plain` | `Ok("{\"trackId\":\"t1\"…}")` (a **string**, not the model) | `Ok(InvoiceResponse(...))` |

Failing sequence (the dangerous one):

1. DGII (or a WAF, load balancer, or maintenance page in front of it) answers `200` with an HTML
   body — an extremely common failure shape.
2. TS returns `Ok("<html>…")`; the caller stores it as an `InvoiceResponse` and marks the invoice
   filed.
3. DGII never received the document. **A lost filing was reported as delivered**, and nothing was
   logged.
4. Because the cached value is a string, any later identical call returns the same `Ok` **from the
   cache** (`posts=1`) — so even a caller who retries in a loop never re-transmits.

Sub-bug: an empty body caches `undefined`, and `cached !== undefined` (`client.ts:243`) makes the
cache a permanent miss, so **every** call re-transmits the same document forever.

User-visible consequence: a missed tax filing reported as a success; or an unbounded re-send loop
for an empty-body response.

Fix (TS): mirror Python's contract. A submit response must decode to a JSON object or it is a
`VALIDATION` failure that **keeps** the marker (`_cache_submission`, `client.py:241-262` is the
model to copy). Concretely:

1. Decode as JSON when the body looks like JSON, regardless of `content-type` (Python's
   `response.json()` then `response.text` fallback, `http.py:156-162`); never key parsing off the
   header.
2. Record the cause in `DgiiError.cause` instead of `catch {}` — an unreadable body is a diagnostic,
   not nothing.
3. Give `parseResponse` a shape predicate per resource so a 2xx that is not the expected object is
   `unexpectedPayload(...)` (`client.ts:96-102` already exists and is used for GETs only).
4. Do not cache a value that failed to decode.

Test that proves it (both suites, shared table): the six bodies above through
`sendElectronicDocument`, asserting `Err(VALIDATION)` in both packages and a still-pending marker.

---

### F-REL-06 — Store failures escape the public API; a post-transmit failure loses the result — HIGH (both)

**Verified by running.**

No store call is wrapped. The `IdempotencyStore` for both packages is documented to be a Redis or
Postgres client (`http.ts:14-17`, `http.py:22-24`) — i.e. a network dependency that fails.

| Failure | TypeScript | Python |
|---|---|---|
| `get` throws | rejects out of `sendElectronicDocument` | raises out of `send_electronic_document` |
| `set(pending)` throws | rejects, 0 posts | raises, 0 posts |
| `set(result)` throws **after DGII accepted** | rejects, **1 post already delivered** | raises, **1 post already delivered** |
| `delete` throws on the failure path | rejects; the original 400 rejection is **lost**, marker stuck pending | same |

Observed identically in both:

```
1. set fails on PENDING write  : REJECTED/RAISED out of the public API | posts=0
2. set fails on RESULT write   : REJECTED/RAISED out of the public API | posts=1 (DGII accepted)
3. delete fails on error path  : REJECTED/RAISED out of the public API | original 400 LOST
4. get fails                   : REJECTED/RAISED out of the public API | posts=0
```

User-visible consequence: the caller's `Result`-only error handling (the whole point of the
invariant) crashes. Row 2 is the worst: the document **was** filed, the caller is told the call
failed, and its only recovery is to call `reconcileSubmission` — which it has no reason to think of.
Row 3 destroys the rejection reason that tells the issuer whether the sequence is reusable.

Fix (both packages): wrap the three store operations in `try/catch` / `except Exception` and convert
to `DgiiError(code: 'IDEMPOTENCY', cause)` at the boundary; keep the original failure as `cause`
when a `delete` fails on the error path (return the send error, attach the store error). If
`set(pending)` cannot be written, **do not transmit** (the ordering is already right — keep it).
If `set(result)` fails after a successful transmit, return the successful result anyway and surface
the store problem on the error channel's `cause`/a listener — losing a delivered document's
`trackId` is worse than a dirty cache.

Test that proves it: inject a store that raises on each of the four operations and assert the public
method still returns a `Result` (never raises), with the documented code and cause.

---

### F-REL-07 — Python serializes every DGII call behind pybreaker's lock — HIGH (PY)

**Verified by running.**

`pybreaker.CircuitBreaker.call` is `with self._lock: return self.state.call(...)` — it holds an
`RLock` for the **entire duration of the guarded function**. `ResiliencePolicy._breaker_guarded`
passes the whole HTTP call as that function (`resilience.py:87-92`). Every request in the process
therefore runs strictly one at a time.

```
PY: 4 concurrent sends took 1.21s, peak in-flight = 1     (0.3 s each → 0.3 s if parallel)
TS: 4 concurrent sends took  311ms, peak in-flight = 4     (bulkhead 20/40, real concurrency)
```

TypeScript has `bulkhead(20, 40)` with no global lock (`resilience.ts:94`); Python has no bulkhead
and an implicit limit of one.

Failing sequence: a batch of 200 invoices is submitted by a thread pool of 8. With DGII answering in
400 ms, Python needs 80 s where TypeScript needs 10 s. While one request is stuck in a 15 s read
timeout (plus its 3 attempts), **every other thread is blocked** — including `inquiryStatus`,
`getServiceStatus` and `reconcileSubmission`, i.e. the calls an operator uses to diagnose the outage.
Because `_refresh_token` holds `_refresh_lock` while it acquires the breaker lock
(`client.py:206-214`), a token refresh also blocks all traffic for two round-trips.

User-visible consequence: throughput collapse and head-of-line blocking; a single slow DGII endpoint
stops the whole service, and recovery paths are blocked by the same lock.

Fix (PY): stop routing the network call through `CircuitBreaker.call`. Use
`breaker.before_call()`/explicit state handling, or wrap only the *decision*: enter the breaker,
release it, run the request, then report the outcome. The simplest faithful port is to gate on
`breaker.current_state`/`reset_timeout` before the call and to call `breaker._inc_counter()`-free
public entry points (`call_guard` is not public either, so a small adapter that catches, calls
`breaker.call(lambda: None)`-style accounting — or replace pybreaker with a lock-free counter
guarded by a short-lived lock covering only the counter, not the I/O). Add a bulkhead
(`threading.BoundedSemaphore`) to match TypeScript's 20/40 so the two packages degrade the same way.

Test that proves it: a transport stub that sleeps 100 ms, four concurrent calls, assert wall time
< 250 ms and `peak in-flight == 4` in both suites.

---

### F-REL-08 — Attempt budgets and the transport predicate diverge — HIGH (both)

**Verified by running.** Measured through each package's composed policy:

| Failure | TS attempts | PY attempts |
|---|---|---|
| 503 / 500 | **4** | 3 |
| 429 | **4** | 3 |
| 408 | **4** | 3 |
| 400 / 422 | 1 | 1 |
| transport (`TypeError: fetch failed` / `ConnectError`) | 4 | 3 |
| client-side timeout | **1** | 3 |
| `httpx2.ReadError` / `WriteError` | n/a | **1** |
| `pybreaker.CircuitBreakerError` | n/a | **3** |

Three separate divergences:

1. **`maxRetries` is attempts+1 in TypeScript.** `retry(..., { maxAttempts: opts.maxRetries })`
   (`resilience.ts:84`) is compared against the *retry* index inside cockatiel's loop, so
   `maxAttempts: 3` yields **4 executions**. The option is documented as "Maximum number of attempts
   (including the first). Default 3." (`resilience.ts:17-18,33-34`) — it is off by one. Python's
   `stop_after_attempt(3)` is exactly 3. Consequence: **one more transmission** of a
   non-idempotent POST than the documentation promises, per failing call (see F-REL-01).
2. **TypeScript never retries a timeout.** cockatiel throws `TaskCancelledError`, whose `name` is
   left as `'Error'` (`node_modules/cockatiel/dist/errors/TaskCancelledError.js`) with message
   `"Operation timed out after 15000ms"`. `isRetryableError` (`resilience.ts:47-66`) checks
   `name === 'timeouterror'` and `message.includes('timeout')`; `"timed out"` does not contain
   `"timeout"`, and the name is `Error`. So the one transient class the predicate most wants to
   catch is the one it misses — while Python retries the same condition three times (and duplicates
   the document, F-REL-01). The two packages disagree on the most common failure in production.
3. **Python misses `ReadError`/`WriteError`.** `is_retryable_error` matches on exact
   `type(error).__name__` (`resilience.py:45-56`) and the frozenset omits `readerror`, `writeerror`,
   `proxyerror`, `localprotocolerror`. httpx raises these with an empty message, so the message
   fallback cannot save it: a connection reset mid-body — the canonical "maybe delivered" case — is
   classified **permanent and never retried**, while TypeScript retries it four times.

User-visible consequence: 4 vs 3 transmissions on a 5xx; a DGII timeout that is tolerated in Python
and surfaced immediately in TypeScript; a mid-body reset that is tolerated in TypeScript and
surfaced immediately in Python. Same document, same DGII, different number of copies depending on
the language of the worker.

Fix (both packages):

1. TypeScript: `maxAttempts: opts.maxRetries + 1` (or rename the option to `maxAttempts` and
   document 4). Keep the documented meaning in `README`/`architecture.md` in sync.
2. Both: classify on the *class*, not on a string. TypeScript should test
   `(e as { isTaskCancelledError?: boolean }).isTaskCancelledError === true` (cockatiel sets that
   flag) plus `DOMException.name === 'AbortError'`; Python should use `isinstance` against
   `httpx2.TransportError`/`httpx2.TimeoutException` rather than `type().__name__`.
3. Add `httpx2.ReadError`, `WriteError`, `ProxyError` (by `isinstance`, which catches subclasses) to
   the Python predicate.
4. Delete the message-substring heuristics (`message.includes('network')`,
   `"connection" in message`) — they are what makes `CircuitBreakerError` retryable
   (F-REL-12) and they will match a future business message.

Test that proves it (both suites, one shared table): the eleven rows above, asserting the same
attempt count in both packages for every row.

---

### F-REL-09 — Python has no total deadline and `timeout_s` is dead — HIGH (PY)

**Verified by running / reading.**

TypeScript bounds each attempt with cockatiel's aggressive total timeout
(`timeout(opts.timeoutMs, TimeoutStrategy.Aggressive)`, `resilience.ts:93`): 15 s wall clock per
attempt, aborted through `signal` (`http.ts:281-286`).

Python passes a single float to `httpx2.Client(timeout=options.timeout_s)` (`http.py:121`), which
httpx applies **per phase** — connect, read, write, pool each get their own 15 s, and the read timer
restarts on every received chunk. There is no total deadline, so a DGII endpoint that trickles
bytes, or a proxy that accepts and never answers, bounds only the first byte — the call can run for
minutes, and with 3 attempts the ceiling is effectively unbounded.

Worse, the documented tunable does nothing:

```
resilience=ResilienceOptions(timeout_s=1.0) -> http.timeout_s reports 1.0 | actual httpx timeout = 15.0
ECF(timeout_s=3.0)                          -> http.timeout_s reports 15.0 | actual httpx timeout = 3.0
```

`HttpClient.timeout_s` returns `self._policy.options.timeout_s` (`http.py:126-128`), while the
client is built from `HttpClientOptions.timeout_s` (`http.py:92,121`). The two are different
sources: `ResilienceOptions.timeout_s` (`resilience.py:42`) is never read by `ResiliencePolicy`, so
a caller who tunes `resilience=ResilienceOptions(timeout_s=5)` — the API that *does* work in
TypeScript — gets 15 s and a property that lies about it.

User-visible consequence: a hung DGII connection pins a Python thread forever (compounded by
F-REL-07, which makes it pin *every* thread), and an operator who lowers the timeout sees the value
change in `http.timeout_s` while nothing else changes.

Fix (PY):

1. Resolve one value: `timeout_s` on `HttpClientOptions` is the single source; `ResilienceOptions`
   keeps only retry/breaker knobs (or `ResiliencePolicy` honours `options.timeout_s` and
   `HttpClient` reads it from there). Delete the other.
2. Use `httpx2.Timeout(connect=…, read=…, write=…, pool=…)` and enforce a **total** deadline in the
   policy: record `deadline = monotonic() + timeout_s` before the attempt, and pass
   `remaining()` as the read timeout on each retry (or run the attempt in a worker with a join
   timeout). Document connect vs total explicitly in the docstring.
3. Make the defaults match TypeScript numerically (15 s) and say so in `architecture.md`.

Test that proves it: a stub server that accepts and never responds; assert the Python call returns
in ≤ `timeout_s + ε` (not 4 × `timeout_s`), and that `http.timeout_s` equals the timeout in force.

---

### F-REL-10 — A pending marker can become permanently stuck — HIGH (both)

**Verified by running.**

`reconcileSubmission` only clears the marker when DGII answers `No encontrado`
(`cleared = !delivered`, `client.ts:470-471,496-498`, `client.py:532-533,559-560`). When DGII
answers `Rechazado` — the document *is* recorded, the sequence is consumed — `delivered` is true,
`cleared` is false, and **nothing else in the public surface can clear it**.

```
PY: reconcile -> ReconciliationResult(estado='Rechazado', delivered=True, can_reuse_sequence=False, cleared=False)
    re-send   -> Err(IDEMPOTENCY)
    store size: 1 | clear/reset API: []
TS: reconcile -> {"delivered":true,"canReuseSequence":false,"cleared":false}
    re-send   -> Err(IDEMPOTENCY)
    store size: 1
```

Failing sequence:

1. A send is interrupted (crash, timeout, F-REL-01) and leaves the marker pending.
2. The operator calls `reconcileSubmission`. DGII already has the e-NCF and rejected it.
3. `cleared` is `false`. The caller may not retry — it must call `reconcileSubmission` first, which
   keeps returning the same answer.
4. With the default in-memory store the only escape is restarting the process (which loses every
   other marker too). With an external store it is a manual key deletion or a 24 h wait
   (`http.ts:20`, `http.py:17`).
5. After 24 h the TTL silently drops the marker and the document becomes sendable again — so an
   unresolved pending entry turns into a **delayed duplicate** at the TTL boundary.

The same "cannot be undone" applies to a cached B2B rejection (F-REL-02) and a cached success: a
legitimate re-send after an operator fix is impossible for 24 h, with no documented override.

User-visible consequence: an e-NCF that cannot be filed today and whose only resolution is an
out-of-band store edit; or a duplicate once the TTL expires.

Fix (both packages):

1. Add a public, explicit escape hatch — `forgetSubmission(signedXml | key)` / `forget_submission`
   — that deletes the marker and returns what it deleted. Name it so that using it is obviously the
   caller's audited decision.
2. Make "delivered and rejected, sequence consumed" a *terminal but clearable* state:
   `reconcileSubmission` should clear the marker when DGII positively reports a rejection that
   cannot be reversed only if the caller opts in (`{ clearRejected: true }`), because the sequence
   cannot be re-sent anyway — leaving the marker buys nothing.
3. Separate the TTL of a *pending* marker from the TTL of a *result* entry. A pending marker must
   never expire silently; make it a sticky entry that only `reconcileSubmission` or `forget` clears,
   so the failure mode is "stuck until reconciled" rather than "silently re-sendable in 24 h".

Test that proves it: reconcile with a `Rechazado`/`secuenciaUtilizada: true` payload, then assert
`cleared` is `false`, `forget` clears it, and an expired pending marker does **not** become
transmittable.

---

### F-REL-11 — `validateDocument` shells out with no timeout — MEDIUM (TS)

**Verified by reading.**

`spawnSync(bin, ['--noout', '--schema', …, '-'], { input, encoding, maxBuffer })`
(`validation.ts:139-143`) has no `timeout` option. Two consequences when `validateBeforeSend` is
enabled:

1. A hung `xmllint` (unreachable schema on NFS, a pathological XSD, a stuck child) blocks
   **forever** — cockatiel's 15 s timeout cannot fire because it never gets the event loop back.
2. `spawnSync` blocks the whole process while it runs, so every concurrent send and every query
   stalls behind a pure validation step.

Python validates in-process (`etree.XMLSchema`, `validation.py:107-127`) with no such problem — but
its `_load` is `@cache`d and unguarded, so a missing/corrupt schema raises `OSError`/
`XMLSchemaParseError` straight out of `validate_document` (and therefore out of
`send_electronic_document`) instead of returning `Err`, and a single cached `XMLSchema` shared
across threads exposes one shared `schema.error_log`.

User-visible consequence: TS — a hung process needing a restart; PY — an exception on a packaging
error, and interleaved violation logs under concurrency.

Fix: TS — add `timeout: <configured>` (and `killSignal`) to `spawnSync`, or move to
`execFile` with a promise + `AbortController` so the timeout policy remains live; report the timeout
as `DgiiError(code: 'VALIDATION' / 'TIMEOUT')`. PY — wrap `_load` and the validate call in
`try/except (OSError, etree.XMLSchemaError)` returning `Err(VALIDATION)`, and read violations from a
per-call `etree.XMLSchema`/an `error_log` copy (or guard the cache with a lock).

Test that proves it: a fake binary that sleeps past the budget (TS already has the fake-binary
harness) asserting `Err` within the timeout; a missing schema file (PY) asserting `Err`, never a
raise.

---

### F-REL-12 — `CIRCUIT_OPEN` and `TIMEOUT` are dead codes — MEDIUM (both)

**Verified by running.**

Both packages declare `CIRCUIT_OPEN` and `TIMEOUT` in the error-code enum (`errors.ts:3-13`,
`errors.py:34-46`), and neither is ever assigned anywhere in `src` (grep: the only constructed
non-`HTTP` code is `IDEMPOTENCY`). Every one of these surfaces as `UNKNOWN`:

```
TS after the breaker opens : Err(UNKNOWN: "Execution prevented because the circuit breaker is open")
TS bulkhead saturated      : Err(UNKNOWN: "Bulkhead capacity exceeded (0/1 execution slots, …)")
TS client timeout          : Err(UNKNOWN: "Operation timed out after 150ms")
PY client timeout          : Err(HTTP: "timed out")        ← different code for the same event
PY after the breaker opens : Err(UNKNOWN: "DGII request failed: Timeout not elapsed yet, circuit breaker still open")
```

Three sub-problems:

1. **No caller can distinguish "back off" from "the request is wrong".** `retryable` is `false` for
   all of them (`errors.ts:221`, `errors.py:189-191`), so a caller's own scheduler cannot tell a
   timeout (worth retrying later) from a rejection (never worth retrying).
2. **Python replaces the real cause when the breaker trips.** `CircuitClosedState.on_failure` raises
   a **new** `CircuitBreakerError("Failures threshold reached, circuit breaker opened")` when
   `throw_new_error_on_trip` is true (pybreaker's default), so the 503 and its `mensaje` are gone:
   `attempt2: code=UNKNOWN msg='DGII request failed: Failures threshold reached, circuit breaker
   opene'`. cockatiel preserves the original error through `returnOrThrow`, so TypeScript keeps the
   503 shape — a divergence.
3. **Python retries the breaker-open error.** Its message contains `"Timeout not elapsed yet"`, and
   `is_retryable_error` matches `"timeout" in message` (`resilience.py:53-56`) → 3 attempts against
   an open circuit on every call, each burning its 10/20 ms backoff. Harmless in cost, wrong in
   classification, and it proves the substring heuristic is unsafe.

Also observed: the breaker is **shared by every endpoint** (one `HttpClient` per `ECF`), so a 503
storm on `recepcion` also blocks `consultaestado` — i.e. `reconcileSubmission`, the only path that
can clear a pending marker (F-REL-10), is blocked by the same outage that made it necessary. With
default settings the window is 30 s, so this is a delay, not a lockout (neither breaker blocks
permanently: cockatiel half-opens after `halfOpenAfter` = 30 s with exactly one trial, pybreaker
after `reset_timeout` = 30 s).

User-visible consequence: an operator cannot tell a timeout from a rejection from an outage without
parsing English strings; the original DGII message is lost on the Python path.

Fix (both packages): set the code where the failure is known — `TIMEOUT` from the timeout policy /
`TimeoutException`, `CIRCUIT_OPEN` from `BrokenCircuitError` / `CircuitBreakerError` (and
`BULKHEAD`/`OVERLOAD` for the bulkhead), and set `retryable` accordingly. Python: pass the caught
exception to `CircuitClosedState` instead of letting pybreaker raise a new one
(`CircuitBreaker(throw_new_error_on_trip=False)`) and keep the original as `cause`; delete the
message-substring branch of `is_retryable_error` so a breaker-open can never be retried. Consider a
per-resource breaker so an outage on one endpoint does not block the diagnostic consults.

Test that proves it: drive each of the five rows above and assert the specific `DgiiErrorCode` in
both packages, plus "the original `mensaje` survives as `message` or `cause`".

---

### F-REL-13 — `Retry-After` ignored; Python backoff unjittered — MEDIUM (both)

**Verified by reading + running.**

`grep -rn "retry-after" packages/*/src` returns nothing: neither package reads the header, and via
`DgiiError` the response headers are not retained, so no caller can honour it either. A `429`
therefore waits TypeScript's decorrelated-jitter exponential backoff starting at 100 ms
(`resilience.ts:83-86`; cockatiel's default generator is `decorrelatedJitterGenerator`, so there
*is* jitter) and Python's fully deterministic `wait_exponential(multiplier=0.01, min=0.01, max=1.0)`
→ 10 ms, 20 ms (`resilience.py:71`). Both are far shorter than any `Retry-After` DGII would send.

User-visible consequence: during DGII rate limiting, every SDK instance retries within 10–200 ms;
Python's fleet retries **in lockstep**, amplifying the overload it is supposed to survive.

Fix (both): carry `retryAfterMs` (parsed from `Retry-After` seconds or HTTP-date) on `DgiiError`,
and make the backoff `max(backoff, retryAfterMs)`; add full jitter to Python
(`wait_random_exponential` or `wait_exponential_jitter`), and align the base (10 ms vs 100 ms is a
10× divergence in retry pressure for no documented reason).

Test that proves it: a 429 with `Retry-After: 2` and a fake clock, asserting the second attempt is
not earlier than 2 s.

---

### F-REL-14 — `expira` parsing is timezone-dependent and the packages disagree — MEDIUM (both)

**Verified by running.** Both parse DGII's `expira` into an instant to decide a proactive refresh
(`client.ts:152-158` via `Date.parse`; `client.py:74-81` via
`datetime.fromisoformat(...).timestamp()`), and both read it in the host's timezone:

| `expira` | TypeScript (`Date.parse`) | Python (`fromisoformat`) |
|---|---|---|
| `2026-11-12T12:01:56` (naive) | 16:01:56Z — *local* | 16:01:56Z — *local* (agree, both TZ-dependent) |
| `2026-11-12` (date only) | **00:00:00Z — UTC** | **04:00:00Z — local** (disagree by 4 h) |
| `12-11-2026 12:01:56` (DGII's own DD-MM-YYYY) | **2026-12-11** — parsed as MM-DD, one month late | `None` (agree never to refresh) |
| `20261112T120156` | `undefined` | 16:01:56 local (disagree) |
| `.1234567Z` | truncates to ms | keeps µs (agree) |

User-visible consequence: the token's usable lifetime depends on where the worker runs. A naive
`expira` that DGII emits in Santo Domingo local time is over-trusted by 4 h on a UTC host, so the
token is used past expiry → `401` → an extra seed+token round-trip per request until
re-authentication lands (which does recover, via `onUnauthorized`). A `DD-MM-YYYY` string in
TypeScript produces an expiry up to a month in the future.

Fix (both): parse with an explicit zone — if the string carries no offset, interpret it in
`America/Santo_Domingo` (the SDK already hard-codes that zone for fiscal dates,
`utils.ts:65-93`, `utils.py:16,72-81`), never in the host's zone; refuse `DD-MM-YYYY` explicitly
rather than letting `Date.parse` guess; and on a parse failure fall back to "refresh on the first
401" with a *logged* warning instead of silence. Share one table of `expira` shapes as a fixture
used by both suites.

Test that proves it: the five rows above, run with `TZ=UTC` and `TZ=America/Santo_Domingo`, asserting
the same instant in both packages.

---

### F-REL-15 — Money invariant broken in `InquiryStatusResponse` — MEDIUM (both)

**Verified by reading.**

`AGENTS.md`: "Money is never floating point. TS keeps amounts as `string`, Python as `Decimal`".
`compareDecimal`/`compare_decimal` and `roundHalfUpToCents`/`_round_monetary` do honour it
(`reception.ts:64-84`, `transformer.ts:32-46`, `reception.py:44-65`, `transformer.py:35-43` — and I
verified the two rounding implementations agree on the DGII cases, including `2.675→2.68`,
`999.999→1000.00`, `-2.675→-2.68`). But the response model violates it on both sides:
`montoTotal?: number` / `totalITBIS?: number` (`types.ts:59-60`) and `monto_total: float | None` /
`total_itbis: float | None` (`types.py:350-351`), parsed through `_as_float`
(`types.py:180-190,369-374`).

User-visible consequence: a reconciliation that compares DGII's reported `montoTotal` with the local
`Decimal("100000.01")`/`"100000.01"` can report a spurious mismatch (`100000.01` is not representable
in binary floating point), which on the payment side is a wrong-amount alert; and the Python/TS
values can differ in the last bit for the same JSON.

Fix (both): `montoTotal?: string` / `monto_total: Decimal | None` (string-serialised internally),
parsed with the same decimal-string validator used by `compareDecimal`. Keep `_as_float` only for
non-fiscal counters.

Test that proves it: parse a body with `"montoTotal": 100000.01` and assert an exact round-trip of
the digits in both packages.

---

### F-REL-16 — Python never closes its `httpx2.Client` — MEDIUM (PY)

**Verified by running / reading.**

`ECF.__init__` builds an `httpx2.Client` when the caller does not supply one
(`http.py:121` via `client.py:179-189`) and stores it privately. There is no `close()`, no
`__enter__`/`__exit__`, and no exported handle:

```
ECF has close(): False | context manager: False | underlying httpx client closed? False
```

A caller that creates an `ECF` per request (a natural pattern in a serverless handler or a test
suite) leaks one connection pool — and its sockets — per instance until GC. Neither `httpx.Client`
nor the SDK releases them deterministically. In TypeScript there is nothing to release per instance
(`fetch` uses the global dispatcher), so this is a Python-only asymmetry.

Fix (PY): add `ECF.close()` plus `__enter__`/`__exit__`, closing only a client the SDK created (track
ownership), and document the requirement. Optionally `__del__` with a `ResourceWarning`.

Test that proves it: `with ECF(...) as ecf: …` then assert `ecf._http._client.is_closed is True`.

---

### F-REL-17 — Refresh failures are swallowed; Python raises on a bad PEM — MEDIUM (both)

**Verified by running / reading.**

`beforeRequest` discards the refresh result in both packages:
`beforeRequest: async () => { await this.ensureToken(); }` (`client.ts:208-210`) throws away the
`Err`, and `_ensure_token` returns `None` (`client.py:191-202`). A failed refresh therefore does not
fail the call — the request goes out **without** a bearer token, gets a `401`, and only then does
`onUnauthorized` re-authenticate (`http.ts:246-265`, `http.py:206-221`). The caller sees a `401`-shaped
failure (or, if the second authenticate also fails, a bare `Err(AUTH)`), and the original
authentication failure — the seed error, the signing error, the DGII `mensaje` — is gone.

Separately, Python turns one class of credential error into an exception where TypeScript returns a
`Result`:

```
PY: RAISED out of authenticate(): ValueError -> Unable to load PEM file…
TS: returned: Err(SIGNING)
```

because `Signature.__init__` parses eagerly and raises (`signing.py:62-65`, called from
`client.py:309`), whereas the TS constructor only stores the strings and `signXml` catches into
`Err` (`signing.ts:74-140`).

User-visible consequence: an operator debugging a `401` cannot see that the token refresh never
happened, and a Python caller with a bad PEM crashes out of its `Result`-only error handling — after
the pending marker was written, so the marker is left pending too (`client.py:287` runs before
`send()` reaches `before_request`).

Fix (both): make `beforeRequest` propagate its `Result` and fail the request with the refresh's own
error; keep the token-refresh failure as `cause`. Python: use `Signature.try_from_p12`-style
`try/except` around the `Signature(...)` construction in `authenticate` and return
`Err(code: 'CERTIFICATE')`, or make the Python constructor lazy like TypeScript's.

Test that proves it: a refresh that fails with a specific seed error, asserted to reach the caller as
that error (not a 401); and a bad PEM asserted to be `Err(CERTIFICATE)` in both packages.

---

### F-REL-18 — TS expires idempotency entries on the wall clock — LOW (both)

**Verified by reading.**

`InMemoryIdempotencyStore` uses `Date.now` by default (`http.ts:26,57`) while Python uses
`time.monotonic` (`http.py:44`). A backward wall-clock step (NTP correction, a container resuming)
keeps a pending marker alive longer than 24 h in TypeScript and can therefore block legitimate
traffic; a forward step expires it early and re-opens a duplicate window. Monotonic is the correct
choice for a TTL.

Fix: TypeScript uses a monotonic source (`performance.now()` + an epoch base, or `process.hrtime`),
keeping `now` injectable for tests.

Test that proves it: inject a clock that jumps backwards and assert the entry does not gain lifetime.

---

### F-REL-19 — Python re-parses a cached payload — LOW (both)

**Verified by running.**

On a cache hit, TypeScript returns the value it stored (`ok(cached)`, `client.ts:249`) — the already
decoded response. Python re-runs the model parser over the raw dict
(`return _parse_one(model, cached)`, `client.py:285`) and stores the **raw** payload
(`client.py:261`). So with an external store, a payload that was readable when stored can fail a
second, independent parse on the hit, and the caller sees `Err(VALIDATION)` for a submission that
already succeeded — with the marker present, so it also cannot retry. (This is the mechanism behind
the F-REL-04 cross-read: `{"pending": true}` parses cleanly into an all-`None` `InvoiceResponse`.)

Fix (both): store the validated, serialised model and return it verbatim on a hit; if the cached
payload does not parse, return `Err(IDEMPOTENCY)` naming the entry, never `Ok` with a half-read
model.

Test that proves it: cache a payload with an unexpected shape and assert `Err(IDEMPOTENCY)` in both
packages.

---

## Failure-path matrix

Legend: ✅ correct · ⚠️ works but wrong classification/shape · ❌ wrong outcome (duplicate or lost
document). "Correct expectation" is the behaviour a legally binding transmitter needs.

| Failure mode | TypeScript | Python | Correct? |
|---|---|---|---|
| DNS failure / connection refused (nothing sent) | 4 attempts, `Err(UNKNOWN)`, marker deleted | 3 attempts (`ConnectError`), `Err(HTTP)`, marker deleted | ⚠️ retry is useless but harmless; marker delete is right |
| Read timeout after body written | **1 attempt**, `Err(UNKNOWN)`, **marker deleted**, caller retry re-sends | **3 attempts**, `Err(HTTP)`, **marker deleted**, caller retry re-sends | ❌ duplicate (F-REL-01) |
| Connection reset mid-body | 4 attempts (`TypeError`), marker deleted | **1 attempt** (`ReadError` not retryable), marker deleted | ❌ divergence + duplicate (F-REL-08) |
| TLS handshake failure | covered by the 15 s total timeout; `Err(UNKNOWN)` | covered by httpx connect timeout; `Err(HTTP)` | ⚠️ no `TIMEOUT`/`TLS` code (F-REL-12) |
| 5xx on the POST | 4 attempts (docs say 3) | 3 attempts | ❌ one extra transmission in TS (F-REL-08) |
| 429 with `Retry-After` | jittered 100/200/400 ms, header ignored | 10/20 ms, header ignored, no jitter | ⚠️ hammering (F-REL-13) |
| 429 without `Retry-After` | same as above | same as above | ⚠️ (F-REL-13) |
| 400 / 422 rejection | 1 attempt, `Err(HTTP)`, marker deleted → retry allowed | 1 attempt, `Err(HTTP)`, marker deleted → retry allowed | ✅ |
| 401 | 1 attempt, re-auth, **replays the POST once**, then `Err(AUTH)` | same | ✅ (a 401 did not accept the document) |
| 200 with an unparseable body | **`Ok(undefined)` / `Ok("<html>…")`**, marker cached | `Err(VALIDATION)`, marker kept | ❌ TS: lost filing reported as delivered (F-REL-05) |
| 200 with a JSON body but a `text/plain` header | `Ok("<json string>")` | `Ok(model)` | ❌ divergence (F-REL-05) |
| 204 / empty body on a query | `Ok(undefined)`; listing callers coalesce to `[]` | `Err(VALIDATION)` for models, `Ok([])` for listings | ⚠️ divergence |
| Breaker open | `Err(UNKNOWN)` immediately, not retried | `Err(UNKNOWN)`, **retried 3×** against the open breaker | ⚠️ (F-REL-12) |
| Bulkhead saturated (TS only) | `Err(UNKNOWN)` after 20 in flight + 40 queued | no bulkhead; unbounded threads, all serialized | ❌ divergence (F-REL-07) |
| Store `get` fails | **promise rejection** out of the public API | **exception** out of the public API | ❌ (F-REL-06) |
| Store `set(pending)` fails | rejects; nothing sent | raises; nothing sent | ❌ exception shape only (F-REL-06) |
| Store `set(result)` fails after DGII accepted | rejects; document delivered, result lost | raises; same | ❌ (F-REL-06) |
| Store `delete` fails on the error path | rejects; **original rejection lost**; marker stuck | same | ❌ (F-REL-06, F-REL-10) |
| Crash between persist and transmit | marker pending; next send → `Err(IDEMPOTENCY)`; reconcile resolves | same | ✅ (the protocol's one clearly working path) |
| Second send, same RNC+eNCF, different XML (re-signed) | different key → **transmits again** | same | ⚠️ by design; the key cannot see a re-signed duplicate |
| Same document, different destination | **cached `Ok`, no transmission** | same | ❌ lost delivery (F-REL-02) |
| Two concurrent sends, one process | coalesced → 1 transmission | **2 transmissions** | ❌ (F-REL-03) |
| Two worker processes, shared store | **2 transmissions** | 2 transmissions | ❌ (F-REL-03) |
| Pending marker written by the other SDK | `Ok({__pending__:true})`, no transmission | `Ok(InvoiceResponse(all None))`, no transmission | ❌ (F-REL-04) |
| Bad PEM at authenticate | `Err(SIGNING)` | **raises `ValueError`** | ❌ (F-REL-17) |
| Token refresh fails | swallowed; request sent unauthenticated → 401 → retry auth | same | ⚠️ cause lost (F-REL-17) |
| `xmllint` missing (TS) | `Err(VALIDATION)` naming `DGII_XMLLINT_BIN` | n/a | ✅ |
| `xmllint` hangs (TS) | **blocks the process forever** | n/a (in-process lxml) | ❌ (F-REL-11) |
| Schema file missing (PY) | n/a | `OSError` **raised** out of `validate_document` | ❌ (F-REL-11) |
| Caller never closes the client | nothing to close | pool + sockets leak until GC | ⚠️ (F-REL-16) |

---

## Coverage

**Checked and verified by running**

- Retry attempt counts for 503/500/429/408/400/422/transport/timeout/`ReadError`/breaker-open through
  each package's composed policy.
- End-to-end duplicate transmission on a read timeout, against a real local HTTP server that reads
  the whole body (both packages), including the marker state afterwards.
- Multipart body replay across retries: byte-identical payload on all 3 attempts in **both**
  packages (`xml-sha=b0405a51890b` every time) — no stream-consumption corruption, because a
  `Blob`-backed `FormData` (`http.ts:317-329`) and a fresh `bytes`-backed file tuple
  (`http.py:285-295`) are both re-readable. **This is the one thing in the brief that came back
  clean.**
- Concurrency: peak in-flight and wall time for 4 parallel sends (TS 4 / 311 ms, PY 1 / 1.21 s);
  two-thread duplicate in Python; two-instance duplicate in TypeScript on a shared store.
- Breaker: trip after 5 consecutive failures, behaviour after opening, what the caller sees,
  attempt counts while open (both).
- Body-handling matrix: empty / HTML / malformed JSON / `null` / array / `text/plain` JSON, and the
  marker state after each, in both packages.
- Store failure injection: `get`/`set(pending)`/`set(result)`/`delete` throwing, in both packages.
- Cross-SDK pending-marker read in both directions.
- Destination-key collision: buyer A → buyer B → DGII on one document (both).
- Stuck-marker sequence: `reconcileSubmission` against `Rechazado` + `secuenciaUtilizada: true`, then
  a re-send (both); plus an enumeration of the public surface for a clear/forget method (none).
- Timeout configuration: reported vs actual httpx timeout for both `timeout_s` and
  `ResilienceOptions.timeout_s`.
- Date determinism: `getCurrentFormattedDateTime`/`_date` at midnight, 00:30, 23:59:59, leap-day
  boundary, under `LC_ALL=de_DE/ar_SA/C`; `hourCycle` resolves to `h23` in bun and node (no
  `24:00:00` bug). **Both packages agree exactly, and are locale-independent — no finding.**
- `expira` parsing across 9 shapes, with the host at UTC−4.
- Money rounding: `roundHalfUpToCents` vs `_round_monetary` on `2.675`, `2.665`, `999.999`,
  `-2.675`, `0.005`, `12.3`, `1.0e3` — identical results, so the two implementations agree.
- Signing determinism: no clock or randomness enters `signXml`/`sign_xml`, so two signings of the
  same document are byte-identical and the idempotency key is stable.
- Every citation in this report was re-read at the stated line.

**Checked by reading only**

- `spawnSync` timeout absence and its event-loop consequences (F-REL-11) — not proven by hanging the
  process on purpose.
- pybreaker's internal `RLock` placement and `throw_new_error_on_trip` behaviour (read from the
  installed 1.x source, then corroborated by the observed trip messages).
- `Retry-After` absence (grep over `packages/*/src`) and cockatiel's `decorrelatedJitterGenerator`
  default (vendor source).
- Money typing in the two response models (F-REL-15).
- Wall-clock vs monotonic TTL (F-REL-18).

**Not checked / out of scope**

- Live DGII behaviour: whether DGII itself de-duplicates a repeated e-NCF (the integration suite is
  opt-in and needs real credentials). If it does, F-REL-01/03 degrade from "duplicate document" to
  "consumed sequence + a rejection to reconcile" — still an audit event, still wrong.
- TLS/certificate chain validation against DGII's servers (security dimension).
- The XMLDSig byte-fidelity gate (taken as given; both green).
- Regex backtracking on adversarial XML in `_xml.ts`/`_xml.py` — the patterns look linear and the
  tag set is a closed vocabulary, but I did not fuzz them.
- `xml-js` vs `lxml` transformer equivalence beyond the money-rounding cases.
- Whether `lxml`'s `XMLSchema.validate` is thread-safe (suspected not, for `error_log`); listed as a
  follow-up rather than a finding, since I did not reproduce interleaved violations.
- Long-run behaviour of `inFlight`/`PATTERN_CACHE`/`_load` caches under sustained load.

---

## Needs follow-up

1. **Decide the retry policy for non-idempotent submits, explicitly.** Today both packages retry a
   `POST` that DGII may have accepted, and `AGENTS.md` documents retrying transport failures without
   carving out submissions. This is a contract decision, not just a code fix: either submissions are
   never retried below the store (my recommendation — the store *is* the retry mechanism, via
   `reconcileSubmission`), or the store must be consulted between attempts. Whoever owns
   `architecture.md` and `dgii-ecf-setup.md` needs to pick one and update both.
2. **Make the store contract atomic and shared.** `setIfAbsent` plus one versioned pending-marker
   literal, pinned by a shared fixture. This closes F-REL-03 and F-REL-04 together, and it is the
   only way a multi-instance deployment is ever safe.
3. **Decide what "delivered" means for an unparseable 2xx.** Python says `Err(VALIDATION)` and keeps
   the lock; TypeScript says `Ok`. Pick the Python semantics, and pin the six-body table as a shared
   fixture so the two packages cannot drift again.
4. **Give the caller a legal way out of a stuck or wrong marker** (`forgetSubmission`), and separate
   the pending TTL from the result TTL (F-REL-10).
5. **Give the two packages one failure-classification vocabulary** — `TIMEOUT`, `CIRCUIT_OPEN`,
   `OVERLOAD` assigned where the failure is known, `maybeDelivered` on the submit failure channel,
   and `retryAfterMs` retained. That single change closes most of F-REL-08, F-REL-12 and F-REL-13.
6. **Python needs its concurrency back** before it is used for batch filing: a lock-free breaker
   guard and a bulkhead matching TypeScript's 20/40 (F-REL-07). Worth confirming whether pybreaker's
   lock is a hard constraint of the library or something the wrapper can avoid.
7. **Confirm the `expira` wire format with DGII** (offset present? `DD-MM-YYYY`?) before changing the
   parser; the fix in F-REL-14 should encode DGII's actual answer, not a guess.
8. **Cross-check with the other review dimensions**: `p2-testing.md` F-TEST-03 already records the
   Python duplicate race from the test-coverage angle, and F-TEST-09 (XXE divergence) touches the
   same `validateBeforeSend` path as F-REL-11. Whoever consolidates should merge these rather than
   count them twice.
