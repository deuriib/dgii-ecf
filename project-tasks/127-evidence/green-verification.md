# Green verification — each corrected claim re-traced or re-labelled

Post-fix state of the two files, with the source each corrected statement now rests on.

## Finding 1 — commercial-approval obligation (ground-truth)

New text:

> Legal obligation: the electronic receiver must acknowledge receipt and then give its conformity
> either by commercial approval/rejection or by reporting the e-CF in the corresponding Formato 606
> filing (Norma General 01-2020 Art. 8 ¶I). No calendar date is printed here because no extractable
> DGII document states one; the 606 filing cadence belongs to Norma General 07-2018 / 10-18, which is
> not part of the verified register.

Re-trace — **holds**. Art. 8 ¶I is extractable (`Norma01-20.pdf`) and prints exactly the
acknowledge-then-conformity obligation with no date. The wrong Art. 14 citation and the "15th of the
following month" date are gone.

## Finding 2 — B2B exclusion list (ground-truth)

New text appends:

> This is an **SDK rule**, not a DGII statement: the excluded types and the E32 threshold are
> enforced by `B2B_EXCLUDED_TYPES` / `checkB2BApplicability` / `enforceB2BRules` in
> `packages/typescript/src/{reception,client}.ts` and their Python counterparts. The rationale is that
> those documents follow a different delivery path …

Re-labelled — **holds**. The claim is now attributed to the SDK with its rationale and its exact code
locations, no longer to the regulator.

## Finding 3 — `<KeyValue>` rule (ground-truth)

New text:

> `<KeyValue>`, `<RSAKeyValue>`, `<Exponent>` are **not emitted** — an SDK implementation rule
> derived from DGII's signing examples (TEC-10 names them "no son necesarios"), not a DGII prohibition.

Re-labelled — **holds**. The verb now matches TEC-10's extracted "no son necesarios" and the SDK
derivation is stated.

## Finding 4 — source header (ground-truth)

New text:

> **Source:** NotebookLM notebook _"Reglamento y Guía de Facturación Electrónica de la DGII"_. The
> verifiable companion to this file is the committed source register at
> [`project-tasks/124-source-register.md`](../project-tasks/124-source-register.md), which names 43
> verified official documents and the claim each one backs.

Re-trace — **holds**. The unverifiable "built from 34 official documents" is removed and the register
(43 verified) is linked from the header. (The relative link resolves from
`project-docs/dgii-ground-truth.md` → `project-tasks/124-source-register.md`.)

## Finding 5a — sha256 count (register)

New text (verification recipe note):

> `sha256` for the **12 pinned** schemas (the `schemas` array) lives in `MANIFEST.json`; the
> **3 `excluded` entries** carry `name`/`reason`/`source_url` and no hash.

And (residual-risk "Fourth"):

> `MANIFEST.json` sha256 is the only content guard, and only for the 12 pinned schemas — the
> 3 `excluded` entries carry no hash, so their silent republish is not hash-detected.

Re-trace — **holds**. Matches `MANIFEST.json`: 12 `schemas` each with `sha256`, 3 `excluded` without.

## Finding 5b — aviso date location (register)

New text:

> Their dates come from DGII's own text-extractable avisos, but the location differs: **Aviso 07-23**
> states the 16 May 2023 date in its **opening paragraph** ("… de fecha 16 de mayo de 2023") and
> closes on **25 May 2023**; **Aviso 20-24** states the 17 Oct 2024 date in its **closing line**
> ("… diecisiete (17) días del mes de octubre … (2024)"). Applying "read the closing line" to
> Aviso 07-23 would return 25 May 2023, nine days off.

Re-trace — **holds**. Matches the extracted text of `07-23.pdf` and `20-24.pdf` (see
`red-reproduction.md`).

## Non-goal audit

`git diff --stat` after the fix touches exactly two files: `project-docs/dgii-ground-truth.md` and
`project-tasks/124-source-register.md`. No SDK source, no test, no `docs/` page, no
`examples/fixtures/*`, no CHANGELOG or version field is modified.
