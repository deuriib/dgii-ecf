# T3 — Reliability / resilience gate on `126-contract-design.md`

**Task:** #126 / P1 / T3 (attempt **1 of 3**) · **Gate owner:** Reliability Reviewer · **Verdict: FAIL**
**Subject:** `project-tasks/126-contract-design.md` (contract, frozen at PASS only)
**Question asked of this gate:** not "is DGII's contract right" (T2 owns that) but **"can this design
double-issue a fiscal document, hang, or fail silently?"**

---

## 0. Verdict

**FAIL — attempt 1 of 3.**

The **ordering** argument is sound: no interleaving of the four calls can delete the marker on a partial
read, and every failure path returns `Err` with the marker intact. On ordering alone the design **cannot
double-issue**.

The design fails on **classification**, not sequencing. Three defects:

| ID     | Defect                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Blast radius                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| **B1** | §5 step 5 maps a `null`/absent/unparseable `consultatrackids` payload to `[]`, and `[]` means "no record" → `cleared = true` → **marker deleted**. This is the exact hazard §7 of the same document names as "the one divergence in this design that could double-issue". A 200 with an empty body (proxy truncation, unpublished route answering blank, gateway quirk) is then read as _DGII has no record of this e-NCF_.                                        | **Duplicate fiscal document** (§3.4 walk)     |
| **B2** | §6's predicate is not total: `response.estado.trim()` / `response.estado.strip()` throws (`TypeError` / `AttributeError`) whenever the flag is present and `estado` is absent — a shape S6 itself declares legal and §6 rule 2 promises to tolerate. In Python this is an **uncaught exception escaping `reconcile_submission`**, i.e. a worker crash, which breaks the "results, not exceptions" invariant.                                                       | **Process crash / hang on the recovery path** |
| **B3** | The design moves `delivered` from `consultaestado` to `consultatrackids` without the ledger amendment the run requires, and it re-derives `cleared` from **absence of data** instead of from an **explicit DGII state**. Run ledger `…-can-reuse-sequence-ledger.md` invariant I2/I3 and tasklist R9/A5/I3 (`126-tasklist.md:98`, `:509`, `:552`) freeze `delivered`/`cleared` on `inquiryStatus.estado !== 'No encontrado'`; the design silently supersedes them. | **Governance + duplicate risk via B1**        |

To reach PASS the design needs: a payload classification that never clears the lock on a non-answer (B1), a
total predicate (B2), and an explicit re-freeze of the run's `delivered`/`cleared` invariant with the
interleaving table in §3 of this file attached (B3). Sections §4–§9 below are the supporting analysis the
redesign must answer point by point.

**Answer to the gate question, in one line:** _as written, the design cannot double-issue through its
ordering, but it can double-issue through B1, and it can crash the process through B2._

---

## 1. Evidence base (what this verdict was actually read against)

| #   | Artefact                     | Where                                                                                                                                                                                                                                                                                                                                                                                                                                         | What it settles                                                                                                          |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| R1  | `reconcileSubmission` today  | `packages/typescript/src/client.ts:373-406` — inquiry at `:390`, `delivered` `:395`, `cleared` `:396`, delete `:398`, `return` `:400`                                                                                                                                                                                                                                                                                                         | The delete is already last today; one logical call                                                                       |
| R2  | `reconcile_submission` today | `packages/python/src/py_dgii_ecf/client.py:484-523` — inquiry `:507`, `delivered` `:512`, `cleared` `:513`, delete `:515`                                                                                                                                                                                                                                                                                                                     | Same shape, sync                                                                                                         |
| R3  | Marker lifecycle on send     | `client.ts:181-204` (`:195` set pending, `:200` delete on failure), `client.py:264-292`                                                                                                                                                                                                                                                                                                                                                       | A pending marker survives **only** a crash between `set` and the outcome write; a failed send already clears its own key |
| R4  | `ReconciliationResult`       | `packages/typescript/src/reconciliation.ts:8-17`; `packages/python/src/py_dgii_ecf/reconciliation.py:17-31`                                                                                                                                                                                                                                                                                                                                   | No `track`, no track list — the only reason-bearing fields are `delivered`/`canReuseSequence`/`cleared`                  |
| R5  | Predicate today              | `reconciliation.ts:29-31` (`=== false` only); `reconciliation.py:40` (`is False` only)                                                                                                                                                                                                                                                                                                                                                        | No `estado` touched, so B2 is **new** code                                                                               |
| R6  | 200-with-no-body path        | `http.ts:202-222` — `readBody` returns `undefined` for an empty body (`:208-210`), `parseResponse` returns `ok(data as T)` (`:221-222`); Python `_parse` returns `None` when `response.json()` raises and text is empty (`http.py:143-150`)                                                                                                                                                                                                   | **A 200 with an empty body reaches reconcile as `ok(undefined)` / `Ok(None)` today.** That is the input B1 misclassifies |
| R7  | Python list normaliser       | `client.py:102-117` — `data is None → Ok([])`                                                                                                                                                                                                                                                                                                                                                                                                 | Python _already_ maps "no body" to "no records"; the design's §5 step 5 promotes that to a marker-clearing rule          |
| R8  | Retry composition            | `resilience.ts:96-101` (`wrap(retry, breaker, timeout, bulkhead)`); `resilience.py:76-84` (tenacity outside pybreaker)                                                                                                                                                                                                                                                                                                                        | Retry is **outside** the breaker in both packages; the timeout is **per attempt**                                        |
| R9  | Attempt counts (measured)    | TS: cockatiel `maxAttempts: 3` → **4 total attempts** (`RetryPolicy.js:59`, probe: `attempts= 4`). Python: `stop_after_attempt(3)` → **3 total attempts** (probe: `python attempts = 3`)                                                                                                                                                                                                                                                      | The design's "3 attempts" is right for Python and **wrong for TypeScript** (§6)                                          |
| R10 | Breaker-open error shape     | TS: `BrokenCircuitError` → `toDgiiError` → `code: 'UNKNOWN'`, `retryable: false` (`errors.ts:221,259`); `project-docs/architecture.md:841-842` ("`TIMEOUT` and `CIRCUIT_OPEN` … the SDK does not currently emit them"). Python: pybreaker raises `CircuitBreakerError("Timeout not elapsed yet, circuit breaker still open")` → `is_retryable_error` sees `"timeout"` → **retryable** (`resilience.py:53-56`; probe: `retryable(open)? True`) | §7's parenthetical listing `CIRCUIT_OPEN` as a propagated code is factually wrong in both packages                       |
| R11 | Breaker/bulkhead scope       | one `new HttpClient(...)` per `ECF` (`client.ts:139`), one `ResiliencePolicy` per `HttpClient` (`http.py:129`)                                                                                                                                                                                                                                                                                                                                | Query calls and `sendElectronicDocument` **share** the breaker (5) and the bulkhead (20/40)                              |
| R12 | Promised user contract       | `docs/en/guides/resilience.md` — "Max attempts 3", "The marker is cleared **only** when DGII reports `No encontrado`", "An absent flag is treated as **not** reusable", and the retry loop shown at the call site (`if delivered … else if cleared …`)                                                                                                                                                                                        | The design's clearing rule must remain expressible as _"DGII reported it"_                                               |
| R13 | Run invariants               | `126-can-reuse-sequence-ledger.md` ("`delivered`/`cleared` semantics unchanged"; marker cleared **only** on `No encontrado`); `126-tasklist.md:98,509,552`                                                                                                                                                                                                                                                                                    | B3                                                                                                                       |
| R14 | Design text under review     | `126-contract-design.md` §4.1, §5 (steps 1-11), §5.1, §6 (rules 1-4), §7, §8, §10, Q5, Q8, Q9                                                                                                                                                                                                                                                                                                                                                 | Cited inline below                                                                                                       |

