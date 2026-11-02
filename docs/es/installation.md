# Instalación

## Requisitos

| | Mínimo |
| --- | --- |
| TypeScript | Node.js 20+ (o Bun 1.0+) |
| Python | Python 3.11+ |

!!! warning "Solo del lado del servidor"
    Ambos SDKs cargan claves privadas y certificados. Ejecútalos únicamente en el
    servidor.

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

## Certificados

Necesitas un certificado `.p12` de la DGII (de
[DigiFirma](https://www.camarasantodomingo.do/digifirma/FormularioWeb/)).

- Guarda el `.p12` y su contraseña en un gestor de secretos: nunca los subas al
  repositorio.
- El certificado caduca; monitorea su vencimiento y rótalo antes de que expire.

```python
from py_dgii_ecf import P12Reader

info = P12Reader(password).get_certificate_info("identity.p12")
if info.is_ok():
    print(info.unwrap().valid_to)
```
