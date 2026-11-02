# TypeScript examples

Runnable examples for [`@deuriib/dgii-ecf`](../../packages/typescript).

## Setup

```bash
cd examples/typescript
bun install
```

## Offline examples

```bash
bun run generate-cert   # ephemeral self-signed .p12 (local signing only)
bun run transform       # fixtures/invoice-31.json -> output/invoice-31.generated.xml
bun run sign            # fixtures/invoice-31.xml  -> output/invoice-31.signed.xml
```

## Network flows

These require a real DGII certificate and network access. Configure the
environment:

```bash
export DGII_P12_PATH=/secure/identity.p12
export DGII_P12_PASSWORD=secret
export DGII_RNC=130862346
export DGII_ENVIRONMENT=TesteCF   # TesteCF | CerteCF | eCF
```

```bash
bun run send              # authenticate + submit a signed e-CF
bun run send-summary      # sign ECF-32 -> RFCE -> submit summary
bun run customer-directory <rnc>
bun run commercial-approval   # sign ACECF -> submit commercial approval
bun run void                  # sign ANECF -> void a range
```

The examples import the SDK from `../../packages/typescript/src`, so they run
directly with Bun — no build step required.

> ⚠️ `generate-cert` creates a throwaway self-signed certificate for local,
> offline testing. It is **not** a DGII certificate and will be rejected by DGII.
