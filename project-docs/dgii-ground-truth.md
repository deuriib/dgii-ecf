# DGII e-CF — Official Ground Truth

> Normative reference for the SDK audit (#95). Everything here was extracted
> from the official DGII documents listed below, not inferred. When a change
> contradicts this file, the file wins — or the file is corrected with a new
> citation.

**Source:** NotebookLM notebook _"Reglamento y Guía de Facturación Electrónica
de la DGII"_, built from 34 official documents.

**Extracted:** 2026-11-02, via 12 targeted questions plus direct reads of the
`ANECF v.1.0` schema source.

**XSDs:** the schemas themselves are bundled at
`examples/fixtures/schemas/` with source URLs and `sha256` in `MANIFEST.json`.

---

## 1. Hosts and environments

| Item                           | Official value                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| General e-CF host              | `ecf.dgii.gov.do`                                                                   |
| Factura de consumo / RFCE host | `fc.dgii.gov.do`                                                                    |
| Service status host            | `statusecf.dgii.gov.do`                                                             |
| Environment segment            | `testecf`, `certecf`, `ecf` (documented in lowercase)                               |
| Case sensitivity               | Explicitly NOT case-sensitive: "Servicios no sensitivos a mayúsculas y minúsculas." |

URL shape: `https://{host}/{ambiente}/{servicio}/api/...`

## 2. Endpoints (literal)

| Service                      | Method         | Path                                                                                                         |
| ---------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------ |
| Semilla                      | GET            | `{host}/{env}/autenticacion/api/autenticacion/semilla`                                                       |
| Validar semilla              | POST multipart | `{host}/{env}/autenticacion/api/autenticacion/validarsemilla`                                                |
| Recepción e-CF               | POST multipart | `{host}/{env}/recepcion/api/facturaselectronicas`                                                            |
| Recepción RFCE               | POST multipart | `fc/{env}/recepcionfc/api/recepcion/ecf`                                                                     |
| Consulta por trackId         | GET            | `{host}/{env}/consultaresultado/api/consultas/estado?trackid=`                                               |
| Consulta por eNCF            | GET            | `{host}/{env}/consultaestado/api/consultas/estado?rncemisor=&ncfelectronico=&rnccomprador=&codigoseguridad=` |
| Consulta trackIds            | GET            | `{host}/{env}/consultatrackids/api/trackids/consulta?rncemisor=&encf=`                                       |
| Directorio por RNC           | GET            | `{host}/{env}/consultadirectorio/api/consultas/obtenerdirectorioporrnc?RNC=`                                 |
| Directorio (listado general) | GET            | `{host}/{env}/consultadirectorio/api/consultas/listado`                                                      |
| Aprobación comercial         | POST multipart | `{host}/{env}/aprobacioncomercial/api/aprobacioncomercial`                                                   |
| Anulación de rangos          | POST multipart | `{host}/{env}/anulacionrangos/api/operaciones/anularrango`                                                   |
| Consulta RFCE                | GET            | `fc/{env}/consultarfce/api/Consultas/Consulta?RNC_Emisor=&ENCF=&Cod_Seguridad_eCF=`                          |
| Status — servicios           | GET            | `statusecf.dgii.gov.do/api/estatusservicios/obtenerestatus`                                                  |
| Status — mantenimiento       | GET            | `statusecf.dgii.gov.do/api/estatusservicios/obtenerventanasmantenimiento`                                    |
| Status — verificar           | GET            | `statusecf.dgii.gov.do/api/estatusservicios/verificarestado?ambiente=` (1=PreCert, 2=Prod, 3=Cert)           |

B2B (Sender↔Receiver) paths on the buyer's `urlOpcional` / `urlRecepcion` / `urlAceptacion`:

- `fe/autenticacion/api/semilla` (GET)
- `fe/autenticacion/api/validacioncertificado` (POST multipart)
- `fe/recepcion/api/ecf` (POST multipart)
- `fe/aprobacioncomercial/api/ecf` (POST multipart)

## 3. Multipart field name — CRITICAL

For **every** DGII POST multipart endpoint the form field name is literally **`xml`**.
The physical file name goes only in the filename part of the multipart disposition.

Official cURL examples (verbatim in the docs):

```bash
curl -X 'POST' '.../validarsemilla' \
  -H 'accept: application/json' -H 'Content-Type: multipart/form-data' \
  -F 'xml=@response_1659304894166.xml;type=text/xml'

curl -X 'POST' '.../recepcion/api/facturaselectronicas' \
  -H 'Authorization: bearer <token>' -H 'Content-Type: multipart/form-data' \
  -F 'xml=@response_1659304894166.xml;type=text/xml'

curl -X POST "https://fc.dgii.gov.do/testecf/recepcionfc/api/recepcion/ecf" \
  -H "Authorization: bearer <token>" -H "Content-Type: multipart/form-data" \
  -F "xml=@response_1659306932058_180702.xml;type=text/xml"

curl -X 'POST' '.../aprobacioncomercial' -F 'xml=@response_1659306932058_180702.xml;type=text/xml'

curl -X 'POST' '.../anulacionrangos/api/operaciones/anularrango' -F 'xml=@response_1659306932058_180702.xml;type=text/xml'
```

Swagger parameter name is documented as `xml*` in all five services.

## 4. Authentication

Seed response XML:

```xml
<?xml version="1.0" encoding="utf-8"?>
<SemillaModel xmlns:xsi="..." xmlns:xsd="...">
  <valor>0000000-0000-0000-0000-000000000000</valor>
  <fecha>2019-03-13T14:33:32.8617792-04:00</fecha>
</SemillaModel>
```

- The **whole seed XML** is signed (enveloped signature, `<Signature>` embedded in `SemillaModel`).
- Token validity: **1 hour**.
- Token JSON: `{ "token": string, "expira": ISO8601, "expedido": ISO8601 }`.
- Token usage: `Authorization: Bearer {token}` on every later call.

## 5. Status codes

Consulta por trackId (`consultaresultado`):

| código | estado               |
| ------ | -------------------- |
| 0      | No encontrado        |
| 1      | Aceptado             |
| 2      | Rechazado            |
| 3      | En Proceso           |
| 4      | Aceptado Condicional |

Consulta por eNCF (`consultaestado`): 0 No encontrado, 1 Aceptado, 2 Rechazado,
plus **"Aceptado Condicional" is observable for E32 < RD$250,000**.

`secuenciaUtilizada` (boolean) = whether the e-NCF sequence is already consumed:

- `true` → the sequence CANNOT be reused
- `false` → the sequence CAN be reused (invalid cert/signature, invalid XML, non-delegated signer,
  unauthorized/expired e-NCF, non-electronic issuer, unknown/inactive RNC)

Messages: `mensajes: [{ "codigo": number, "valor": string }]`.

## 6. Reception responses

General e-CF reception (`/api/facturaselectronicas`) — **synchronous acknowledgement**:

```json
{ "trackId": "string", "error": "string", "mensaje": "string" }
```

Note: **`mensaje` singular, a string** — not an array.

RFCE reception (`/api/recepcion/ecf`) — synchronous validation result:

```json
{
  "codigo": 1,
  "estado": "Aceptado | Aceptado condicional | Rechazado",
  "mensajes": [{ "codigo": "string", "valor": "string" }],
  "encf": "string",
  "secuenciaUtilizada": true
}
```

Commercial approval response:

```json
{ "mensaje": ["string"], "estado": "string", "codigo": "string" }
```

- `codigo` takes exactly **`"1"`** (approved) or **`"2"`** (not found / not processed) — no leading zeros.
- `estado` takes exactly **`"Aprobación comercial aprobada"`** or **`"Aprobación comercial rechazada"`**.

Voiding response: `{ rnc, codigo, nombre, mensajes }`.

## 7. e-CF types and routing

| Type | Name                                              |
| ---- | ------------------------------------------------- |
| E31  | Factura de Crédito Fiscal Electrónica             |
| E32  | Factura de Consumo Electrónica                    |
| E33  | Nota de Débito Electrónica                        |
| E34  | Nota de Crédito Electrónica                       |
| E41  | Comprobante Electrónico de Compras                |
| E43  | Comprobante Electrónico para Gastos Menores       |
| E44  | Comprobante Electrónico para Regímenes Especiales |
| E45  | Comprobante Electrónico Gubernamental             |
| E46  | Comprobante Electrónico para Exportaciones        |
| E47  | Comprobante Electrónico para Pagos al Exterior    |

Routing:

- General endpoint `recepcion/api/facturaselectronicas`: E31, E33, E34, E41, E43, E44, E45, E46, E47
  **and E32 with total >= RD$250,000**.
- RFCE endpoint `recepcionfc/api/recepcion/ecf`: **only** the RFCE summary for E32 < RD$250,000.

RFCE rules:

- Root element `<RFCE>`, `<Encabezado>` with `Version`, `IdDoc/TipoeCF=32`, `IdDoc/eNCF`, `Emisor/RNCEmisor`,
  optional `Comprador`, `Totales` (MontoGravadoTotal, MontoExento, TotalITBIS, MontoImpuestoAdicional,
  MontoTotal, MontoNoFacturable, MontoPeriodo), `CodigoSeguridadeCF`, plus `<Signature>`.
- `CodigoSeguridadeCF` = **first 6 characters of the SHA-256 hash of the `<SignatureValue>`** of the
  original E32. Verbatim: "Corresponde a los 6 primeros caracteres del Hash de la firma digital
  correspondiente a la factura de consumo electrónica emitida" and "los primeros seis (6) dígitos del
  hash generado en el SignatureValue".

## 8. XMLDSig requirements

- Signature type: **enveloped** (`http://www.w3.org/2000/09/xmldsig#enveloped-signature`).
- `CanonicalizationMethod`: **inclusive C14N, without comments**
  (`http://www.w3.org/TR/2001/REC-xml-c14n-20010315`), applied to `<SignedInfo>`.
- `DigestMethod`: **SHA-256** (`http://www.w3.org/2001/04/xmlenc#sha256`).
- `SignatureMethod`: **RSA-SHA256** (`http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`).
- `<Reference URI="">` — empty URI, signing the whole document.
- `<Transforms>` must include the enveloped-signature transform.
- Certificate: **.p12 / PKCS#12**, "Certificado Digital de Persona Física para Procedimientos Tributarios";
  the certificate `SN` must match the RNC/cédula of the authorized signer or delegate.
- `<KeyInfo>` **must** contain `<X509Data><X509Certificate>` (base64 DER).
- `<KeyValue>`, `<RSAKeyValue>`, `<Exponent>` must **NOT** be emitted.
- Parsing must use `preservewhitespace = false`.
- After signing, the XML must not be altered (no reformatting, no added newlines/indentation).
- Empty tags are forbidden: any unused tag must be omitted entirely.
- Reserved XML characters must be escaped as entities.

## 9. Approval and voiding rules

- ACECF root `<ACECF>`: `Version`, `RNCEmisor`, `RNCComprador`, `eNCF`, `EstadoAprobacion`/`Estado`
  (1 = approved, 2 = rejected), `FechaHoraAprobacionComercial`, `Signature`.
- Legal deadline: by the filing deadline of the corresponding period (aligned with Formato 606,
  due by the 15th of the following month) — Decreto 587-24 Art. 17 ¶V, Norma General 01-2020 Art. 14 ¶I.
- A commercial rejection obliges the issuer to issue an E34 Nota de Crédito.
- ANECF root `<ANECF>`: `Encabezado` (`Version`, `RncEmisor`, `CantidadeNCFAnulados`,
  `FechaHoraAnulacioneNCF` in `dd-MM-AAAA HH:mm:ss`), `DetalleAnulacion` (1..10 `Anulacion` entries with
  `NoLinea`, `TipoeCF`, `TablaRangoSecuenciasAnuladaseNCF` 1..10000 ranges with `SecuenciaeNCFDesde` /
  `SecuenciaeNCFHasta`, `CantidadeNCFAnulados`), `Signature`.
- ANECF may only be used for sequences never sent to DGII nor delivered to the buyer; otherwise an E34
  Nota de Crédito is mandatory.
- e-NCF authorization validity: from authorization date until **31 December of the following year**.

## 10. Directory / B2B

Directory response item:

```json
{
  "nombre": "...",
  "rnc": "...",
  "urlRecepcion": "...",
  "urlAceptacion": "...",
  "urlOpcional": "..."
}
```

- `urlRecepcion` → receives e-CF XML from other issuers.
- `urlAceptacion` → receives ACECF approvals/rejections.
- `urlOpcional` → authentication service (session protection).

B2B flow: optional auth against `urlOpcional` (semilla → validacioncertificado → bearer token),
then POST the e-CF to `urlRecepcion/fe/recepcion/api/ecf`, receive an `<ARECF>` acknowledgement,
then the buyer POSTs the `<ACECF>` to `urlAceptacion/fe/aprobacioncomercial/api/ecf` (HTTP 200 / 400).

B2B direct delivery **does not apply** to E32 < RD$250k, E41, E43, E45, E46, E47.
