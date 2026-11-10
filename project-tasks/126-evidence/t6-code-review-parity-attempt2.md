# T6 — Cross-package code review and parity verdict (#126, attempt 2 of 3)

**Verdict: FAIL** — but a narrow one. Eight of the ten defects from attempt 1 are closed, and on every
hostile payload the task names (absent `estado`, absent `codigo`, non-boolean `secuenciaUtilizada`,
numeric `trackId`, non-object body, `null`/empty body, HTTP 500, the four root elements) the two packages
now answer **identically**. One defect class remains, and it is not the class attempt 1 raised: a
`consultaresultado` / `consultaestado` / `consultatrackids` body whose **non-classifying** fields are
malformed is still rejected by Python and accepted by TypeScript. That is an outcome divergence
(`Ok(canReuseSequence:true)` vs `Err(VALIDATION)`), it happens on the read #126 introduced, and C-1 §5.6
row 1 says such a body is _accepted_. 29 cells fail on it; the fix is one helper that already exists in
the file, applied to six call sites, Python only.

| Gate                                                    | Result                                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Parity matrix, 76 reconcile rows                        | 68 SAME · 5 explained (D-8) · **3 residual (R-1)**                                      |
| Hostile-field sweep, 90 rows (every field × 5 types)    | 64 SAME · **26 residual (R-1, same root cause)**                                        |
| Predicate, 56 model-admitted cells                      | **56 SAME** (the 5 `true` cells are the same 5)                                         |
| Direct public-method probes (`statusTrackId` et al.)    | `statusTrackId` parity ✅ (D-7 closed) · `inquiryStatus` **still divergent (R-2)**      |
| C-1 §5.6 / §13 identical classification                 | **FAIL on the three reads for malformed non-classifying fields**                        |
| Invariant zone (marker path, gate, retry, types, ESM)   | **all clean**                                                                           |
| Suites                                                  | TS 203 passed + 3 skipped · PY 231 passed + 3 skipped · `mise run lint` clean for `src` |
| Test quality (wire shapes, no flag on `consultaestado`) | **clean**, except one test that pins the R-1 divergence (`test_types.py:275`)           |

Because the pass condition is _zero_ cross-package disagreements and R-1 is cheap to remove, attempt 2
cannot pass. §10 is the complete, Python-only diff attempt 3 needs; nothing in TypeScript has to move.

---

## 0. What was reviewed

| Item           | Value                                                                                                                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch / base  | `fix/126-can-reuse-sequence` @ `e0b5f13` + working tree (attempt-2 revisions are still uncommitted, so attempt 1 vs attempt 2 is not diffable in git — every claim below is re-measured, not diffed)                         |
| Files          | `packages/typescript/src/{client,reconciliation,types}.ts` (+ `test/reconciliation.test.ts`); `packages/python/src/py_dgii_ecf/{client,reconciliation,types}.py` (+ `tests/{test_client,test_reconciliation,test_types}.py`) |
| Contract       | `126-contract-design.md` §2.4, §5.6, §6, §7.1, §8.2, §8.3, §10, §13                                                                                                                                                          |
| Commands       | `bunx vitest run` (TS), `uv run --frozen pytest` (PY), `mise run lint`, two parity harnesses + one predicate harness + three direct-method probes (all in `/tmp`, §12)                                                       |
| Nothing edited | No file under `packages/**`, `docs/**`, `project-docs/**` or the design was touched by this review.                                                                                                                          |

---

## 1. Producer claims vs what I measured

| Claim                                               | Verified?                    | Where                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TS: D-2 fixed (guard moved into the predicate)      | ✅ yes                       | `reconciliation.ts:68-71`; 76 rows, zero `THREW`                                                                                                                                                                                                                                                  |
| TS: D-7 fixed (guard moved into `statusTrackId`)    | ✅ yes                       | `client.ts:121-123`, `:648-650`; call-site guard deleted; probe agrees with Python                                                                                                                                                                                                                |
| PY: D-1, D-3, D-4, D-5, D-9 fixed                   | ✅ yes                       | §3 table                                                                                                                                                                                                                                                                                          |
| PY: D-6 fixed                                       | ⚠️ **partly**                | absence tolerated (`types.py:354`), wrong type still fatal (`:354`, `:286-295`) → R-1                                                                                                                                                                                                             |
| PY: D-7 / D-8 "needed no code change on its side"   | ✅ fair for D-7 · ⚠️ for D-8 | D-7 was a TS gap and is closed. D-8 is a _registration_, and it is still missing (§3, D-8)                                                                                                                                                                                                        |
| PY: cells C-4 / C-7 "remain on the TypeScript side" | ❌ stale                     | C-7 (padded states in TS) is now covered (`test/reconciliation.test.ts:801,823`); C-4's unreadable-result half is now covered in Python (`test_reconciliation.py:430`) — the only surviving C-4 item is the transport-error case in **both** suites, which cannot be written until D-8 is settled |

---

## 2. The ruling from attempt 1 still stands

TypeScript was C-1-conformant and Python moved. That ruling is now implemented and I am not
re-litigating it. The consequence attempt 2 must live with: **on the three #126 reads, a body the SDK can
classify is accepted, and a field that cannot license `true` may not fail the read** (C-1 §5.6 row 1, §6
rule 3, §13). The Python suite states that rule itself, in `tests/test_types.py:249-256`
(«§5.6 row 1: an object with a string `estado` is accepted»). R-1 is that same rule, applied to the six
fields the rewrite did not cover.

---

## 3. Defect register — attempt 1 → attempt 2

