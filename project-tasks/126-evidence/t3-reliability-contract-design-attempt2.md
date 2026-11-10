# T3 — Reliability gate on `126-contract-design.md` (attempt 2 of 3)

**Gate owner:** Reliability Reviewer · **Subject:** the current text of `project-tasks/126-contract-design.md`
(952 lines, adopts **Option A**) · **Verdict: PASS — with four errata that must land before the C-1 freeze is
recorded (§16.6).**

Attempt 1 ran in an interrupted session, so every claim below was re-derived from the current text and from the
code, not from the attempt-1 report. Where attempt 1 was wrong I say so (§6, E-3).

---

## 0. Verdict

**PASS — attempt 2 of 3.** The two sentences this gate exists to certify, restated:

> **This design cannot cause a duplicate fiscal submission.** The only statement that deletes the marker sits
> in the one branch where no further DGII read was ever scheduled, and it is gated on a _positively stated_
> DGII state from the source that has always carried it (`consultaestado.estado == 'No encontrado'`). Every
> other input — absent body, `null`, unreadable object, an empty or multi-entry listing, an entry without a
> `trackId`, a non-`Rechazado` verdict, a failed call — leaves the marker in place and either returns `Ok` with
> `cleared: false` or returns `Err`. Retrying after any `Err`, or re-sending after `Ok(delivered: true)`, is
> blocked by the surviving `pending` marker (`client.ts:195-200`, `client.py:264-292`).

> **The design cannot leave a marker in a state the next attempt misreads.** Every _returned_ `Result` maps to
> exactly the right marker state: `Err` → `pending` (a re-send returns `IDEMPOTENCY`), `Ok(cleared: false)` →
> `pending` (the lock is the point), `Ok(cleared: true)` → deleted _and only after DGII said it holds nothing_.
> Scope of the sentence: it holds for every returned `Result`; a **throwing store `delete`** still escapes as
> an exception with the marker's state unknown — pre-existing, unchanged, frozen, documented in §8.4 and
> carried as F-126-3. I do not certify that path, and the design does not claim to.

Seven of my eight re-entry criteria are MET; the eighth (a new public field) is **not** met literally, is
non-safety, and is refused on a run-level scope guard the design names — I accept the refusal and the PASS does
not rest on it (§2, C6).

The four errata in §6 are **factual corrections, not decisions**: none touches the frozen decision zone, none
requires a third review cycle. One of them (E-2) _is_ safety-adjacent because it is the number an operator sizes
a queue lease against.

---

## 1. Evidence base (read or measured in this session)

