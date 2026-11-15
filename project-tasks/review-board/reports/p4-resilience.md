# Resilience Review

Resilience reviewer's report for the two DGII e-CF SDKs (`packages/typescript` and `packages/python`).
Scope: **failure-mode containment** — what the SDK does when DGII is degraded, hostile, or slow.
Idempotency ordering and determinism are owned by `p3-reliability.md` and are deliberately not
restated here.

Every finding was produced against a **local stub** (`fetchImpl` / injected `httpx2.Client`); no
traffic was sent to any DGII host. Scratch probes live in `/tmp/p4/` and are quoted inline.

Composition order matters for everything below, so state it once:

- TypeScript — `packages/typescript/src/resilience.ts:96-101`:
  `wrap(retry, circuitBreaker, timeout, bulkhead)` → **retry outermost, bulkhead innermost**.
- Python — `packages/python/src/py_dgii_ecf/resilience.py:80-90`:
  tenacity wraps `pybreaker.CircuitBreaker.call` → **retry outermost, breaker per attempt**, and
  no timeout/bulkhead layer at all.

## Verdict

**Request changes.** The happy-path protection is real and, unusually for a hand-maintained parity
pair, the *numbers* match the docs. Containment is where it breaks down:

1. **No host isolation.** Both SDKs build exactly one resilience policy per client
   (`packages/typescript/src/http.ts:144-151`, `packages/python/src/py_dgii_ecf/http.py:120`) and
   then reuse it for `ecf.dgii.gov.do`, `fc.dgii.gov.do`, `statusecf.dgii.gov.do` **and for
   caller-supplied buyer hosts** (`client.ts:576-582`, `client.py:404`). Five attempts against a
   dead buyer host put the breaker in open state and the healthy DGII host then fails without a
   single packet leaving the process. Verified by running in both packages.
2. **Local saturation is indistinguishable from a DGII outage in TypeScript.** Because `timeout`
   wraps `bulkhead` (`resilience.ts:93-101`), queue time is charged to the per-attempt timeout: 8
   concurrent calls with `bulkheadLimit: 1` produced 7 failures where the request was **never
   sent**, and those phantom timeouts opened the breaker. Verified by running.
3. **Python has no concurrency at all.** `pybreaker` 1.4.1 holds a `threading.RLock` across the
   guarded call, so one shared breaker serialises every outbound request in the process: 5
   concurrent 200 ms calls took 1.04 s with a measured peak of **1** in-flight request. A hung
   host blocks the health and status reads that would tell you it is hung.
4. **The degraded caller contract is not actionable.** `TIMEOUT` and `CIRCUIT_OPEN` are declared in
   `errors.ts:9-10` / `errors.py:42-43` and **never produced**. A breaker trip, a timeout and a
   bulkhead rejection all surface as `UNKNOWN` with `retryable: false`, no `status`, no
   `retryAfter`. The one signal a fallback path needs — "retryable later, not now" — is inverted.

Nothing here is a data-integrity bug, and nothing here breaks "results, not exceptions". But a
single sick buyer host currently takes out the whole client in both packages, which is the exact
blast radius the breaker was added to prevent.

## Fault matrix

Legend: **Contained** = one feature/tenant path degrades; **Degraded** = the call fails but the
client and other paths keep working; **Cascading** = one dependency's failure disables unrelated
dependencies.

| # | Dependency | Injected fault | TypeScript observed | Python observed | Verdict |
| - | ---------- | -------------- | ------------------- | --------------- | ------- |
| 1 | `ecf.dgii.gov.do` | 503 on every call | 4 attempts, jittered gaps 40/190/124 ms (`resilience.ts:83-86`), then `HTTP`/retryable ✓ | 3 attempts, gaps 10/20 ms (`resilience.py:68-73`), then `HTTP`/retryable ✓ | Degraded |
| 2 | `ecf.dgii.gov.do` | hang past per-attempt timeout | **1 attempt**, `UNKNOWN`, `retryable:false` — timeout not retried (F-RES-04) | 3 attempts × 15 s, `HTTP`, retryable | Degraded (TS contract wrong, PY slow) |
| 3 | `ecf.dgii.gov.do` | sustained 5xx (≥5 attempts) | breaker opens on the 2nd logical call, then all paths blocked 30 s | same, but every blocked call also waits on the RLock | Cascading |
| 4 | **buyer Sender↔Receiver host** (caller-supplied) | connection refused / 503 | 5 attempts to the buyer open the shared breaker; `ecf.dgii.gov.do` then returns "circuit breaker is open" with **0 requests sent** | identical (`client.py:179-190`) | **Cascading** |
| 5 | `fc.dgii.gov.do` (RFCE / < 250k e-CF) | hang | shares the breaker and bulkhead with `ecf`; a hung `fc` call occupies 1 of 20 bulkhead slots | shares breaker **and the global lock**: a hung `fc` call blocks everything for up to 45 s | Cascading |
| 6 | `statusecf.dgii.gov.do` (health/status) | 5xx | status reads count toward the same threshold; a broken status service can pre-open the breaker for submissions | same, plus lock contention | Cascading |
| 7 | local saturation | 8 concurrent calls, `bulkheadLimit: 1`, 50 ms timeout | 7 calls "timed out" **while queued**, 2 requests reached the stub, breaker opened → next call rejected | no bulkhead: 50 threads → 2.55 s, all serialized, no shedding, no rejection | Cascading (TS) / Degraded-but-unbounded (PY) |
| 8 | `ecf.dgii.gov.do` | 429 with `Retry-After: 60` | header ignored; retries in ~40 ms | header ignored; retries in 10 ms | Degraded, escalating (F-RES-08) |
| 9 | DNS / TLS | `getaddrinfo` failure, cert error | `TypeError: fetch failed` → retried ✓ | `ConnectError` → retried ✓ | Contained |
| 10 | auth (`Autenticacion/Semilla`) | 401 once | single replay via `onUnauthorized` (`http.ts:253-263`), no retry loop ✓ | single replay via `_on_unauthorized` (`http.py:196-214`) ✓ | Contained |