| #        | Attempt 1 finding                                               | Status                        | Proof (file:line)                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------- | --------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D-1**  | T-K: Python returned `Err` where C-1 mandates `Ok(false)`       | **RESOLVED**                  | `types.py:277` (`codigo = _as_optional_int(...) or 0`), `:281-282` (non-string/absent `estado` → `""`); predicate `reconciliation.py:67-68`; test `tests/test_reconciliation.py:367-389` (T-K, R10a, R10c, R17a, R17b ⇒ `Ok`, `r=False`, marker intact). Matrix R10a/R10b/R10c **SAME**                                                                                                                                                                      |
| **D-2**  | TS predicate threw `TypeError` on a non-string `estado`         | **RESOLVED**                  | `reconciliation.ts:68` (`const estado: unknown`), `:71` (`typeof estado === 'string' ? estado.trim() : ''`); tests `test/reconciliation.test.ts:237-247`; matrix R17a/R17b/R17d **SAME**, no throw in any of the 166 rows swept                                                                                                                                                                                                                              |
| **D-3**  | Non-boolean `secuenciaUtilizada` changed the fiscal answer (PY) | **RESOLVED**                  | PY `types.py:102-114` (`_as_bool_strict`), `:289-291` (result read), `:471-473` (RFCE inquiry), predicate `reconciliation.py:67` (`is False`); TS `reconciliation.ts:70` (`=== false`). Tests `tests/test_types.py:64-80`, `test_reconciliation.py:407-419`, `test/reconciliation.test.ts:249-261`. Matrix R10j/R17c/R17f **SAME**                                                                                                                           |
| **D-4**  | `_as_str` coerced a numeric `estado` (F-126-7)                  | **RESOLVED**                  | `types.py:90-100` (`_as_str_strict`), used at `:313` (listing entry) and `:355` (inquiry); matrix R13e/R13m/R14a **SAME** — same code, Python's own text (permitted by §13), **and** Python no longer spends a `consultaresultado` call the TS path never makes                                                                                                                                                                                              |
| **D-5**  | A numeric `trackId` was followable in Python                    | **RESOLVED**                  | `types.py:315-317` (`_as_optional_or_none(_as_str_strict, …)`) + `client.py:545` (`if entry.track_id`) vs TS `client.ts:476-477`; matrix R16a/R16e/R16f **SAME**                                                                                                                                                                                                                                                                                             |
| **D-6**  | The existence read was stricter in Python than §5.6 row 1       | **PARTIALLY**                 | Absent `codigo` → `0` and optional fiscal fields dropped (`types.py:354`, `:356-382`): R13d/R13j **SAME**. But a **wrong-typed** `codigo` still raises (`:354` → `_as_int`), and the result model still fails on `trackId`/`rnc`/`encf`/`fechaRecepcion`/`mensajes` (`:286-295`) → **R-1**, matrix R13l/R17h/R20b **DIFF**                                                                                                                                   |
| **D-7**  | `statusTrackId` returned `Ok` for a non-object body             | **RESOLVED**                  | `client.ts:121-123` (`isTrackingStatusResponse`), guard at `:648-650`; the duplicate call-site guard is gone (`:482` calls `canReuseSequence(status.value)` directly). Probe: `statusTrackId` → `Err(VALIDATION)` in **both** packages. Tests `test/reconciliation.test.ts:907-946`                                                                                                                                                                          |
| **D-8**  | Transport failures differ in code; attempt counts differ        | **STILL OPEN (registration)** | Attempts: TS `resilience.ts:84` (`maxAttempts: opts.maxRetries` = retries-after-first) vs PY `resilience.py:84` (`stop_after_attempt(...)` = total) ⇒ TS 2 / PY 1 at the same nominal setting — **explained and documented** by C-1 §10 + F-126-8. Code: `errors.ts` `toDgiiError` → `UNKNOWN` vs `http.py:243-250` → `HTTP` ⇒ **not registered anywhere**; §13's _«in both packages `code` and `message` match»_ is therefore still false (§11, action A-2) |
| **D-9**  | Python's `ReconciliationResult` docstring carried less taxonomy | **RESOLVED**                  | `reconciliation.py:24-33` now enumerates C1–C6 exactly as `reconciliation.ts:17-29` does                                                                                                                                                                                                                                                                                                                                                                     |
| **D-10** | §8.3's fail-first claim is wrong for T-L and T-M                | **STILL OPEN (design text)**  | `126-contract-design.md:608-612` still reads «T-L/T-M/T-O/T-P (today they issue one call and produce the wrong shape)». T-L/T-M still pass against `main`'s `src` (attempt-1 §6.2, unchanged). Not a code defect; owner action A-3                                                                                                                                                                                                                           |

New findings this round: **R-1** (🔴, §4), **R-2** (🟡, §5), **R-3** (💭, §6).

---

## 4. R-1 (🔴 blocker) — Python still fails a readable body whose non-classifying fields are malformed

### 4.1 What happens

| Read                | Python                                                                                                                                                              | TypeScript                                                       | Answer                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `consultaresultado` | `TrackingStatusResponse.from_dict` reads `trackId`/`rnc`/`encf`/`fechaRecepcion` with `_as_optional_str` and `mensajes` with `_parse_mensajes` (`types.py:286-295`) | `statusTrackId` checks only "is a JSON object" (`client.ts:648`) | `Err(VALIDATION, "field 'fechaRecepcion' must be a string, got dict")` **vs** `Ok(canReuseSequence: true)` |
| `consultaestado`    | `codigo` via `_as_optional_int` → `_as_int` raises on a non-numeric (`types.py:354`)                                                                                | `isRecord` + `typeof estado === 'string'` (`client.ts:453`)      | `Err(VALIDATION)` **vs** `Ok(delivered: true)`                                                             |
| `consultatrackids`  | entry `fechaRecepcion` via `_as_optional_str` (`types.py:319-321`)                                                                                                  | entry needs a string `estado` only (`client.ts:108-111`)         | `Err(VALIDATION)` **vs** `Ok(…, canReuseSequence: true)` + one **extra** `consultaresultado` call          |

### 4.2 Measured

**Main matrix (3 of 76):**

| Row  | Wire body                                                                        | TypeScript                | Python                                            |
| ---- | -------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------- |
| R13l | inquiry `{"codigo":"abc","estado":"Aceptado"}`                                   | `Ok(d=1,c=0,r=0)`         | `Err(VALIDATION)` — `codigo` not an int           |
| R17h | result `{…,"estado":"Rechazado","secuenciaUtilizada":false,"codigo":"x"}`        | `Ok(d=1,c=0,`**`r=1`**`)` | `Err(VALIDATION)` — `codigo` not an int           |
| R20b | result `{…,"estado":"Rechazado","secuenciaUtilizada":false,"fechaRecepcion":{}}` | `Ok(d=1,c=0,`**`r=1`**`)` | `Err(VALIDATION)` — `fechaRecepcion` not a string |

**Hostile-field sweep (26 of 90).** For each read, each non-classifying field was set to `{}`, `"x"`, `42`,
`[]`, `true`, all other fields valid:

| Read                | Field(s) that still diverge                                                              | Cells |
| ------------------- | ---------------------------------------------------------------------------------------- | ----- |
| `consultaestado`    | `codigo` (`{}`, `"x"`, `[]`, `true`)                                                     | 4     |
| `consultatrackids`  | entry `fechaRecepcion` (`{}`, `[]`, `true`)                                              | 3     |
| `consultaresultado` | `codigo` (4), `trackId` (3), `rnc` (3), `encf` (3), `fechaRecepcion` (3), `mensajes` (3) | 19    |