| #   | Artefact                                                                                                                                                                                                                                                                                               | What it settles                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| R1  | `packages/typescript/src/client.ts:374-403` — `inquiryStatus` `:390`, `delivered` `:395`, `cleared` `:396`, `delete` `:398`                                                                                                                                                                            | The delete is already last; the two derivation lines are unmoved by Option A                                   |
| R2  | `packages/python/src/py_dgii_ecf/client.py:484-523` — inquiry `:507`, `delivered` `:512`, `cleared` `:513`, delete `:515`                                                                                                                                                                              | Same shape, synchronous                                                                                        |
| R3  | `client.ts:186-204` (`PENDING_SUBMISSION` set before `send()`, deleted on failure), `client.py:264-292`                                                                                                                                                                                                | The marker states that exist: pending / cached response / absent                                               |
| R4  | `packages/typescript/src/http.ts:201-222` — `readBody` → `undefined` for an empty body, `parseResponse` → `ok(data as T)`                                                                                                                                                                              | A `200` with no body is `ok(undefined)` today: the input attempt 1 misclassified, and today's `TypeError` site |
| R5  | `packages/python/src/py_dgii_ecf/http.py:156-179` (`_parse` → `Ok(None)`, and builds `DgiiError` **without** `resource`), `client.py:84-99` (`_parse_one` rejects a non-dict with `Unexpected DGII response payload`), `client.py:102-124` (`_parse_list`: `None → Ok([])`)                            | R5 is why **E-1** and **E-4** exist                                                                            |
| R6  | `packages/typescript/src/environment.ts:20-34` — `InquiryStatus = 'consultaestado/api/Consultas/Estado'`, `AllTrackingEcf = 'ConsultaTrackIds/api/TrackIds/Consulta'`, `TrackResultStatus = 'consultaresultado/api/Consultas/Estado'`                                                                  | The three `error.resource` values are real, distinct, and TypeScript-only                                      |
| R7  | `packages/typescript/src/resilience.ts:96-101` — `wrap(retry, breaker, timeout, bulkhead)`; `defaultResilienceOptions` (`maxRetries: 3`, `timeoutMs: 15_000`, bulkhead 20/40); `packages/python/.../resilience.py:76-96` (`tenacity` outside `pybreaker`, `stop_after_attempt(3)`, `wait_exponential`) | Attempt counts, composition order, and the **per-attempt** bulkhead permit (E-3)                               |
| R8  | Measured this session: cockatiel `maxAttempts: 3` → **4** attempts; `maxAttempts: 2` → 3; a `bulkhead(1,0)` is **free during retry backoff**                                                                                                                                                           | §10.2's 4-vs-3 is correct; §10.4/§10.5's permit-hold claim is not (E-3)                                        |
| R9  | `packages/typescript/src/reconciliation.ts:28-31`, `packages/python/.../reconciliation.py:39-41`                                                                                                                                                                                                       | Today's predicate touches no `estado`, so B2's throw was new code — and §6 now forbids it                      |
| R10 | `packages/typescript/src/types.ts:29-38,47-67` vs `packages/python/.../types.py:209-270`; `_as_str` `types.py:72-79`; `_type_error` `:66-69`                                                                                                                                                           | Confirms P3/P4/P5/P6 and F-126-7; and **E-6** (message parity)                                                 |
| R11 | `packages/typescript/test/reconciliation.test.ts:90-104`, `packages/python/tests/test_reconciliation.py:33-43`                                                                                                                                                                                         | Exactly the fixtures the design says must stop passing (`secuenciaUtilizada` on a `consultaestado` mock)       |
| R12 | `docs/en/guides/resilience.md:100-140` — "The marker is cleared **only** when DGII reports `No encontrado`", "Max attempts 3", and the shipped `delivered`/`cleared` sample                                                                                                                            | The design's clearing rule is expressible as the shipped sentence — it _is_ the same sentence                  |
| R13 | `126-can-reuse-sequence-ledger.md:105-115` — "`delivered` / `cleared` semantics unchanged … marker … cleared **only** on `No encontrado`"                                                                                                                                                              | Option A satisfies I2/I3 unamended (B3 closed by construction)                                                 |
| R14 | Design text under review: §0, §2, §4.1-§4.3, §5 steps 1-11, §5.1-§5.6, §6, §7.1-§7.4, §8.1-§8.4, §9 P1-P11, §9.2, §9.3, §10.1-§10.6, §11, §12, §13, §15, §16                                                                                                                                           | Cited inline                                                                                                   |

Helper confirmations: `extractRootElementName` (`packages/typescript/src/xml.ts:62`) and
`extract_root_element_name` (`packages/python/src/py_dgii_ecf/_xml.py:51`) both exist, so §5 step 2 is
implementable as written. `ErrorCode`/`Endpoint` values checked in R6; no `DgiiErrorContext(...)` is constructed
anywhere in `packages/python/src` (E-1).

---

## 2. Re-entry criteria from attempt 1 — status

