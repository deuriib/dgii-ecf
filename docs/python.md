# Python

Package: [`py-dgii-ecf`](https://pypi.org/project/py-dgii-ecf/) · import `py_dgii_ecf`

Sync [`httpx2`](https://pypi.org/project/httpx2/), `tenacity` + `pybreaker`, and
**result-pattern** ([`result`](https://github.com/rustedpy/result)). Type-checked
with `mypy --strict`.

## Authenticate

```python
from py_dgii_ecf import ECF, Environment, P12Reader

credentials = P12Reader(password).get_key_from_file("/secure/identity.p12")
if credentials.is_err():
    raise SystemExit(credentials.unwrap_err())

ecf = ECF(credentials.unwrap(), Environment.CERT)
auth = ecf.authenticate()
if auth.is_err():
    raise SystemExit(auth.unwrap_err())

print(auth.unwrap().token)
```

## Sign a document

```python
from py_dgii_ecf import Signature

data = credentials.unwrap()
signed = Signature(data.key, data.cert).sign_xml(xml)
if signed.is_err():
    raise SystemExit(signed.unwrap_err())
```

## Submit

```python
response = ecf.send_electronic_document(
    signed.unwrap(), "130862346E310000000001.xml"
)
if response.is_err():
    raise SystemExit(response.unwrap_err())
print(response.unwrap())
```

## Result pattern

```python
result = ecf.status_track_id("track-id")
if result.is_ok():
    print(result.unwrap().get("estado"))
else:
    error = result.unwrap_err()
    print(error.code, error.message)
```

## API

| Method | Returns |
| --- | --- |
| `authenticate(buyer_host=None)` | `Result[AuthToken]` |
| `send_electronic_document(xml, file_name, buyer_host=None)` | `Result[dict]` |
| `send_summary(xml, file_name)` | `Result[dict]` |
| `status_track_id(track_id)` | `Result[dict]` |
| `inquiry_status(rnc, ncf, comprador=None, codigo=None)` | `Result[dict]` |
| `track_statuses(rnc, encf)` | `Result[list[dict]]` |
| `get_customer_directory(rnc)` | `Result[list[dict] \| None]` |
| `get_summary_invoice_inquiry(rnc, encf, codigo)` | `Result[dict]` |
| `send_commercial_approval(xml, file_name)` | `Result[dict]` |
| `void_encf(xml, file_name)` | `Result[dict]` |

## CLI

```bash
py-dgii-ecf sign invoice.xml identity.p12 --output signed.xml
py-dgii-ecf authenticate identity.p12 --environment CerteCF
py-dgii-ecf status <track-id> identity.p12 --environment CerteCF
```

See [Signing](guides/signing.md), [Resilience](guides/resilience.md), and the
[package README](https://github.com/deuriib/dgii-ecf/tree/main/packages/python).
