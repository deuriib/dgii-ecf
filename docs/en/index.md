# DGII e-CF SDKs

Two production-oriented, publishable SDKs for the Dominican Republic's **DGII**
electronic invoicing system (e-CF):

| Language   | Package             | Registry                                               |
| ---------- | ------------------- | ------------------------------------------------------ |
| TypeScript | `@deuriib/dgii-ecf` | [npm](https://www.npmjs.com/package/@deuriib/dgii-ecf) |
| Python     | `py-dgii-ecf`       | [PyPI](https://pypi.org/project/py-dgii-ecf/)          |

Both SDKs share the same design:

- **Result pattern** — [`neverthrow`](https://github.com/supermacro/neverthrow)
  (TS) and [`result`](https://github.com/rustedpy/result) (Python). No hidden
  exceptions.
- **Resilience** — retry, circuit breaker and timeout on every external call.
- **Idempotent submission** — keyed by `RNC + eNCF + SHA-256(signed XML)`.
- **Correct XMLDSig** — inclusive C14N 1.0, enveloped signature, RSA-SHA256.
- **Full API surface** — authentication (SEED), document submission, summary
  invoices (RFCE), status queries, customer directory, commercial approval, and
  e-NCF voiding.

!!! warning "Server-side only"
These SDKs handle private keys and credentials. Never ship them to a browser
or a client-side bundle.

## Quick start

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

Start with [Installation](installation.md), then follow the guide for your
language.
