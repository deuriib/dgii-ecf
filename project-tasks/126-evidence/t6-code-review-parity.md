# T6 — Cross-package code review and parity verdict (#126, attempt 1 of 3)

**Verdict: FAIL**

Two independent implementations of C-1 (`project-tasks/126-contract-design.md`) exist on
`fix/126-can-reuse-sequence` @ `e0b5f13` + working-tree changes. They are _mostly_ the same idea, and
both keep the frozen invariants (marker path, gate, call order). They are **not behaviourally
identical**, and one of them violates the frozen contract on the cell the contract names explicitly
(T-K), while the other **throws** where the contract requires a total predicate. A third family of
divergences (wire-type tolerance) is pre-existing but is now inside the review's remit because C-1 §13
requires identical payload classification.

- Rows compared: **53** reconcile scenarios, both packages, same harness (see §3).
- Cells that differ: **17**.
- Blockers introduced or owned by #126: **2** (D-1, D-2).
- Pre-existing parity gaps that must be fixed or formally registered: **6** (D-3 … D-8).
- Contract conformance of the #126-owned surface: **almost complete** — P1–P8 and the ordering
  invariant pass in both packages (§5).
- Test suites: both green (TS 184 passed (+3 skipped) / PY 198 passed (+3 skipped)), `mise run lint` clean for `src` in both packages.

Because `AGENTS.md` promises the two SDKs are behaviourally identical, and because the T6 definition
of done says _"Divergence on calls, order, fallbacks or error codes is a FAIL on the review, not a docs
note"_ (`126-tasklist.md`, T6), this attempt cannot pass.

---

## 0. What was reviewed

| Item           | Value                                                                                                                                                                                                                                                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch / base  | `fix/126-can-reuse-sequence`, base `e0b5f13`                                                                                                                                                                                                                                                                                                             |
| TS source diff | `client.ts` (+118/−6), `reconciliation.ts` (+50/−11), `types.ts` (+10/−4)                                                                                                                                                                                                                                                                                |
| PY source diff | `client.py` (+63/−11), `reconciliation.py` (+30/−11), `types.py` (+7/−6)                                                                                                                                                                                                                                                                                 |
| Tests          | `test/reconciliation.test.ts` (+692/−?), `tests/test_reconciliation.py` (+492/−?)                                                                                                                                                                                                                                                                        |
| Contract       | `126-contract-design.md` §2, §5, §5.6, §6, §7.1, §8, §9, §13                                                                                                                                                                                                                                                                                             |
| Commands run   | `bunx vitest run` (TS, 184 passed), `uv run --frozen pytest` (PY, 198 passed), `mise run lint` (tsc + ruff + mypy + prettier: `src` clean; repo-wide prettier fails only on untracked review notes (`project-tasks/126-evidence/*.md`, `project-docs/marketing/*.md`), not on package files), plus the parity harness and the fail-first replay in §3/§7 |

---

## 1. The reported divergence (T-K) — ruling

### 1.1 What the two code paths actually do

**TypeScript** (`packages/typescript/src/reconciliation.ts:60-70`,
`packages/typescript/src/client.ts:466-476`):

```ts
const status = await this.statusTrackId(trackId);   // client.ts:466 — unchecked cast, no validation
if (status.isErr()) return err(status.error);
if (!isRecord(status.value)) return err(unexpectedPayload(...));   // client.ts:470 — object check only
canReuse = canReuseSequence(status.value);          // client.ts:475
...
const estado: string | undefined = response.estado; // reconciliation.ts:65
(response.secuenciaUtilizada === false && (estado ?? '').trim() === 'Rechazado')
```

A `consultaresultado` body of `{"secuenciaUtilizada": false}` therefore reaches the predicate with
`estado === undefined`, the `?? ''` guard absorbs it, and reconcile returns
`Ok({ delivered: true, cleared: false, canReuseSequence: false })`.

**Python** (`packages/python/src/py_dgii_ecf/client.py:544-547` →
`packages/python/src/py_dgii_ecf/types.py:226-240`):

```python
track = self.status_track_id(track_id)              # -> _parse_response -> _parse_one
...
codigo=_as_int(data.get("codigo"), "codigo"),       # types.py:228  -> None is not an int -> raise
estado=_as_str(data.get("estado"), "estado"),       # types.py:229  -> None is not a str -> raise
```

`ResponseShapeError` is converted by `_parse_one` into
`Err(VALIDATION, "field 'estado' must be a string, got NoneType")`, which reconcile propagates
unchanged. The reported divergence is confirmed, and it is **wider than reported**: a body without
`codigo` is rejected one field earlier (`"field 'codigo' must be an integer, got NoneType"`), so
Python fails on the contract's own T-K fixture (`§8.3 T-K` = `{secuenciaUtilizada:false}`, no
`codigo`) for two independent reasons. Both are the same defect.

Evidence (mechanical, §3): rows **R10a**, **R10b**, **R10c**.

### 1.2 Ruling: TypeScript satisfies the frozen contract; Python must change

`Ok(canReuseSequence: false)` is the contract's answer. Reasons, in order of weight:

1. **The contract names this exact payload and this exact outcome.** C-1 §8.3, row **T-K**:
   _"`ECF` + `Rechazado` + one track + `{secuenciaUtilizada:false}` (**`estado` absent**) →
   `Ok(canReuseSequence:false)`, no exception"_, under the table's preamble _"Every row is an
   executable form of a rule in this document."_ Python's suite asserts the opposite
   (`tests/test_reconciliation.py:341-374`, `assert run.result.is_err()`), i.e. it is green against a
   _contradiction_ of the contract.
2. **§6 rule 3 makes the tolerant default normative and calls it a parity requirement**: _"A missing
   `estado` is `false`, never a `TypeError`/`AttributeError` escaping `reconcileSubmission`. This is B2
   and it is a parity requirement."_ §13 repeats it in the checklist (_"`''`/`""` default for `estado`;
   a missing `estado` is `false`"_). If a missing `estado` were an `Err` at the parse boundary, the
   `?? ''` / `or ""` default would be **dead code in both packages** and §6 rule 3 would have no
   observable effect — which cannot be the intended reading of a rule that was added by name to fix
   B2.
3. **§5.6 draws the line deliberately.** For the _listing_ read it writes `Err(VALIDATION)` for
   _"`estado` missing / not a string"_; for the _result_ read the same cell is `—` (unspecified),
   while §6 rule 3 supplies the answer. An entry's `estado` decides _which_ track is usable, so an
   unclassifiable entry must fail; the result's `estado` only corroborates a flag that was already
   read, so its absence can only _withhold_ `true`.
