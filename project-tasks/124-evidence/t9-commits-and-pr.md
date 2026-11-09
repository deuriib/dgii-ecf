# T9 — Commit sequence and pull request (#124)

**Task:** shape the finished #124 work into a clean commit sequence on `docs/124-dgii-official-sources`
and open a pull request against `main`.
**Status:** DONE — 4 commits, branch pushed, PR **#125** open (not draft, not merged), all required
checks green.
**Date:** 2026-11-09 · **Base:** `main` @ `b44ebb4` (`chore: release main (#123)`).

---

## 1. Commit sequence

| #   | SHA                                        | Subject (≤72 chars)                                                      | Files                                                                                                                                   |
| --- | ------------------------------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `5788268c233e730d341abce6f98798eaa5521d45` | `chore(project-tasks): record the #124 source register and run evidence` | 17 — `124-source-register.md`, `124-dgii-official-sources-tasklist.md`, `124-dgii-official-sources-ledger.md`, `124-evidence/*.md` (14) |
| 2   | `6322b2fd441f0be3de2ef7ace6dbfa2729a6e7f0` | `docs: cite official DGII sources in the English guides`                 | 4 — `docs/en/reference/dgii-official.md`, `docs/en/guides/{flow,resilience,signing}.md`                                                 |
| 3   | `3baa99ddb1a411626746ff95e6bfc98533479224` | `docs: mirror the official DGII references in Spanish`                   | 4 — `docs/es/reference/dgii-official.md`, `docs/es/guides/{flow,resilience,signing}.md`                                                 |
| 4   | `7c81bf4334eeacafa39f07f89299c7c3dad20238` | `docs: add the DGII references page to the bilingual nav`                | 1 — `mkdocs.yml`                                                                                                                        |

```
$ git log --oneline main..HEAD
7c81bf4 docs: add the DGII references page to the bilingual nav
3baa99d docs: mirror the official DGII references in Spanish
6322b2f docs: cite official DGII sources in the English guides
5788268 chore(project-tasks): record the #124 source register and run evidence
```

Each commit is self-contained: 1 is inert run material, 2 and 3 are one locale each, 4 is the nav
entry that publishes them. Order matters only in that 4 assumes 2 and 3 exist.

All four subjects pass `scripts/check_commit_msg.sh` (Conventional Commits, lowercase scope, ≤72
chars; longest is #1 at 70).

## 2. Staging

Every path was staged explicitly by name — `git add -A` / `git add .` were never used. The
pre-existing untracked orphan `project-docs/marketing/github-listing.md` is **unrelated to #124** and
stays untracked on the branch and in the PR:

```
$ git status --short
?? project-docs/marketing/
```

## 3. Hooks

The repo's hooks ran normally on every commit — no `--no-verify`. `pre-commit` (trailing whitespace,
EOF, mixed line endings, `check-yaml --unsafe`, large files, `detect-private-key`,
`certificate-material`, `gitleaks` over the tree), `prettier --check` on the staged markdown/yaml, and
the `commit-msg` stage (`conventional-commit`). None failed, so nothing had to be fixed and no
out-of-scope file was touched. CI later re-ran the same set: **pre-commit (all files) pass**.

Gates re-run before committing, from a clean tree:

| Gate                                              | Command                                                                                               | Result                                                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Prettier (docs + `mkdocs.yml` + `project-tasks/`) | `packages/typescript/node_modules/.bin/prettier --check docs mkdocs.yml` / `… --check project-tasks/` | exit `0`, all files conform                                                                            |
| Locale parity (`*.md`)                            | `diff <(cd docs/en && find . -name '*.md' \| sort) <(cd docs/es && find . -name '*.md' \| sort)`      | exit `0`, 11 per locale                                                                                |
| Locale parity (all files)                         | same with `find . -type f`                                                                            | exit `0`                                                                                               |
| Strict build                                      | `uvx --from mkdocs --with mkdocs-material --with "mkdocs-static-i18n>=1.0,<2" mkdocs build --strict`  | exit `0`, `Documentation built in 2.81 seconds`, `Translated 13 navigation elements`, zero `WARNING -` |

## 4. Push

```
$ git push -u origin docs/124-dgii-official-sources
 * [new branch]      docs/124-dgii-official-sources -> docs/124-dgii-official-sources
branch 'docs/124-dgii-official-sources' set up to track 'origin/docs/124-dgii-official-sources'.
```

Upstream is `origin/docs/124-dgii-official-sources`; nothing was force-pushed (no rewrites).

## 5. Pull request

