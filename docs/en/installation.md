# Installation

## Requirements

| | Minimum |
| --- | --- |
| TypeScript | Node.js 20+ (or Bun 1.0+) |
| Python | Python 3.11+ |

!!! warning "Server-side only"
    Both SDKs load private keys and certificates. Run them only on the server.

## TypeScript

```bash
bun add @deuriib/dgii-ecf
# or
npm install @deuriib/dgii-ecf
```

```ts
import { ECF, Environment, P12Reader, Signature } from '@deuriib/dgii-ecf';
```

## Python

```bash
uv add py-dgii-ecf
# or
pip install py-dgii-ecf
```

```python
from py_dgii_ecf import ECF, Environment, P12Reader, Signature
```

## Certificates

You need a DGII `.p12` certificate (from
[DigiFirma](https://www.camarasantodomingo.do/digifirma/FormularioWeb/)).

- Keep the `.p12` and its password in a secret manager — never commit them.
- The certificate expires; track and rotate it before it lapses.

```python
from py_dgii_ecf import P12Reader

info = P12Reader(password).get_certificate_info("identity.p12")
if info.is_ok():
    print(info.unwrap().valid_to)
```
