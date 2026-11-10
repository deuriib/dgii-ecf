# T2 — Refuter review of `126-contract-design.md` (attempt 1 of 3)

**Verdict: FAIL.**

The design's central routing decision — take the reuse flag from `consultaresultado`, reached through
`consultatrackids`, for a general `<ECF>` — is correct and DGII-documented. E1, E2, E3, E6, E8, E10, E11,
E12, E13, E14, E15, E17 and E18 all re-derive as written; I could not falsify them.

It still fails, on one decision and one premise:

- **D1 (blocking).** `reconcileSubmission` deletes the fiscal lock when `consultatrackids` returns **no
  entries** (`null`, `undefined`, `[]`). DGII documents exactly one negative statement — a
  `No encontrado` **entry** ("implica que no se encontró el e-CF en los registros", TEC-02 p. 31) — and
  documents nothing about an empty payload. The design turns silence into negative evidence in the one
  direction that can re-send a fiscal document, and contradicts its own §7 and the shipped
  `docs/en/guides/flow.md` sentence ("The marker is cleared only when DGII reports `No encontrado`") while
  claiming (S9) that it makes those sentences _true_.
- **D2 (blocking, reasoning).** §4.1 and rejected-alternative G rest on _"DGII's silence about a
  certification URL (E8/E9) is not a statement that the service is absent"_. E8 itself quotes DGII saying the
  opposite, in the same sentence: the certification URLs were withdrawn **"conforme a que en el mismo aún no
  se encuentran disponibles para el público"**. The decision (no environment guard) survives on parity
  grounds; the premise it is argued from does not, and it is presented as DGII-derived.

Both are fixable inside the design without reopening the routing decision. §6 lists the minimum.

---

## 0. Provenance of this review (own fetch, not inherited)

```text
URL   https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/
      Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/
      Descripcion%20Tecnica%20Servicios%20DGII.pdf
UA    Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36
HTTP  200, 2 451 054 bytes, 47 pages, 53 411 extractable characters
sha   85a601ffe4af67ad2220e52d669bc673fc8affe02feb464bf04dabd4fe2f67ce
tool  uv run --with pypdf python -c "PdfReader(...).pages[i].extract_text()"
```

Printed page numbers in the PDF match the extraction index (page 26 prints "26"), so every page citation
below is the design's own numbering. The snapshot is the same one TEC-02 in
`project-tasks/124-source-register.md` records (bitácora head `Actualizaciones al 02-01-2026`), so the
register's ⚠ notes and this review read the same document.

Code read for E16–E18 and for the "what it replaces" claims:
`packages/typescript/src/{client,reconciliation,types,environment,resilience,errors,reception,xml,utils}.ts`,
`packages/python/src/py_dgii_ecf/{client,reconciliation,types,_xml,utils}.py`,
`project-docs/architecture.md` §9.3, `project-specs/dgii-ecf-setup.md` A.9,
`docs/en/guides/{flow,resilience}.md`.

---

## 1. Per-evidence-row verification (E1–E18)

Legend: **CONFIRMED** = quote re-derived verbatim from the PDF; **CONFIRMED, imprecise** = substance holds,
wording overstates; **MIS-STATED** = the row's claim is not what the source says; **LABELLED** =
correctly marked as an SDK claim, not a DGII claim.

