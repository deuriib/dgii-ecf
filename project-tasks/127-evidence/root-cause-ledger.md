# Root-cause ledger — issue #127

Run: Bug Triage & Defect Elimination (NEXUS-Sprint), `dgii-ecf`.
Scope list N = 1: issue #127 (`docs: correct unsourced and mis-cited claims in dgii-ground-truth.md`).

Severity: **P2** (contained; internal reference only — does not reach the docs site).
Disposition: **fix-now** (on the scope list; the issue body is the recorded failing reproduction).

## Root cause (single, shared)

`project-docs/dgii-ground-truth.md` was authored (2026-11-02, from a NotebookLM notebook) **before**
the verified source register `project-tasks/124-source-register.md` was committed. The notebook's
34-document list was never committed, so the file's claims could not be re-traced when #124 built the
register. Four claims drifted from (or were never backed by) an extractable DGII source, and the
register itself carried two bookkeeping inaccuracies. The trace that exposed them is #124 / PR #125,
recorded there as escalation R-1.

## Findings vs. verification (each traced to an extractable source or re-labelled)

| #   | Claim (pre-fix)                                                                                                                | Cause                                                                                                                                                                                        | Verdict                          | Source / code evidence                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Commercial-approval deadline cites "Decreto 587-24 Art. 17 ¶V, Norma General 01-2020 Art. 14 ¶I" + a 606-aligned calendar date | Wrong article + unverifiable calendar date. NG 01-2020 Art. 14 is titled _Consultas_; the obligation is Art. 8 ¶I, which prints **no** date. Decreto 587-24 is a scan (0 extractable chars). | **fixed**                        | `Norma01-20.pdf` extracted text: "Artículo 14. Consultas." (no deadline); "Párrafo I … su conformidad mediante la Aprobación o Rechazo Comercial o mediante su remisión en el Formato de Envío de Costos y Gastos (606) en la siguiente fecha de presentación del formato."                   |
| 2   | B2B exclusion list (E32 < RD$250k, E41, E43, E45, E46, E47) presented as DGII's position                                       | No DGII document states a type-exclusion list; the rule is enforced in SDK code.                                                                                                             | **fixed (re-labelled SDK rule)** | `packages/typescript/src/reception.ts:151` `B2B_EXCLUDED_TYPES` (41/43/45/46/47) + `checkB2BApplicability`; `client.ts:191` `enforceB2BRules ?? true`; Python `reception.py:125` `_B2B_EXCLUDED_TYPES`.                                                                                       |
| 3   | `<KeyValue>`/`<RSAKeyValue>`/`<Exponent>` "must NOT be emitted" as a DGII requirement                                          | TEC-10 names them "no son necesarios" (an example comment), not a prohibition. TEC-03 does not mention them.                                                                                 | **fixed (re-labelled SDK rule)** | `Firmado de e-CF.pdf` (TEC-10) extracted text: "los tag KeyValue, RSAKeyValue, Exponent no son necesarios".                                                                                                                                                                                   |
| 4   | "built from 34 official documents" with no enumeration                                                                         | The notebook's 34-entry list was never committed; the register (43 verified) is the verifiable list.                                                                                         | **fixed (register linked)**      | `project-tasks/124-source-register.md` "Verified count": 43 URLs verified `200` on 2026-11-09.                                                                                                                                                                                                |
| 5a  | Register says `sha256` covers "the 15 schemas"                                                                                 | `MANIFEST.json` pins 12 (`schemas` array); the 3 `excluded` entries carry no hash.                                                                                                           | **fixed**                        | `examples/fixtures/schemas/MANIFEST.json`: 12 `schemas` (each `sha256`) + 3 `excluded` (name/reason/source_url, no hash).                                                                                                                                                                     |
| 5b  | Register attributes both aviso dates to "the closing line"                                                                     | Aviso 07-23 states 16 May 2023 in its **opening** paragraph (closes 25 May 2023); Aviso 20-24 states 17 Oct 2024 in its **closing** line.                                                    | **fixed**                        | `07-23.pdf` extracted text (opening): "publicación oficial de la Ley no. 32-23 … de fecha 16 de mayo de 2023"; (closing): "a los veinticinco (25) días del mes de mayo … (2023)". `20-24.pdf` (closing): "a los diecisiete (17) días del mes de octubre del año dos mil veinticuatro (2024)". |

## Non-goals honoured

No SDK behaviour change, no test change, no `docs/` (docs-site) change, no CHANGELOG/version
hand-edit, no `examples/fixtures/*` reformat. Diff is confined to `project-docs/dgii-ground-truth.md`
and `project-tasks/124-source-register.md`.

## Roster mapping (this environment)

Agent spawning is disabled in this environment; the orchestrator folded every role. The read-only
source trace (`scout`) and the edit (`senior-developer`) were executed directly and are evidenced by
the extracted-text quotes above. `api-tester`, `reality-checker`, `sprint-prioritizer`,
`devops-automator` (dropped — no CI gate added), `product-manager` (dropped — N=1, no clustering) and
`executive-summary-generator` are folded and recorded here rather than spawned.