In all 26, `estado` was a valid string, so **C-1 §5.6 row 1 («JSON object, `estado` is a string →
accepted») is violated by Python on the result and existence reads**, and §13's _«same payload
classification»_ line is unmet. Three of them change the fiscal answer itself (`r=1` vs `Err`).

### 4.3 Why this is a defect and not a registration

1. **The contract's own table decides it.** §5.6 row 1 marks the result read _accepted_ for a body whose
   `estado` is a string; rows 3-6 reserve `Err` for _body shape_, not for field-level garbage. §13 repeats
   the requirement and scopes only the error **text** as free.
2. **The producers already apply this rule — to two of the eight fields.** `types.py:275-283` and
   `:352-382` tolerate an absent `codigo`/`estado` and drop unreadable _optional_ fiscal fields «because
   nothing on this path reads them». `reconcileSubmission` reads exactly one thing from the result body:
   `secuenciaUtilizada` + `estado`. The same argument covers `trackId`, `rnc`, `encf`, `fechaRecepcion`
   and `mensajes`; leaving them fatal is internally inconsistent, not a decision.
3. **It is fiscally observable, and only since #126.** Before this branch, reconcile never called
   `statusTrackId`/`trackStatuses`, so these bodies could not fail a reconcile at all; both packages
   answered `r=false` unconditionally. #126 made the divergence reachable and outcome-changing.
4. **It is pinned by a test**, which is the failure mode attempt 1 called out for T-K:
   `tests/test_types.py:275-288` (`test_wrong_type_raises`) asserts that a result body with
   `codigo: "not-a-number"` **must** raise — a green test against a §5.6 row 1 contradiction.
5. **About my attempt-1 acceptance.** In attempt 1 §1.4 I accepted a _wrong-typed_ `codigo` as «a sibling
   of F-126-7 … accepted rather than papered over». That acceptance was for `codigo` alone, it was
   conditioned on being **registered**, and it was never written into the F-126 register (F-126-7 covers
   the opposite direction: Python coercing a numeric `estado`). This round adds 23 more cells across two
   more reads and a third model, and a test that freezes the divergence. If the orchestrator prefers to
   keep attempt 1's acceptance instead of fixing it, the close is a design amendment naming
   **F-126-7-widened**, deleting/inverting `test_wrong_type_raises`, and adding the three matrix rows to
   both suites — but the current state (_divergent, unregistered, and pinned_) is not a parity claim.

### 4.4 The fix (Python only, §10)

One existing helper (`_as_optional_or_none`, `types.py:117-132`) applied to the six remaining fields of
`TrackingStatusResponse.from_dict` plus `codigo` of `InquiryStatusResponse.from_dict` and
`fecha_recepcion` of `SummaryTrackingStatusResponse.from_dict`. Classifying fields stay strict: `estado`
on the inquiry and listing models, `trackId` on a listing entry.

---

## 5. R-2 (🟡) — `inquiryStatus` is the remaining unvalidated read in TypeScript

Direct probe, `200` with body `"nope"`:

| Method          | TypeScript        | Python            |
| --------------- | ----------------- | ----------------- |
| `statusTrackId` | `Err(VALIDATION)` | `Err(VALIDATION)` |
| `inquiryStatus` | **`Ok("nope")`**  | `Err(VALIDATION)` |

`client.ts:654-666` still does `http.get<InquiryStatusResponse>(...)` and returns the cast; the guard
lives at the reconcile call site (`client.ts:451-455`). Reconcile is therefore safe and no matrix cell
shows it — but it is the identical defect attempt 1 raised as D-7 for `statusTrackId`, one method over,
and it contradicts P8 («the layer that owns parsing is where the rule lives»). Pre-existing on `main`,
so it may be **fixed** (move `client.ts:451-455` into `inquiryStatus`, delete the call-site copy — 4
lines) or **registered** as F-126-14. It does not block on its own; leaving it silent does.

---

## 6. R-3 (💭) — Python's predicate is total for the wire, not for a hand-built model

`reconciliation.py:67-68` is `(response.estado or "").strip()`, which guards _falsy_ values only:

```
TrackingStatusResponse(codigo=2, estado=42,    secuencia_utilizada=False) -> AttributeError
TrackingStatusResponse(codigo=2, estado=True,  secuencia_utilizada=False) -> AttributeError
TrackingStatusResponse(codigo=2, estado=["x"], secuencia_utilizada=False) -> AttributeError
```

Not reachable from the wire — `types.py:281-282` normalises the result read to `""`, `_as_str` on the
RFCE-inquiry model either coerces to a string or fails — and the dataclass annotation is `str`, so this is
a typed-input boundary rather than a wire case. TS answers `false` in all five hostile cases (it was
hardened by D-2 because its cast makes the case reachable internally). §6's own reference snippet has the
same hole. One line closes it (`estado if isinstance(estado, str) else ""`), and it can be skipped if the
reviewer states that the typed-input boundary is the contract's boundary.

---

## 7. Full re-run of the parity matrix (76 rows)

**Method.** One scenario file drives both packages; the payloads are byte-identical JSON
(`/tmp/t6p2/scenarios.json`). TS: injected `fetchImpl` routed by URL segment, `InMemoryIdempotencyStore`,
`resilience: { maxRetries: 1, retryInitialDelayMs: 1 }`. PY: `httpx2.MockTransport`, the identical store
and `ResilienceOptions(max_retries=1)`. Each run records `{outcome, delivered, cleared, canReuse, code,
marker, request sequence}` (plus `resource`/`message`/model payloads, scored separately — see §7.2).
Notation: `Ok(d,c,r)` = `delivered, cleared, canReuseSequence`; `m=1/0` = the pending marker is still
readable / was deleted; `[…]` = the request sequence (`inquiry` = `consultaestado`, `tracks` =
`consultatrackids`, `result` = `consultaresultado`). No row "cannot be expressed" in either package: every
input is a JSON body, an empty body, a status code or a transport failure.