---

## 2. Q1 — Ordering: verdict **cannot double-issue**

### 2.1 The walk (design §5, steps 1-11)

| Step                                                  | I/O                      | Failure →                                           | Marker                             |
| ----------------------------------------------------- | ------------------------ | --------------------------------------------------- | ---------------------------------- |
| 1-3 root/RNC/e-NCF extraction + classification        | pure                     | `Err(VALIDATION)`                                   | untouched (no write ever happened) |
| 4 `trackStatuses` (`ECF`) / 7 `inquiryStatus` (other) | READ 1                   | `Err` propagated unchanged                          | untouched                          |
| 5-6 normalise, classify, optional `statusTrackId`     | pure + READ 2            | `Err` propagated unchanged                          | untouched                          |
| 8 `delivered`/`cleared`                               | pure                     | `cleared = !delivered` from existence only          | not yet written                    |
| 9 `buildIdempotencyKey`                               | pure                     | cannot fail (fallbacks `unknown-rnc`/`unknown-ncf`) | —                                  |
| 10 `delete` when `cleared`                            | WRITE, **last fallible** | throws → escapes (pre-existing, S6)                 | gone if the store applied it       |
| 11 `Ok({...})`                                        | pure                     | —                                                   | —                                  |

**Invariant verified:** between `delete` (`:10`) and `return` (`:11`) there is no network call, no parse and
no store op. Every `Err` return is _before_ `:10`. Therefore **the deletion cannot happen on a partial
read** — a failed or half-read `consultatrackids`/`consultaresultado` aborts above the delete.

One correction to the design's own reasoning (§8, "the reviewer proves it"): the rule "no network call after
the delete" is **stronger than necessary**. Deleting the marker only happens when the SDK believes DGII holds
nothing, and in that state a later read cannot make a retry unsafe. The rule is still the right _belt_, keep
it — but it is not what protects the lock. **Classification (§3/B1) is what protects the lock.** A reviewer
who certifies the ordering and stops there certifies the wrong thing.

### 2.2 The four required interleavings

| #   | Sequence                                                               | Design outcome                                                                                                          | Marker            | Duplicate possible?                                                                                                                                       |
| --- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I-1 | Call 1 succeeds (`Aceptado`), call 2 fails (`503`)                     | `Err(HTTP)` propagated; `delivered` computed but not returned                                                           | **intact**        | No. Caller rule under `Err` = "retry reconcile later" (`docs/en/guides/resilience.md`)                                                                    |
| I-2 | Call 1 succeeds (one track), call 2 returns an empty payload           | `delivered = true`, `cleared = false`, then `canReuseSequence(result)` → **B2 throws** (`estado.trim()` on `undefined`) | intact            | No duplicate, but the process crashes (§5, B2). With B2 fixed: `Ok(delivered: true, canReuseSequence: false)` — correct                                   |
| I-3 | Both succeed, flag present (`Rechazado` + `secuenciaUtilizada: false`) | `Ok(delivered: true, canReuseSequence: true, cleared: false)`                                                           | **stays pending** | No. `delivered: true` tells the caller not to re-send this XML; the reusable number must be re-signed (new hash → new key), which is safe by construction |
| I-4 | Both succeed, flag absent (`Rechazado`, no `secuenciaUtilizada`)       | `Ok(delivered: true, canReuseSequence: false, cleared: false)`                                                          | **stays pending** | No                                                                                                                                                        |
| I-5 | Call 1 returns zero usable tracks                                      | `delivered: false, cleared: true` → delete                                                                              | **deleted**       | **Only if call 1's "zero usable tracks" is wrong** — see §3                                                                                               |