## Retry/breaker parameters

| Parameter | Docs (`docs/en/guides/resilience.md`) | TypeScript actual | Python actual | Parity |
| --------- | ------------------------------------ | ----------------- | ------------- | ------ |
| Retry predicate | network, 408/429/5xx (`:13-16`, `:23-28`) | `isRetryableError` `resilience.ts:47-66` | `is_retryable_error` `resilience.py:45-56` | ✓ (over-broad, F-RES-13) |
| Attempts for the nominal default | "3 (4 in TypeScript)" (`:25`) | **4** (`maxAttempts: maxRetries` at `resilience.ts:84`, cockatiel adds one) | **3** (`stop_after_attempt(max_retries)` `resilience.py:70`) | ✗ F-RES-10 |
| Backoff | not documented | `ExponentialBackoff({initialDelay:100})` `resilience.ts:85` — cockatiel default generator is **decorrelated jitter**, ceiling 30 s | `wait_exponential(multiplier=0.01, min=0.01, max=1.0)` `resilience.py:71` — **no jitter**, ceiling 1 s | ✗ F-RES-09 |
| Observed gaps (503 stub) | — | 40 / 190 / 124 ms | 10 / 20 ms | ✗ |
| Breaker threshold | "5 consecutive failures" (`:26`) | `ConsecutiveBreaker(5)` `resilience.ts:90` | `pybreaker(fail_max=5)` `resilience.py:64-67` | ✓ semantics, ✗ unit (F-RES-03) |
| What a "failure" is | not stated | one **attempt** (breaker sits inside retry) | one **attempt** | ✓, but undocumented |
| Half-open after | 30 s (`:27`) | `halfOpenAfter: 30_000` `resilience.ts:89` | `reset_timeout: 30.0` `resilience.py:66` | ✓ (measured recovery: closed on first success in both) |
| Half-open gating | not documented | trials may run concurrently (measured: 2 concurrent trials both passed) | trials may run concurrently (measured: 3 passed) | ✓ |
| Per-attempt timeout | 15 s (`:28`) | `timeout(15_000, Aggressive)` `resilience.ts:93` — applies to fetch **and** bulkhead queue wait | `httpx2.Client(timeout=15)` `http.py:121` — applies only once the request starts | ✗ F-RES-02/F-RES-11 |
| Timeout retried? | "timeouts" are retried (`:13-16`) | **no** (F-RES-04) | yes | ✗ |
| Concurrency cap | not documented | `bulkhead(20, 40)` `resilience.ts:94` — measured 20 in-flight, 40 queued, 40/100 rejected | **none**; effective parallelism is 1 (RLock) | ✗ F-RES-05/F-RES-07 |
| Scope of breaker/bulkhead | not documented | one policy per client → all hosts share | one policy per client → all hosts share, plus one lock | ✗ F-RES-01 |
| Breaker state visibility | none | `policies.circuitBreaker.state` reachable programmatically only | `_breaker.current_state` (private) | ✗ F-RES-12 |

Worst-case latency for one logical call, from the measured numbers: TypeScript `4 × 15 s + ~0.3 s ≈
60 s`; Python `3 × 15 s + 0.03 s ≈ 45 s`. The docs' queue-lease guidance (`≈5 min` / `≈3¾ min` for a
three-read rejection reconcile) is consistent with those figures.

## Findings

### F-RES-01 — Shared breaker and bulkhead across every host: one sick buyer host disables DGII

**Severity: BLOCKER. Verified by running (both packages).**

Injected fault: buyer `Sender↔Receiver` host at an absolute URL always returns 503; the DGII host it
shares a client with is healthy and always returns 200.

- TS `packages/typescript/src/client.ts:196-213` builds a single `HttpClient` and therefore a single
  `createResiliencePolicies` object (`http.ts:144-151`). Buyer-host requests reuse it via
  `absoluteUrl: true` (`client.ts:576-582`, `client.ts:509-512`, `client.ts:826-830`).