| #    | Scenario                                                     | TypeScript                                     | Python                                  | Verdict                                        |
| ---- | ------------------------------------------------------------ | ---------------------------------------------- | --------------------------------------- | ---------------------------------------------- |
| R1   | root `ECF`, inquiry `Aceptado`                               | `Ok(d=1,c=0,r=0) m=1 [inquiry]`                | identical                               | SAME                                           |
| R2   | root `ECF`, inquiry `No encontrado`                          | `Ok(d=0,c=1,r=0) m=0 [inquiry]`                | identical                               | SAME                                           |
| R3   | `Rechazado` + listing `[]`                                   | `Ok(d=1,c=0,r=0) m=1 [inquiry,tracks]`         | identical                               | SAME                                           |
| R4   | happy path: `Rechazado`, 1 track, `Rechazado`+`false`        | `Ok(d=1,c=0,r=1) m=1 […,result]`               | identical                               | SAME                                           |
| R5   | result `Aceptado`+`true`                                     | `Ok(d=1,c=0,r=0) m=1 […,result]`               | identical                               | SAME                                           |
| R6   | listing with two entries                                     | `Ok(d=1,c=0,r=0) m=1 [inquiry,tracks]`         | identical                               | SAME                                           |
| R7   | listing, one entry, no `trackId`                             | `Ok(d=1,c=0,r=0) m=1 [inquiry,tracks]`         | identical                               | SAME                                           |
| R8a  | listing → empty body                                         | `Err(VALIDATION) m=1 [inquiry,tracks]`         | identical                               | SAME                                           |
| R8b  | listing → JSON `null`                                        | `Err(VALIDATION) m=1 [inquiry,tracks]`         | identical                               | SAME                                           |
| R8c  | listing → single object (E12 shape)                          | `Ok(d=1,c=0,r=1) m=1 [inquiry,tracks,result]`  | identical                               | SAME                                           |
| R8d  | listing → non-array string body                              | `Err(VALIDATION) m=1 [inquiry,tracks]`         | identical                               | SAME                                           |
| R9   | listing entry without `estado`                               | `Err(VALIDATION) m=1 [inquiry,tracks]`         | identical (own text)                    | SAME (§13 allows the text)                     |
| R10a | result without `estado` (with `codigo`)                      | `Ok(d=1,c=0,r=0) m=1 […,result]`               | identical                               | SAME (**D-1 closed**)                          |
| R10b | result `{secuenciaUtilizada:false}` (T-K literal)            | `Ok(d=1,c=0,r=0) m=1 […,result]`               | identical                               | SAME (**D-1 closed**)                          |
| R10c | result `{}`                                                  | `Ok(d=1,c=0,r=0) m=1 […,result]`               | identical                               | SAME (**D-1 closed**)                          |
| R10d | result non-object `"nope"`                                   | `Err(VALIDATION) m=1 […,result]`               | identical                               | SAME                                           |
| R10e | result empty body                                            | `Err(VALIDATION) m=1 […,result]`               | identical                               | SAME                                           |
| R10f | result flag absent                                           | `Ok(d=1,c=0,r=0) m=1 […,result]`               | identical                               | SAME                                           |
| R10g | result flag `true`                                           | `Ok(d=1,c=0,r=0) m=1 […,result]`               | identical                               | SAME                                           |
| R10h | result `Aceptado` + flag `false`                             | `Ok(d=1,c=0,r=0) m=1 […,result]`               | identical                               | SAME                                           |
| R10i | result `" Rechazado "` + flag `false`                        | `Ok(d=1,c=0,r=1) m=1 […,result]`               | identical                               | SAME                                           |
| R10j | result flag `"false"` (string)                               | `Ok(d=1,c=0,r=0) m=1 […,result]`               | identical                               | SAME (**D-3 closed**)                          |
| R11a | result → HTTP 500                                            | `Err(HTTP) m=1 [inquiry,tracks,result,result]` | `Err(HTTP) m=1 [inquiry,tracks,result]` | DIFF — D-8 (attempt count, documented C-1 §10) |
| R11b | result → transport error                                     | `Err(`**`UNKNOWN`**`) m=1 […,result,result]`   | `Err(`**`HTTP`**`) m=1 […,result]`      | DIFF — D-8 (code **unregistered**, A-2)        |
| R11c | listing → HTTP 500                                           | `Err(HTTP) m=1 [inquiry,tracks,tracks]`        | `Err(HTTP) m=1 [inquiry,tracks]`        | DIFF — D-8 (attempt count)                     |
| R11d | inquiry → HTTP 500                                           | `Err(HTTP) m=1 [inquiry,inquiry]`              | `Err(HTTP) m=1 [inquiry]`               | DIFF — D-8 (attempt count)                     |
| R11e | inquiry → transport error                                    | `Err(`**`UNKNOWN`**`) m=1 [inquiry,inquiry]`   | `Err(`**`HTTP`**`) m=1 [inquiry]`       | DIFF — D-8 (code, A-2)                         |
| R12a | root `RFCE`, `Rechazado`                                     | `Ok(d=1,c=0,r=0) m=1 [inquiry]`                | identical                               | SAME                                           |
| R12b | root `ACECF`, `Rechazado`                                    | `Ok(d=1,c=0,r=0) m=1 [inquiry]`                | identical                               | SAME                                           |
| R12c | root `ANECF` (`SecuenciaeNCFDesde`), `Rechazado`             | `Ok(d=1,c=0,r=0) m=1 [inquiry]`                | identical                               | SAME                                           |
| R12d | root `FOO`, `Rechazado`                                      | `Ok(d=1,c=0,r=0) m=1 [inquiry]`                | identical                               | SAME                                           |
| R12e | root `ecf` (lowercase), `Rechazado`                          | `Ok(d=1,c=0,r=0) m=1 [inquiry]`                | identical                               | SAME                                           |
| R13a | inquiry → empty body                                         | `Err(VALIDATION) m=1 [inquiry]`                | identical                               | SAME                                           |
| R13b | inquiry → JSON `null`                                        | `Err(VALIDATION) m=1 [inquiry]`                | identical                               | SAME                                           |
| R13c | inquiry object without `estado`                              | `Err(VALIDATION) m=1 [inquiry]`                | identical (own text)                    | SAME                                           |
| R13d | inquiry object without `codigo`                              | `Ok(d=1,c=0,r=0) m=1 [inquiry]`                | identical                               | SAME (**D-6 part 1**)                          |
| R13e | inquiry `estado: 1` (numeric)                                | `Err(VALIDATION) m=1 [inquiry]`                | identical (own text)                    | SAME (**D-4 closed**)                          |
| R13f | inquiry `" No encontrado "` (padded)                         | `Ok(d=1,c=0,r=0) m=1 [inquiry]`                | identical                               | SAME (**C-7 closed**)                          |
| R13g | inquiry `" Rechazado "` (padded)                             | `Ok(d=1,c=0,r=1) m=1 [inquiry,tracks,result]`  | identical                               | SAME                                           |
| R13h | inquiry `estado: ""`                                         | `Ok(d=1,c=0,r=0) m=1 [inquiry]`                | identical                               | SAME (Q11, unchanged)                          |
| R13i | inquiry → JSON array                                         | `Err(VALIDATION) m=1 [inquiry]`                | identical                               | SAME                                           |
| R13j | inquiry `montoTotal: "abc"`                                  | `Ok(d=1,c=0,r=0) m=1 [inquiry]`                | identical                               | SAME (**D-6 part 2**)                          |
| R13k | inquiry → string body `"nope"`                               | `Err(VALIDATION) m=1 [inquiry]`                | identical                               | SAME                                           |
| R13l | inquiry `codigo: "abc"`                                      | `Ok(d=1,c=0,r=0) m=1 [inquiry]`                | `Err(VALIDATION) [inquiry]`             | **DIFF — R-1**                                 |
| R13m | inquiry `estado: true` (boolean)                             | `Err(VALIDATION) m=1 [inquiry]`                | identical (own text)                    | SAME                                           |
| R13n | inquiry `fechaEmision: null`                                 | `Ok(d=1,c=0,r=0) m=1 [inquiry]`                | identical                               | SAME                                           |
| R14a | listing entry `estado: 1` (numeric)                          | `Err(VALIDATION) m=1 [inquiry,tracks]`         | identical (own text)                    | SAME (**D-4 closed**, no extra call)           |
| R14b | listing `[No encontrado, Rechazado+id]`                      | `Ok(d=1,c=0,r=1) m=1 [inquiry,tracks,result]`  | identical                               | SAME                                           |
| R14c | listing entry `estado: null`                                 | `Err(VALIDATION) m=1 [inquiry,tracks]`         | identical (own text)                    | SAME                                           |
| R14d | listing `["nope"]` (entry not an object)                     | `Err(VALIDATION) m=1 [inquiry,tracks]`         | identical                               | SAME                                           |
| R14e | listing `[[]]` (nested array)                                | `Err(VALIDATION) m=1 [inquiry,tracks]`         | identical                               | SAME                                           |
| R14f | listing `42` (scalar body)                                   | `Err(VALIDATION) m=1 [inquiry,tracks]`         | identical                               | SAME                                           |
| R16a | listing entry `trackId: 5` (numeric)                         | `Ok(d=1,c=0,r=0) m=1 [inquiry,tracks]`         | identical                               | SAME (**D-5 closed**)                          |
| R16b | listing entry `trackId: ""`                                  | `Ok(d=1,c=0,r=0) m=1 [inquiry,tracks]`         | identical                               | SAME                                           |
| R16c | listing entry `estado: ""`                                   | `Err(HTTP) m=1 [inquiry,tracks,result]`        | identical                               | SAME (follows the empty id, 404s)              |
| R16d | result → JSON array                                          | `Err(VALIDATION) m=1 […,result]`               | identical                               | SAME                                           |
| R16e | listing entry `trackId: null`                                | `Ok(d=1,c=0,r=0) m=1 [inquiry,tracks]`         | identical                               | SAME                                           |
| R16f | listing `[trackId:" ", trackId:"t2"]`                        | `Ok(d=1,c=0,r=0) m=1 [inquiry,tracks]`         | identical                               | SAME                                           |
| R17a | result `estado: 42`                                          | `Ok(d=1,c=0,r=0) m=1 […,result]`               | identical                               | SAME (**D-2 closed**)                          |
| R17b | result `estado: {}`                                          | `Ok(d=1,c=0,r=0) m=1 […,result]`               | identical                               | SAME (**D-2 closed**)                          |
| R17c | result flag `0` (numeric)                                    | `Ok(d=1,c=0,r=0) m=1 […,result]`               | identical                               | SAME (**D-3 closed**)                          |
| R17d | result `estado: null`                                        | `Ok(d=1,c=0,r=0) m=1 […,result]`               | identical                               | SAME                                           |
| R17e | result flag `null`                                           | `Ok(d=1,c=0,r=0) m=1 […,result]`               | identical                               | SAME                                           |
| R17f | result flag `"true"`                                         | `Ok(d=1,c=0,r=0) m=1 […,result]`               | identical                               | SAME                                           |
| R17g | result `{secuenciaUtilizada:false, estado:"Rechazado"}`      | `Ok(d=1,c=0,r=1) m=1 […,result]`               | identical                               | SAME                                           |
| R17h | result `codigo: "x"`                                         | `Ok(d=1,c=0,`**`r=1`**`) m=1 […,result]`       | `Err(VALIDATION) […,result]`            | **DIFF — R-1**                                 |
| R17i | result `codigo: null`                                        | `Ok(d=1,c=0,r=1) m=1 […,result]`               | identical                               | SAME                                           |
| R17j | result → `true` (boolean body)                               | `Err(VALIDATION) m=1 […,result]`               | identical                               | SAME                                           |
| R15  | signed XML without emitter RNC / e-NCF                       | `Err(VALIDATION) m=1 []`                       | identical                               | SAME                                           |
| R18  | result → HTTP 404                                            | `Err(HTTP) m=1 [inquiry,tracks,result]`        | identical                               | SAME                                           |
| R20a | result `mensajes: "x"`                                       | `Ok(d=1,c=0,r=1) m=1 […,result]`               | identical                               | SAME                                           |
| R20b | result `fechaRecepcion: {}`                                  | `Ok(d=1,c=0,`**`r=1`**`) m=1 […,result]`       | `Err(VALIDATION) […,result]`            | **DIFF — R-1**                                 |
| R20c | listing entry `fechaRecepcion: 42`                           | `Err(HTTP) m=1 [inquiry,tracks,result]`        | identical                               | SAME                                           |
| R20d | inquiry with `rncEmisor: 42`, `montoTotal/totalITBIS: "abc"` | `Ok(d=1,c=0,r=0) m=1 [inquiry]`                | identical                               | SAME                                           |
| R20e | result `rnc: 130862346`, `encf: null`                        | `Ok(d=1,c=0,r=1) m=1 […,result]`               | identical                               | SAME                                           |
| R23a | `No encontrado` with **no** marker seeded                    | `Ok(d=0,c=1,r=0) m=0 [inquiry]`                | identical                               | SAME                                           |

