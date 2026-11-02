# Signing (XMLDSig)

DGII validates the signature, not the intent. Both SDKs implement **XMLDSig
enveloped** with:

- **Canonicalization**: inclusive C14N 1.0
  (`http://www.w3.org/TR/2001/REC-xml-c14n-20010315`)
- **Signature**: RSA PKCS#1 v1.5 + SHA-256
  (`http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`)
- **Reference**: `URI=""` with the enveloped-signature transform
- `<Signature>` is appended as the last child of the root element.

## Why a real canonicalization implementation matters

`ElementTree.tostring()`, `minidom.toxml()` and similar serializers are **not**
canonicalization. An off-by-one byte in namespaces or whitespace changes the
digest and the document is rejected. The SDKs use real C14N:

- **TypeScript** — `xml-crypto`, plus a custom digest that sorts the root
  element's `xmlns` attributes the way DGII's .NET stack does.
- **Python** — `lxml` with `method="c14n"` (inclusive, comments removed).

## Sign

=== "TypeScript"

    ```ts
    import { P12Reader, Signature } from '@deuriib/dgii-ecf';

    const credentials = new P12Reader(password).getKeyFromFile('identity.p12');
    if (credentials.isErr()) throw credentials.error;

    const signed = new Signature(
      credentials.value.key!,
      credentials.value.cert!,
    ).signXml(xml); // root element auto-detected
    ```

=== "Python"

    ```python
    from py_dgii_ecf import P12Reader, Signature

    credentials = P12Reader(password).get_key_from_file("identity.p12")
    if credentials.is_err():
        raise SystemExit(credentials.unwrap_err())

    data = credentials.unwrap()
    signed = Signature(data.key, data.cert).sign_xml(xml)
    ```

## Verification gate

A passing local test is necessary, not sufficient. Verify signatures with an
independent tool before declaring a signing fix done:

```bash
xmlsec1 --verify --insecure signed.xml
```

Then submit to the DGII **certification** environment — DGII remains the
authority on acceptance.

!!! tip "Fixture tests"
    The test suites verify the digest and the RSA signature cryptographically
    (Python) and check the emitted algorithm URIs and structure (TypeScript).