| #   | Design's claim                                                                                                                                                                                                             | Re-derivation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Verdict                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| E1  | `consultaestado` carries no `secuenciaUtilizada`; its 11 published elements are `codigo, estado, rncEmisor, ncfElectronico, montoTotal, totalITBIS, fechaEmision, fechaFirma, rncComprador, codigoSeguridad, idExtranjero` | pp. 27–28. JSON sample (pp. 27–28) and XML `<RespuestaConsultaEstado>` (p. 28) close after `idExtranjero`; _DESCRIPCIÓN PARÁMETROS DE SALIDA_ (p. 28) lists exactly those eleven. Count and spelling match, including `RncEmisor`/`RncComprador` casing in the prose vs `rncEmisor` in the samples. No reuse field anywhere in the section (pp. 26–29).                                                                                                                                                                                                                                                                            | **CONFIRMED**                     |
| E2  | `consultaresultado` publishes the flag per track, with semantics                                                                                                                                                           | p. 22 service + three URLs; p. 23 JSON `"secuenciaUtilizada": true`; p. 24 XML `<secuenciaUtilizada>true</secuenciaUtilizada>`; pp. 24–25 _DESCRIPCIÓN PARÁMETROS DE SALIDA_: "secuenciaUtilizada permite dar a conocer si el número de secuencia que fue recibido por Impuestos Internos puede reutilizarse en otro Comprobante Fiscal Electrónico (e-CF) en el escenario de que el resultado de la validación haya sido “Rechazado” por los siguientes motivos:", then the 8 reasons, then (p. 25) "True = No puede reutilizarse la secuencia." / "False = Puede reutilizarse la secuencia." Eight reasons confirmed one by one. | **CONFIRMED**                     |
| E3  | The flag exists on that service _in order to_ answer the reuse question                                                                                                                                                    | p. 4, _Actualizaciones al 18-04-2022_, item 1: "Se incluyeron dos parámetros a la respuesta del servicio de Consulta Resultado para retroalimentar cuando el número del comprobante fiscal electrónico (eNCF) puede ser reutilizado." (Cited p. 4 correctly.)                                                                                                                                                                                                                                                                                                                                                                      | **CONFIRMED**                     |
| E4  | The RFCE reception response publishes the same flag, same meaning, same rejection list                                                                                                                                     | p. 15 service; p. 17 JSON `"secuenciaUtilizada": true`; p. 18 XML + meaning paragraph; p. 19 "True = No puede reutilizarse la secuencia." The 8 reasons are word-for-word the p. 24 list. **One imprecision:** the RFCE paragraph scopes reuse to _"otro **Resumen de Factura de Consumo**"_, where p. 24 scopes it to _"otro **Comprobante Fiscal Electrónico (e-CF)**"_. Same flag, same triggers, **different reuse target**.                                                                                                                                                                                                   | **CONFIRMED, imprecise**          |
| E5  | `consultarfce` publishes the flag, keyed by RNC + e-NCF + security code; its own parameter list does not define it                                                                                                         | pp. 19–21. Three URLs p. 20; `/api/Consultas/Consulta`; inputs `RncEmisor* ENCF* CodigoSeguridad*` (p. 20); JSON p. 21 contains `"secuenciaUtilizada": true`; _DESCRIPCIÓN PARÁMETROS DE SALIDA_ (p. 21) documents only `Código, Estado, RncEmisor, NcfElectronico, codigoSeguridad` — the flag is absent from the definitions, exactly as the row says.                                                                                                                                                                                                                                                                           | **CONFIRMED**                     |
| E6  | `consultarfce` is available in **all three** environments; changed recently                                                                                                                                                | p. 20 URL block lists TesteCF, CerteCF, eCF. p. 3, _Actualizaciones al 02-01-2026_ item 2: "Se agrega la disponibilidad del servicio ConsultaRFCE en el ambiente de certificación y precertificación." Both halves hold.                                                                                                                                                                                                                                                                                                                                                                                                           | **CONFIRMED**                     |
| E7  | `consultaresultado` in all three environments; one required input `TrackId*`                                                                                                                                               | p. 22 URL block (TesteCF, CerteCF, eCF); p. 23 "Parámetros de entrada / TrackId*". Also p. 22 scope sentence: "el e-CF tentativo enviado **exclusivamente mediante el servicio web de recepción de e-CF**" — supports routing by root element.                                                                                                                                                                                                                                                                                                                                                                                     | **CONFIRMED**                     |
| E8  | `consultatrackids` published for TesteCF and eCF only, and _"a missing URL is not proof the service is absent"_                                                                                                            | URL block p. 30: two entries only. **But** p. 4, _Actualizaciones al 28-12-2020_ item 2 says why: "Se quitaron las URL del servicio de anulación rangos, consulta estado, consulta trackids y consulta directorio para el ambiente de certificación **conforme a que en el mismo aún no se encuentran disponibles para el público**." DGII stated unavailability; it is not silence. The "never re-added" half is correct — the only later re-adds in the bitácora are consultaRFCE (02-01-2026, item 2) and ConsultaTimbreFC (item 3).                                                                                            | **MIS-STATED** (see D2)           |
| E9  | `consultaestado` published for TesteCF and eCF only                                                                                                                                                                        | p. 26 URL block: two entries. Same bitácora history as E8 (same sentence).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | **CONFIRMED** (same caveat as E8) |
| E10 | Several trackIds for one e-NCF means the **same e-NCF was submitted more than once**                                                                                                                                       | p. 29, verbatim: "Se pueden obtener múltiples TrackIds cuando se remiten varios e-CF con el mismo número de comprobante fiscal (e-NCF) asociados al mismo RNC."                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | **CONFIRMED**                     |
| E11 | `consultatrackids` requires delegation **for the emitter**                                                                                                                                                                 | p. 29: "se requiere que el usuario autenticado se encuentre delegado para el emisor, de lo contrario, no podrá obtener los datos." p. 30 VALIDACIONES: "El RNC del token no está autorizado a consultar el trackid de este e-NCF, favor verificar que se encuentre delegado por el emisor y volver a intentarlo." This is a **VALIDACIONES** entry — a documented error, not an empty result. Relevant to D1/D4.                                                                                                                                                                                                                   | **CONFIRMED**                     |
| E12 | Listing item shape `{trackId, estado, fechaRecepcion}`; `No encontrado` one of its states; JSON sample is a single object while the prose says _listado_                                                                   | p. 29 prose "retornar un listado de respuestas (Trackids)"; p. 30 JSON object; p. 31 XML `<TrackingDetalle>`; p. 31 _ESTADOS SALIDA_: `No encontrado`, `Aceptado`, `Rechazado`, `Aceptado Condicional`, `En proceso`. The single-object-vs-listing discrepancy is real and correctly reported. **What E12 does _not_ say: anything about an empty list or a `null` payload.**                                                                                                                                                                                                                                                      | **CONFIRMED** (but see D3)        |
| E13 | `consultaestado` can also see documents submitted through the RFCE reception                                                                                                                                               | p. 26: "A través de este servicio también pueden ser consultados los e-CF remitidos por el servicio de recepción de resumen factura de consumo inferiores a los RD$250,000.00."                                                                                                                                                                                                                                                                                                                                                                                                                                                    | **CONFIRMED**                     |
| E14 | `consultaestado` requires delegation for the emitter **or** the receiver                                                                                                                                                   | p. 26: "se requiere que el usuario autenticado se encuentre delegado para el emisor o para el receptor". Weaker than E11, as the design says.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | **CONFIRMED**                     |
| E15 | `consultaresultado` codes 0/1/2/3/4                                                                                                                                                                                        | p. 25 _ESTADOS SALIDA_: `No encontrado (0)`, `Aceptado (1)`, `Rechazado (2)`, `En Proceso (3)`, `Aceptado Condicional (4)`. Also useful and uncited: "No encontrado (0): implica que no se encontró **el trackid** en los registros" — the verdict's absence is about the _trackId_, not the e-NCF. Stronger support for §5.1 than anything the design cites.                                                                                                                                                                                                                                                                      | **CONFIRMED**                     |
| E16 | SDK: `getSummaryInvoiceInquiry` gated to production; **not a DGII claim**                                                                                                                                                  | TS `client.ts` returns `VALIDATION` unless `environment === Environment.Prod`; Python `_production_guard`; `project-specs/dgii-ecf-setup.md` A.9 "PROD only". Correctly labelled as an SDK decision and correctly noted as contradicted by the 02-01-2026 bitácora.                                                                                                                                                                                                                                                                                                                                                                | **CONFIRMED, LABELLED**           |
| E17 | Marker written before transmit, cleared only when DGII reports no record; query methods not keyed                                                                                                                          | TS `submitIdempotent` (`client.ts` 181–204) and Python `_submit_idempotent` (`client.py` 264–292) both write `PENDING` first and both **delete on send failure** (so a pending marker survives only an interrupted process). `reconcileSubmission` / `reconcile_submission` and `trackStatuses` are unkeyed. `architecture.md` §9.3 says "clears it only when DGII has no record of the document".                                                                                                                                                                                                                                 | **CONFIRMED**                     |
| E18 | Retry = network/transport + 408/429/5xx; breaker 5 consecutive; 15 s per attempt; 3 attempts; retry **outside** breaker                                                                                                    | `resilience.ts` 33–41 (`maxRetries: 3, breakerThreshold: 5, timeoutMs: 15_000`), `wrap(retryPolicy, breakerPolicy, timeoutPolicy, bulkheadPolicy)` (81–109) → retry outermost, confirmed; `errors.ts` 15 `RETRYABLE_STATUSES = {408,429,500,502,503,504}`. Python `resilience.py` identical. One naming slip: `maxRetries: 3` is passed as `maxAttempts`, so it is 3 **attempts**, not 3 retries — E18 says "3 attempts", §10 says "maxRetries (3)"; same quantity, two names.                                                                                                                                                     | **CONFIRMED**                     |

