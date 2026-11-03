# DGII XML Schemas

Official XML Schemas published by the DGII, mirrored here so examples and tests
can validate documents without a network round-trip.

- **Source:** <https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/documentacionSobreE-CF.aspx>
  → *Documentación Técnica (XSD)*
- **Retrieved:** 2026-11-02
- **Version:** 1.0 for every document type
- **Integrity:** every file is listed with its `sha256` in `MANIFEST.json`.

## Which schemas compile

These twelve compile and are used by `validate_document`:

`e-cf-32`, `e-cf-33`, `e-cf-34`, `e-cf-41`, `e-cf-43`, `e-cf-44`, `e-cf-45`,
`e-cf-46`, `e-cf-47`, `anecf`, `arecf`, `semilla`.

## Which do not

Three published schemas are **invalid as published** and are kept under
`upstream-invalid/` for traceability only. They are not bundled in the package
and `validate_document` reports them as unavailable rather than passing
silently.

| Schema | Why it does not compile |
| --- | --- |
| `e-CF 31 v.1.0.xsd` | References `IndicadorServicioTodoIncluidoType`, which does not resolve. |
| `RFCE 32 v.1.0.xsd` | Invalid pattern facet: `[$0-9]` and the `\-` escape are not valid XML Schema regex. |
| `ACECF v.1.0.xsd` | Invalid pattern facet: the `\-` escape is not valid XML Schema regex. |

Do not "fix" these files in place — patching an official schema silently would
make the validator disagree with what DGII publishes. If a patch is ever
adopted, it must be recorded in `MANIFEST.json` with the original and the
reason.

## Notes

- The package ships its own copy at `packages/python/src/py_dgii_ecf/schemas/`;
  this mirror exists for examples and tests. Both are byte-identical.
- `examples/fixtures/invoice-32.xml` validates against `e-cf-32.xsd` **once
  signed**. The schema ends with an `xs:any` for the signature, so the unsigned
  fixture is structurally incomplete by design — the test signs it first and
  asserts the signed document validates.