| #      | Criterion (attempt 1 §11)                                                                                                                                     | Status                                                | Proof in the current text                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1** | `null`/absent/empty → `Err(VALIDATION)` with the marker still readable; only a positive `No encontrado` may clear; the mandatory tests named in both packages | **MET**                                               | §5.6 table rows 2-3 (`null` / absent body / unparseable → `Err(VALIDATION)`, **never** "no record"; `estado` missing → `Err(VALIDATION)`), §7.1 (propagated unchanged, marker never touched), §8.3 **T-A** (`200` empty body → `Err`, _and the pending marker is still readable_), **T-B** (`null`), **T-C** (object without `estado`, no exception), **T-E** (`consultatrackids` empty body → `Err`, marker readable), **T-F/T-G** (listing answers never clear), **T-D** (`No encontrado` → `cleared: true`, marker deleted). Structural backstop: under Option A the listing is **not** an existence source at all (§2.2, §4.1, §5.2), so B1's "absence read as a negative" cannot exist by construction — the guard is belt, not braces. Caveat: the red-first _claim_ is wrong for Python (E-4). |
| **C2** | Existence test is raw equality; trimming confined to the `Rechazado` gate                                                                                     | **MET**                                               | §5 step 5 (`inquiry.estado == 'No encontrado'`, "RAW equality — no trimming, no case folding"), §5.1 bullet 1, §6 rule 4, §13 line 3. Confirmed against today's code: `client.ts:395` / `client.py:512` do not trim, so the design now _matches_ the code it claims to match.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **C3** | Total predicate that cannot throw, plus a missing-`estado` test per suite                                                                                     | **MET**                                               | §6 shows both bodies with `?? ''` / `(response.estado or "")`; rule 3 states the requirement as a parity obligation; **T-K** asserts "flag present + `estado` absent → `Ok`, `false`, no exception". The **second** `.trim()`/`.strip()` in the document is in the gate (§5 step 6) and it is total too: step 4's payload guard requires `estado` to be a string before the gate is evaluated. Both call sites are guarded.                                                                                                                                                                                                                                                                                                                                                                           |
| **C4** | B3: Option A (existence stays on `inquiryStatus`; flag chain after the decision)                                                                              | **MET**                                               | §2.2, §5.2 (side-by-side: same service, same rule, same moment, same delete line), §4.1, §16.2. `delivered`/`cleared` are _not_ re-derived, so ledger I2/I3 and `126-tasklist.md` Decision 4 / R9 / A5 stand unamended (R13). No re-freeze needed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **C5** | Measured per-package budget (TS 4 attempts/call, PY 3) **and** the caller-lease obligation                                                                    | **MET**                                               | §10.2 ("**4** (cockatiel `maxAttempts: 3` = 3 retries; measured: 4 calls observed)" vs "**3**"), §10.3 (≈61 s / ≈45 s; ≈182 s / ≈135 s), §10.4 ("the queue lease (visibility timeout) must exceed the reconcile worst case, or the caller must reconcile in a lease-renewing / leader-elected context"). I re-measured both counts (R8): 4 and 3 are correct. Two errata: the missing 2-call row and a wrong first sentence, plus a wrong bulkhead claim I introduced in attempt 1 (E-2, E-3).                                                                                                                                                                                                                                                                                                        |
| **C6** | F7: `tracks` field or `reuseReason` enum in the public-surface table, so C2 vs C3 is visible                                                                  | **NOT MET literally; MET in substance; NOT blocking** | §9 P11 + §9.2 define the six-cause taxonomy as contract, and §9.2 **C4** names the exact public recovery ("call `trackStatuses(rnc, encf)` and aggregate yourself") — which is attempt 1's own alternative. The field itself is refused under `126-tasklist.md` Decision 2 / the scope guard and carried as F-126-6. Under Option A the collision narrowed from attempt 1's shape (the caller always has `inquiry` plus two public reads), so the _purpose_ — an operator can learn why `false` — is satisfied without a new field. I do not insist: overriding a run-level scope guard is not this gate's call.                                                                                                                                                                                      |
| **C7** | S1/S2/S4 wording landed (no false claims about emitted codes, breaker behaviour, attempt counts)                                                              | **MET**                                               | §7.4 (`CIRCUIT_OPEN`/`TIMEOUT` not emitted; breaker-open is `UNKNOWN`; Python retries it three times — matches R7), §10.2 (measured, per package), §10.5 (per-reconcile event bound ≤4/≤3 — correct because call 2 only runs after call 1 **succeeded** and `ConsecutiveBreaker` resets on success). One residual false claim inside §10.5 (permit hold), which is mine to correct: E-3.                                                                                                                                                                                                                                                                                                                                                                                                              |
| **C8** | Every remaining suggestion named as a follow-up rather than dropped                                                                                           | **MET**                                               | §15 F-126-1…F-126-11 (S3→F-126-1, S2→F-126-2, S6→F-126-3, S8→F-126-5, S7→F-126-11 rejected with a reason in §16.3), and S5 documented in §2.3/§9.3 rather than dropped. Nothing raised in attempt 1 is silently absent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

**Item 4 of the review brief, answered directly**