**Every decision-bearing row except E8's interpretation re-derives cleanly.** The three the brief singled out
hold: (a) `consultaestado` has no `secuenciaUtilizada`; (b) `consultaresultado` does, with the quoted
semantics; (c) `consultatrackids` has no certification URL **and** `consultarfce` now has all three. The
matrix in §4 is therefore built on correct evidence — the failure is in what the design adds on top of it.

---

## 2. Findings

### D1 — BLOCKING: an empty/absent `consultatrackids` payload deletes the fiscal lock on evidence DGII never gave

**Exact quote (design, §5 step 5 and step 6a):**

```
 5. [PURE]  normalise and classify:
              - payload null/undefined            -> []          (E12: the service may say "nothing" either way)
              - payload single JSON object        -> [payload]
              - payload array                     -> payload as-is
              - anything else                     -> return Err(VALIDATION, 'Unexpected DGII response payload')
 6. [PURE]/[READ 2]
            (a) usable is empty:
                  delivered=false, cleared=true, canReuseSequence=false, track=null, inquiry=null
```

and §12 Q5: _"Handle all three as 'no record' (§5 step 5) … **Conservative answer shipped in #126**"_.

**What the source supports.** Exactly one negative statement about `consultatrackids`, p. 31: "**No
encontrado**: implica que no se encontró el e-CF en los registros." That is a _state of a returned entry_.
There is no published response shape for "the service found nothing at all": the sample is one object
(p. 30), the prose says _listado_ (p. 29), and neither says what zero results looks like. The nearest
documented behaviour for a rejected query is an error, not an empty result — p. 30 VALIDACIONES: "El RNC del
token no está autorizado a consultar el trackid de este e-NCF…". So DGII's text carries "an entry with
`No encontrado` means no record"; it does **not** carry "no entries means no record".

