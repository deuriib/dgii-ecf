# py-dgii-ecf

> DGII e-CF electronic invoicing SDK for the Dominican Republic (Python).

Result-pattern (`result`), resilient HTTP (`httpx2` + `tenacity` + `pybreaker`),
and XMLDSig signing (`lxml` + `cryptography`). No hidden exceptions — every
fallible call returns a `Result`.

## Install

```bash
uv add py-dgii-ecf
# or
pip install py-dgii-ecf
```

> Server-side only. Never load in a context that exposes private keys.

## Quick start

```python
from py_dgii_ecf import ECF, Environment, P12Reader, Signature

reader = P12Reader(password)
credentials = reader.get_key_from_file("/secure/identity.p12")
if credentials.is_err():
    raise SystemExit(credentials.unwrap_err())

ecf = ECF(credentials.unwrap(), Environment.CERT)
auth = ecf.authenticate()
if auth.is_err():
    raise SystemExit(auth.unwrap_err())

signature = Signature(credentials.unwrap().key, credentials.unwrap().cert)
signed = signature.sign_xml(xml)
if signed.is_err():
    raise SystemExit(signed.unwrap_err())

response = ecf.send_electronic_document(signed.unwrap(), "101672919E3100000001.xml")
response.map(lambda invoice: print(invoice.track_id)).map_err(
    lambda error: print(error.code, error)
)
```

## Result pattern

```python
result = ecf.status_track_id("some-track-id")
if result.is_ok():
    print(result.unwrap().estado)
else:
    error = result.unwrap_err()
    print(error.code, error.message)
```

## Resilience & idempotency

- Transient failures (network, timeout, 408/429/5xx) are retried with
  exponential backoff and guarded by a `pybreaker` circuit breaker.
- `send_electronic_document` / `send_summary` are keyed by
  `RNC + eNCF + SHA-256(signed XML)`. Provide a persistent `IdempotencyStore`
  in production.

```python
ecf = ECF(credentials, Environment.PROD, idempotency_store=my_redis_store)
```

## CLI

```bash
py-dgii-ecf sign invoice.xml identity.p12 --output signed.xml
py-dgii-ecf authenticate identity.p12 --environment CerteCF
py-dgii-ecf status <track-id> identity.p12 --environment CerteCF
```

## Modules

`environment`, `types`, `errors`, `result`, `resilience`, `http`, `certificate`,
`signing`, `transformer`, `utils`, `client`, `cli`.

## License

MIT © 2026 Deuri Vasquez
