# ADR 0001 — Derivation of `CodigoSeguridadeCF`

- **Status:** Accepted
- **Date:** 2026-11-02
- **Issues:** #75 (research), #76 (closed as refuted)
- **Deciders:** SDK maintainers

## Context

Every Resumen de Factura de Consumo Electrónica (RFCE, E32 below RD$250,000) must
carry a 6-character security code in `<CodigoSeguridadeCF>`. The same value is
embedded in the buyer-facing verification URL (`consultatimbrefc`).

The official DGII documents are ambiguous about how the value is derived.
_Formato de Resumen Factura de Consumo Electrónica v1.0_, field 31, states:

> Corresponde a los 6 primeros caracteres del Hash de la firma digital
> correspondiente a la factura de consumo electrónica emitida, menor a DOP$250 M.

The phrase "Hash de la firma digital" admits at least three readings:

1. The first 6 characters of `<SignatureValue>` (the Base64 signature itself).
2. The first 6 characters of the SHA-256 hash of the `<SignatureValue>` text.
3. The first 6 characters of the SHA-256 hash of the decoded DER signature.

The document does not disambiguate, and no official worked example pairs a
`<SignatureValue>` with its resulting code.

## Evidence gathered

- **The field is not validated by DGII.** The same official field definition is
  annotated `a) Sin validación`. A divergence therefore cannot cause an RFCE
  rejection; it can only affect the buyer-facing lookup.
- **The documented type is `ALFA NUM` (6), not hexadecimal.** The value may
  contain characters outside the hex alphabet.
- **DGII's published support guidance explains the presence of `+` and `/` by
  the `SignatureValue` being Base64**, not by a hashing step. A real accepted
  comprobante is quoted in that thread with security code `ARB+Ux`.
- **The ecosystem behaves this way.** The library this repository descends from
  and multiple production integrations expose the same derivation.
- **The upstream sample pair is not independent evidence.** In
  `victors1681/dgii-ecf`, `signedECF32.xml` → `rfce.xml` yields `m+tPLr`, equal
  to `SignatureValue[:6]`, but that repository's own test asserts the fixture
  equals its implementation's output. The fixture is self-referential.

## Decision

Keep the current derivation: **the first 6 characters of `<SignatureValue>`**.

The property that actually matters is consistency: the value written into
`<CodigoSeguridadeCF>` and the value placed in the verification URL must come
from a single source. Both SDKs already guarantee this by deriving the code once
in `getCodeSixDigitfromSignature` / `get_code_six_digit_from_signature` and
reusing it for the RFCE payload and the QR URL.

## Consequences

- No behavioural change; no migration.
- The ambiguity is recorded here so it is not re-litigated without new evidence.
- The function keeps its current name and signature for compatibility.

## Evidence that would supersede this decision

A DGII-published RFCE that shows both `<SignatureValue>` and
`<CodigoSeguridadeCF>`, where the code is **not** the first 6 characters of the
signature value. In that case:

1. Re-open #76.
2. Update `packages/typescript/src/utils.ts` and
   `packages/python/src/py_dgii_ecf/utils.py`.
3. Update the RFCE conversion and the QR helpers, which consume the same value.
4. Record the new evidence in this ADR.