**Tally: 76 rows · 68 SAME · 5 DIFF explained by D-8 · 3 DIFF owned by R-1 · 0 THREW.**
Marker behaviour is identical on all 76 rows; every `Err` row leaves the marker readable; only the three
`No encontrado` rows delete it.

### 7.1 Predicate and aggregation sub-matrix

| Check                                                                                                        | Result                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canReuseSequence` / `can_reuse_sequence`, 14 states × 4 flags over the **model-admitted** domain (56 cells) | **56 SAME**; exactly the 5 trimmed-`Rechazado` variants answer `true` in both; `rechazado`/`RECHAZADO` answer `false` in both (no case folding); padding is `trim`/`strip` in both            |
| 144-cell hostile sweep (absent / `null` / object / array / number / boolean `estado` × 9 flag shapes)        | Only the non-string-`estado`-with-literal-`false`-flag cells differ: TS `false`, PY `AttributeError` — **R-3**, unconstructible from the wire                                                 |
| Aggregation rule (usable/followable)                                                                         | Identical on 8 constructed shapes: 0 / 1 / >1 usable, empty id, `null` id, `" "` id, `No encontrado` mixed in, numeric id; the `consultaresultado` call is made in exactly the same 5 of them |

### 7.2 What was _not_ scored, and why

| Field                                                                        | Rule that excludes it                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `error.resource`                                                             | §13: named in TypeScript only; Python's is always `None` (F-126-12). Measured anyway: TS names the correct endpoint on all 27 `Err` rows                                                                                                                                                      |
| `error.message` for a dict body with a bad field, and for transport failures | §13 scopes identical text to the non-dict/absent-body case; §2.4 and §5.6's parity note allow each package's own field-level text. Measured: 11 rows differ, 9 of them field-level text (`field 'estado' …`), 2 of them transport text (`fetch failed` vs `boom`) — the transport pair is D-8 |
| Model payload echo (`codigo`, `montoTotal`)                                  | No decision reads them; consequence of R-1/R-2: TS passes the raw value through, Python defaults it (`codigo` `undefined` vs `0`, `montoTotal` `"abc"` vs `None`). Registered with R-1/R-2, not scored                                                                                        |

---

## 8. Invariant-zone check (nothing broken)

| Invariant                                                                            | TypeScript                                                                                                            | Python                                                                | Verdict                                      |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------- |
| `delivered`/`cleared` derived from `consultaestado` only, **raw** equality, one site | `client.ts:460-461` (`!== 'No encontrado'`, `cleared = !delivered`)                                                   | `client.py:532-533` (`== "No encontrado"`, `delivered = not cleared`) | ✅ rows R2, R13f, R23a                       |
| `delete` only on a positive `No encontrado`                                          | `client.ts:486-488`                                                                                                   | `client.py:559-560`                                                   | ✅ 76/76 rows                                |
| Exactly one `delete`, last fallible statement, no I/O after it                       | `client.ts:486-494` (pure return after)                                                                               | `client.py:559-568` (pure return after)                               | ✅ by construction                           |
| No read between the clearing decision and the delete                                 | gate needs `delivered` (`client.ts:464`)                                                                              | gate needs `delivered` (`client.py:538`)                              | ✅ §8.1's stronger clause holds              |
| Gate is `ECF ∧ delivered ∧ trimmed Rechazado`, and only it                           | `client.ts:444`, `:464`                                                                                               | `client.py:523`, `:538`                                               | ✅ R12a-R12e, R1, R2                         |
| Cost profile (§2.3)                                                                  | 1 request for non-`ECF`/`Aceptado`/`No encontrado`; 2 for a rejection without a followable track; 3 on the happy path | identical                                                             | ✅ from recorded sequences, not from reading |
| Retry predicate and resilience config unchanged                                      | `git diff --name-only` touches no `resilience.*`/`errors.*`/`http.*`                                                  | same                                                                  | ✅                                           |
| Idempotency key derivation unchanged                                                 | no hunk in `buildIdempotencyKey`                                                                                      | no hunk in `_build_idempotency_key`                                   | ✅                                           |
| No `any` / `Any`, no `cast`, no float money                                          | `tsc --noEmit` clean; grep of the diff: none                                                                          | `mypy --strict` + `disallow_any_explicit` clean; grep: none           | ✅                                           |
| Python still synchronous                                                             | —                                                                                                                     | no `async`/`await` in the diff                                        | ✅                                           |
| ESM `.js` extensions                                                                 | `client.ts:29` `from './xml.js'`; `reconciliation.ts:4` `from './types.js'`                                           | n/a                                                                   | ✅                                           |
| Public surface P1-P9 of attempt 1 §5.3                                               | unchanged or improved; P8 now literally true of both methods                                                          | same                                                                  | ✅                                           |

`statusTrackId` and `trackStatuses` became `async` (they were `Promise`-returning before); the public type
is unchanged and the only behavioural difference is the new `Err`, which is the point. No new method, no
new option, no new endpoint constant.

---

## 9. Test quality (brief item 5)

| Requirement                                                                 | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No fixture may put `secuenciaUtilizada` on a `consultaestado` response      | ✅ **none**. 32 occurrences across the other eight test files carry the flag, every one on a payload DGII publishes it on: `consultaresultado` (`test/reconciliation.test.ts:110-118`, `tests/test_reconciliation.py:149-152`, `tests/test_client.py:23-31`, `token.test.ts:42-50`), RFCE reception E4 (`test_client.py:565-575`, `:655-666`, `types.test.ts:20-30`, `test_types.py:82-89`, `:107-119`, `:305-318`), and `consultarfce` (`client.test.ts:292-300`, `:317-325`, `test_client.py:340-350`, `:365-375`, `test_types.py:148-160`, `:328-336`). Both `inquiry()`/`inquiryPayload()` helpers say in so many words that they never carry it |
| No test may encode the SDK's internal types as DGII's wire shape            | ✅ **none**. The model-level constructions in `tests/test_reconciliation.py:391-406` and `tests/test_types.py` are predicate/parser unit tests (a model in, a value out), not mocked responses; TS's `asTrackResponse` (`test/reconciliation.test.ts:169-172`) casts a DGII-shaped payload **into** the type, with the reason documented                                                                                                                                                                                                                                                                                                             |
| Routed by URL, asserting order, so a flag read from the wrong service fails | ✅ both suites (`test/reconciliation.test.ts:137-151`, `tests/test_reconciliation.py:88-105`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **One test encodes a contract-wrong expectation**                           | 🔴 `tests/test_types.py:275-288` `test_wrong_type_raises` asserts that `TrackingStatusResponse.from_dict` **must** raise for `codigo: "not-a-number"` — it pins R-1 (§4.3 item 4) and must be inverted with the fix                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Remaining coverage gap                                                      | 🟡 transport error / non-5xx on the flag chain is in **neither** suite; it cannot be written until D-8's code question is settled (A-2), because a test would have to assert `UNKNOWN` in one package and `HTTP` in the other                                                                                                                                                                                                                                                                                                                                                                                                                        |

TS coverage is now 51 tests in `test/reconciliation.test.ts` including the previously missing C-2/C-5/C-6/C-7
cells (`:709`, `:731-753`, `:757`, `:777`, `:801`, `:823`) and the D-7 method-level locks (`:907-946`);
Python's is 33 in `test_reconciliation.py`, including R17a/R17b, R10j/R17c, R16a, R14a, R13e, R13d, R13j.

---

## 10. What attempt 3 must change (nothing else)

### 10.1 The only blocking change — R-1, Python only

`packages/python/src/py_dgii_ecf/types.py` — make the **non-classifying** fields of the three
reconcile-path models non-fatal, using the helper that is already there (`_as_optional_or_none`,
`:117-132`). Classifying fields stay strict.

```python
# TrackingStatusResponse.from_dict  (currently types.py:274-296)
codigo = _as_optional_or_none(_as_int, data.get("codigo"), "codigo") or 0
...
track_id=_as_optional_or_none(_as_str, data.get("trackId"), "trackId"),
rnc=_as_optional_or_none(_as_str, data.get("rnc"), "rnc"),
encf=_as_optional_or_none(_as_str, data.get("encf"), "encf"),
fecha_recepcion=_as_optional_or_none(_as_str, data.get("fechaRecepcion"), "fechaRecepcion"),
mensajes=_mensajes_or_empty(data.get("mensajes")),

