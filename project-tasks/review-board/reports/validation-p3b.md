# Reliability Fix Validation — Pass 3b

Second validator pass on the reliability fixes in `p3-reliability.md`. Scope is deliberately narrow:
the three items the previous pass (`validation-p3.md`) left open, plus the engineer's new
no-retry-on-submit change. `F-REL-01` and `F-REL-02` were already accepted there and were **not**
re-probed — except where their own evidence bears directly on the new change (item 1, case D).

Read-only: no repository file was modified. Every probe lives under `/tmp/val3b/`, imports the
working-tree source, and drives an injected transport (`fetchImpl` / `httpx2.MockTransport`). **No
traffic was sent to a DGII host** — the URLs printed below are the ones the SDK would have built,
answered locally.

Baseline: working tree, uncommitted (`packages/typescript/src/{client,http,resilience}.ts`,
`packages/python/src/py_dgii_ecf/{client,http,resilience}.py` as read).

| # | Item | Verdict |
|---|------|---------|
| 1 | F-REL-08 retry budget + submissions not retried | **PASS** |
| 2 | F-REL-03 concurrent duplicate send (PY per-key lock) | **PASS (single instance) / PARTIAL (cross-instance)** |
| 3 | F-REL-04 / F-REL-05 marker shapes + unparseable 2xx | **PASS** |

---

## 1. F-REL-08 — retry budget, and submissions not retried — **PASS**

Code under test:

- `packages/typescript/src/resilience.ts:96-104` — `maxAttempts: Math.max(0, opts.maxRetries - 1)`
  converts the public attempt budget into cockatiel's retry budget; `resilience.ts:120`
  `policyWithoutRetry = wrap(breaker, timeout, bulkhead)` has no retry wrapper.
- `packages/typescript/src/http.ts:308-311` — `options.retry === false` selects
  `policyWithoutRetry`; call sites `client.ts:662,678,920,943,963`.
- `packages/python/src/py_dgii_ecf/resilience.py:96-114` — `execute(..., retry=False)` returns the
  breaker-guarded call without the tenacity wrapper; call sites `client.py:470,483,775,792,801`.

Command (TypeScript, injected `fetchImpl`, `resilience: {maxRetries: 3, breakerThreshold: 99}`):

```
$ cd packages/typescript && bun run /tmp/val3b/ts/probe1.ts
[submit 503] transmissions=1 hits=["POST /TesteCF/recepcion/api/FacturasElectronicas"]
[submit 503] result: Err(code=HTTP status=503)
[query 503] transmissions=3 hits=["GET /TesteCF/consultaresultado/api/Consultas/Estado?trackId=TRACK-1", ... x3]
[query 503] result: Err(code=HTTP status=503)
[auth 503] transmissions=3 hits=["GET /TesteCF/Autenticacion/api/Autenticacion/Semilla", ... x3]
[auth 503] result: Err(code=HTTP)
[submit reset] transmissions=1
[submit reset] result: Err(code=IDEMPOTENCY status=undefined)
```

Command (Python, `httpx2.MockTransport`, `ResilienceOptions(max_retries=3, breaker_threshold=99)`):

```
$ cd packages/python && uv run --frozen python /tmp/val3b/py/probe1.py
[submit 503] transmissions=1 hits=['POST /TesteCF/recepcion/api/FacturasElectronicas']
[submit 503] result: Err(code=HTTP status=503)
[query 503] transmissions=3 hits=['GET /TesteCF/consultaresultado/api/Consultas/Estado?trackId=TRACK-1', ... x3]
[query 503] result: Err(code=HTTP status=503)
[submit reset] transmissions=1
[submit reset] result: Err(code=IDEMPOTENCY status=None)
[query reset] transmissions=3
[query reset] result: Err(code=HTTP)
```

Findings:

- **The documented meaning now holds.** `maxRetries: 3` / `max_retries=3` is exactly **3 attempts
  including the first** for queries (`statusTrackId` / `status_track_id`) in both packages, and the
  TypeScript authentication path (`authenticate()` → seed request) is 3 as well. The off-by-one
  measured in `p3-reliability.md` (4 in TS) is gone. Python was already 3 and is unchanged.
