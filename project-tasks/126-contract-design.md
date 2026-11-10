# #126 — Contract design: where the sequence-reuse flag actually comes from

**Status:** decision record, **attempt 2 of 3** — revised after two FAIL verdicts (T2 refuter, T3 reliability).
**Adopted decision:** the orchestrator's ruling — **Option A** (see §2 and §11): existence keeps coming from
`inquiryStatus` (`consultaestado`) exactly as shipped; the flag chain is pursued **after** that decision and
**only** on a rejection.
**Publisher of record:** DGII's _Descripción Técnica Servicios DGII_ (TEC-02 in
`project-tasks/124-source-register.md`). **Supersedes:** the implicit contract in `packages/*/src/*` (which
reads the flag from a service that does not publish it) **and** the attempt-1 text of this document (which
moved the existence source and cleared a fiscal lock on a non-answer).
**Scope discipline:** this document settles the contract. It changes no source file, no test, no
`project-docs/**`, no `docs/**`, and no ledger. Implementation is T4 (TypeScript) / T5 (Python) against this
text; the contract doc change is T8.

**Provenance of the DGII reading below.** PDF:
`https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Descripcion%20Tecnica%20Servicios%20DGII.pdf`
— re-fetched for this revision with a browser User-Agent (HTTP 200, 47 pages, 2 451 054 bytes, sha256
`85a601ffe4af67ad2220e52d669bc673fc8affe02feb464bf04dabd4fe2f67ce` — the same snapshot TEC-02 records and the
same one T2 reviewed), text extracted with `pypdf`. Every page citation below was re-read in full for this
revision; printed page numbers match the extraction index. Contract claims are cited to
`project-tasks/124-source-register.md` (register §6 `track`, §7 `reconcile`) per the run's R11; SDK claims are
cited to code read on `fix/126-can-reuse-sequence` @ `e0b5f13`.

---

## 0. Revision note — what changed and why

Both validators converged on one defect and one missing alternative; the ruling picked the alternative. This
table is the diff against attempt 1, for a reader who only has the two review notes.

