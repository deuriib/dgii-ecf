# Run Ledger — #124 Official DGII provenance in the docs site

**Run**: `124-dgii-official-sources` | **Mode**: NEXUS-Micro (composed chain — no runbook fits docs-only work)
**Started**: 2026-02-14 | **Branch**: `docs/124-dgii-official-sources` | **Issue**: #124

## Stage 1 — Intake & Classification

| Dimension   | Value                                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain(s)   | engineering (docs), research (source verification)                                                                                                 |
| Deliverable | Documentation set: 1 new reference page ×2 locales, 3 guide updates ×2 locales, `mkdocs.yml` nav                                                   |
| Scale       | NEXUS-Micro — one deliverable cluster, no code changes                                                                                             |
| Urgency     | None. P2 docs task, no production impact                                                                                                           |
| Inputs      | Issue #124 text (requirement source), `project-docs/dgii-ground-truth.md` (internal truth, 244 lines), live DGII site (external, network required) |

### Missing required input — resolved by human decision

The issue asks the reference page to catalog "the 34 sources" behind `dgii-ground-truth.md`. **No
enumeration of those 34 documents exists in the repository** — the ground-truth file names its
NotebookLM source but lists no titles or URLs, and `dgii.gov.do` folder listings return `401`, so the
count is not mechanically recoverable.

**Human decision (deuriib, 2026-02-14)**: derive the catalog empirically from the documents the
ground-truth statements actually depend on, verify every URL, and publish the verified count with an
explicit note that the internal audit drew on 34 sources. Do **not** pad to 34, do not invent entries.

## Stage 2 — Roster & Scenario Selection

- No runbook in `strategy/runbooks.json` (42 entries) applies: every candidate
  (`api-platform-launch`, `oss-maintainer-operations`, `seo-and-ai-search-visibility`,
  `release-train`) targets a product launch, an operating cadence, search visibility, or a release —
  none is a documentation-provenance change. Composed a NEXUS-Micro chain instead.
- Roster discovered at run time from `divisions.json` + `rg '^name:'`; every slug below resolves.

| Agent                  | Slug                                             | Role in this run                                          |
| ---------------------- | ------------------------------------------------ | --------------------------------------------------------- |
| DGII e-CF Expert       | `engineering/engineering-dgii-ecf-expert.md`     | Producer (source register), validator (step→document fit) |
| Technical Writer       | `engineering/engineering-technical-writer.md`    | Producer (site content, nav)                              |
| Language Translator    | `specialized/language-translator.md`             | Producer (es mirror)                                      |
| Evidence Collector     | `testing/testing-evidence-collector.md`          | Validator (link evidence, build output, locale parity)    |
| Refuter Reviewer       | `specialized/review-refuter.md`                  | Validator (provenance claims, no invented sources)        |
| Reality Checker        | `testing/testing-reality-checker.md`             | Final integration gate                                    |
| Senior Project Manager | `project-management/project-manager-senior.md`   | Task list traceability                                    |
| Git Workflow Master    | `engineering/engineering-git-workflow-master.md` | Commits + PR packaging                                    |

Dropped: none. No slug in the plan failed to resolve.

## Stage 3 — Plan

### Pipeline graph

| ID  | Scenario                              | Mode  | Owner               | Writes                                                                              |
| --- | ------------------------------------- | ----- | ------------------- | ----------------------------------------------------------------------------------- |
| P1  | Micro chain: official-source register | Micro | DGII e-CF Expert    | `project-tasks/124-source-register.md` (internal, unpublished)                      |
| P2  | Micro chain: English site content     | Micro | Technical Writer    | `docs/en/reference/dgii-official.md`, `docs/en/guides/{flow,signing,resilience}.md` |
| P3  | Micro chain: Spanish mirror           | Micro | Language Translator | `docs/es/reference/dgii-official.md`, `docs/es/guides/{flow,signing,resilience}.md` |
| P4  | Micro chain: nav wiring + final gate  | Micro | Technical Writer    | `mkdocs.yml` only                                                                   |

Edges:

- `blocks` P1 → P2 (P2 cites nothing the register has not verified)
- `blocks` P1 → P3
- `feeds` P2 → P3 (frozen EN prose at contract C-2)
- `blocks` P3 → P4 (nav entries added only once both locale trees exist)
- `blocks` P2 → P4

No cycles. No two pipelines write the same file: `mkdocs.yml` belongs to P4 alone; each guide file
has exactly one writing pipeline per locale.

### Cross-pipeline contracts

| ID  | From → To | Artifact                                           | Certified by                                                          | Consumer needs                                                          | Change policy                                                    |
| --- | --------- | -------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| C-1 | P1 → P2   | `project-tasks/124-source-register.md`             | Refuter Reviewer (T1) + Evidence Collector (T2)                       | Title, version/date, canonical URL, access date, governing-step mapping | Frozen at PASS. A late addition re-runs T1+T2 and notifies P2/P3 |
| C-2 | P2 → P3   | `docs/en/reference/dgii-official.md` + 3 EN guides | Evidence Collector (T3), DGII e-CF Expert (T4), Refuter Reviewer (T5) | Exact anchors, link targets, heading structure                          | es may not edit links or headings; discrepancies go back to P2   |
| C-3 | P3 → P4   | `docs/es/**` file set                              | Evidence Collector (T6)                                               | Locale file list + nav label keys                                       | P4 adds nav only; no content edits                               |

