# dgii-ecf

[English](README.md) · [Español](README.es.md)

> Electronic invoicing (e-CF) SDKs for the Dominican Republic's **DGII** —
> Dirección General de Impuestos Internos.

[![npm](https://img.shields.io/npm/v/@deuriib/dgii-ecf.svg?label=npm)](https://www.npmjs.com/package/@deuriib/dgii-ecf)
[![PyPI](https://img.shields.io/pypi/v/py-dgii-ecf.svg?label=pypi)](https://pypi.org/project/py-dgii-ecf/)
[![TypeScript CI](https://github.com/deuriib/dgii-ecf/actions/workflows/typescript.yml/badge.svg)](https://github.com/deuriib/dgii-ecf/actions/workflows/typescript.yml)
[![Python CI](https://github.com/deuriib/dgii-ecf/actions/workflows/python.yml/badge.svg)](https://github.com/deuriib/dgii-ecf/actions/workflows/python.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg)](https://www.conventionalcommits.org/)

Professional, polyglot monorepo with two publishable, production-oriented SDKs
for authenticating against DGII web services, signing electronic tax documents
with **XMLDSig** (inclusive C14N + RSA-SHA256), and transmitting them reliably.

| Package                                    | Language               | Registry                                               | Status |
| ------------------------------------------ | ---------------------- | ------------------------------------------------------ | ------ |
| [`@deuriib/dgii-ecf`](packages/typescript) | TypeScript (Bun-first) | [npm](https://www.npmjs.com/package/@deuriib/dgii-ecf) | 🚧     |
| [`py-dgii-ecf`](packages/python)           | Python (uv)            | [PyPI](https://pypi.org/project/py-dgii-ecf/)          | 🚧     |

## ✨ Features

Both SDKs share the same design contract:

- **Result pattern** — no hidden exceptions. TypeScript uses
  [`neverthrow`](https://github.com/supermacro/neverthrow); Python uses
  [`result`](https://github.com/rustedpy/result).
- **Resilience built-in** — retry + circuit breaker + timeout for every external
  call. TypeScript uses [`cockatiel`](https://github.com/connor4312/cockatiel);
  Python uses [`tenacity`](https://tenacity.readthedocs.io) +
  [`pybreaker`](https://pypi.org/project/pybreaker/).
- **Idempotent submission** — injectable `IdempotencyStore`, keyed by
  `RNC + eNCF + SHA-256(signed XML)`, so a retried send never double-issues.
- **Correct XMLDSig** — inclusive C14N 1.0, enveloped signature, RSA-SHA256,
  byte-for-byte compatible with DGII's `.NET` stack.
- **Full API surface** — authentication (SEED), document submission, summary
  invoices (RFCE), status/track-id queries, customer directory, commercial
  approval, and e-NCF voiding.
- **Money as `Decimal`** — floating-point rounding can never corrupt a digest.

## 📦 Layout

```text
packages/
├── typescript/   # @deuriib/dgii-ecf — bun, tsup, vitest, native fetch
└── python/       # py-dgii-ecf — uv, ruff, mypy, typer, httpx2
```

## 🚀 Quick start

### TypeScript

```bash
bun add @deuriib/dgii-ecf
```

```ts
import { ECF, P12Reader, Signature, Environment } from '@deuriib/dgii-ecf';

const { key, cert } = new P12Reader(process.env.CERT_PASSWORD!)
  .getKeyFromFile('/secure/identity.p12')
  .unwrapOrThrow(); // or .match(...)

const ecf = new ECF({ key, cert }, Environment.Cert);
const auth = await ecf.authenticate(); // Result<AuthToken, DgiiError>

const signed = new Signature(key, cert).signXml(xml); // Result<string, DgiiError>
```

### Python

```bash
uv add py-dgii-ecf
```

```python
from py_dgii_ecf import ECF, P12Reader, Signature, Environment

data = P12Reader(password).get_key_from_file("/secure/identity.p12").unwrap_or_raise()
ecf = ECF(data, Environment.CERT)
auth = ecf.authenticate()  # Ok(AuthToken) | Err(DgiiError)

signed = Signature(data.key, data.cert).sign_xml(xml)
```

> ⚠️ Server-side only. Never load these SDKs in a browser — they handle private
> keys and credentials.

## 🧪 Development & release

- Tools pinned via [`mise.toml`](mise.toml); `mise run ci` runs lint + test + build.
- Pre-commit hooks via [`.pre-commit-config.yaml`](.pre-commit-config.yaml).
- Automated releases via [`release-please`](release-please-config.json) (manifest
  mode, independent versions).

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## 📚 Documentation

- [Specification](project-specs/dgii-ecf-setup.md)
- [Architecture](project-docs/architecture.md)
- [Security](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)

## ⚖️ License

[MIT](LICENSE) © 2026 Deuri Vasquez.

> This project is not affiliated with the DGII. It is an independent, community
> implementation of the public e-CF technical specification (Ley 32-23 and
> Decreto 587-24). Always validate against the official
> [DGII documentation](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/default.aspx).
