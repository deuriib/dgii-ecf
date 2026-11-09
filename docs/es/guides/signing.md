# Firma (XMLDSig)

La DGII valida la firma, no la intención. Ambos SDKs implementan **XMLDSig
enveloped** con:

- **Canonicalización**: C14N 1.0 inclusivo
  (`http://www.w3.org/TR/2001/REC-xml-c14n-20010315`)
- **Signature**: RSA PKCS#1 v1.5 + SHA-256
  (`http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`)
- **Reference**: `URI=""` con la transformada enveloped-signature
- `<Signature>` se agrega como último hijo del elemento raíz.

- **Fuente oficial:** [Firmado Comprobantes Fiscales Electrónicos (e-CF)](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Firmado%20de%20e-CF.pdf) — el perfil de firma de la propia DGII a modo de ejemplo: URI de C14N, RSA-SHA256, digest SHA-256, `URI=""`, `KeyInfo` X509 (actualizado en el sitio 2023-11-22) · [Descripción Técnica Servicios Emisores Electrónicos](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Descripcion%20Tecnica%20Emisores%20Electronicos.pdf) — _Firmado de XML_: protocolo SHA-256, `preservewhitespace = false`, y la regla de que un XML firmado nunca se altera (actualizado en el sitio 2026-05-29).

!!! note "Verificación de enlaces"

    Los enlaces oficiales de esta página se verificaron el 2026-11-09. La DGII
    republica los archivos en la misma ubicación, así que vuelve a comprobar el
    documento antes de confiar en una referencia a una sección. Ver
    [Referencias oficiales de la DGII](../reference/dgii-official.md).

## Por qué importa una implementación real de canonicalización

`ElementTree.tostring()`, `minidom.toxml()` y serializadores similares **no**
hacen canonicalización. Un byte de diferencia en namespaces o espacios en
blanco cambia el digest y el documento es rechazado. Los SDKs usan C14N real:

- **TypeScript** — `xml-crypto`, que canonicaliza el node-set referenciado con
  C14N 1.0 inclusiva antes de hashearlo, y luego firma con los URIs estándar
  RSA-SHA256 y SHA-256.
- **Python** — `lxml` con `method="c14n"` (inclusivo, comentarios eliminados).

## Firmar

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

## Verificación obligatoria

Que una prueba local pase es necesario, no suficiente. Verifica las firmas con
una herramienta independiente antes de dar por terminada una corrección de
firma:

```bash
xmlsec1 --verify --insecure signed.xml
```

Luego envía el documento al ambiente de **certificación** de la DGII — la DGII
sigue siendo la autoridad sobre la aceptación.

!!! tip "Pruebas con fixtures"
Las suites de pruebas verifican el digest y la firma RSA criptográficamente
(Python), y comprueban los URIs de algoritmo emitidos y la estructura
(TypeScript). Ninguna de las dos basta por sí sola: la verificación
independiente del repositorio firma fixtures reales con libxmlsec1 —
`mise run verify-signing-typescript` y
`uv run --with xmlsec python scripts/verify_signing.py` — y corre en cada push
de CI.
