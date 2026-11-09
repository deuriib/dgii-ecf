# T4/T5 — DGII expert review of the English citations (attempt 1 of 3)

**Reviewer role:** domain reviewer (DGII e-CF). I wrote the frozen register; this review judges the
_writer's_ representation of it, not the register.

**Standard applied:** `project-tasks/124-source-register.md` — "Mapping to the documented integration
steps" (steps 1–10), its `⚠` notes, and "Residual risk for the writer"; plus `gh issue view 124`
acceptance items. The register is frozen (revision 3); where the tasklist and the register disagree
on a _substantive_ claim, the register wins (it withdrew the tasklist's `Decreto 587-24 Art. 17` /
`NG 01-2020 Art. 14` suggestion).

**Files reviewed**

- `docs/en/reference/dgii-official.md` (new, 179 lines, 43 document rows + 10 step rows)
- `docs/en/guides/flow.md` (8 `**Official source:**` lines — 7 numbered steps + 1 under Auxiliary flows)
- `docs/en/guides/signing.md` (+1 line)
- `docs/en/guides/resilience.md` (+3 lines)

## Verdict: **FAIL** — attempt 1 of 3

One blocking defect, and it is not a mis-cited document: **every citation line, section name, date
and URL on these pages is faithful to the register.** The failure is the new page's own
**completeness claim** about DGII's published set ("_every document that could be verified as publicly
reachable_"), which the register's own judgement calls contradict. Publishing a scope claim that a
reader can falsify in one search is the over-claimed-provenance failure mode this task exists to
prevent — see [D1](#d1-blocking--the-scope-note-claims-completeness-the-register-does-not-support).

Fix cost: **one sentence** (D1). D2/D3 are non-blocking tightenings.

## 1. Per-step coverage and attribution

Each numbered step carries exactly one `**Official source:**` line; **no step is uncited and no step
is cited twice** (verified: 8 lines in `flow.md`, one per `## N.` section, 0 duplicates; the 8th sits
under `## Auxiliary flows`, see D3).

| Step                                         | Cited document(s) and section (as published)                                                                                                                                                                                                                                              | Governs the step?                                                                                                                                                           | Section accurate vs register?                                                                                                                                                                                                                                                     | Verdict                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1. Authenticate                              | Descripción Técnica Servicios DGII — _Autenticación_ (site-updated 2026-05-29) · Semilla v.1.0 XSD — `SemillaModel` (v1.0; 2020-11-12)                                                                                                                                                    | Yes — register step 1: TEC-02 _Autenticación_, XSD-12                                                                                                                       | Yes: seed download + "posting it back signed" + one-hour token are the register's claims; the `SemillaModel` extension slot is the register's own row wording (XSD-12 has an `xs:any` slot; the page does **not** claim a DGII signed-seed schema, which is what the `⚠` forbids) | PASS                                             |
| 2. Pre-flight                                | FE Estatus Servicios API — three status operations, integer ambiente codes (v1) · Estándares de Comportamiento — §5.1 (site-updated 2026-11-06)                                                                                                                                           | Yes — register judgement call 1 (paths live only in TEC-11; §5.1 mandates the portal)                                                                                       | Yes. Omits TEC-01 §4.9, which the register allows and the reference page's step row supplies — a subset, not a contradiction. **No DGII labels on the ambiente codes** (`PreCert`/`Prod`/`Cert` appear nowhere in `docs/`)                                                        | PASS                                             |
| 3. Route by type and amount                  | Descripción Técnica Servicios DGII — _Recepción de e-CF_ (threshold) and _Recepción de resumen factura de consumo electrónica (RFCE)_ · Informe Técnico — §6.1, §9 (catalogue/threshold), §7 (13-position e-NCF + validity)                                                               | Yes — register step 3                                                                                                                                                       | Yes, and precise: §9 for the threshold, §6.1 for the catalogue, §7 for structure **and** validity (the register's corrected mapping). Does not call §6.1/TEC-05 "the only published list"                                                                                         | PASS                                             |
| 4. Sign                                      | Firmado Comprobantes Fiscales Electrónicos (e-CF) — algorithm set (2023-11-22) · Descripción Técnica Servicios Emisores Electrónicos — _Firmado de XML_: SHA-256 protocol, `SN` = holder's RNC/cédula/pasaporte, signed XML never altered (2026-05-29)                                    | Yes — register step 4 (TEC-10 + TEC-03)                                                                                                                                     | Yes. Emits no `<KeyValue>`/`<RSAKeyValue>`/`<Exponent>` prohibition, so it neither attributes one to DGII nor needs the SDK caveat (see C7)                                                                                                                                       | PASS                                             |
| 5. Submit                                    | Descripción Técnica Servicios DGII — the two reception services: endpoint, bearer auth, multipart `xml`, response shape · Descripción Técnica Servicios Emisores Electrónicos — _Nombre de los Archivos XML_: `RNCEmisor` + e-NCF, **13 characters, "as that section's own table shows"** | Yes — register step 5                                                                                                                                                       | Yes. This is exactly the `⚠` correction: the table is cited and the 11-character cURL examples are **not** copied (no 11-char e-NCF appears anywhere in `docs/en/reference` or `docs/en/guides`)                                                                                  | PASS                                             |
| 6. Track the result                          | Descripción Técnica Servicios DGII — _Consulta de resultado e-CF_: the five result codes **and `secuenciaUtilizada` in the same trackId response** (2026-05-29)                                                                                                                           | Yes — register step 6 (`consultaresultado`/trackId)                                                                                                                         | Yes. `secuenciaUtilizada` is **kept on the track step**, cited to the track-result consult, and the sentence "On a rejection, `secuenciaUtilizada` decides the next step" is untouched and unsoftened, as the register demands                                                    | PASS                                             |
| 7. Reconcile                                 | Descripción Técnica Servicios DGII — _Consulta de trackId e-CF_: "No encontrado" = DGII holds no record · Estándares de Comportamiento — §5.2–5.3: the local queue (2026-11-06)                                                                                                           | Yes — register step 7                                                                                                                                                       | Yes; §5.2–5.3 is the register's "persist before transmit" scope, and idempotency keying is **not** attributed to DGII here                                                                                                                                                        | PASS                                             |
| Auxiliary flows (not a numbered step)        | Descripción Técnica Servicios DGII — _Recepción de aprobación comercial_, _Anulación de e-NCF_, _Consulta Directorio de Servicios_ · Formato Anulación de e-NCF v1.0 — only unsent/undelivered sequences may be voided (rev. 2022-05-24)                                                  | Yes — register steps 8/9/10                                                                                                                                                 | Yes (TEC-08 preamble admissibility rule is quoted accurately)                                                                                                                                                                                                                     | PASS on provenance — **scope deviation**, see D3 |
| `signing.md` intro                           | Firmado de e-CF + Descripción Técnica Servicios Emisores Electrónicos — _Firmado de XML_: SHA-256, `preservewhitespace = false`, signed XML never altered                                                                                                                                 | Yes — register step 4                                                                                                                                                       | Yes; same two documents as `flow.md` step 4, so no rule is credited to two different documents                                                                                                                                                                                    | PASS                                             |
| `resilience.md` — Retry policy               | Informe Técnico — §19 contingency operation, the offline-transmission clocks, the replacement identifiers · Instructivo de Contingencia de FE (2026-10-15)                                                                                                                                | **Indirectly.** §19 governs contingency conduct, not the retry predicate (`408`/`429`/`5xx`) above it; the sentence describes §19's actual contents and claims nothing more | Yes on content; **placement is loose** — see D2                                                                                                                                                                                                                                   | PASS (note)                                      |
| `resilience.md` — Persist before transmit    | Estándares de Comportamiento — §5.2–5.3: sign and store locally with timestamp before transmitting, verify the first documents before draining the queue · "The keying scheme is the SDK's design"                                                                                        | Yes — register step 7                                                                                                                                                       | Yes, including the SDK-attribution sentence the register requires                                                                                                                                                                                                                 | PASS                                             |
| `resilience.md` — Reconcile / sequence reuse | Descripción Técnica Servicios DGII — _Consulta de trackId e-CF_ (`No encontrado`), _Consulta de resultado e-CF_ and _Consulta de Resumen (RFCE)_ (the `secuenciaUtilizada` flag, keyed by `trackId` or RNC + e-NCF + security code)                                                       | Yes — register step 7 verbatim ("name the endpoint that applies to the document type in hand")                                                                              | Yes. Names exactly the three consults that carry the flag and — in the reference page — states it is **not** on the state consult                                                                                                                                                 | PASS                                             |

**Attribution accuracy, line by line:** no wrong section, no document credited with a rule it does not
carry, no rule credited to two different documents in different places, and no citation more precise
than its source. Specifically checked and clean:

- **No article number anywhere that the register forbids one.** The only `Art.` strings on these pages
  are `NG 05-2019 Art. 11` (register step 4 / LEG-04), `NG 01-2020 Art. 12` (range voiding, register
  step 9) and `NG 01-2020 Art. 11(c)` (directory/B2B, register step 10). None is on the
  commercial-approval deadline.
- **No invented date.** Every `site-updated`/`rev.` string matches the register row byte for byte
  (TEC-02 2026-05-29, TEC-03 2026-05-29 + escape rules 2025-04-03, TEC-04 2026-11-06, TEC-01
  2026-10-16, TEC-05 2025-10-30, TEC-10 2023-11-22, TEC-08 rev. 2022-05-24, OPS-04 2026-10-15,
  Semilla 2020-11-12). Access date on the page is `2026-11-09`, the register's access date.
- **No invented link.** All URLs on the reference page are a subset of the register's URLs
  (script check: 0 page URLs absent from the register).

## 2. The reference page's own claims

- **43/43 document rows match the register** on title and version/date. Mechanical check: 40 exact
  title matches; the 3 residual diffs are formatting only — `Canonical XML 1.0 (W3C REC)` and
  `XML Encryption 1.1 (W3C REC)` are published as title + `W3C Recommendation` in the version column,
  and `FE Estatus Servicios API (OpenAPI v3.0.1 spec)` is published as title + `v1`, which is the
  register's own version cell. No substantive mismatch.
- **"Which document governs which step" does not contradict any guide line.** The 7 step rows are
  supersets of the corresponding `flow.md` lines (§4.1, §7, §4.9, Formato e-CF/RFCE, _Consulta de
  estado_), never different documents for the same rule. `secuenciaUtilizada` is scoped to "the
  trackId response" inside the Track row and described as keyed by `trackId` or RNC + e-NCF + security
  code in the Reconcile row — consistent with step 6 and with `resilience.md`.
- **The B2B warning is correct and SDK-attributed**: "The SDK applies its own guard (`enforceB2BRules`
  / `enforce_b2b_rules`, on by default) and declines to deliver E32 below RD$250,000, E41, E43, E45,
  E46 and E47 straight to a buyer. … it is not a cited DGII requirement." Both identifiers exist
  (`packages/typescript/src/client.ts:134`, `packages/python/src/py_dgii_ecf/client.py:163`, default
  `true`).
- **Schema hashing is not over-claimed.** "The SDKs ship the twelve schemas that compile as pinned
  fixtures and record a `sha256` for each of those; the three excluded entries carry no hash" —
  verified against `examples/fixtures/schemas/MANIFEST.json`: `schemas` = 12, all with `sha256`;
  `excluded` = 3, none with `sha256`. (Note: the register's own residual-risk bullet says "only for
  the 15 schemas"; the page is _more_ accurate than the register here. Keep the page wording.)
- **The 34-source note obeys the human decision** — states 34, does not print a page count, does not
  compare. See D1 for the one clause that overreaches.

## 3. Constraint checklist

| #   | Binding constraint                                                                                                               | Status                  | Evidence                                                                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Commercial-approval deadline: **no article number, no calendar date**                                                            | **HONOURED**            | AC row: "…and the receiver's conformity, given by the approval or by filing the purchase with the corresponding 606 filing". No `Art.` and no date on that row; `grep` for `15th`/`following month` returns nothing                                                                |
| C2  | B2B type exclusion attributed to the **SDK guard**, not to DGII                                                                  | **HONOURED**            | `flow.md` Common mistakes: "The SDK refuses it (`enforceB2BRules`); DGII's documents state no such exclusion" + the reference page's `!!! warning`. The old DGII voice ("DGII excludes those types from the B2B flow") is gone from the diff; `grep "in practice"` returns nothing |
| C3  | `secuenciaUtilizada` kept on the **track** step, cited to the **track-result** consult, not moved to the RFCE flow, not softened | **HONOURED**            | `flow.md` step 6 line + the unchanged sentence and mermaid branch; the flag is never relocated to step 5                                                                                                                                                                           |
| C4  | `CodigoSeguridadeCF`: DGII says only "hash"; SHA-256 marked as the SDK's reading                                                 | **HONOURED**            | Reference page RFCE row: "…the `CodigoSeguridadeCF` definition — DGII names only a 'hash'; SHA-256 is the SDK's reading of the signature profile"                                                                                                                                  |
| C5  | Status **ambiente codes** not given DGII-attributed labels                                                                       | **HONOURED**            | "their integer ambiente codes (v1)"; zero occurrences of `PreCert`/`Prod`/`Cert` labels in `docs/`                                                                                                                                                                                 |
| C6  | Issuer-standards **file-name table** cited, not the technical description's short example                                        | **HONOURED**            | "— _Nombre de los Archivos XML_: the file name is `RNCEmisor` + the e-NCF, 13 characters, as that section's own table shows"                                                                                                                                                       |
| C7  | `<KeyValue>` / `<RSAKeyValue>` / `<Exponent>` prohibition labelled an **SDK** rule                                               | **HONOURED BY ABSENCE** | Zero occurrences of those element names in `docs/`: no page claims a DGII prohibition. If a later revision adds one, use the register's sentence ("the SDK omits … TEC-10 shows them as unnecessary")                                                                              |
| C8  | Schema hashing **not** claimed for all pinned schemas                                                                            | **HONOURED**            | "twelve schemas … a `sha256` for each of those; the three excluded entries carry no hash" — matches `MANIFEST.json`                                                                                                                                                                |
| C9  | `signing.md` additive only: W3C/C14N URIs unchanged, DGII document added **alongside**                                           | **HONOURED**            | `git diff --numstat` = `1 0` (one insertion, no deletion); `http://www.w3.org/TR/2001/REC-xml-c14n-20010315` and `…/xmldsig-more#rsa-sha256` each still present; no code block, command or URI edited                                                                              |

## Defects

### D1 (BLOCKING) — the scope note claims completeness the register does not support

**Exact quote** (`docs/en/reference/dgii-official.md`, "Scope of this page"):

> What is published here is every document that could be verified as publicly reachable on the
> access date, with the URL and the version each one was checked at, so anyone can re-check them.

**Why it fails.** That is a different selection rule from the register's. The register's inclusion
rule is _claim-dependence_: "a document appears here only if a ground-truth claim or the XSD manifest
depends on it **and** the URL returned a success status" (Scope and method). It then records, by
judgement call, DGII documents that are published **and verified reachable** but deliberately absent:
`Norma General 06-2018` (judgement call 8, "verified 200" on DGII's Marco Legal page) and the
Representación Impresa models plus the Facturador Gratuito manual (judgement call 9, "both are
published and verified"). As written, the page tells an auditor that absence from it means not
published — and DGII's own Marco Legal page falsifies that in one click. This is an overstatement of
provenance on the page whose only job is verifiable provenance.

**Fix instruction.** Replace that sentence with one that states the coverage rule, not completeness:

> What is published here is each document that a step or a field on this site depends on, verified
> reachable on the access date, with the URL and the version each one was checked at, so anyone can
> re-check them. Documents DGII publishes that no step here depends on are not listed.

Do **not** fix it by printing the page's row count (43): the human decision is to state that the
internal audit drew on 34 and not to compare counts. Keep the first sentence of the scope section
("assembled from 34 sources; this page is not that list") exactly as it is — it is compliant.

### D2 (non-blocking) — `resilience.md` retry-policy line sits under a rule its document does not carry

**Exact quote** (after "A rejected e-CF (e.g. `400`, `401`) is **never** blindly re-sent."):

> **Official source:** Informe Técnico Comprobante Fiscal Electrónico — §19: contingency operation,
> the clocks it sets for transmitting what was generated offline, and the identifiers that mark a
> replacement receipt …

Every word of that attribution is true of §19 (register step 2: 72 h, 15 días calendario,
`NCFModificado`/`FechaNCFModificado`/`CodigoModificacion` = 4). But §19 does not govern the retry
predicate printed above it, and the register maps no source for it — retry/backoff is SDK design.
**Fix (optional):** move the line to the end of "Reconciling a pending submission", or prefix it with
"When a transmission fails and you fall back to contingency, this governs it:" so the reader does not
read the 3-attempt/`5xx` policy as DGII's.

### D3 (non-blocking, scope) — an eighth "Official source" line under `## Auxiliary flows`

Content is accurate (register steps 8/9/10 documents) but tasklist Decision 6 scopes the citation to
the **seven numbered steps** and says Auxiliary flows and Common mistakes get no line. Remove it, or
record the deviation in the run ledger so T12 does not fail the page on a scope rule the writer
overrode silently.

## 4. Reader-level risk

**Most likely to be quoted back at the SDKs** (`flow.md` step 6):

> On a rejection, `secuenciaUtilizada` decides the next step: `false` means the e-NCF may be reused,
> `true` means it is consumed and a new one is required.

**It survives scrutiny on DGII's side** — the field is published in the `consultaresultado`/trackId
response (TEC-02 p. 24, XML `<RespuestaConsultaTrackId><secuenciaUtilizada>true</…>`) and its
semantics are documented in _DESCRIPCIÓN PARÁMETROS DE SALIDA_ (pp. 24–25), added by the bitácora
_Actualizaciones al 18-04-2022_. An integration team quoting it will be quoting DGII correctly.
**The risk is downstream, not textual:** the SDK's `canReuseSequence` reads the flag from
`consultaestado`, which carries no such element (register Finding 1), so a team that quotes this
sentence and then tests the SDK sees `false` for every documented response. The sentence is right;
the reconcile path is wrong. Do not soften the sentence to paper over the code defect.

**The only sentence on these pages that does not survive scrutiny** is D1's completeness claim —
which is why this review fails.

## Notes outside the six checks (not provenance defects, but they will bite the acceptance audit)

1. **Citation placement.** Tasklist Decision 4 makes the "Official source" line "the first paragraph
   after each `## N.` heading" so `grep -A2 -E '^## [0-9]+\.' | grep -c 'Official source'` returns 7.
   It currently returns **1**: the lines sit 4–6 lines after their headings, behind the step's intro
   sentence (measured with `awk` on all 7 headings). Either move each line directly under its heading
   or amend the tasklist's verify command — as it stands, T3's own check fails on a page that is
   substantively correct.
2. **Missing section heading in `signing.md` / `resilience.md`.** Tasklist T4/T5 verify
   `grep -c '^## DGII normative references'` = 1. The writer used inline `**Official source:**` lines
   instead, so both checks return 0. The provenance content is correct (this review passes C9); the
   structural requirement is unmet.
3. **Line format.** Tasklist Decision 5 specifies an `accessed <YYYY-MM-DD>` suffix; the pages print
   `(site-updated <YYYY-MM-DD>)`. The dates are the register's and the label makes clear the date is
   DGII's site date, not a date the PDF prints, so no reader is misled — but it is a format deviation
   worth one line in the ledger.

## Outcome

Outcome: FAIL — attempt 1 of 3: all 12 citation lines and 43 document rows are faithful to the frozen
register (7/7 steps cited once, correct sections, no forbidden article number or date, all nine
binding constraints honoured, `signing.md` additive, `1 0` diff); the single blocking defect is the
new page's completeness claim ("every document that could be verified as publicly reachable"), which
the register's own judgement calls 8–9 contradict.
Details: fix = one sentence (D1, exact replacement given, do not print a row count); D2 (retry-policy
citation placement) and D3 (eighth line under Auxiliary flows) are non-blocking tightenings, and the
tasklist's placement/heading verify commands will still fail on an otherwise correct page.
`project-tasks/124-evidence/t4t5-dgii-expert-en-citations.md` — this review: per-step table,
constraint checklist, D1–D3 with quotes and fix instructions, reader-risk ruling.