- **Can any read run after marker deletion?** No. Step 10 (`if cleared: delete`) is reachable only from
  `cleared === true`; step 6's gate requires `delivered === true`; `cleared === true ⇒ delivered === false`, so
  the flag reads at steps 7a/7c are **unreachable** from the deleting branch. The chain is therefore
  `READ(1) → PURE → [gate-only READ(2), READ(3)] → PURE(key) → WRITE(delete) → return`, and the delete's
  branch contains no read at all. Note for the reviewer: **line order alone does not prove this** — the flag
  reads are textually _above_ the delete. §8.2 item 3 ("read `cleared`/`delivered`: they must be derived from
  `inquiry.estado` by raw equality, before any flag call") is the load-bearing check; item 2 (grep line
  number) is only a proxy. The design gets that priority right.
- **Can an `Err` from the flag branch be read as "DGII has no record"?** Not from the value: `Err` carries no
  `delivered`, no `cleared`, and the marker stays `pending` (T-E/T-H assert that). Nor from the type: no `Ok`
  shape with `cleared: true` is reachable on a failed read. The one thing a caller cannot do in **Python** is
  see _which_ read failed, because `DgiiError.resource` is never populated there (E-1) — a diagnosability gap,
  not a misreading: the correct action ("do not re-send; retry reconcile") is the same for both causes.

---

## 3. Interleaving table on the new shape

Marker states are the shipped ones (R3): `pending` (`PENDING_SUBMISSION`), a stored response, or absent.
"Duplicate on retry" asks: if the caller retries reconcile, or re-sends the same signed XML, can two
transmissions of one e-NCF reach DGII?

| #        | Interleaving                                                                                                                                                                                                           | Returned value                                                                            | Marker               | Retry can duplicate?                                                                                                                                                                                                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I-1**  | Existence call fails (503, timeout, 401, breaker open)                                                                                                                                                                 | `Err` from the unchanged normalizer                                                       | `pending`            | **No.** Flag chain never runs; a re-send returns `IDEMPOTENCY` because the marker survives.                                                                                                                                                                                                           |
| **I-2**  | `consultaestado` → `200` **empty body** / `null` / object without `estado` (§5.6 guard)                                                                                                                                | `Err(VALIDATION, 'Unexpected DGII response payload')`                                     | `pending`            | **No.** This is attempt 1's B1, now an error instead of a clear; it also _fixes_ today's TypeScript `TypeError` on the same input (R4).                                                                                                                                                               |
| **I-3**  | Existence OK, delivered, `Rechazado`, listing fails                                                                                                                                                                    | `Err`; TS `resource = ConsultaTrackIds/api/TrackIds/Consulta`, PY `resource = None` (E-1) | `pending`            | **No.** The new `Ok`→`Err` cell (§10.5). No delete ran — the deleting branch excludes the gate branch.                                                                                                                                                                                                |
| **I-4**  | Listing answers `[]` (explicit empty array)                                                                                                                                                                            | `Ok(delivered: true, cleared: false, canReuseSequence: false)`                            | `pending`            | **No.** Read as "no track to ask", never as "DGII holds nothing" (§5.6 note 3, §5.2).                                                                                                                                                                                                                 |
| **I-5**  | Listing has one entry with no `trackId`                                                                                                                                                                                | `Ok(delivered: true, cleared: false, false)`; **no** `consultaresultado` call             | `pending`            | **No.** §5.4 collapse; T-P.                                                                                                                                                                                                                                                                           |
| **I-6**  | Listing has several usable tracks                                                                                                                                                                                      | `Ok(delivered: true, cleared: false, false)`; one listing call only, no verdict call      | `pending`            | **No.** §5.4's deliberate withholding; an operator recovers the reason with public `trackStatuses`.                                                                                                                                                                                                   |
| **I-7**  | `consultaresultado` fails                                                                                                                                                                                              | `Err`; TS `resource = consultaresultado/api/Consultas/Estado`                             | `pending`            | **No.** Same class as I-3.                                                                                                                                                                                                                                                                            |
| **I-8**  | Both reads OK, verdict not `Rechazado` — at the gate (`consultaestado` says `Aceptado`/`En Proceso` → 1 call) or in the predicate (`consultaresultado` says `Aceptado` after a `consultaestado` rejection → 2-3 calls) | `Ok(delivered: true, cleared: false, false)`                                              | `pending`            | **No.** Two independent sources must agree before `true`; disagreement yields `false`, the conservative direction.                                                                                                                                                                                    |
| **I-9**  | Both reads OK, one followable track, `{estado:'Rechazado', secuenciaUtilizada:false}`                                                                                                                                  | `Ok(delivered: true, cleared: false, canReuseSequence: true)`                             | `pending`            | **No.** `true` means "re-sign the same e-NCF as a **new document**" (§2.3, §9.3 item 2): a new signature yields a new hash, hence a new key — DGII's own rule, not a bypass. Re-sending the identical XML keeps returning `IDEMPOTENCY`.                                                              |
| **I-10** | Marker already deleted by a concurrent worker (lease expiry); both workers read `No encontrado`                                                                                                                        | both `Ok(cleared: true)`                                                                  | deleted (idempotent) | **Yes — pre-existing, and this is what §10.4 exists for.** The only duplicate window in the matrix, identical today, and the reason the caller-lease obligation is now a stated requirement. `singleFlight` (`client.ts:206-221`) only dedupes inside one process; the design does not over-claim it. |

