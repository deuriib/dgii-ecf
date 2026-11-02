# Ejemplos de Python

[English](README.md) · [Español](README.es.md)

Ejemplos ejecutables para [`py-dgii-ecf`](../../packages/python).

## Configuración

```bash
cd examples/python
uv sync
```

## Ejemplos sin conexión

```bash
uv run python generate_cert.py   # ephemeral self-signed .p12 (local signing only)
uv run python transform.py       # JSON -> XML
uv run python sign_xml.py        # sign + validate certificate
uv run python utilities.py       # security code, QR URLs, dates, XML extraction, cert validation
uv run python certificate_info.py  # read .p12 metadata (requires DGII_P12_PATH/PASSWORD)
```

## Flujos de red

Requieren un certificado real de la DGII y acceso a la red. Configura el
entorno:

```bash
export DGII_P12_PATH=/secure/identity.p12
export DGII_P12_PASSWORD=secret
export DGII_RNC=130862346
export DGII_ENVIRONMENT=TesteCF   # TesteCF | CerteCF | eCF
```

```bash
uv run python send_invoice.py          # authenticate + submit a signed e-CF
uv run python send_summary.py          # sign ECF-32 -> RFCE -> submit summary
uv run python status_track_id.py <track-id>
uv run python inquiry_status.py <ncf> [rncComprador] [codigoSeguridad]
uv run python track_statuses.py <encf>
uv run python summary_inquiry.py <encf> <codigoSeguridad>   # production only
uv run python customer_directory.py <rnc>
uv run python commercial_approval.py   # sign ACECF -> submit commercial approval
uv run python void.py                  # sign ANECF -> void a range
```

Los resultados se escriben en `../output/` (ignorado por git).

> ⚠️ `generate_cert.py` crea un certificado autofirmado desechable para pruebas
> locales sin conexión. **No** es un certificado de la DGII y será rechazado por
> la DGII.
