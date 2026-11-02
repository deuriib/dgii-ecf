# Releases & publishing

Releases are fully automated with
[`release-please`](https://github.com/googleapis/release-please) in **manifest
mode** (independent versions per package).

## Flow

1. Merge a PR with `feat:` / `fix:` commits.
2. release-please opens (or updates) a release PR with the version bump and
   changelog.
3. Merging the release PR creates a tag (`typescript-vX.Y.Z` /
   `python-vX.Y.Z`).
4. release-please **dispatches** the publish workflows via `workflow_dispatch`
   (tags created with `GITHUB_TOKEN` do not trigger other workflows).
5. The publish workflows use **OIDC trusted publishing** — no long-lived tokens:
   - npm (`@deuriib/dgii-ecf`)
   - PyPI (`py-dgii-ecf`)

No `RELEASE_PLEASE_TOKEN`, `NPM_TOKEN` or `PYPI_TOKEN` is used.

## Trusted publishing setup

!!! note "First npm publish"
npm requires the package to exist before a trusted publisher can be
configured. The first release is published locally; subsequent releases
publish from GitHub Actions via OIDC.

### npm

Configure a trusted publisher on npmjs.com for `@deuriib/dgii-ecf`:

- Repository: `deuriib/dgii-ecf`
- Workflow: `typescript.yml`
- Allowed action: `npm publish`

Or from the CLI:

```bash
npm trust github @deuriib/dgii-ecf \
  --file typescript.yml --repo deuriib/dgii-ecf --allow-publish
```

### PyPI

Configure a pending/trusted publisher for `py-dgii-ecf`:

- Repository: `deuriib/dgii-ecf`
- Workflow: `python.yml`
- Environment: `pypi`

## Versioning

| Change             | Bump  |
| ------------------ | ----- |
| `feat:`            | MINOR |
| `fix:`             | PATCH |
| `BREAKING CHANGE:` | MAJOR |