- **A submission is sent exactly once.** 503 on the POST → 1 transmission, `Err(HTTP, 503)`,
  definitive status, so the marker is cleared and the caller may retry deliberately.
- **A socket reset on the POST → 1 transmission**, `Err(IDEMPOTENCY, status=undefined)`, i.e. the
  ambiguous classification of `F-REL-01` is preserved while the duplicate copies are gone.

### Does this close the duplicate-transmission path F-REL-01 left open? — **Yes.**

The `F-REL-01` evidence in `validation-p3.md` recorded, verbatim, `bodies received by stub: 3` in
both packages on a reset/timeout, i.e. **one caller invocation delivered three copies of one e-NCF**
because the retry wrapper re-sent inside the same call. Case D above re-runs that exact shape
(`TypeError: fetch failed` in TS, `httpx2.ReadError` in PY) through the submission path: 1 body, one
`Err` carrying no status, marker kept. The retry inside a submission is now `retry: false`, so the
only remaining transmissions for a document are ones the *caller* initiates, and those are gated by
the persistent marker plus `reconcileSubmission`. The `F-REL-01` residual recorded in
`validation-p3.md` ("the number of copies inside the first call is unchanged") is therefore
**retired** for submissions.

Scope note, deliberately not probed further: the retry stays in place for queries and
authentication, where re-sending is safe (idempotent reads, non-fiscal handshake).

---

## 2. F-REL-03 — concurrent duplicate send — **PASS (single instance) / PARTIAL (cross-instance)**

Code under test: `packages/python/src/py_dgii_ecf/client.py:195-196` (`_send_locks`,
`_send_locks_guard`), `294-301` (`_lock_for`), `324` (`with self._lock_for(key)` wrapping the whole
read → marker-write → transmit → store sequence in `_submit_idempotent`).

Command — two threads released by a barrier onto one `ECF`, store whose `get()` sleeps 50 ms before
reading (a realistic Redis round-trip, which is what made the original race so wide), then the same
run with **two `ECF` instances sharing one store**:

```
$ cd packages/python && uv run --frozen python /tmp/val3b/py/probe2.py
[one instance, two threads]        posts=1 store_reads=2
[one instance, two threads]        is_ok = [True, True]
[TWO instances, one shared store]  posts=1 store_reads=2
[TWO instances, one shared store]  is_ok = [False, True]
```

- **Required assertion met:** one transmission, two `Ok` results, on a single instance with a
  read-before-write store. The check-then-act window that produced `POST count: 2` in
  `p3-reliability.md` is closed for threads; the second caller blocks on the per-key lock, then
  finds the stored result and returns it as `Ok`.
- **Cross-instance is improved but not guaranteed.** Two instances sharing one store produced 1 POST
  (not 2) because the second instance read the first instance's marker *after* it was written — that
  is timing, not mutual exclusion: the lock is in-memory and per-instance, and the store interface
  still has no conditional write. In that run the loser got `Err(IDEMPOTENCY)` rather than the
  delivered result. This is the failure direction we want (refuse, never double-send), but it is a
  narrowing of the window, not the atomic claim the finding asked for. Recorded as residual, not a
  failure of this fix's stated scope.

---

## 3. F-REL-04 / F-REL-05 — marker wire format and unparseable 2xx — **PASS**

Code under test: `client.ts:159` `PENDING_SUBMISSION = { __pending__: true }`, `165-172`
(`__pending__ === true || pending === true`), `~305` write-before-transmit;
`client.py:64` `_PENDING_MARKER = {"__pending__": True}`, `67-75` (same two shapes accepted).

Command — one seeded store per marker shape (0 transmissions is the assertion), then one real store
behind a `200 text/html` body per package:

```
$ cd packages/python && uv run --frozen python /tmp/val3b/py/probe3.py
[marker new {'__pending__': true}] posts=0 result=IDEMPOTENCY
[marker legacy {'pending': true}]  posts=0 result=IDEMPOTENCY
[2xx text/html] posts=1 result=VALIDATION marker_after={'__pending__': True}

$ cd packages/typescript && bun run /tmp/val3b/ts/probe3.ts
[marker new {'__pending__': true}] posts=0 result=IDEMPOTENCY
[marker legacy {'pending': true}]  posts=0 result=IDEMPOTENCY
[2xx text/html] posts=1 result=VALIDATION marker_after={"__pending__":true}
```

- **One wire format, identical bytes:** both packages now write `{"__pending__": true}` — the
  cross-read that made Python's marker look like a cached success to a TypeScript worker
  (`Ok({"__pending__":true})`, "a lost filing reported as delivered") can no longer occur.
- **Legacy shape accepted in both:** `{"pending": true}` is read as pending in TypeScript *and*
  Python, so an in-flight marker written by an older deployment yields `Err(IDEMPOTENCY)` instead of
  a silent `Ok`. No transmission in either case.
- **Unparseable 2xx:** both packages return `Err(VALIDATION)` and **keep** the marker
  (`{"__pending__": true}` still in the store afterwards), so the caller cannot re-send a document
  whose fate is unknown and must reconcile. The TypeScript `Ok(undefined)` / `Ok("<html>…")` path
  that `F-REL-05` reported is gone; Python's behaviour is unchanged and now matches.

---

## Regressions or new failure paths observed

1. **No submission retry means 429 is now surfaced to the caller.** Previously a `429` on a
   submission was retried in-place with backoff (which is *safe*, since a 429 means not accepted).
   Now it is one attempt and returns `Err(HTTP, 429)` with the marker cleared. Correct, but the
   caller must implement its own 429 backoff — see residual risk.