| Attempt 1 said                                                                                 | This revision says                                                                                                                                               | Driver                                     |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Classify by root element and **switch the existence source** to `consultatrackids` for `<ECF>` | **Do not move existence.** `delivered`/`cleared` stay on `consultaestado`, unchanged; the track chain is an **additional, gated** read for the flag only         | Ruling; §2, §5.2                           |
| `null`/absent `consultatrackids` payload → `[]` → "no record" → **marker deleted**             | A non-answer may **never** clear a lock; only a positively stated `No encontrado` clears. Absent/null payload → `Err(VALIDATION)` at the parsing boundary        | D1, B1; §5.6, §8.2                         |
| Existence test "trimmed `No encontrado`" (presented as today's rule; it is not)                | Existence test is **raw equality**; trimming survives only inside the `Rechazado` gate                                                                           | B1(trimming); §5.1, §6                     |
| Predicate `response.estado.trim()` — throws on a legal payload                                 | **Total predicate**: `(response.estado ?? '').trim()` / `(response.estado or "")`                                                                                | B2; §6                                     |
| "DGII's silence about a certification URL is not a statement that the service is absent"       | DGII **documented** non-availability in certification (bitácora 28-12-2020, item 2) and has not re-published those URLs; no guard, argued on **parity + safety** | D2; §4.2, §4.3                             |
| The cheaper hybrid was absent from §11                                                         | It is alternative **A = ADOPTED**, with why it beats the root-element switch                                                                                     | D5; §11                                    |
| `ReconciliationResult` gains `track`, `inquiry` becomes nullable                               | **No new result field**; `ReconciliationResult` shape unchanged; the `false` taxonomy is contractual documentation                                               | D6, D8, F7, run Decision 2/scope guard; §9 |
| 2 requests × 3 attempts × 15 s ≈ 90 s                                                          | Measured per package: TS **4** attempts per call, PY **3** → 3-call worst case ≈ **182 s** (TS) / ≈ **135 s** (PY), before auth refreshes                        | F6a, S4; §10                               |
| §7 listed `CIRCUIT_OPEN`/`TIMEOUT` among propagated codes                                      | Neither package emits them; a breaker-open arrives as `UNKNOWN` (TS) and Python retries it three times                                                           | S1, S3; §7.4, §10.5                        |
| RFCE not wired because "`codSeguridad` derivation is needed"                                   | That derivation is already a public helper in both packages; the real reasons are E4's success-path-only flag and E5's undefined semantics                       | D9; §4.3                                   |
| E8 read as "silence"; E4 as "same meaning"; E10 as "the whole basis"                           | Corrected wording, same substance                                                                                                                                | E4/E8/E10; §3.1                            |

**Kept from attempt 1 because it passed:** the evidence table (E1–E18) with the three wording corrections, the
per-document-type × per-environment reachability matrix, the delete-last ordering discipline with its
falsifiable proof procedure, the rejected-alternatives record, the predicate's `Rechazado` gate, and the
refusal to source existence from the verdict (H) or from flag presence (I).

---

## 1. Context in one paragraph

`reconcileSubmission` / `reconcile_submission` derives `canReuseSequence` from
`inquiryStatus` → `consultaestado/api/Consultas/Estado`, whose published response (`RespuestaConsultaEstado`)
has **no** `secuenciaUtilizada` element in any environment. The predicate is `flag === false`, so the
capability can only ever answer `false`. The flag is published on `consultaresultado` (per track), on
`consultarfce` (per RFCE), and on the RFCE reception response — **never** on `consultaestado`. #126 therefore
has to reach a _second_ service to answer a question that only matters for one outcome — a rejection — while
leaving untouched the one field that deletes a fiscal lock.

---

## 2. Decision

### 2.1 The three facts that decide it

1. **Existence is already answered correctly and safely.** `delivered = consultaestado.estado !== 'No encontrado'`
   is DGII-documented (E19: `No encontrado (0)` / `Aceptado (1)` / `Rechazado (2)`, p. 29), it is the rule the
   run froze (`126-tasklist.md` I2/I3 — the ledger `126-can-reuse-sequence-ledger.md` restates them unlabelled;
   plus `126-tasklist.md` Decision 4, R9/A5), and it is the rule the shipped guide promises users ("The marker
   is cleared only when DGII reports `No encontrado`").
2. **The flag is only meaningful on a rejection.** DGII scopes it explicitly: `secuenciaUtilizada` "permite dar
   a conocer si el número de secuencia … puede reutilizarse … **en el escenario de que el resultado de la
   validación haya sido "Rechazado"**" (E2, p. 24). Outside a rejection the question has no consumer: an
   accepted document's number is consumed by definition, and a document DGII does not hold needs no reuse
   decision at all.
3. **The track chain is the only documented route to the flag.** `consultaresultado` takes one required input,
   `TrackId*` (E7), and the trackId for an e-NCF is discovered through `consultatrackids` (E10/E12).

### 2.2 The decision (normative)

**`reconcileSubmission` keeps `inquiryStatus` (`consultaestado`) as the sole source of `delivered` and
`cleared`, exactly as today, and pursues the reuse flag only afterwards, only for a general `<ECF>`, and only
when `consultaestado` has positively reported a rejection.**

Concretely:

- `delivered` / `cleared` / the marker-delete path are **unchanged** — same service, same fields, same rule,
  same moment, same single derivation site (§5.2).
- The flag chain (`consultatrackids` → `consultaresultado`) runs **after** `cleared` has been decided, and
  only when the gate in §5.3 holds: root element is `ECF`, `delivered === true`, and
  `consultaestado.estado` is `Rechazado`.
- `canReuseSequence` is `true` only when exactly one followable track is listed, `consultaresultado` for it
  reports `estado === 'Rechazado'`, and it reports `secuenciaUtilizada === false` (§6).
- Every non-answering input — no track, several tracks, an entry without a `trackId`, a non-`Rechazado`
  verdict, an absent flag, a non-`ECF` root — answers `canReuseSequence: false` and **never** touches the
  marker (§9.2). A flag chain that could not be completed is **not** in that list: it returns `Err` (§2.4, §7).
- No network call happens after the marker is deleted; the deletion is the last fallible statement of the
  method (§8).

### 2.3 Consequences, stated plainly

| Path                                                    | Logical DGII calls                                                                                                    | Versus today |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------ |
| Non-`ECF` root (RFCE, ACECF, ANECF, unknown)            | **1** (`consultaestado`)                                                                                              | 0            |
| `<ECF>`, DGII has no record                             | **1** (`consultaestado`)                                                                                              | 0            |
| `<ECF>`, DGII has the document, verdict not `Rechazado` | **1** (`consultaestado`)                                                                                              | 0            |
| `<ECF>`, DGII has the document and it was **rejected**  | **2 or 3** (`consultaestado` + `consultatrackids`, plus `consultaresultado` when exactly one followable track exists) | **+1 or +2** |

So: **non-rejected documents and documents DGII does not know cost the same single call as today; only a
rejected document pays the extra chain.** That is the honest cost profile, and it is smaller in the common
cases than attempt 1's (which spent 2 calls on every `<ECF>`, including accepted ones). The maximum cost is
higher than attempt 1's in the one case being fixed (3 calls vs 2), and §10 budgets it in wall-clock terms.

Two further consequences that belong to the contract, not to the implementation:

- **Reconcile is not usable in `CerteCF`, today or after this change**, because DGII documents `consultaestado`
  as not available to the public in certification (§4.2). The added calls are unreachable there by
  construction: they sit behind a successful existence read.
- **A rejected document never clears its marker**, so a byte-identical re-send keeps returning `IDEMPOTENCY`
  until the store's TTL. `canReuseSequence: true` with `cleared: false` means _do not re-send this document;
  re-sign the same e-NCF as a new document_. T8 must say this (§9.3).
- **A rejected document whose flag read fails returns `Err`, not `false`** — visible, with the marker intact.
  That is a new (and narrower) error surface; §7 states it, §7.3 gives T8 the sentence that documents it.

### 2.4 The failure disposition (run Decision 7 — one rule, both packages)

> **Every failed read fails the call. No partial `Ok` is ever returned, and no failure ever touches the
> marker.**

- The error is propagated **unchanged** (whatever code `toDgiiError` / `to_dgii_error` produced for that
  request — `HTTP`, `AUTH`, `VALIDATION`, `UNKNOWN`, …, see §7.4 for which codes are actually emitted). No new
  error code, no wrapper, no re-mapping — the single-normalizer invariant from `AGENTS.md` is preserved.
- A payload the SDK cannot read is `Err(VALIDATION)` in **both** packages, with Python's existing literal
  message (`Unexpected DGII response payload`) reused verbatim in TypeScript so the two errors read
  identically for the non-dict / absent-body case; for a dict body missing `estado`, Python's field-level shape
  error text differs (§5.6 parity note, F-126-7).
- Under Option A this is also the safest posture, because the flag branch is **disjoint** from the clearing
  branch: `cleared ⇒ !delivered ⇒ !gate`, so a failed flag read can never delete a kept marker, resurrect a
  deleted one, or reorder the chain (§8.1).
- The alternative — degrade to `Ok(canReuseSequence: false)` when the flag read fails — was live in this
  revision and is rejected in §7.2: it is indistinguishable at the call site from DGII answering "not
  reusable", which is the silent dead capability that produced #126, while `error.resource` already gives the
  caller a precise discriminator that a `false` would erase — TypeScript only today; in Python `resource` is
  always `None` (F-126-12).

---

## 3. Evidence

### 3.1 Claim-by-claim

| #   | Claim                                                                                                                                                                                                                                   | DGII document + section                                                                                                                                                                                                                                                                                                                                         | How verified                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | `consultaestado`'s response carries **no** `secuenciaUtilizada`. Its published elements are `codigo, estado, rncEmisor, ncfElectronico, montoTotal, totalITBIS, fechaEmision, fechaFirma, rncComprador, codigoSeguridad, idExtranjero`. | TEC-02, _Consulta de estado e-CF_, pp. 26–29 — JSON pp. 27–28, XML `<RespuestaConsultaEstado>` p. 28, _DESCRIPCIÓN PARÁMETROS DE SALIDA_ p. 28                                                                                                                                                                                                                  | Re-read end to end for this revision; the eleven names above are the complete sample and the complete parameter list.                                                                                                                                                                                                                                                                                                                                                                                    |
| E2  | `consultaresultado` publishes the flag per track, with defined semantics scoped to a rejection.                                                                                                                                         | TEC-02, _Consulta de resultado e-CF_: service + three URLs p. 22, JSON p. 23 (`"secuenciaUtilizada": true`), XML p. 24 (`<secuenciaUtilizada>true</secuenciaUtilizada>`), _DESCRIPCIÓN PARÁMETROS DE SALIDA_ pp. 24–25 (the eight rejection reasons; `True = No puede reutilizarse la secuencia.` / `False = Puede reutilizarse la secuencia.`)                 | pp. 22–25 re-read. The scoping sentence is quoted verbatim in §2.1 fact 2.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| E3  | The flag exists on that service _in order to_ answer the reuse question.                                                                                                                                                                | TEC-02, bitácora _Actualizaciones al 18-04-2022_, item 1, p. 4: "Se incluyeron dos parámetros a la respuesta del servicio de Consulta Resultado para retroalimentar cuando el número del comprobante fiscal electrónico (eNCF) puede ser reutilizado."                                                                                                          | Bitácora page re-read.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| E4  | The **RFCE reception response** publishes the same flag, with the same triggers and the same rejection list — **but a different reuse target**.                                                                                         | TEC-02, _Recepción de resumen factura de consumo electrónica (RFCE)_, p. 15 (service), p. 17 (JSON), p. 18 (XML + meaning + the eight reasons, word-for-word the pp. 24 list), p. 19 (`True`/`False` values)                                                                                                                                                    | Re-read pp. 15–19. **Wording corrected (was "same meaning"):** the RFCE paragraph scopes reuse to _"otro **Resumen de Factura de Consumo**"_, where p. 24 scopes it to _"otro **Comprobante Fiscal Electrónico (e-CF)**"_. Same flag, same triggers, **different reuse target** — an RFCE rejection therefore does not license reusing the number on a general e-CF, and §4.3/Q2 carry that limit.                                                                                                       |
| E5  | `consultarfce` publishes the flag, keyed by RNC + e-NCF + security code; its own parameter list does **not** define the field.                                                                                                          | TEC-02, _Consulta de Resumen de Factura de Consumo Electrónica (RFCE)_, pp. 19–21 — three URLs p. 20, `/api/Consultas/Consulta`, inputs `RncEmisor* ENCF* CodigoSeguridad*` p. 20, JSON p. 21 (`"secuenciaUtilizada": true`), _DESCRIPCIÓN PARÁMETROS DE SALIDA_ p. 21 documents only `Código, Estado, RncEmisor, NcfElectronico, codigoSeguridad`              | Re-read pp. 19–21. The field is published; its semantics are defined only for `consultaresultado` (and, per E4, for the RFCE reception).                                                                                                                                                                                                                                                                                                                                                                 |
| E6  | `consultarfce` is available in **all three** environments (recent change).                                                                                                                                                              | TEC-02, p. 20 URL block (TesteCF, CerteCF, eCF) + bitácora _Actualizaciones al 02-01-2026_, item 2, p. 3: "Se agrega la disponibilidad del servicio ConsultaRFCE en el ambiente de certificación y precertificación."                                                                                                                                           | Both re-read.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| E7  | `consultaresultado` is available in **all three** environments, takes one required input `TrackId*`, and is scoped to documents sent **through the general e-CF reception**.                                                            | TEC-02, p. 22 (URL block for TesteCF/CerteCF/eCF, plus "el e-CF tentativo enviado **exclusivamente mediante el servicio web de recepción de e-CF**"), p. 23 (`TrackId*`)                                                                                                                                                                                        | Re-read pp. 22–23. The scope sentence is what makes root-element gating of the flag chain (§5.3) a DGII-derived rule rather than a convenience.                                                                                                                                                                                                                                                                                                                                                          |
| E8  | `consultatrackids` is published for **TesteCF and eCF only**, and DGII **stated** that the certification URL is unavailable.                                                                                                            | TEC-02, _Consulta de trackId e-CF_, URL block p. 30 (two entries) + bitácora _Actualizaciones al 28-12-2020_, item 2, p. 4: "Se quitaron las URL del servicio de anulación rangos, consulta estado, consulta trackids y consulta directorio para el ambiente de certificación **conforme a que en el mismo aún no se encuentran disponibles para el público**." | Re-read. **Wording corrected (was "silence"):** this is a **documented statement of non-availability**, not a documentation gap. No later revision re-publishes those URLs (the only later re-adds are `ConsultaRFCE`, 02-01-2026 item 2, and `ConsultaTimbreFC`, item 3; and the FC reception URL was removed 02-10-2020 item 4 for the same reason and re-added 03-04-2025 item 1 "ya que se encuentra disponible"). §4.2 now argues the no-guard decision from that fact instead of contradicting it. |
| E9  | `consultaestado` is published for **TesteCF and eCF only**, with the same documented history as E8.                                                                                                                                     | TEC-02, _Consulta de estado e-CF_, URL block p. 26 (two entries) + the same bitácora sentence                                                                                                                                                                                                                                                                   | Re-read.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| E10 | Several trackIds for one e-NCF means the **same e-NCF was submitted more than once** — not several documents.                                                                                                                           | TEC-02, _Consulta de trackId e-CF_, p. 29: "Se pueden obtener múltiples TrackIds cuando se remiten varios e-CF con el mismo número de comprobante fiscal (e-NCF) asociados al mismo RNC."                                                                                                                                                                       | Verbatim, re-read. **Wording corrected (was "the whole basis for the aggregation rule"):** this sentence supports _the existence of several tracks and their origin_. The rule "_exactly one_ → ask; _more than one_ → do not ask" is an **inference** on top of it, labelled as such in §5.4 and Q1 — DGII says nothing about aggregating per-track flags.                                                                                                                                              |
| E11 | `consultatrackids` requires the token to be **delegated for the emitter**, and refuses with a documented validation error otherwise.                                                                                                    | TEC-02, p. 29 ("se requiere que el usuario autenticado se encuentre delegado para el emisor, de lo contrario, no podrá obtener los datos") and p. 30 VALIDACIONES ("El RNC del token no está autorizado a consultar el trackid de este e-NCF, favor verificar que se encuentre delegado por el emisor y volver a intentarlo.")                                  | Both re-read. Note the shape: a delegation failure is a **documented error**, not an empty listing — which is one more reason a non-answer must never be read as "no record" (§5.6).                                                                                                                                                                                                                                                                                                                     |
| E12 | `consultatrackids` returns a **listing** whose item shape is `{trackId, estado, fechaRecepcion}`; `No encontrado` is one of its states; the published JSON sample is a **single object** while the prose says _listado_.                | TEC-02, p. 29 ("retornar un listado de respuestas (Trackids)"), p. 30 (JSON object), p. 31 (XML root `<TrackingDetalle>`, _ESTADOS SALIDA_: `No encontrado`, `Aceptado`, `Rechazado`, `Aceptado Condicional`, `En proceso`)                                                                                                                                     | Re-read pp. 29–31. The ambiguity is **shape** (object vs array) — it says **nothing** about an empty list or a `null` payload, and this design never cites it for that (D3).                                                                                                                                                                                                                                                                                                                             |
| E13 | `consultaestado` can also see documents submitted through the RFCE reception (below RD$250,000).                                                                                                                                        | TEC-02, _Consulta de estado e-CF_, p. 26: "A través de este servicio también pueden ser consultados los e-CF remitidos por el servicio de recepción de resumen factura de consumo inferiores a los RD$250,000.00."                                                                                                                                              | Verbatim, re-read.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| E14 | `consultaestado` requires delegation for the emitter **or** the receiver.                                                                                                                                                               | TEC-02, p. 26: "se requiere que el usuario autenticado se encuentre delegado para el emisor o para el receptor"                                                                                                                                                                                                                                                 | Verbatim, re-read. Weaker than E11 — see §5.5.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| E15 | `consultaresultado` result codes: 0 No encontrado, 1 Aceptado, 2 Rechazado, 3 En Proceso, 4 Aceptado Condicional; and `No encontrado (0)` is about **the trackId**, not the e-NCF.                                                      | TEC-02, p. 25 (_ESTADOS SALIDA_): "No encontrado (0): implica que no se encontró **el trackid** en los registros"                                                                                                                                                                                                                                               | Re-read. Stronger support for §5.2 than attempt 1 used: the verdict's absence is about a track, so it can never un-deliver an e-NCF.                                                                                                                                                                                                                                                                                                                                                                     |
| E16 | SDK: `getSummaryInvoiceInquiry` (`consultarfce`) is gated to production.                                                                                                                                                                | **Not a DGII claim.** `project-specs/dgii-ecf-setup.md` A.9 and the guard in `getSummaryInvoiceInquiry` / `get_summary_invoice_inquiry`. DGII contradicts it as of the 02-01-2026 bitácora (E6).                                                                                                                                                                | Read both guards + A.9. Recorded as an SDK decision, not a DGII rule; see Q2.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| E17 | SDK: the pending marker is written before transmit and cleared only when DGII reports no record; query methods are not idempotency-keyed.                                                                                               | `AGENTS.md` invariants; `project-docs/architecture.md` §9.3; `submitIdempotent` / `_submit_idempotent`                                                                                                                                                                                                                                                          | Read both implementations. Confirmed for this revision: `client.ts` `submitIdempotent` sets `PENDING` before `send()` and deletes on failure; `reconcileSubmission` is not single-flighted.                                                                                                                                                                                                                                                                                                              |
| E18 | SDK resilience: retry predicate = network/transport + 408/429/5xx; breaker threshold 5 consecutive; per-attempt timeout 15 s; retry **outside** the breaker; **attempts per logical call differ by package**.                           | `packages/typescript/src/resilience.ts` (`defaultResilienceOptions`: `maxRetries: 3`, `breakerThreshold: 5`, `timeoutMs: 15_000`), `errors.ts` (`RETRYABLE_STATUSES`); `packages/python/src/py_dgii_ecf/resilience.py` (`ResilienceOptions`, `stop_after_attempt(3)`)                                                                                           | **Measured for this revision** with probes against the installed libraries: cockatiel `maxAttempts: 3` → **4** total attempts per logical call; tenacity `stop_after_attempt(3)` → **3**. Attempt 1's "3 attempts" was true for Python only. §10 restates the budget per package.                                                                                                                                                                                                                        |
| E19 | `consultaestado`'s own states include `No encontrado (0)`, `Aceptado (1)`, `Rechazado (2)`, plus `Aceptado condicional` for consumption invoices below RD$250,000 — and DGII itself softens `No encontrado`.                            | TEC-02, _Consulta de estado e-CF_, p. 29 (_ESTADOS SALIDA_): "**No encontrado (0)**: implica que no se encontró el comprobante en los registros, **pudiendo deberse a que aún no haya sido reportado**."                                                                                                                                                        | Re-read. This is the row the **gate** (§5.3) rests on: `Rechazado` is a documented state of the _existence_ read, so the design does not need a second service to decide _whether_ to ask for the flag. The same sentence is why §5.2 refuses to widen absence-based clearing.                                                                                                                                                                                                                           |
| E20 | SDK: a `200` with an empty body reaches the query layer as "no value", and the two packages treat that differently today.                                                                                                               | `packages/typescript/src/http.ts` `readBody` (returns `undefined` for an empty non-JSON body) + `parseResponse` (`ok(data as T)`); `packages/python/src/py_dgii_ecf/http.py` `_parse` (returns `Ok(None)`); `packages/python/src/py_dgii_ecf/client.py` `_parse_list` (`data is None → Ok([])`)                                                                 | Read both. This is the input that made attempt 1's step 5 clear a fiscal lock, and the reason §5.6 classifies payloads instead of defaulting them.                                                                                                                                                                                                                                                                                                                                                       |
| E21 | SDK: a breaker-open failure is not `CIRCUIT_OPEN` in either package, and Python **retries** it.                                                                                                                                         | `packages/typescript/src/errors.ts` `toDgiiError` → `code: 'UNKNOWN'`, `retryable: false` for a cockatiel `BrokenCircuitError`; `project-docs/architecture.md`: "`TIMEOUT` and `CIRCUIT_OPEN` … the SDK does not currently emit them"; `resilience.py` `is_retryable_error` matches on message text, and pybreaker's open-circuit message contains "Timeout"    | **Measured for this revision**: `pybreaker.CircuitBreakerError` → `is_retryable_error(...) is True`, so an open breaker costs three immediate probes in Python. §7.4 and §10.5 stop claiming otherwise; the fix is a named follow-up (F-126-1), out of scope here.                                                                                                                                                                                                                                       |

### 3.2 What DGII's text does **not** settle

Do not fill these in from intuition; each is answered in §5.4, §5.6 or §12.

- Whether the flag is defined for `consultarfce` at all (E5).
- How per-track flags aggregate when E10 has produced several tracks (Q1 — inference, not DGII).
- Whether `consultaestado` / `consultatrackids` are _actually_ unavailable in `CerteCF` today (E8/E9 record a
  2020 statement; no later publication).
- Whether DGII returns `[]`, `null`, or a `No encontrado` entry when it holds no record (E12 documents the
  shape ambiguity only) — and, for `consultatrackids` specifically, whether the listing is **complete** and
  **fresh** for every e-NCF DGII holds.
- Whether a listing entry can arrive without a `trackId` (the published sample always has one).

---

## 4. Source of truth per document type and per environment

Reconciliation is only ever called on a document whose pending marker exists, so the document kinds are the
ones the idempotency flow covers: general e-CF, RFCE, ACECF, ANECF.

| Document (root element) | Existence (`delivered`/`cleared`) — **unchanged in every cell** | Service that publishes the flag                                                                                                                            | TesteCF                                                                   | CerteCF                                                                                                                                                                                                                                   | eCF                                                                 |
| ----------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| General e-CF (`<ECF>`)  | `consultaestado` (E1, E19)                                      | `consultaresultado`, reached via `consultatrackids` (E2, E7, E8, E10)                                                                                      | **Reachable.** Existence URL published (E9); flag URLs published (E7, E8) | **Documented unavailable.** DGII withdrew the certification URL of `consultaestado` _and_ `consultatrackids` and stated they were not available to the public (E8/E9). Reconcile fails at its first read; the flag chain is never reached | **Reachable** (E7, E8)                                              |
| RFCE (`<RFCE>`)         | `consultaestado` (E13)                                          | `consultarfce` (E5) or the RFCE reception response (E4)                                                                                                    | Published (E6) — **not wired in #126** (§4.3)                             | Published (E6) — **not wired**                                                                                                                                                                                                            | Published (E6); the SDK guard (E16) would permit it — **not wired** |
| ACECF (`<ACECF>`)       | `consultaestado`                                                | **none** — DGII publishes no sequence-reuse concept for a commercial approval                                                                              | —                                                                         | —                                                                                                                                                                                                                                         | —                                                                   |
| ANECF (`<ANECF>`)       | `consultaestado`                                                | **none** — the governing rule is the opposite one: only sequences never sent and never delivered may be voided (`Formato Anulación de e-NCF v1.0`, TEC-08) | —                                                                         | —                                                                                                                                                                                                                                         | —                                                                   |

`canReuseSequence` the SDK can return: `true`/`false` on the general e-CF path under the §5.3 gate; always
`false` for every other root element, in every environment.

### 4.1 Why existence is not re-sourced

Three reasons, in order of weight:

1. **The run froze it and the issue froze it.** `126-tasklist.md` I2/I3 (lines 550–552),
   `126-tasklist.md` Decision 4 ("`inquiryStatus` still runs first and still decides `delivered`/`cleared` and
   the marker delete"), R9 and A5 all say the same thing. Attempt 1's root-element switch silently superseded
   them; this revision does not need to (§5.2).
2. **`consultatrackids` is documented as _a_ service that lists tracks; it is not documented as the
   _complete_ answer to "does DGII hold this e-NCF".** DGII states the listing exists for e-NCFs "que haya sido
   recibido por DGII" (p. 29) and that a `No encontrado` **entry** means "no se encontró el e-CF en los
   registros" (p. 31) — but nothing in TEC-02 promises coverage across reception paths or freshness. Using it
   as the existence source is defensible; _needing_ it there is not, because the flag only matters on a
   rejection.
3. **A second existence rule is a second way to delete a fiscal lock.** Attempt 1 had to invent a clearing
   rule for a payload DGII does not document (an empty or absent listing), and the space of wrong answers in
   that rule is exactly the double-issue path (D1/B1). Keeping one existence rule from one service keeps the
   destructive decision on the source that has always carried it and that DGII documents with a positive
   negative state (E19).

### 4.2 No environment guard is added — argued from documented unavailability, not silence

E8/E9 show that DGII **withdrew** both certification URLs in the 28-12-2020 bitácora and stated, in the same
sentence, that those services were "aún no … disponibles para el público" in that environment, and that no
later revision re-published them. The SDK therefore has no documented existence check in `CerteCF` — **for any
root element, before or after #126**. We add no guard, for three reasons that do not depend on pretending the
gap is silence:

1. **A guard would freeze a 2020 statement as a permanent product rule.** DGII re-publishes availability when it
   changes (bitácora 02-10-2020 item 4 → 03-04-2025 item 1 for the FC reception URL; 02-01-2026 item 2 for
   `ConsultaRFCE`). A hardcoded refusal would have to be re-litigated on DGII's schedule, and would be wrong in
   the meantime in whichever direction DGII moved.
2. **It changes nothing that is not already an `Err`.** An unavailable service yields an HTTP failure →
   `Err` → marker intact. A guard only replaces DGII's own answer with an SDK guess about it.
3. **It would diverge from shipped behaviour for every root element**, i.e. it would be a new capability
   decision smuggled into a defect fix — and the flag chain is not even reachable there (it sits behind a
   successful `consultaestado`).

**Consequence for T8 (state it plainly):** reconciliation is not usable in `CerteCF` today or after #126, and
that is DGII's stated position, not an SDK defect. If DGII re-publishes the URLs, the SDK starts working with
no code change — which is the point.

### 4.3 RFCE is a deliberate dead end, for two real reasons

`canReuseSequence` stays `false` for `<RFCE>` in every environment. The reasons are E4 and E5, not cost:

1. **The RFCE flag only exists on the success path.** DGII publishes `secuenciaUtilizada` in the **RFCE
   reception response** (E4, pp. 17–18) — and the SDK stores that response on success. But a _pending_ marker
   exists precisely because no response was stored. The stored-response route is therefore structurally
   unavailable to `reconcileSubmission`, which is the only caller that needs it.
2. **`consultarfce`'s flag has no DGII-defined semantics** (E5: p. 21 defines five outputs and does not define
   `secuenciaUtilizada`), and a mis-derived `codSeguridad` returns `No encontrado` (p. 21) — which, if it were
   ever used for existence, would clear a lock. (Attempt 1 claimed a `codSeguridad` derivation would have to be
   built; that was wrong — `getCodeSixDigitfromSignature` / `get_code_six_digit_from_signature` already exist and
   are used by the ECF32→RFCE conversion. The derivation is a one-line call; the _semantics_ are the blocker.)
3. **E4's reuse target is a different document class.** Reuse after an RFCE rejection licenses another
   _Resumen de Factura de Consumo_, not another general e-CF. Wiring it would need its own scoping decision, not
   a copied sentence from p. 24.

Residual, accepted knowingly and recorded: in `eCF`, an RFCE rejection still answers `false` with no path to
the flag. That is Q2 + follow-up F-126-2 in §15.

---

## 5. The fixed reconcile path — ordered operation list

Identical in both packages; **the order is part of the contract, not an implementation detail.**

Notation: `[READ n]` is a logical network call (subject to the package's own attempt budget), `[PURE]` has no
I/O, `[WRITE]` mutates the idempotency store.

```
 1. [PURE]  rnc  = extractElementText(signedXml, 'RNCEmisor') ?? extractElementText(signedXml, 'RncEmisor')
            encf = extractElementText(signedXml, 'eNCF')      ?? extractElementText(signedXml, 'SecuenciaeNCFDesde')
            if rnc or encf is missing -> return Err(VALIDATION)        // unchanged; no I/O, marker untouched
 2. [PURE]  root = root element local name     (existing helper: extractRootElementName / extract_root_element_name)
 3. [READ 1] inquiry = inquiryStatus(rnc, encf)                              // consultaestado — UNCHANGED from today
            on Err -> return Err (propagated unchanged; marker untouched)
 4. [PURE]  payload guard (§5.6): the answer must be a JSON object whose `estado` is a string
            otherwise -> return Err(VALIDATION, 'Unexpected DGII response payload')   // marker untouched
 5. [PURE]  cleared   = inquiry.estado == 'No encontrado'        // RAW equality — no trimming, no case folding
            delivered = !cleared                                  // today's rule, today's string, today's service
 6. [PURE]  gate = (root == 'ECF') AND delivered AND (inquiry.estado.trim() == 'Rechazado')      // §5.3
 7. [READ 2, 3] only when gate is true:
     7a. tracks = trackStatuses(rnc, encf)                                  // consultatrackids
           on Err from the call, or a payload the method cannot classify
             -> return Err (propagated unchanged; marker untouched)          // §5.6, §7.1
     7b. usable     = entries whose estado != 'No encontrado'      // RAW equality; an entry without a
                                                                   // string estado is unclassifiable -> Err
         followable = usable entries whose trackId is a non-empty string
     7c. if usable.length == 1 AND followable.length == 1:
             result = statusTrackId(followable[0].trackId)                   // consultaresultado
             on Err -> return Err (propagated unchanged; marker untouched)
             canReuseSequence = canReuseSequence(result)                     // §6 predicate
         else: canReuseSequence = false                                      // 0 or >1 usable, or no trackId
 8. [PURE]  if gate was false: canReuseSequence = false                      // §9.2 taxonomy, not an error
 9. [PURE]  key = buildIdempotencyKey(signedXml) / _build_idempotency_key(signedXml)   // same derivation the send used
10. [WRITE] if cleared: idempotency.delete(key)                              // LAST fallible statement
11. [PURE]  return Ok({ inquiry, delivered, canReuseSequence, cleared })      // no I/O after step 10, ever
```

### 5.1 Two rules that are not implementation details

- **Step 5 is raw equality.** `estado == 'No encontrado'` / `estado == "No encontrado"`, untrimmed — exactly
  what `client.ts` / `client.py` do today. Trimming is a _permissive_ change in the destructive direction (a
  padded ` No encontrado` would start clearing the marker), so it stays out of the existence test entirely.
  Trimming survives in exactly one place: the `Rechazado` gate (§6 rule 4), where the only consequence of
  tolerance is _one more read_ that must still agree before `true` can be returned.
- **Step 10 executes at most once, and only on the `cleared` branch.** Since `cleared` and `gate` are mutually
  exclusive (`cleared ⇒ !delivered ⇒ !gate`), **no read can occur between the clearing decision and the
  delete**, let alone after it. §8 turns that into a falsifiable check.

### 5.2 What this changes outside the flag: nothing about existence

| Aspect                            | Before                                      | After                                                                              |
| --------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------- |
| Service for `delivered`/`cleared` | `consultaestado`                            | **`consultaestado`**                                                               |
| Rule                              | `estado !== 'No encontrado'` (raw)          | **identical**                                                                      |
| When it is computed               | before any other call                       | **identical**                                                                      |
| Marker delete                     | last fallible statement, only when cleared  | **identical line, identical position**                                             |
| Field meanings                    | "DGII answered; does it hold the document?" | **identical**                                                                      |
| New call(s)                       | —                                           | `consultatrackids` → `consultaresultado`, gated, **after** the decision, flag-only |

That is the whole point of the ruling: the _evidentiary rule_ for the two fields that can delete a lock does
not change, so `126-tasklist.md` I2/I3, Decision 4, R9/A5, and the shipped sentence in
`docs/*/guides/resilience.md` ("The marker is cleared **only** when DGII reports `No encontrado`") are
**satisfied, not amended**. No ledger amendment is required (B3 is closed by construction, not by waiver).

Two honest caveats, both pre-existing and both stated so nobody "improves" them:

- **`No encontrado` is not a freshness guarantee.** DGII itself says the state may be "porque aún no haya sido
  reportado" (E19). Reconcile minutes after a lost response can therefore clear a marker for a document DGII
  is about to index. That is exactly the risk that made attempt 1's extra absence-based clearing rule
  unacceptable (D1) — it is unchanged here, and #126 must not widen it. Callers should reconcile after a delay;
  T8 states it once (Q10).
- **A contradiction inside DGII's data never un-delivers a document.** If the listing says `No encontrado`
  while `consultaestado` reported a rejection, `delivered` stays `true`, the marker stays, and only the flag
  flag is simply not asserted (`false`, §9.2). Existence and verdict are separate domains (§5.4, Q6).

### 5.3 The gate: why `Rechazado` and nothing else

`root == 'ECF'` — because `consultaresultado` is documented for "el e-CF tentativo enviado **exclusivamente
mediante el servicio web de recepción de e-CF**" (E7, p. 22). The track chain answers questions about general
e-CF submissions; for an RFCE it would be answering about a different document class (§4.3).

`delivered` — if DGII has no record, there is no track to ask about and no document whose sequence could be
re-used; the question is meaningless and the answer is `false` by definition.

`estado.trim() == 'Rechazado'` — because DGII scopes the flag itself to that outcome (E2, p. 24: "… **en el
escenario de que el resultado de la validación haya sido "Rechazado"**"), and because `Rechazado` is a
documented state of `consultaestado` (E19, p. 29: `Rechazado (2)`). This removes the only way an over-claim
could occur — a service echoing a default `false` while the document is `En Proceso` — while leaving every
documented reuse scenario reachable, because every documented reuse scenario _is_ a rejection.

### 5.4 When several tracks exist: the honest cost of declining

E10 says several trackIds mean the _same_ e-NCF reached DGII more than once. DGII says nothing about whether
those per-track flags agree (Q1), and a disagreement (`Rechazado/false` on one, `Aceptado` on another) cannot be
resolved from the published text. Two rules were available: ask every track and require unanimity, or decline
to claim.

**Declining wins** because (a) unanimity over an unbounded list turns one reconcile into N round trips on a
path whose whole job is recovering from an unknown state, and (b) an `Aceptado` track and a `Rechazado/false`
track are mutually exclusive _facts about the same e-NCF_, so an SDK reporting "reusable" in that state would
be advising the integrator to put a consumed number on a second document.

**The cost of that choice, stated without euphemism:** answering `false` here is the answer that cannot
_over-claim_, at the price of leaving the capability unavailable in the case E10 says is the signature of a
repeated submission — the case the integrator who reported #126 is most likely to be in. It is not "the answer
that cannot hurt" (attempt 1's phrasing); it hurts by withholding an answer. What makes it acceptable:

- the caller can run the aggregation itself, with the public `trackStatuses` / `statusTrackId` methods;
- `delivered: true` + `inquiry.estado == 'Rechazado'` + `canReuseSequence: false` is distinguishable from a
  positive answer, documented as "the SDK did not obtain a positive reusable answer" (§9.2); it does not
  distinguish C4 from C5 — that gap is F-126-6;
- the follow-up that would remove the withholding (a `reason` discriminator) is specified in §9.2/F-126-6, so
  the decision is reversible without re-opening this contract.

The single-entry-without-a-`trackId` case collapses into the same answer for the same reason: no trackId means
no `consultaresultado` call, and `false` is the only safe answer.

### 5.5 What genuinely changes for a caller

Two things, both new _surface_, not new _semantics_:

1. **A rejection can now answer `true`.** That is the defect being fixed (A1).
2. **A rejected document now costs two extra calls, and can now fail with `Err` where it used to succeed.**
   `consultatrackids` requires the token to be delegated **for the emitter** (E11), whereas `consultaestado`
   accepts the emitter **or** the receiver (E14). A receiver-delegated integrator therefore gets `Err` on any
   _rejected_ document whose flag it cannot read — a visible failure with the marker intact, never a silent
   `false`. This is a documented failure mode for T8 ("the flag additionally needs `consultatrackids`, with
   emitter delegation"), the recovery is one direct `inquiryStatus` call (existence is unaffected), and
   F-126-11 records the option that would remove the regression if such a caller materialises (Q4).

### 5.6 Payload classification (this is where attempt 1 cleared a fiscal lock)

**Rule: a payload the SDK cannot read is never evidence.** Classification is total and identical in both
packages.

| Input                                        | Existence read (`consultaestado`)                     | Listing read (`consultatrackids`)                           | Result read (`consultaresultado`) |
| -------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- | --------------------------------- |
| JSON object, `estado` is a string            | accepted; step 5 applies                              | —                                                           | accepted                          |
| JSON object, `estado` missing / not a string | `Err(VALIDATION, 'Unexpected DGII response payload')` | `Err(VALIDATION, …)` (entry unclassifiable)                 | —                                 |
| `null` / absent body / unparseable body      | `Err(VALIDATION, …)` — **never** "no record"          | `Err(VALIDATION, …)` at the `trackStatuses` boundary        | `Err(VALIDATION, …)`              |
| single JSON object                           | —                                                     | `[object]` (E12 shape ambiguity)                            | —                                 |
| JSON array (possibly empty)                  | —                                                     | accepted as the entry set; `[]` ⇒ no usable track ⇒ `false` | —                                 |
| anything else                                | `Err(VALIDATION, …)`                                  | `Err(VALIDATION, …)`                                        | `Err(VALIDATION, …)`              |

Every `Err` in this table propagates out of reconcile unchanged (§7.1) and **none of them can touch the
marker**: the two reads that can appear above the delete are only reachable from the `delivered ∧ Rechazado`
branch, and that branch never clears (§8.1).

Notes that must survive implementation:

- **`consultatrackids` has no power over the marker.** It cannot clear, and an entry set that says
  `No encontrado` cannot un-deliver a document that `consultaestado` reported (§5.2). So an empty array is not
  read as "DGII holds nothing" — it is read as "no track to ask", because that is the only question this read
  is allowed to answer.
- **`null`/absent is `Err(VALIDATION)`, not `[]`.** E12 documents a _shape_ ambiguity (object vs listing); it
  documents nothing about an absent payload (D3), and the published failure mode for a refused query is a
  documented validation **error** (E11), not an empty listing.
- **`[]` (an explicitly returned empty array) stays a parseable answer** — it yields no track, so the flag is
  not asserted (`false`), and it is never read as "DGII holds nothing" (§5.2). Converting it to an `Err` would
  wedge a reconciler on a real DGII behaviour whose semantics are undocumented, without protecting anything:
  the marker cannot be touched from this branch. That objection does not reach `null`/absent, where `Err` is
  required (D1): a non-answer is not an answer, and the caller gets a visible failure with the marker intact.
- **Do not touch the shared list normaliser.** In Python, `track_statuses` must pre-check the raw payload for
  `None` **before** `_parse_list` (which maps `None → Ok([])` for legacy reasons); `_parse_list` itself is
  shared by `get_directory_listing`, `get_service_status` and friends and must keep its behaviour. In
  TypeScript, `trackStatuses` gains the normalisation it never had (`Array.isArray` / object → one-element
  array / absent → `Err`), mirroring the existing `getCustomerDirectory` precedent.
- **Parity edge (record, do not "fix"):** Python's `_as_str` coerces numbers to strings, so a numeric `estado`
  is accepted there and rejected by the TypeScript guard. The payload is not one DGII produces (E19 documents a
  string state); recorded as F-126-7 rather than silently diverging. The identical-message requirement (§2.4,
  §13) is scoped the same way: it covers the non-dict and absent-body inputs, where both packages emit
  `Unexpected DGII response payload`; for a dict body whose `estado` is missing, Python raises its field-level
  shape error (`field 'estado' must be a string, got NoneType`), so the two packages report the same code but
  not the same text.
- **A string-but-unrecognised `estado` reads as a delivery (recorded, not fixed).** An `estado` such as `""`
  passes step 4's type guard and yields `delivered: true`. That is the safe direction — the lock is kept and
  the caller is told not to re-send — but it reports "DGII holds it" for a non-answer and can wedge a document
  until manual intervention. It is **pre-existing** (today's `!== 'No encontrado'` does the same) and unchanged
  by this design: recorded as Q11 in §12, and it must not be "fixed" into a clearing rule in #126.

---

## 6. The predicate

`canReuseSequence` / `can_reuse_sequence` stays a pure function over a response that actually carries the flag,
and it is **total**: it cannot throw, for any input the models admit.

```ts
/**
 * `true` requires DGII to have said, for this track, `secuenciaUtilizada: false` **and**
 * `estado: Rechazado`. Reuse target: `TrackingStatusResponse` → another general e-CF;
 * `InquiryInvoiceSummary` (an RFCE summary) → another _Resumen de Factura de Consumo_
 * (E4, p. 18), never another general e-CF.
 */
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
        and (response.estado if isinstance(response.estado, str) else "").strip()
        == "Rechazado"
    )
```

Rules, in the order they matter:

1. **`true` requires explicit DGII evidence.** DGII must have said `secuenciaUtilizada: false` _and_
   `estado: Rechazado` for this e-NCF's track. The `Rechazado` gate inside the predicate is DGII's own scoping
   (E2, p. 24), and it is defence in depth on top of the §5.3 gate.
2. **An absent flag stays "not reusable".** `undefined` / `null` / `None` is not `false`, so the predicate
   answers `false`. The wire is untrusted — DGII scopes the flag itself to a rejected outcome (E2, p. 24), so
   an answer that is not a rejection need not carry it, and the TS response is an unchecked cast — so absence
   must be tolerated regardless of what the parameter type claims. Python already models this (`bool | None`,
   `types.py:221`).
3. **`estado` is read defensively** with a `''` / `""` default. A missing `estado` is `false`, never a
   `TypeError` / `AttributeError` escaping `reconcileSubmission`. This is B2 and it is a parity requirement:
   a thrown exception is not the same observable behaviour as a returned `false`, and Python's `AttributeError`
   would crash a worker.
4. **Comparisons are exact literals after trimming; no case folding.** `Rechazado` is matched as DGII prints it
   (E2/E19); trimming is the only tolerance, and it is only applied inside this gate — the safe direction,
   because it can only cause one more read that must still agree. `No encontrado` is **never** trimmed and
   **never** compared here: it is the existence test (§5.1) and it stays raw. DGII's one documented casing
   inconsistency (`En Proceso` / `En proceso`, E12/E15) is a state this design never compares.
5. **The predicate is never the place where "we could not ask" is decided.** Reconcile does not call it when no
   flag was obtained; `false` is set by the caller of the predicate (§5 steps 7c/8, §9.2). `true` therefore has
   exactly one origin, which is what makes "never claim more than DGII said" mechanically checkable.

---

## 7. Failure disposition

### 7.1 The rule

**Every failed read fails the call. The error is propagated unchanged and the marker is never touched.**

| Read                                            | Failure behaviour                                                 | Why                                                                                                                                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inquiryStatus` (existence)                     | `Err`, propagated unchanged, marker intact — **exactly as today** | This read decides `cleared`, which deletes the lock. Inventing an answer here is the double-issue path.                                                                          |
| `consultatrackids` / `consultaresultado` (flag) | `Err`, propagated unchanged, marker intact                        | The flag question was asked of DGII and DGII did not answer. A `false` here would be indistinguishable from "DGII says not reusable" — the silent dead capability #126 is about. |

No partial `Ok` is ever returned. The flag branch is **disjoint** from the clearing branch
(`cleared ⇒ !delivered ⇒ !gate`), so this posture costs nothing in safety: a failed flag read cannot delete a
kept marker, resurrect a deleted one, or re-order the chain (§8.1).

### 7.2 Why the flag read does not degrade to `false` (the one alternative that was live)

This revision seriously considered `Ok(canReuseSequence: false)` on a flag-chain failure, and rejected it for
two reasons that survive Option A:

1. **It is the symptom #126 reports.** The issue is precisely "the SDK always says `false` and nothing tells you
   why". An SDK whose diagnostic story for a failed read is "call two other public methods and compare" has
   reproduced the disease one layer down. Attempt 1's rejected alternative F said this and was right; the fact
   that the read is now advisory rather than existence-bearing changes what a wrong `false` _costs_, not
   whether it is honest.
2. **The discriminator already exists and costs nothing** — in **TypeScript**, where `error.resource` names the
   failing read via the three real `Endpoint` values (`Endpoint.InquiryStatus`,
   `Endpoint.AllTrackingEcf`, `Endpoint.TrackResultStatus`). TypeScript only today; in Python `resource` is
   always `None` (F-126-12), so a Python caller keeps the parity-safe discriminator instead: `Ok` vs `Err`
   already separates "DGII answered" from "could not ask", and existence is one direct
   `inquiry_status(rnc, encf)` call away — a read that cannot touch the marker. Degrading would erase those
   signals in exchange for an `Ok` the caller cannot trust.

**The cost of failing, stated plainly:** a token delegated only as receiver (E14 vs E11) gets `Err` on every
_rejected_ document, where today it gets `Ok(delivered: true, canReuseSequence: false)`. That is a real
regression for that caller, it is visible rather than silent, the marker stays, and existence is recoverable
with one call — and F-126-11 records the option that would remove it if such a caller appears (Q4).

### 7.3 What `Err` means after this change — and what T8 must say

Before: `Err` meant "the existence question could not be answered".
After: `Err` means either that (unchanged) **or** "DGII holds the document, but the reuse flag could not be
read". The parity-safe discriminator is the type, not a field: `Ok` vs `Err` already separates "DGII answered"
from "could not ask", and a Python caller that needs an existence answer calls `inquiry_status(rnc, encf)` —
one read that cannot touch the marker. In TypeScript only, `error.resource` additionally names the failing
read; in Python `resource` is always `None` (F-126-12). The recovery path must be written down in
`architecture.md` §9.3 and `docs/{en,es}/guides/resilience.md` (T8):

- on `Err` from `reconcileSubmission`: **do not re-send**; retry reconcile later (the marker is intact, so the
  retry cannot double-issue);
- if the caller needs an existence answer sooner, call `inquiryStatus(rnc, encf)` directly — that is the read
  that decides `delivered`/`cleared`, and it succeeded or failed independently;
- a permanent `Err` on the track services — in TypeScript with `resource` set to a track-service `Endpoint` —
  is a delegation problem, not a DGII outage.

### 7.4 Error codes, and the breaker reality (S1)

No new error code, no wrapper, no re-mapping: `toDgiiError` / `to_dgii_error` remains the single normalizer
(`AGENTS.md`). Two facts the design must not misstate:

- **`CIRCUIT_OPEN` and `TIMEOUT` are not emitted today.** A cockatiel `BrokenCircuitError` becomes `UNKNOWN`
  with `retryable: false`; `project-docs/architecture.md` says as much. Attempt 1 listed them as propagated —
  that was false and is removed here. T8 must not document a code the SDK does not produce.
- **Python retries a breaker-open error.** `is_retryable_error` matches on message text and pybreaker's message
  contains "Timeout", so an open circuit costs three _immediate_ probes (measured, E21) instead of one. Not a
  regression of #126 (the retry predicate is frozen), but the design must not blame the doubled chain for it:
  follow-up F-126-1.

---

## 8. Ordering against the idempotency marker, and how a reviewer proves it

### 8.1 The invariant

> Inside `reconcileSubmission` / `reconcile_submission`, `idempotency.delete` is the **last fallible
> statement**. It is called exactly once, only when `cleared` is `true`, and there is no network call, no
> parsing and no other store operation between it and the `return`. Moreover, **no read of any kind can occur
> between the clearing decision (step 5) and the delete (step 10)**, because `cleared` and the flag gate are
> mutually exclusive (`cleared ⇒ !delivered ⇒ !gate`).

That second clause is stronger than "no I/O after the delete" and it is what actually protects the lock: the
delete happens in the only branch where no further read was ever scheduled.

### 8.2 Proof procedure for the reviewer (T3 / T6)

1. Read the function top to bottom: linear, no loop, no early `return` after the delete, no helper call between
   the delete and the return.
2. Grep the body for `idempotency.delete` / `_idempotency.delete`: exactly one hit per package, and its line
   number is greater than every `inquiryStatus` / `trackStatuses` / `statusTrackId` line in the same function.
3. **Read `cleared` and `delivered`:** they must be derived from `inquiry.estado` by raw equality, in that
   order, before any flag call. If `cleared` is computed from a listing, a flag, or a failed read, the ordering
   is broken even when the line order looks right.
4. **Read the flag branch's guard:** it must require `root == 'ECF'`, `delivered`, and a trimmed `Rechazado`
   from `inquiry.estado`. A flag branch that runs unconditionally reintroduces attempt 1's cost and re-couples
   the flag to existence.
5. In the diff, the delete line must be **unmoved**; the `delivered`/`cleared` derivation lines are unchanged
   and precede every new call; if a new flag call appears above them, the review fails.

### 8.3 Mandatory tests (both suites; T4 and T5 each write all of them)

Every row is an executable form of a rule in this document. These rows must be **observed failing** against
`main`'s `src`: in **TypeScript**, T-A and T-B (today they throw); in **both** packages, T-I (the defect:
`canReuseSequence` cannot be `true` today) and T-O/T-P (today they issue one call and produce the wrong shape).
T-L/T-M are not failing-first in Python — they already pass against `main`'s `src` in either package (errata E-4, D-10). T-A/T-B stay in the Python suite as regression guards, not as failing-first proofs; the rest are new
coverage.

| ID  | Fixture (mock the wire, not the code path)                                           | Assertion                                                                                                                         | Proves                                    |
| --- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| T-A | `consultaestado` → `200` with an **empty body**                                      | `Err(VALIDATION)`, **and the pending marker is still readable**                                                                   | D1/B1: a non-answer never clears the lock |
| T-B | `consultaestado` → `200` with body `null`                                            | same as T-A                                                                                                                       | D1/B1                                     |
| T-C | `consultaestado` → `200` object without `estado`                                     | `Err(VALIDATION)`, marker readable, **no exception escapes**                                                                      | §5.6, results-not-exceptions              |
| T-D | `consultaestado` → `{"codigo":0,"estado":"No encontrado"}`                           | `Ok(delivered:false, cleared:true, canReuseSequence:false)`; marker **deleted**                                                   | existence rule unchanged                  |
| T-E | `ECF` + `Rechazado` + `consultatrackids` → empty body                                | `Err(VALIDATION)`, **marker readable**, and `resource` on the track service in TypeScript (Python: `resource is None` — F-126-12) | §2.4, §5.6, §7.1                          |
| T-F | `ECF` + `Rechazado` + `consultatrackids` → `[]`                                      | `Ok(delivered:true, cleared:false, canReuseSequence:false)`, marker readable                                                      | §5.6 (empty array is not "no record")     |
| T-G | `ECF` + `Rechazado` + `[{estado:'No encontrado'}]`                                   | same as T-F                                                                                                                       | §5.2 contradiction rule                   |
| T-H | `ECF` + `Rechazado` + one track + `consultaresultado` → `503`                        | `Err` (same `code` in both packages; same `resource` as the underlying call in TypeScript), marker readable                       | §7.1                                      |
| T-I | `ECF` + `Rechazado` + one track + `{estado:'Rechazado', secuenciaUtilizada:false}`   | `Ok(canReuseSequence:true, cleared:false)`; marker **kept**                                                                       | A1 happy path                             |
| T-J | `ECF` + `Rechazado` + one track + `{estado:'Rechazado'}` (flag absent)               | `Ok(canReuseSequence:false)`, no exception                                                                                        | §6 rule 2                                 |
| T-K | `ECF` + `Rechazado` + one track + `{secuenciaUtilizada:false}` (**`estado` absent**) | `Ok(canReuseSequence:false)`, no exception                                                                                        | B2                                        |
| T-L | `ECF` + `Aceptado`                                                                   | **exactly one** request; no `consultatrackids` traffic                                                                            | §5.3 gate, §2.3 cost                      |
| T-M | `ECF` + `No encontrado`                                                              | exactly one request; marker deleted                                                                                               | §5.3, §2.3                                |
| T-N | `RFCE` root, `Rechazado`                                                             | exactly one request (`consultaestado` only)                                                                                       | §4.3                                      |
| T-O | `ECF` + `Rechazado` + two usable tracks                                              | `Ok(canReuseSequence:false)`, **one** `consultatrackids` call and **no** `consultaresultado` call                                 | §5.4                                      |
| T-P | `ECF` + `Rechazado` + one entry without `trackId`                                    | `Ok(canReuseSequence:false)`, no `consultaresultado` call                                                                         | §5.4                                      |

Plus, in both suites: the request **order and URLs** are asserted (E18/A2), and the pre-existing reconciliation
tests are reorganised so that a mock which puts `secuenciaUtilizada` on `consultaestado` **cannot pass**
(`test/reconciliation.test.ts:103`, `tests/test_reconciliation.py::test_can_reuse_sequence` — the exact fixtures
that hid the defect).

### 8.4 Pre-existing behaviour this design deliberately does not change

A throwing store `delete` still escapes as an exception (not a `Result`), and reconcile still does not verify
that the marker exists before computing its key. Both are unchanged; the delete remains the only fallible
statement whose failure can be destructive, so nobody "simplifies" it later — recorded as F-126-3.

---

## 9. Public surface

Both packages are pre-1.0 (`@deuriib/dgii-ecf` 0.6.0, `py-dgii-ecf` 0.7.1), but the run's scope guard is
explicit: **no new method, option, module, endpoint constant or result field beyond what the issue requires**
(`126-tasklist.md` Decision 2 and the scope guard). This revision therefore **adds no field** — attempt 1's
`track` field and its nullable `inquiry` are withdrawn, because under Option A `inquiry` is populated on every
path (the existence read never moves) and the verdict is already in `inquiry.estado`.

| #   | Surface                                                                                                                                             | Decision                                                                                                                                                                                                                                                                                            | Reasoning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1  | `ReconciliationResult` (shape)                                                                                                                      | **Unchanged**: `inquiry` (non-null), `delivered`, `canReuseSequence`, `cleared`                                                                                                                                                                                                                     | The existence read is unchanged, so `inquiry` is always populated; the verdict an operator needs is `inquiry.estado`. Decision 2 forbids the extra field, and nothing in the issue requires it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| P2  | `canReuseSequence` / `can_reuse_sequence` parameter                                                                                                 | Re-typed to `TrackingStatusResponse \| InquiryInvoiceSummary`, body per §6                                                                                                                                                                                                                          | Keeps the "read the flag" job in one exported place for `statusTrackId` users _and_ `getSummaryInvoiceInquiry` users, and makes passing an `InquiryStatusResponse` a compile/type error in both languages. An RFCE summary's `true` licenses reuse on another **Resumen de Factura de Consumo** (E4, p. 18), never on another general e-CF (stated in §6's docblock and §9.3). P2 **narrows** TypeScript (losing `InvoiceSummaryResponse`, the RFCE reception response, which the current structural type accepts) and **widens** Python (adding `InquiryInvoiceSummary`); that asymmetry is intentional parity. Breaking re-annotation → PR-body call-out (Decision 3). |
| P3  | `InquiryStatusResponse.secuenciaUtilizada` (TS) / `secuencia_utilizada` (PY)                                                                        | **Removed**                                                                                                                                                                                                                                                                                         | DGII never sends it (E1). Removing it makes the original bug a **type error** as well as a documentation fix; leaving it is the exact trap `AGENTS.md` warns about for signing ("it parses, so it must be real"). Breaking removal → owner sign-off + PR call-out (Decision 3). **Fallback if the owner declines:** keep the field; P2 alone already prevents reintroducing the bug, and the field's comment must say DGII does not publish it.                                                                                                                                                                                                                          |
| P4  | `TrackingStatusResponse.secuenciaUtilizada` (TS) / `secuencia_utilizada`                                                                            | `boolean` → `boolean \| null` optional                                                                                                                                                                                                                                                              | Python already models `bool \| None` (`types.py:221`); TS's non-optional claim is untrue for any answer that is not a rejection, and DGII scopes the flag itself to a rejected outcome (E2, p. 24), not to every answer. Truthfulness/parity, not behaviour: the predicate already tolerates absence (§6 rule 2).                                                                                                                                                                                                                                                                                                                                                        |
| P5  | `SummaryTrackingStatusResponse.trackId` (TS)                                                                                                        | `trackId: string` → `trackId?: string`                                                                                                                                                                                                                                                              | §5 step 7b has to handle "one entry without a trackId", a state TS's type says cannot exist. Python is already `str \| None`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| P6  | `SummaryTrackingStatusResponse.estado`                                                                                                              | **Stays required in both** (`estado: string` / `estado: str`)                                                                                                                                                                                                                                       | Both packages must classify an entry the same way, and an entry without a string `estado` cannot be classified. Python rejects it at parse (`_as_str` → `VALIDATION`); TypeScript's cast cannot, so `trackStatuses` must add the runtime guard that produces the identical `Err(VALIDATION)` and message **for a missing or non-scalar `estado`** (a numeric `estado` diverges — F-126-7).                                                                                                                                                                                                                                                                               |
| P7  | `SummaryTrackingStatusResponse.fechaRecepcion`                                                                                                      | **Out of scope — do not touch**                                                                                                                                                                                                                                                                     | Read nowhere on the reconcile path; the TS-required / PY-optional divergence is pre-existing and recorded as F-126-4. Changing it here would be churn in a bug fix.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| P8  | `trackStatuses` / `track_statuses` normalisation                                                                                                    | Normalise + validate **inside the method**: absent/`null`/unreadable payload → `Err(VALIDATION, 'Unexpected DGII response payload')`; single object → `[object]`; array → as-is (`[]` allowed)                                                                                                      | E12 publishes a single object while the prose says _listado_. Today TS returns `Ok(undefined)` for an empty body while claiming an array, and Python returns `Ok([])` — so "no answer" is indistinguishable from "no records". This is the layer that owns parsing, so this is where the rule lives (§5.6). Public behaviour change → T8 documents it; mirrors the `getCustomerDirectory` precedent (A.8).                                                                                                                                                                                                                                                               |
| P9  | `PENDING_SUBMISSION_MESSAGE`, error codes, retry predicate, breaker/bulkhead thresholds, idempotency key derivation, `delivered`/`cleared` meanings | **Unchanged**                                                                                                                                                                                                                                                                                       | `AGENTS.md` invariants; R9/A5; `126-tasklist.md` I1–I3. `Err` keeps its existing meaning too (§7.3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| P10 | `project-docs/architecture.md`                                                                                                                      | Must move in the same change set (T8): the gated chain, P2–P8, the `false` taxonomy (P11), the `CerteCF` non-availability (§4.2), the "`canReuseSequence: true` with `cleared: false` means re-sign, do not re-send" sentence, one store per environment, and the caller's lease obligation (§10.4) | Public contract change rule from `AGENTS.md`; C-3 in the run ledger. Also: the _official source_ line in `docs/{en,es}/guides/flow.md` §7 (`flow.md:254` / `:256`) **and** in `docs/{en,es}/guides/resilience.md` (`:144` / `:147`) — all four files — currently cites _Consulta de trackId_ for the `No encontrado` rule; under this design the existence rule is `consultaestado`'s (E19), so T8 must re-point those citations and keep the flag citation on _Consulta de resultado_.                                                                                                                                                                                  |
| P11 | What `false` means (documentation, not a type)                                                                                                      | **Contractual**; see §9.2                                                                                                                                                                                                                                                                           | D6/D8/F7: `canReuseSequence: false` collapses several causes. The decision is to keep the boolean, define it precisely, keep the failure case out of it (`Err`, §7.1), and record F-126-6 for the one ambiguity that remains.                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### 9.1 What each implementer must build

`ReconciliationResult` unchanged; `canReuseSequence` re-typed and total; `trackStatuses` normalising and strict;
`InquiryStatusResponse` without the flag (or with the fallback comment); TS `trackId` optional and TS
`secuenciaUtilizada` nullable. Nothing else. Both packages ship the same behaviour or T6 fails the review (C-2).

### 9.2 What `canReuseSequence: false` means, and what is _not_ collapsed into it

`true` has exactly one origin (§6 rule 5). `false` means **"the SDK did not obtain a positive reusable answer
from DGII"** — it is _not_ a statement that DGII consumed the sequence. The causes, and what a caller can
observe in this release:

| #   | Cause                                                                                              | Observable                                                                                                                                         | Actionable by the caller?                                             |
| --- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| C1  | Root element is not `<ECF>` (no flag exists for that document type)                                | `inquiry` populated; document type known                                                                                                           | Not applicable — no reuse concept in DGII's text (§4)                 |
| C2  | DGII has no record                                                                                 | `delivered: false`, `cleared: true`                                                                                                                | Not a reuse question at all                                           |
| C3  | Verdict is not a rejection (`Aceptado`, `Aceptado Condicional`, `En Proceso`, unrecognised)        | `inquiry.estado`                                                                                                                                   | Reuse is only defined for rejections (E2)                             |
| C4  | Rejected, but the listing yields 0 or >1 usable tracks, or none with a `trackId`                   | `inquiry.estado == 'Rechazado'`, one `consultatrackids` call in the caller's trace                                                                 | Yes — call `trackStatuses(rnc, encf)` and aggregate yourself (§5.4)   |
| C5  | Rejected, one track, but the verdict is not `Rechazado`, the flag is absent, or the flag is `true` | `inquiry.estado`; call `statusTrackId(trackId)` for the per-track facts                                                                            | Yes — `statusTrackId` is public                                       |
| C6  | The flag chain could not be completed (transport, HTTP, unreadable payload, delegation)            | **`Err`**, not `false`; `error.resource` names the track service in TypeScript only — Python's `resource` is always `None` (F-126-12) (§7.1, §7.3) | Yes — retry reconcile, or read existence directly via `inquiryStatus` |

So the boolean collapses **C4 and C5's sub-cases only**, and the one cause that could otherwise masquerade as a
DGII answer (C6) is deliberately _not_ collapsed — it is an `Err` (§7.2). The remaining ambiguity inside C4
(several tracks vs. no followable trackId) is the only information this release withholds, because the public
shape cannot carry it without a new field:

**F-126-6 (follow-up, specified):** add an additive `reuseReason` to `ReconciliationResult`
(`'not-applicable' | 'no-record' | 'verdict-not-rejected' | 'no-single-track' | 'flag-absent' | 'flag-true'`), or
the `tracks: SummaryTrackingStatusResponse[]` field T3 preferred (populated on the gated path, `[]` otherwise).
Neither changes `delivered`, `cleared` or `canReuseSequence`. Requires owner sign-off (new public field under
Decision 2 / the scope guard), and it is the only way to make C4 fully observable. Not in #126.

### 9.3 Documentation obligations this design creates (T8/T9)

1. `architecture.md` §9.3 and `docs/{en,es}/guides/resilience.md`: the chain, the gate, and the `false`
   taxonomy in one sentence — **"`false` means DGII did not positively say the sequence is reusable; it does
   not mean DGII said it is consumed"** — plus "an absent flag is treated as not reusable" which stays true.
2. The same pages: `canReuseSequence: true` arrives with `cleared: false`; re-sending the identical document
   keeps returning `IDEMPOTENCY`; the correct action is to re-sign the same e-NCF as a new document; and, for
   `getSummaryInvoiceInquiry` users, that an RFCE summary's `true` licenses reuse on another _Resumen de
   Factura de Consumo_ (E4, p. 18), never on another general e-CF.
3. The `CerteCF` non-availability (§4.2), the delegation requirement the flag chain adds (§5.5), and that a
   flag-chain failure surfaces as `Err` (§7.3).
4. One store / one key namespace per environment (`buildIdempotencyKey` has no environment component —
   E-3 in attempt 1's review; F-126-5).
5. `docs/{en,es}/guides/flow.md` §7 (`:254` / `:256`) **and** `docs/{en,es}/guides/resilience.md`
   (`:144` / `:147`): re-point the _official source_ citation for the `No encontrado` rule to _Consulta de
   estado e-CF_ (E19) and keep the flag citation on _Consulta de resultado_ (E2) — all four files, since CI
   diffs the locale trees. Keep the existing sentences — under this design they are true, not rewritten.
6. Observability: count **reconcile outcomes**, not raw requests, or the extra calls will look like a traffic
   regression on the query path (§10.6).

---

## 10. Cost and the resilience posture

### 10.1 Logical calls per reconcile

| Path                                                          | Calls                                        | Before |
| ------------------------------------------------------------- | -------------------------------------------- | ------ |
| Non-`ECF` root (RFCE / ACECF / ANECF / unknown)               | **1** (`consultaestado`)                     | 1      |
| `<ECF>`, no record                                            | **1** (`consultaestado`)                     | 1      |
| `<ECF>`, delivered, verdict ≠ `Rechazado`                     | **1** (`consultaestado`)                     | 1      |
| `<ECF>`, delivered, `Rechazado`, ≠1 followable track          | **2** (`consultaestado`, `consultatrackids`) | 1      |
| `<ECF>`, delivered, `Rechazado`, exactly one followable track | **3** (+ `consultaresultado`)                | 1      |
| Existence read fails                                          | **1**                                        | 1      |

### 10.2 Measured transport attempts (F6a, S4)

| Layer                         | TypeScript                                                                 | Python                                    |
| ----------------------------- | -------------------------------------------------------------------------- | ----------------------------------------- |
| Attempts per logical call     | **4** (cockatiel `maxAttempts: 3` = 3 retries; measured: 4 calls observed) | **3** (`stop_after_attempt(3)`; measured) |
| Per-attempt timeout           | 15 s                                                                       | 15 s                                      |
| Retry composition             | outside the breaker                                                        | outside the breaker                       |
| Breaker threshold / half-open | 5 consecutive / 30 s                                                       | 5 consecutive / 30 s                      |
| Bulkhead                      | 20 concurrent, 40 queued                                                   | no bulkhead equivalent                    |

The TS-vs-PY attempt-count divergence is **pre-existing** and must not be "fixed" in #126 (the retry predicate
and its configuration are frozen): F-126-8.

### 10.3 Wall clock per reconcile (no auth refresh, no 401 replay)

| Path                                                     | TypeScript                        | Python                           |
| -------------------------------------------------------- | --------------------------------- | -------------------------------- |
| 1 call (today, and every non-rejected path)              | ≈ **61 s** (4 × 15 s + backoff)   | ≈ **45 s** (3 × 15 s + backoff)  |
| 2 calls (rejected, listing fails or ≠1 followable track) | ≈ **121 s** (8 × 15 s + backoff)  | ≈ **90 s** (6 × 15 s + backoff)  |
| 3 calls (the rejected path)                              | ≈ **182 s** (12 × 15 s + backoff) | ≈ **135 s** (9 × 15 s + backoff) |

Authentication refreshes (Seed + ValidarSemilla) and a 401 replay add attempts at the same 15 s ceiling on top
of these figures; neither package exposes a caller-facing deadline/`AbortSignal` on the query methods, and #126
must not invent one. Attempt 1's "~90 s" was true for Python only; the TypeScript figure is ~34 % higher than
that for 2 calls and is ~182 s for the 3-call path.

### 10.4 The caller-side obligation this creates (F6b, F6c)

**A single `reconcileSubmission` can run for up to ≈61 s (TypeScript) / ≈45 s (Python) on any non-rejected
path, ≈121 s / ≈90 s when the listing is followed but `consultaresultado` is not, and ≈182 s / ≈135 s on the
full chain; one token refresh (Seed + ValidarSemilla) adds ≈121 s / ≈90 s, so a queue lease must be sized
against ≈**303 s** / ≈**225 s**. A bulkhead permit is held for at most one attempt (≤15 s at a time), because
the bulkhead is the innermost policy.** Therefore:

- **the queue lease (visibility timeout) must exceed the reconcile worst case, or the caller must reconcile in a
  lease-renewing / leader-elected context.** Two workers reconciling the same document concurrently is not made
  safe by the marker: once one of them deletes it, the other can re-send.
- callers must **not** stack their own tight retry loop on top of reconcile; the SDK's retry policy is the retry
  policy, and the next attempt must be scheduled (queue backoff), not nested.

Both sentences belong in `architecture.md` §9.3 and `docs/{en,es}/guides/resilience.md` (T8). They are the price
of a 3-call worst case, and they are cheap next to a duplicate e-NCF.

### 10.5 Breaker and bulkhead: what the extra calls actually do (S2)

- **Per reconcile, at most one call's worth of failure events**: a failed existence read returns immediately (no
  flag calls), and a failed flag call happens only after the existence read **succeeded**, which resets the
  consecutive-failure counter. So ≤4 events (TS) / ≤3 (PY) — the same bound as today.
- **The `Ok`→`Err` surface grows in exactly one place**: a rejected document whose flag chain fails now returns
  `Err` where today it returns `Ok(delivered: true, canReuseSequence: false)`. It is bounded by the gate (other
  verdicts never run the chain) and it must be documented (§7.3, T8). It is the price of never reporting a
  `false` that DGII did not say.
- **The breaker and the bulkhead are shared with `sendElectronicDocument`** (one `HttpClient` per client). A
  `consultatrackids` outage can therefore consume the same 5-failure budget and the same 20 permits that
  submissions need: it holds **one bulkhead permit, for at most one 15 s attempt and released between
  attempts**, because the bulkhead is the innermost policy. The _job_ can still run for minutes — that is the
  lease problem (§10.4), not a permit-monopoly problem. Mitigation is operational, not architectural, in #126:
  T8 must recommend a dedicated reconcile worker/limit, and F-126-2 records the structural fix (a separate
  `HttpClient`/policy for the query path).
- **Python retries an open breaker three times** (§7.4). It is immediate, so it costs no wall clock, but it
  costs three breaker probes per reconcile during an outage. F-126-1.

### 10.6 Observability

The SDK emits no logs; the only telemetry is `error.resource` on failures plus the caller's own metrics —
TypeScript only today, because in Python `resource` is always `None` (F-126-12), so a Python operator relies on
`code`, `message` and its own metrics. Under this design the reconcile path can produce
`Endpoint.InquiryStatus` (always) and `Endpoint.AllTrackingEcf` / `Endpoint.TrackResultStatus` (rejected path
only). Per-stage metrics should count **reconcile outcomes** (`delivered` / `cleared` / reusable / not-reusable
/ `Err`) rather than raw requests, or the extra calls will read as a traffic regression.

---

## 11. Rejected alternatives

| #     | Alternative                                                                                                                                                                                        | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** | **Keep `consultaestado` for `delivered`/`cleared` exactly as shipped, and spend the extra round trips only when its `estado` is `Rechazado`** (a.k.a. the hybrid; **the orchestrator's Option A**) | **ADOPTED** — §2. It wins over the root-element switch because (i) the destructive rule and its service stay frozen, so `126-tasklist.md` I2/I3, Decision 4, R9/A5 and the shipped guide sentence are satisfied rather than amended; (ii) clearing depends only on a positively stated DGII state from the source that has always carried it, so "absence read as a negative" does not exist by construction — the whole class of D1/B1 findings disappears instead of being guarded against; (iii) it is cheaper in every case except the one it fixes (1 call for accepted / no-record / non-`ECF` vs 2 under the switch; 3 vs 2 for a rejection); (iv) the extra calls are earned only where the answer changes what an integrator does, and they are unreachable in `CerteCF` because the existence read they depend on is documented unavailable there. Its costs are stated, not hidden: one more call than the switch on the rejected path, and a possible `consultaestado`-vs-track disagreement resolved by never letting the track answer override existence (Q6). |
| **B** | Classify by root element and **switch** the existence source to `consultatrackids` for `<ECF>` (attempt 1's decision)                                                                              | **SUPERSEDED by A.** It reached the same flag but paid for it with the one rule the run froze, forced a clearing decision on an undocumented payload shape (D1/B1), needed a documented error-contract change, and rested on an unlabelled completeness inference (the listing is documented as _a_ track lookup, not as _the_ existence answer). Kept here as the record of what was considered and why it lost.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **C** | Keep `inquiryStatus` and re-point `canReuseSequence` at a field DGII adds later to `consultaestado`                                                                                                | Rejected: E1 — the field is not published there in any environment and the response is an unchecked cast, so nothing would ever surface. This is the current defect.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **D** | Call `consultaresultado` with a trackId persisted at submit time                                                                                                                                   | Rejected: requires changing what `sendElectronicDocument` persists (the marker stores `"pending"` or the response, nothing else), only helps documents sent by the new code, and couples the fix to a store-schema change. `consultatrackids` answers for every marker, including legacy ones.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **E** | Add per-environment guards for the new consults (refuse in `CerteCF`)                                                                                                                              | Rejected: §4.2 — DGII documented the unavailability in 2020 and has re-published services since, so a guard would freeze a stale statement as product behaviour, changes no outcome that is not already an `Err`, and would be a new rule for every root element.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **F** | Ask `consultaresultado` for _every_ track and require unanimity                                                                                                                                    | Rejected: E10 permits an unbounded number of tracks and DGII says nothing about aggregation; round trips become `1 + N` on a recovery path (§5.4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **G** | Ask `consultaresultado` for the most recent track (by `fechaRecepcion`)                                                                                                                            | Rejected: needs a date parser and an ordering rule for a value DGII publishes only as `string` (E12); the SDK's own helper sorts `DD-MM-YYYY` wrongly as a string, and a wrong "most recent" is a wrong reuse answer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **H** | Treat several tracks as "the later one wins because the earlier attempt was superseded"                                                                                                            | Rejected: not in DGII's text, and the dangerous direction — a consumed number plus a later rejection is how a duplicate e-NCF gets issued.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **I** | Degrade instead of failing — either the existence read (`Ok` with `delivered:false`) or the flag read (`Ok` with `canReuseSequence:false`)                                                         | Rejected in both forms. Degrading the existence read makes a `false` delete the fiscal lock. Degrading the flag read reproduces #126's exact symptom (a `false` indistinguishable from DGII's answer) while erasing the `error.resource` discriminator that already exists (TypeScript only — F-126-12): §7.2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **J** | Source `delivered` from `consultaresultado`'s verdict                                                                                                                                              | Rejected: §5.2 — a `No encontrado` verdict is about a **trackId** (E15), and letting it clear a lock would let a contradiction inside DGII's data delete a fiscal marker.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **K** | Source `delivered` from the flag being present (flag absent ⇒ no record)                                                                                                                           | Rejected: inverts two facts; clearing on that basis is the double-issue path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **L** | Wire `consultarfce` into the reconcile path in the same change                                                                                                                                     | Rejected: §4.3 — E4's flag lives on the success-path response (unreachable for a pending marker) and E5 defines no semantics for `consultarfce`'s copy of it; a mis-derived `codSeguridad` returns `No encontrado`, which would clear a lock if it were ever used for existence. A follow-up, not this fix.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **M** | Gate the reuse answer on `estado !== 'Rechazado'` only, ignoring `codigo`                                                                                                                          | Kept deliberately: `codigo` is redundant with `estado` in DGII's own tables (E15, E19) and the SDK compares states everywhere else. A numeric check would create a second, divergent failure mode for the same fact.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **N** | Case-insensitive comparison of `Rechazado` / `No encontrado`                                                                                                                                       | Rejected: in the `Rechazado` gate it is merely redundant, and in the existence test it is the permissive direction (an unrecognised state would clear the lock). Trimming is the only tolerance that is safe, and only in the gate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **O** | Stop exposing `canReuseSequence` altogether (the issue's fallback, R10)                                                                                                                            | Rejected: unnecessary once the flag is reachable, and it would remove a working capability from two published SDKs plus the guidance in `docs/*/guides/resilience.md`. R10's branch is recorded as decided: **implement the chain**, do not retire the capability.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **P** | Copy the flag onto `InquiryStatusResponse` and "tolerate" it                                                                                                                                       | Rejected: that is the current defect with a comment on top. P3 removes the field.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

---

## 12. Open questions

Each one is something DGII's text does not settle. The conservative answer is part of the decision; the
"settles it" column is what would let a future change relax it.

| #   | Question                                                                                                                                                                                                     | Answer shipped in #126                                                                                                                                                                                                                                                                                                                                                            | What would settle it                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Do several tracks for one e-NCF (E10) ever carry **disagreeing** flags?                                                                                                                                      | Assume yes; never aggregate; answer `false` (§5.4 — an inference, labelled as one).                                                                                                                                                                                                                                                                                               | A DGII statement on aggregation, or a production sample of an e-NCF with several tracks whose flags differ.                                                                                                 |
| Q2  | `consultarfce` is published in all three environments (E6), the SDK gates it to production (E16), E5 defines no semantics for its flag, and E4 scopes RFCE reuse to another _Resumen de Factura de Consumo_. | Do not wire it; RFCE reconcile answers `false` in every environment (§4.3). Recorded follow-up: relax A.9 to match E6 **and** wire `consultarfce` as a **flag-only** read (never for existence), carrying E4's reuse-target limit.                                                                                                                                                | A DGII statement defining `secuenciaUtilizada` on `consultarfce`, a live `testecf` call proving the endpoint answers below production, and a decision that RFCE→RFCE reuse is the capability being offered. |
| Q3  | Are `consultaestado` / `consultatrackids` actually unavailable in `CerteCF` today?                                                                                                                           | **Answered in part:** DGII withdrew both certification URLs and stated the services were not available to the public at that time (E8/E9, bitácora 28-12-2020 item 2); nothing re-published them since. Reconcile is therefore not usable in `CerteCF`, no guard is added (§4.2), and the flag chain is unreachable there because it sits behind the existence read.              | A live call against `certecf`, or a DGII revision that re-publishes the URLs (which the SDK will pick up without a code change).                                                                            |
| Q4  | A token delegated only as _receiver_ can use `consultaestado` (E14) but not `consultatrackids` (E11). Is there a real integrator in that position?                                                           | Visible, never silent: reconcile returns `Err` on _rejected_ documents only, the marker stays, and existence is recoverable with one direct `inquiryStatus` call (§5.5, §7.2).                                                                                                                                                                                                    | A reported case; then add the skip option (F-126-11) or make the reason explicit (F-126-6), and document emitter delegation in T8.                                                                          |
| Q5  | What does `consultatrackids` return when DGII holds no record — `[]`, `null`, or an entry saying `No encontrado`?                                                                                            | The question is **not asked of that service** in this design: existence comes from `consultaestado` (E19). `null`/absent ⇒ `Err(VALIDATION)`; `[]` ⇒ no usable track ⇒ `canReuseSequence: false`; an entry set saying `No encontrado` ⇒ same, and **never** a clearing (§5.6, §5.2). This is not "conservative by omission" — the listing is simply not an existence source here. | A production sample of a `consultatrackids` response for an unknown e-NCF (useful for Q1/C4, not for clearing).                                                                                             |
| Q6  | Does the listing's per-track `estado` ever disagree with `consultaestado`'s for the same e-NCF?                                                                                                              | Existence is authoritative from `consultaestado`; the track answer can only fail to assert the flag. A contradiction never un-delivers a document or clears a marker (§5.2).                                                                                                                                                                                                      | A DGII statement, or a sample of the contradictory pair.                                                                                                                                                    |
| Q7  | Should reconcile verify that the returned `encf`/`rnc` match the ones it asked about?                                                                                                                        | No guard. Both queries are keyed by the same RNC + e-NCF, so a mismatch is a DGII data defect, and a comparison would need a case rule (DGII's cURL samples use lowercase e-NCFs) and would add a second place where a mismatch silently becomes `false`.                                                                                                                         | A reported cross-document answer. If implemented, compare case-insensitively and only to _downgrade_ the flag, never existence.                                                                             |
| Q8  | Should the caller be told that DGII holds **several** tracks (the signature of a past double-submission)?                                                                                                    | Not in this release: `delivered: true` + `inquiry.estado == 'Rechazado'` + `false` is the whole answer, and `trackStatuses` is public. F-126-6 specifies the additive field that would remove the guessing.                                                                                                                                                                       | An operator request; then ship F-126-6 with owner sign-off (P1/Decision 2).                                                                                                                                 |
| Q9  | For ACECF/ANECF markers, `consultaestado` cannot see those documents, so a `No encontrado` clears their marker.                                                                                              | Unchanged by #126 — but flagged: it is a latent hazard on the same code path (a cleared ANECF marker permits a second voiding submission).                                                                                                                                                                                                                                        | Its own issue; the conservative fix is to refuse reconcile for roots DGII publishes no consult for, which changes behaviour and needs its own decision.                                                     |
| Q10 | `No encontrado` may mean "not yet reported" (E19, verbatim), not "never received".                                                                                                                           | Unchanged and explicitly **not widened**: #126 adds no second absence-based clearing rule, and callers should reconcile after a delay. T8 states it once.                                                                                                                                                                                                                         | DGII publishing an indexing-latency guarantee.                                                                                                                                                              |
| Q11 | A string `estado` that is present but unrecognised (e.g. `""`) passes step 4's type guard and yields `delivered: true`.                                                                                      | Unchanged by #126 and **not** to be "fixed" into a clearing rule: the safe direction is to keep the lock and tell the caller not to re-send (§5.6 note).                                                                                                                                                                                                                          | A DGII statement enumerating every `estado` value it can return.                                                                                                                                            |

---

## 13. Parity checklist for T4 / T5

Both implementations must satisfy every line; T6 fails the review on any divergence (C-2).

- [ ] Root-element classification with each package's existing helper, used **only** to gate the flag chain.
- [ ] Same call order: `inquiryStatus` → decide `delivered`/`cleared` → (gate) → `trackStatuses` →
      (`statusTrackId` only when exactly one followable track). No parallel calls, no reordering.
- [ ] Same existence rule: **raw** `estado == 'No encontrado'` / `!= 'No encontrado'`; no trimming, no case
      folding; `cleared = !delivered`; single derivation site.
- [ ] Same payload classification (§5.6), including `null`/absent ⇒ `Err(VALIDATION)` with the message
      `Unexpected DGII response payload` (Python's existing literal, reused verbatim in TypeScript). This
      message parity is scoped to the non-dict / absent-body case; a dict body missing `estado` reports the
      same code with each package's own text (§5.6, F-126-7).
- [ ] Same gate: `ECF` ∧ `delivered` ∧ trimmed `Rechazado`.
- [ ] Same aggregation: 0 or >1 usable, or no non-empty `trackId` ⇒ `false`, no `consultaresultado` call.
- [ ] Same predicate: total, `secuenciaUtilizada === false` **and** trimmed `Rechazado`, `''`/`""` default for
      `estado`; a missing `estado` is `false`, never an exception.
- [ ] Same failure disposition: **every** failed read propagates its `Err` unchanged, marker intact; no partial
      `Ok`, no degradation to `false` (§7.1); in TypeScript `error.resource` identifies the failing read, in
      both packages `code` and `message` match **for failures DGII answered** (§7.3); transport failures
      normalize differently by design of each HTTP stack (F-126-13).
- [ ] Same result shape: `ReconciliationResult` **unchanged** — `inquiry` non-null, `delivered`,
      `canReuseSequence`, `cleared`, same declaration order.
- [ ] Types aligned: `canReuseSequence` accepts `TrackingStatusResponse \| InquiryInvoiceSummary`;
      `InquiryStatusResponse` without `secuenciaUtilizada` (or with the documented fallback comment);
      `TrackingStatusResponse.secuenciaUtilizada` optional/nullable in TS; `SummaryTrackingStatusResponse.trackId`
      optional in TS; `estado` required and validated in both; `fechaRecepcion` untouched in both.
- [ ] `trackStatuses` normalises and strictly validates inside the method in both packages; no change to the
      shared `_parse_list` / `getCustomerDirectory` behaviour.
- [ ] Ordering: exactly one `delete`, after every read, reachable only from the `cleared` branch, with no I/O
      between it and the return (§8.2), plus the full test table of §8.3 (T-A…T-P) in both suites.
- [ ] Tests mock **DGII wire shapes**, assert request order and URLs, and no fixture can pass with
      `secuenciaUtilizada` on a `consultaestado` response (A2/R5).
- [ ] No new result field, no new method, no new option, no new endpoint constant (Decision 2 / scope guard).

---

## 14. What this design does not claim

- It does not claim the flag is reachable in `CerteCF` (Q3) — reconcile is not usable there at all (§4.2).
- It does not claim the flag is reachable for RFCE documents in this SDK (Q2, §4.3).
- It does not claim DGII defines `secuenciaUtilizada` for `consultarfce` (E5).
- It does not claim the `consultatrackids` listing is complete or fresh — it is not used as an existence source
  (§4.1, Q5).
- It does not claim reconciliation for ACECF/ANECF markers is correct — only that it is unchanged (Q9).
- It does not claim `canReuseSequence: false` means DGII consumed the sequence (§9.2).
- It does not claim any new error code, deadline support, or breaker behaviour (§7.4, §10).
- It is not certification evidence. A green suite proves the code follows this contract; DGII remains the
  authority on acceptance.

---

## 15. Follow-ups register

Nothing in the two review notes is dropped silently. Everything not applied is here, named.

| ID       | Item                                                                                                                                                                                                                              | Why not in #126                                                                                                            | Owner/source       |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| F-126-1  | `is_retryable_error` matches pybreaker's open-circuit message as retryable, so an open circuit costs three probes. Match `CircuitBreakerError` explicitly **before** the message heuristic, plus a test asserting a single probe. | Retry predicate is frozen (`AGENTS.md`, R9); Python-only change                                                            | S3                 |
| F-126-2  | A dedicated `HttpClient`/resilience policy for the query path, so a `consultatrackids`/`consultaresultado` outage cannot exhaust the breaker and bulkhead that submissions use.                                                   | Architectural change beyond a defect fix (§10.5)                                                                           | S2                 |
| F-126-3  | Wrap the store `delete` in `try/catch`/`except` → `Err` (reporting `cleared: false` because the marker's state is unknown).                                                                                                       | §8.4 — pre-existing, frozen ordering                                                                                       | S6                 |
| F-126-4  | Align `SummaryTrackingStatusResponse.fechaRecepcion` nullability across packages (TS required, Python optional).                                                                                                                  | Read nowhere on the reconcile path (P7)                                                                                    | D7                 |
| F-126-5  | `buildIdempotencyKey` has no environment component, so a shared store lets one environment clear another's lock.                                                                                                                  | Key derivation frozen (P9); fixed by documentation now                                                                     | attempt 1 E-3 / S8 |
| F-126-6  | `reuseReason` enum or `tracks: SummaryTrackingStatusResponse[]` on `ReconciliationResult` (§9.2).                                                                                                                                 | New public field; Decision 2 / scope guard; needs owner sign-off                                                           | D6/D8/F7           |
| F-126-7  | Python coerces a numeric `estado` to a string (`_as_str`); TypeScript rejects it. Align once, deliberately.                                                                                                                       | Shared model helper; the payload is not one DGII produces                                                                  | §5.6               |
| F-126-8  | TS performs 4 transport attempts per logical call where Python performs 3, under the same nominal setting.                                                                                                                        | Resilience configuration frozen (P9)                                                                                       | S4/E18             |
| F-126-9  | Relax A.9's production-only guard on `consultarfce` to match E6.                                                                                                                                                                  | Separate capability decision (Q2)                                                                                          | E16/Q2             |
| F-126-10 | Reconcile for ACECF/ANECF: refuse roots DGII publishes no consult for (Q9).                                                                                                                                                       | Behaviour change; own decision                                                                                             | Q9                 |
| F-126-11 | Optional `includeReusability` (or equivalent) so a caller can skip the flag chain — the only route that keeps a receiver-delegated token on today's `Ok` for rejected documents (§5.5, Q4).                                       | New public option; Decision 2 / scope guard                                                                                | S7                 |
| F-126-12 | Populate `DgiiError.resource` in the Python query path (needs `Endpoint`-equivalent strings in `http.py`) — pre-existing parity gap, out of scope here.                                                                           | Parity gap predates #126; no behaviour depends on it in Python, and `Ok` vs `Err` already carries the discriminator (§7.3) | T3 E-1             |
| F-126-13 | Transport failures normalize to different codes across packages (TypeScript `UNKNOWN`, Python `HTTP`). Pre-existing and frozen here: the parity claim in §13 is scoped to DGII-answered failures.                                 | Resilience/error normalization frozen (P9); unifying the codes changes a public error contract                             | T6 D-8             |
| F-126-14 | Model-echo asymmetry: TypeScript passes a malformed non-classifying value through verbatim, Python drops it to `None` / defaults `codigo` to `0`. No decision reads those fields.                                                 | Each type system's parsing choice; registered, not reconciled. Registered in `project-docs/architecture.md` §14.1          | T6 RES-1           |
| F-126-15 | `InquiryInvoiceSummary` (`consultarfce`) parses non-classifying fields strictly in Python and passes them through in TypeScript. Pre-existing, off the reconcile path; the reuse answer agrees in both.                           | Off-path and pre-dating #126; registered, not reconciled. Registered in `project-docs/architecture.md` §14.1               | T6 RES-2           |

---

## 16. Manifest — every review item, and where it is proven

`APPLIED` = the design text now does what the item demanded. `ADOPTED AS FOLLOW-UP` = deliberately out of
scope, with a named entry in §15.

### 16.1 T2 refuter — D1…D9

| Item                                                                                                                                                                                   | Status                                                                             | Proof                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** — an absent/empty `consultatrackids` payload must never clear the marker nor be read as "no record"; absent/null → `Err(VALIDATION)`; only a positive `No encontrado` may clear | **APPLIED**                                                                        | Structural: the listing is never an existence source (§2.2, §4.1, §5.2), so it cannot clear anything — the "permissive by omission" branch does not exist. The `Err(VALIDATION)` requirement is applied at the layer that owns parsing (§5.6, P8) and reconcile's disposition for it is §7.1. The only clearing source, `consultaestado`, clears **only** on a positively stated `No encontrado` (E19) with raw equality (§5.1, §5.6). Attempt 1's step-5 `null → []` and its "(the service may say 'nothing' either way)" citation are gone (D3). Tests T-A/T-B/T-E/T-F/T-G in §8.3; Q5 rewritten in §12. |
| **D2** — the no-guard decision must not rest on a premise E8 contradicts                                                                                                               | **APPLIED**                                                                        | E8 corrected in §3.1 (documented 2020 statement of non-availability, never re-published); §4.2 now argues no-guard on re-publication practice, "changes nothing that is not already an `Err`", and divergence from shipped behaviour; alternative E restated (§11); Q3 is "answered in part" (§12).                                                                                                                                                                                                                                                                                                        |
| **D3** — do not attribute "absence may be an answer" to E12                                                                                                                            | **APPLIED**                                                                        | E12 is cited only for the shape ambiguity (object vs listing) and the `No encontrado` literal (§3.1, §5.6); the parenthetical is deleted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **D4** — split "meanings unchanged" from "evidence changed"; document the delegation asymmetry                                                                                         | **APPLIED, and reduced in scope** — under Option A the _evidence_ is unchanged too | §5.2 (side-by-side table: service, rule, timing, delete position all identical), §5.5 (the only new surfaces: a rejection can answer `true`, and the flag additionally needs emitter delegation, E11 vs E14), §7.3 (the widened `Err` meaning, stated rather than denied), Q4. `126-tasklist.md` I2/I3 and Decision 4 are satisfied, not amended.                                                                                                                                                                                                                                                          |
| **D5** — the cheaper hybrid was missing, and it is the alternative that avoids D1                                                                                                      | **APPLIED**                                                                        | §11 alternative **A = ADOPTED**, with four reasons and its costs stated; the root-element switch is recorded as **B = SUPERSEDED**. §2.3 and §10.1 publish the resulting cost profile.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **D6** — replace "the answer that cannot hurt"; make the multi-track discriminator contractual                                                                                         | **APPLIED**                                                                        | §5.4 states the withholding as a cost ("it hurts by withholding an answer") with its three mitigations; §9.2 makes the discriminator contractual (`delivered` + `inquiry.estado == 'Rechazado'` + `false`, plus the public `trackStatuses` route); Q8 kept, with the reason the field is deferred to F-126-6.                                                                                                                                                                                                                                                                                              |
| **D7** — align `SummaryTrackingStatusResponse` nullability                                                                                                                             | **APPLIED (partially, explicitly)**                                                | P5 (`trackId?: string` in TS), P6 (`estado` required **and validated** in both, with the TS runtime guard producing Python's identical `Err(VALIDATION)`), P7 + F-126-4 (`fechaRecepcion` read nowhere, explicitly out of scope). §13 carries the parity line.                                                                                                                                                                                                                                                                                                                                             |
| **D8** — E10 is overstated as "the whole basis"                                                                                                                                        | **APPLIED**                                                                        | E10 corrected in §3.1; §5.4 labels the aggregation rule an inference; Q1 repeats the label.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **D9** — two wrong `codSeguridad` cost claims; the real argument is missing                                                                                                            | **APPLIED**                                                                        | §4.3 replaces them with E4's success-path-only flag, E5's undefined semantics, and E4's different reuse target (E4 wording corrected in §3.1); alternative L restated (§11); Q2's "what would settle it" carries the reuse-target limit.                                                                                                                                                                                                                                                                                                                                                                   |

### 16.2 T3 reliability — B1, B2, B3

| Item                                                                     | Status                                                          | Proof                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B1** — an absent payload clears the fiscal lock                        | **APPLIED**                                                     | §2.4 + §7.1 (a non-answer may only fail to assert a capability), §5.2 (the listing cannot clear), §5.6 (classification table: `null`/absent → `Err(VALIDATION)`; only a positive `No encontrado` from `consultaestado` clears), §8.3 (T-A, T-B, T-C, T-E, T-F, T-G, one per suite; T-A/T-B are observed failing first in TypeScript only, Python runs them as regression guards — §8.3), P8 (`trackStatuses` stops mapping "no answer" to "no records"), §12 Q5. |
| **B1 (trimming)** — the existence test is raw equality                   | **APPLIED**                                                     | §5.1 first bullet and §5 step 5 (`==`, no trim); §6 rule 4 confines trimming to the `Rechazado` gate; §13 checklist line "raw … no trimming".                                                                                                                                                                                                                                                                                                                    |
| **B2** — the predicate must be total                                     | **APPLIED**                                                     | §6 shows both implementations with the `''`/`""` default, rule 3 states the requirement, and test T-K (§8.3) asserts "flag present + `estado` absent → `Ok`, `false`, no exception".                                                                                                                                                                                                                                                                             |
| **B3** — `delivered`/`cleared` re-derived without the required re-freeze | **APPLIED — by adopting Option A**, i.e. no re-freeze is needed | §2.2, §5.2 (nothing about existence moves), §4.1 (three reasons not to move it), §16.4. `126-tasklist.md` I2/I3 and Decision 4 / R9 / A5 stand **unamended**; attempt 1's contradiction with Decision 4 is gone. F3d (double-negative clearing) is moot by construction and is recorded as such in §16.3.                                                                                                                                                        |

### 16.3 T3 — the eight suggestions

| Item                                                               | Status                                          | Proof                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S1** — no false claims about emitted error codes                 | **APPLIED**                                     | §7.4: `CIRCUIT_OPEN`/`TIMEOUT` are not emitted; a breaker-open is `UNKNOWN` (TS); T8 must not document them. E21 added.                                                                                                                                                                                                                        |
| **S2** — breaker/bulkhead claims incomplete                        | **APPLIED**                                     | §10.5: per-reconcile event bound, the one new `Ok`→`Err` cell named, shared breaker/bulkhead with submissions, reconcile-worker recommendation, F-126-2.                                                                                                                                                                                       |
| **S3** — Python retries the breaker-open error                     | **APPLIED (documented) / ADOPTED AS FOLLOW-UP** | §7.4 + §10.5 state it (measured, E21); fix is F-126-1 because the retry predicate is frozen.                                                                                                                                                                                                                                                   |
| **S4** — the cost model is wrong for TypeScript                    | **APPLIED**                                     | §10.2 measured (4 vs 3 attempts), §10.3 per package (≈61 s / ≈45 s; ≈182 s / ≈135 s); F-126-8 records the pre-existing divergence.                                                                                                                                                                                                             |
| **S5** — a rejected-but-reusable document keeps its marker forever | **APPLIED**                                     | §2.3 second bullet and §9.3 item 2: `canReuseSequence: true` with `cleared: false` means re-sign, do not re-send; T8/T9 must document it.                                                                                                                                                                                                      |
| **S6** — a throwing `delete` escapes as an exception               | **APPLIED (documented) / ADOPTED AS FOLLOW-UP** | §8.4 states it as the one destructive non-`Result` failure and forbids "simplifying" it; fix is F-126-3.                                                                                                                                                                                                                                       |
| **S7** — an option to skip the flag chain                          | **REJECTED, recorded as F-126-11**              | The gate already reduces the need: every non-rejected document costs 1 call, so only rejections pay for the flag. A public option would violate Decision 2 / the scope guard. Its motivation survives in one case — a receiver-delegated token (§5.5, Q4) — so it is F-126-11, to be decided with an operator's data rather than invented now. |
| **S8** — store scoping (no environment in the idempotency key)     | **APPLIED (documented) / ADOPTED AS FOLLOW-UP** | §9.3 item 4 (one store / namespace per environment, T8); key derivation frozen (P9); F-126-5.                                                                                                                                                                                                                                                  |

### 16.4 T3 — re-entry criteria for attempt 2

| #   | Criterion                                                                                                                                                                                          | Status                                                                                                                | Proof                                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `null`/absent/empty body → `Err(VALIDATION)`; only a positive `No encontrado` may clear; the mandatory tests are named in §13, both packages, empty-body observed failing first in TypeScript only | **APPLIED for `null`/absent; `[]` deliberately `Ok(false)` — see §5.6, safe because the listing cannot clear (§5.2)** | §5.6 (classification: `null`/absent → `Err(VALIDATION)` and it propagates, §7.1), §5.2 (the listing cannot clear), §8.3 T-A…T-G (T-A/T-B failing-first in TypeScript only; Python runs them as regression guards — §8.3), §13 checklist                                                             |
| 2   | Existence test is raw equality; "trimmed" survives only inside the `Rechazado` gate                                                                                                                | **APPLIED**                                                                                                           | §5.1, §5 step 5, §6 rule 4, §13                                                                                                                                                                                                                                                                     |
| 3   | §6 shows the total predicate and a missing-`estado` test per suite                                                                                                                                 | **APPLIED**                                                                                                           | §6 code + rule 3; §8.3 T-K                                                                                                                                                                                                                                                                          |
| 4   | B3: Option A (keep `inquiryStatus` for `delivered`/`cleared`, flag chain after the decision)                                                                                                       | **APPLIED — this is the adopted decision**                                                                            | §2, §5, §5.2, §16.2 B3; no ledger amendment required. A failed flag read is an `Err` with the marker untouched (§7.1), and the single new `Ok`→`Err` cell is named in §10.5                                                                                                                         |
| 5   | F6a/F6b: the measured per-package budget and the caller-lease obligation                                                                                                                           | **APPLIED**                                                                                                           | §10.2 (4 attempts TS / 3 PY), §10.3 (≈61 s / ≈182 s TS; ≈45 s / ≈135 s PY), §10.4 (lease > worst case or lease-renewing/leader-elected; no nested retry loop; T8 + both locales)                                                                                                                    |
| 6   | F7: the `tracks` field or a `reuseReason` is in the public-surface table so C2 vs C3 is visible                                                                                                    | **APPLIED as a decision, ADOPTED AS FOLLOW-UP as a field**                                                            | §9 P11 + §9.2 (the six-cause taxonomy, what is observable now, and the exact shape of the field); F-126-6. Rationale: Decision 2 / the scope guard forbid a new result field without owner sign-off, and under Option A the caller keeps `inquiry` plus the public `trackStatuses`/`statusTrackId`. |
| 7   | S1/S2/S4 wording landed (no false claims about error codes, breaker behaviour, attempt counts)                                                                                                     | **APPLIED**                                                                                                           | §7.4, §10.2, §10.5                                                                                                                                                                                                                                                                                  |
| 8   | Every remaining suggestion (S3, S5, S6, S8, S7 if rejected) is a named follow-up                                                                                                                   | **APPLIED**                                                                                                           | §15 F-126-1…F-126-11; S5 documented in §2.3/§9.3, S7 rejected with reason in §16.3 and carried as F-126-11                                                                                                                                                                                          |

### 16.5 Additional records the validators asked for

| Item                                                                                           | Status                      | Proof                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F3d** — clear only on two independent negatives (extra `inquiryStatus` on the clearing path) | **MOOT by construction**    | §5.2: the clearing decision is made by `consultaestado` alone, the listing never participates, and no read occurs between that decision and the delete (§8.1). Adopting F3d would add a call to the clearing path to double-check a source that is already the only source.         |
| **Degrade the flag read to `false`** (considered in this revision, not in attempt 1's table)   | **REJECTED**                | §7.2: it reproduces #126's symptom (a `false` indistinguishable from DGII's answer) and erases the `error.resource` discriminator that already exists (TypeScript only — F-126-12). Alternative I in §11 covers both degrade variants.                                              |
| **`Err` contract widening** (attempt 1's S9 item, now caused by the flag read)                 | **DOCUMENTED, not removed** | §7.3 states the widened meaning, the `Ok`/`Err` discriminator, the TypeScript-only `error.resource` (F-126-12), and the exact T8 sentences. Unlike attempt 1, the widened meaning is confined to _rejected_ documents and never hides an existence answer that was already decided. |
| **Attempt 1's S2/S3 (`inquiry` nullable, new `track` field)**                                  | **WITHDRAWN**               | §9 P1: `inquiry` is populated on every path under Option A, so the nullability change has no cause and the extra field is not needed for information parity.                                                                                                                        |

### 16.6 C-1 freeze line

`project-tasks/126-contract-design.md` (this file) is the frozen C-1 contract **only when both validators record
PASS**. Both do: **PASS** in `project-tasks/126-evidence/t3-reliability-contract-design-attempt2.md` and
**PASS** in `project-tasks/126-evidence/t2-refuter-contract-design-attempt2.md`, and the errata those two notes
made conditions of the freeze (E-1…E-7 from T3, R1…R9 from T2) were applied to this file in a bounded errata
pass that re-opened no decision. The T6 parity review (attempt 3, PASS) then amended the frozen zone a second
time — §8.3 (T-L/T-M failing-first scope) and §13 (parity claim scoped to DGII-answered failures), plus the
§6 Python reference snippet, §8.3's "in either package" wording and the two §15 rows F-126-14/F-126-15 — again
without re-opening any decision; the T6 residuals (RES-1…RES-6) are closed by these amendments and by the
`architecture.md` §14.1 registration rows. It is the attempt-2 text; it supersedes the attempt-1 text in
place, and it deliberately conforms to `126-tasklist.md` Decision 4 and I2/I3 rather than amending them —
which is why no ledger edit accompanies it.

Zone of the freeze: §2 (decision), §5 (chain and order), §5.6 (classification), §6 (predicate), §7.1
(disposition), §8 (ordering and mandatory tests), §9 (public surface), §10.2–§10.4 (budget and lease),
§13 (parity). Everything else is supporting reasoning. Inside that zone the errata corrected facts only —
E-2/E-3/R4 (§10.3, §10.4, §10.5), E-4 (§8.3), E-6/E-7/R5 (§5.6), E-1/R9 (§7.3, §8.2, §9.2, §13), R1/R2 (§6, §9 P2),
R3 (§2.1, §5.2), R6 (§5.4), R8 (§16.4 #1) — and reopened no decision.
