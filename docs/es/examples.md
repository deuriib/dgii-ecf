# Ejemplos

El directorio [`examples/`](https://github.com/deuriib/dgii-ecf/tree/main/examples)
contiene ejemplos ejecutables para ambos SDKs y fixtures de muestra de la DGII.

## Fixtures

| Archivo                    | Descripción                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `fixtures/test.xml`        | Documento de muestra completo de un e-CF de la DGII. **Solo referencia** — ver la advertencia. |
| `fixtures/invoice-31.xml`  | ECF-31 mínimo sin firmar.                                                                      |
| `fixtures/invoice-31.json` | La misma factura en JSON compacto.                                                             |
| `fixtures/invoice-32.xml`  | ECF-32 mínimo para el flujo de resumen (RFCE).                                                 |
| `fixtures/acecf.xml`       | ACECF ilustrativo (aprobación comercial).                                                      |
| `fixtures/anecf.xml`       | ANECF ilustrativo (anulación de rango).                                                        |

!!! warning "Certificado del fixture vencido"
`fixtures/test.xml` es solo una referencia histórica y **no debe** usarse como
fuente de verdad para firmar. El certificado incrustado venció el
**2024-12-04**, y su `DigestValue` ya no coincide con el contenido porque el
documento fue editado después de firmarse.

    Por eso `utilities.py` / `utilities.ts` reportan `certificate valid: false`
    para este archivo, y ese es el resultado esperado.

    Para firmar de punta a punta usa `fixtures/invoice-31.xml` (o
    `fixtures/invoice-32.xml` para el flujo RFCE) junto con un `output/test.p12`
    generado.

## Flujos

| Flujo                                        | Python                   | TypeScript               |
| -------------------------------------------- | ------------------------ | ------------------------ |
| Firmar un e-CF                               | `sign_xml.py`            | `sign-xml.ts`            |
| JSON → XML                                   | `transform.py`           | `transform.ts`           |
| Utilidades (QR, código, certificado)         | `utilities.py`           | `utilities.ts`           |
| Información del certificado                  | `certificate_info.py`    | `certificate-info.ts`    |
| Enviar un e-CF                               | `send_invoice.py`        | `send-invoice.ts`        |
| Enviar un resumen (RFCE)                     | `send_summary.py`        | `send-summary.ts`        |
| Estado por track id                          | `status_track_id.py`     | `status-track-id.ts`     |
| Consultar estado                             | `inquiry_status.py`      | `inquiry-status.ts`      |
| Estados de seguimiento                       | `track_statuses.py`      | `track-statuses.ts`      |
| Consulta de resumen (RFCE) — solo producción | `summary_inquiry.py`     | `summary-inquiry.ts`     |
| Directorio de clientes                       | `customer_directory.py`  | `customer-directory.ts`  |
| Aprobación comercial                         | `commercial_approval.py` | `commercial-approval.ts` |
| Anular un rango                              | `void.py`                | `void.ts`                |

## Python

```bash
cd examples/python
uv sync
uv run python generate_cert.py   # ephemeral self-signed .p12
uv run python utilities.py       # offline helpers
uv run python sign_xml.py        # sign + validate certificate
```

## TypeScript

```bash
cd examples/typescript
bun install
bun run generate-cert
bun run utilities
bun run sign
```

Los flujos `send_*` / `send*` y los de consulta requieren un certificado real de
la DGII y acceso a la red. Configura `DGII_P12_PATH`, `DGII_P12_PASSWORD`,
`DGII_RNC` y `DGII_ENVIRONMENT`.

!!! warning
`generate_cert` crea un certificado autofirmado desechable para pruebas sin
conexión. **No** es un certificado de la DGII.
