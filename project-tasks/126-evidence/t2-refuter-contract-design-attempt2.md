# T2 — Refuter review of `126-contract-design.md` (attempt 2 of 3)

**Verdict: PASS**, with nine residual items (R1–R9) listed in §6 — none blocking.

Attempt 2 adopted Option A. That removes the whole class of findings attempt 1 raised: no second existence
source, no clearing rule invented for an undocumented payload, no second evidence rule behind `delivered`/
`cleared`. I re-derived the decision-bearing DGII rows from my own fetch of TEC-02 (not from the design's
citations), re-read the code the design leans on, and audited the §16 manifest against the text. Everything
that decides behaviour — the existence source, the clearing rule, the gate, the payload classification, the
predicate, the failure disposition, the ordering — re-derives as written and is fiscally safe.

What remains is: one **mis-citation** (P4/§6 rule 2 cite E15 for a claim p. 24–25 does not carry), one
**undisclosed consequence of P2** (the predicate accepts an RFCE summary while §4.3 says RFCE reuse is a
different document class), one **invariant cited to the wrong file** ("ledger I2/I3", which is
`126-tasklist.md` I2/I3), one **stale arithmetic pair inside the freeze zone** (§10.4), and one **manifest
overstatement** (§16.4 #1). None of them
can make a developer send or withhold a document wrongly, and none requires reopening the decision. Details,
with exact fixes, in §6.

---

## 0. Provenance of this review (own fetch, not inherited)

```text
URL   .../Informe y Descripción Técnica/Descripcion Tecnica Servicios DGII.pdf
UA    Chrome/126 (browser UA, as the design states)
HTTP  200 · 2 451 054 bytes · 47 pages
sha   85a601ffe4af67ad2220e52d669bc673fc8affe02feb464bf04dabd4fe2f67ce   ← matches the design's §0 header
```

Pages re-read for this pass: **3, 4** (bitácora), **21** (`consultarfce`), **24, 25** (`consultaresultado`),
**29, 30, 31** (`consultaestado` states + `consultatrackids`). Code read: `packages/typescript/src/
{client,reconciliation,types,environment,errors,resilience,xml}.ts`,
`packages/python/src/py_dgii_ecf/{client,reconciliation,types,resilience,http}.py`,
`node_modules/cockatiel/dist/RetryPolicy.js`, `cockatiel/dist/errors/BrokenCircuitError.js`,
`project-tasks/126-can-reuse-sequence-ledger.md`, `project-tasks/126-tasklist.md` §3, `docs/en/guides/
{flow,resilience}.md`. Two runtime probes: a pybreaker open-circuit message probe, and the cockatiel retry
loop source.

---

## 1. Per-item status — attempt 1's D1–D9 and the six pass items

Legend: **RESOLVED** = the text now does what the item demanded, verified in the text _and_ where relevant in
the source. **RESOLVED (superseded)** = the defect cannot exist under Option A. **PARTIAL** = substance there,
one sentence still wrong.

| #   | Item                                                                                                             | Status                               | Proof (section, and what I verified)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | An absent/empty payload must never clear the lock; `null`/absent → `Err`; only a positive `No encontrado` clears | **RESOLVED**                         | §5 step 4 (payload guard before the decision), §5 step 5 (raw `==`), §5.2 table, §5.6 table (`null`/absent → `Err(VALIDATION)`, listed separately for all three reads), §7.1, §8.3 T-A/T-B/T-C/T-E, Q5 rewritten. Structural point holds: under Option A the listing is not an existence source (§4.1, §5.2), so no payload shape from `consultatrackids` can reach `idempotency.delete`. §5.6's deviation from my literal wording (`[]` stays `Ok(false)`, not `Err`) is argued with a reason and is safe in this design (see R5). |
| D2  | The no-guard decision must not rest on a premise E8 contradicts                                                  | **RESOLVED**                         | E8 row now quotes p. 4 item 2 verbatim as a **documented statement of non-availability** — re-derived: "…conforme a que en el mismo aún no se encuentran disponibles para el público". §4.2's three reasons are parity, "changes nothing that is not already an `Err`", and "no new rule for every root". The re-publication evidence it adds is real: 02-10-2020 item 4 → 03-04-2025 item 1 ("ya que se encuentra disponible") and 02-01-2026 item 2 — both verified on pp. 3–4. §12 Q3 is "answered in part".                     |
| D3  | Do not attribute "absence may be an answer" to E12                                                               | **RESOLVED**                         | `rg 'either way'` → only the §0 diff row that records the deletion. E12 is now cited for shape only, and says so. (Same defect class recurs once, under a different row — R1.)                                                                                                                                                                                                                                                                                                                                                      |
| D4  | Split "meanings unchanged" from "evidence changed"; document the delegation asymmetry                            | **RESOLVED (superseded)**            | Under Option A the evidence does not change, so the split is moot; the design says exactly that (§5.2 side-by-side table, §16.1 D4 "reduced in scope"). The one genuinely new failure mode survives and is documented: E11 (emitter-only delegation) vs E14 (emitter _or_ receiver) in §5.5, §7.2, Q4, F-126-11.                                                                                                                                                                                                                    |
| D5  | The cheaper hybrid was missing, and it is the alternative that avoids D1                                         | **RESOLVED**                         | Alternative **A = ADOPTED** (§11), the root-element switch recorded as **B = SUPERSEDED**, cost profile published in §2.3 and §10.1. §11 A states its own costs (one more call than the switch on the rejected path).                                                                                                                                                                                                                                                                                                               |
| D6  | Replace "the answer that cannot hurt"; make the multi-track discriminator contractual                            | **RESOLVED, with one overstatement** | §5.4 now says it "hurts by withholding an answer" and names the three mitigations; §9.2's C1–C6 table is the contractual taxonomy. §5.4's "is a distinguishable state" overstates: `delivered ∧ Rechazado ∧ false` is distinguishable from `true`, not from C5. See R6.                                                                                                                                                                                                                                                             |
| D7  | Align `SummaryTrackingStatusResponse` nullability                                                                | **RESOLVED**                         | P5 (`trackId?: string`, Python already `str                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | None`— verified`types.py:244-249`), P6 (`estado` required **and** validated), P7 + F-126-4 (`fechaRecepcion`explicitly out of scope), §13 parity line.`estado` staying required is the better call than attempt 1's S6 and is now justified. |
| D8  | E10 is overstated as "the whole basis"                                                                           | **RESOLVED**                         | E10 row now separates the verbatim sentence (several tracks exist and mean a repeat submission) from the invented aggregation rule, and §5.4/Q1 label the inference.                                                                                                                                                                                                                                                                                                                                                                |
| D9  | Two wrong `codSeguridad` cost claims; the real argument missing                                                  | **RESOLVED**                         | §4.3 now gives (1) E4's flag lives on the success path, structurally unavailable to a pending marker, (2) E5's undefined semantics on `consultarfce`, (3) E4's different reuse target — and explicitly retracts the "derivation must be built" claim ("`getCodeSixDigitfromSignature` … already exist"). Alternative L restated; Q2 carries the reuse-target limit. Verified p. 21 defines five outputs and not the flag.                                                                                                           |
| P1  | Clear **only** on a positive `No encontrado`                                                                     | **RESOLVED**                         | §5 step 5 + §5.1 + §13. Today's code is already raw equality (`client.ts:395`, `client.py:512`) — the design preserves it rather than "improving" it, which is right.                                                                                                                                                                                                                                                                                                                                                               |
| P2  | Existence test is raw equality; trimming only inside the `Rechazado` gate                                        | **RESOLVED**                         | §5.1 first bullet, §6 rule 4, §13. The one legal consequence (`' No encontrado'` keeps the marker, same as today) is stated in §5.1.                                                                                                                                                                                                                                                                                                                                                                                                |
| P3  | Total predicate + a missing-`estado` test per suite                                                              | **RESOLVED**                         | §6 shows both bodies with `''`/`""`, rule 3 states it; T-K asserts it. Verified the guard is necessary: TS's `TrackingStatusResponse.estado` is a closed enum and the response is an unchecked cast.                                                                                                                                                                                                                                                                                                                                |
| P4  | Option A (keep `inquiryStatus` for existence, chain after the decision)                                          | **RESOLVED**                         | §2.2, §5 steps 3–8, §5.2, §8.1. Verified against `126-tasklist.md` Decision 4 ("`inquiryStatus` still runs first and still decides `delivered`/`cleared` and the marker delete") — satisfied, not amended.                                                                                                                                                                                                                                                                                                                          |
| P5  | Measured per-package budget + caller-lease obligation                                                            | **RESOLVED, one stale pair**         | §10.2/§10.3 verified against the libraries (see §5). §10.4's first pair is wrong — R4.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| P6  | `false` taxonomy visible so C-2/C-3 cannot collapse                                                              | **PARTIAL (honest)**                 | §9.2 + P11 + F-126-6 exist and are labelled; the field itself is deferred. §16.4 #6 records the split honestly. The observability of C4 ("one `consultatrackids` call in the caller's trace") is weak, but it is stated rather than claimed solved.                                                                                                                                                                                                                                                                                 |

**New evidence rows I re-derived because the gate now rests on them:** E19 (p. 29) is exact —
"No encontrado (0): implica que no se encontró el comprobante en los registros, **pudiendo deberse a que aún
no haya sido reportado**", plus the note that `Aceptado condicional` is visible "exclusivamente para Facturas
de Consumo Electrónicas con un monto inferior a los RD$250,000.00". That row is what makes `Rechazado` a
documented _state of the existence read_ (so no second service is needed to decide whether to ask), and the
same sentence is what §5.2 refuses to widen. Correct row to build on.

---

## 2. Manifest audit (§16.x against the text)

Method: for every `APPLIED`, I opened the cited section and checked the claim is executable as written; for
every `ADOPTED AS FOLLOW-UP`, I checked the §15 entry exists.

| Manifest row     | Claim                                                                      | Text check                                                                                                                                                              | Verdict                                                  |
| ---------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 16.1 D1          | "`Err(VALIDATION)` applied at the layer that owns parsing (§5.6, P8)"      | §5.6 table + P8 + `_parse_list` pre-check note all present                                                                                                              | accurate                                                 |
| 16.1 D2          | "alternative E restated (§11)"                                             | §11 E present, argued from §4.2                                                                                                                                         | accurate                                                 |
| 16.1 D4          | "APPLIED, and reduced in scope"                                            | §5.2 table + §5.5 + §7.3 present; the self-limitation is honest                                                                                                         | accurate                                                 |
| 16.1 D6          | "§9.2 makes the discriminator contractual"                                 | §9.2 C1–C6 present; F-126-6 specifies the field                                                                                                                         | accurate (see R6 for the word "distinguishable" in §5.4) |
| 16.1 D7          | "P5, P6, P7 + F-126-4"                                                     | all four present                                                                                                                                                        | accurate                                                 |
| 16.1 D9          | "§4.3 replaces them with E4/E5"                                            | §4.3 items 1–3 present, retraction explicit                                                                                                                             | accurate                                                 |
| 16.2 B1          | "§8.3 (T-A, T-B, T-C, T-E, T-F, T-G, T-A/T-B observed failing first)"      | all six tests present in §8.3                                                                                                                                           | accurate                                                 |
| 16.2 B3          | "no re-freeze is needed … ledger I2/I3 … stand unamended"                  | the invariants exist **twice**: as `I1/I2/I3` in `126-tasklist.md:550-552` (content exactly as claimed) and as unlabelled bullets in `126-can-reuse-sequence-ledger.md` | **wrong file in the citation** — R3                      |
| 16.3 S1          | "`CIRCUIT_OPEN`/`TIMEOUT` are not emitted; breaker-open is `UNKNOWN` (TS)" | verified: cockatiel `BrokenCircuitError` has no retryable keyword in name or message, and `DgiiError` defaults `code: 'UNKNOWN'`, `retryable: false`                    | accurate                                                 |
| 16.3 S4          | "§10.2 measured (4 vs 3)"                                                  | verified from library source — §5 below                                                                                                                                 | accurate                                                 |
| 16.4 #1          | "`null`/absent/**empty** → `Err(VALIDATION)`" claimed **APPLIED**          | §5.6 deliberately keeps an explicitly returned `[]` as `Ok(false)` and T-F asserts it                                                                                   | **overstated** — R8                                      |
| 16.4 #6          | "APPLIED as a decision, ADOPTED AS FOLLOW-UP as a field"                   | §9 P11 + §9.2 + F-126-6 present; the split is stated                                                                                                                    | accurate                                                 |
| 16.5 F3d         | "MOOT by construction"                                                     | §5.2 + §8.1 support it                                                                                                                                                  | accurate                                                 |
| 16.6 freeze zone | §10.2–§10.4 frozen                                                         | §10.4's first pair contradicts §10.3                                                                                                                                    | **freeze-zone defect** — R4                              |

**No manifest row claims APPLIED for text that does not exist.** The two failures are of the other kind: one
overstates a status by one word (empty), one names the wrong file for a set of invariants. Both are one-line
fixes.

Cross-artefact citation check: tasklist Decision 2/3/4/7, R9/R10/R11, A2/A5, C-1/C-2/C-3 all exist and say
what the design says they say. `124-source-register.md` has `### 6. track` and the TEC-02 row the design
cites. The one authority the design names that is **misattributed** is `I1/I2/I3` (it is in the tasklist, not
the ledger) — content verified correct in both files.

---

## 3. Option-A re-attack (only what changed)

### 3.1 The gate `root == 'ECF' ∧ delivered ∧ estado.trim() == 'Rechazado'` — honest scoping or residual half-fix?

**Honest scoping.** Every under-reach is disclosed, and the disclosure is in the right places:

- **Rejected RFCE still answers `false`** — stated in the §4 matrix ("Published (E6) — **not wired in #126**"),
  in §4.3 as a _residual, accepted knowingly_, in §14 ("does not claim the flag is reachable for RFCE
  documents"), in Q2, and carried as F-126-9. Three independent reasons are given, and I re-derived all
  three: E4's flag is on the reception response (success path only), E5 defines no semantics for
  `consultarfce`'s copy (p. 21: five outputs, no `secuenciaUtilizada`), and E4 scopes reuse to _another
  Resumen de Factura de Consumo_. That is not a cost claim dressed as a scope claim.
- **ACECF / ANECF / unknown roots** — §2.3 lists "unknown", Q9 flags the ACECF/ANECF latent hazard (a
  `No encontrado` clears those markers, unchanged), F-126-10 carries the fix.
- **`CerteCF`** — §4.2 + Q3: unreachable because the chain sits behind an existence read DGII documents as
  unavailable there.

One gap, and it is a documentation gap rather than a scoping one: a rejected RFCE _in production_ is not
actually unreachable to the caller — `getSummaryInvoiceInquiry` is allowed there and now returns
`InquiryInvoiceSummary`, which is **in P2's union**, so `canReuseSequence(summary)` compiles and answers. The
design neither points at that route nor warns that its `true` licenses reuse on another RFCE, not on another
e-CF (§4.3 item 3 says exactly that it would need its own scoping decision). See R2.

### 3.2 `null`/absent payload = `Err(VALIDATION)`, marker kept — no surviving "emptiness = no record"

Verified by exhaustive grep of the design for `no record`, `nothing`, `either way`, `no entries`, `empty`,
`conservative`, `-> []`. Results:

- The only sentences pairing emptiness with "no record" are the ones that **forbid** it (§5.6 for `null`/
  absent, §5.6 notes for `[]`, §7.1, Q5) or the cost table's "DGII has no record" row, where the source is
  `consultaestado` (§2.3, §10.1) — correct.
- The attempt-1 step-5 `null → []` mapping and its `(E12: the service may say "nothing" either way)` citation
  are **gone**. `rg 'either way'` hits only the §0 diff table that records the deletion.
- `consultatrackids` is explicitly stripped of destructive power in three places (§5.2, §5.6 first note,
  §8.1's `cleared ⇒ !delivered ⇒ !gate`). That is a stronger guarantee than attempt 1's guard: the branch that
  clears has no flag call scheduled in it, so no payload shape can reach the delete.
- Residual asymmetry: `null`/absent → `Err` but explicit `[]` → `Ok(false)`. Justified in §5.6 (an empty body
  is not an answer; an empty array is), but the same sentence's "converting it to an `Err` would wedge a
  reconciler" argument applies to the `null` case too, which the design does not address. R5, low.

### 3.3 Public surface P1–P7

- **P1 (no new field, `inquiry` non-null):** correct under Option A, and it is a real withdrawal of attempt 1's
  churn. `ReconciliationResult` in `reconciliation.ts:8-21` / `types.py` is unchanged as declared.
- **P3 (remove `InquiryStatusResponse.secuenciaUtilizada`): justified.** E1 verified (eleven elements, no flag,
  pp. 26–28) and the field's current comment in `types.ts:50-51` ("`true` when the e-NCF sequence is already
  consumed") is a lie about a field DGII never sends. Removing it is the documentation fix _and_ the type fix.
  The "owner declines" fallback is coherent: P2 alone makes `canReuseSequence(inquiry)` a type error in both
  packages (verified: `InquiryStatusResponse` is assignable to neither member of the union — it lacks
  `trackId`/`rnc`/`encf`/`fechaRecepcion`, and its `secuenciaUtilizada` is optional), so the bug cannot return
  through the predicate even if the field survives, and the fallback requires the comment to say so.
- **P2 (re-type to `TrackingStatusResponse | InquiryInvoiceSummary`): closes the original bug at the type
  level, in both languages** — TS by structural incompatibility, Python by nominal annotation. But it is a
  **TS narrowing**, not a widening: today's structural `{ secuenciaUtilizada?: boolean | null }` accepts
  `InvoiceSummaryResponse` (the RFCE reception response: `estado: string`, `secuenciaUtilizada: boolean`,
  verified in `types.ts`), and after P2 it does not. Meanwhile it _keeps_ `InquiryInvoiceSummary` — the
  `consultarfce` RFCE summary. So the exported predicate answers RFCE reuse questions while §4.3 says that
  answer has a different reuse target. Nothing in §6's docblock or P2's reasoning mentions the target
  limitation. R2.
- **P4 (`TrackingStatusResponse.secuenciaUtilizada` → `boolean | null` optional): the decision is right, the
  citation is not.** P4 and §6 rule 2 both say E15 supports it ("omits fiscal fields on a `No encontrado`
  answer"). I re-read pp. 24–25: the XML sample carries every field, and _DESCRIPCIÓN PARÁMETROS DE SALIDA_
  says nothing about conditional presence. What DGII _does_ say (p. 24) is that the flag is defined "en el
  escenario de que el resultado de la validación haya sido 'Rechazado'" — i.e. E2, not E15. The decision
  survives on two verified grounds: Python already models `bool | None` (`types.py:221`), and §6 rule 2's
  independent premise ("the response is an unchecked cast, so absence must be tolerated regardless of what the
  parameter type claims") is true of both packages. So: R1 — re-point the citation, do not change the
  decision. Note this is the same defect class as D3, committed once more in a new place; that it is
  re-committed is worth one line in the diff note, not a FAIL.
- **P5 (`trackId?: string`):** a deliberate relaxation for a state DGII's sample does not show — and the
  design says so (§3.2 lists "whether a listing entry can arrive without a `trackId`" as unsettled, and
  Python is already `str | None`). It is not a claim about DGII's payload; it is the type matching the guard
  step 7b needs. Sound.
- **P6 (`estado` required in both, validated at runtime in TS):** the right choice (parity by
  construction, and it is the field that decides classification). One internal inconsistency: P6 says the TS
  guard produces "the identical `Err(VALIDATION)` and message" as Python, while §5.6's parity note and F-126-7
  record that a **numeric** `estado` is coerced by Python's `_as_str` and rejected by TS. True for
  missing/non-scalar, false for numeric. R7.
- **P7 (`fechaRecepcion` out of scope):** coherent — read nowhere on the reconcile path, and F-126-4 records
  the divergence.

### 3.4 Cost and error-code claims

| Claim                                                                                 | Verification                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TS **4** attempts per logical call                                                    | **Correct, and the design is right to correct attempt 1.** `cockatiel` 3.2.1 `RetryPolicy.execute` loops `for (let retries = 0;; retries++)` and retries `while (retries < maxAttempts)`, so `maxAttempts: 3` = 3 retries after the first invocation = **4**. (`resilience.ts`'s own JSDoc, "Maximum number of attempts (including the first)", is what misled attempt 1.) |
| PY **3** attempts                                                                     | **Correct.** `stop_after_attempt(3)` = 3 total.                                                                                                                                                                                                                                                                                                                            |
| ≈61 s / ≈182 s TS, ≈45 s / ≈135 s PY                                                  | **Arithmetic holds** (4×15 + 0.7 s backoff; 12×15; 3×15; 9×15).                                                                                                                                                                                                                                                                                                            |
| Breaker: retry outside, 5 consecutive, 30 s half-open, bulkhead 20/40, no PY bulkhead | **Correct** (`wrap(retry, breaker, timeout, bulkhead)`; `ConsecutiveBreaker(5)`; `halfOpenAfter: 30_000`; Python has retry + breaker only).                                                                                                                                                                                                                                |
| "A breaker-open is `UNKNOWN` (TS) and is **not** retried"                             | **Correct.** `BrokenCircuitError` message is "Execution prevented because the circuit breaker is open"; `isRetryableError` matches none of its keywords → one attempt, wrapped by `toDgiiError` as `UNKNOWN`, `retryable: false`. `CIRCUIT_OPEN`/`TIMEOUT` are indeed never emitted.                                                                                       |
| "Python **retries** an open breaker three times"                                      | **Correct, measured.** pybreaker's message is `'Timeout not elapsed yet, circuit breaker still open'` and `is_retryable_error` returns `True` on the message heuristic → 3 immediate probes. E21 and F-126-1 are accurate.                                                                                                                                                 |
| §10.5 "≤4 events (TS) / ≤3 (PY) … same bound as today"                                | Holds: a failed existence read returns immediately, and a success resets the consecutive counter before the flag call.                                                                                                                                                                                                                                                     |
| **§10.4 "~2 minutes TS / ~90 s Python"**                                              | **Wrong, and stale from attempt 1.** §10.3's own figures are 61 s/45 s for the non-rejected path and 182 s/135 s for the rejected one. 90 s is attempt 1's 2-call/3-attempt figure. R4. No new error code is claimed anywhere — §2.4, §7.1, §7.4 and P9 are consistent.                                                                                                    |

---

## 4. Would a developer implementing this text produce a fiscal-safe result DGII's documents justify?

**Yes.** The only destructive action — deleting the pending marker — is decided by one field of one service
that DGII documents as carrying a positive negative state (`No encontrado`, p. 29), by raw equality, before
any new call, with the delete as the last fallible statement and no read scheduled in that branch; `true` for
reuse requires two independent DGII statements that agree (`secuenciaUtilizada: false` **and**
`estado: 'Rechazado'`, p. 24); and every other input — absent payload, absent flag, several tracks, a
non-`ECF`/RFCE root, delegation failure, transport failure — either yields a `false` that can only _withhold_
the capability or an `Err` that leaves the lock intact. Nothing in the design can double-issue an e-NCF, and
nothing asserts a reuse DGII did not state.

---

## 5. What attempt 2 got right that attempt 1 did not (do not lose these in edit)

- Option A adopted with its costs stated, and the root-element switch kept as a recorded alternative.
- The predicate's `Rechazado` gate retained as _defence in depth_ on top of the process gate (§6 rule 1).
- The payload guard placed **before** the clearing decision (§5 step 4) rather than inside the second read —
  this is what makes T-A/T-B failing-first tests possible.
- `Err` explicitly not collapsed into `false` (§7.2), with the `error.resource` discriminator named and the
  widened `Err` meaning documented for T8 (§7.3).
- Retracting three of attempt 1's own claims (E8 "silence", "`codSeguridad` derivation needed", "3 attempts")
  and one of its own behaviours (`inquiry` nullable, `track` field).
- Q5 rewritten so the permissive-by-omission framing is gone, and Q10 stating plainly that `No encontrado` may
  mean "not yet reported" and that #126 must not widen it.

---

## 6. Residual defects, in priority order, with exact fixes

**R1 — Medium (evidence): P4 and §6 rule 2 cite E15 for an omission E15 does not contain.**
_Text:_ P4 "TS's non-optional claim is untrue on a `No encontrado` answer (E15)"; §6 rule 2 "`consultaresultado`
omits fiscal fields on a `No encontrado` answer (E15)". _Source:_ pp. 24–25 show every field in the sample and
say nothing about conditional presence; what DGII does say (p. 24) is that the flag is defined only "en el
escenario de que … 'Rechazado'" — that is E2. _Fix:_ replace both citations with E2's scoping sentence, and add
the verified parity ground (Python `types.py:221` is already `bool | None`). One sentence each; no decision
changes.

**R2 — Medium (undisclosed public consequence): P2 accepts an RFCE summary the design says is a different
reuse class.**
`canReuseSequence` / `can_reuse_sequence` now accepts `InquiryInvoiceSummary`, whose `true` (§4.3 item 3)
licenses reuse only on another _Resumen de Factura de Consumo_ (p. 18), not on another e-CF — while the
function's contract says "the e-NCF sequence may be reused" and `reconciliation.ts`'s docblock lists the eight
rejection reasons without the target. Conversely, TS loses `InvoiceSummaryResponse` (the RFCE reception
response), which compiles today against the structural type. _Fix (one paragraph):_ (a) add to §6's code
block's docblock and P2: "an RFCE summary's `true` licenses reuse on another **Resumen de Factura de
Consumo** (E4, p. 18), never on another general e-CF", (b) say explicitly that P2 narrows TS (losing
`InvoiceSummaryResponse`) and widens Python, and that this is intentional parity, (c) put the same sentence in
§9.3's T8 list.

**R3 — Low (citation hygiene): "ledger I2/I3" points at the wrong file.**
The design leans on it in §2.1, §4.1, §5.2, §9 P9, §11 A, §16.1 D4, §16.2 B3 and §16.6 as the authority that
the existence rule is frozen. The identifiers exist — `126-tasklist.md:550-552` defines `I1` (retry predicate),
`I2` ("marker deleted on failure, cleared only on `No encontrado`") and `I3` ("`delivered`/`cleared` semantics
unchanged"), with exactly the content claimed — but they are the **tasklist's**, not
`126-can-reuse-sequence-ledger.md`'s, which carries the same rules as unlabelled bullets. So "no ledger
amendment required" is true on the substance and unresolvable on the label. _Fix:_ write
"`126-tasklist.md` I2/I3" (and, once, note that the ledger restates them unlabelled). No substance changes.

**R4 — Low (arithmetic, inside the freeze zone): §10.4's first pair contradicts §10.3.**
"up to ~2 minutes in TypeScript (~90 s in Python)" matches neither 61 s/45 s (non-rejected) nor 182 s/135 s
(rejected); 90 s is attempt 1's 2-call figure. _Fix:_ restate as "up to ~61 s (TS) / ~45 s (PY) on a
non-rejected document and ~182 s / ~135 s on a rejected one, before authentication refreshes" — the
lease conclusion is unaffected.

**R5 — Low: `null` → `Err` vs `[]` → `Ok(false)`, with an argument that cuts both ways.**
§5.6 justifies the `[]` choice partly because "converting it to an `Err` would wedge a reconciler on a real
DGII behaviour whose semantics are undocumented" — the same objection applies to a 200 with an empty body
(E20 shows both packages can receive exactly that), which the design sends to `Err`. _Fix:_ either state why
the wedge risk is acceptable for `null` (a non-answer is not an answer; the caller gets a visible failure and
the document is rejected, so nothing is lost fiscally) or drop the wedge sentence. Keep `null → Err` — D1
requires it.

**R6 — Low: §5.4's "distinguishable state" overstates what a caller can see.**
`delivered ∧ inquiry.estado == 'Rechazado' ∧ false` does not distinguish C4 (several tracks) from C5 (flag
absent/`true`), which §9.2 itself concedes ("the only information this release withholds"). _Fix:_ say
"distinguishable from a positive answer", not "distinguishable", and point at F-126-6 for C4 vs C5.

**R7 — Low: P6 vs F-126-7 ("identical `Err`").** P6 claims the TS guard produces Python's identical
`Err(VALIDATION)`; F-126-7 records that a numeric `estado` is coerced by Python and rejected by TS. _Fix:_ scope
P6 to "missing or non-scalar `estado`", and cross-reference F-126-7.

**R8 — Low (manifest): §16.4 #1 claims APPLIED for "`null`/absent/**empty** → `Err`", which the design
deliberately does not do for an explicit `[]` (§5.6, T-F).** _Fix:_ mark it "APPLIED for `null`/absent;
`[]` deliberately `Ok(false)` — see §5.6, safe because the listing cannot clear (§5.2)". Also re-check §16.2
B1's identical phrasing.

**R9 — Cosmetic (three, all one-line).**
(a) §8.2 step 5 is an ungrammatical merge: "the new calls are inserted **above** the `delivered` / `cleared`
computation is wrong — they belong **below** it…" — rewrite as two clauses. It sits in the reviewer's proof
procedure, so a broken sentence there costs more than usual.
(b) §7.2 enumerates `error.resource` as "(`ConsultaTrackIds/api/TrackIds/Consulta` vs `consultatrackids/…` vs
`consultaresultado/api/Consultas/Estado`)" — the middle item is not a value in `environment.ts:28-30`; list
the three real values (`Endpoint.AllTrackingEcf`, `Endpoint.InquiryStatus`, `Endpoint.TrackResultStatus`).
(c) §9.3 item 5 and P10 re-point the wrong `_Consulta de trackId_` citation only in `flow.md`; the identical
wrong citation sits in `resilience.md:144` (and both Spanish mirrors) — name all four files, since CI diffs the
locale trees.

---

## 7. Rulings on the three questions the brief singled out

1. **Under-reach of the gate:** honest scoping, disclosed in five places, with three re-derived DGII reasons.
   The one thing missing is not disclosure but a warning: the RFCE flag _is_ reachable by a caller through
   `getSummaryInvoiceInquiry` + P2's union, and its `true` has a different reuse target (R2).
2. **`null`/absent as `Err` everywhere:** verified, with no surviving sentence treating emptiness as "no
   record". One asymmetry against an explicit `[]` (R5), one manifest overstatement about it (R8).
3. **Public surface:** P1, P3 (with a coherent fallback), P5, P7 sound; P2 closes the bug at the type level but
   carries an unstated reuse-target caveat and a TS narrowing (R2); P4's decision is right and its citation is
   wrong (R1); P6 is right with one scoped exception (R7). Cost claims and emitted-code claims are all correct,
   including the attempt-1 corrections, except §10.4's stale pair (R4).

**One sentence:** a developer implementing this text would produce a fiscal-safe result that DGII's documents
justify — the destructive decision is untouched and now provably isolated, and `true` requires two agreeing
DGII statements — provided R1 and R2's one paragraph land in T4/T8, because both are about what the SDK tells
a caller, not about what it sends.

## Outcome

Outcome: done — **PASS** for attempt 2 of 3 (nine residual items: 1 substantively medium-low citation set, 1 undisclosed P2 caveat, rest cosmetic/manifest; no decision rests on an unverified premise, nothing can double-issue).
Details: D1–D9 and the 6 pass items all RESOLVED; §16 manifest audit found one overstated status (E1: "empty → Err") and one invariant set cited to the wrong file (I2/I3 live in `126-tasklist.md:550-552`, content verified correct); gate under-reach is honestly disclosed but P2 accepts an RFCE summary whose `true` has a different reuse target (R2) and §10.4 carries attempt-1's stale ~90 s figure (R4). TEC-02 re-fetched independently (sha 85a601f…, matches), E19 and all attempt-1 corrections re-derived; cockatiel `maxAttempts: 3` → 4 attempts and pybreaker's retryable "Timeout…" message both measured and confirmed.
`/home/deuriib/projects/dgii-ecf/project-tasks/126-evidence/t2-refuter-contract-design-attempt2.md` — PASS verdict, per-item status table, §16 manifest audit, Option-A re-attack, residual defects R1–R9 with exact fixes.
