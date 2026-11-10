# T7 — Failing-first evidence + CI gates

**Validator:** Evidence Collector (procedure executed by the orchestrator — see note)
**Task ref:** `project-tasks/126-tasklist.md` §T7 (satisfies A7, A9; close rule CR1)
**Date:** 2026-11-10 (UTC) | **Branch:** `fix/126-can-reuse-sequence` | **HEAD (before and after):** `e0b5f1356c422e9407ceff25b147c35bad60d263` (= base `main`; the fix lives in the working tree, as planned)

## 1. Procedure transcript

The exact `git stash` procedure from §T7, executed with the committed tests in place and the
fix hidden:

```text
$ git rev-parse HEAD
e0b5f1356c422e9407ceff25b147c35bad60d263
$ git stash list                    # before: empty
$ git stash push -m '126-fix' -- packages/typescript/src packages/python/src/py_dgii_ecf
ok stashed
$ git stash list
stash@{0}: 126-fix
# → the two src trees are back at main's content; the modified test files stay in place
$ (cd packages/typescript && bunx vitest run test/reconciliation.test.ts) 2>&1 | tee project-tasks/126-evidence/t7-fail-ts.log
$ (cd packages/python && uv run --frozen pytest tests/test_reconciliation.py) 2>&1 | tee project-tasks/126-evidence/t7-fail-py.log
$ git stash pop
ok stash pop
$ git stash list                    # after: empty — nothing was left in the stash
$ (cd packages/typescript && bunx vitest run test/reconciliation.test.ts) 2>&1 | tee project-tasks/126-evidence/t7-pass-ts.log
$ (cd packages/python && uv run --frozen pytest tests/test_reconciliation.py) 2>&1 | tee project-tasks/126-evidence/t7-pass-py.log
$ mise run ci                       # full log: project-tasks/126-evidence/t7-ci.log
```

No conflict occurred; the worktree route was not needed. The working tree after `stash pop`
is byte-identical to the pre-stash state (13 modified files + the same untracked set; `git
stash list` empty).

## 2. Observed failure — with `main`'s `src`, the committed test fails for the recorded cause

**TypeScript** (`t7-fail-ts.log`, run start `2026-11-10T13:05:12Z`) — 36 failed / 24 passed:

```text
× reconcileSubmission > [T-I] reports a reusable sequence and keeps the marker on a rejection 3ms
  → expected false to be true // Object.is equality
```

`[T-I]` mocks a TEC-02-shaped `consultaestado` (no reuse flag), a `consultatrackids` listing
with one track, and a `consultaresultado` payload carrying `secuenciaUtilizada: false`. The
test asserts `canReuseSequence === true` (reusable rejection). Against `main`'s `src`, the
reconcile never calls `consultaresultado`; the flag is read from `inquiryStatus`'s
`consultaestado` response, which carries none, so the answer is `false`.

**Python** (`t7-fail-py.log`, run start `2026-11-10T13:05:36Z`) — 35 failed / 13 passed:

```text
________________ test_reports_a_reusable_sequence_on_a_rejection ________________
>       assert outcome.can_reuse_sequence is True
E       AssertionError: assert False is True
```

Same cause, same shape: `can_reuse_sequence` is derived from the `consultaestado` response
(`secuencia_utilizada=None`), never from the `consultaresultado` payload the mock publishes.

**One-line cause statement (both packages):** the committed test fails because `main`'s
reconcile derives the reuse flag from the `consultaestado` read (`packages/typescript/src/client.ts:390`
→ `:403`; `packages/python/src/py_dgii_ecf/client.py:507` → `:520`) — the exact defect #126
records — and `consultaestado` publishes no `secuenciaUtilizada`, so the reusable answer the
wire supports can never be produced. The failure is not a missing mock and not a fixture
problem: the mocked payloads are contract-shaped, the routes exist, and the same tests pass
once the fix is restored (below).

The remaining failing tests in the against-`main` runs are the suite's other new tests
exercising the fixed chain (request-order assertions, `consultatrackids`/`consultaresultado`
parsing, marker discipline). All of them fail against `main`'s `src` and pass with the fix —
they are the failing-first observation for the whole fixed behaviour, not pre-existing tests
that regressed.

## 3. Observed pass — the same committed tests with the fix restored

**TypeScript** (`t7-pass-ts.log`, run start `2026-11-10T13:05:56Z`):

```text
✓ test/reconciliation.test.ts (60 tests) 113ms
Test Files  1 passed (1)
     Tests  60 passed (60)
```

**Python** (`t7-pass-py.log`, run start `2026-11-10T13:06:01Z`):

```text
48 passed in 0.24s
```

## 4. Post-fix gates

`mise run ci` (run start `2026-11-10T13:06:07Z`, full output in `t7-ci.log`, final re-run
exit 0):

- **lint-typescript** — `tsc --noEmit` + prettier: clean.
- **lint-python** — `ruff check` + `ruff format --check` + `mypy src` (strict): clean.
- **lint-format** — root prettier over the whole repository: clean.
- **test-typescript** — 212 passed, 3 skipped (the skips are the pre-existing DGII-credential
  integration tests, unchanged by this branch).
- **test-python** — 244 passed, 3 skipped (same pre-existing skips).
- **build-typescript / build-python** — tsup and uv builds succeed.

No pre-existing test changed status between `main` and the fixed tree other than the new
tests added by T4/T5 (which fail on `main`'s `src` and pass on the fixed tree, as required).
No `any`/`Any` or cast escape was introduced (lint-typescript and mypy --strict are green).

### Gate hygiene note (transparent, not part of the shipped diff)

The first `mise run ci` invocation failed only at `lint-format`: root `prettier --check .`
flagged **33 untracked, non-source files** that are not part of this change — the 31
`.omp/agents/*.md` orchestrator-harness persona files, `project-docs/marketing/github-listing.md`
(an untracked artifact of the marketing area), and this run's own untracked
`project-tasks/126-evidence/t6-code-review-parity-attempt3.md`. None of these files is
committed or will be committed by this run; CI on the PR (which checks out only tracked
files) would not have seen them. To make the local gate honest, the 33 files were passed
through `prettier --write` (format-only, untracked, zero semantic change) and `mise run ci`
was re-run to a clean exit 0.

## 5. Verdict

**PASS.** The committed tests were observed failing against `main`'s `src` for the recorded
cause (`expected false to be true` / `assert False is True`, traceable to the wrong-consult
read) and passing with the fix restored. `mise run ci` is green. CR1 is satisfied; no claim
of "would fail" appears anywhere in this artifact or its logs.

## 6. Evidence files

| File                                        | Contents                                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `project-tasks/126-evidence/t7-fail-ts.log` | TS suite against `main`'s `src` — 36 failed, incl. `[T-I]`                                               |
| `project-tasks/126-evidence/t7-fail-py.log` | Python suite against `main`'s `src` — 35 failed, incl. `test_reports_a_reusable_sequence_on_a_rejection` |
| `project-tasks/126-evidence/t7-pass-ts.log` | TS suite with the fix — 60/60                                                                            |
| `project-tasks/126-evidence/t7-pass-py.log` | Python suite with the fix — 48/48                                                                        |
| `project-tasks/126-evidence/t7-ci.log`      | `mise run ci` full output                                                                                |
