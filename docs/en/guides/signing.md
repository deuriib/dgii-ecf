# Signing (XMLDSig)

DGII validates the signature, not the intent. Both SDKs implement **XMLDSig
enveloped** with:

- **Canonicalization**: inclusive C14N 1.0
  (`http://www.w3.org/TR/2001/REC-xml-c14n-20010315`)
- **Signature**: RSA PKCS#1 v1.5 + SHA-256
  (`http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`)
- **Reference**: `URI=""` with the enveloped-signature transform
- `<Signature>` is appended as the last child of the root element.
- **Official source:** [Firmado Comprobantes Fiscales Electrónicos (e-CF)](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Firmado%20de%20e-CF.pdf) — DGII's own signature profile by example: C14N URI, RSA-SHA256, SHA-256 digest, `URI=""`, X509 `KeyInfo` (site-updated 2023-11-22) · [Descripción Técnica Servicios Emisores Electrónicos](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Descripcion%20Tecnica%20Emisores%20Electronicos.pdf) — _Firmado de XML_: SHA-256 protocol, `preservewhitespace = false`, and the rule that a signed XML is never altered (site-updated 2026-05-29).

!!! note "Link verification"

    Official links on this page were verified on 2026-11-09. DGII republishes
    files in place, so re-check a document before relying on a section
    reference. See [Official DGII references](../reference/dgii-official.md).

## Why a real canonicalization implementation matters

`ElementTree.tostring()`, `minidom.toxml()` and similar serializers are **not**
canonicalization. An off-by-one byte in namespaces or whitespace changes the
digest and the document is rejected. The SDKs use real C14N:

- **TypeScript** — `xml-crypto`, which canonicalizes the referenced node-set
  with inclusive C14N 1.0 before hashing it, then signs with the standard
  RSA-SHA256 and SHA-256 algorithm URIs.
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
Neither is enough on its own: the repository's independent gate signs real
fixtures with libxmlsec1 — `mise run verify-signing-typescript` and
`uv run --with xmlsec python scripts/verify_signing.py` — and runs on every CI
push.