**Why this is fiscal, not stylistic.**

1. It reverses today's behaviour in exactly one cell. Today `delivered = inquiry.estado !== 'No encontrado'`
   (`client.ts` 395, `client.py` 519): a payload with a missing/blank `estado` is `undefined !== 'No encontrado'`
   → **`delivered: true`, marker kept**. The design makes the same class of payload → `delivered: false`,
   **marker deleted**. Silence used to keep the lock; the design makes silence break it.
2. It contradicts the shipped contract it says it preserves. `docs/en/guides/flow.md` §7: _"The marker is
   cleared only when DGII reports `No encontrado`."_ S9 claims the design makes the guides' existing
   sentences _true_; under step 6(a) that sentence becomes false for `null`, `undefined` and `[]`.
3. It contradicts the design's own §7, in the same document: _"TypeScript must add the equivalent guard,
   otherwise a garbage payload would read as 'zero tracks' and **clear the marker**, which is the one
   divergence in this design that could double-issue."_ The guard §7 demands covers only non-object,
   non-array (Python `_parse_list` behaviour). `null` is the most likely malformed shape of a 200 with an
   empty body, and step 5 routes it straight into the double-issue path §7 forbids. §5 and §7 cannot both ship.
4. It is labelled, but mislabelled. Q5 files it as "conservative". It is the permissive direction — the
   design's own rule 4 (§6) rejects case folding precisely because _"an unrecognised state would become 'no
   record' and clear the lock"_. Step 5 does by omission what rule 4 forbids by transformation.
5. The silence is not safe by assumption. DGII publishes no freshness guarantee for the trackids index (the
   only latency note in the document is about validation: "El promedio estimado de validación es de 200 ms",
   pp. 25 and 31), and reconcile is called minutes after a lost response — the window where an index lag is
   least excluded. A `[]` during that window re-opens the double-issue path the marker exists to close.

**Fix instruction.** Split step 5 into a positive and a non-positive case, and never let non-positive evidence
delete the marker:

- `usable` = entries whose trimmed `estado` ≠ `'No encontrado'` (keep).
- `noRecord` = **`usable` is empty AND at least one entry was returned AND every returned entry's trimmed
  `estado` === `'No encontrado'`** → `delivered: false, cleared: true`. This is the only clearing path, and it
  satisfies `flow.md` verbatim.
- Payload `null`/`undefined`/empty array → `Err(VALIDATION, 'Unexpected DGII response payload')`, marker
  untouched. Rationale in the design's own words (§7): _"A visible Err is honest; a plausible-looking `false`
  is not."_
- State the operational consequence in the contract doc (T8): in this undocumented case the caller gets
  `Err`, the marker stays, and a human decides — a blocked retry is preferable to a duplicate e-NCF. Record
  why `[]` was **not** treated as a negative answer (no DGII statement; asymmetric risk).
- Delete the parenthetical `(E12: the service may say "nothing" either way)`: E12 does not say that (D3).
- If the team insists on the empty-list answer, it must be argued from something other than DGII's documents
  and recorded as an accepted fiscal risk with a named reviewer — the current text does neither.

### D2 — BLOCKING (reasoning): the no-environment-guard decision is argued from a premise the cited row contradicts

**Exact quote (design, §4 consequence 1 and rejected alternative G):** _"DGII's silence about a certification
URL (E8/E9) is not a statement that the service is absent, and the SDK does not get to invent a hard refusal
from a documentation gap."_

**What the source says (p. 4, bitácora 28-12-2020, item 2 — the line E8 cites for the withdrawal):** "Se
quitaron las URL del servicio de anulación rangos, consulta estado, consulta trackids y consulta directorio
para el ambiente de certificación **conforme a que en el mismo aún no se encuentran disponibles para el
público**." DGII did not merely omit a URL; it stated the services were _not available_ in certification.
That is a documented negative, not a documentation gap. The design builds a load-bearing argument on the
opposite characterisation and repeats it in Q3 ("E8/E9 publish no URL") and in the §4 CerteCF cell
("Not established").

**What still holds.** The _decision_ is defensible on different grounds, and the design should use them:

- Today's shipped path already calls `consultaestado` in `CerteCF`, which is documented equally unavailable
  (p. 26 two URLs; p. 4 same sentence). Attempting `consultatrackids` there is **not a regression** — this is
  a parity argument, and it is true.
- A hard refusal would be new public behaviour invented by the SDK. Also true.
- The failure is safe: an unavailable service yields an HTTP error → `Err` → marker intact.

**Fix instruction.** Rewrite §4 consequence 1 and G:

> E8/E9 show that DGII withdrew both certification URLs in Dec 2020 and stated they were not available to the
> public at that time, and no later revision re-published them (the only later re-adds are consultaRFCE,
> 02-01-2026 item 2, and ConsultaTimbreFC, item 3). The SDK therefore has no documented existence check in
> `CerteCF`, for any root element, before or after #126. We add no guard because (a) a guard would encode a
> 2020 statement as a permanent product rule, (b) it would change nothing that is not already an `Err`, and
> (c) it would diverge from the shipped `consultaestado` behaviour. Consequence for T8: reconcile is not
> usable in `CerteCF`, today or after this change, and that is DGII's stated position, not an SDK defect.

