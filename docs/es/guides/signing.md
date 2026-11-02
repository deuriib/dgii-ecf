# Firma (XMLDSig)

La DGII valida la firma, no la intención. Ambos SDKs implementan **XMLDSig
enveloped** con:

- **Canonicalización**: C14N 1.0 inclusivo
  (`http://www.w3.org/TR/2001/REC-xml-c14n-20010315`)
- **Signature**: RSA PKCS#1 v1.5 + SHA-256
  (`http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`)
- **Reference**: `URI=""` con la transformada enveloped-signature
- `<Signature>` se agrega como último hijo del elemento raíz.

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
(TypeScript).