### 2.3 Verdict

**Ordering: PASS.** No call ordering in §5 can produce a duplicate or a misreadable marker by itself.
**The design's duplicate risk lives entirely in I-5's classification and in the `null`/absent payload
mapping of §5 step 5 (B1).** That is the finding this gate turns on.

---

## 3. Q2 — The existence-source change (`consultaestado` → `consultatrackids`)

### 3.1 What actually changes

| Aspect          | Today                                                                                   | Design                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Negative signal | A **stated state**: `codigo: 0, estado: 'No encontrado'` (`types.ts`, `types.py`, docs) | A **stated state** (`[{estado:'No encontrado'}]`) **or an empty/absent payload** (`[]`, `null`, `undefined`) — §5 step 5 |
| Clearing test   | `estado !== 'No encontrado'` (raw equality, `client.ts:395`)                            | `trimmed estado != 'No encontrado'` (§5 step 8, "today's rule, today's string" — **it is not**: today does not trim)     |
| Semantic object | "does the e-NCF exist for this RNC"                                                     | "does the tramitación index hold a track for this e-NCF"                                                                 |

Two of those three are safety-relevant: an **absence** becomes a negative answer, and **trimming** turns a
padded state into a negative answer (loosening the lock, not tightening it — the opposite direction from
§6 rule 4's argument, which is only valid for the `Rechazado` gate).

### 3.2 Interleaving table — "new source says no record while DGII holds the document"

| #   | Interleaving                                                                                                                                                                                                                | New source sees                                                                 | Consequence with the design as written                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-1 | **Endpoint answers 200 with an empty body.** IIS/ASP.NET returning `Content-Length: 0` for an empty result set, a proxy truncating, or the route publishing nothing (`_parse` `text=""` → `data=None`)                      | `undefined` / `None` → §5 step 5 → `[]`                                         | `cleared = true` → **marker deleted → caller re-sends a document DGII already has → duplicate e-NCF.** Trigger is invisible: `Ok`, no warning, `delivered: false`                                                                                                                                                            |
| E-2 | **Brand-new document not yet indexed.** Marker is pending because the process died right after transmit; the send was accepted                                                                                              | `[]` (index not yet visible)                                                    | Same as E-1. **Not introduced by the design** — today's `consultaestado` has the same window — but the design _widens_ it: an explicit `No encontrado` at least means DGII looked; `[]` does not. Design Q5 admits the shape is unverified and still clears on it                                                            |
| E-3 | **Different environment holds the document.** One Redis store shared by a `CerteCF`/`TesteCF` client and a `Prod` client: `buildIdempotencyKey` has **no environment component** (`client.ts:158-173`, `client.py:223-239`) | The _other_ environment's index → "no record"                                   | Marker cleared. A later retry on the prod client finds no marker and **transmits a second time to production**. Pre-existing (any negative from the wrong env clears), and §4.1 ("attempt the call, DGII decides") is unobjectionable — but the design must state that the store is per-environment, and T8 must document it |
| E-4 | **Certification environment, endpoint unpublished** (design E8/Q3)                                                                                                                                                          | `404`/`502` → `Err` (safe). A blank 200 on the unpublished route → E-1 (unsafe) | The design's own §4.1 argument ("a missing URL in a PDF is not proof the service is absent") is fine **only if** a non-answer can never clear. It can (B1)                                                                                                                                                                   |
| E-5 | `consultatrackids` reachable, but the token is delegated as _receiver_ (design E14 vs E11, Q4)                                                                                                                              | `401`/`403` → `Err` (safe, `errors.ts:221` is not retryable for 403/401)        | Safe. Marker intact, error visible                                                                                                                                                                                                                                                                                           |
| E-6 | `consultaresultado` says `No encontrado` for a listed track                                                                                                                                                                 | `delivered` stays `true` (§5.1)                                                 | **Correct**, and the single best part of the design: a contradiction inside DGII's data never clears a fiscal lock                                                                                                                                                                                                           |
| E-7 | 5 consecutive failures from **other** traffic open the shared breaker between call 1 and call 2                                                                                                                             | `BrokenCircuitError` → `Err(UNKNOWN)` (R10)                                     | No duplicate; an `Ok` answer becomes `Err` (§6.3)                                                                                                                                                                                                                                                                            |

### 3.3 The invariant that is being tested, stated precisely

> The marker may be deleted **only** when DGII has _said_ it holds no record — never when the SDK merely
> failed to hear a record.

`docs/en/guides/resilience.md` (R12) already promises exactly this to users ("cleared **only** when DGII
reports `No encontrado`"). §5 step 5 preserves it for I-1..I-4 and breaks it for E-1/E-2/E-4.

### 3.4 Exact duplicate sequence produced by the design as written

```
1. Worker transmits E310000000001 to prod. DGII accepts and stores it.
2. Response never arrives; the process dies before the outcome is written
   (client.ts:195 already stored "pending")            -> marker = pending
3. New worker calls reconcileSubmission(signedXml).
4. [READ 1] ConsultaTrackIds returns HTTP 200 with an empty body
   (http.ts:208-210 -> undefined; py http.py:143-150 -> None).
5. [PURE]  design §5 step 5: null/undefined -> []  -> usable = []  -> step 6(a)
6. delivered=false, cleared=true
7. [WRITE] idempotency.delete(key)                      -> lock gone
8. Caller follows docs/en/guides/resilience.md ("no record; the marker was
   cleared and a retry is safe") and re-sends the same e-NCF.
9. DGII now holds two documents for one e-NCF (design E10 records that DGII
   itself reports several tracks in exactly this situation).
```

Steps 4-6 are B1. Step 7 is correct given step 6. Everything downstream of the design's ordering is right;
the design gets the _decision_ wrong.

---

## 4. Q3 — Added round trips and the resilience posture

### 4.1 Call-count table (logical HTTP requests per `reconcileSubmission`, before → after)

| Path                                                                 | Before                                                          | After                      | Δ                                       | Note                                                                                    |
| -------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------- |
| P1 general e-CF, zero usable tracks                                  | 1 (`consultaestado`)                                            | **1** (`consultatrackids`) | 0                                       | same count, different service                                                           |
| P2 general e-CF, exactly one usable track (**the case being fixed**) | 1                                                               | **2**                      | **+1**                                  | `consultatrackids` + `consultaresultado`                                                |
| P3 general e-CF, several tracks                                      | 1                                                               | **1**                      | 0                                       | collapse (§5.2)                                                                         |
| P4 general e-CF, one entry without `trackId`                         | 1                                                               | **1**                      | 0                                       | collapse                                                                                |
| P5 non-`ECF` root (RFCE/ACECF/ANECF/unknown)                         | 1                                                               | **1** (`consultaestado`)   | 0                                       | unchanged                                                                               |
| P6 call 1 fails                                                      | 1                                                               | **1**                      | 0                                       | call 2 never runs                                                                       |
| P7 call 1 ok, call 2 fails                                           | **n/a** (would have been `Ok` after 1 call)                     | **2**                      | **+1, and the answer flips `Ok`→`Err`** | see §6.3                                                                                |
| P8 any call answered `401`                                           | ×2 (replay after re-auth, `http.ts:236-252`, `http.py:196-215`) | ×2                         | 0                                       | re-auth itself is 2 further requests (Seed + ValidarSemilla), excluded before and after |
| P9 auth round trip inside a reconcile (token expiry)                 | +2                                                              | +2                         | 0                                       | unchanged, but it is _inside_ the wall clock (§7)                                       |

### 4.2 Transport attempts (measured, R9)

| Layer                             | TypeScript                           | Python                                    |
| --------------------------------- | ------------------------------------ | ----------------------------------------- |
| Total attempts per logical call   | **4** (`maxAttempts: 3` = 3 retries) | **3** (`stop_after_attempt(3)` = 3 total) |
| Worst-case wall clock, P1/P5      | ≈ 4×15 s + 0.7 s ≈ **60.7 s**        | ≈ 3×15 s ≈ **45 s**                       |
| Worst-case wall clock, P2 (after) | ≈ **121 s**                          | ≈ **90 s**                                |

**Design §10 says "2 requests × 3 attempts × 15 s = ~90 s (today ~45 s)".** True for Python; **34 % low for
TypeScript**, which makes 4 attempts. This also exposes a pre-existing parity defect (TS 4 attempts vs PY 3
with the same nominal setting) that T6/parity must not "fix" in this run — but the design's cost model must
not restate a number that is wrong for one package.

### 4.3 Blast-radius diff

| Property                                                                                                  | Before                         | After                                                                          | Verdict                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mutating calls in the chain                                                                               | 0 (all reads)                  | 0                                                                              | Unchanged. Reconcile can never itself duplicate; only the _decision_ it feeds can                                                                                                                                                         |
| Consecutive breaker events per reconcile, single-threaded                                                 | ≤ 4 (TS)                       | ≤ 4 (TS)                                                                       | **Design claim holds**: call 2 runs only after call 1 **succeeded**, and a success resets `ConsecutiveBreaker`                                                                                                                            |
| Breaker events per reconcile, concurrent                                                                  | ≤ 4                            | ≤ 4                                                                            | Still holds per call; but see next row                                                                                                                                                                                                    |
| Breaker opens ~2× faster in wall-clock time during a **read-only** degradation (`consultaresultado` down) | 5 failed reconciles ≈ 5 calls  | 5 failed reconciles ≈ 5 calls, but each failures' _source_ is the flag service | Because the breaker and the bulkhead are **shared with `sendElectronicDocument`** (R11), a read-side outage can now fail submissions fast. Today the same is true via `consultaestado`; the design doubles the exposure without saying so |
| Bulkhead permit hold time (20 permits / 40 queued, R11)                                                   | ≤ 60.7 s (TS)                  | ≤ 121 s (TS)                                                                   | §10's "halving reconcile throughput per permit during an incident" understates it: those permits **are the submission permits**                                                                                                           |
| `Ok` → `Err` flips where today reconcile answered                                                         | —                              | P7, and E-7 (breaker opened between call 1 and call 2 by concurrent traffic)   | Accepted by §7's fail-loud posture, but **not documented**; §10 asserts only that the breaker cannot see _more failures_, which is a different claim                                                                                      |
| New dependency                                                                                            | `consultaestado` (TesteCF/eCF) | `consultatrackids` (TesteCF/eCF **only**, design E8/E9)                        | CerteCF: the call is attempted with no published URL. Design Q3 accepts this; §4.1's argument is sound _provided_ a non-answer can never clear (B1)                                                                                       |

**Answer to "can a breaker-open error now surface from a second call where today reconcile would have
answered?" — yes**, in exactly two ways, and neither is in the design: (a) P7, where the second call cannot
be reached from a failed first call but _can_ be reached when the breaker was opened by another coroutine
between the two calls; (b) the Python variant, where the breaker-open error is **retried** three times
(R10) because pybreaker's message contains "timeout", so a Python reconcile against an open breaker costs
three breaker probes instead of one. The answer the caller sees is `Err(UNKNOWN)`, not `Ok(delivered:true)`.

---

## 5. Q4 — Failure semantics for callers

**What the design picks: fail loudly.** Every failed read → `Err`, no partial `Ok` (§7). `canReuseSequence:
false` is reserved for "we asked and DGII did not say reusable" (§6 rule 3). `true` has exactly one origin.

**Is that the right pick for a retry decision? Yes.** The caller's decision under `Err` is "leave the document
alone and retry reconcile later", and the marker is still in place, so the retry cannot double-issue. A
plausible-looking `false` (§7's rejected option F) is indistinguishable from a real "not reusable" — which is
literally the defect #126 exists to fix. Degrading would re-create it one layer down.

**Does the answer differ between "could not ask" and "asked, no flag"? Yes, and it must.** The design gets
this right in principle:

| Situation                                                  | Design answer                                                                         | Correct?                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Could not reach DGII                                       | `Err`, marker intact                                                                  | yes                                                                                                                                                                                                                                                                                      |
| Asked; DGII answered `Rechazado` with no flag              | `Ok(false)`, marker intact                                                            | yes                                                                                                                                                                                                                                                                                      |
| Asked; DGII answered `Aceptado`                            | `Ok(false)`, marker intact                                                            | yes                                                                                                                                                                                                                                                                                      |
| Asked; DGII said `secuenciaUtilizada: false` + `Rechazado` | `Ok(true)`                                                                            | yes — only explicit origin                                                                                                                                                                                                                                                               |
| **Could not read a listing (empty/absent payload)**        | `Ok(delivered:false, cleared:true)` — **`cleared` is destructive, not informational** | **no (B1).** For an informational field `false` is conservative; for `cleared` the same `false` **releases a fiscal lock**. §7's own argument ("a plausible-looking `false` is not honest") applies with double force to `cleared`, and the design applies it only to `canReuseSequence` |

**One gap in §7's recovery claim.** §7 says the caller can "already obtain, correctly, from `trackStatuses`
alone" the answer lost when call 2 fails. True, but it requires the caller to know _which_ reconcile failure
was post-existence, and the error carries no such discriminator (no `delivered`, no stage marker; the only
signal is `error.resource`). Minimum requirement: T8 must document that on `Err` from
`reconcileSubmission` the caller must **not** re-send, must retry reconcile, and may separately call
`trackStatuses` to learn existence. Don't add a partial `Ok`; do make the recovery path written down.

---

## 6. Q5 — Retry amplification

1. **Inside the SDK, bounded.** No loop in §5; P2 is the maximum (2 logical calls). The bound does not grow
   with DGII's answer — §5.2's refusal to iterate tracks is the reason, and it is the right call.
2. **Across caller-level retries, multiplicative.** A queue worker retrying reconcile 3× on a scheduled
   basis turns P2 into 6 logical calls (24 transport attempts in TS) versus 3 (12) today. The SDK cannot fix
   that, but §10 must say it: **reconcile's SDK retry policy is the retry policy**; callers must not stack
   their own tight retry loop on top, they must schedule the next reconcile attempt (the queue's backoff, not
   a nested loop).
3. **Cheaper cache-friendly ordering?** No reordering helps: `consultaresultado` is unreachable without a
   `trackId`, and the trackId is only discoverable via `consultatrackids`. The one cheap win available is to
   **not ask for the flag when the caller cannot act on it** — the queue's retry decision needs only
   `delivered`/`cleared` (P1/P3/P5 = 1 call). The design gives no way to express that (no
   `reconcileSubmission(xml, { reusabilityOnly?: boolean })` or inverse). Adding a 1-line option that skips
   step 6(b) would let every retry-gate caller stay at today's cost and reserve the 2-call chain for callers
   that will actually reuse the number. Recorded as **S7**, not a blocker.
4. **No write amplification.** Reconcile is read-only; the amplified calls cannot mutate DGII state. The only
   write is the marker, executed at most once, at the end.

---

## 7. Q6 — Timeout budget

Measured worst case for one `reconcileSubmission` (R9), no auth refresh, no 401 replay:

|            | Before | After       | Design's claim |
| ---------- | ------ | ----------- | -------------- |
| TypeScript | ≈ 61 s | **≈ 121 s** | "~90 s"        |
| Python     | ≈ 45 s | **≈ 90 s**  | "~90 s"        |

With one token refresh inside the chain (2 extra requests, each subject to the same 4/3 attempts) the TS
figure reaches ~240 s and the Python figure ~180 s; a single 401 replay doubles the call's own attempts
(`http.ts:236-252`). The design counts neither, before or after, so the _delta_ is still 2× — but the absolute
number is what an operator sizes a lease with.

**Is ~121 s acceptable for "a queue worker reconciling before a retry"? No, unqualified.** The failure mode
is not the 2 minutes themselves, it is the lease:

```
1. Worker leases a job with, say, a 100 s visibility timeout.
2. reconcileSubmission runs P2 -> up to 121 s (TS).
3. Lease expires mid-reconcile; the queue hands the same job to worker B.
4. A and B both call reconcileSubmission for the same signed XML. singleFlight only
   dedupes inside one process (client.ts:206-221), so both run.
5. Both read "no record" (B1 or a genuinely absent record), both clear the marker,
   both re-send between the delete and the other's `set(pending)` window
   (client.ts:195) -> two transmissions of one e-NCF.
```

Step 5 is the **hang/duplicate coupling**: the doubled budget widens the window in which two independent
processes reconcile the same document, and the marker cannot arbitrate between them once it is deleted.

**Required changes:**

- **F6a** — §10 must publish the real per-call budget per package (`maxRetries + 1` attempts in TS, `3` in
  PY), and state plainly: _a single reconcile may occupy a bulkhead permit for up to ~2 minutes in
  TypeScript and ~90 s in Python, before auth refreshes and 401 replays._
- **F6b** — The design must state the caller obligation it creates: **the queue lease must exceed the
  reconcile worst case, or the caller must reconcile in a lease-renewing/leader-elected context.** That
  sentence belongs in `project-docs/architecture.md` §9.3 (T8) and in `docs/{en,es}/guides/resilience.md`.
- **F6c** — No deadline propagation exists in either package (no `AbortSignal`/deadline parameter on the
  query methods). #126 must not invent one, but §10 must stop implying the chain is "bounded and
  predictable" without naming the caller-side consequence (it currently says exactly that).

---

## 8. Q7 — Observability: can an operator tell _why_ `canReuseSequence` is `false`?

With the design's fields (`delivered`, `cleared`, `canReuseSequence`, `inquiry`, `track`):

| Cause                               | Observable signal in the design                                                                                | Distinguishable?                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| C1 no track / no record             | `delivered:false, cleared:true`                                                                                | **yes**                                                                         |
| C2 several tracks                   | `delivered:true, track:null, inquiry:null`                                                                     | collides with C3                                                                |
| C3 one entry without `trackId`      | `delivered:true, track:null, inquiry:null`                                                                     | collides with C2                                                                |
| C4 one track, verdict ≠ `Rechazado` | `track.estado` readable                                                                                        | **yes**                                                                         |
| C5 `Rechazado` with the flag absent | `track.estado === 'Rechazado'`, `secuenciaUtilizada` missing                                                   | **yes**                                                                         |
| C6 call failed                      | `Err`, `error.resource` = `ConsultaTrackIds/api/TrackIds/Consulta` or `consultaresultado/api/Consultas/Estado` | **yes** (the two resource strings differ, and differ from `consultaestado/...`) |
| C7 non-`ECF` root                   | `inquiry` non-null, `track` null                                                                               | **yes**                                                                         |

So 5 of 7 are answerable and **only C2 vs C3 collapses** — and C2 is the fingerprint of a past
double-submission (design E10, Q8). Collapsing "DGII holds several tracks for this e-NCF" into "not reusable,
nothing to see" is the one case where the operator most needs the discriminator. Q8's "no new field in #126"
is therefore **not acceptable for the incident path**; the minimum discriminating information is _the listing
itself_.

**F7 (minimum):** add to `ReconciliationResult` an additive `tracks: SummaryTrackingStatusResponse[]`
(`tracks: list[SummaryTrackingStatusResponse]` in Python), populated on the general e-CF path with the
normalised listing, `[]` on the non-`ECF` path. Additive, no semantic change to `delivered`/`cleared`, and
it gives C1/C2/C3/C4/C5 for free. If a field is politically unacceptable, the alternative minimum is a
discriminated `reuseReason` (`'no-record' | 'no-track-id' | 'multiple-tracks' | 'verdict-not-rejected' |
'flag-absent' | 'flag-true' | 'not-applicable'`), which is less useful and more code.

Also: the SDK emits no logs. The only telemetry is `error.resource` on failures and the caller's own metrics.
§10's existing observability paragraph ("count reconcile outcomes, not raw requests") is right and must be
carried into T8 verbatim, together with the new resource label.

---

## 9. Defects and exact fixes

### Blockers (must fix before PASS)

**B1 — An absent payload clears the fiscal lock.**
Where: design §5 step 5 (bullet 1: "payload null/undefined → `[]`") vs §7 ("a garbage payload would read as
zero tracks and _clear the marker_, which is the one divergence in this design that could double-issue").
Also §5 step 5's `estado` comparison and §5 step 8's "trimmed" `No encontrado` test.

Fix (design text, then T4/T5):

1. §5 step 5 becomes: `null`/`undefined`/empty body → `Err(VALIDATION, 'Unexpected DGII response payload')`;
   single JSON object → `[object]`; array → as-is; anything else → `Err(VALIDATION)`. **Only an explicit
   array that parses may reach the "no record" conclusion.** Same rule for the Python `None` case, which
   today returns `Ok([])` (`client.py:104-105`) — that line becomes an `Err`.
2. S7 (`trackStatuses` normalisation) must carry the same rule, not the older `null → []`: the public method
   returning `[]` for "no answer" is what makes B1 reachable from reconcile in the first place (R6/R7).
3. The `No encontrado` existence test becomes **raw equality, no trimming** in both packages:
   `estado !== 'No encontrado'` / `estado != "No encontrado"`. Delete the word "trimmed" from §5 steps 5 and 8. Trimming is only allowed in the `Rechazado` gate (§6 rule 1), where it is the safe direction. Today's
   code does not trim (`client.ts:395`), so §5 step 8's "today's rule" is currently false.
4. **Four mandatory tests, both suites, before the fix's PASS:** (a) `200` with an empty body → `Err` **and**
   the pending marker still readable; (b) body `null` → `Err` **and** marker still readable; (c) body `[]` →
   `Ok(delivered:false, cleared:true)` **and** marker gone; (d) `[{estado:'No encontrado'}]` → same as (c).
   Test (a) is the executable form of the duplicate sequence in §3.4 of this file; it must be observed
   failing first (the run's close rule) and it must exist in **both** suites.

**B2 — The predicate is not total; it can throw out of `reconcileSubmission`.**
Where: §6's code blocks (`response.estado.trim()` / `response.estado.strip()`) combined with S6
(`estado?: string` / `str | None`) and §6 rule 2 ("the predicate must tolerate absence"). Today's predicate
touches no `estado` (`reconciliation.ts:31`, `reconciliation.py:40`), so this is new code.

Fix: write the predicate so it cannot throw, in both packages, and put it in the design verbatim:

```ts
export const canReuseSequence = (
  response: TrackingStatusResponse | InquiryInvoiceSummary,
): boolean =>
  response.secuenciaUtilizada === false &&
  (response.estado ?? '').trim() === 'Rechazado';
```

```python
def can_reuse_sequence(
    response: TrackingStatusResponse | InquiryInvoiceSummary,
) -> bool:
    return (
        response.secuencia_utilizada is False
        and (response.estado or "").strip() == "Rechazado"
    )
```

Plus a test per suite: flag present + `estado` absent → `Ok`, `canReuseSequence: false`, no exception. And
§6 rule 2 gains the sentence: _"`estado` is read defensively with a `''`/`""` default; a missing `estado` is
`false`, never an exception."_ Note this is also a parity requirement (C-2): a thrown `AttributeError` in
Python and a `TypeError` in TypeScript are not the same observable behaviour.

**B3 — `delivered`/`cleared` are re-derived from a new source without the run's required re-freeze, and
`cleared` hangs on absence.**
Where: design §2/§4/§5.1 vs run invariant (ledger I2/I3) and `126-tasklist.md:98,509,552`.

Fix — pick one and write it into the design, then re-run T2 (C-1 re-freeze requires it anyway):

- **B3-option A (preferred, minimum risk):** keep `delivered`/`cleared` derived from `inquiryStatus`
  exactly as today (`client.ts:390-399` unmoved), and run `trackStatuses` → `statusTrackId` **after** the
  `cleared` decision for the flag only. Cost: P2 becomes 3 calls (inquiry + track list + result) for the flag
  case; failure of the flag chain can then be `Err` with the marker untouched, and `cleared` is decided by a
  stated DGII state, never by a listing. Ordering note: the flag chain must run **before** step 10's delete to
  keep §8's rule, which means a flag-service outage delays the clear (a wedge, safe, visible). If the design
  prefers to keep 2 calls, it must say why the extra call is worth more than the frozen invariant.
- **B3-option B:** keep the design's 2-call chain, but add a paragraph to §5.1 titled _"What this changes
  outside the flag"_ that (i) states that `delivered`'s source changed, (ii) attaches the interleaving table
  of §3.2 of this file, (iii) constrains clearing to a **stated** DGII state, and (iv) is signed off as an
  explicit amendment of ledger I3 by the orchestrator before T4 starts. Silence is not an option: T9 checks
  `I3` against the tasklist, and T4/T5 will implement whatever the design says.

Independently of A/B, adopt **F3d**: after step 5 yields no usable track, **do not clear on one source
alone**. One extra `inquiryStatus` call on the _clearing_ path only:

```
(a') usable is empty:
       inquiry = inquiryStatus(rnc, encf)          // [READ 2'] consultaestado
       on Err -> return Err (marker untouched)
       delivered = (inquiry.estado != 'No encontrado')   // raw, untrimmed
       cleared   = !delivered
```

This costs +1 call only when the SDK is about to delete the fiscal lock, and it converts "one source says
nothing" into "two independent sources said nothing". It is the cheapest available mitigation for E-1/E-2/E-4
that does not change `delivered`'s meaning and does not touch the retry predicate.

### Suggestions (should fix)

| ID     | Issue                                                                                                                                                                                                                                                           | Exact fix                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **S1** | §7 lists `CIRCUIT_OPEN` among the propagated codes; neither package emits it (R10, `architecture.md:841-842`).                                                                                                                                                  | Delete `CIRCUIT_OPEN` and `TIMEOUT` from §7's enumeration, or add a one-line note: "a breaker-open failure arrives as `UNKNOWN` today; mapping it to `CIRCUIT_OPEN` is a separate change and is not part of #126." Do not let T8 document a code the SDK does not produce.                                                                                                                                         |
| **S2** | §10 asserts the breaker "cannot see more failures per reconcile than it does today" — true for failures, silent about the new `Ok`→`Err` surface (P7/E-7) and about the shared breaker/bulkhead with `sendElectronicDocument` (R11).                            | Add two sentences to §10: (i) the chain can now return `Err` where it used to return `Ok(delivered:true)`, when the shared breaker opens between call 1 and call 2; (ii) a `consultaresultado` outage can fail submissions fast because the breaker and the bulkhead are shared — recommend a dedicated reconcile worker/limit in T8's docs, and record a follow-up for a separate `HttpClient` on the query path. |
| **S3** | Python retries the breaker-open error three times, because pybreaker's message contains "timeout" and `is_retryable_error` matches on message text (`resilience.py:53-56`, measured). A broken circuit is not transient.                                        | Not in #126's scope (retry predicate is frozen), but record a follow-up issue: match `CircuitBreakerError` explicitly **before** the message heuristic in `is_retryable_error`, and add a test asserting a single breaker probe. Mention it in §10 so the doubled chain is not blamed for it.                                                                                                                      |
| **S4** | Cost model: §10's "3 attempts" is wrong for TypeScript (4).                                                                                                                                                                                                     | Restate §10 per package, and note the pre-existing TS/PY attempt-count divergence as its own follow-up. Do **not** change `resilience.ts`/`resilience.py` in #126.                                                                                                                                                                                                                                                 |
| **S5** | A rejected-but-reusable document keeps its pending marker forever (§5 step 6b: `delivered:true` → `cleared:false`), so a byte-identical re-send returns `IDEMPOTENCY` until the 24 h TTL, with no signal that the _correct_ action is "re-sign the same e-NCF". | Leave `cleared` alone (never clear on `delivered`), but say it in the design and in T8: _"`canReuseSequence: true` with `cleared: false` means: do not re-send this document; re-sign the same e-NCF as a new document."_ The public docs' sample (`docs/en/guides/resilience.md`) only handles `delivered`/`cleared` and never shows the reusable branch.                                                         |
| **S6** | Pre-existing: a throwing `delete` escapes as an exception (§8 keeps it). If the store applied the delete and then threw, the caller gets an exception with the lock already gone — the one place where a non-`Result` failure has destructive consequences.     | Do not fix in #126 (frozen). Record a follow-up: wrap `delete` in `try/catch` → `Err`, with `cleared` reported as `false` because the marker's state is unknown. State in §8 that this is the only fallible statement whose failure can be destructive, so nobody "simplifies" it later.                                                                                                                           |
| **S7** | Every retry-gate caller now pays for a flag it will not use (P2 = 2 calls where `delivered` alone needs 1).                                                                                                                                                     | Optional, additive: `reconcileSubmission(signedXml, options?: { includeReusability?: boolean })` defaulting to today's behaviour (include), so a queue's retry gate can stay at 1 call. If rejected, say why in §11.                                                                                                                                                                                               |
| **S8** | Store scoping: `buildIdempotencyKey` has no environment component (`client.ts:158-173`), so a shared Redis used by a `CerteCF` client and a `Prod` client lets the test environment clear the production lock (E-3).                                            | Key derivation is frozen (S8 of the design). Fix in T8: `docs/{en,es}/guides/resilience.md` and `architecture.md` §9.3 must state **one store (or one key namespace) per environment**. Not a code change in #126.                                                                                                                                                                                                 |

---

## 10. Resilience-posture diff (one screen)

|                                               | Before                             | After (design)                                                 |
| --------------------------------------------- | ---------------------------------- | -------------------------------------------------------------- |
| Logical calls, worst path                     | 1                                  | 2                                                              |
| Transport attempts, worst path (TS / PY)      | 4 / 3                              | 8 / 6                                                          |
| Wall clock, worst path (TS / PY)              | ≈ 61 s / 45 s                      | ≈ 121 s / 90 s                                                 |
| Bulkhead permits held                         | 1 at a time, ≤ 61 s                | 1 at a time, ≤ 121 s — **shared with submissions**             |
| Breaker events per reconcile                  | ≤ 4 / 3                            | ≤ 4 / 3 (call 2 only after call 1 succeeded)                   |
| New `Ok`→`Err` surface                        | —                                  | P7 + breaker-opened-between-calls (E-7)                        |
| New destructive-decision surface              | none                               | **marker deletion now depends on a listing** (B1)              |
| Caller-visible contract                       | `Ok`/`Err`; `cleared` ⇒ retry safe | unchanged _shape_, **changed meaning of the `Ok` that clears** |
| Retry predicate / breaker threshold / timeout | network+408/429/5xx · 5 · 15 s     | **unchanged** (correct; `AGENTS.md`)                           |

---

## 11. Re-entry criteria for attempt 2

PASS on attempt 2 requires, in the design text (no code yet):

1. **B1 fixed:** §5 step 5 and S7 map `null`/absent/empty → `Err(VALIDATION)`; only an explicit array (or a
   `No encontrado` entry) may clear; the four required tests are named in §13's parity checklist, in both
   packages, with the empty-body test observed failing first.
2. **B1 fixed (trimming):** the existence test is raw equality; "trimmed" is removed from §5 steps 5 and 8 and
   survives only inside the `Rechazado` gate.
3. **B2 fixed:** §6 shows the total predicate (code above) and a missing-`estado` test per suite.
4. **B3 fixed:** either Option A (keep `inquiryStatus` for `delivered`/`cleared`, flag chain after the
   decision) or Option B (explicit amendment of ledger I3 signed by the orchestrator, with §3.2's interleaving
   table attached and F3d adopted).
5. **F6a/F6b:** §10 carries the measured per-package budget and the caller-lease obligation.
6. **F7:** the `tracks` field (or the `reuseReason` enum) is in the public-surface table, so C2 vs C3 is
   visible.
7. **S1/S2/S4 wording landed** (no false claims about emitted error codes, breaker behaviour, or attempt
   counts).
8. Every remaining suggestion (S3, S5, S6, S8, and S7 if rejected) is recorded as a named follow-up rather
   than dropped.

With 1-4 in place I can state the gate's own sentence: **the design cannot cause a duplicate fiscal
submission, and cannot leave a marker in a state the next attempt misreads.**

---

## Outcome

Outcome: FAIL (attempt 1 of 3) — ordering is sound, but the design clears the fiscal lock on a non-answer (B1), throws out of `reconcileSubmission` on a legal payload shape (B2), and re-derives `delivered`/`cleared` without the run's required re-freeze (B3).
Details: B1 is the duplicate vector — `null`/absent `consultatrackids` payload → `[]` → `cleared: true` → marker deleted → re-send of a document DGII holds. B2 is a `TypeError`/`AttributeError` escape from the new predicate. Fixes: empty/absent payload must be `Err(VALIDATION)` (plus 4 mandatory tests, one per suite), a total predicate, and either keep `inquiryStatus` for `delivered` or amend ledger I3 with double-negative clearing. Also measured: TS does 4 attempts per call (not 3), so worst-case reconcile is ≈121 s, not 90 s.
`project-tasks/126-evidence/t3-reliability-contract-design.md` — PASS/FAIL verdict for attempt 1 of 3 with call-count table (before/after per path), failure-interleaving table, ordering verdict, resilience-posture diff, observability gap analysis, and an exact fix instruction per defect (3 blockers, 8 suggestions) plus re-entry criteria for attempt 2.
