# Run Ledger — #126 `canReuseSequence` reads the wrong consult

**Run**: `126-can-reuse-sequence` | **Mode**: NEXUS-Micro (composed chain — `bug-triage-and-defect-elimination` is a 2-week
backlog program and does not fit a single defect with a known cause; its **close rule** is adopted, see below)
**Started**: 2026-11-09 | **Branch**: `fix/126-can-reuse-sequence` | **Issue**: #126 | **Base**: `main` @ `e0b5f13`

## Stage 1 — Intake & Classification

| Dimension   | Value                                                                                                                                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain(s)   | engineering (both SDK packages), testing, docs                                                                                                                                                                                |
| Deliverable | One behavioural fix, implemented identically in TypeScript and Python, with tests that fail before and pass after                                                                                                             |
| Scale       | NEXUS-Micro — single defect, single cause, two packages                                                                                                                                                                       |
| Urgency     | None. `priority:p2`: contained, workaround is "treat every rejection as non-reusable", which is what the SDK already does                                                                                                     |
| Inputs      | Issue #126 (cause, file:line, fix direction, constraints), `project-tasks/124-source-register.md` (verified DGII contract for each consult), `project-docs/architecture.md` (the contract doc that must change with the code) |

### The defect, restated from the issue

`reconcileSubmission` / `reconcile_submission` derives `canReuseSequence` from `inquiryStatus`, which calls
`consultaestado`. DGII's `consultaestado` response (`RespuestaConsultaEstado`) has **no** `secuenciaUtilizada`
element, so the value is always `undefined` and `undefined === false` is `false`. The flag is published on
`consultaresultado` (track result) and on `consultarfce` (RFCE consultation). Net effect: the SDK can only ever
answer "not reusable", and the integrator burns a fresh e-NCF where DGII would have allowed reuse.

### Close rule (adopted from `bug-triage-and-defect-elimination`)

A bug closes only as **fixed**, with an automated test _observed failing for the recorded cause before the fix and
passing after it_. There is no second close path on this run. The evidence task (T7) must produce the failing-first
observation, not a claim that it would fail.

## Stage 2 — Roster & Scenario Selection

- Runbook search: 42 entries in `strategy/runbooks.json`; the only defect-oriented one is
  `bug-triage-and-defect-elimination`, whose Applicability table requires "bug volume, priority disputes and repeat
  defects" — not one reproduced defect. Composed a NEXUS-Micro chain; borrowed its close rule as the acceptance
  standard.
- Roster discovered at run time; every slug below resolves and is installed.

| Agent                  | Slug                                             | Role                                                                                    |
| ---------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| DGII e-CF Expert       | `engineering/engineering-dgii-ecf-expert.md`     | Producer: the DGII contract mapping (which consult carries the flag, per document type) |
| Refuter Reviewer       | `specialized/review-refuter.md`                  | Validator: is the mapping actually what DGII publishes?                                 |
| Reliability Reviewer   | `engineering/engineering-review-reliability.md`  | Validator: added round trips, failure modes, ordering against the idempotency marker    |
| Senior Developer       | `engineering/engineering-senior-developer.md`    | Producer: TypeScript implementation + tests                                             |
| Senior Developer       | `engineering/engineering-senior-developer.md`    | Producer: Python implementation + tests (separate run, same brief)                      |
| Code Reviewer          | `engineering/engineering-code-reviewer.md`       | Validator: correctness **and** cross-package behavioural parity                         |
| Evidence Collector     | `testing/testing-evidence-collector.md`          | Validator: failing-first proof, `mise run ci` output, docs build/locale parity          |
| Technical Writer       | `engineering/engineering-technical-writer.md`    | Producer: `project-docs/architecture.md` + `docs/{en,es}`                               |
| Reality Checker        | `testing/testing-reality-checker.md`             | Final integration gate                                                                  |
| Senior Project Manager | `project-management/project-manager-senior.md`   | Task list traceability                                                                  |
| Git Workflow Master    | `engineering/engineering-git-workflow-master.md` | Commits + PR                                                                            |

## Stage 3 — Plan

### Pipeline graph

| ID  | Pipeline                                           | Owner            | Writes                                                     |
| --- | -------------------------------------------------- | ---------------- | ---------------------------------------------------------- |
| P1  | Contract design (which consult, per document type) | DGII e-CF Expert | `project-tasks/126-contract-design.md`                     |
| P2  | TypeScript implementation                          | Senior Developer | `packages/typescript/**`                                   |
| P3  | Python implementation                              | Senior Developer | `packages/python/**`                                       |
| P4  | Contract doc + site docs                           | Technical Writer | `project-docs/architecture.md`, `docs/en/**`, `docs/es/**` |

