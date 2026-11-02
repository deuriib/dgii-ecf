# TypeScript examples

Runnable examples for [`@deuriib/dgii-ecf`](../../packages/typescript).

## Setup

```bash
cd examples/typescript
bun install
```

## Run

```bash
bun run generate-cert   # ephemeral self-signed .p12 (local signing only)
bun run transform       # fixtures/invoice-31.json -> output/invoice-31.generated.xml
bun run sign            # fixtures/invoice-31.xml  -> output/invoice-31.signed.xml

# Authenticate + submit (requires a real certificate + network)
DGII_P12_PATH=/secure/identity.p12 \
DGII_P12_PASSWORD=secret \
DGII_RNC=130862346 \
DGII_ENVIRONMENT=TesteCF \
bun run send
```

The examples import the SDK from `../../packages/typescript/src`, so they run
directly with Bun — no build step required.

> ⚠️ `generate-cert` creates a throwaway self-signed certificate for local,
> offline testing. It is **not** a DGII certificate and will be rejected by DGII.