# InquiryStatusResponse.from_dict  (currently types.py:354)
codigo = _as_optional_or_none(_as_int, data.get("codigo"), "codigo") or 0

# SummaryTrackingStatusResponse.from_dict  (currently types.py:319-321) — estado and
# trackId stay strict, they classify:
fecha_recepcion=_as_optional_or_none(_as_str, data.get("fechaRecepcion"), "fechaRecepcion"),
```

with one new three-line helper beside the others:

```python
def _mensajes_or_empty(value: object) -> tuple[Mensaje, ...]:
    """A malformed message list cannot fail a read whose answer is not in it."""
    try:
        return _parse_mensajes(value)
    except ResponseShapeError:
        return ()
```

Then:

1. Invert `tests/test_types.py:275-288` (`test_wrong_type_raises`) → assert the tolerance for a wrong-typed
   `codigo` on the result read, and keep a raise-assertion only for `estado` (which does classify).
2. Add the three matrix rows to both suites as table entries: R13l (inquiry `codigo:"abc"`), R17h (result
   `codigo:"x"` ⇒ `Ok`, `r=true`), R20b (result `fechaRecepcion:{}` ⇒ `Ok`, `r=true`) — TS's are green and
   lock the wire classification; Python's become green after the fix.
3. Leave `InquiryInvoiceSummary` (`:465-475`) alone — it is not on any reconcile path; register it under
   F-126-7-widened instead of widening the blast radius (unless the owner prefers symmetry).

### 10.2 Cheap non-blocking fixes (do them or register them, but not silently)

- **R-2** — move the payload guard into `client.ts`'s `inquiryStatus` and delete the call-site copy at
  `client.ts:451-455` (4 lines), _or_ register F-126-14.
- **R-3** — `reconciliation.py:68`: `(response.estado if isinstance(response.estado, str) else "").strip()`,
  _or_ state in §6 that the typed-input boundary is the contract's boundary.

### 10.3 Owner actions (not T4/T5 code)

- **A-1** — correct `126-contract-design.md:608-612` (D-10): drop T-L/T-M from the failing-first list.
- **A-2** — register `F-126-13 — transport failures normalize to different codes (TS UNKNOWN, PY HTTP)`
  **and** re-scope §13's «in both packages `code` and `message` match» to DGII-answered failures (D-8).
  Without this the §13 checklist is unmeetable by construction, in both packages, forever.
- **A-3** — if R-2/R-3 are registered rather than fixed, add them to C-1 §15's register with the reason.

### 10.4 Must not change

The marker path (`client.ts:460-461`, `:486-494`; `client.py:532-533`, `:559-568`), the gate, the request
order, `ReconciliationResult`, the retry predicate, the idempotency key, the `trackStatuses` normalisation
that now agrees, the strict `estado`/`trackId` classification on the inquiry and listing models, the
predicate's `false`/`true` answers in the 56-cell table, or any file under `packages/*/src/signing*` /
`schemas/`.

---

## 11. Documentation requirements (for the T8 brief)

**Answer to the brief's question: yes, both flagged widenings are public-behaviour changes and must be
documented — and so must four more the producers did not flag.** Each item below names the artefact and
what the sentence must say. `docs/en` and `docs/es` are mirrored: every item lands in both, or neither.

### 11.1 `project-docs/architecture.md` (the contract for the exported surface)

| Anchor                                                     | What must be added                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| §4.11 `client.ts` (line 407), §5.11 `client.py` (line 722) | A **payload-classification paragraph per read**, identical wording in both: `consultaestado` — an object with a string `estado` is accepted, anything else is `Err(VALIDATION, 'Unexpected DGII response payload')`; `consultatrackids` — single object ⇒ one-element list, `[]` ⇒ `Ok([])`, absent/`null`/non-object ⇒ `Err(VALIDATION)`, an entry without a string `estado` ⇒ `Err(VALIDATION)`; `consultaresultado` — an object is accepted, `estado`/`secuenciaUtilizada` are classified by the predicate and never fail the read, a non-object body is `Err(VALIDATION)`. |
| §4.11 / §5.11, method notes                                | `statusTrackId` **validates its payload** (new in this release, TS): a non-object body now returns `Err(VALIDATION)` where it previously returned `Ok`. `trackStatuses` **normalises and validates in-method** (new in this release, TS): single object ⇒ one-element array, absent ⇒ `Err`. Say both plainly as behaviour changes, not as bug fixes, because a caller's `isOk()` branch changes.                                                                                                                                                                              |
| §4.11 / §5.11, method notes                                | Python's tolerance, named field by field: `status_track_id` accepts a partial answer (`codigo` ⇒ `0`, an absent or unreadable `estado` ⇒ `""`), and `inquiry_status` defaults `codigo` to `0` and drops an unreadable **optional** fiscal field to `None` instead of raising. State the direction of each change (Python became **more** permissive; a caller who relied on `Err` for a malformed `montoTotal` now gets `Ok`).                                                                                                                                                 |
| §9.3 (line 909-925)                                        | After «`reconcileSubmission` clears it only when DGII has no record», add: a **rejected general e-CF** costs two further reads (`consultatrackids`, then `consultaresultado` only when exactly one followable track exists); a failed flag read returns `Err` with the marker untouched; `error.resource` names the failing read **in TypeScript only** (F-126-12).                                                                                                                                                                                                            |
| `types` sections §4.2 / §5.2                               | If they ever spell fields out: `TrackingStatusResponse.secuenciaUtilizada` is optional/nullable in TS, `SummaryTrackingStatusResponse.trackId` is optional in TS, and `InquiryStatusResponse.secuenciaUtilizada` is **removed** in TS (the flag is not published on `consultaestado`).                                                                                                                                                                                                                                                                                         |
| §14 «Spec gaps & risks»                                    | The registered divergences a reader of the parity promise must know: attempt counts (F-126-8, 4 vs 3 at the defaults), transport error **code** (F-126-13, once A-2 lands), Python's strict non-classifying-field parsing (F-126-7-widened, if R-1 is registered rather than fixed), `resource` (F-126-12).                                                                                                                                                                                                                                                                    |

### 11.2 Site docs

| File                                                                                                                                             | What must change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/en/guides/resilience.md:137-147` and `docs/es/guides/resilience.md:137-146`                                                                | Current text says only «DGII sets `secuenciaUtilizada: false` … an absent flag is treated as not reusable» and implies the flag comes from the inquiry. Replace with the real chain: the flag is read from `consultaresultado` **after** a rejection of a general e-CF; `true` requires `secuenciaUtilizada === false` **and** `estado === 'Rechazado'`; a non-boolean flag is **not** evidence; a non-string `estado` withholds, never throws; a failed flag read is `Err` with the marker intact; `false` means «the SDK did not obtain a positive reusable answer», not «DGII consumed the sequence». |
| `docs/en/guides/flow.md:34` + `docs/es/guides/flow.md:35` (diagram) and the reconcile snippets at `:219-234` / `:259-270` (and their `es` twins) | The diagram must show the gated chain `inquiryStatus` → (`ECF` ∧ delivered ∧ `Rechazado`) → `trackStatuses` → `statusTrackId`, and that `reconcileSubmission` can now return `Err` from either track read. The snippets should show the three-read happy path and the `Err` branch.                                                                                                                                                                                                                                                                                                                      |
| `docs/en/typescript.md:56,74` and `docs/es/typescript.md:56,72`                                                                                  | `statusTrackId` and `trackStatuses` return `Err(VALIDATION)` for an unreadable body (behaviour change); `canReuseSequence` accepts only `TrackingStatusResponse \| InquiryInvoiceSummary`; `InquiryStatusResponse.secuenciaUtilizada` is gone.                                                                                                                                                                                                                                                                                                                                                           |
| `docs/en/python.md:61,79` and `docs/es/python.md` equivalents                                                                                    | `status_track_id` / `inquiry_status` tolerate a partial answer (`codigo` ⇒ `0`, `estado` ⇒ `""` on the result read, unreadable optional field ⇒ `None`); `track_statuses` returns `Err` for an absent body, rejects a non-string `estado`, and drops a non-string `trackId` to `None`.                                                                                                                                                                                                                                                                                                                   |
| Migration note (release-please owns the changelog; the docs carry the detail)                                                                    | Four **compile-time** breaks for TS callers: removed `InquiryStatusResponse.secuenciaUtilizada`, narrowed `canReuseSequence` parameter, `TrackingStatusResponse.secuenciaUtilizada` now `boolean \| null \| undefined`, `SummaryTrackingStatusResponse.trackId` now optional. Two **runtime** breaks: `statusTrackId`/`trackStatuses` can return `Err`; Python's query methods can return `Ok` where they returned `Err`.                                                                                                                                                                                |

One sentence that must appear verbatim in `architecture.md` and the resilience guide, because it is the
whole point of the issue: **`canReuseSequence: false` does not mean DGII consumed the sequence; it means the
SDK did not obtain a positive reusable answer.**

---

## 12. Appendix — reproducing this review

Two harnesses plus probes, all under `/tmp/t6p2`, none committed (`packages/**` untouched):

```bash
python3 /tmp/t6p2/gen_scenarios.py            # 76 reconcile rows -> scenarios.json
python3 /tmp/t6p2/gen_family.py               # 90 hostile-field rows -> family.json

cd packages/typescript && bun run /tmp/t6p2/probe.ts            # -> ts.json
cd packages/python     && uv run --frozen python /tmp/t6p2/probe.py   # -> py.json
python3 /tmp/t6p2/diff2.py                    # behaviour + content diff

bun run /tmp/t6p2/probe_family.ts ; uv run --frozen python /tmp/t6p2/probe_family.py
bun run /tmp/t6p2/pred3.ts        ; uv run --frozen python /tmp/t6p2/pred3.py    # predicate matrix
bun run /tmp/t6p2/direct.ts       ; uv run --frozen python /tmp/t6p2/direct.py  # public methods
```

Routing: `consultaestado/` → the existence read, `consultaresultado/` → the result read,
`ConsultaTrackIds/` → the listing; an unrouted URL answers `404`, so a _surprise_ call shows up as a
failure instead of passing silently (row R20c exists for exactly that reason). Marker presence is read from
`InMemoryIdempotencyStore` after the call, under the key each SDK derives
(`RNC:eNCF:sha256(xml)`), so a cleared marker is observed, not inferred.

Gate results on this tree: `bunx vitest run` → 203 passed, 3 skipped; `uv run --frozen pytest` → 231
passed, 3 skipped; `mise run lint` → `tsc`, `ruff`, `ruff format`, `mypy src` and package prettier clean
(the only repo-wide prettier failure is the untracked `project-docs/marketing/github-listing.md`, not a
package file).

---

## 13. Verdict

**FAIL (attempt 2 of 3).**

What is genuinely fixed is substantial, and it is the hard part: the T-K ruling is implemented on the
Python side and locked by a rewritten test; the TypeScript predicate is total; the non-boolean flag no
longer changes a fiscal answer in either package; both packages classify a numeric `estado` the same way
and spend the same `consultaresultado` traffic; a numeric `trackId` no longer invents a track; and the
guard that attempt 1 asked to move into `statusTrackId` is there, with method-level tests. The invariant
zone is intact — marker path, gate, ordering, retry predicate, idempotency key, no `any`, no floats,
Python still synchronous, ESM intact — and no test fabricates a wire shape or puts the flag on
`consultaestado`.

What fails is one rule applied to six fields. `consultaresultado`, `consultaestado` and `consultatrackids`
bodies whose `codigo`, `trackId`, `rnc`, `encf`, `fechaRecepcion` or `mensajes` carry a type DGII does not
produce are still `Err` in Python and `Ok` in TypeScript — 29 cells, three of them changing the fiscal
answer, on the read #126 introduced, against C-1 §5.6 row 1 and §13, with a test (`test_wrong_type_raises`)
that freezes the wrong side. The fix is one existing helper at six call sites in
`packages/python/src/py_dgii_ecf/types.py`, one inverted test, and three matrix rows in each suite. No
TypeScript change is required, and nothing in §8's invariant zone is at risk.

Two items cannot be closed by code and must be closed by the owner before the parity claim is published:
the transport-error **code** gap (F-126-13, D-8) and §8.3's stale failing-first claim (D-10). Attempt 3 has
one attempt left; §10 is the complete list.