4. **§7.1(a) does not apply.** §7.1 is scoped to reads that **did not happen**: _"The flag question
   was asked of DGII and DGII did not answer."_ In T-K DGII answered — the flag is present and says
   `false`; what is missing is corroboration of the verdict. §9.2's own taxonomy agrees: C6 (`Err`) is
   _"the flag chain could not be completed (transport, HTTP, unreadable payload, delegation)"_, while
   C5 (`false`) covers _"the verdict is not `Rechazado`, the flag is absent, or the flag is `true`"_.
   A readable flag with no verdict is C5 by construction: `false` means _"the SDK did not obtain a
   positive reusable answer"_ — exactly this case. Reporting `Err` would send the caller into a retry
   loop for an answer that will never change, and would label a successful read as a failed one.
5. **§7.1(b) ("an unreadable payload is `Err(VALIDATION)` at the parsing boundary") is satisfied by
   both readings only for _objects that cannot be read at all_** — non-object, `null`, absent, empty.
   Both packages already agree there (matrix rows R10d/R10e are `SAME`). A dict is readable; §5.6's
   `Err` rows for the result read are exactly those three shapes, and a dict missing `estado` is not
   one of them.

Against this, §2.4's sentence _"A payload the SDK cannot read is `Err(VALIDATION)` in both packages"_
is the strongest counter-argument, but it is the general statement that §6 rule 3, §8.3 T-K and §13
specialise; a specific normative row beats the general principle (and §2.4 itself is about the
_non-dict / absent-body_ case, which is how it scopes the identical-message requirement two lines
later).

### 1.3 Why this cannot be resolved by documenting it

Explicitly rejected: `126-tasklist.md` T6 states _"Divergence on calls, order, fallbacks or error
codes is a FAIL on the review, not a docs note. A FAIL sends the work back to T4/T5."_ C-1 §13's
first line is _"Both implementations must satisfy every line; T6 fails the review on any divergence
(C-2)."_ A documented divergence is still a divergence, and `AGENTS.md`'s core promise is that the two
packages behave identically. The Python docstring at `tests/test_reconciliation.py:342-349` and the
`reconcile_submission` docstring (_"a non-answer is never reported as 'not reusable'"_) are honest, but
they document a contract breach rather than removing it.

### 1.4 The exact change the losing side (Python) must make

`packages/python/src/py_dgii_ecf/types.py:226-240` — in `TrackingStatusResponse.from_dict`, treat the
two corroboration fields as **optional on input, still required on the model** (public annotations
unchanged, so P1–P7 are untouched):

```python
# types.py, TrackingStatusResponse.from_dict
codigo=_as_optional_int(data.get("codigo"), "codigo") or 0,
# The verdict only corroborates the flag on this read, so an absent or
# unreadable one cannot license `True`: it becomes the predicate's "" default.
estado=data["estado"] if isinstance(data.get("estado"), str) else "",
```

- Absent (`None` — JSON `null` and "key missing" are indistinguishable after decoding) → `0` / `""` →
  `can_reuse_sequence` answers `False` → reconcile returns `Ok(canReuseSequence=False)` exactly like
  TypeScript (rows R10a/R10b/R10c).
