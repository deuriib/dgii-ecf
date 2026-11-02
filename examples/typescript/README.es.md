# Ejemplos de TypeScript

[English](README.md) · [Español](README.es.md)

Ejemplos ejecutables para [`@deuriib/dgii-ecf`](../../packages/typescript).

## Configuración

```bash
cd examples/typescript
bun install
```

## Ejemplos sin conexión

```bash
bun run generate-cert    # ephemeral self-signed .p12 (local signing only)
bun run transform        # fixtures/invoice-31.json -> output/invoice-31.generated.xml
bun run sign             # fixtures/invoice-31.xml  -> output/invoice-31.signed.xml
bun run utilities        # security code, QR URLs, dates, XML extraction, cert validation
bun run certificate-info # read .p12 metadata (requires DGII_P12_PATH/PASSWORD)
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
bun run send                  # authenticate + submit a signed e-CF
bun run send-summary          # sign ECF-32 -> RFCE -> submit summary
bun run status <track-id>     # status by track id
bun run inquiry-status <ncf> [rncComprador] [codigoSeguridad]
bun run track-statuses <encf>            # all tracking entries for an e-NCF
bun run summary-inquiry <encf> <codigo>  # RFCE inquiry (production only)
bun run customer-directory <rnc>
bun run commercial-approval   # sign ACECF -> submit commercial approval
bun run void                  # sign ANECF -> void a range
```

Los ejemplos importan el SDK desde `../../packages/typescript/src`, así que se
ejecutan directamente con Bun — no hace falta un paso de build.

> ⚠️ `generate-cert` crea un certificado autofirmado desechable para pruebas
> locales sin conexión. **No** es un certificado de la DGII y será rechazado por
> la DGII.