Then mark Q3 as **answered in part** rather than open, and correct the §4 CerteCF cell to "DGII states both
services are not available to the public in certification (bitácora 28-12-2020, item 2); unverified since".

### D3 — Step 5 attributes to E12 a claim E12 does not contain

**Exact quote:** `- payload null/undefined -> [] (E12: the service may say "nothing" either way)`.

**What the source supports (E12 re-derived):** p. 29 prose says _listado_; p. 30 publishes a single JSON
object; p. 31 lists five states including `No encontrado`. E12's ambiguity is **shape** (object vs array),
not **content** (entries vs nothing). A citation that converts a shape ambiguity into permission for treating
absence as a DGII answer is how a gap becomes a documented rule. Smallest text, largest blast radius.

**Fix instruction.** Delete the parenthetical. Cite E12 only for normalisation (object → one-element list) and
for the `No encontrado` literal; handle the empty case per D1.

### D4 — The `delivered` source change silently relaxes the one guarantee the issue said not to touch

**Exact quotes.** Design S8: _"`PENDING_SUBMISSION_MESSAGE`, error codes, retry predicate, idempotency key
derivation, **`delivered`/`cleared` field meanings** — **Unchanged**"_. Issue #126 constraint: _"Do not touch
the idempotency ordering …, the retry predicate, or `delivered`/`cleared` semantics."_ Shipped contract
(`docs/en/guides/flow.md` §7): _"The marker is cleared only when DGII reports `No encontrado`."_