- An absent **or unreadable** verdict becomes `""` rather than an error, which is the only way to reach
  `Ok(false)` for rows R17a/R17b too (the same answer TypeScript gives after D-2's fix), and is what
  §6 rule 3 asks for: _"A missing `estado` is `false`, never a `TypeError`"_.
- A wrong-typed `codigo` (`"x"`, `{}`) still raises in Python while TypeScript ignores the field
  entirely — DGII types it as an integer in E2/E19 and nothing on this path reads it, so the residual is
  accepted (a sibling of F-126-7) rather than papered over with a silent default.
- **Wider public effect, stated openly** (the point (c) of the review brief raises): `status_track_id` is a
  public method, so a caller who currently gets `Err(VALIDATION)` for a partial `consultaresultado`
  body would now get `Ok` with defaults. That is the _same_ public behaviour TypeScript has today
  (unchecked cast ⇒ `Ok`), so the change moves Python toward parity rather than away from it — and it
  is a strictly smaller public-surface change than the alternative (adding a validator to TS's
  `statusTrackId`, which would contradict T-K, break TS callers who currently get `Ok`, and still not
  fix Python). It must be called out in the T8 documentation as a `statusTrackId` /
  `status_track_id` behaviour change, in the same way P8's `trackStatuses` change is.
- **Test change that goes with it:** rewrite `tests/test_reconciliation.py:341-374` to assert
  `Ok` + `can_reuse_sequence is False` + marker intact, and keep the two totality assertions on the
  predicate.

---

## 2. The frozen-contract decision the matrix also enforces

For the record, so attempt 2 does not re-litigate it: the two packages must classify payloads per
**read**, identically:

| Read                               | `estado` absent                | `estado` present, not a string              | flag present, not a bool                                        |
| ---------------------------------- | ------------------------------ | ------------------------------------------- | --------------------------------------------------------------- |
| `consultaestado` (existence)       | `Err(VALIDATION)` (T-C)        | `Err(VALIDATION)` (D-4)                     | n/a (no flag published)                                         |
| `consultatrackids` (listing entry) | `Err(VALIDATION)` (§5 step 7b) | `Err(VALIDATION)` (D-4)                     | n/a                                                             |
| `consultaresultado` (result)       | `Ok(false)` (T-K)              | `Ok(false)` (§6 rule 3: cannot corroborate) | `Ok(false)` (§6 rule 2: only a literal `false` licenses `true`) |

This is the only reading that keeps T-K, §6 rules 2–3 and §13 simultaneously satisfiable.

---

## 3. Parity matrix (mechanical, 53 rows)

**Method.** Two throwaway harnesses (outside the repo, `/tmp`, not committed — see §9 for how to
rebuild them) drive the _public_ `reconcileSubmission` / `reconcile_submission` of each package with a
scripted transport:

- TypeScript: injected `fetchImpl` routed by URL prefix, request URLs recorded in order,
  `InMemoryIdempotencyStore`, `resilience: { maxRetries: 1, retryInitialDelayMs: 1 }`.
- Python: `httpx2.MockTransport` routed on `request.url`, every request appended to a list,
  `InMemoryIdempotencyStore`, `ResilienceOptions(max_retries=1)`.

Both then record `{outcome, delivered, cleared, canReuseSequence, code, resource, markerPresent,
request sequence}` and the two JSON dumps are diffed field by field. Notation below:
`Ok(d,c,r)` = `delivered, cleared, canReuseSequence`; `[INQ,TRK,RES]` = the request sequence
(`consultaestado`, `consultatrackids`, `consultaresultado`); `marker` = the pending marker is still
readable afterwards. Neither package "cannot express" any row: every input below is representable as a
JSON body.

| #        | Scenario (wire payload)                                | TypeScript                                                                    | Python                                                                    | Verdict                                                  |
| -------- | ------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------- |
| R1       | root `ECF`, `consultaestado` → `Aceptado`              | `Ok(d=1,c=0,r=0) [INQ] marker=1`                                              | identical                                                                 | SAME                                                     |
| R2       | root `ECF`, `consultaestado` → `No encontrado`         | `Ok(d=0,c=1,r=0) [INQ] marker=0`                                              | identical                                                                 | SAME                                                     |
| R3       | `Rechazado` + listing `[]`                             | `Ok(d=1,c=0,r=0) [INQ,TRK] marker=1`                                          | identical                                                                 | SAME                                                     |
| R4       | happy path: `Rechazado`, 1 track, `Rechazado`+`false`  | `Ok(d=1,c=0,r=1) [INQ,TRK,RES] marker=1`                                      | identical                                                                 | SAME                                                     |
| R5       | result `Aceptado`+`true`                               | `Ok(d=1,c=0,r=0) [INQ,TRK,RES] marker=1`                                      | identical                                                                 | SAME                                                     |
| R6       | listing with two entries                               | `Ok(d=1,c=0,r=0) [INQ,TRK] marker=1`                                          | identical                                                                 | SAME                                                     |
| R7       | listing, one entry, no `trackId`                       | `Ok(d=1,c=0,r=0) [INQ,TRK] marker=1`                                          | identical                                                                 | SAME                                                     |
| R8a      | listing → empty body                                   | `Err(VALIDATION) [INQ,TRK] marker=1`                                          | identical                                                                 | SAME                                                     |
| R8b      | listing → JSON `null`                                  | `Err(VALIDATION) [INQ,TRK] marker=1`                                          | identical                                                                 | SAME                                                     |
| R8c      | listing → single object (E12 shape)                    | `Ok(d=1,c=0,r=1) [INQ,TRK,RES] marker=1`                                      | identical                                                                 | SAME                                                     |
| R8d      | listing → non-array string body                        | `Err(VALIDATION) [INQ,TRK] marker=1`                                          | identical                                                                 | SAME                                                     |
| R9       | listing entry without `estado`                         | `Err(VALIDATION) [INQ,TRK] marker=1` (msg `Unexpected DGII response payload`) | `Err(VALIDATION) …` (msg `field 'estado' must be a string, got NoneType`) | SAME code/outcome; text differs — waived by §5.6/F-126-7 |
| **R10a** | result body without `estado` (with `codigo`)           | `Ok(d=1,c=0,r=0)`                                                             | `Err(VALIDATION)`                                                         | **DIFF (D-1)**                                           |
| **R10b** | result body `{secuenciaUtilizada:false}` (T-K literal) | `Ok(d=1,c=0,r=0)`                                                             | `Err(VALIDATION)` on `codigo`                                             | **DIFF (D-1)**                                           |
| **R10c** | result body `{}`                                       | `Ok(d=1,c=0,r=0)`                                                             | `Err(VALIDATION)` on `codigo`                                             | **DIFF (D-1)**                                           |
| R10d     | result body non-object (`"nope"`)                      | `Err(VALIDATION)`                                                             | `Err(VALIDATION)`, same message                                           | SAME                                                     |
| R10e     | result body empty                                      | `Err(VALIDATION)`                                                             | `Err(VALIDATION)`, same message                                           | SAME                                                     |
| R10f     | result body, flag absent                               | `Ok(…r=0)`                                                                    | identical                                                                 | SAME                                                     |
| R10g     | result body, flag `true`                               | `Ok(…r=0)`                                                                    | identical                                                                 | SAME                                                     |
| R10h     | result `Aceptado` + flag `false`                       | `Ok(…r=0)`                                                                    | identical                                                                 | SAME                                                     |
| R10i     | result `" Rechazado "` + flag `false`                  | `Ok(…r=1)`                                                                    | identical                                                                 | SAME                                                     |
| **R10j** | result flag `"false"` (string)                         | `Ok(…r=0)`                                                                    | `Ok(…r=1)` **— over-claims reuse**                                        | **DIFF (D-3)**                                           |
| **R11a** | result → HTTP 500                                      | `Err(HTTP) [INQ,TRK,RES,RES]`                                                 | `Err(HTTP) [INQ,TRK,RES]`                                                 | **DIFF (D-8: attempts)**                                 |
| **R11b** | result → transport error                               | `Err(UNKNOWN)`                                                                | `Err(HTTP)`                                                               | **DIFF (D-8: code)**                                     |
| **R11c** | listing → HTTP 500                                     | `Err(HTTP) [INQ,TRK,TRK]`                                                     | `Err(HTTP) [INQ,TRK]`                                                     | **DIFF (D-8: attempts)**                                 |
| **R11d** | inquiry → HTTP 500                                     | `Err(HTTP) [INQ,INQ]`                                                         | `Err(HTTP) [INQ]`                                                         | **DIFF (D-8: attempts)**                                 |
| **R11e** | inquiry → transport error                              | `Err(UNKNOWN)`                                                                | `Err(HTTP)`                                                               | **DIFF (D-8: code)**                                     |
| R12a     | root `RFCE`, `Rechazado`                               | `Ok(d=1,c=0,r=0) [INQ] marker=1`                                              | identical                                                                 | SAME                                                     |
| R12b     | root `ACECF`, `Rechazado`                              | `Ok(d=1,c=0,r=0) [INQ] marker=1`                                              | identical                                                                 | SAME                                                     |
| R12c     | root `ANECF` (`SecuenciaeNCFDesde`), `Rechazado`       | `Ok(d=1,c=0,r=0) [INQ] marker=1`                                              | identical                                                                 | SAME                                                     |
| R12d     | unknown root `FOO`, `Rechazado`                        | `Ok(d=1,c=0,r=0) [INQ] marker=1`                                              | identical                                                                 | SAME                                                     |
| R13a     | inquiry → empty body                                   | `Err(VALIDATION) [INQ] marker=1`                                              | identical                                                                 | SAME                                                     |
| R13b     | inquiry → JSON `null`                                  | `Err(VALIDATION) [INQ] marker=1`                                              | identical                                                                 | SAME                                                     |
| R13c     | inquiry object without `estado`                        | `Err(VALIDATION)`                                                             | `Err(VALIDATION)`, own text                                               | SAME code — waived by §5.6                               |
| **R13d** | inquiry object without `codigo`                        | `Ok(d=1,c=0,r=0)`                                                             | `Err(VALIDATION)`                                                         | **DIFF (D-6)**                                           |
| **R13e** | inquiry `estado: 1` (numeric)                          | `Err(VALIDATION)`                                                             | `Ok(d=1,…)` with `inquiry.estado == "1"`                                  | **DIFF (D-4 / F-126-7)**                                 |
| R13f     | inquiry `" No encontrado "` (padded)                   | `Ok(d=1,c=0,r=0) marker=1`                                                    | identical                                                                 | SAME                                                     |
| R13g     | inquiry `" Rechazado "` (padded)                       | `Ok(d=1,c=0,r=1)`                                                             | identical                                                                 | SAME                                                     |
| R13h     | inquiry `estado: ""`                                   | `Ok(d=1,c=0,r=0) marker=1`                                                    | identical                                                                 | SAME (Q11, unchanged)                                    |
| R13i     | inquiry → JSON array                                   | `Err(VALIDATION)`                                                             | identical                                                                 | SAME                                                     |
| **R13j** | inquiry `montoTotal: "abc"`                            | `Ok(d=1,…)`                                                                   | `Err(VALIDATION)`                                                         | **DIFF (D-6)**                                           |
| **R14a** | listing entry `estado: 1` (numeric)                    | `Err(VALIDATION) [INQ,TRK]`                                                   | `Err(HTTP) [INQ,TRK,RES]` — **follows the coerced track**                 | **DIFF (D-4)**                                           |
| R14b     | listing `[No encontrado, Rechazado+id]`                | `Err(HTTP)` (unrouted RES in harness)                                         | identical                                                                 | SAME                                                     |
| **R16a** | listing entry `trackId: 5` (numeric)                   | `Ok(d=1,c=0,r=0) [INQ,TRK]`                                                   | `Ok(…r=1) [INQ,TRK,RES]` **— over-claims reuse**                          | **DIFF (D-5)**                                           |
| R16b     | listing entry `trackId: ""`                            | `Ok(…r=0) [INQ,TRK]`                                                          | identical                                                                 | SAME                                                     |
| R16c     | listing entry `estado: ""`                             | `Ok(…r=1)`                                                                    | identical                                                                 | SAME                                                     |
| R16d     | result body JSON array                                 | `Err(VALIDATION)`                                                             | identical                                                                 | SAME                                                     |
| R16e     | listing `[[]]` (nested array)                          | `Err(VALIDATION)`                                                             | identical                                                                 | SAME                                                     |
| R16f     | inquiry `fechaEmision: null`                           | `Ok(d=1,…)`                                                                   | identical                                                                 | SAME                                                     |
| **R17a** | result `estado: 42` (numeric)                          | **`TypeError` thrown out of `reconcileSubmission`**                           | `Ok(…r=0)`                                                                | **DIFF (D-2, blocker)**                                  |
| **R17b** | result `estado: {}` (object)                           | **`TypeError` thrown**                                                        | `Err(VALIDATION)`                                                         | **DIFF (D-2, blocker)**                                  |
| **R17c** | result flag `0` (numeric)                              | `Ok(…r=0)`                                                                    | `Ok(…r=1)`                                                                | **DIFF (D-3)**                                           |
| R15      | signed XML without emitter RNC / e-NCF                 | `Err(VALIDATION) [] marker=1`                                                 | identical                                                                 | SAME                                                     |

**17 of 53 rows differ.** The rows marked `SAME` are exactly the ones C-1 was written for: existence
never moves, the gate holds, the aggregation declines on 0/2+/no-id, unreadable bodies fail with the
same code and message, `false`/absent/`true` all answer `false`, and no `Err` row ever touches the
marker.

### 3.1 Which cell is asserted by a test, and where

| Row                 | TypeScript test                                                      | Python test                                                                                       |
| ------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| R1                  | `[T-L]` (`reconciliation.test.ts:472`)                               | `test_accepted_document_costs_a_single_request` (`:405`)                                          |
| R2                  | `[T-D]`/`[T-M]` (`:297`,`:490`)                                      | `test_clears_the_marker_when_dgii_has_no_record` (`:210`), `test_unknown_document_…` (`:418`)     |
| R3                  | `[T-F]` (`:337`)                                                     | `test_empty_track_array_does_not_clear_or_claim_reuse` (`:238`)                                   |
| R4                  | `[T-I]` (`:407`)                                                     | `test_reports_a_reusable_sequence_on_a_rejection` (`:300`)                                        |
| R5                  | (predicate only, `:190`)                                             | (predicate only, `:151`)                                                                          |
| R6                  | `[T-O]` (`:523`)                                                     | `test_several_tracks_decline_to_claim_reuse` (`:440`)                                             |
| R7                  | `[T-P]` (`:547`)                                                     | `test_track_without_an_id_declines_to_claim_reuse` (`:458`)                                       |
| R8a/R8b             | `[T-E]` (`:315`), `trackStatuses` block (`:666`)                     | `test_empty_track_listing_is_an_error_and_keeps_the_marker` (`:223`)                              |
| R8c                 | `accepts DGII's single-object listing shape` (`:570`)                | **nothing** (coverage hole C-3)                                                                   |
| R8d                 | `trackStatuses` block (`:680`)                                       | **nothing** (hole C-3)                                                                            |
| R9                  | `trackStatuses > entry has no string estado` (`:680`)                | `test_unclassifiable_track_entry_…` (`:266`)                                                      |
| R10a/R10b/R10c      | `[T-K]` (`:453`)                                                     | `test_result_without_estado_fails_loudly_instead_of_rising` (`:341`) — asserts the **wrong** side |
| R10d/R10e           | `fails with VALIDATION when the track result body is empty` (`:593`) | **nothing** (hole C-4)                                                                            |
| R10f                | `[T-J]` (`:434`)                                                     | `test_absent_flag_answers_not_reusable` (`:325`)                                                  |
| R10g/R10h/R10i      | predicate tests (`:190-235`)                                         | predicate test (`:151-177`)                                                                       |
| R10j/R17c           | **nothing** (hole C-1)                                               | **nothing** (hole C-1)                                                                            |
| R11a                | `[T-H]` (`:521`)                                                     | `test_failing_result_read_fails_the_call_…` (`:278`)                                              |
| R11b/R11d/R11e/R11c | **nothing** (hole C-4)                                               | **nothing**                                                                                       |
| R12a                | `[T-N]` (`:543`)                                                     | `test_rfce_rejection_costs_a_single_request` (`:428`)                                             |
| R12b–R12d           | **nothing** (hole C-5)                                               | **nothing**                                                                                       |
| R13a/R13b           | `[T-A]`/`[T-B]` (`:251`,`:267`)                                      | `test_empty_inquiry_body…`/`test_null_inquiry_body…` (`:180`,`:190`)                              |
| R13c                | `[T-C]` (`:282`)                                                     | `test_inquiry_without_estado_…` (`:200`)                                                          |
| R13d/R13e/R13j      | **nothing** (holes C-2, C-6)                                         | **nothing**                                                                                       |
| R13f                | **nothing** (hole C-7)                                               | `test_padded_no_encontrado_does_not_clear_the_marker` (`:376`)                                    |
| R13g                | **nothing** (hole C-7)                                               | `test_padded_rechazado_still_enters_the_gate` (`:388`)                                            |
| R13h                | **nothing**                                                          | **nothing**                                                                                       |
| R14a                | **nothing**                                                          | **nothing**                                                                                       |
| R16a/b/c            | **nothing**                                                          | **nothing**                                                                                       |
| R17a/R17b           | **nothing** (hole C-1 — and this is the hole that hid D-2)           | **nothing**                                                                                       |
| R15                 | `rejects a document without an emitter RNC or e-NCF` (`:612`)        | `test_rejects_a_document_without_rnc_or_encf` (`:470`)                                            |

---

## 4. Defect register

Severity: 🔴 blocker (contract violation or results-not-exceptions breach), 🟡 must fix or register
with owner sign-off before the parity claim can be made, 💭 nit.

### 🔴 D-1 — T-K: Python returns `Err(VALIDATION)` where C-1 mandates `Ok(false)`

- **Where:** `packages/python/src/py_dgii_ecf/types.py:228-229`
  (`TrackingStatusResponse.from_dict`), reached from `packages/python/src/py_dgii_ecf/client.py:544`.
- **Why it is a defect:** C-1 §8.3 T-K and §6 rule 3 (see §1.2 above). It also makes the Python suite
  assert a contradiction of the contract (`tests/test_reconciliation.py:341-374`).
- **Fix:** `codigo=_as_optional_int(data.get("codigo"), "codigo") or 0` and
  `estado="" if data.get("estado") is None else _as_str(data.get("estado"), "estado")`; rewrite the
  T-K test to expect `Ok` + `can_reuse_sequence is False` + marker intact; mention the
  `status_track_id` tolerance change in T8.

### 🔴 D-2 — TypeScript `canReuseSequence` throws for a non-string `estado`

- **Where:** `packages/typescript/src/reconciliation.ts:65-68` —
  `const estado: string | undefined = response.estado; … (estado ?? '').trim()`. `??` only covers
  `null`/`undefined`; a number or object from the unchecked cast reaches `.trim()` and throws.
- **Observed:** result body `{"codigo":2,"trackId":"TRACK-1","estado":42,"secuenciaUtilizada":false}`
  ⇒ `TypeError: (estado ?? "").trim is not a function`, escaping `reconcileSubmission`
  (`packages/typescript/src/client.ts:475`) as a **rejected promise**, not an `Err`. Rows R17a/R17b.
- **Why it is a defect:** C-1 §6 ("it is **total**: it cannot throw, for any input the models admit"),
  §6 rule 3 (_"never a `TypeError` … escaping `reconcileSubmission`"_) and the `AGENTS.md` invariant
  _"Results, not exceptions … only programmer errors throw"_ — a hostile wire body is not a programmer
  error. Python returns a value in both cases, so the two packages also differ.
- **Fix:**

  ```ts
  const estado: unknown = response.estado;
  return (
    response.secuenciaUtilizada === false &&
    (typeof estado === 'string' ? estado.trim() : '') === 'Rechazado'
  );
  ```

  Add the two missing cases to the predicate tests (`estado: 42`, `estado: {}`) and the two reconcile
  rows (R17a/R17b) to `test/reconciliation.test.ts`. This turns both rows into `Ok(false)` in TS, which
  is what the result read must answer for an unreadable verdict (§6 rule 3, §2's table); Python reaches
  the same `Ok(false)` through D-1's tolerance (`estado=""` for a non-string), so the two rows converge
  without either package adding a validator to the result read.

### 🟡 D-3 — A non-boolean `secuenciaUtilizada` changes the fiscal answer (Python over-claims)

- **Where:** `packages/python/src/py_dgii_ecf/types.py:233-235` (`_as_optional_bool`, which coerces
  `"false"`/`0` to `False`) vs `packages/typescript/src/reconciliation.ts:67` (`=== false`).
- **Observed:** R10j flag `"false"` → TS `canReuseSequence: false`, PY `true`; R17c flag `0` → TS
  `false`, PY `true`.
- **Why it matters:** this is not error text, it is the _answer the issue exists for_: one SDK tells the
  integrator the sequence may be reused while the other says it may not. C-1 §6 rule 1 ("`true`
  requires explicit DGII evidence … `secuenciaUtilizada === false`") and rule 2 ("the wire is
  untrusted … absence must be tolerated") both read a non-boolean as "no evidence", i.e. `false`.
- **Fix (either, but explicitly):**
  - Preferred, local: parse the flag with a non-coercing reader in the two carriers
    (`TrackingStatusResponse.from_dict`, `InquiryInvoiceSummary.from_dict`), mapping any non-`bool` to
    `None`; keep `_as_optional_bool` untouched for `InvoiceResponse`/others so the tolerance tests for
    those fields keep passing (`tests/test_types.py:52-59` covers `TrackingStatusResponse`, so it must
    move to the new rule).
  - Or register the divergence with owner sign-off (it is pre-existing: `main`'s predicate had the same
    coercion). Leave it undocumented and the parity claim is false.

### 🟡 D-4 — `_as_str` numeric coercion makes classification differ (F-126-7, wider than recorded)

- **Where:** `packages/python/src/py_dgii_ecf/types.py:72-83` (`_as_str`), used by
  `InquiryStatusResponse.from_dict` (line 285, `estado` at 288) and `SummaryTrackingStatusResponse.from_dict`
  (`types.py:254`).
- **Observed:** R13e (inquiry `estado: 1`) TS `Err(VALIDATION)` / PY `Ok` with `estado == "1"`; R14a
  (listing entry `estado: 1`) TS `Err(VALIDATION)` with **no** follow-up call, PY coerces, treats the
  entry as usable and **issues an extra `consultaresultado` request** (then fails on it). The design
  records F-126-7 as _"the payload is not one DGII produces … recorded rather than silently diverging"_,
  which understates it: the divergence is a different _call sequence_, not just different text.
- **Fix** (one rule per read, exactly the table in §2): add a non-coercing reader next to `_as_str`
  (`_as_str_strict(value, key)` — a 3-line helper that raises `ResponseShapeError` unless
  `isinstance(value, str)`) and use it for `estado` at
  `InquiryStatusResponse.from_dict` (line 288) and `SummaryTrackingStatusResponse.from_dict`
  (`types.py:254`). Rows R13e/R14a then agree with TypeScript (`Err(VALIDATION)`, no extra request).
  Keep `TrackingStatusResponse.from_dict` on the D-1 tolerance (`""` when absent **or** not a
  string), because on the result read an unreadable verdict may only withhold `true` — that is what
  makes R17a/R17b `Ok(false)` in both packages. This closes F-126-7 for `estado` instead of deferring
  it; the alternative is to register F-126-7 _and_ accept that `consultatrackids` traffic differs
  between the packages, which §13 forbids.

### 🟡 D-5 — A numeric `trackId` is followable in Python and not in TypeScript

- **Where:** `packages/python/src/py_dgii_ecf/types.py:255` (`track_id=_as_optional_str(...)`) +
  `client.py:537` (`if entry.track_id`) vs `packages/typescript/src/client.ts:465`
  (`typeof trackId === 'string' && trackId.length > 0`).
- **Observed:** R16a listing entry `{"trackId": 5, "estado": "Rechazado"}` → TS `Ok(r=false)` with no
  `consultaresultado` call; PY `Ok(r=**true**)` after following track `"5"`. Python answers "reuse
  allowed" from a track id it invented.
- **Fix:** map a non-string `trackId` to `None` in `SummaryTrackingStatusResponse.from_dict`
  (`track_id=_as_optional_str_or_none(...)`), so `followable` excludes it; add the row to both suites.

### 🟡 D-6 — The existence read is stricter in Python than §5.6 row 1 ("object with a string `estado` → accepted")

- **Where:** `packages/python/src/py_dgii_ecf/types.py:228` (requires `codigo`) and the optional-field
  validators (`montoTotal`, `totalITBIS`, …) vs `packages/typescript/src/client.ts:441` (checks only
  `estado`).
- **Observed:** R13d (`{"estado":"Aceptado"}`, no `codigo`) TS `Ok` / PY `Err(VALIDATION)`; R13j
  (`montoTotal: "abc"`) TS `Ok` / PY `Err(VALIDATION)`. Pre-existing on `main` — but §13 requires the
  same payload classification, and #126 is the change that made the classification explicit.
- **Fix:** default `codigo` to `0` in both Python models (same change as D-1; it also takes R10b/R10c
  from two failure reasons to one). For the optional fiscal fields, pick one and write it down:
  (a) keep Python strict and add the equivalent validation to TS (large, out of #126 scope), or
  (b) relax Python's _optional_ fields to "unparseable ⇒ `None`" (small, keeps `Estado`-based
  classification authoritative), or (c) register as F-126-14 with owner sign-off. Recommendation:
  (b) for `reconcile`-visible fields, because DGII's document (E1) fixes those types and neither
  package has a consumer for a malformed `montoTotal`.

### 🟡 D-7 — `statusTrackId` / `status_track_id` disagree on a non-object body

- **Where:** `packages/typescript/src/client.ts:617-626` returns the decoded body with no validation
  (the `isRecord` guard lives at the _call site_, `client.ts:470`), while Python's `_parse_one` rejects
  non-dicts (`client.py:84-97`).
- **Observed:** a direct `statusTrackId('x')` call with body `"nope"` ⇒ TS `Ok("nope")` (cast to
  `TrackingStatusResponse`), PY `Err(VALIDATION)`. On the reconcile path both agree (R10d/R10e), so the
  matrix hides it — but it is a public-method divergence and it contradicts P8's stated principle
  (_"This is the layer that owns parsing, so this is where the rule lives"_).
- **Fix:** move the guard into TS's `statusTrackId`
  (`if (!isRecord(payload)) return err(unexpectedPayload(Endpoint.TrackResultStatus, payload));`) and
  delete the duplicated check at `client.ts:470`. T-K still passes (the T-K body is an object).

### 🟡 D-8 — Transport-error code and attempt count differ (pre-existing; must be registered)

- **Where:** TS `toDgiiError` (`packages/typescript/src/errors.ts`) maps a thrown `TypeError` to
  `UNKNOWN`; Python's `HttpClient._execute` maps `httpx2.HTTPError` to `HTTP`
  (`packages/python/src/py_dgii_ecf/http.py:243-250`). Attempt counts: TS performs 2 transport attempts
  under `maxRetries: 1`, Python 1 (the same 4-vs-3 gap F-126-8 records at the defaults).
- **Observed:** R11b/R11e `UNKNOWN` vs `HTTP`; R11a/c/d one extra attempt in TS.
- **Why it is not a #126 defect:** both behaviours are frozen by `AGENTS.md` (single normalizer, retry
  predicate) and predate the branch. **But** §13's checklist literally says _"in both packages `code`
  and `message` match"_, which is not true today for transport failures, so that line must either be
  scoped to _DGII-answered_ failures (design amendment, owner) or F-126-8 extended to cover the error
  **code** (recommended: add `F-126-13 — transport failures normalize to different codes`). Do not
  "fix" this inside #126.

### 💭 D-9 — Python's `ReconciliationResult` docstring carries less of the `false` taxonomy than TS's

`packages/python/src/py_dgii_ecf/reconciliation.py:24-30` says what `can_reuse_sequence` means but not
the C1–C6 enumeration that TS spells out (`packages/typescript/src/reconciliation.ts:17-27`). §9.2
makes the taxonomy contractual _documentation_; T8 owns the public pages, but the two docstrings should
not teach different amounts. One sentence in Python is enough.

### 💭 D-10 — §8.3's fail-first claim is wrong for T-L and T-M

See §7.2. Not a code defect; a claim in the frozen design that the T7 artifact must not repeat.

---

## 5. Contract conformance (§2, §5, §8, §9, §13)

### 5.1 The marker path is genuinely untouched

| Check (§8.2)                                                           | TypeScript                                                                                                                        | Python                                                                                            |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `delivered`/`cleared` derived from `inquiry.estado` only, raw equality | `client.ts:448` (`value.estado !== 'No encontrado'`), `:449` (`cleared = !delivered`)                                             | `client.py:524` (`cleared = value.estado == "No encontrado"`), `:525` (`delivered = not cleared`) |
| Single derivation site                                                 | ✅                                                                                                                                | ✅                                                                                                |
| Exactly one `delete` in the method, after every read                   | `client.ts:480` (reads at `434`, `453`, `466`)                                                                                    | `client.py:551` (reads at `517`, `531`, `544`)                                                    |
| `delete` only on the `cleared` branch, no I/O after it                 | `client.ts:479-481`, return at `482-487`                                                                                          | `client.py:550-552`, return at `553-561`                                                          |
| No read between the clearing decision and the delete                   | by construction: gate needs `delivered`, `cleared = !delivered` (`client.ts:452`, `client.py:530`) — §8.1's stronger clause holds | same                                                                                              |
| No `Err` row in the matrix touches the marker                          | ✅ (`marker=1` on every `Err`)                                                                                                    | ✅                                                                                                |

Both implementations satisfy §5.2 and §8.1. `cleared`/`delivered` were _reordered_ in Python
(`cleared` first, then `delivered = not cleared`) — semantically identical, matches C-1 §5 step 5 — and
TS keeps `main`'s original polarity; both derive one from the other, so the single-site rule holds.
No idempotency-key change in either package.

### 5.2 The gate runs only for `ECF ∧ delivered ∧ Rechazado`

- TS `client.ts:452`: `isGeneralEcf && delivered && value.estado.trim() === 'Rechazado'`;
  `isGeneralEcf` from `extractRootElementName` (`client.ts:432`).
- PY `client.py:530`: `root == "ECF" and delivered and value.estado.strip() == "Rechazado"`;
  `root` from `extract_root_element_name` (`client.py:515`).
- Cost profile matches §2.3 exactly: one request for non-`ECF` roots (R12a–R12d), `Aceptado` (R1) and
  `No encontrado` (R2); two for a rejection with no followable track (R3, R6, R7); three on the happy
  path (R4). Verified by the recorded request sequences, not by reading.

### 5.3 Public surface P1–P7

| Item                                                                                                                         | TypeScript                                                                                  | Python                                                               | Verdict                              |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------ |
| P1 `ReconciliationResult` unchanged (`inquiry` non-null, 4 fields, same order)                                               | `reconciliation.ts:11-30`                                                                   | `reconciliation.py:21-32`                                            | ✅                                   |
| P2 predicate re-typed to `TrackingStatusResponse \| InquiryInvoiceSummary`, `InquiryStatusResponse` rejected at compile time | `reconciliation.ts:60-61` + `@ts-expect-error` test (`test/reconciliation.test.ts:174-188`) | `reconciliation.py:35-37`                                            | ✅                                   |
| P3 phantom `secuenciaUtilizada` removed from the inquiry response (TS fallback = comment)                                    | `types.ts:54-56`                                                                            | `types.py:263-278` (field and parse removed, docstring explains why) | ✅                                   |
| P4 `TrackingStatusResponse.secuenciaUtilizada` optional/nullable in TS                                                       | `types.ts:32-37` (`?: boolean \| null`)                                                     | already `bool \| None` (`types.py:221`)                              | ✅                                   |
| P5 `SummaryTrackingStatusResponse.trackId` optional in TS                                                                    | `types.ts:69-70`                                                                            | already `str \| None`                                                | ✅                                   |
| P6 `estado` required in both, validated inside `trackStatuses`                                                               | `types.ts:71` + runtime guard `client.ts:108-111`, `669-673`                                | `types.py:247` + `_as_str` at `:254`                                 | ✅ for absence; numeric case = D-4   |
| P7 `fechaRecepcion` untouched                                                                                                | `types.ts:38` (required), `types.ts:72` (required)                                          | `str \| None`                                                        | ✅ intentionally divergent (F-126-4) |
| P8 `trackStatuses` normalises/validates in-method                                                                            | `client.ts:651-676` (object → `[object]`, `[]` allowed, absent ⇒ `Err`)                     | `client.py:562-587` (`None` pre-check before `_parse_list`)          | ✅; `_parse_list` untouched ✅       |
| P9 error codes / retry predicate / key derivation / `delivered`·`cleared` meanings                                           | unchanged                                                                                   | unchanged                                                            | ✅                                   |

### 5.4 `AGENTS.md` invariants

- **Results, not exceptions** — violated by D-2 (TS, hostile `estado`) only. Everything else on the
  reconcile path returns a `Result`; no `try/catch` swallow was added in either package.
- **Single normalizer** — preserved. TS constructs a `DgiiError` directly for the payload guard
  (`client.ts:96`) and Python does the same in `_parse_one` (`client.py:84-97`); that is the existing
  pattern for _payload-shape_ errors (identical to the pre-existing "no emitter RNC or e-NCF" error at
  `client.ts:425`), not a re-mapping of transport errors. No new error code.
- **Retry predicate unchanged** — `git diff` touches no file under `resilience.*`/`errors.*`; ✅.
- **Idempotency ordering** — see §5.1 ✅.
- **No floating-point money** — untouched; the new code compares strings only.
- **No `any` / `Any`** — `tsc --noEmit` and `mypy --strict` (with `disallow_any_explicit`) are clean;
  a grep of the diff finds no `any`/`Any` and no `cast` escape hatch. The TS code uses `unknown` +
  narrowing (`client.ts:88-111`), which is the documented pattern.
- **ESM `.js` extensions** — `import { extractElementText, extractRootElementName } from './xml.js'`
  (`client.ts:29`), `import type { … } from './types.js'` (`reconciliation.ts:4`). ✅
- **Python stays synchronous** — no `async`/`await` in the Python diff. ✅

---

## 6. Test quality — the trap this issue exists to fix

### 6.1 Do the mocks model DGII's wire shapes? Yes.

- **No `consultaestado` fixture carries `secuenciaUtilizada`.** Verified by grepping every occurrence in
  both test trees and reading each site: `packages/typescript/test/{client,types,token}.test.ts` and
  `packages/python/tests/{client,types,token}.py` use the flag only on payloads DGII actually publishes
  — `consultaresultado` (`TRACKING_PAYLOAD` / `trackingPayload`), the RFCE **reception** response
  (`receptionfc`, E4), and `consultarfce` (`getSummaryInvoiceInquiry` / `get_summary_invoice_inquiry`).
  The old offender (`reconciliation.test.ts:103` on `main`, `test_can_reuse_sequence` in Python) was
  **replaced, not kept alongside** — the docstrings at `test/reconciliation.test.ts:63-67` and
  `tests/test_reconciliation.py:1-12` say so, and the fixtures agree.
- Both suites route mocks **on the request URL** and assert the request **order and URLs**
  (`test/reconciliation.test.ts:407-431`, `:161-165`; `tests/test_reconciliation.py:300-323`), so a
  future regression that reads the flag from `consultaestado` fails on traffic, not on wording.
- Payload shapes are TEC-02-shaped (`inquiryPayload` reproduces all eleven published elements;
  `trackResult` the eight `consultaresultado` fields).

### 6.2 Can the new behavioural tests fail against `main`'s `src`? Mechanically checked.

Method: a scratch copy of each package at `/tmp/failfirst/{tsmain,pymain}` with
`git show e0b5f13:…/{client,reconciliation,types}.{ts,py}` written over `src/`, the branch's test files
left in place, then the suite run there (repo untouched).

| Suite                                    | Result against `main`'s `src` | Fails-first? |
| ---------------------------------------- | ----------------------------- | ------------ |
| TypeScript `test/reconciliation.test.ts` | 17 failed / 15 passed of 32   | mostly ✅    |
| Python `tests/test_reconciliation.py`    | 12 failed / 10 passed of 22   | mostly ✅    |

Tests that **cannot** fail against `main` (they pass there), and why:

| Test                                                                       | Why it passes on `main`                                                            | Consequence                                                                                                        |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| TS `[T-L]` stops after the inquiry for an accepted document                | `main` already issues exactly one request and answers `r=false` for `Aceptado`     | regression guard, **not** a failing-first proof — §8.3 claims otherwise                                            |
| TS `[T-M]`, PY `test_unknown_document_costs_a_single_request`              | same: one request, marker deleted, `r=false`                                       | idem                                                                                                               |
| TS `[T-N]`, PY `test_rfce_rejection_costs_a_single_request`                | `main` never gated on root, so one request                                         | idem (not claimed in §8.3)                                                                                         |
| TS `[T-K]`                                                                 | `main` never read the flag, so `canReuseSequence` was `false` for the wrong reason | it is a **B2 guard**, not evidence of the fix; §8.3 does not claim it, but T7 must not present it as failing-first |
| PY `test_empty_inquiry_body…`, `test_null_inquiry_body…` (`[T-A]`/`[T-B]`) | Python already returned `Err(VALIDATION)`                                          | acknowledged by §8.3 ("regression guards here")                                                                    |
| PY `test_inquiry_without_estado…` (`[T-C]`)                                | Python's model already raised                                                      | new coverage, not a proof                                                                                          |
| both padded-state tests in Python, TS `trackStatuses > empty array`        | behaviour already correct                                                          | guards                                                                                                             |

Fix to the **claim**, not the code: `126-tasklist.md` §8.3's sentence _"in both packages, T-I … and
T-L/T-M/T-O/T-P (today they issue one call and produce the wrong shape)"_ must drop T-L and T-M (they
issue one call and produce the _right_ shape on `main`); T-O/T-P genuinely fail on `main` because they
assert the listing _was_ called. If T7's artifact needs a failing-first list, it is:
TS `T-A, T-B, T-C, T-E…T-I, T-O, T-P` + predicate tests; PY `T-E…T-I, T-O, T-P`, `test_can_reuse_sequence`.

### 6.3 Coverage holes that let the blockers through

| #   | Missing cell                                                                                                    | Consequence today                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-1 | the predicate's totality for a **non-string** `estado` (both suites), and `secuenciaUtilizada: "false"`/`0`     | hid **D-2** (a thrown `TypeError`) and **D-3** (a wrong fiscal answer). The existing test only covers _absence_ (`test/reconciliation.test.ts:221-227`) |
| C-2 | `consultaestado` without `codigo`                                                                               | hid **D-6**                                                                                                                                             |
| C-3 | `consultatrackids` single-object body and non-array body at the `reconcile` level (TS has both, Python neither) | Python's normalisation is exercised only indirectly                                                                                                     |
| C-4 | a transport error / non-5xx on the flag chain, and `consultaresultado` unreadable-body, in Python               | Python's `Err` propagation on the result read is only covered by the 503 test                                                                           |
| C-5 | `ACECF` / `ANECF` / unknown roots                                                                               | the gate's `root == 'ECF'` is only tested through `RFCE`                                                                                                |
| C-6 | `estado` numeric on the inquiry and on a listing entry                                                          | hid **D-4** (which changes the _call sequence_)                                                                                                         |
| C-7 | padded `No encontrado` / padded `Rechazado` in **TypeScript** (Python has both)                                 | TS's raw-equality rule (§5.1) is untested there                                                                                                         |

Add all seven to both suites as table-driven cases (the §3 matrix is the table).

---

## 7. What attempt 2 must change (nothing else)

1. **Python** `types.py:226-240`: tolerate absent `codigo`/`estado` on `TrackingResultStatus`
   (**D-1**, T-K).
2. **Python** `tests/test_reconciliation.py:341-374`: assert `Ok(r=false)`, not `Err` (**D-1**).
3. **TypeScript** `reconciliation.ts:65-68`: make the predicate total with a `typeof` narrowing
   (**D-2**), plus the two new predicate tests.
4. **Python** `types.py`: a non-coercing `estado` reader for the **inquiry and listing** models
   (**D-4**), the tolerant `""` verdict on the **result** model (**D-1**), and a non-string `trackId` →
   `None` (**D-5**); OR register F-126-7/F-126-14 with owner sign-off — but not silently.
5. **Python** `types.py`: stop coercing `secuenciaUtilizada` for the two flag carriers (**D-3**).
6. **TypeScript** `client.ts`: move the `isRecord` guard into `statusTrackId` (**D-7**).
7. Register `F-126-13` for the transport-error code gap, and scope §13's "code and message match" line
   to DGII-answered failures (**D-8**) — design amendment, owner's call.
8. Correct §8.3's fail-first claim for T-L/T-M (**D-10**) and add the seven missing cells (**§6.3**).

**Must not change:** the marker path (`client.ts:448-449`, `:479-481`; `client.py:524-525`, `:550-552`),
the gate, the request order, `ReconciliationResult`, the retry predicate, the idempotency key, the
`consultatrackids` normalisation rules that already agree, or any file under `packages/*/src/signing*`
/ `schemas/`.

**Explicitly out of scope for T6:** T8's documentation obligations
(`project-docs/architecture.md` §9.3, `docs/{en,es}/guides/{resilience,flow}.md` still describe the old chain
at `docs/en/guides/resilience.md:137-147`, `docs/en/guides/flow.md:245`), the ledger/architecture
updates, and the `project-tasks/126-evidence/*.md` prettier failures (they come from untracked review notes, not
from the packages).

---

## 8. Verdict

**FAIL.** Both implementations are recognisably the same design and they keep the parts of C-1 that
protect the fiscal lock — but they answer differently on 17 of 53 mechanical cells, including the one
cell the contract names explicitly (T-K, where Python contradicts §8.3 and §13) and including a
`TypeError` escaping the TypeScript `Result` contract (§6, `AGENTS.md`). Two of the divergences make one
package report `canReuseSequence: true` where the other reports `false` (D-3, D-5) — the exact class of
defect #126 was raised to remove, in the opposite direction. Attempt 1 does not pass; §7 is the complete
list of what attempt 2 must move.

---

## 9. Appendix — reproducing the matrix

Both harnesses live outside the repo (nothing under `packages/**` was modified for this review). To
rebuild:

```ts
// probe.ts — run with `bun probe.ts` (Bun resolves the package's .js→.ts imports)
const urls: string[] = [];
const fetchImpl = ((url: string | URL | Request) => {
  urls.push(String(url));
  const prefix = Object.keys(routes).find((k) => String(url).startsWith(k));
  return Promise.resolve(prefix === undefined ? unrouted() : routes[prefix]());
}) as unknown as typeof fetch;
const store = new InMemoryIdempotencyStore();
await store.set(key, { pending: true });
const ecf = new ECF(creds, Environment.Dev, {
  token: 'tok',
  idempotencyStore: store,
  fetchImpl,
  resilience: { maxRetries: 1, retryInitialDelayMs: 1 },
});
const res = await ecf.reconcileSubmission(xml); // record outcome + urls + marker
```

```python
# probe.py — run with `uv run --frozen python probe.py` from packages/python
calls: list[str] = []
transport = httpx2.MockTransport(lambda request: routes(request, calls))
ecf = ECF(CREDENTIALS, Environment.DEV, token="tok",
          http_client=httpx2.Client(transport=transport),
          idempotency_store=store,
          resilience=ResilienceOptions(max_retries=1))
result = ecf.reconcile_submission(xml)            # record outcome + calls + marker
```

Routes: `consultaestado/api/consultas/estado`, `consultatrackids/api/trackids/consulta`,
`consultaresultado/api/consultas/estado` (match case-insensitively; answer `404` for unrouted, which
makes a _surprise_ call visible as a failure instead of a silent pass). The XML fixture is
`<ECF><Encabezado><RNCEmisor>130862346</RNCEmisor><IdDoc><eNCF>E310000000001</eNCF></IdDoc></Encabezado></ECF>`
(root and id element varied per row as in the table). Diff the two recordings on
`{outcome, delivered, cleared, canReuse, code, markerPresent, request-sequence}`.

The three rows to re-verify first after the fixes: **R10b** (`{"secuenciaUtilizada":false}` →
`Ok(r=false)` in both), **R17a/R17b** (`estado: 42` / `{}` → a value, never a thrown
`TypeError`, in both), and **R4** (`Rechazado` + `Rechazado` + `false` → `Ok(r=true)` in both).
