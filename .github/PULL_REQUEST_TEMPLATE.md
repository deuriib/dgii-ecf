## Description

<!-- What does this change and why? -->

## Type of change

<!-- Check the box(es) that apply -->

- [ ] `feat` — new feature (semver MINOR)
- [ ] `fix` — bug fix (semver PATCH)
- [ ] `docs` — documentation only
- [ ] `refactor` — neither fixes a bug nor adds a feature
- [ ] `perf` — performance improvement
- [ ] `test` — adding/correcting tests
- [ ] `build`/`ci`/`chore` — build system, CI, or maintenance

## Scope

<!-- Which package(s) does this affect? -->

- [ ] `packages/typescript` (`@deuriib/dgii-ecf`)
- [ ] `packages/python` (`dgii-ecf`)
- [ ] Monorepo / tooling / docs

## Checklist

- [ ] I read [CONTRIBUTING.md](CONTRIBUTING.md)
- [ ] Tests pass locally (`bun run test` and/or `uv run pytest`)
- [ ] Lint + typecheck pass (`bun run lint` / `uv run ruff check . && uv run mypy src`)
- [ ] I followed [Conventional Commits](https://www.conventionalcommits.org/)
- [ ] No secrets, `.p12`/`.pem`, tokens, or production URLs committed
- [ ] Breaking changes are documented with `BREAKING CHANGE:` in the commit body

## Related issues

<!-- e.g. Closes #123 -->

---

> ⚠️ **Security reminder:** never commit DGII certificates, private keys, or RNC credentials.