**What the source supports.** Nothing calls the switch itself into question: p. 29 ("retornar un listado de
respuestas (Trackids) de un número de comprobante fiscal electrónico (e-NCF) que haya sido recibido por DGII")
plus p. 31 (`No encontrado` = not in the records) is a fair basis for asking `consultatrackids` the existence
question, and it is what the register's step 7 already names. **But** "this service answers the existence
question" is not "this service is a _complete_ answer to 'does DGII hold this e-NCF'". Completeness — no
statement that a document DGII holds can never be absent from the listing, no cross-reception coverage, no
freshness guarantee — appears nowhere in TEC-02, and appears nowhere in §3's "what DGII's text does not
settle" list or in §12. By the design's own standard that is an unlabelled inference.

The consequences that follow from the switch, and that S8 denies:

1. `delivered` and `cleared` now have a _different evidentiary rule_ for `<ECF>` than for every other root.
   Same field name, same documented meaning, different proof; a caller cannot tell which service answered.
2. The empty-payload cell changes clearing behaviour (D1). That is the only place the switch is fiscally
   observable, and it is the place where DGII's text is thinnest.
3. Failure modes move with the service: `consultatrackids` requires **emitter** delegation (E11) while
   `consultaestado` accepts **emitter or receiver** (E14), so a receiver-delegated integrator that could
   reconcile a general e-CF yesterday gets `Err` today. §10 calls this "theoretical"; Q4 concedes it is
   unverified. Either way it is a behaviour change in a path S8 declares unchanged.

**Fix instruction.** Keep the switch (it is the only documented way to reach the flag) and split S8 into
"meanings unchanged" plus **"evidence changed"**, with a statement of what the caller can and cannot conclude:

- `delivered: true` — a DGII listing service returned at least one track whose state is not `No encontrado`.
- `delivered: false, cleared: true` — DGII returned an entry whose state is `No encontrado`.
- everything else — `Err` (D1), never a silent "not delivered".
- Record the delegation asymmetry (E11 vs E14) as a documented failure mode in T8: "was `consultaestado`
  (emitter-or-receiver delegation); now `consultatrackids` (emitter only)".

### D5 — The rejected-alternatives table omits the cheapest alternative, and it is the one that would have avoided D1

**Exact quote (§10 cost table):** _"General e-CF, exactly one usable track (the case being fixed) — **2**
(`consultatrackids` + `consultaresultado`) — +1"_.

**The missing alternative.** Keep `consultaestado` as the _delivered_ source exactly as shipped, and spend the
extra round trips only when its `estado` is `Rechazado` — the only case where the flag means anything
(p. 24: defined _"en el escenario de que el resultado de la validación haya sido 'Rechazado'"_):

| Path                                          | Hybrid  | Design  |
| --------------------------------------------- | ------- | ------- |
| general e-CF, DGII has no record              | 1 call  | 1 call  |
| general e-CF, accepted                        | 1 call  | 2 calls |
| general e-CF, rejected (the path being fixed) | 3 calls | 2 calls |

The hybrid is cheaper or equal in two of the three cells, needs **no change to `delivered`/`cleared` at all**
(so no D1, no D4, no `flow.md` rewrite), and is _more_ reachable because `consultaestado` accepts receiver
delegation (E14). Its real cost — a possible disagreement between `consultaestado`'s `estado` and
`consultaresultado`'s (Q6), and a 3-call worst case — is a discussable trade, not a straw man. The table does
not contain it: F is "degrade instead of failing", H is "source `delivered` from `consultaresultado`'s
verdict", I is "source it from the flag". None is "keep the shipped existence rule and pay only for the flag".

**Fix instruction.** Add the hybrid as alternative **O** and reject it explicitly with the reason that
actually applies (candidate: _"`consultaestado`'s `estado` is a document verdict, not a record-existence
statement; inheriting the existence rule from the shipped path because it is shipped would chain a new
capability to the weaker of the two services"_). If that answer does not convince, the hybrid wins on safety
and cost and the design should change. Either way §10 must stop presenting the 2-call chain as the obvious
optimum when a 1-call normal path exists.

### D6 — Multi-track returns a `false` that means "we did not ask", which §7 itself calls dishonest

**Exact quote (§5.2):** _"Multi-track is also itself the signature of a past double-submission; answering
`false` is the answer that cannot hurt."_ Compare §7: _"it is indistinguishable, at the call site, from DGII
answering 'not reusable', which is precisely the silent dead capability that produced this issue. A visible
`Err` is honest; a plausible-looking `false` is not."_

**What the source supports.** E10 (p. 29) says several trackIds arise when _"se remiten varios e-CF con el
mismo número"_ — i.e. from repeated submission of the same e-NCF. Multi-track is therefore not a rare corner
on this path; it is the natural signature of the failure that produces a pending marker at all (a lost
response, a retry, a duplicate attempt). Step 6(c) therefore reproduces #126's dead capability in the case
most likely to be met by the integrator who reported #126. "Cannot hurt" is true fiscally, false functionally.

**What mitigates it (and must be stated).** `trackStatuses` and `statusTrackId` are public, so a caller can run
unanimity itself; and S3 makes `track === null` with `delivered === true` the discriminator for "several / no
trackId". Today's callers do not know either fact, and Q8 refuses to expose the list.

**Fix instruction.** Keep the decision (it is the safe direction) and fix the claim:

- Replace "the answer that cannot hurt" with "the answer that cannot over-claim, at the price of remaining
  unavailable in the multi-track case — which E10 says is the signature of a repeated submission, and is
  therefore expected here".
- Make the discriminator contractual: state in T8 that `delivered === true && track === null` means "DGII
  holds the e-NCF but gave no single per-track verdict; read `trackStatuses` yourself if you need the flag",
  and add it to the `docs/*/guides/{resilience,flow}.md` reconcile paragraphs.
- Optional and cheap: `tracks: SummaryTrackingStatusResponse[]` populated whenever `usable.length > 1`
  (`[]` otherwise) — removes the guessing and makes Q8 moot.

### D7 — Parity gap on the model the new path now depends on

**Exact quote (S6):** _"`SummaryTrackingStatusResponse.estado` — Optional in TS (`estado?: string`), `str | None = None` in PY … Needed so both packages classify a payload missing `estado` identically."_

Shipped code: TS `SummaryTrackingStatusResponse { trackId: string; estado: string; fechaRecepcion: string }`
(`types.ts`), Python `estado: str` (required), `track_id: str | None`, `fecha_recepcion: str | None`
(`types.py` 244–249). So `estado` is **required in both** today and `trackId` is **required in TS, optional in
PY**. Step 6(b) explicitly guards "one without a trackId" — a state TS's type says cannot exist. S6 fixes the
field the design reads for classification and leaves the field it reads for the second call untruthful, using
the same argument that motivates S5.

**Fix instruction.** Extend S6/S7: `trackId?: string` in TS (Python already `str | None`), and align
`fechaRecepcion` nullability (TS required, PY optional) — or state explicitly that `fechaRecepcion` is read
nowhere in the reconcile path and is out of scope. Add to the §13 checklist: "`SummaryTrackingStatusResponse`
nullability identical in both packages for `estado`, `trackId`, `fechaRecepcion`."

### D8 — E10 is overstated as _"the whole basis"_ for the aggregation rule

**Exact quote (E10 row):** _"Verbatim; this sentence is the whole basis for the aggregation rule in §5."_

The sentence supports "several tracks can exist and mean repeated submission of one e-NCF". The rule "_exactly
one_ → ask; _more than one_ → do not ask" is an invention on top of it, and §5.2 and Q1 say so correctly.
Calling the invented rule's basis verbatim text invites an implementer to believe DGII blessed it.

**Fix instruction.** Replace with: _"This sentence supports the existence of several tracks and their origin;
the 'therefore never aggregate' half of §5.2 is an inference — see §5.2 and Q1."_ (The brief asked whether
the design presents the rule as DGII's: in §2 and §5.2 it does **not** — it labels the inference — but this
E10 sentence undoes the labelling and must go.)

### D9 — Two wrong cost claims about `consultarfce`, and the best argument is missing

**Exact quotes.** §4 consequence 2: _"wiring it needs a `codSeguridad` derivation inside the reconcile path"_.
Alternative J: _"Needs `codSeguridad` derivation (E5 documents a six-digit code derived from the `SignatureValue`
hash …)"_.

