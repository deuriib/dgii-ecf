# Cross-check — DGII expert ruling vs. DGII primary sources (NotebookLM)

**Purpose.** The DGII e-CF Expert's ruling (`expert-consult-dgii-expert.md`) was checked against the
DGII's own documents in the NotebookLM notebook **"Reglamento y Guía de Facturación Electrónica de la
DGII"** (34 sources, including `Descripcion-tecnica-de-facturacion-electronica.pdf`,
`Informe Técnico e-CF v1.0.pdf`, the e-CF XSDs as text, `Decreto 587-24`).
NotebookLM answers are AI-synthesised from those uploads; each claim below carries the source
passage it rests on.

## Verdict

**The ruling holds on both questions.** One refinement (per-origin keying), one correction of
emphasis (money severity stays MEDIUM, and the XSD allows 0, 1 or 2 decimals — not "exactly 2"), and
one new constraint for the `json2xml` guard (`PrecioUnitarioItem` allows 4 decimals).

## Q1 — `buyerHost` credential

| Expert's claim | Primary source | Status |
| --- | --- | --- |
| The token for `fe/recepcion/api/ecf` is **issued by the receiver**, not DGII | *Descripción técnica*, Recepción: *"Un header Authorization con el esquema Bearer y el valor del token obtenido en la autenticación, **condicional a que se haya declarado autenticación**"*; Autenticación endpoints are `fe/autenticacion/api/semilla` → `fe/autenticacion/api/validacioncertificado`, which return `{token, expira, expedido}` | **CONFIRMED** |
| Receiver authentication is **optional**, the receiver's policy | *Descripción técnica*: *"URL de autenticación … su uso es **opcional**, no obstante, es recomendado antes de generar una sesión"*; *"Implementar autenticación para el uso de sus servicios es opcional para los contribuyentes"*; *Informe Técnico e-CF v1.0*: *"Esta última es **opcional**, ya que solo sería utilizada en caso de que el emisor requiera que el receptor se autentique"* | **CONFIRMED** |
| DGII's bearer token is scoped to DGII's services and is **not** documented as valid at another contributor's host | *Descripción técnica*: *"Token: valor emitido por Impuestos Internos como llave de seguridad para **utilizar los servicios de Facturación Electrónica**"*; **no document states cross-honouring** | **CONFIRMED** (silence on cross-honouring; treat as not allowed) |
| One token slot for two credential universes is a domain defect | Autenticación is *"Servicio web responsable de generar una sesión **para el contribuyente**"* — a session belongs to an origin/contraparte pair | **CONFIRMED** |
| Per-origin tokens is the DGII-correct fix | The three URLs are registered and returned **independently** (`urlRecepcion`, `urlAceptacion`, `urlOpcional`), each defined as *"host del servicio …"* | **CONFIRMED, with refinement** |

**Refinement (new constraint).** The directory returns `urlRecepcion`, `urlAceptacion` and
`urlOpcional` as **independent host fields**, and the documents neither forbid nor require them to
share a domain. So "per-origin" must key on the **origin of the URL actually being called**, not on a
single caller-supplied `buyerHost`. One receiver can legitimately serve reception and commercial
approval from different hosts, and its auth endpoint from a third one.

## Q2 — money representation

| Expert's claim | Primary source | Status |
| --- | --- | --- |
| `MontoTotal` / `TotalITBIS` are `Decimal18D1or2ValidationTypeMayorIgualCero` | XSD text in the notebook, identical to the vendored copy: `<xs:pattern value="[0-9]{1,16}(.[0-9]{1,2})?"/>`, `totalDigits=18`, `fractionDigits=2` | **CONFIRMED** |
| More than 2 decimals or scientific notation is rejected | *Descripción técnica* / *Informe Técnico*: rejection causes include an invalid XML structure (XSD); the pattern admits digits only, so `3.3000000000000003` and `1e+21` fail validation | **CONFIRMED** (loud, not silent) |
| Money as float never reaches the signed bytes from SDK-owned code | Not a DGII matter — verified in the repo (see the expert report) | unchanged |
| Severity **MEDIUM** | No path lets a wrong amount be *accepted*; the failures are a schema rejection or a printed-QR mismatch | **CONFIRMED** |

**Correction of emphasis.** The XSD type is `D1or2` — the fraction is **optional**, so `1180` with no
decimals is schema-valid on the document. The expert's report reads as "two decimals required"; the
rule is *"up to two"*. What is required is the **QR URL**, where the *Informe Técnico* template is
literally `MontoTotal=XXXX.XX` and the *Descripción técnica* examples use `montototal=02.11` and
`montototal=6225.09`. Whether DGII's backend normalises `1180` to `1180.00` is still **not
documented**, so the SDK should emit two decimals and stop relying on normalisation.

**New constraint for the `json2xml` money guard.** `PrecioUnitarioItem` is
`Decimal20D1or4ValidationTypeMayorIgualCero` — **up to 4 decimals**. A guard that rounds all money
leaves to 2 decimals would corrupt a valid unit price. The guard must reject non-finite values,
scientific notation and more than the **field's** allowed decimals (2 for the `Decimal18D1or2` family,
4 for `Decimal20D1or4`), or better, refuse any non-string money leaf and let the caller format.

## What this cross-check changes in the plan

1. **Q1 stands as HIGH**: per-origin tokens (option 1), `omitAuth` on buyer sends as the same-week
   stopgap, `https`-only validation. No new work — one refinement: key the token store by the
   **origin of each URL** (`urlOpcional`, `urlRecepcion`, `urlAceptacion`), not by a single
   `buyerHost`.
2. **Q2 stands as MEDIUM**: keep the response-model change out of the patch, keep the `json2xml`
   guard in it — but per-field, and never by blanket rounding.
3. The expert's "what the evidence does not settle" list shrinks from 5 to 2: whether DGII's backend
   normalises `montototal`, and whether the receiver requires the session token in practice (policy,
   not spec). Both remain non-blocking for the fix.

## Provenance

NotebookLM notebook `reglamento-y-guia-de-facturaci` (id `a9015f64-…`), session `d2eeb69e`, three
questions, answers with footnotes. Primary documents cited by the notebook:
`Descripcion-tecnica-de-facturacion-electronica.pdf`, `Informe Técnico e-CF v1.0.pdf`,
`e-CF 32/33/41/45 v.1.0` XSDs, `Decreto 587-24`, `Formato Resumen Factura Consumo Electrónica v1.0`.
No traffic was sent to any DGII host.
