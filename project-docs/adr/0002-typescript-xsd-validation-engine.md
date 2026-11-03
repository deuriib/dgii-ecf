# ADR 0002 — XSD validation engine for the TypeScript SDK

- **Status:** Accepted
- **Date:** 2026-11-02
- **Issue:** #114
- **Related:** ADR 0001, #93 (Python implementation)

## Context

The Python SDK validates documents against the official DGII XML Schemas using
`lxml`, which is already a dependency. The TypeScript SDK had no equivalent, and
`validateDocument` cannot be implemented without an XSD 1.0 engine.

Three candidates were evaluated by installing them and running the bundled
`e-cf-32.xsd` against a document with a deliberately invalid `TipoeCF` and a
malformed date.

## Options considered

### 1. `libxmljs2` — native bindings

Rejected: it has no prebuilt binary for Node 26, and building from source fails
in this environment (`node-gyp` → `make` error). A published SDK cannot require
a toolchain that fails on current Node.

### 2. `xsd-schema-validator` — Java backend

Rejected: it requires **JRE 8+** on the consumer machine. Shipping a Java
requirement to validate an invoice is not a reasonable ask, and the package
cannot be tested in an environment without Java.

### 3. `typesxml` — pure TypeScript

Attractive on paper: pure TS, no native build, advertises XML Schema 1.0. In
practice its validation is not usable:

```
baseline         VALID
no-RNCEmisor     VALID   ← required element removed
no-MontoTotal    VALID   ← required element removed
empty <ECF/>     VALID   ← empty document
wrong-root       INVALID ← only the root declaration is checked
```

It loads the schema (confirmed via `processedSchemaLocations`) but enforces only
that the root element is declared. `TipoeCF=99`, outside the schema's `CFType`
enumeration, also passes.

### 4. `xmllint` via subprocess — chosen

- Zero npm dependencies.
- Same pattern the repository already uses for `xmlsec1` in
  `scripts/verify-signing.ts`, including the `DGII_XMLSEC_BIN` override.
- `xmllint` is libxml2's validator — the same engine family the DGII `.NET`
  stack and `lxml` use, so results agree with the Python SDK.

## Decision

Validate by shelling out to `xmllint --noout --schema <xsd> -` with the document
on stdin. The binary defaults to `xmllint` on `PATH` and can be overridden with
`DGII_XMLLINT_BIN` or the `xmllintBin` client option.

A missing binary is a `VALIDATION` error naming the problem. It is **never** a
silent pass.

## Consequences

- `validateBeforeSend` is opt-in and only covers the general e-CF path, matching
  Python.
- The twelve compilable schemas are copied into the package (`tsup`
  `publicDir`), adding ~1.2 MB to the tarball.
- Consumers who never enable validation pay nothing at runtime and need no
  binary.
- The TypeScript tests exercise the plumbing with stand-in binaries, because
  `xmllint` is not installed everywhere. The schemas themselves are compiled and
  exercised by the Python suite through `lxml`.

## Evidence that would supersede this decision

A pure-JavaScript XSD 1.0 validator that actually enforces structure and facets,
is maintained, and has no native or JVM requirement. In that case, re-open #114.