**URL:** https://github.com/deuriib/dgii-ecf/pull/125
**Title:** `docs: cite official DGII sources in the guides and add a reference page` (71 chars)
**Base** `main` ← **head** `docs/124-dgii-official-sources` · `isDraft: false` · `state: OPEN` ·
`mergeable: MERGEABLE` · 26 files, `+7521 −20`.

Body sections, as briefed: **What & why**, **Acceptance criteria** (all six #124 bullets ticked with
the command output or evidence file that proves each), **How the sources were established**,
**Verification recipe** (per-host UA rule + the one-line `curl`), **Run artifacts**, **Known
follow-ups**, and `Closes #124`.

CI at hand-off:

| Check                                                     | Result                      |
| --------------------------------------------------------- | --------------------------- |
| Build docs                                                | **pass** (16s)              |
| CI (@deuriib/dgii-ecf)                                    | **pass** (32s)              |
| CI (py-dgii-ecf)                                          | **pass** (13s)              |
| pre-commit (all files)                                    | **pass** (18s)              |
| Deploy to GitHub Pages / Publish to PyPI / Publish to npm | skipping (expected on a PR) |

Not merged, per the brief.

## 6. Decisions taken during T9 — read these

1. **The UA rule in the PR body is written the evidence-correct way, not the brief's wording.** The
   brief said to write that `dgii.gov.do` **and** `statusecf.dgii.gov.do` reject bot UA strings. The
   register's own verified measurements — and `t2-evidence-collector-links-attempt2.md`, which
   records this exact claim as a **FAIL that was corrected** — say `statusecf.dgii.gov.do` serves
   `200` to `curl`, to `python-requests`, to no UA and to a browser UA. Publishing the uncorrected
   claim would have re-introduced a defect the run had already fixed, so the PR body states
   `dgii.gov.do` = browser UA (or none), `statusecf` = any UA, `www.w3.org` = the inverse
   (browser UA → `403`), `rfc-editor.org` = plain. Same rule an auditor needs, no false statement.
2. **The nav is a `Reference` group, not a flat entry** (the brief for commit 4). Note this is a
   deliberate deviation from the run's own tasklist Decision 7, which `t8-reality-checker-final.md`
   (**RR-1**, Medium) flags as needing the issue author's sign-off because no sign-off artifact
   exists. The issue's own acceptance bullet is satisfied either way; the commit body explains the
   choice ("keeps the nav extensible for the reference material still to come"). **Owner decision
   still open:** accept the group, or apply the 2-line flatten and re-run T7.
3. **The ledger's per-task status rows were committed as signed off, not rewritten.** RR-3 notes that
   `124-dgii-official-sources-ledger.md` still shows T3 `PENDING — blocked by C-1`, T4/T5/T6 at
   attempt `0`, a malformed T7 row, and a run start date (`2026-02-14`) that disagrees with every
   evidence timestamp (`2026-11-09`), while the evidence files record PASS. Syncing the ledger is a
   producer's job, not T9's, and doing it silently would put unreviewed content in the run record.
   The PR body therefore points at the ledger as the run record **and** at
   `124-evidence/t8-reality-checker-final.md` as the authority for what each gate observed.
   **Recommended follow-up:** a small `chore(project-tasks)` commit that syncs those rows once the
   owner confirms the verdicts.
4. **This file is deliberately left uncommitted.** The brief fixed the sequence at four commits, and
   commit 1 (the committed run evidence) was authored before this report existed. Amending a pushed
   commit to add T9's own record would rewrite published history for no reader benefit, so
   `t9-commits-and-pr.md` sits in the worktree as the T9 hand-off artifact. If you want it in the
   branch, the cheapest clean move is a fifth commit after review
   (`chore(project-tasks): record the T9 commit and PR hand-off`) — say the word and it ships.

## 7. Verified-after-push state

- `git status --short` → only `?? project-docs/marketing/` (pre-existing, unrelated) plus this file.
- `git status -sb` → `## docs/124-dgii-official-sources...origin/docs/124-dgii-official-sources`
  (in sync, nothing to push).
- Working tree clean of anything #124 owns; `main` untouched locally and remotely.

## Outcome

Outcome: PASS — 4 atomic commits pushed, PR #125 open against `main` and fully green.
Details: All hooks ran unbypassed; the only false statement risk (the `statusecf` UA claim) was
caught and written correctly. Three owner decisions are open and recorded in §6: the nav group shape
(RR-1), syncing the ledger's stale rows (RR-3), and whether T9's report should become a fifth commit.