2. **Mixed-version deployments (old worker + new worker, shared store).** An old TypeScript writer
   still writes `{pending: true}` and the new readers accept it, so the upgrade is safe in both
   directions as long as the *reader* is new. An old **Python** reader and a new writer is also
   safe (`__pending__` was Python's own shape).
3. **Barrier probe with zero store latency** — not run. With the lock in place the outcome is
   latency-independent on a single instance, and the cross-instance case is documented above.

## Verdict

**ACCEPTED WITH RESIDUALS.**

The most important claim is proven, in both packages, by an independent stub: a submission that gets
`503`, or whose socket dies mid-flight, is transmitted **once** — that is the change that retires the
duplicate-transmission path `F-REL-01` left open, and it is the single most valuable fix in this
cohort. The attempt budget now means what it says (3 attempts including the first) for queries and
authentication, verified at 3 in both packages. The Python per-key lock gives one transmission and
two `Ok` for concurrent callers on one instance. The marker is one wire format, the legacy shape is
honoured, and an unparseable 2xx fails as `VALIDATION` while keeping the marker, identically in both
packages.

Nothing found in this pass blocks shipping. The residuals below are hardening items, not
correctness holes open to silent duplicate or lost filings — with one exception worth stating
plainly: **cross-process duplicate suppression still depends on store timing**, because there is
still no atomic claim primitive.

## Residual risk

**Is skipping the retry for submissions an acceptable trade-off? Yes — the asymmetry is the point.**
The two failure modes are not symmetric in cost. A retried POST whose answer was lost creates a
second fiscal document at DGII, which does not de-duplicate by e-NCF; unwinding it is a manual,
auditable process. A non-retried POST that hit a transient blip costs the caller one explicit retry,
and the persistent marker makes that retry safe (`Err(IDEMPOTENCY)` + `reconcileSubmission` tells
them whether the first copy landed). Trading automatic liveness for no-duplicates is correct for a
legally binding transmitter.

**What the caller loses, concretely:**

- **Automatic recovery from 5xx/429/transport blips on submit.** Every transient failure now reaches
  the caller as one failed send. The caller owns the retry loop, and it must distinguish the two
  outcomes it now receives: `Err(HTTP, 503|429)` = definitively not accepted, retry freely;
  `Err(IDEMPOTENCY, status undefined)` = unknown, call `reconcileSubmission` first and never resend
  blindly. That branch is now load-bearing application logic rather than an SDK detail.
- **429 rate limiting hurts more.** DGII's rate limiter is answered with one attempt and returned;
  a caller without its own backoff will hammer. Worth a doc line naming the expected loop.
- **Liveness on the query side is still asymmetric between packages.** TypeScript's
  `isRetryableError` (`resilience.ts:47-66`) still classifies cockatiel's timeout as non-retryable —
  `<TaskCancelledError name="Error" message="Operation timed out after 15000ms">` →
  `isRetryableError === false`, while Python retries the same condition 3×. Verified in code and by
  `bun run /tmp/val3b/ts/timeout.ts`. Harmless for correctness (queries are idempotent) but it is a
  same-input/different-latency divergence across the two SDKs and remains from `F-REL-08`.
- **Python's transport predicate is still message-dependent.** `httpx2.ReadError` is caught only
  because its message contains "connection": the `_RETRYABLE_EXCEPTION_NAMES` frozenset still omits
  `readerror`/`writeerror` (`resilience.py:22-33`), so a `ReadError("")` — which httpx does raise in
  some paths — classifies as permanent. Safe for submissions (no retry), a fast-fail for queries.
- **Cross-process duplicate suppression is not atomic.** `_lock_for` is an in-memory per-instance
  `threading.Lock`; two pods sharing a Redis store can still both pass the `get` before either
  `set` lands. The window is narrow (it needs both reads inside one round-trip) and the observed
  behaviour when it does lose is a spurious `Err(IDEMPOTENCY)`, not a second document — but the
  `set_if_absent` / `SET NX` primitive that would actually close it is still absent from the store
  contract in both packages. Recommend as a follow-up finding, not a blocker for this pass.

## Commands run

```
ls project-tasks/review-board/reports/ ; wc -l p3-reliability.md validation-p3.md
sed -n '1,161p' project-tasks/review-board/reports/validation-p3.md
grep -n "F-REL-0[13458]" project-tasks/review-board/reports/p3-reliability.md
sed -n '219,320p;449,500p;860,910p' project-tasks/review-board/reports/p3-reliability.md
grep -n "retry" packages/typescript/src/resilience.ts ; grep -rn "policyWithoutRetry|retry: false" packages/typescript/src/*.ts
sed -n '40,130p' packages/typescript/src/resilience.ts ; sed -n '295,325p' packages/typescript/src/http.ts
cat packages/python/src/py_dgii_ecf/resilience.py
grep -n "_lock_for|_locks|PENDING|__pending__|_is_pending|retry=False" packages/python/src/py_dgii_ecf/client.py
grep -n "__pending__|PENDING|pending" packages/typescript/src/client.ts
sed -n '/_lock_for/,/^    def [a-z]/p' packages/python/src/py_dgii_ecf/client.py
sed -n '205,260p' packages/typescript/src/client.ts ; sed -n '170,215p' packages/python/src/py_dgii_ecf/client.py
sed -n '455,495p;514,540p;718,740p' packages/python/src/py_dgii_ecf/client.py
grep -rn "MockTransport|httpx2.Client(" packages/python/tests/*.py
cd packages/typescript      && bun run /tmp/val3b/ts/probe1.ts
cd packages/python          && uv run --frozen python /tmp/val3b/py/probe1.py   # > probe1.out
cd packages/python          && uv run --frozen python /tmp/val3b/py/probe2.py   # > probe2.out
cd packages/python          && uv run --frozen python /tmp/val3b/py/probe3.py   # > probe3.out
cd packages/typescript      && bun run /tmp/val3b/ts/probe3.ts
cd packages/typescript      && bun run /tmp/val3b/ts/timeout.ts
cd packages/python          && uv run --frozen python -c "<is_retryable_error on ReadError/ReadTimeout>"
```
