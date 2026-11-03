# AGENTS.md

Two publishable SDKs for DGII e-CF (Dominican Republic electronic invoicing) that must stay
behaviourally identical: `packages/typescript` (npm `@deuriib/dgii-ecf`) and `packages/python`
(PyPI `py-dgii-ecf`, import `py_dgii_ecf`). There is no shared code and no codegen — parity is
maintained by hand, so any behavioural change lands in **both** packages.

`project-specs/dgii-ecf-setup.md` is the requirement source; `project-docs/architecture.md` is the
contract, kept in sync with the exported surface. When they disagree the source wins:
`src/index.ts` and `__init__.py` are authoritative. The client is `ECF` in both packages, and
`P12Reader(passphrase)` / `Signature(key, cert)` are instance-based — changing a public contract
means updating the architecture doc in the same commit.

## Commands

Everything is pinned by `mise.toml`. There is no root `package.json`, so root-level prettier runs the
TypeScript package's binary.

```bash
mise install && mise run bootstrap   # toolchains + deps + git hooks
mise run ci                          # lint + test + build
mise run lint                        # tsc, ruff, mypy, repo-wide prettier --check
mise run test                        # vitest + pytest
mise run build                       # tsup + uv build
mise run hooks                       # pre-commit run --all-files
```

`mise run ci` does **not** include the XMLDSig gate. That runs separately, and it is the only check
that catches canonicalization regressions: `mise run verify-signing-typescript` and
`cd packages/python && uv run --with xmlsec python scripts/verify_signing.py` (both need
`xmlsec1`/`xmlsec` available).

Focused runs:

```bash
cd packages/typescript && bunx vitest run test/signing.test.ts      # one file
cd packages/typescript && bunx vitest run -t 'digest'               # one test
cd packages/python && uv run pytest tests/test_signing.py -k digest # one test
```

Notes that save a round trip: `mise run lint-python` and the `mypy` hook typecheck `src` only, never
`tests`. `uv` commands must use `--frozen` in hooks so `uv.lock` never changes as a side effect.

## Invariants an edit will break

- **Results, not exceptions.** Domain and I/O failures are returned (`neverthrow` in TS, `result` in
  Python); only programmer errors throw. `toDgiiError` / `to_dgii_error` is the single normalizer —
  don't create `DgiiError` values on the direct path otherwise. TS public API is async, Python is
  synchronous (`httpx2.Client`); don't add `async` to Python.
- **Money is never floating point.** TS keeps amounts as `string`, Python as `Decimal`; use
  `compareDecimal` / `compare_decimal` for comparisons. Never `Number()`/`parseFloat`/`float()` an
  amount — a rounding drift corrupts the signed digest.
- **Signing is byte-fidelity work.** Both SDKs sign with inclusive C14N 1.0 + RSA-SHA256, and TS
  relies on xml-crypto canonicalizing the node-set _before_ the built-in SHA-256 hashes it. Do not
  "simplify" the canonicalization, sort attributes by hand, re-introduce a custom digest, or
  pretty-print. Unit tests recompute the same code path, so they pass on a broken digest; only
  libxmlsec1 disagrees. Any signing change needs the XMLDSig gate and both packages updated together.
- **Retry predicate is deliberately narrow:** network/transport plus 408, 429, 5xx. Never retry other
  4xx — a rejected e-CF must not be re-sent.
- **Idempotency persists before transmit.** `sendElectronicDocument`/`sendSummary` (and commercial
  approval / voiding) write `"pending"` under `RNC + eNCF + SHA-256(signedXml)` before sending and
  delete it on failure. Query methods are not keyed. Preserve the ordering.
- **Reception routing is derived from the signed XML.** `<RFCE>` → `recepcionfc`. `E32` at or above
  RD$250,000 → general reception. `E32` **below** it is rejected — the caller must run
  `convertECF32ToRFCE` first. Don't hardcode the endpoint at call sites.
- **Strictness is on**: TS `strict`, Python `mypy --strict` plus `disallow_any_explicit` (no `Any`,
  no `any` — use `unknown` + narrowing). TS is ESM: relative imports carry the `.js` extension.
- **TS `validateDocument` shells out to `xmllint`**; there is no bundled XSD engine. Its unit tests
  inject a fake binary, so a green suite does not prove the binary exists locally — set
  `DGII_XMLLINT_BIN` or install `libxml2-utils`.

## Tests and fixtures

- `examples/fixtures/` is shared by both suites and is **byte-sensitive**: those XML files are hashed
  by XMLDSig, so reformatting them invalidates signing tests. They are deliberately excluded from
  prettier and the whitespace/EOF pre-commit hooks — keep it that way.
- Both suites sign with ephemeral, in-test self-signed certificates. Never add committed key material.
- The DGII XSDs are vendored three times: `packages/typescript/schemas/`,
  `packages/python/src/py_dgii_ecf/schemas/`, `examples/fixtures/schemas/`. They must stay
  byte-identical; edit all copies or none.
- Three published DGII schemas do not compile and are kept under `upstream-invalid/` for traceability.
  Do not patch them — validation reports them as unavailable on purpose.
- Integration tests (`tests/integration`, `test/integration`) are opt-in via `DGII_P12_PATH`,
  `DGII_P12_PASSWORD`, `DGII_RNC` and need an **unused** `DGII_ENCF` / `DGII_RFCE_ENCF` per run.
  `DGII_ENVIRONMENT=eCF` is rejected; they only run on manual dispatch in CI.

## Docs

`docs/en/` and `docs/es/` are mirrored folder trees — CI diffs their file lists and fails on any
mismatch, and `mkdocs build --strict` fails on broken nav or links. Add a page to both locales or
neither. `site/` is generated output and gitignored.

## Releases

- Commit subjects are enforced by `scripts/check_commit_msg.sh`: Conventional Commits, type plus
  optional lowercase scope, under 72 characters.
- Versions, tags (`typescript-v*` / `python-v*`) and `CHANGELOG.md` files are owned by
  `release-please`. Never hand-edit a changelog or a version field; the two packages release
  independently, so their versions are intentionally different.
- `packages/python/uv.lock` records the project version and is rewritten by release-please through a
  `.value` JSONPath in `release-please-config.json` (that `.value` is not a typo). After changing
  dependencies run `uv lock` and commit it — CI runs `uv lock --check`.
- `examples/*` are separate projects resolving the SDK by path dependency, with their own lockfiles.

## Secrets

`.p12`, `.pem`, keys and tokens never enter the repo: the `certificate-material` hook and `gitleaks`
reject them. Generate certificates locally (`examples/python/generate_cert.py`,
`examples/typescript/generate-cert.ts`); outputs go to the gitignored `examples/output/`.