**The code contradicts both.** Both packages already export the derivation as a pure helper over the signed
XML: TS `getCodeSixDigitfromSignature(signedXml)` (`utils.ts` 8–13), Python
`get_code_six_digit_from_signature(signed_xml)` (`utils.py` 19–20) — used today by
`convertECF32ToRFCE` / `convert_ecf32_to_rfce`. One call, not a sub-project. The genuine blockers are E5's
undefined flag semantics on `consultarfce` (verified: p. 21 defines five outputs, not the flag), the A.9
guard (E16), and the fact that a mis-derived code returns `No encontrado` (p. 21), which would clear a lock if
`delivered` were sourced from it.

**The stronger argument the design never makes.** For an RFCE the flag _is_ published in DGII's own
acknowledgement of the submission (E4, pp. 17–18) and the SDK stores that response on success
(`submitIdempotent` step 5) — but a _pending_ marker, by construction, has no stored response, so reconcile
cannot read it. That is the real reason the RFCE flag is unreachable where it matters, and it is a much
better justification than a helper that already exists.

**Fix instruction.** Correct both cost claims; replace them with E4 + the pending-marker argument and E5's
semantics gap. Keep the outcome (RFCE → `false`, no `consultarfce` in #126) — the scoping decision is honest;
the reasoning offered for it is not. Also carry E4's scope difference (reuse _into another Resumen de Factura_,
not into another e-CF) into Q2's "what would settle it" column, so a future RFCE wiring that copies the
`consultaresultado` sentence does not over-claim.

---

## 3. How the six challenges answer out

