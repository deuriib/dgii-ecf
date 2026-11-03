# DGII e-CF — Response Contracts

The response shapes the SDK models, with the official field names and literals.
Normative source: [`dgii-ground-truth.md`](dgii-ground-truth.md).

Every field is reproduced exactly as DGII spells it — including the ones that
look like typos (`mensaje` singular, `RncEmisor` with a lowercase `n`,
`CantidadeNCFAnulados`). Renaming them in the SDK would hide the wire format.

## General e-CF reception

`POST recepcion/api/FacturasElectronicas` → synchronous acknowledgement.

```json
{ "trackId": "string", "error": "string", "mensaje": "string" }
```

| SDK        | Type              | Notes                                             |
| ---------- | ----------------- | ------------------------------------------------- |
| TypeScript | `InvoiceResponse` | `mensaje` singular; `mensajes` kept for tolerance |
| Python     | `InvoiceResponse` | same                                              |

`Ok(...)` means the transport succeeded, **not** that the document was
accepted. A 200 can carry `error` populated.

## RFCE reception

`POST fc/recepcionfc/api/recepcion/ecf` → synchronous validation result.

```json
{
  "codigo": 1,
  "estado": "Aceptado | Aceptado condicional | Rechazado",
  "mensajes": [{ "codigo": "string", "valor": "string" }],
  "encf": "string",
  "secuenciaUtilizada": true
}
```

| SDK        | Type                     | Notes                                               |
| ---------- | ------------------------ | --------------------------------------------------- |
| TypeScript | `InvoiceSummaryResponse` | `estado` is `string` plus the `SUMMARY_*` constants |
| Python     | `InvoiceSummaryResponse` | `encf` / `secuencia_utilizada` optional             |

## Commercial approval (DGII host)

`POST aprobacionComercial/api/AprobacionComercial`.

```json
{ "mensaje": ["string"], "estado": "string", "codigo": "string" }
```

- `codigo` is exactly `"1"` (approved) or `"2"` (not found / not processed).
- `estado` is exactly `"Aprobación comercial aprobada"` or
  `"Aprobación comercial rechazada"`.

| SDK        | Type                                                             |
| ---------- | ---------------------------------------------------------------- |
| TypeScript | `CommercialApprovalResponse`                                     |
| Python     | `CommercialApprovalResponse` + `COMMERCIAL_APPROVAL_*` constants |

## Commercial approval (buyer host, B2B)

`POST {urlAceptacion}/fe/aprobacioncomercial/api/ecf`.

- **HTTP 200** = satisfactory.
- **HTTP 400** = unsatisfactory — the receiver _did_ receive and reject it, so
  it is reported as `accepted: false`, not as a transport failure. A rejection
  obliges the issuer to answer with an E34 nota de crédito.

| SDK        | Type                                                     |
| ---------- | -------------------------------------------------------- |
| TypeScript | `B2BCommercialApprovalResponse` (`{ status, accepted }`) |
| Python     | `B2BCommercialApprovalResponse`                          |

## Range voiding (ANECF)

`POST anulacionrangos/api/operaciones/anularrango`.

```json
{ "rnc": "string", "codigo": "string", "nombre": "string", "mensajes": [...] }
```

`mensajes` is `[{ codigo, valor }]` on every other service, so both SDKs parse
that shape and accept bare strings as a fallback.

## Status inquiries

| Service                          | Codes                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `consultaresultado` (by trackId) | `0` No encontrado · `1` Aceptado · `2` Rechazado · `3` En Proceso · `4` Aceptado Condicional                  |
| `consultaestado` (by eNCF)       | `0` No encontrado · `1` Aceptado · `2` Rechazado, plus **"Aceptado Condicional"** for an E32 below RD$250,000 |

`secuenciaUtilizada` is the retry rule: `true` = the sequence is consumed and
must not be reused; `false` = it may be reused after a rejection (invalid
certificate or signature, invalid XML, non-delegated signer, unauthorized or
expired e-NCF, non-electronic issuer, unknown or inactive RNC).

## Directory

```json
{
  "nombre": "…",
  "rnc": "…",
  "urlRecepcion": "…",
  "urlAceptacion": "…",
  "urlOpcional": "…"
}
```

- `urlRecepcion` receives e-CF XML from other issuers.
- `urlAceptacion` receives ACECF approvals and rejections.
- `urlOpcional` is the authentication service.

DGII returns either an array or a single object; both SDKs normalize to a list.

## Service status

`statusecf.dgii.gov.do`, authenticated with `Authorization: Apikey <key>`.

| Endpoint                                            | Shape                                                                              |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `api/estatusservicios/obtenerestatus`               | `[{ servicio, estatus, ambiente }]` — `estatus` is `Disponible` or `No Disponible` |
| `api/estatusservicios/obtenerventanasmantenimiento` | `{ ventanaMantenimientos: [{ ambiente, horaInicio, horaFin, dias }] }`             |
| `api/estatusservicios/verificarestado?ambiente=N`   | `{ estado }` — `N` is `1` PreCertificación, `2` Producción, `3` Certificación      |

## Multipart field name

Every DGII multipart endpoint takes the file in a field named literally
**`xml`**; the physical file name goes only in the `Content-Disposition`
filename part. Both SDKs do this.

## Related

- [`dgii-ground-truth.md`](dgii-ground-truth.md) — the full normative reference.
- [`../examples/fixtures/schemas/README.md`](../examples/fixtures/schemas/README.md) — bundled XSDs and the three that do not compile.
- [`adr/0001-codigo-seguridadecf-derivation.md`](adr/0001-codigo-seguridadecf-derivation.md) — the one field the documents do not pin down.
