# Contributing to dgii-ecf

¡Gracias por contribuir! 🎉 This is a polyglot monorepo for the Dominican
Republic's DGII e-CF (electronic invoicing) system. It ships two SDKs:

- `packages/typescript` → npm `@deuriib/dgii-ecf`
- `packages/python` → PyPI `py-dgii-ecf` (import `py_dgii_ecf`)

## Prerequisites

Everything is pinned and managed with [mise](https://mise.jdx.dev):

```bash
mise install        # installs bun, node, python, uv
mise run bootstrap  # installs dependencies for both packages
```

## Development setup

```bash
# TypeScript (bun)
cd packages/typescript
bun install
bun run test       # vitest
bun run typecheck  # tsc --noEmit
bun run lint       # tsc --noEmit && prettier --check .
bun run build      # tsup (dist/)

# Python (uv)
cd packages/python
uv sync
uv run pytest            # tests
uv run ruff check .      # lint
uv run ruff format .     # format
uv run mypy src          # typecheck
uv run pytest --cov=py_dgii_ecf
```

Or run everything from the root:

```bash
mise run lint
mise run test
mise run build
mise run ci       # lint + test + build
```

### Integration tests (opt-in)

`packages/python/tests/integration/` and
`packages/typescript/test/integration/` talk to a real DGII environment, so
they are skipped unless credentials are present:

| Variable            | Required            | Purpose                                             |
| ------------------- | ------------------- | --------------------------------------------------- |
| `DGII_P12_PATH`     | yes                 | certificate bundle                                  |
| `DGII_P12_PASSWORD` | yes                 | bundle password                                     |
| `DGII_RNC`          | yes                 | issuer RNC                                          |
| `DGII_ENVIRONMENT`  | no                  | `TesteCF` or `CerteCF` (default). `eCF` is rejected |
| `DGII_ENCF`         | to submit an e-CF   | a fresh, authorised sequence number                 |
| `DGII_RFCE_ENCF`    | to submit a summary | a fresh, authorised RFCE sequence number            |

`DGII_ENCF` and `DGII_RFCE_ENCF` must be **unused**: DGII rejects a repeated
sequence number, so every submission run needs a new one.

`.github/workflows/integration.yml` runs the suites on manual dispatch only,
and only when the `DGII_P12_BASE64`, `DGII_P12_PASSWORD` and `DGII_RNC`
secrets exist.

## Git hooks (pre-commit)

Hooks are managed with [`pre-commit`](https://pre-commit.com/) and pinned in
`mise.toml`, so every contributor runs the same versions. After `mise install`:

```bash
mise run hooks-install   # one-time: installs the pre-commit + commit-msg hooks
mise run hooks           # run every hook against the whole repository
```

`mise run bootstrap` calls `hooks-install` for you.

The hooks run the repository's own pinned toolchain — `ruff`, `mypy`,
`prettier`, `tsc`, `gitleaks` — rather than versions vendored by a hook
repository, so they are byte-identical to `bun run lint` and `uv run mypy src`.
`mypy` and `tsc` typecheck their whole package, so they run once per commit
instead of once per file.

What is enforced:

| Hook                   | Scope                                                       |
| ---------------------- | ----------------------------------------------------------- |
| `ruff`, `ruff-format`  | `packages/python`                                           |
| `mypy --strict`        | `packages/python/src`                                       |
| `tsc --noEmit`         | `packages/typescript`                                       |
| `prettier --check`     | every tracked `.md`, `.json`, `.yaml` and JS/TS file        |
| `gitleaks`             | every file                                                  |
| `certificate-material` | rejects `*.p12`, `*.pfx`, `*.pem`, `*.jks`, `*.der`, `*.p8` |
| `conventional-commit`  | the commit subject                                          |

The hooks are not a substitute for CI: the `pre-commit` workflow runs
`mise run hooks` on every pull request, so a commit made with `--no-verify`
is still verified before merge.

## Certificates

Never commit DGII certificates or private keys — the `certificate-material`
hook rejects them, and `gitleaks` scans every file. Generate them locally
instead; `examples/output/` is gitignored for exactly this reason.

## Commit conventions

We use [Conventional Commits](https://www.conventionalcommits.org/). The
automated release tooling (`release-please`) reads commit messages to compute
semantic versions and changelogs.

```
feat(typescript): add sendSummary idempotency
fix(python): normalize customer directory single-object response
docs: clarify certificate rotation
BREAKING CHANGE: signXml now returns a Result
```

- `feat` → MINOR, `fix` → PATCH, `BREAKING CHANGE:` footer → MAJOR.
- Scope is optional but encouraged: `typescript`, `python`, `ci`, `docs`, etc.

## Pull requests

1. Branch from `main`.
2. Make focused, atomic commits (one logical change per commit).
3. Ensure `bun run test` / `uv run pytest`, lint, and typecheck pass.
4. Open a PR using the provided template.
5. CI runs on every push and PR. A release PR is auto-generated by
   `release-please` — do not open manual release PRs.

## Branch protection

`main` is protected. The settings that matter, and why:

| Setting                           | Value                                                                  | Why                                                                                      |
| --------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Required checks                   | `CI (@deuriib/dgii-ecf)`, `CI (py-dgii-ecf)`, `pre-commit (all files)` | Every gate runs on the PR, not only locally                                              |
| `enforce_admins`                  | `true`                                                                 | Applies to the maintainer too — a required check that the owner can bypass is not a gate |
| `strict` (branch up to date)      | `true`                                                                 | A PR that was green against an older `main` can still break `main`                       |
| `required_approving_review_count` | `0`                                                                    | See below                                                                                |
| `require_code_owner_reviews`      | `false`                                                                | See below                                                                                |

### Why zero approvals

This repository has one maintainer, and GitHub does not allow self-approval. Setting
`required_approving_review_count` to `1` — or enabling `require_code_owner_reviews`,
since `.github/CODEOWNERS` names the same account — would make every pull request
unmergeable, including the automated release PRs.

Those two settings are therefore a known, accepted gap, not an oversight. They become
viable the moment a second maintainer is added; at that point raise the count to `1`
and enable CODEOWNERS reviews.

### Consequences worth knowing

- **No `--admin` merges.** `enforce_admins` removes the override, so a red check
  blocks everyone. If CI itself breaks, fix CI in a PR — do not reach for the override
  (it will be refused).
- **Stale branches must be updated.** If `main` moves while a PR is open, the PR has
  to be brought up to date before merging, because `strict` is on.
- **A green PR can still be a lie.** Checks run against the PR's head commit; a
  branch-name or environment assumption that only holds on a `pull_request` checkout
  will not hold on the `push` to `main`. Verify the post-merge run.

## Releases

Releases are fully automated with [`release-please`](https://github.com/googleapis/release-please)
in **manifest mode** (independent versions per package):

1. Merging a PR with `feat`/`fix` commits updates a release-please PR.
2. Merging the release-please PR creates a tag (`typescript-vX.Y.Z` /
   `python-vX.Y.Z`), bumps the version, and generates the changelog.
3. Tags created with `GITHUB_TOKEN` do not trigger other workflows, so the
   release-please workflow dispatches the publish workflows explicitly
   (`workflow_dispatch`) → npm (`@deuriib/dgii-ecf`) and PyPI (`py-dgii-ecf`).
4. Publishing uses **OIDC trusted publishing** — no `NPM_TOKEN` or `PYPI_TOKEN`
   secrets. The first npm release is published manually to create the package;
   subsequent releases publish from GitHub Actions.

### The Python lockfile is versioned

`packages/python/uv.lock` records the project version in its
`[[package]] name = "py-dgii-ecf"` entry, so it drifts every time
release-please bumps `pyproject.toml`. The release PR updates both: the
`extra-files` entry in `release-please-config.json` rewrites
`$.package[?(@.name.value=='py-dgii-ecf')].version` in the lock.

That JSONPath carries a `.value` and that is not a typo. release-please's
TOML updater parses scalars into tagged objects to track byte offsets, so a
plain `@.name=='py-dgii-ecf'` filter matches nothing and release-please logs
`No entries modified` while still opening a green-looking PR. The `.value`
reaches the actual string. If the lock ever stops being updated, CI fails on
the release PR — the drift is never silent.

- Do not hand-edit that line — if you changed dependencies, run `uv lock` and
  commit the result.
- CI runs `uv lock --check`, which fails when the lock does not match
  `pyproject.toml`. `uv sync --frozen` installs from the lock _without_ that
  validation, so the explicit check is what keeps the two honest.

## Security

Never commit `.p12`, `.pem`, private keys, tokens, or production credentials.
See [SECURITY.md](SECURITY.md).

## Code of conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE).
