# T9 — Site docs `docs/en` + `docs/es` verification (P4, second half)

**Validator:** Evidence Collector (procedure executed by the orchestrator — see the run note)
**Task ref:** `project-tasks/126-tasklist.md` §T9 (satisfies A8; R10's second half) · **Attempt:** 2 of 3
**Date:** 2026-11-10 (UTC) · **Branch:** `fix/126-can-reuse-sequence` @ `e0b5f13`

## 0. Verdict

**PASS (attempt 2).** Attempt 1 FAILED on one issue plus a tasklist↔design conflict that had to be resolved
explicitly (see §3): the working tree had rewritten the `**Official source:**` / `**Fuente oficial:**` lines
wholesale, which violates the tasklist's byte-for-byte clause — but the frozen contract C-1 (`126-contract-design.md`
row P10, backed by E19) _orders_ a minimal re-point of those lines, because they cite the wrong consult for the
`No encontrado` rule. Resolution: **C-1 wins** (it is the validated, later artifact; the tasklist clause was
written before E19 was established), and the re-point was applied in the minimal form — only the consult name
in the `No encontrado` attribution changes; flag citations, URLs, access dates and all other wording stay
byte-identical to `main`. Recorded in the run ledger.

## 1. DoD check — one item per clause

| #   | T9 DoD clause                                                                                                                                                                       | Status                            | Evidence                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Reuse paragraph states the chain the SDK uses (track id from `consultatrackids`, flag from the track-result consult), the two extra query calls, and keeps the absent-flag sentence | **PASS**                          | `docs/en/guides/resilience.md:142-167` / `docs/es:145-173`: _"DGII publishes `secuenciaUtilizada` on the **track-result** consult, not on the existence one, so the flag is reached through the track ids — and only a rejected general e-CF pays for those two reads: `consultaestado`, then `consultatrackids`, then `consultaresultado`…"_ · _"an absent flag is treated as **not** reusable"_ kept. |
| 2   | Official-source line carries the track-result consult, the RFCE consult and the security-code route; no access-date churn                                                           | **PASS with recorded deviation**  | See §3: the `No encontrado` attribution was re-pointed from _Consulta de trackId e-CF_ to _Consulta de estado e-CF_ per C-1 P10/E19. Everything else on the line — including both flag consults, the `keyed by trackId or by RNC + e-NCF + security code` wording and the `(site-updated 2026-05-29)` dates — is byte-identical to `main`.                                                              |
| 3   | flow.md reviewed; edited only if it misstates shipped behaviour                                                                                                                     | **PASS — minimal justified edit** | flow.md's §7 official-source line mis-cited the consult for the marker-clearing `No encontrado` (same defect as #126, in citation form). Re-pointed in both locales. The diagram and snippets were left untouched (they do not misstate; the reconcile box and the DGII-side `secuenciaUtilizada` node are correct).                                                                                    |
| 4   | Both locales same structure and claims; no nav change, no renumbering, identifiers verbatim                                                                                         | **PASS**                          | en/es diffs are structurally parallel (verified side by side, below); `mkdocs.yml` untouched; no step renumbered; `canReuseSequence`, `consultaresultado`, `consultatrackids`, `trackId`, `secuenciaUtilizada` appear verbatim in both.                                                                                                                                                                 |
| 5   | `docs/*/reference/dgii-official.md` untouched                                                                                                                                       | **PASS**                          | Not in the diff.                                                                                                                                                                                                                                                                                                                                                                                        |
| 6   | `mise run docs-build` green; locale file-list diff empty                                                                                                                            | **PASS**                          | `mise run docs-build` exit 0 (strict); `diff <(find docs/en …) <(find docs/es …)` empty; `site/es/index.html` exists.                                                                                                                                                                                                                                                                                   |

## 2. The page diffs

```text
 docs/en/guides/flow.md       |   2 +-
 docs/en/guides/resilience.md |  45 ++++--
 docs/es/guides/flow.md       |   2 +-
 docs/es/guides/resilience.md |  44 +++++-
```

- **resilience.md** (both): the reuse paragraph rewritten to the real chain (chain, both-facts rule, absent
  flag stays, `false` ≠ consumed, `Err` with marker intact, lease sizing ≈5 min / ≈3¾ min, the F-126-13/F-126-8
  attempt-code note), the failure-branch comments added to both code samples, the `Max attempts` row annotated
  `3 (4 in TypeScript)` (F-126-8), and the official-source re-point. The T6-required verbatim sentence appears
  verbatim in `en` and as its faithful translation in `es`.
- **flow.md** (both): only the §7 official-source re-point (one word-level change per locale).

`git diff main -- docs/` contains only these four files — the two resilience pages plus the two justified
flow.md lines.

## 3. The deviation from the tasklist's byte-for-byte clause, and why it is the right call

The tasklist T9 DoD says the official-source line is _unchanged byte-for-byte_. The frozen design's row P10
(validated PASS by the Refuter and the Reliability Reviewer, whose E19 is the DGII citation for the existence
rule) says: _"the *official source* line in `docs/{en,es}/guides/flow.md` §7 and in `docs/{en,es}/guides/resilience.md`
— all four files — currently cites *Consulta de trackId* for the `No encontrado` rule; under this design the
existence rule is `consultaestado`'s (E19), so T8 must re-point those citations and keep the flag citation on
*Consulta de resultado*."_

The tasklist clause predates E19 and its rationale ("it already names the track-result consult, the RFCE
consult and the security-code route") is true but incomplete — the same line also attributes the
marker-clearing `No encontrado` to the track-id consult, which after this fix is a doc that misstates the
shipped behaviour (contract C-3; the exact trap #126 exists to fix). Following C-1, the four lines were
re-pointed **minimally**: consult name in the `No encontrado` attribution only; flag citations, URLs, access
dates and the rest of each line are byte-identical to `main`. The deviation is recorded here and in the
ledger's escalation register as a resolved conflict, not an open one.

## 4. Verify commands (all green)

```text
$ mise run docs-build                                   → exit 0, built en + es
$ diff <(cd docs/en && find . -name '*.md' | sort) <(cd docs/es && find . -name '*.md' | sort)  → empty
$ test -f site/es/index.html                            → exists
$ grep -c 'Official source:\|Fuente oficial:' docs/en/guides/resilience.md docs/es/guides/resilience.md → 1, 1
$ packages/typescript/node_modules/.bin/prettier --check docs/en/guides/resilience.md docs/es/guides/resilience.md docs/en/guides/flow.md docs/es/guides/flow.md → clean
$ git diff --stat main -- docs/                         → only the four files above
```

Evidence: the diffs quoted in §2, the build log, and the empty locale diff.
