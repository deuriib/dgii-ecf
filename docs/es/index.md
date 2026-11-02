# DGII e-CF SDKs

Dos SDKs publicables y orientados a producción para el sistema de facturación
electrónica (e-CF) de la **DGII** de República Dominicana:

| Lenguaje   | Paquete             | Registro                                               |
| ---------- | ------------------- | ------------------------------------------------------ |
| TypeScript | `@deuriib/dgii-ecf` | [npm](https://www.npmjs.com/package/@deuriib/dgii-ecf) |
| Python     | `py-dgii-ecf`       | [PyPI](https://pypi.org/project/py-dgii-ecf/)          |

Ambos SDKs comparten el mismo diseño:

- **Patrón Result** — [`neverthrow`](https://github.com/supermacro/neverthrow)
  (TS) y [`result`](https://github.com/rustedpy/result) (Python). Sin excepciones
  ocultas.
- **Resiliencia** — reintentos, circuit breaker y timeout en cada llamada
  externa.
- **Envío idempotente** — con clave basada en `RNC + eNCF + SHA-256(signed XML)`.
- **XMLDSig correcto** — C14N 1.0 inclusivo, firma enveloped, RSA-SHA256.
- **Superficie completa de la API** — autenticación (SEED), envío de documentos,
  facturas de resumen (RFCE), consultas de estado, directorio de clientes,
  aprobación comercial y anulación de e-NCF.

!!! warning "Solo del lado del servidor"
Estos SDKs manejan claves privadas y credenciales. Nunca los ejecutes en un
navegador ni los empaquetes en un bundle del lado del cliente.

## Inicio rápido

=== "TypeScript"

    ```bash
    bun add @deuriib/dgii-ecf
    ```

    ```ts
    import { ECF, Environment, P12Reader, Signature } from '@deuriib/dgii-ecf';

    const credentials = new P12Reader(process.env.CERT_PASSWORD ?? '')
      .getKeyFromFile('identity.p12');
    if (credentials.isErr()) throw credentials.error;

    const ecf = new ECF(credentials.value, Environment.Cert);
    const auth = await ecf.authenticate();
    ```

=== "Python"

    ```bash
    uv add py-dgii-ecf
    ```

    ```python
    from py_dgii_ecf import ECF, Environment, P12Reader, Signature

    credentials = P12Reader(password).get_key_from_file("identity.p12")
    if credentials.is_err():
        raise SystemExit(credentials.unwrap_err())

    ecf = ECF(credentials.unwrap(), Environment.CERT)
    auth = ecf.authenticate()
    ```

Empieza con [Instalación](installation.md) y luego sigue la guía de tu lenguaje.