Row **I-10** is the honest one to read first: nothing the _design_ added creates a duplicate, and the one window
it inherits is a caller-context problem the design now writes down.

---

## 4. Corrected latency numbers (item 3)

Per-attempt timeout 15 s in both packages; backoff ≈0.7 s per logical call in TypeScript
(`100+200+400 ms`, R7), ≈0.03 s in Python (`wait_exponential(multiplier=0.01)`, two gaps). Attempt counts from
R8 (measured).

| Path                                                       | Logical calls | TS attempts | TS worst case | PY attempts | PY worst case |
| ---------------------------------------------------------- | ------------- | ----------- | ------------- | ----------- | ------------- |
| Non-rejected / non-`ECF` / no record (1 call)              | 1             | 4           | **≈61 s**     | 3           | **≈45 s**     |
| Rejected, listing fails or ≠1 followable track (2 calls)   | 2             | 8           | **≈121 s**    | 6           | **≈90 s**     |
| Rejected, full chain (3 calls)                             | 3             | 12          | **≈182 s**    | 9           | **≈135 s**    |
| + one token refresh (Seed + ValidarSemilla = 2 more calls) | +2            | +8          | **≈303 s**    | +6          | **≈225 s**    |
| + one 401 replay on one call                               | +4 / +3       |             | up to +61 s   |             | up to +45 s   |

Check against §10:

- §10.3's two rows (**≈61 s / ≈45 s**; **≈182 s / ≈135 s**) are **correct** as upper bounds. A bound is
  legitimate even though the supremum is only reached when the last attempt of every call also runs to its
  ceiling.
- §10.3 **omits the 2-call row** (≈121 s / ≈90 s), which is a real path in §10.1 (listing fails, or 0/>1
  followable tracks). → E-2.