Edges:

- `blocks` P1 → P2, P1 → P3 (no code before the contract is settled)
- `blocks` P2 → P4, P3 → P4 (docs describe frozen behaviour, not intended behaviour)
- `blocks` P4 → final gate
- P2 ∥ P3 (disjoint trees). No shared file: `architecture.md` and `docs/**` belong to P4 alone.

No cycles.

### Cross-pipeline contracts

| ID  | From → To  | Artifact                               | Certified by                                      | Consumer needs                                                                                            | Change policy                                                                     |
| --- | ---------- | -------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| C-1 | P1 → P2/P3 | `project-tasks/126-contract-design.md` | Refuter Reviewer (T2) + Reliability Reviewer (T3) | Exact endpoint chain, the flag's fallback semantics, ordering vs marker deletion, public-type disposition | Frozen at PASS; a change re-runs both validators and notifies P2/P3               |
| C-2 | P2 ⇄ P3    | The two implementations                | Code Reviewer (T6)                                | Identical observable behaviour: same calls, same order, same fallbacks, same error codes                  | Neither may diverge silently; divergence is a FAIL on the review, not a docs note |
| C-3 | P2+P3 → P4 | Behaviour as implemented               | Code Reviewer (T6)                                | What to document: the consult chain, the extra round trip, the absent-flag case                           | P4 may not document behaviour the code does not have                              |

### Human authority

| Approver             | Decision        | Why                                                                                     |
| -------------------- | --------------- | --------------------------------------------------------------------------------------- |
| deuriib (repo owner) | Merge of the PR | Two published SDKs, public API surface, release-please will cut patch releases on merge |

### Task board

| #   | Pipeline | Task                                | Producer               | Validator              | Evidence that counts                                                                            | Attempts | Status             |
| --- | -------- | ----------------------------------- | ---------------------- | ---------------------- | ----------------------------------------------------------------------------------------------- | -------- | ------------------ |
| T0  | —        | Task list quoting #126 + close rule | Senior Project Manager | Orchestrator vs ledger | `project-tasks/126-tasklist.md` quotes the issue verbatim, maps every constraint                | —        | DONE               |
| T1  | P1       | Contract design                     | DGII e-CF Expert       | Refuter Reviewer       | Every endpoint claim traceable to the register's verified rows; no invented contract            | 2        | DONE (frozen)      |
| T2  | P1       | DGII accuracy of the design         | —                      | Refuter Reviewer       | The chosen consult is the one DGII publishes the flag on, per document type                     | 2        | PASS               |
| T3  | P1       | Failure modes & ordering            | —                      | Reliability Reviewer   | Marker deletion still happens only on `No encontrado`; added calls cannot cause a double-issue  | 2        | PASS               |
| T4  | P2       | TypeScript fix + tests              | Senior Developer       | Code Reviewer          | `bunx vitest run`, types clean under `strict`                                                   | —        | DONE               |
| T5  | P3       | Python fix + tests                  | Senior Developer       | Code Reviewer          | `uv run pytest`, `mypy --strict` clean                                                          | —        | DONE               |
| T6  | P2⇄P3    | Cross-package review + parity       | —                      | Code Reviewer          | Same chain, same order, same fallbacks, same error codes in both                                | 3        | PASS               |
| T7  | —        | Failing-first proof + CI gates      | —                      | Evidence Collector     | The new test **fails** with `src` at `main` and **passes** with the fix; `mise run ci` green    | 1        | PASS               |
| T8  | P4       | `architecture.md` + `docs/{en,es}`  | Technical Writer       | Evidence Collector     | Contract doc matches code; `mkdocs build --strict` + locale parity green                        | 2        | PASS               |
| T9  | —        | Final integration gate              | —                      | Reality Checker        | Close rule satisfied, both packages identical, no creep into signing/retry/idempotency ordering | 1        | PASS               |
| T10 | —        | Commits + PR                        | Git Workflow Master    | Orchestrator           | Conventional Commits (`fix(typescript)`, `fix(python)`), evidence in PR body                    | —        | DONE — **PR #128** |

### Close note

**PR:** https://github.com/deuriib/dgii-ecf/pull/128 — opened 2026-11-10, base `main`, 5 Conventional Commits.
PR body carries the failing-first link (`project-tasks/126-evidence/t7-failing-first.md`), the T6 parity
verdict, the round-trip cost and the Decision-3 public-surface call-out. **Merge is the repo owner's**
(deuriib); no self-merge. Release-please cuts the patch releases on merge; nothing version/tag/changelog
related was touched.

