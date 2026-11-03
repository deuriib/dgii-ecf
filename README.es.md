# dgii-ecf

[English](README.md) · [Español](README.es.md)

> SDKs de facturación electrónica (e-CF) para la **DGII** de República
> Dominicana — Dirección General de Impuestos Internos.

[![npm](https://img.shields.io/npm/v/@deuriib/dgii-ecf.svg?label=npm)](https://www.npmjs.com/package/@deuriib/dgii-ecf)
[![PyPI](https://img.shields.io/pypi/v/py-dgii-ecf.svg?label=pypi)](https://pypi.org/project/py-dgii-ecf/)
[![TypeScript CI](https://github.com/deuriib/dgii-ecf/actions/workflows/typescript.yml/badge.svg)](https://github.com/deuriib/dgii-ecf/actions/workflows/typescript.yml)
[![Python CI](https://github.com/deuriib/dgii-ecf/actions/workflows/python.yml/badge.svg)](https://github.com/deuriib/dgii-ecf/actions/workflows/python.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg)](https://www.conventionalcommits.org/)

Monorepo políglota y profesional con dos SDKs publicables y orientados a
producción para autenticarse contra los servicios web de la DGII, firmar
documentos fiscales electrónicos con **XMLDSig** (C14N inclusivo + RSA-SHA256)
y transmitirlos de forma confiable.

| Paquete                                    | Lenguaje                      | Registro                                               | Estado |
| ------------------------------------------ | ----------------------------- | ------------------------------------------------------ | ------ |
| [`@deuriib/dgii-ecf`](packages/typescript) | TypeScript (pensado para Bun) | [npm](https://www.npmjs.com/package/@deuriib/dgii-ecf) | 🚧     |
| [`py-dgii-ecf`](packages/python)           | Python (uv)                   | [PyPI](https://pypi.org/project/py-dgii-ecf/)          | 🚧     |

## ✨ Características

Ambos SDKs comparten el mismo contrato de diseño:

- **Patrón Result** — sin excepciones ocultas. TypeScript usa
  [`neverthrow`](https://github.com/supermacro/neverthrow); Python usa
  [`result`](https://github.com/rustedpy/result).
- **Resiliencia integrada** — reintentos + circuit breaker + timeout en cada
  llamada externa. TypeScript usa
  [`cockatiel`](https://github.com/connor4312/cockatiel); Python usa
  [`tenacity`](https://tenacity.readthedocs.io) +
  [`pybreaker`](https://pypi.org/project/pybreaker/).
- **Envío idempotente** — `IdempotencyStore` inyectable, con clave
  `RNC + eNCF + SHA-256(signed XML)`, para que un envío reintentado nunca
  duplique la emisión.
- **XMLDSig correcto** — C14N 1.0 inclusivo, firma enveloped, RSA-SHA256,
  compatible byte a byte con el stack `.NET` de la DGII.
- **Superficie de API completa** — autenticación (SEED), envío de documentos,
  facturas de resumen (RFCE), consultas de estado/track id, estado de los
  servicios, directorio de clientes y listado general, aprobación comercial,
  anulación de e-NCF y reconciliación de un envío pendiente.
- **Verificaciones previas** — validación contra los esquemas empaquetados
  (TypeScript usa `xmllint`, Python usa `lxml`) y chequeo de ventana de
  mantenimiento antes de un lote.
- **Dinero como `Decimal`** — el redondeo de punto flotante nunca puede
  corromper un digest.

## 📦 Estructura

```text
packages/
├── typescript/   # @deuriib/dgii-ecf — bun, tsup, vitest, native fetch
└── python/       # py-dgii-ecf — uv, ruff, mypy, typer, httpx2
```

## 🚀 Inicio rápido

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

> ⚠️ Solo del lado del servidor. Nunca cargues estos SDKs en un navegador:
> manejan claves privadas y credenciales.

## 🧪 Desarrollo y lanzamientos

- Herramientas fijadas con [`mise.toml`](mise.toml); `mise run ci` ejecuta lint +
  test + build.
- Hooks de pre-commit con [`.pre-commit-config.yaml`](.pre-commit-config.yaml).
- Lanzamientos automatizados con [`release-please`](release-please-config.json)
  (modo manifest, versiones independientes).

Consulta [CONTRIBUTING.md](CONTRIBUTING.md) para el flujo completo.

## 📚 Documentación

- [Especificación](project-specs/dgii-ecf-setup.md)
- [Arquitectura](project-docs/architecture.md)
- [Seguridad](SECURITY.md)
- [Contribuir](CONTRIBUTING.md)
- [Código de Conducta](CODE_OF_CONDUCT.md)

## ⚖️ Licencia

[MIT](LICENSE) © 2026 Deuri Vasquez.

> Este proyecto no está afiliado a la DGII. Es una implementación independiente
> y comunitaria de la especificación técnica pública de e-CF (Ley 32-23 y
> Decreto 587-24). Valida siempre contra la
> [documentación oficial de la DGII](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/default.aspx).
