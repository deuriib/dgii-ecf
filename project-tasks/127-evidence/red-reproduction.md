# Red reproduction — the traced false claims (pre-fix)

The failing state of `project-docs/dgii-ground-truth.md` and `project-tasks/124-source-register.md`
at the start of this run, with the source each claim was traced to (or failed to trace to).

## Finding 1 — commercial-approval deadline (ground-truth, line 211–212)

Pre-fix text:

> Legal deadline: by the filing deadline of the corresponding period (aligned with Formato 606,
> due by the 15th of the following month) — Decreto 587-24 Art. 17 ¶V, Norma General 01-2020 Art. 14 ¶I.

Trace result — **fails**:

- NG 01-2020 (LEG-03) Art. 14, extracted from `Norma01-20.pdf`: **"Artículo 14. Consultas."** — it
  sets up the e-CF validation query, no deadline.
- The acknowledgement/conformity obligation is **Art. 8 ¶I**: "… su conformidad mediante la
  Aprobación o Rechazo Comercial o mediante su remisión en el Formato de Envío de Costos y Gastos
  (606) en la siguiente fecha de presentación del formato." — no calendar date.
- Decreto 587-24 (LEG-02) is a 29-page scan with **0** extractable characters; Art. 17 ¶V cannot be
  quoted. The "15th of the following month" belongs to NG 07-2018 / 10-18, which is not a register row.
- ACECF format (TEC-07) prints no filing deadline.

## Finding 2 — B2B exclusion list (ground-truth, line 244)

Pre-fix text:

> B2B direct delivery **does not apply** to E32 < RD$250k, E41, E43, E45, E46, E47.

Trace result — **not a DGII statement**. No extractable DGII document (TEC-02/03/05/01) prints a
type-exclusion list. The rule is enforced only in SDK code: `B2B_EXCLUDED_TYPES` (41/43/45/46/47) in
`packages/typescript/src/reception.ts:151`, `checkB2BApplicability` (`reception.ts:166`),
`enforceB2BRules` (`client.ts:191`, default `true`), and `_B2B_EXCLUDED_TYPES` in
`packages/python/src/py_dgii_ecf/reception.py:125`.

## Finding 3 — `<KeyValue>` prohibition (ground-truth, line 201)

Pre-fix text:

> `<KeyValue>`, `<RSAKeyValue>`, `<Exponent>` must **NOT** be emitted.

Trace result — **stronger than its source**. TEC-10 (`Firmado de e-CF.pdf`) extracted text:
"los tag KeyValue, RSAKeyValue, Exponent no son necesarios" — an example-driven
"not necessary", not a prohibition. TEC-03 (`Descripción Técnica Servicios Emisores Electrónicos`)
does not mention them.

## Finding 4 — "34 official documents" (ground-truth, line 9)

Pre-fix text:

> **Source:** NotebookLM notebook _"Reglamento y Guía de Facturación Electrónica de la DGII"_,
> built from 34 official documents.

Trace result — **unverifiable**. The notebook's 34-entry list is not committed; it had to be
reconstructed as `project-tasks/124-source-register.md` (43 verified documents). The ground-truth
file never linked that register.

## Finding 5a — sha256 count (register, line 74)

Pre-fix text:

> … a status is not a content guarantee. `sha256` for the 15 schemas lives in `MANIFEST.json` …

Trace result — **wrong count**. `examples/fixtures/schemas/MANIFEST.json` has a `schemas` array of
**12** entries, each with a `sha256`, plus an `excluded` array of **3** entries
(`e-CF 31`, `RFCE 32`, `ACECF`) carrying `name`/`reason`/`source_url` and **no hash**.

## Finding 5b — aviso date location (register, lines 98–101)

Pre-fix text:

> Their dates come from DGII's own avisos, which are text-extractable and date the instrument in
> their **closing line**: LEG-01 = 16 May 2023 (Aviso 07-23 …); LEG-02 = 17 Oct 2024 (Aviso 20-24 …).

Trace result — **half wrong**. Extracted from the two avisos:

- `07-23.pdf` **opening paragraph**: "la publicación oficial de la Ley no. 32-23 … de fecha 16 de
  mayo de 2023"; **closing line**: "a los veinticinco (25) días del mes de mayo del año dos mil
  veintitrés (2023)".
- `20-24.pdf` **closing line**: "a los diecisiete (17) días del mes de octubre del año dos mil
  veinticuatro (2024)".

Applying "read the closing line" to Aviso 07-23 yields 25 May 2023 — nine days off.