Attempt ceiling is 3 per task, then BLOCKED + escalation.

### Invariants the fix must not break (from `AGENTS.md`)

- Results, not exceptions; `toDgiiError` / `to_dgii_error` remains the single normalizer.
- Retry predicate unchanged: network/transport + 408, 429, 5xx. Never other 4xx.
- Idempotency persists **before** transmit; the marker is deleted on failure and cleared **only** on `No encontrado`.
- `delivered` / `cleared` semantics unchanged — they drive marker deletion, not reporting.
- Money untouched; signing untouched (no XMLDSig gate needed, but `mise run ci` is mandatory).
- Strictness: no `any`, no `Any`.
- Versions, tags and changelogs are release-please's; no hand edits.
- Public contract change → `project-docs/architecture.md` updated in the same change set.

## Escalations register

| ID   | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Owner        | Status                                                                          |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------- |
| ES-1 | **Subagent spawns disabled** — the `task` tool refused all spawns for this run's closer (`Cannot spawn 'task'. Allowed: none`). Evidence Collector / Reality Checker procedures for T7/T8/T9/T10 were executed directly by the orchestrator, acting in the validator role with the validator brief, and each artifact names the substitution. No producer validated its own output: T7/T8/T9/T10 evidence was produced by the orchestrator **after** the producers' (T4/T5/T6, Technical Writer) work, from observed logs and diffs, not from producer claims.                                                                                                                                       | Orchestrator | CLOSED (substitution recorded in each artifact)                                 |
| ES-2 | **T9 official-source line: tasklist byte-for-byte clause vs frozen C-1 P10.** The tasklist T9 DoD says the `Official source`/`Fuente oficial` line is unchanged byte-for-byte; the frozen design's P10 (validated by T2/T3, backed by E19) orders re-pointing the `No encontrado` citation from _Consulta de trackId_ to _Consulta de estado e-CF_ in all four lines (resilience + flow, en + es). Resolution: **C-1 wins** (later, validated, DGII-accuracy authority; the tasklist rationale predates E19). Minimal re-point applied — only the consult name in the `No encontrado` attribution; flag citations, URLs and access dates byte-identical to `main`. Recorded in `t9-site-docs.md` §3. | Orchestrator | CLOSED (C-1 applied)                                                            |
| ES-3 | **T6 §7.2 anchors vs tasklist §5 non-goals** for `docs/*/{typescript,python}.md` and the flow.md diagram/snippets. T6 requires edits on the typescript/python pages; the tasklist lists them as untouched non-goals. Inspection showed those pages do not misstate the new behaviour (method tables name return types only; no body-handling or annotation claims), so the tasklist scope holds: **no edit**, and the items stay as named residuals (F-126-14/F-126-15 registration rows + T6's own list) for a future docs pass. flow.md's §7 official-source line _did_ misstate the consult for `No encontrado` and was re-pointed (ES-2).                                                        | Orchestrator | CLOSED (tasklist scope holds for the two pages; justified flow.md edit applied) |
| ES-4 | **`mise run ci` blocked by 33 untracked, non-source files** failing root prettier (`.omp/agents/*`, `project-docs/marketing/github-listing.md`, one T6 evidence file). None belongs to the shipped change (CI on the PR checks out only tracked files). Resolution: format-only `prettier --write` on the untracked artifacts (zero semantic change, none enters a commit) and re-ran `mise run ci` → green. Recorded in `t7-failing-first.md` §4.                                                                                                                                                                                                                                                   | Orchestrator | CLOSED (hygiene, not a weakening)                                               |

## Stage 6 — Lessons

- **The tasklist and the contract can drift mid-run.** T9's byte-for-byte clause was written before E19
  established that the official-source line mis-cites the consult. The frozen contract is the authority for
  DGII content; the run closed by applying C-1 and recording the deviation in both artifacts, not by
  silently following either text. Next run: any tasklist DoD that pins _content accuracy_ should cite the
  design row it depends on.
- **A doc-accuracy defect is still a defect.** The Technical Writer's first T8/T9 pass restated the contract
  without register citations and had two snippet fields that contradicted the shipped types — caught only by
  the read-back pass the evidence procedure forces. Snippet-to-code read-back is the highest-value check in
  this gate.
- **Untracked harness artifacts break root prettier locally but never in CI.** The first `mise run ci`
  failed on 33 files that a checkout would not contain. Format them or gitignore the harness dir instead of
  accepting a red gate.
- **Spawn-less fallback worked because the evidence is mechanical.** The close rule survived the disabled
  spawns because failing-first is an observation, not a judgment: the orchestrator could run the exact
  §T7 procedure and capture logs no human or persona could dispute.