- §10.4's first sentence — "may occupy a bulkhead permit for up to ~2 minutes in TypeScript (~90 s in Python),
  and up to ~3 minutes / ~2¼ minutes on the rejected path" — is **self-inconsistent with §10.3**: the base path
  is now 61 s / 45 s, not ~2 min / 90 s (those were attempt 1's 2-call numbers). → E-2.
- §10.4/§10.5's "occupies a bulkhead permit for up to ~2 minutes" is **false in both packages**: the bulkhead is
  the _innermost_ policy in `wrap(retry, breaker, timeout, bulkhead)` (R7), so a permit is held per **attempt**
  (≤15 s) and released during backoff — measured (R8: a `bulkhead(1,0)` was free during a 400 ms retry backoff).
  This was **my** error in attempt 1 (R8/§4.3) and the design inherited it. → E-3.
- The auth-inclusive figure is the one a lease must be sized against. §10.4 says "before authentication
  refreshes", which is honest but leaves an operator without a number; ≈303 s TS / ≈225 s PY is that number.
  → E-2.

---

## 5. The widened `Err` contract — verdict (item 5)

**What widened.** Exactly one cell: a **rejected, delivered** document whose flag read fails now returns `Err`
where today it returns `Ok(delivered: true, canReuseSequence: false)`. It is bounded by the gate — every other
path (`Aceptado`, `En Proceso`, no record, non-`ECF`, existence failure) is unchanged, one call, today's
semantics. §7.1, §7.3 and §10.5 state it; §7.2 argues the alternative away.

**Is `error.resource` enough to distinguish "could not ask" from "not reusable"?** The question splits in two, and
the design conflates them:

1. _Could not ask_ vs _DGII says not reusable_ — **yes, and it needs no resource string at all.** The
   discriminator is the type: `Err` vs `Ok(canReuseSequence: false)`. §6 rule 5 ("`true` has exactly one origin")
   plus §7.1 ("every failed read fails the call, no partial `Ok`") make that mechanically true in **both**
   packages. This is the important half, and it is safe.
2. _Which read failed_ — **TypeScript only.** `error.resource` is populated by the TS `HttpClient` from
   `Endpoint.*`, and the three values are distinct (R6). **In Python it is always `None`**: no
   `DgiiErrorContext(...)` is constructed anywhere in `src/`, and `_parse` builds `DgiiError` without `resource`
   (R5). §7.2's reason #2, §7.3's "the caller distinguishes them by `error.resource`", §9.2 C6 and §10.6
   ("reconcile can produce `Endpoint.InquiryStatus` / `Endpoint.AllTrackingEcf` / `Endpoint.TrackResultStatus`")
   are therefore **TS-only claims presented as parity claims**, and §13's parity line makes them an
   unsatisfiable checklist item for T5. → **E-1, must fix in the design text.** It does not endanger the marker:
   no `Err` path touches it.

**What a queue worker must do in each case** (what T8 must publish, §7.3 + §9.2):

| Outcome                                        | Marker  | Worker action                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Ok(cleared: true)`, `delivered: false`        | deleted | Re-sending the same signed XML is safe (DGII said `No encontrado`).                                                                                                                                                                                                   |
| `Ok(delivered: true, canReuseSequence: false)` | kept    | **Do not re-send.** Read `inquiry.estado`; if `Rechazado`, `trackStatuses` explains why the flag is not asserted; schedule a later reconcile or escalate.                                                                                                             |
| `Ok(delivered: true, canReuseSequence: true)`  | kept    | **Do not re-send this XML.** Re-sign the same e-NCF as a new document (new hash → new key).                                                                                                                                                                           |
| `Err` (any code, any `resource`)               | kept    | **Do not re-send, ever.** Retry reconcile under the queue's backoff (not a nested loop, §10.4). TS may use `resource` to separate "delegation" (track services, permanent) from "transport" (retry). PY cannot, so it retries all `Err`s identically, then escalates. |
| A thrown exception                             | unknown | Treat as unknown state: the next send either succeeds or returns `IDEMPOTENCY`. Never as permission.                                                                                                                                                                  |

**Is §10.4 stated as a requirement and enforceable?** Stated as a requirement: yes — "**must** exceed the
reconcile worst case, **or**" with two named alternatives, the failure mode spelled out ("once one of them
deletes it, the other can re-send"), and assigned to `architecture.md` §9.3 plus both locale guides. Enforceable
by the SDK: **no** — neither package exposes a deadline/`AbortSignal` or a lease API, and the design says so
(§10.3, §14). It is enforceable only as a documented caller contract, and `singleFlight` is correctly _not_
offered as a substitute. That posture is acceptable **provided the number it references is right** — which is
why E-2 is not a nit: a lease sized against "~2 minutes" when the real worst case is ~182 s (or ~303 s with one
token refresh) is exactly the window §10.4 warns about.

---

## 6. Residual defects and exact fixes

Numbered; each tagged with where it came from. **E-1…E-4 must land before the freeze in §16.6 is recorded.**
None changes a decision; none needs a third attempt.

**E-1 — `error.resource` does not exist in Python; three sections and one parity line assert it does.**
_Where:_ §7.2 reason 2, §7.3 bullet 2, §9.2 C6, §10.6, §13 ("`error.resource` identifies the failing read").
_Provenance:_ my attempt-1 Q4/S9 — I asserted `resource` was "the only signal" without checking the Python side;
that was my miss, and it is now load-bearing because it is offered as reason not to degrade to `false`.
_Evidence:_ `errors.py:151,171,184` define the field; no call site ever passes it (`DgiiErrorContext` appears only
at `errors.py:200` as `context or DgiiErrorContext()`), and `_parse` (`http.py:161-179`) omits it. So
`DgiiError.resource is None` for every failure in Python.
_Fix (design text):_ (i) in §7.2/§7.3/§9.2 C6/§10.6 add "TypeScript only today; in Python `resource` is always
`None` (F-126-12)"; (ii) in §7.3 lead with the parity-safe discriminator — `Ok` vs `Err` already separates "DGII
answered" from "could not ask", and a Python caller that needs an existence answer calls `inquiry_status(rnc,
encf)`, one read that cannot touch the marker; (iii) rewrite the §13 line as "in TypeScript `error.resource`
identifies the failing read; in both packages `code` and `message` match"; (iv) add **F-126-12** to §15:
"populate `DgiiError.resource` in the Python query path (needs `Endpoint`-equivalent strings in `http.py`) —
pre-existing parity gap, out of scope".

**E-2 — §10.3 omits the 2-call path, and §10.4's first sentence contradicts §10.3.**
_Provenance:_ my attempt-1 F6a/F6b; the new shape created the 2-call path's absence from the table.
_Fix:_ add a §10.3 row — "2 calls (rejected, listing fails or ≠1 followable track): ≈**121 s** TS / ≈**90 s**
PY" — and replace §10.4's first sentence with: _"A single `reconcileSubmission` can run for up to ≈61 s
(TypeScript) / ≈45 s (Python) on any non-rejected path, ≈121 s / ≈90 s when the listing is followed but
`consultaresultado` is not, and ≈182 s / ≈135 s on the full chain; one token refresh (Seed + ValidarSemilla)
adds ≈121 s / ≈90 s, so a queue lease must be sized against ≈**303 s** / ≈**225 s**. A bulkhead permit is held
for at most one attempt (≤15 s at a time), because the bulkhead is the innermost policy."_

**E-3 — the bulkhead permit-hold claim is false (my attempt-1 error, inherited).**
_Where:_ §10.4 ("may occupy a bulkhead permit for up to ~2 minutes") and §10.5 ("can hold a submission-side
permit for ~2 minutes").
_Evidence:_ `wrap(retry, breaker, timeout, bulkhead)` (`resilience.ts:96-101`) puts the bulkhead innermost;
measured this session — a `bulkhead(1,0)` was free while the same policy sat in a 400 ms retry backoff.
_Fix:_ restate both sentences as "one bulkhead permit, held for at most one 15 s attempt and released between
attempts; the _job_ can still run for minutes, which is the lease problem (§10.4), not a permit-monopoly
problem". Keep F-126-2 (dedicated policy for the query path) — the shared **breaker** argument is unaffected —
but drop the "~2 minutes of permit" framing, which overstates the blast radius by roughly 8×.

**E-4 — the red-first requirement is unsatisfiable for two of the named tests in Python.**
_Where:_ §8.3, "The first two must be **observed failing** against `main`'s `src` (T7's close rule)", where T-A
(empty body) and T-B (`null`) are both existence-read tests.
_Evidence:_ in Python an empty body already yields `Err(VALIDATION, 'Unexpected DGII response payload')`
(`http.py:156-166` → `client.py:84-99`), so T-A/T-B **pass unmodified on `main`**. Only TypeScript's T-A/T-B fail
today, and they fail by throwing a `TypeError`, not by returning the wrong value (R4).
_Fix:_ replace with the per-package statement — "must be observed failing against `main`'s `src`: in
**TypeScript**, T-A and T-B (today they throw); in **both** packages, T-I (the defect: `canReuseSequence` cannot
be `true` today) and T-L/T-M/T-O/T-P (today they issue one call and produce the wrong shape). T-A/T-B stay in the
Python suite as regression guards, not as failing-first proofs."

**E-5 (nit) — §8.2 item 5 is not readable.** It currently reads "the new calls are inserted **above** the
`delivered` / `cleared` computation is wrong — they belong **below** it, …". _Fix:_ "the `delivered`/`cleared`
derivation lines are unchanged and precede every new call; if a new flag call appears above them, the review
fails." It is the proof procedure, so it must be unambiguous.

**E-6 (nit) — message-parity claim is wrong for one payload class.** §5.6 and §13 require the identical
`Err(VALIDATION)` message `Unexpected DGII response payload`, but in Python that literal comes from `_parse_one`
for a **non-dict** body; a dict body missing `estado` raises `ResponseShapeError` with
`field 'estado' must be a string, got NoneType` (`types.py:66-69`). _Fix:_ scope the parity line to the
non-dict/absent case, or require TypeScript to reproduce Python's field-level text. Do not leave T5 with a line it
cannot satisfy and T6 diffing two different messages.

**E-7 (observation only — no change requested).** A string-but-unrecognised `estado` (e.g. `""`) passes §5 step
4's type guard and yields `delivered: true`. That is the _safe_ direction (lock kept, caller told not to
re-send), but it silently reports "DGII holds it" for a non-answer, which can wedge a document until manual
intervention. It is **pre-existing** — today's `!== 'No encontrado'` does the same — and unchanged by this
design, so: record it in §5.6's notes and as Q11 in §12, and do not change it in #126. Listed so nobody later
"fixes" it into a clearing rule.

---

## 7. What I did not ask for (item 6)

Nothing below is new relative to attempt 1 except what the Option A shape created.

| Demand                                                 | Provenance                                                                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Absent/null → `Err`, tests named, marker readable (C1) | attempt 1 B1                                                                                                                                                 |
| Raw equality, trimming confined to the gate (C2)       | attempt 1 B1(trimming)                                                                                                                                       |
| Total predicate + missing-`estado` test (C3)           | attempt 1 B2                                                                                                                                                 |
| No re-freeze needed under Option A (C4)                | attempt 1 B3, option A                                                                                                                                       |
| Measured per-package budget + lease obligation (C5)    | attempt 1 F6a/F6b/S4                                                                                                                                         |
| E-1 (`error.resource` in Python)                       | attempt 1 Q4/S9 — same claim, now verified false for Python                                                                                                  |
| E-2 (2-call row, §10.4 numbers, auth-inclusive figure) | attempt 1 F6a/F6b; **new shape** created the 2-call row and moved the numbers                                                                                |
| E-3 (bulkhead permit)                                  | correction of attempt 1's own R8/§4.3 error, surfaced by the new §10.5                                                                                       |
| E-4 (red-first per package)                            | attempt 1 criterion 1 ("observed failing first"); **new shape** moved the empty-body test from the listing to `consultaestado`, where Python already behaves |
| E-5, E-6 (nits)                                        | attempt 1's §8.2 proof-procedure request and §13 parity discipline                                                                                           |
| E-7 (observation)                                      | **new shape** — the existence read is now a classified object; recorded, no change requested                                                                 |
| C6 not insisted on (no new result field)               | attempt 1 F7, withdrawn against a run-level scope guard; recovery documented in §9.2 C4                                                                      |

No XMLDSig gate is implicated (no signing path is touched). `mise run ci` remains the implementation gate.

---

## 8. Freeze recommendation

Freeze §2, §5, §5.6, §6, §7.1, §8, §9, §10.2-§10.4 and §13 **after** E-1…E-4 land. E-1 and E-3 correct _my_
claims, not the design's decision; E-2 is a number an operator will act on; E-4 is a close-rule instruction T7
would otherwise fail on. With them applied I restate, without reservation:

> This design cannot cause a duplicate fiscal submission, and cannot leave a marker in a state the next
> attempt misreads.

## Outcome

Outcome: PASS (attempt 2 of 3) — Option A closes B1 by construction (the listing is no longer an existence source), B2 with a guarded `.trim()` at both call sites, and B3 by leaving `delivered`/`cleared` frozen; 7 of 8 re-entry criteria MET, the eighth (a new result field) is non-safety and refused on the run's scope guard.
Details: A queue worker can never be told "re-send" by a failed read — the delete branch and the flag branch are mutually exclusive and every `Err` leaves the marker `pending`. Four errata must land before the §16.6 freeze: E-1 `error.resource` is always `None` in Python (§7.2/§7.3/§9.2 C6/§10.6/§13 assert a TS-only discriminator), E-2 §10.3 omits the 2-call path (≈121 s/≈90 s) and §10.4 contradicts §10.3, E-3 the bulkhead permit is per-attempt (≤15 s, my attempt-1 error), E-4 the red-first claim is unsatisfiable for T-A/T-B in Python.
`project-tasks/126-evidence/t3-reliability-contract-design-attempt2.md` — PASS/FAIL verdict for attempt 2 of 3 with the 8-criterion table (proving section per criterion), a 10-row interleaving table (marker state / returned value / duplicate-on-retry), corrected per-package latency table including the 2-call and auth-inclusive rows, the `Err`-contract verdict with per-outcome queue-worker duties, and E-1…E-7 with exact replacement text and provenance.