- PY `packages/python/src/py_dgii_ecf/client.py:179-190` likewise builds one `HttpClient` /
  one `ResiliencePolicy` (`http.py:120`), reused for `build_sender_receiver_url(...)`
  (`client.py:327`, `client.py:349`, `client.py:404`, `client.py:708`).

Observed:

```
# TS, probe_ts_b.ts case C
C buyer0 -> code=HTTP retryable=true status=503
C buyer1 -> code=UNKNOWN retryable=false msg="Execution prevented because the circuit breaker is open"
C dgii-after-buyer-failures -> code=UNKNOWN retryable=false msg="Execution prevented because the circuit breaker is open"
C perUrl -> { "http://buyer.local/p": 5 }        # dgii.local was never contacted

# PY, probe_py_c.py case N
N buyer1: code=UNKNOWN retryable=False msg="DGII request failed: Failures threshold reached, circuit breaker opene"
N healthy DGII host afterwards: code=UNKNOWN msg="DGII request failed: Timeout not elapsed yet, circuit breake"
N requests actually made per host: {'https://buyer.example/fe/recepcion/api/ecf': 5}
```

Why an operator cares: the buyer host is a third party the operator does not control and, in a
multi-tenant integration, there is usually more than one of them. One tenant's unreachable host
stops e-CF transmission for every tenant for 30 s at a time, and re-arms on every retry — the
breaker never gets a chance to close while the sick host is being polled. This is precisely the
shared-fate failure the pattern exists to prevent, and it is not mentioned in the docs.

Fix (both packages): key the policy by destination host. Keep one `Map<string, ResiliencePolicies>`
(TS) / `dict[str, ResiliencePolicy]` (PY) inside the HTTP client, created lazily from the URL's
origin, so `ecf`, `fc`, `statusecf` and each buyer host get independent breaker, timeout and
bulkhead state. No new dependency, no background task, no change to the `Result` contract — a few
lines in `HttpClient.execute` / `HttpClient._execute`. Consider a smaller default
`breakerThreshold` per host once isolation exists, since thresholds no longer need to absorb all
traffic.

Test that proves it: stub where `buyer.*` returns 503 and `ecf.*` returns 200; drive five attempts
at the buyer, then assert the next `ecf` call succeeds **and** the stub recorded a request for the
`ecf` URL. One test per package, same fixture name, so parity is visible side by side.

### F-RES-02 — TypeScript charges bulkhead queue time to the per-attempt timeout, inventing failures and opening the breaker

**Severity: BLOCKER. Verified by running (TypeScript).**

Injected fault: local saturation only — 8 concurrent calls, `bulkheadLimit: 1`, `bulkheadQueue: 10`,
`timeoutMs: 50`, handler sleeps 40 ms. DGII is perfectly healthy.

Root cause: `wrap(retry, breaker, timeout, bulkhead)` at `resilience.ts:96-101` puts the timeout
**outside** the bulkhead (`resilience.ts:93-94`), so the 50 ms budget is consumed while the request
waits for a slot, not while DGII is working.

Observed:

```
M 8 calls, limit=1 timeout=50ms job=40ms -> all 8: UNKNOWN/false "Operation timed out after 50ms"
M requests actually sent to the stub: 2
M2 rejected: 7  sent: 2  breakerState(0=closed,1=open): 1
M2 next call while breaker open: "Execution prevented because the circuit breaker is"
```

Six of eight calls never touched the network, and the phantom failures were counted by the breaker
(`breaker.ts` semantics: every rejection inside `wrap` counts) until it opened. Python cannot
reproduce this (no bulkhead) but cannot reproduce the *protection* either — see F-RES-05.

Why an operator cares: under load the SDK reports `retryable: false` timeouts for requests DGII never
saw, and then locks itself out for 30 s. The operator's dashboards blame DGII, the on-call engineer
escalates to DGII, and the actual cause is the local queue. It also makes `bulkheadQueue` dangerous:
raising it now increases the number of phantom timeouts.

Fix (both packages): make queueing explicit and cheap rather than indistinguishable from a network
timeout. In TS, put the bulkhead **outside** the timeout — `wrap(retry, breaker, bulkhead, timeout)` —
so queue wait is not charged to the request budget and a slot is only taken once a connection is
attempted; return a distinguishable failure for a rejected slot. In PY, add the equivalent
`threading.BoundedSemaphore` layer with the same option names (`bulkhead_limit`, `bulkhead_queue`)
so the documented defaults can be expressed in both languages.

Test that proves it: same probe as above; assert (a) the number of requests the stub received equals
the number of calls that did not fail for capacity reasons, (b) failures caused by queueing carry a
distinct code (`CIRCUIT_OPEN` / a new capacity code) and do **not** increment the breaker failure
count (assert the next call still reaches the stub).

### F-RES-03 — The breaker threshold counts retry attempts, not user operations: "5 consecutive failures" is really ~1.3 failed sends

**Severity: HIGH. Verified by running (both packages).**

Injected fault: every attempt returns 503; call sites counted, not attempts.

Observed (TS `probe_ts_d.ts` case H, PY `probe_py_a.py` case B):