| #   | Challenge                                                                                                                         | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Re-verify E1–E18                                                                                                                  | All rows re-derive from the PDF as written, **except** E8's interpretation (D2), E4's "same meaning" (scope differs, low), and E12's use in step 5 (D3). The three decisive rows are correct: no flag on `consultaestado`; flag on `consultaresultado` with the quoted semantics; no certification URL for `consultatrackids`, three for `consultarfce`. **The matrix does not need to change; the clearing rule and one premise do.**                                                                                                                                                                                             |
| 2   | Is "exactly one" DGII-derived or invented?                                                                                        | Invented — and the design says so (§5.2, Q1), so it is not mislabelled in the decision text. It _is_ mislabelled in E10 ("whole basis"). DGII says nothing about aggregating per-track flags; p. 24 defines the flag only for a single rejected result. Keep the rule; fix E10 and D6's "cannot hurt" claim.                                                                                                                                                                                                                                                                                                                       |
| 3   | Is `consultatrackids` a complete answer to "does DGII hold this e-NCF"? Is clearing without a positive `No encontrado` ever safe? | DGII documents the service as returning trackIds "de un e-NCF que haya sido recibido por DGII" (p. 29) and `No encontrado` as "no se encontró el e-CF en los registros" (p. 31) — so it _is_ documented as the existence service. **Completeness is not documented** and is not flagged as an inference anywhere (D4). Clearing **without a positive `No encontrado` entry is not safe**, and the design does it whenever the payload is empty/absent (D1). **In `CerteCF`, where neither existence service is published, the code must keep the marker**: attempt → `Err` → marker intact is correct, and cheaper than any guard. |
| 4   | Non-ECF roots: honest scoping or half-fix?                                                                                        | **Honest in outcome, dishonest in cost.** Keeping `inquiryStatus` for `<RFCE>` is right: `consultaestado` is documented to see RFCE-received documents below RD$250k (E13), and `consultarfce`'s flag has no DGII-defined semantics (E5). But two stated reasons are false (`codSeguridad` derivation exists; it isn't a blocker) and the best reason (E4's flag is only on the success path, which never yields a pending marker) is missing — D9. Residual to accept knowingly: in `eCF`, an RFCE rejection still answers `false` with no path to the flag; that should be written down rather than implied.                     |
| 5   | Silent gaps                                                                                                                       | §4 — 11 gaps, 5 unlabelled, 2 mislabelled as conservative.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 6   | Cost/benefit and rejected alternatives                                                                                            | The 2-call chain is justified for the rejected case, not for the accepted/absent cases, and §11 omits the 1-call hybrid that would have avoided D1 entirely (D5). No straw man in A–N — B, C, E, F, H, I, K, L are real and correctly reasoned — but the list is incomplete, which for a "decision record, frozen for implementation" is the same defect as a straw man.                                                                                                                                                                                                                                                           |

---

## 4. Silent-gap inventory (challenge 5)

Every place the design fills a gap DGII does not fill. "Labelled?" is judged against the design's own
standard: an inference must be called an inference, not a requirement.

| #   | Gap DGII leaves                                                                                          | How the design fills it                                                       | Labelled?                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| G1  | What `consultatrackids` returns when it holds **no** record (sample is one object, prose says _listado_) | `null`/`undefined`/`[]` → "no record" → **marker deleted**                    | Open question (Q5) but **mis-labelled "conservative"** — it is the permissive direction (D1)                       |
| G2  | Whether the `consultatrackids` listing is **complete** for every e-NCF DGII holds                        | `delivered` is authoritative from it; nothing else constitutes delivery       | **Not labelled** — absent from §3's "does not settle" list and from §12 (D4)                                       |
| G3  | What the certification environment contains when no URL is published                                     | "silence … is not a statement that the service is absent"; attempt at runtime | **Mis-stated** — DGII stated unavailability in the same bitácora line (D2)                                         |
| G4  | How per-track flags aggregate (multiple tracks)                                                          | Never ask; answer `false`                                                     | Labelled (§5.2, Q1) — but E10 calls the verbatim sentence "the whole basis" (D8)                                   |
| G5  | Whether a single entry can arrive without `trackId`                                                      | Collapse to `false`, no second call                                           | Partially: §5.2 mentions it, no inference label; TS's model says it cannot happen (D7)                             |
| G6  | Whether an unrecognised `estado` string means "usable"                                                   | Any non-`No encontrado` literal = existence                                   | Labelled as a tolerance rule (S6, §6 rule 4) — correct, safe direction                                             |
| G7  | Whether `Rechazado` is a necessary condition for `secuenciaUtilizada: false` to mean "reusable"          | Require both                                                                  | Labelled and grounded in p. 24's "en el escenario de que … 'Rechazado'" — acceptable, direction-safe               |
| G8  | Whether `consultaestado` can see `<ACECF>`/`<ANECF>`                                                     | Keeps today's call; `No encontrado` clears those markers                      | Labelled (Q9) as a latent hazard — correct and commendably explicit                                                |
| G9  | Whether the listing's `estado` ever disagrees with the verdict's for one track                           | Each authoritative in its own domain                                          | Labelled (Q6)                                                                                                      |
| G10 | Whether `encf`/`rnc` in the answer must match the query                                                  | No guard                                                                      | Labelled (Q7)                                                                                                      |
| G11 | Whether `consultaresultado` omits fiscal fields on a `No encontrado` (predicate tolerance)               | Predicate tolerates absence                                                   | Labelled (§6 rule 2); note p. 25 says "no se encontró **el trackid**", better support than the design gives itself |

---

## 5. What the design gets right (do not change these in attempt 2)

- Reading the flag from `consultaresultado` for `<ECF>` — the only documented per-document source (E2/E7;
  p. 22 restricts it to "el e-CF tentativo enviado exclusivamente mediante el servicio web de recepción de
  e-CF", which is exactly the pending-marker population).
- The predicate: `secuenciaUtilizada === false && estado.trim() === 'Rechazado'`, exact literals, no case
  folding, absence ≠ `false`. Direction-safe and DGII-grounded (pp. 24–25).
- Routing by **root element**, not by call site (mirrors `resolveReceptionRoute`; one authority).
- Failure policy: every failed read → `Err`, marker untouched, error propagated unchanged through the
  single normalizer.
- Delete-last ordering and the mandatory failing-second-call test (§8.5) — a genuinely falsifiable proof
  procedure; keep it verbatim.
- S1 (remove `secuenciaUtilizada` from `InquiryStatusResponse`) and S4 (re-type the predicate parameter): the
  original bug becomes a type error. Correct and cheap.
- Refusing to source `delivered` from the verdict (H) or from the flag's presence (I), and refusing to order
  tracks by `fechaRecepcion` parsed as a string (D). All three are real traps.
- Not adding an environment guard (decision) — only the argument for it is wrong (D2).

---

## 6. What makes attempt 2 pass

Minimum changes, in priority order. Nothing else in the document needs to move.

1. **D1** — split step 5/6: clear only on a returned `No encontrado` entry (all returned entries
   `No encontrado`); empty/absent payload → `Err(VALIDATION)`, marker kept. Delete step 5's E12 parenthetical.
   Reword Q5 so the permissive-by-omission case is not described as conservative.
2. **D2** — rewrite §4 consequence 1, alternative G and Q3 to state DGII's documented non-availability in
   `CerteCF` (bitácora 28-12-2020, item 2) and justify the no-guard decision on parity plus safety, not on
   silence.
3. **D4/D5** — split S8 into "meanings unchanged / evidence changed", add the delegation asymmetry (E11 vs
   E14) as a documented failure mode, and add alternative **O** (keep `consultaestado` for `delivered`, pay for
   the flag only on `Rechazado`) with an explicit, non-straw-man rejection — or adopt it.
4. **D6/D8** — replace "the answer that cannot hurt" with the honest cost, make `delivered && track === null`
   a contractual discriminator (or add `tracks`), and fix E10's "whole basis".
5. **D7/D9** — align `SummaryTrackingStatusResponse` nullability across packages; correct the two
   `codSeguridad` cost claims and replace them with the E4-success-path argument plus E5's semantics gap.
6. Re-run this review against the revised text: the evidence table is sound, so a second pass should be a
   targeted re-read of §4, §5, §6, §10, §11 and §12 rather than a full re-derivation.