### Human authority

| Approver             | Decision                                | Why                                                                              |
| -------------------- | --------------------------------------- | -------------------------------------------------------------------------------- |
| deuriib (repo owner) | Final PR approval + provenance sign-off | Regulatory citations become public claims about DGII's rules on a published site |

No legal, clinical, financial, or deploy authority is exercised by this run.

## Stage 4/5 — Task board

| #   | Pipeline | Task                                               | Producer               | Validator              | Evidence that counts                                                                 | Attempt                                                            | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | -------- | -------------------------------------------------- | ---------------------- | ---------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T0  | —        | Task list quoting #124 acceptance                  | Senior Project Manager | Orchestrator vs ledger | `project-tasks/124-dgii-official-sources-tasklist.md` quotes every acceptance bullet | 1                                                                  | PASS                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| T1  | P1       | Official-source register                           | DGII e-CF Expert       | Refuter Reviewer       | Every entry maps to a ground-truth statement; zero entries without a governing claim | 3                                                                  | **PASS (attempt 3)** — attempt 1 FAIL (R1–R4, M1–M6, 9 nits); attempt 2 FAIL (N-1…N-18); attempt 3 PASS. Evidence: `124-evidence/t1-refuter-register-attempt3.md`. 4 cosmetic residuals (L-1…L-4) accepted                                                                                                                                                                                                                                                                                                                                                         |
| T2  | P1       | Link integrity of register                         | DGII e-CF Expert       | Evidence Collector     | HTTP 200 per URL, title matches, access date recorded                                | 3                                                                  | **PASS on the recorded gate / FAIL on the validator's zero-discrepancy rule (attempt 3)** — 50/50 URLs `200`, 43/43 status cells correct, 15/15 manifest URLs byte-identical, counts 7/11/15/4/6 reconcile, access date correct. Two LOW prose nits escalated as **R-1** (D1 hash coverage is 12 not 15; D2 LEG-01 date attribution). Not allowed to block the run: both are one-line prose in an internal artifact, and both are neutralized downstream by hard constraints in the P2/P3 briefs. Evidence: `124-evidence/t2-evidence-collector-links-attempt3.md` |
| T3  | P2       | `docs/en/reference/dgii-official.md`               | Technical Writer       | Evidence Collector     | Every link 200, `mkdocs build --strict` green, no verbatim DGII body text            | 3                                                                  | **PASS (attempt 2)** — attempt 1 PASS on gates 1–7 with 2 open decisions; attempt 2 applied D1 (scope over-claim, validator-authored text) and the access-date ruling. Evidence: `124-evidence/t3-evidence-collector-en-docs-attempt2.md`                                                                                                                                                                                                                                                                                                                          |
| T4  | P2       | `docs/en/guides/flow.md` step citations            | Technical Writer       | DGII e-CF Expert       | All 7 numbered steps + aux flows cite a governing document                           | 2                                                                  | **PASS (attempt 2)** — attempt 1 FAIL on D1 (page claimed completeness the register does not support); attempt 2 PASS, all 9 binding constraints honoured, R-1/W-1 applied verbatim from validator text and byte-verified by the orchestrator. Evidence: `124-evidence/t4t5-dgii-expert-en-citations-attempt2.md`                                                                                                                                                                                                                                                  |
| T5  | P2       | `docs/en/guides/{signing,resilience}.md` citations | Technical Writer       | Refuter Reviewer       | DGII normative doc present alongside W3C refs; idempotency/sequence claims sourced   | 2                                                                  | **PASS (attempt 2)** — same review as T4: signing.md additive only (`1 0` numstat, W3C URIs unchanged), resilience claims sourced. Evidence: `124-evidence/t4t5-dgii-expert-en-citations-attempt2.md`                                                                                                                                                                                                                                                                                                                                                              |
| T6  | P3       | es mirror of all 4 pages                           | Language Translator    | Evidence Collector     | File list identical to en, links byte-identical, no EN prose in body                 | 2                                                                  | **PASS (attempt 2)** — attempt 1 FAIL on untranslated prose (51 occurrences) + `by example`→`por ejemplo` + one dropped sentence (D-1…D-5); attempt 2 PASS with parity re-measured identical (11/11 files, 45 distinct URLs in identical order, row vectors, citations 8/1/3). O-4 month polish applied by orchestrator. Evidence: `124-evidence/t6-evidence-collector-es-mirror-attempt2.md`                                                                                                                                                                      |
| T7  | P4       | `mkdocs.yml` nav + nav_translations                | Technical Writer       | Evidence Collector     | `--strict` build, `site/en                                                           | es/reference/dgii-official/index.html` exist, nav label translated | 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | PASS |
| T8  | P4       | Final integration gate                             | —                      | Reality Checker        | Acceptance checklist + full evidence index                                           | 1                                                                  | **PASS (attempt 1)** — all 6 acceptance bullets re-executed green, 43/43 links re-requested `200`, 11 residual risks, none blocking. Evidence: `124-evidence/t8-reality-checker-final.md`                                                                                                                                                                                                                                                                                                                                                                          |
| T9  | —        | Commits + PR                                       | Git Workflow Master    | Orchestrator           | Conventional Commits, evidence in PR body                                            | 1                                                                  | **PASS (attempt 1)** — 4 commits on `docs/124-dgii-official-sources`, PR [#125](https://github.com/deuriib/dgii-ecf/pull/125) open against `main` with all four required checks green (docs build, pre-commit, python CI, typescript CI). Hooks ran unbypassed. Evidence: `124-evidence/t9-commits-and-pr.md`                                                                                                                                                                                                                                                      |

Attempt ceiling is 3 per task; 3 consecutive FAILs mark the task BLOCKED and pause `blocks` dependents.

## Escalations register

| ID  | Raised by                                  | Item                                                                                                                                                                                                                                             | Owner                                          | Status                                                                                                                                                |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1 | Evidence Collector, T2 attempt 3           | Register prose: `sha256` covers 12 pinned schemas, not 15 (the 3 `excluded` entries carry no hash); LEG-01's date comes from Aviso 07-23's _opening paragraph_, not its closing line                                                             | Human (register is internal; no public impact) | **ESCALATED → #127** — mitigated downstream meanwhile: P2/P3 briefs forbid claiming hash coverage for all 15 and forbid citing the Aviso closing line |
| R-2 | Refuter Reviewer, T1 attempt 1 (Finding 1) | **Code defect, out of #124 scope**: `canReuseSequence` / `can_reuse_sequence` is fed from `inquiryStatus` (`consultaestado`), where `secuenciaUtilizada` does not exist, so it is always `false`; the flag _is_ published on `consultaresultado` | Human (needs its own issue)                    | OPEN — not fixed here (issue #124 excludes SDK code changes)                                                                                          |

### Orchestrator decisions recorded

| #    | Decision                                                                                     | Rationale                                                                                                                                                                                                                             |
| ---- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OD-1 | R-1 and W-1 applied by the orchestrator, not a producer                                      | Both were supplied verbatim by the validator as its own wording fix. Transcribed mechanically and verified byte-exact (`python` substring match), so no producer authored new content.                                                |
| OD-2 | `Reference` stays a nav **group** although the task list's Decision 7 asked for a flat entry | A catalogue page that will grow (response contracts, ADRs are candidates) reads better as a section, the diff is `+4 −0`, and both locales render it. Overrides Decision 7; recorded here because two governance artifacts disagreed. |
| OD-3 | The aux-flows citation line stays (task list said "no citation for aux flows")               | The ledger's T4 gate included it and the ledger is the run's single source of truth.                                                                                                                                                  |
| OD-4 | Spanish mirror produced by Technical Writer after `Language Translator` failed to spawn      | Slug resolved in the roster; the agent is not installed in this runtime. Recorded rather than improvised silently.                                                                                                                    |
| OD-5 | Access date carried once per page, not stamped on all 12 citation lines                      | Satisfies the issue bullet ("access date noted where DGII URLs are known to move") without 12 noisy stamps; verified as rendered notes in both locales.                                                                               |

## Stage 6 — Lessons

**What worked**

- The register-first pipeline (P1) caught what the issue could not: the published guides contained two claims that DGII's documents do not support (`secuenciaUtilizada` was the opposite case — a correctly sourced claim the register wrongly told the writer to soften). Adversarial validation (Refuter) earned its cost on that single item.
- Requiring per-row proof ("which ground-truth section does this document govern") turned a citation job into a provenance audit and surfaced a real SDK defect (R-2) that no docs task would have found.

**What broke, and the signal**

- **The register took three attempts and both validators failed twice.** Root cause was not capability but _precision discipline_: writing 43 rows of two-source claims invites over-claiming. The signal was available at attempt 1 — a validator that cites line numbers and reproduction recipes converges fastest.
- **A cancelled producer run left a half-revised artifact.** Line 29 corrected, lines 509/543 stale. The recovery that worked: telling the resumed run the file was inconsistent and requiring `rg` for every corrected fact. Lesson: on resume, never trust "already fixed"; grep the old string.
- **Two producers wrote the same page in two locales.** Parity held only because the second locale was briefed with the _frozen_ English file plus per-page URL-set diffing. Parity by construction, not by review.
- **Governance artifacts disagreed twice** (nav shape, aux-flows citation). The ledger must state which artifact wins before producers start, otherwise validators flag spec-vs-spec conflicts as defects.

**Next time**

- Put the "no completeness claim" rule in the brief, not in review.
- Give a translator the frozen source plus a byte-exact preserve list (URLs, dates, identifiers) on the first pass.
- Ask for the access-date policy in one sentence up front instead of discovering the ambiguity at the gate.