```
H after 1 logical call, raw attempts= 4
H after 2 logical calls, raw attempts= 5  state= 1 (open)
B rawAttempts 5     # PY: 2 logical calls, breaker opened on the 5th attempt
```

Because the retry policy is outside the breaker in both packages (`resilience.ts:96-101`,
`resilience.py:80-90`), each retry is a fresh `breaker.call` / policy entry. TypeScript gets there
faster (4 attempts per call) than Python (3).

Why an operator cares: `docs/en/guides/resilience.md:26` says "5 consecutive failures", and an
operator sizing a fleet reads that as five documents. In practice one document that hits a
four-attempt 503 window plus one more attempt opens the breaker, and with any concurrency the whole
client is open after the first bad second. Threshold tuning (`breakerThreshold: 5`) therefore has a
meaning nobody expects — a 4× error in TypeScript relative to the documented unit.

Fix (both packages): count **logical operations**, not attempts. Wrap only the innermost attempt in
the breaker (swap the order to `breaker` outside `retry`, or feed the breaker from the retry
predicate's final outcome), so one user call produces at most one breaker sample. That is a
containment improvement independent of the parity work: it also stops a single 5-attempt burst from
exhausting the threshold by itself.

Test that proves it: failing stub, `breakerThreshold: 5`; assert the breaker is still closed after
one logical call in both packages, and open after exactly five logical calls.

### F-RES-04 — TypeScript never retries the per-attempt timeout, contradicting the documented promise; Python does

**Severity: HIGH. Verified by running (both packages).**

Injected fault: handler that honours `AbortSignal` but takes 300 ms; `timeoutMs: 60`, `maxRetries: 1`.

Observed:

```
D timeout code=UNKNOWN retryable=false msg="Operation timed out after 60ms"
D elapsed 66 attempts 1          # <-- one attempt, the retry never happened

isRetryable(TaskCancelledError)= false name= "Error"
isRetryable(AbortError)= true
```

`TimeoutPolicy` throws `TaskCancelledError` whose `name` is left as `"Error"` and whose message is
`Operation timed out after Nms` (`node_modules/cockatiel/dist/TimeoutPolicy.js:73`,
`errors/TaskCancelledError.js`). `isRetryableError` (`resilience.ts:47-66`) matches on
`name === 'timeouterror'` and `message.includes('timeout')` — neither matches `"timed out"`. The
`name.includes('cancel')` branch also does not fire, because `name` is `"Error"`, not the class name.
Whether an `AbortError` from the real `fetch` wins the `Promise.race` is a timing race, so in Node the
retry behaviour is **nondeterministic**. Python retries deterministically: `readtimeout` /
`connecttimeout` are in `_RETRYABLE_EXCEPTION_NAMES` (`resilience.py:18-31`).

Why an operator cares: an e-CF send that times out is the single most likely transient failure in
this domain (DGII is slow at peak). TypeScript gives it one shot and tells the caller
`retryable: false`; Python gives it three. Two SDKs with the same documented policy behave
differently on the most common degraded case — that is a parity break in the failure path, which is
the one place parity is load-bearing.

Fix (both packages): make the timeout a first-class, retryable, tagged failure. In TS, either retry
inside the timeout layer or have `execute` catch `TaskCancelledError`
(`isTaskCancelledError` is a structural marker on the error object) and convert it to a
`DgiiError({ code: 'TIMEOUT', retryable: true })` that the retry predicate then recognises; add
`'timed out'` to the message match as a belt-and-braces. Python is already correct; add the same
`TIMEOUT` code so the two agree on the surfaced variant.

Test that proves it: stubbed handler that sleeps past the timeout; assert attempts == expected
retry count (not 1), and assert the surfaced error is `code === 'TIMEOUT' && retryable === true` in
both packages.

### F-RES-05 — Python serialises all outbound traffic on one pybreaker lock: no concurrency, unbounded head-of-line blocking

**Severity: HIGH. Verified by running (Python).**

Injected fault: none network-side — 5 concurrent calls through one `HttpClient` against a stub that
sleeps 200 ms.

Observed (`probe_py_b.py` case I):

```
I 5 concurrent 200ms calls: elapsed_s=1.04 peak_in_flight=1 ok=5/5
```

`pybreaker` 1.4.1 `CircuitBreaker.call` ([`pybreaker:246-250`]) takes `self._lock`
(`threading.RLock`) and holds it for the whole guarded call; the SDK routes every request through
one breaker (`resilience.py:87-90`, `http.py:120`).

Why an operator cares: the Python SDK's throughput ceiling is one request per round trip, no matter
how many workers the caller starts. Worse, the lock is per *client*, not per host: a hung
`fc.dgii.gov.do` request holds it for up to `3 × 15 s = 45 s` and the `statusecf` health check
queued behind it cannot even start — the client cannot be diagnosed while it is degraded. And
because the queue is a bare lock, waiters are not bounded, not measured, and not FIFO, so under
sustained load starvation is possible. In a queue-worker deployment this looks like "the SDK is
hanging" with no failing call to point at.

Fix (both packages): the same per-host policy map as F-RES-01 removes cross-host blocking. To remove
the intra-host lock, do not route every call through `CircuitBreaker.call` — pybreaker state
transitions need only be observed, and the standard pattern is a short critical section
(`if breaker.current_state == 'open': raise ...` plus `before_call` after a timeout) with the network
call issued outside the lock. `pybreaker` also offers `state_storage`; a storage that does not guard
the call is out of scope here, so the pragmatic fix is the cheap pre-check plus per-host breakers.
If a full refactor is too large for one change, F-RES-01's per-host isolation alone shrinks the
blast radius from "everything" to "one host", which is worth landing first.

Test that proves it: 5 concurrent 200 ms calls through one client to a stub; assert
`peak_in_flight >= 2` and wall time `< 2 × sleep` (this test currently fails: peak was 1, 1.04 s).
Add the TS equivalent asserting `peak_in_flight <= bulkheadLimit`.

### F-RES-06 — The degraded caller contract is not actionable: breaker trip, timeout and capacity rejection all collapse into `UNKNOWN`/`retryable:false`

**Severity: HIGH. Verified by running (both packages) + read of both error modules.**

Injected fault: (a) 5 failing attempts, (b) per-attempt timeout, (c) saturated bulkhead. Then inspect
the returned `Err`.

Observed:

| Degradation | TS returned | PY returned |
| ----------- | ----------- | ----------- |
| breaker open | `code=UNKNOWN`, `retryable=false`, `status=undefined`, msg `"Execution prevented because the circuit breaker is open"` | `code=UNKNOWN`, `retryable=False`, `status=None`, msg `"DGII request failed: Timeout not elapsed yet, circuit breaker still open"` |
| per-attempt timeout | `code=UNKNOWN`, `retryable=false` (should be `TIMEOUT`, retryable) | `code=HTTP`, `retryable=False`, `status=None` |
| bulkhead rejection | `code=UNKNOWN`, `retryable=false` | n/a (no bulkhead) |
| 503 exhausted | `code=HTTP`, `retryable=true`, `status=503` ✓ | `code=HTTP`, `retryable=True`, `status=503` ✓ |

`TIMEOUT` and `CIRCUIT_OPEN` are declared in `packages/typescript/src/errors.ts:9-10` and
`packages/python/src/py_dgii_ecf/errors.py:42-43` and have **no producer anywhere in `src`**
(`grep -rn "CIRCUIT_OPEN\|TIMEOUT" packages/*/src` returns only the declarations). The catch-all is
`http.ts:290` (`toDgiiError(error, ctx)` with no code) and `http.py:257-263`
(`except Exception` → `DgiiErrorCode.UNKNOWN`). Neither error type has a `retryAfter` field at all,
and neither surfaces the host that failed — `ctx.baseURL` in TS is the *client's* base URL
(`http.ts:276`), so a failure against a buyer host is reported as `baseURL: "https://ecf.dgii.gov.do"`,
which is actively misleading in a log.

Two further degradations of the contract:
- When pybreaker is the component that trips, it raises `CircuitBreakerError` instead of the
  underlying failure, so the caller loses the `503` that caused it. TS rethrows the original error
  on the tripping attempt (`probe_ts_b.ts` case B: call1 surfaces `HTTP/503`), so the two packages
  disagree on which call gets the useful error.
- `retryable` is inverted exactly where it matters: a breaker-open is a *come-back-later* condition
  and is reported as terminal; the caller's only safe response to `retryable: false` is to escalate
  to a human.

Why an operator cares: a caller cannot write a correct fallback. The choice "hold the document and
retry in 30 s" versus "stop and page" is unmade by the SDK, so the consumer either escalates
everything or retries everything — and retrying everything against the *breaker* is fine, but
retrying everything against a terminal `UNKNOWN` is how a queue ends up in a hot loop.

Fix (both packages): keep the declared codes and start producing them.
`DgiiError({ code: 'CIRCUIT_OPEN', retryable: true, retryAfter: <ms until half-open>, resource,
baseURL: <actual host> })` and `{ code: 'TIMEOUT', retryable: true }`. Add an optional
`retryAfter?: number` (ms) populated from the breaker's remaining open time and from a
`Retry-After` header when present (see F-RES-08). Report the real host, not the client's base URL.
This is additive to the public surface and does not disturb "results, not exceptions".

Test that proves it: for each of the four degradation modes, assert the exact
`(code, retryable, retryAfter != null)` triple in both packages from the same scenario table.

### F-RES-07 — Python has no bulkhead and no shedding: 50 concurrent callers pile up unboundedly behind the lock

**Severity: MEDIUM. Verified by running (Python).**

Injected fault: 50 concurrent calls, 50 ms stub, no fault in DGII at all.

Observed (`probe_py_b.py` case K):

```
K 50 threads: elapsed_s=2.55 peak_in_flight=1 (no bulkhead => no cap, no rejection)
```

`resilience.py:59-96` composes only `tenacity` + `pybreaker`; `ResilienceOptions`
(`resilience.py:35-42`) has no capacity knob, and `docs/en/guides/resilience.md:22-28` documents no
capacity knob either.

Why an operator cares: there is no rejection signal, so a caller cannot shed load or size a worker
pool from the SDK's behaviour — every request eventually runs, latency grows linearly with
concurrency, and (in a thread-per-document worker) thread count grows with the queue depth. The
TypeScript twin caps this at 20 in-flight / 40 queued and *rejects* the rest (measured: 40 of 100).
Two SDKs that promise behavioural identity have opposite overload behaviour — one sheds, the other
absorbs.

Fix (both packages): add `bulkhead_limit` / `bulkhead_queue` to `ResilienceOptions` with 20/40
defaults matching `resilience.ts:38-39`, implemented as a `threading.BoundedSemaphore` acquire with
a bounded wait (no extra threads, no daemon) and a distinct capacity failure code. Land after
F-RES-05, otherwise the semaphore will simply queue behind the breaker lock.

Test that proves it: fire 100 concurrent calls at a slow stub; assert exactly 60 succeed, 40 fail
with the capacity code, and peak in-flight ≤ 20 — the same assertions as the TypeScript test.

### F-RES-08 — `Retry-After` is ignored: a 429 is retried in 10 ms (Python) / 40 ms (TypeScript)

**Severity: MEDIUM. Verified by running (both packages) + read.**

Injected fault: `429 Too Many Requests` with `Retry-After: 60` on every attempt.

Observed: the retry delay is purely local — TS gaps `[40, 190, 124] ms`, PY gaps `[10, 20] ms` from
`probe_ts_a.ts` / `probe_py_a.py` (same predicate path for 429, `errors.ts:13` / `errors.py:15`).
`grep -rn "retryAfter\|retry_after\|retry-after" packages/*/src` returns no producer or consumer.

Why an operator cares: DGII rate-limits, and a 429 with `Retry-After` is an explicit instruction.
Ignoring it converts a polite throttle into a retry storm: N workers each re-send within tens of
milliseconds, which is how a 429 escalates to a 403 or an IP-level block. This is the one place where
"retry" actively increases the chance of the failure it is trying to survive. `RETRYABLE_STATUSES`
is `errors.ts:15` / `errors.py:12`.

Fix (both packages): when the response carries `Retry-After` (delta-seconds or HTTP-date), use it as
the retry delay for that attempt, clamped to a ceiling, instead of the computed backoff. Requires
plumbing the header into the failure — in TS the `DgiiError` already carries `data`/`status`, so add
the parsed value as a field; in PY the same on `DgiiError`. Do not retry a 429 more than once when
`Retry-After` exceeds the remaining lease.

Test that proves it: 429 + `Retry-After: 1` stub; assert the observed inter-attempt gap is ≥ 1000 ms
and that the surfaced error exposes `retryAfter === 1000` when attempts are exhausted.

### F-RES-09 — Python retries have no jitter and a 1 s ceiling, so a fleet retries in lockstep

**Severity: MEDIUM. Verified by running (both packages).**

Injected fault: 503 on every attempt; timestamps recorded.

Observed: TS `ExponentialBackoff` uses cockatiel's default **decorrelated jitter** generator
(`node_modules/cockatiel/dist/backoff/ExponentialBackoffGenerators.js`), giving non-monotonic,
per-instance delays `40 / 190 / 124 ms`. PY `wait_exponential(multiplier=0.01, min=0.01, max=1.0)`
(`resilience.py:71`) has **no jitter** and yields exactly `10 / 20 ms`.

Why an operator cares: the realistic deployment is several worker processes (the docs explicitly
discuss multi-instance usage, `docs/en/guides/resilience.md:95-96`). Deterministic 10 ms/20 ms
retries mean every worker that saw the same 503 re-sends in the same millisecond window — a
self-inflicted synchronised burst on a dependency that just said "I'm struggling". Python's total
retry window (~30 ms) is also too short to let DGII recover from anything, so all three attempts
are effectively the same shot.

Fix (both packages): Python must use `tenacity.wait_random_exponential(multiplier=<same as TS
initial>, max=<ceiling>)` and match TypeScript's nominal initial delay so the documented
"per-attempt timeout / attempts" table means the same thing in both. Keep the ceiling documented.

Test that proves it: run the failing stub 20 times and assert the collected first-delay samples are
not all identical (fails today in Python: every sample is 10 ms).

### F-RES-10 — Same option value, different attempt count: `maxRetries: 3` is 4 sends in TypeScript and 3 in Python

**Severity: MEDIUM. Verified by running (both packages).**

```
TS: A attempts= 4 (maxRetries default 3)      A attempts= 2 (maxRetries: 1)
PY: A attempts= 3 (max_retries default 3)     A attempts= 2 (max_retries: 1)
```

`resilience.ts:83-86` passes `maxAttempts: opts.maxRetries` to cockatiel, whose loop condition is
`retries < maxAttempts` after starting at `retries = 0` (`RetryPolicy.js:53-60`) — so the value is a
*retry* count. `resilience.py:68-73` passes `stop_after_attempt(max_retries)` to tenacity, where the
value is an *attempt* count. `docs/en/guides/resilience.md:25` records the asymmetry as
"3 (4 in TypeScript)", which documents the symptom without naming the cause; the Spanish page
(`docs/es/guides/resilience.md:26`) says "3 (4 en TypeScript)" and the per-language option names
(`maxRetries` vs `max_retries`) do not hint at the difference.

Why an operator cares: a caller who tunes `maxRetries: 2` for a rate-limited tenant gets 3 sends in
TS and 2 in Python, i.e. 50% more load in the package they did not tune. During an outage this is
the multiplier on top of everything else in this report.

Fix (both packages): make the unit explicit and equal. Either rename to `maxAttempts` (TS keeps
`maxAttempts: maxRetries + 1` internally and the doc says "attempts") or set Python's
`stop_after_attempt(max_retries + 1)`. Pick one unit, document it in the same table row, and keep
the option name snake_case/camelCase of the same word.

Test that proves it: the stub-attempt-count test above, asserted with the same expected number in
both packages.

### F-RES-11 — Python's `ResilienceOptions.timeout_s` is dead config, and `HttpClient.timeout_s` reports the dead value

**Severity: MEDIUM. Verified by running (Python) + read.**

`ResilienceOptions.timeout_s` (`resilience.py:42`) is never referenced by `ResiliencePolicy`
(`resilience.py:59-96`); the real timeout comes from `HttpClientOptions.timeout_s`
(`http.py:92`, used at `http.py:121`). But `HttpClient.timeout_s` (`http.py:125-128`) returns
`self._policy.options.timeout_s` — the unused one.

Observed (`probe_py_b.py` case J):

```
J HttpClient.timeout_s property reports: 3.0 (actual httpx timeout would be 1.0 from HttpClientOptions)
```

Also: when a caller injects `http_client=`, `timeout_s` is silently ignored entirely
(`http.py:121` short-circuits on `client or ...`).

Why an operator cares: a caller who sets `ResilienceOptions(timeout_s=3)` to protect a 5 s queue
lease gets 15 s per attempt and a 45 s worst case, with the SDK's own accessor telling them it is
3 s. This is the classic silent no-op that surfaces during an incident as "the timeout we configured
didn't work".

Fix (both packages): delete `timeout_s` from `ResilienceOptions` (or apply it to the client when no
`http_client` is injected, matching TS's "`HttpClientOptions.timeoutMs` overrides
`ResilienceOptions.timeoutMs`" precedence in `http.ts:146-151`) and make the accessor return the
effective value. Document the precedence.

Test that proves it: `HttpClient(HttpClientOptions(timeout_s=1.0)).timeout_s == 1.0` and the
effective httpx timeout equals it; assert `ResilienceOptions(timeout_s=3)` either applies or raises.

### F-RES-12 — Breaker and bulkhead state are process-local and unobservable; the docs never say so

**Severity: LOW. Verified by reading (`docs/en/guides/resilience.md`, `docs/es/guides/resilience.md`) + running (per-process behaviour).**

`pybreaker` defaults to `CircuitMemoryStorage` (`resilience.py:64-67`), and cockatiel's breaker is a
per-policy object (`resilience.ts:88-91`). Each worker process therefore has its own threshold and
its own half-open timer, and its own bulkhead. Neither `ECF` nor the docs expose the state: the
Python breaker is reachable only as `_policy._breaker` (private), TS as
`policies.circuitBreaker.state` for a caller who built the policies themselves.

Why an operator cares: "the SDK sheds load and self-heals" is a claim that needs a signal. With 8
workers, a "5 consecutive failure" threshold is really 40 attempts across the fleet, and there is no
way to alert on "breaker open in at least one worker" without reaching into private state. The docs
page (`docs/en/guides/resilience.md:3`) says only "Every external call is protected by retry, a
circuit breaker and a timeout" — no mention of process-locality, no mention of the bulkhead, no
mention of per-host scope, no mention of jitter.

Fix (both packages): expose a read-only snapshot — `resilienceState()` / `resilience_state()`
returning `{ host, state, failures, openUntil }` per host — and add four rows to both doc locales
(scope = per host *and* per process; bulkhead defaults; retry delay and jitter; what counts as a
"failure" for the breaker). Documentation is a deliverable here, not a nicety: it is the only place
the operator learns the blast radius.

Test that proves it: unit test asserting the accessor reflects transitions closed → open →
half-open in a deterministic scenario, in both packages.

### F-RES-13 — The retry predicate matches on message substrings, so non-transient errors can be retried

**Severity: LOW. Verified by running (both packages, predicate level) + read.**

TS `isRetryableError` returns true for any error whose name is `TypeError` (`resilience.ts:55`) and
for any message containing `network` (`resilience.ts:62`); measured
`isRetryable(TypeError fetch failed)= true` (correct for undici) but the same branch also catches a
`TypeError` thrown by SDK code inside the policy. PY retries any exception whose message contains
`"connection"` (`resilience.py:52-56`), e.g. a `DgiiError`-wrapping library bug that happens to be
phrased that way, and `DgiiError` is only protected because it is checked first (`resilience.py:47`).

Why an operator cares: a programming error inside the SDK's own stack would be retried 3–4× with
backoff instead of failing fast, which makes a bug look like a flaky network and delays the crash
that would have identified it.

Fix (both packages): keep the message heuristics only as a *fallback* for values that are not
`Error`/`BaseException` instances, and require positive evidence (status in the retryable set,
`DgiiError.retryable`, or a known transport exception class) before retrying. Narrow `TypeError` to
the undici "fetch failed" shape.

Test that proves it: a `TypeError('bad config')` thrown by a fake transport must not be retried
(assert exactly one call), in both packages.

## Coverage

**Verified by running** (stubs only, `/tmp/p4/`, no DGII traffic):

- `probe_ts_a.ts` — attempt counts and inter-attempt gaps for `maxRetries` 3/1 (F-RES-09, F-RES-10).
- `probe_ts_b.ts` — breaker trip point, cross-host contamination, timeout attribution, 4xx not
  retried/not counted (F-RES-01, F-RES-03, F-RES-04, F-RES-06).
- `probe_ts_c.ts` — `isRetryableError` against `TaskCancelledError`, `AbortError`, `TypeError`,
  `ENOTFOUND` (F-RES-04, F-RES-13).
- `probe_ts_d.ts` — bulkhead saturation (20 in-flight / 40 queued / 40 rejected), half-open trials,
  attempts-vs-threshold arithmetic (F-RES-03, F-RES-07).
- `probe_ts_e.ts`, `probe_ts_f.ts` — queue-time-charged-to-timeout and the resulting self-inflicted
  breaker trip (F-RES-02).
- `probe_py_a.py` — attempt counts, gaps, breaker trip point, consecutive-vs-cumulative semantics
  (F-RES-03, F-RES-09, F-RES-10).
- `probe_py_b.py` — RLock serialisation, dead `timeout_s`, no bulkhead, half-open behaviour
  (F-RES-05, F-RES-07, F-RES-11).
- `probe_py_c.py` — cross-host contamination and half-open recovery timing (F-RES-01).

**Verified by reading:** pybreaker 1.4.1 storage/state machine
(`.venv/.../pybreaker/__init__.py:246-250` — `call` under `self._lock`; `:702-712` —
`_handle_success` → `reset_counter`; `:780-898` — closed/open/half-open states), cockatiel 3.2.1
`RetryPolicy`/`ExponentialBackoffGenerators`/`TimeoutPolicy`/`ConsecutiveBreaker`, both error
modules, both `docs/*/guides/resilience.md`.

**Confirmed parity (no finding):** breaker threshold semantics are genuinely consecutive in both
(PY `_handle_success` → `reset_counter`, `pybreaker:700-704`; measured in `probe_py_a.py` case C);
half-open recovery closes on the first success in both (measured 0.25 s after a 0.2 s
`reset_timeout`); 4xx never retried and never counted as a breaker failure in either; `Result`-based
error return is preserved throughout — nothing here throws to the caller.

**Not covered:** no live DGII host was contacted (hard rule), so the real `fetch`/`httpx2` error
shapes for TLS failures, HTTP/2 resets and proxy errors are inferred from the libraries rather than
observed; no multi-process measurement (F-RES-12's fleet arithmetic is derived, not measured); the
XMLDSig gate is unrelated to this review and was not run.

## Needs follow-up

1. **Design decision (owner: SDK maintainer).** Should a caller-supplied buyer host ever share
   resilience state with DGII? My recommendation is no — per-host isolation, F-RES-01 — but if the
   intended design is deliberate (e.g. one global "am I able to talk to the world" breaker), it needs
   to be written down in both doc locales, because nothing in the current docs suggests it.
2. **Chaos coverage in CI (owner: testing).** None of the eight probes above exist as tests. The
   fault matrix in this report is a ready-made table of cases; the missing piece is a shared stub
   harness per package (`fetchImpl` / injected `httpx2.Client` already make it possible without new
   dependencies).
3. **Queue-lease guidance (owner: docs).** The `≈5 min` / `≈3¾ min` figures in
   `docs/en/guides/resilience.md:165-169` will change once F-RES-04 (TypeScript retries timeouts) and
   F-RES-10 (attempt-count parity) land. They must be recomputed and updated in both locales in the
   same change.
4. **Breaker threshold re-tuning after isolation.** With per-host breakers (F-RES-01) and
   per-operation counting (F-RES-03), `5` stops meaning "two bad sends". Whoever lands those should
   re-derive the default against the reconcile flow, which issues up to three reads per rejection.
5. **Cross-review with `p3-reliability.md`.** The attempt/breaker interaction (F-RES-03) and the
   pending-marker lifecycle meet in `reconcileSubmission`: a breaker that opens mid-reconcile leaves
   the marker intact by design. Confirm with that reviewer that the surfaced code for a
   breaker-blocked reconcile is not mistaken for "DGII has no record".
