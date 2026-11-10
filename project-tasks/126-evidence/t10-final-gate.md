# T10 — Final integration gate: close-rule audit

**Gate owner:** Reality Checker (procedure executed by the orchestrator — see the run note)
**Task ref:** `project-tasks/126-tasklist.md` §T10 (satisfies CR1; audits A1–A9) · **Attempt:** 1 of 1
**Date:** 2026-11-10 (UTC) · **Branch:** `fix/126-can-reuse-sequence` @ `e0b5f13`

## 0. Verdict

**PASS.** Every acceptance criterion A1–A9 points at a concrete, openable artifact; CR1 is satisfied as
written — the committed test was **observed failing** against `main`'s `src` for the recorded cause and
**observed passing** with the fix restored. The forbidden-path audit is empty, and the three gates
(`mise run ci`, `mise run hooks`, `mise run docs-build`) are green on the final tree.

## 1. A1–A9 + CR1 — one concrete artifact per criterion

| ID      | Criterion                                                                                                                              | Artifact / evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1**  | A reject with `consultaresultado.secuenciaUtilizada: false` ⇒ `canReuseSequence` true; `true` on the wire ⇒ false                      | TS `reconcileSubmission > [T-I] reports a reusable sequence and keeps the marker on a rejection` and `canReuseSequence > is false for a non-rejection, even with the flag present` — `t7-pass-ts.log` (60/60). Py `test_reports_a_reusable_sequence_on_a_rejection` + `test_can_reuse_sequence` — `t7-pass-py.log` (48/48). Parity cells in `t6-code-review-parity-attempt3.md` §2/§3.                                                                                                                                  |
| **A2**  | Mocked wire matches the frozen chain; no test derives the flag from `consultaestado`; request order asserted                           | Test routers key on the URL fragments `consultaestado/api/consultas/estado`, `consultatrackids/api/trackids/consulta`, `consultaresultado/api/consultas/estado` (`test/reconciliation.test.ts` `mockFetch`; `tests/test_reconciliation.py` `make_client`). The `consultaestado` payload in every case carries **no** flag (T6 D-4: `grep` shows no fixture puts the flag on `consultaestado`); call-order assertions compare recorded request arrays (`t7-fail-ts.log` shows the array-length failures against `main`). |
| **A3**  | Same chain/order/fallbacks/errors in both packages, proven by review                                                                   | `t6-code-review-parity-attempt3.md` — PASS attempt 3: 76/76 reconcile matrix rows agree on decision-bearing values, 90/90 hostile-field cells SAME, 42/42 predicate + 144/144 hand-built-model cells agree; 5 transport-only diffs registered (F-126-8/F-126-13).                                                                                                                                                                                                                                                       |
| **A4**  | Absent/`null`/empty-list/no-track-id all answer `false` without throwing; happy path reachable                                         | TS `[T-A]`/`[T-B]` (empty/null body), `[T-F]` (empty listing), `[T-O]`/`[T-P]` (several tracks / no `trackId`), matrix rows R13e/R14a/R10j/R17c/R13g — all green in `t7-pass-ts.log`; Python twins in `t7-pass-py.log` (48/48).                                                                                                                                                                                                                                                                                         |
| **A5**  | Idempotency ordering, `delivered`/`cleared` semantics, retry predicate byte-for-byte unchanged; marker deleted only on `No encontrado` | `git diff --stat main -- packages/typescript/src/resilience.ts packages/python/src/py_dgii_ecf/resilience.py` → **empty**; marker tests pass unmodified (`keeps the marker…`, `clears the marker…` in both suites); reconcile delete sits after the chain, only when `cleared` (`client.ts:495-497`, `client.py:563-565`); T3 note §2 ordering table.                                                                                                                                                                   |
| **A6**  | Contract frozen in `126-contract-design.md`, DGII claims citing register rows, R10 branch decision recorded                            | Contract §16.6 freeze line (T2 PASS + T3 PASS recorded); §9.4's design provenance cites register `TEC-02`/`TEC-01`; R10 branch decision in contract §2.2/§11 (Option A adopted; "stop exposing the capability" rejected).                                                                                                                                                                                                                                                                                               |
| **A7**  | Failing-first observed, for the recorded cause, same test passes after                                                                 | `project-tasks/126-evidence/t7-failing-first.md` + `t7-fail-ts.log` (`[T-I]` → `expected false to be true`), `t7-fail-py.log` (`assert False is True`), `t7-pass-ts.log` (60/60), `t7-pass-py.log` (48/48). No "would fail" wording anywhere.                                                                                                                                                                                                                                                                           |
| **A8**  | `architecture.md` + `docs/en` + `docs/es` describe exactly the implemented behaviour; `mkdocs build --strict` + locale diff green      | `t8-architecture.md` (read-back table maps each §9.4/§9.5 sentence to a code line) + `t9-site-docs.md`; `mise run docs-build` exit 0; locale file-list diff empty; prettier clean on all five docs files.                                                                                                                                                                                                                                                                                                               |
| **A9**  | `mise run ci` green; no `any`/`Any`; no hand-edited version/changelog; no signing/fixture touch                                        | `t7-ci.log` (final re-run exit 0: lint + test + build across the monorepo); `tsc --noEmit` (strict) + `mypy --strict` green; `git diff` grep for `any`/`Any`/`cast(`/`type: ignore` in the src diffs → **empty**; forbidden-path audit in §2 empty.                                                                                                                                                                                                                                                                     |
| **CR1** | Close rule: automated test observed failing for the recorded cause before the fix and passing after; no second close path              | §T7 of the tasklist + `t7-failing-first.md` §2/§3. The failure ties to the wrong-consult read (`client.ts:390`→`403`, `client.py:507`→`520`): the wire's `consultaresultado.secuenciaUtilizada === false` produces `true` only after the fix. This is the only close path and it is satisfied.                                                                                                                                                                                                                          |

## 2. Forbidden-path audit (all empty)

```text
$ git diff --stat main -- CHANGELOG.md package.json pyproject.toml uv.lock examples/ \
    packages/typescript/src/signing.ts packages/python/src/py_dgii_ecf/signing.py examples/fixtures/
  → (no output)
$ git diff --name-only main -- | sort
  docs/en/guides/flow.md                    docs/es/guides/flow.md
  docs/en/guides/resilience.md              docs/es/guides/resilience.md
  packages/python/src/py_dgii_ecf/client.py packages/python/src/py_dgii_ecf/reconciliation.py
  packages/python/src/py_dgii_ecf/types.py packages/python/tests/test_client.py
  packages/python/tests/test_reconciliation.py packages/python/tests/test_types.py
  packages/typescript/src/client.ts         packages/typescript/src/reconciliation.ts
  packages/typescript/src/types.ts          packages/typescript/test/reconciliation.test.ts
  project-docs/architecture.md
```

No `CHANGELOG.md`, no `version` field change, no `uv.lock` change, no `examples/**`, no signing module, no
byte-sensitive fixture, no vendored XSD. The 14 files are exactly the change set.

## 3. Gates on the final tree

| Gate                                            | Result                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mise run ci`                                   | **exit 0** — lint-typescript (`tsc --noEmit` + prettier), lint-python (ruff + ruff format + `mypy src`), lint-format (root prettier, whole repository), test-typescript (212 passed / 3 skipped), test-python (244 passed / 3 skipped), build-typescript + build-python. The 3+3 skips are the pre-existing DGII-credential integration tests, unchanged by this branch. |
| `mise run hooks`                                | **exit 0** — merge-conflict, toml/yaml, private-key, EOL, mixed-line-ending, branch, whitespace, ruff, ruff-format, prettier (repository), tsc, mypy (strict), gitleaks all pass.                                                                                                                                                                                        |
| `mise run docs-build`                           | **exit 0** — strict build, en + es sites; `site/es/index.html` exists.                                                                                                                                                                                                                                                                                                   |
| Locale diff (`docs/en` vs `docs/es` file lists) | **empty**.                                                                                                                                                                                                                                                                                                                                                               |

## 4. Residual check (from T6 §6 and T3 errata)

- **T3 errata E-1…E-7**: applied to the contract text in the bounded errata pass recorded at contract §16.6 (E-1 resource-always-None, E-2 two-call budget row, E-3 per-attempt bulkhead, E-4 T-A/T-B Python red-first scope — all present in the frozen text).
- **T6 RES-1/RES-2**: registered in `project-docs/architecture.md` §14.1 ("Model echo (RES-1)", "Off-path (RES-2)") and in the contract's §15 (F-126-14/F-126-15) — closed.
- **T6 RES-3/RES-4/RES-5**: closed by the contract-file amendments (§16.6 chronicle sentence, §8.3 "in either package", §6 isinstance-guarded snippet) — closed.
- **T6 RES-6**: recorded in the T6 note itself — closed by record.
- No residual changes any answer; none blocks the close rule.

## 5. Evidence files for this gate

`project-tasks/126-evidence/t7-failing-first.md` (+ the four logs and `t7-ci.log`),
`project-tasks/126-evidence/t8-architecture.md`, `project-tasks/126-evidence/t9-site-docs.md`,
`project-tasks/126-evidence/t6-code-review-parity-attempt3.md`,
`project-tasks/126-evidence/t3-reliability-contract-design-attempt2.md`,
`project-tasks/126-evidence/t2-refuter-contract-design-attempt2.md`.
