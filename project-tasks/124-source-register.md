# #124 — Verified official-source register (DGII e-CF)

Register of the official normative documents that the SDK's ground-truth statements and the docs
site's integration steps actually depend on. Written for the writer who will turn the mapping in
[Mapping to the documented integration steps](#mapping-to-the-documented-integration-steps) into
inline "Official source" lines.

**Status: frozen artifact for pipeline P1 — revision 3 (attempt 3).** Consumer: P2 (`docs/en/**`) and
P3 (`docs/es/**`). A late addition re-runs verification and notifies both. Revision 3 changes one URL
(the working entry point, which returned `404`) and no `HTTP` cell, no title and no access date: it
corrects the QR/URL character count, two mis-cited legal texts, the last unbacked rows of the §
column, the § cells of the two scanned instruments and the count sentence, and it adds TEC-01 §19 to
the contingency scope.

## Scope and method

- **Inputs**: `project-docs/dgii-ground-truth.md` (10 sections, the normative claims), `examples/fixtures/schemas/MANIFEST.json`
  (15 schemas with a `source_url` each), `docs/en/guides/flow.md` (the ten steps to cite).
- **Reconstruction, not copy**: the notebook's original 34-document list is not in the repository, so
  this register is rebuilt from the claims. Every row names the ground-truth section it governs —
  and where a document governs **none**, the § cell says so and gives the reason instead of borrowing
  a section (LEG-01/LEG-02, which are scans with no machine-readable text; XSD-13/14, which do not
  compile; the six `OPS-*` manuals). [Section F](#f-ground-truth--coverage--what-the--column-means)
  states, per section `§1`–`§10`, which rows back it and which step consumes it, so the column is
  checkable rather than decorative.
- **No invented entries**: a document appears here only if a ground-truth claim or the XSD manifest
  depends on it **and** the URL returned a success status from this machine on 2026-11-09.
- **Discovery path**: documents were found through DGII section pages, not folder listings
  (`dgii.gov.do` folder listings answer `401`). Working entry points:
  [Documentación sobre e-CF](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/documentacionSobree-CF.aspx)
  (18 PDF links + all 15 XSDs) and
  [Marco Legal](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/marcoLegal.aspx)
  (Leyes, Decretos, Normas Generales, Resolución 035-2020, Avisos).
- **Titles and versions** were confirmed against the documents themselves (PDF metadata/title page),
  not only against the page listing. Where DGII republished a file without bumping its version, the
  publication date DGII shows on the listing is recorded next to the version.
- **Article- and field-level claims were read from extracted document text**, not inferred from
  titles: the DGII technical PDFs are text-extractable and were extracted (see the recipe below).
  The exceptions are stated where they occur.
- **No DGII body text is reproduced here** — titles, versions, URLs, one-line descriptions and short
  quoted fragments used to anchor a rule. The site must not copy DGII prose.

### Verification recipe (reproduce it before trusting a row)

```bash
UA_B="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
curl -s -A "$UA_B" -o /dev/null -w "%{http_code}\n" -L --max-time 30 "<url>"
```

- **`dgii.gov.do` rejects known bot User-Agent strings.** `curl/8.18.0` and `python-requests/2.31.0`
  both get `403`; a browser UA gets `200`. A request with **no `User-Agent` header at all also gets
  `200`**, so the block is UA-string blacklisting, not a browser requirement. Practical rule: send the
  browser UA above to `dgii.gov.do`. Every DGII row below was verified with it.
- **`statusecf.dgii.gov.do` serves any User-Agent.** Measured `200` for `curl`, for
  `python-requests`, for no UA header and for the browser UA, on `/api-docs/v1/definition.json`,
  `/help/index.html` and `/`. No special UA is required there.
- **`www.w3.org` is the inverse**: it answers `403` to that browser UA on this network and `200` to a
  plain curl UA or to no UA at all. The `STD-*` rows were verified with a plain UA. This is W3C edge
  behaviour, not a broken link.
- **DGII PDFs are text-extractable** — extract the text before quoting any TEC or LEG rule:

  ```bash
  curl -s -A "$UA_B" -L -o tec02.pdf "<url>"
  uv run --with pypdf python -c "from pypdf import PdfReader; print('\n'.join(p.extract_text() or '' for p in PdfReader('tec02.pdf').pages))"
  ```

  This works for TEC-01 (53 pp), TEC-02 (47 pp), TEC-03 (13 pp), TEC-04 (13 pp), TEC-05 (89 pp),
  TEC-10 and LEG-03/LEG-07. **Two rows are scanned images with no text layer** and cannot be quoted at
  article level on this machine: **LEG-01** (Ley 32-23) and **LEG-02** (Decreto 587-24 — 29 pages,
  **0** extractable characters). Their identity rests on the URL, the `application/pdf` type and DGII's own
  listing label, not on extractable text.

- HTTP status is per-URL and was observed once per row on the access date; DGII republishes files in
  in place, so a status is not a content guarantee. `sha256` for the **12 pinned** schemas (the
  `schemas` array) lives in `MANIFEST.json`; the **3 `excluded` entries** carry `name`/`reason`/
  `source_url` and no hash. If a pinned schema changes, the manifest hash is what detects it, not this
  status column.

**Access date for every row: 2026-11-09.**

---

## A. Legal and normative framework

| ID     | Official title — what it establishes                                                                                          | Version / date           | Canonical URL                                                                                                                             | HTTP | Access     | Ground-truth §                                               | Doc-site step(s)                 |
| ------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------- | ------------------------------------------------------------ | -------------------------------- |
| LEG-01 | **Ley núm. 32-23, Ley General de Facturación Electrónica** — mandatory e-CF regime, system structure, implementation calendar | 16 May 2023              | https://dgii.gov.do/legislacion/leyesTributarias/Documents/Otras%20Leyes%20de%20Inter%C3%A9s/32-23.pdf                                    | 200  | 2026-11-09 | — (identity only — scanned)                                  | routing, submit                  |
| LEG-02 | **Decreto núm. 587-24** — Reglamento for the application of Ley 32-23 (voluntariedad, contingency, deferral, incentives)      | 17 Oct 2024              | https://dgii.gov.do/legislacion/decretos/Documents/2024/Decreto587-24.pdf                                                                 | 200  | 2026-11-09 | — (contingency: TEC-04 §5–6 + TEC-01 §19, no ground-truth §) | pre-flight, submit               |
| LEG-03 | **Norma General núm. 01-2020** — regulates issuance and use of e-CF (receptor duties, corrections/voiding, consultations)     | NG 01-2020               | https://dgii.gov.do/legislacion/normasGenerales/Documents/NG%20sobre%20Comprobantes%20Fiscales/Norma01-20.pdf                             | 200  | 2026-11-09 | §8, §9, §10                                                  | submit, track, approval, voiding |
| LEG-04 | **Norma General núm. 05-2019** — special receipt types; Art. 11 defines the e-CF and its mandatory digital signature          | NG 05-2019 (08 Apr 2019) | https://dgii.gov.do/legislacion/normasGenerales/Documents/NG%20sobre%20Comprobantes%20Fiscales/Norma05-19.pdf                             | 200  | 2026-11-09 | §8                                                           | routing, sign                    |
| LEG-05 | **Resolución núm. 035-2020** — application of Ley 126-02 to tax procedures; required attributes of tax-procedure certificates | 2020                     | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documents/Marco%20Legal/Resolucion%20035-2020.pdf | 200  | 2026-11-09 | §8                                                           | sign (certificate preflight)     |
| LEG-06 | **Ley núm. 126-02** — electronic commerce, documents and digital signatures (statutory basis of the e-CF signature)           | 2002                     | https://dgii.gov.do/legislacion/leyesTributarias/Documents/Otras%20Leyes%20de%20Inter%C3%A9s/126-02.pdf                                   | 200  | 2026-11-09 | §8                                                           | sign                             |
| LEG-07 | **Aviso 24-19** — e-NCF structure notice: `E` + 2-digit type + 10-digit sequence = 13 characters; type codes 31–45            | Aviso 24-19              | https://dgii.gov.do/publicacionesOficiales/avisosInformativos/Documents/2019/24-19.pdf                                                    | 200  | 2026-11-09 | §7                                                           | routing, submit                  |

Notes:

- **LEG-01 and LEG-02 are scanned images** (no text layer: **0** extractable characters on either).
  Reachability, file type, page count and title were verified; article-level text was **not**
  machine-verified on this machine, so **neither row carries a `§`**. Their dates come from DGII's own
  text-extractable avisos, but the location differs: **Aviso 07-23** states the 16 May 2023 date in its
  **opening paragraph** ("la publicación oficial de la Ley no. 32-23 … de fecha 16 de mayo de 2023")
  and closes on **25 May 2023**; **Aviso 20-24** states the 17 Oct 2024 date in its **closing line**
  ("a los diecisiete (17) días del mes de octubre del año dos mil veinticuatro (2024)"). Applying
  "read the closing line" to Aviso 07-23 would return 25 May 2023, nine days off. LEG-02's normative
  content is nevertheless usable at the article level **through DGII's own quotation of it**:
  TEC-04 §5.2–6.2 and TEC-01 §19 quote Decreto 587-24 Arts. 40–43 by number in extractable text, so
  its § cell records contingency scope (no ground-truth section) rather than §9 — the §9 filing
  deadline the ground truth attributes to it is not locatable; see judgement call 6.
- **LEG-01's § cell is blank on purpose.** §1 is _Hosts and environments_ and a statute does not state
  `ecf.dgii.gov.do`/`testecf`; §7 is type taxonomy and routing, and step 3 explicitly records that
  LEG-01 carries the obligation, **not** a routing rule; §9 cannot be proved from a scan. What LEG-01
  supplies is the legal anchor at title level, quoted with **no article number and no date**.
- **LEG-03's § cell no longer claims §4.** §4 is _Authentication_ (seed XML, token JSON/TTL) and a
  Norma General does not define the seed; that mapping runs TEC-02 → XSD-12 → TEC-01 §4.1. Legitimate
  claims: §8 (Art. 5 _Del Certificado Digital_, p. 7), §9 (Art. 8 _Aprobación y Rechazo_ ¶I, Art. 12
  _Correcciones y Anulación_, pp. 8–9) and §10 (Art. 9 _Del Receptor Electrónico_, p. 9 — every issuer
  is also a receiver — plus Art. 11(c), the duty to receive every validly issued e-CF from its
  suppliers). The duty to **acknowledge** receipt is **Art. 8 ¶I** (p. 8), not Art. 9: Art. 9 is a
  single unnumbered paragraph and imposes no acknowledgement duty.
- **LEG-07 is a structure notice, not the field layout.** It is text-extractable and states the
  13-character structure in its own words ("la letra E indica la serie, los próximos 2 dígitos
  especifican el tipo de comprobante y los últimos 10 dígitos corresponden a la secuencia, para un
  total de 13 caracteres"), but it lists **only types 31–45** and predates the current e-CF format.
  Use **TEC-01 §7** for the current structure _and_ for the validity rule, and TEC-05 / TEC-01 §6.1
  for the full 31–47 code list. LEG-07 is cited for the e-NCF structure notice and nothing else, and
  it states **no e-NCF validity rule** — that rule is TEC-01 §7, which is why ground-truth §9 does not
  rest on this Aviso.

## B. Technical specification and service-level specifications

| ID     | Official title — what it governs                                                                                                                                                                                                | Version / date                                                                    | Canonical URL                                                                                                                                                                                                                            | HTTP | Access     | Ground-truth §                                             | Doc-site step(s)                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| TEC-01 | **Informe Técnico Comprobante Fiscal Electrónico** (Gerencia de Facturación) — end-to-end model: authenticity, web services, type catalogue §6.1, e-NCF structure and validity §7, tolerances §12–13, contingency operation §19 | v1.0; site-updated 2026-10-16                                                     | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Informe%20T%C3%A9cnico%20e-CF%20v1.0.pdf                                | 200  | 2026-11-09 | §1–§10 (master reference — not a per-section claim; see F) | all steps                                                            |
| TEC-02 | **Descripción Técnica Servicios DGII** — per-service endpoints, parameters, responses, status codes, directory, B2B auth, `consultaresultado`/`consultarfce` reuse flag                                                         | site-updated 2026-05-29; bitácora rev. 2026-01-02                                 | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Descripcion%20Tecnica%20Servicios%20DGII.pdf                            | 200  | 2026-11-09 | §1–§10 (master reference — see F)                          | authenticate, submit, track, reconcile, approval, voiding, directory |
| TEC-03 | **Descripción Técnica Servicios Emisores Electrónicos** — issuer/receiver standards: file naming, character escaping, signing rules, B2B services to expose                                                                     | site-updated 2026-05-29; bitácora rev. 2026-01-02 (escape rules added 2025-04-03) | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Descripcion%20Tecnica%20Emisores%20Electronicos.pdf                     | 200  | 2026-11-09 | §3, §8, §10                                                | sign, submit (file name), directory/B2B                              |
| TEC-04 | **Estándares de Comportamiento Esperado en la Integración con el Sistema** — maintenance windows, availability monitoring, contingency conduct                                                                                  | site-updated 2026-11-06                                                           | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Estandares%20de%20Comportamiento%20Esperado%20en%20la%20Integracion.pdf | 200  | 2026-11-09 | §1 (status host only, §5.1)                                | pre-flight, reconcile, contingency                                   |
| TEC-05 | **Formato Comprobante Fiscal Electrónico (e-CF) V1.0** — field-by-field e-CF XML format, `TipoeCF` catalogue 31–47, obligatory/optional codes                                                                                   | v1.0, Oct 2025; site-updated 2025-10-30                                           | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Comprobante%20Fiscal%20Electr%C3%B3nico%20(e-CF)%20V1.0.pdf                                  | 200  | 2026-11-09 | §7                                                         | routing, sign, submit, directory/B2B                                 |
| TEC-06 | **Formato de Resumen Factura de Consumo Electrónica <DOP250,000 (RFCE) v1.0** — RFCE XML and `CodigoSeguridadeCF` definition                                                                                                    | v1.0, Jan 2020; site-updated 2020-08-19                                           | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Resumen%20Factura%20Consumo%20Electr%C3%B3nica%20v1.0.pdf                                    | 200  | 2026-11-09 | §7, §5                                                     | routing, submit (summary)                                            |
| TEC-07 | **Formato Aprobación Comercial (ACECF) v1.0** — ACECF XML: `DetalleAprobacionComercial`, `Estado` 1/2, `FechaHoraAprobacionComercial`                                                                                           | v1.0, Jan 2020; site-updated 2020-01-10                                           | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Aprobaci%C3%B3n%20Comercial%20v1.0.pdf                                                       | 200  | 2026-11-09 | §9                                                         | commercial approval                                                  |
| TEC-08 | **Formato Anulación de e-NCF v1.0** — ANECF XML and the rule that only unsent/undelivered sequences may be voided                                                                                                               | v1.0, rev. 2022-05-24                                                             | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Anulaci%C3%B3n%20de%20e-NCF%20v1.0.pdf                                                       | 200  | 2026-11-09 | §9                                                         | range voiding                                                        |
| TEC-09 | **Formato Acuse de Recibo (ARECF) v1.0** — ARECF XML; receipt acknowledgement, prior to and independent of commercial approval                                                                                                  | v1.0; site-updated 2025-10-30                                                     | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Acuse%20de%20Recibo%20v%201.0.pdf                                                            | 200  | 2026-11-09 | §10                                                        | directory/B2B                                                        |
| TEC-10 | **Firmado Comprobantes Fiscales Electrónicos (e-CF)** — signature profile by example: C14N URI, RSA-SHA256, SHA-256 digest, `URI=""`, X509 `KeyInfo`                                                                            | site-updated 2023-11-22                                                           | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Firmado%20de%20e-CF.pdf                                    | 200  | 2026-11-09 | §8                                                         | sign (all steps that sign)                                           |
| TEC-11 | **FE Estatus Servicios API (OpenAPI v3.0.1 spec)** — machine-readable service spec: the three availability endpoints, `Ambiente` enum, `ApiKey` Authorization scheme                                                            | v1                                                                                | https://statusecf.dgii.gov.do/api-docs/v1/definition.json                                                                                                                                                                                | 200  | 2026-11-09 | §1, §2                                                     | pre-flight/service status                                            |

Notes:

- **TEC-11 is a machine-readable service specification, not a normative document.** It is counted
  separately for that reason (see [Verified count](#verified-count)). It is the only place the literal
  status-service paths are published. Its human UI is
  <https://statusecf.dgii.gov.do/help/index.html> (200). TEC-04 §5.1 names that portal as the first
  check before any retry.
- **TEC-04 is operational.** It governs availability and contingency conduct and quotes the legal basis
  itself (Ley 32-23 Art. 21, NG 01-2020 Arts. 3(i) and 10, Decreto 587-24 Arts. 40–43). It carries none
  of §5 (status codes) and none of §9 (AC/voiding) — the previous revision's §1/§2/§5/§9 attribution was
  wrong and is withdrawn. Its only ground-truth claim is **§1, and only for the status host** (§5.1
  names `statusecf.dgii.gov.do`); its availability/contingency contribution still has **no ground-truth
  section at all**; see [Residual risk](#residual-risk-for-the-writer).
- **TEC-02's bitácora and TEC-03's bitácora both record the 02-01-2026 split** of the former single
  "Descripción Técnica" into TEC-02 (DGII services) and TEC-03 (issuer services). Cite both current
  files; never a third-party copy of the pre-split document.
- **TEC-03 carries §3** because its cURL examples post the multipart field `xml` itself
  (`-f 'xml=@archivosemillafirmado.xml;type=text/xml'`, plus two more). The register no longer claims
  the field name exists only inside TEC-02; only the Swagger-style `xml*` annotation is TEC-02-only.

## C. Schemas (the 15 XSDs of `examples/fixtures/schemas/MANIFEST.json`)

All 15 URLs are the manifest's `source_url` values, unchanged; all returned `200`. Byte-identity is
tracked by `sha256` in the manifest, not here. Three do not compile and are kept under
`upstream-invalid/` on purpose — the register records the URL, not a repaired copy.

**Manifest bookkeeping.** The 15 XSD URLs are **12 entries in the manifest's `schemas` array plus the
3 entries in its `excluded` array**; the `reason` string on each excluded entry is the source of the
"does not compile upstream" claim (invalid pattern facets on `RFCE 32` and `ACECF`, a missing
`IndicadorServicioTodoIncluidoType` reference on `e-CF 31`). Counting the register's XSD rows against
`schemas` alone undercounts by three.

| ID     | Official title — what it governs                                                                                                                                            | Version / date                | Canonical URL                                                                                                                                                                      | HTTP | Access     | Ground-truth §                          | Doc-site step(s)                  |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------- | --------------------------------------- | --------------------------------- |
| XSD-01 | **e-CF 32 v.1.0** — Factura de Consumo Electrónica schema                                                                                                                   | v1.0; site-updated 2025-10-16 | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2032%20v.1.0.xsd | 200  | 2026-11-09 | §7                                      | routing, sign, submit             |
| XSD-02 | **e-CF 33 v.1.0** — Nota de Débito Electrónica schema                                                                                                                       | v1.0; site-updated 2026-04-01 | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2033%20v.1.0.xsd | 200  | 2026-11-09 | §7                                      | routing, sign, submit             |
| XSD-03 | **e-CF 34 v.1.0** — Nota de Crédito Electrónica schema                                                                                                                      | v1.0; site-updated 2026-04-01 | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2034%20v.1.0.xsd | 200  | 2026-11-09 | §7                                      | routing, voiding (E34 path)       |
| XSD-04 | **e-CF 41 v.1.0** — Comprobante Electrónico de Compras schema                                                                                                               | v1.0; site-updated 2025-10-16 | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2041%20v.1.0.xsd | 200  | 2026-11-09 | §7                                      | routing, sign, submit             |
| XSD-05 | **e-CF 43 v.1.0** — Comprobante Electrónico para Gastos Menores schema                                                                                                      | v1.0; site-updated 2025-10-16 | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2043%20v.1.0.xsd | 200  | 2026-11-09 | §7                                      | routing, sign, submit             |
| XSD-06 | **e-CF 44 v.1.0** — Comprobante Electrónico para Regímenes Especiales                                                                                                       | v1.0; site-updated 2025-10-16 | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2044%20v.1.0.xsd | 200  | 2026-11-09 | §7                                      | routing, sign, submit             |
| XSD-07 | **e-CF 45 v.1.0** — Comprobante Electrónico Gubernamental schema                                                                                                            | v1.0; site-updated 2025-10-16 | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2045%20v.1.0.xsd | 200  | 2026-11-09 | §7                                      | routing, sign, submit             |
| XSD-08 | **e-CF 46 v.1.0** — Comprobante Electrónico para Exportaciones schema                                                                                                       | v1.0; site-updated 2025-10-16 | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2046%20v.1.0.xsd | 200  | 2026-11-09 | §7                                      | routing, sign, submit             |
| XSD-09 | **e-CF 47 v.1.0** — Comprobante Electrónico para Pagos al Exterior                                                                                                          | v1.0; site-updated 2025-10-16 | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2047%20v.1.0.xsd | 200  | 2026-11-09 | §7                                      | routing, sign, submit             |
| XSD-10 | **ANECF v.1.0** — range-voiding schema (`Anulacion` 1..10; `TablaRangoSecuenciasAnuladaseNCF` → `Secuencias` 1..10000 → `SecuenciaeNCFDesde`/`Hasta`)                       | v1.0; site-updated 2023-06-20 | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/ANECF%20v.1.0.xsd     | 200  | 2026-11-09 | §9                                      | range voiding                     |
| XSD-11 | **ARECF v1.0** — receipt-acknowledgement schema                                                                                                                             | v1.0; site-updated 2023-06-20 | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/ARECF%20v1.0.xsd      | 200  | 2026-11-09 | §10                                     | directory/B2B                     |
| XSD-12 | **Semilla v.1.0** — seed model (`SemillaModel`: `valor`, `fecha`, one extension slot for the enveloped `Signature`)                                                         | v1.0; site-updated 2020-11-12 | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/Semilla%20v.1.0.xsd   | 200  | 2026-11-09 | §4                                      | authenticate                      |
| XSD-13 | **e-CF 31 v.1.0** — Factura de Crédito Fiscal Electrónica schema (does not compile upstream)                                                                                | v1.0; site-updated 2025-10-16 | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2031%20v.1.0.xsd | 200  | 2026-11-09 | — (does not compile: traceability only) | —                                 |
| XSD-14 | **RFCE 32 v.1.0** — consumption-invoice summary schema (does not compile upstream)                                                                                          | v1.0; site-updated 2023-06-20 | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/RFCE%2032%20v.1.0.xsd | 200  | 2026-11-09 | — (does not compile: traceability only) | submit (summary — reference only) |
| XSD-15 | **ACECF v.1.0** — commercial-approval schema; `<Estado>` is `EstadoType`, an integer restricted to `1` (e-CF Aceptado) and `2` (e-CF Rechazado) (does not compile upstream) | v1.0; site-updated 2022-12-21 | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/ACECF%20v.1.0.xsd     | 200  | 2026-11-09 | §9                                      | commercial approval               |

Notes:

- **The § column claims the document's own element structure only.** A schema governs the elements,
  order and occurrence limits of its document (hence §7 for the nine e-CF models, §9 for ANECF and
  ACECF, §10 for ARECF, §4 for the seed). It provides the `Signature` slot but does **not** govern §8's
  canonicalization, `URI`/reference or transform rules — those are TEC-10 + TEC-03 + STD-01…04. The
  previous revision's §8 on XSD-01/02 and §9 on XSD-03 over-claimed and is withdrawn.
- **XSD-13/14 are carried for traceability only**: they do not compile upstream, they hold no `§`
  claim, and they support no step. Do not cite XSD-13 for anything about e-CF 31. XSD-15 does not
  compile either, but its `EstadoType` restriction is readable and is cited for that domain at step 8.
- **XSD-10's nesting is three levels**, not two: `TablaRangoSecuenciasAnuladaseNCF` wraps a
  `Secuencias` element (`minOccurs="1" maxOccurs="10000"`), each `Secuencias` holding
  `SecuenciaeNCFDesde` / `SecuenciaeNCFHasta`. The previous "1..10000 ranges of Desde/Hasta" dropped
  the wrapper.
- **XSD-15 is now cited for the ACECF `Estado` tag and its `{1,2}` domain** (step 8), not TEC-07 alone.

## D. XMLDSig and XML standards (W3C / IETF canonical sources)

| ID     | Official title — what it governs                                                                                                       | Version / date  | Canonical URL                                    | HTTP | Access     | Ground-truth § | Doc-site step(s) |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------ | ---- | ---------- | -------------- | ---------------- |
| STD-01 | **XML Signature Syntax and Processing 1.1 (W3C REC)** — enveloped-signature transform, `SignedInfo`, `Reference`, `KeyInfo`/`X509Data` | W3C REC         | https://www.w3.org/TR/xmldsig-core1/             | 200  | 2026-11-09 | §8             | sign             |
| STD-02 | **Canonical XML 1.0 (W3C REC)** — inclusive C14N, comments removed                                                                     | W3C REC         | https://www.w3.org/TR/2001/REC-xml-c14n-20010315 | 200  | 2026-11-09 | §8             | sign             |
| STD-03 | **XML Encryption 1.1 (W3C REC)** — defines the `…/2001/04/xmlenc#sha256` digest algorithm URI                                          | W3C REC         | https://www.w3.org/TR/xmlenc-core1/              | 200  | 2026-11-09 | §8             | sign             |
| STD-04 | **RFC 6931** — registers `…/2001/04/xmldsig-more#rsa-sha256` (RSA PKCS#1 v1.5 + SHA-256)                                               | RFC 6931 (IETF) | https://www.rfc-editor.org/rfc/rfc6931           | 200  | 2026-11-09 | §8             | sign             |

STD-04 is IETF, not W3C, because the `xmldsig-more` algorithm URI has no W3C REC of its own; RFC 6931
is its normative registry entry, not a mirror. `rfc-editor.org/rfc/rfc6931` redirects to the canonical
`/info/rfc6931/` landing page.

## E. Certification-process and operational manuals (verified, **not** cited by a ground-truth claim)

Listed because the deliverable asked for the operational/certification corpus, and because the
"pre-flight" and "contingency" advice on the site is easier to attribute with these present. They are
**excluded from the verified normative count** and no mapped step depends on them. If the writer cites
one, it must be as operational guidance, not as the source of a technical rule.

| ID     | Official title — what it governs                                                                                                | Version / date          | Canonical URL                                                                                                                                                                                                                                                        | HTTP | Access     | Ground-truth §                                        | Doc-site step(s)                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------- | ----------------------------------------------------- | ------------------------------------ |
| OPS-01 | **Proceso de Certificación para ser Emisor Electrónico** — certification path for a direct issuer                               | site-updated 2025-08-19 | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaciones%20Proceso%20de%20Certificaci%C3%B3n%20FE/Proceso%20de%20Certificacion%20para%20ser%20Emisor%20Electronico.pdf                     | 200  | 2026-11-09 | — (context: certification gate)                       | certification (outside the 10 steps) |
| OPS-02 | **Proceso de Certificación para ser Emisor Electrónico con Proveedor de Servicios de FE Certificado** — indirect path via a PSE | site-updated 2026-05-29 | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaciones%20Proceso%20de%20Certificaci%C3%B3n%20FE/Proceso-Certificacion-EmisorElectronico-Proveedor-Servicios-FECertificado.pdf            | 200  | 2026-11-09 | — (context: certification gate)                       | certification (outside the 10 steps) |
| OPS-03 | **Norma General núm. 10-2021** — procedure for certification of electronic-invoicing service providers                          | NG 10-2021              | https://dgii.gov.do/legislacion/normasGenerales/Documents/NG%20sobre%20Comprobantes%20Fiscales/Norma10-21.pdf                                                                                                                                                        | 200  | 2026-11-09 | — (context: PSE certification rules)                  | certification (outside the 10 steps) |
| OPS-04 | **Instructivo de Contingencia de Facturación Electrónica** — contingency types, notification, deferred sending                  | site-updated 2026-10-15 | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Instructivo%20de%20Contingencia%20de%20FE.pdf                                          | 200  | 2026-11-09 | — (operational: the manual TEC-04 §6 points to)       | pre-flight (outage path)             |
| OPS-05 | **Instructivo App Firma Digital** — signing an XML with the DGII-provided signing app                                           | site-updated 2023-11-22 | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Instructivo%20App%20Firma%20Digital.pdf                                                | 200  | 2026-11-09 | — (context: manual signing)                           | sign (manual path, optional)         |
| OPS-06 | **Instructivo Delegaciones de Roles de Facturación Electrónica** — delegating signing/issuing roles to a third party            | site-updated 2025-06-11 | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Instructivo%20Delegaciones%20de%20Roles%20de%20Facturaci%C3%B3n%20Electr%C3%B3nica.pdf | 200  | 2026-11-09 | — (context: signer delegation, no ground-truth claim) | sign, authenticate                   |

## Normative but not publicly reachable

| Item                                                                                                              | Status                                                                                                                                                                                                                                                                                                                                                                       | Why it matters                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAPI/Swagger definitions of the five e-CF web services** (`ecf.dgii.gov.do/{ambiente}/{servicio}/swagger/…`) | `URL: not published` — DGII does not publish these as documents; an unauthenticated fetch does not return a document (curl aborts with `Received HTTP/0.9`, i.e. no HTTP response body). The **Swagger-style `xml*` annotation** is TEC-02-only. The **field name `xml` itself is not**: TEC-02's cURL examples and TEC-03's cURL examples both post `xml=@…;type=text/xml`. | The site must cite TEC-02 for the endpoint shapes and both TEC-02/TEC-03 for the field name — never "DGII's Swagger".                                         |
| **DGII folder listings** (`…/Documentacin sobre eCF/…`)                                                           | `URL: not published` for browsing — listings answer `401`; individual files are public.                                                                                                                                                                                                                                                                                      | Do not link a directory; link the file, or the entry pages.                                                                                                   |
| **Certification test-case set / acceptance script**                                                               | `URL: not published` — DGII runs certification per OPS-01/OPS-02; the scenario set is issued during the process.                                                                                                                                                                                                                                                             | The site must not enumerate DGII's certification cases; it can only describe the process.                                                                     |
| **Norma General 07-2018 / 10-18 (Remisión de Informaciones, Formato 606)**                                        | `URL: not registered` — reachable on DGII's site, but no row here. It is the source of the 606 calendar dates that NG 01-2020 Art. 8 ¶I presumes.                                                                                                                                                                                                                            | Do **not** print a calendar date for the AC deadline from this register. Adding this document needs its own verification and would change the frozen row set. |

---

## Mapping to the documented integration steps

Each line names the governing ID(s), then the section/annex that carries the rule, then the exact
detail to which the "Official source" line should attach. `⚠` marks a mapping where the published text
is weaker than the SDK's claim — read the note before writing the sentence.

### 1. authenticate

- **TEC-02**, section _Autenticación → Obtener archivo: semilla_ (GET `/api/autenticacion/semilla`) and
  _Validar archivo: validar semilla_ (POST `/api/autenticacion/validarsemilla`). Carries: the seed XML
  shape, "send the seed **signed**", and the multipart field name.
- **TEC-02**, _PARÁMETROS de entrada `xml*`_ on all five POST services → the form field is literally
  `xml`; the filename belongs only in the multipart disposition. Official cURL example:
  `-F 'xml=@archivo.xml;type=text/xml'`.
- **TEC-03**, _Estándar como Emisor Electrónico_ cURL examples → also post `xml=@…;type=text/xml`, and
  are the second independent source for the field name when TEC-02's Swagger annotation is questioned.
- **TEC-02**, _Autenticación_ preamble → token validity **1 hour**, which DGII itself qualifies as provisional.
- **XSD-12 (Semilla v1.0)** → `SemillaModel` is `valor` + `fecha` + one extension slot: the enveloped
  `Signature` goes inside `SemillaModel`, which is why the _whole_ seed document is signed (§4).
- **TEC-10** → the algorithm profile used to sign the seed is the same e-CF profile (STD-01…04).
- **TEC-01 §4.1** → the authentication service at model level; the token JSON
  `{token, expira, expedido}` is in TEC-02 and §E _validacioncertificado_.
- Also governs the bearer usage on every later call: TEC-02 per-service `-H 'Authorization: bearer …'`.
- ⚠ The seed response example carries **only** `valor` + `fecha`; the `Signature` slot is implied by
  XSD-12's extension element and by TEC-02's instruction to submit the seed signed. Do not claim DGII
  publishes a signed-seed schema — it does not. Cite XSD-12 + TEC-02 together.

### 2. pre-flight / service status

- **TEC-11 (FE Estatus Servicios API — a machine-readable service spec)** →
  `GET /api/EstatusServicios/ObtenerEstatus`,
  `GET /api/EstatusServicios/ObtenerVentanasMantenimiento`,
  `GET /api/EstatusServicios/VerificarEstado` with the `Ambiente` query enum (1, 2, 3), and
  `securitySchemes.ApiKey` — `Authorization: ApiKey {key}`, which is what the SDK calls `statusApiKey`.
  These literal paths are published **only** here.
- **TEC-01 §4.9 (Web Service – Consulta Estatus Servicios)** → the service in DGII's own words:
  "proporcionar el estatus y disponibilidad de los servicios de facturación electrónica, como también
  las ventanas de mantenimientos"; TEC-01 §4 defers the structure to the técnico description, which is
  why the paths live in TEC-11 and the _service_ is still documented in a PDF.
- **TEC-04 §5.1 (Canal oficial de monitoreo de disponibilidad)** → `statusecf.dgii.gov.do` is the first
  check before retrying or escalating; **§7 (_Canales de Verificación y Referencias_)** → using that
  portal requires prior authorisation of access.
- **TEC-04 §5.2–5.3** → behaviour during unavailability and controlled resumption: generate and sign
  normally, store the signed e-CF in a local persistent queue with timestamp, idempotency identifier and
  complete data, hand the customer the RI with the 72-hour legend, never burst on recovery, verify the
  first documents before draining the queue.
- **TEC-04 §6.1–6.2** → contingency types and their **two different limits**, which must not be
  collapsed:
  - **72 hours** — maximum to transmit e-CF generated offline for lack of connectivity, from
    re-establishment.
  - **15 días hábiles** — DGII's own outage (§5.2): beyond it the OFV enables sales/purchases books
    reports and ordinary non-electronic comprobantes.
  - **15 días calendario** — the _issuer's_ maximum contingency for technical impossibility to issue
    (§6.2, expressly "Art. 40, Decreto 587-24"). A different rule with a different clock.

  Legal basis quoted by DGII itself: Ley 32-23 Art. 21, NG 01-2020 Arts. 3(i) and 10, Decreto 587-24
  Arts. 40–43. These are the _only_ article numbers this register verifies for contingency, and they
  come from TEC-04's extractable text — not from LEG-01/LEG-02, which are scans.

- **TEC-01 §19 (_Operación en Contingencia_)** → the same regime from the model document, the strongest
  extractable source: it states the basis ("los artículos 40 al 43 del Reglamento … Decreto núm.
  587-24"), both clocks ("no mayor de setenta y dos (72) horas" for connectivity; "no podrá exceder de
  quince (15) días calendario" for technical impossibility) and the **replacement path** no other row
  carries: each e-CF that replaces a non-electronic comprobante identifies it in _Información de
  Referencia_ via `NCFModificado`, `FechaNCFModificado` and `CodigoModificacion` = `4`.

- ⚠ **`dgii-ground-truth.md` has no contingency section.** Any contingency "Official source" line must
  be scoped to TEC-04 §5–6 and TEC-01 §19 (optionally + OPS-04) and must not claim a `§` number,
  because there is none.
- ⚠ The `Ambiente` enum is published as `[1, 2, 3]` **without labels**. The mapping
  (1 = PreCert, 2 = Prod, 3 = Cert) is the SDK's interpretation. Write "ambiente code" and let the
  code comment carry the mapping; do not attribute the labels to the spec.

### 3. routing by type and amount

- **TEC-02**, _Recepción de e-CF_ → E32 at or above **RD$250,000.00** is received by the general service;
  the section also states plainly that this service does not accept consumption invoices below that
  amount.
- **TEC-02**, _Recepción de resumen factura de consumo electrónica (RFCE)_ → below RD$250,000.00 the
  signed RFCE summary is sent to `recepcionfc/api/recepcion/ecf` instead.
- **TEC-01 §9** (_Factura de Consumo Electrónica menor a DOP$250 mil_) and **§6.1** (_Tipos de e-CF_) →
  the type taxonomy and the threshold rule at specification level.
- **TEC-05 `<TipoeCF>` and TEC-01 §6.1 both list the full catalogue**: **31, 32, 33, 34, 41, 43, 44, 45,
  46, 47** — both include 46 (Exportaciones) and 47 (Pagos al Exterior). Do not call either "the only
  published list": TEC-01 §6.1 prints the same ten-row table.
- **LEG-07 (Aviso 24-19)** → the e-NCF **structure notice**: `E` + 2-digit type + 10-digit sequence = 13
  characters, in the notice's own words. It covers **types 31–45 only**; cite TEC-05 / TEC-01 §6.1 for
  46/47. Treat LEG-07 as the notice, not as the source of the field layout.
- **TEC-01 §7 (Estructura, Formato y Vencimiento de los e-NCF)** → the current home of **both** rules,
  and the strongest extractable source for them:
  - "estructura de trece (13) posiciones alfanuméricas" — `E` + 2 type digits + 10 sequence digits.
  - **validity**: the sequence is valid "desde la fecha de autorización hasta el 31 de diciembre del año
    siguiente y no podrá ser usada posterior a su vencimiento".

  Map ground-truth §7 (`ENCF`, 13 characters) **and §9's last bullet (e-NCF validity) here** — the
  previous revision left the validity bullet unmapped and attributed the 13-character rule to LEG-07
  alone.

- **TEC-06** → the RFCE format exists _because_ of the threshold; its title carries `<DOP250,000`.
- **LEG-01** → the obligation to issue e-CF at all (not a routing rule; don't cite it for the threshold,
  and it is scanned, so no article number).

### 4. sign

- **TEC-10 (Firmado de e-CF)** → the exact algorithm set to emit: `CanonicalizationMethod`
  `http://www.w3.org/TR/2001/REC-xml-c14n-20010315`, `SignatureMethod`
  `…/2001/04/xmldsig-more#rsa-sha256`, `DigestMethod` `…/2001/04/xmlenc#sha256`,
  `Transforms` = enveloped-signature, `Reference URI=""`, `KeyInfo → X509Data → X509Certificate`.
- **TEC-03**, _Firmado de XML_ → the four rules behind §8 that are **not** in TEC-10: signing protocol is
  SHA-256; the certificate `SN` must match the RNC/cédula/pasaporte of the certificate holder;
  `preservewhitespace = false`; **once signed the XML may not be altered in any circumstance**.
- **TEC-03**, _Restricciones de Contenido y/o Caracteres en los XML_ → **eight** reserved characters,
  each with a named, a decimal and a hex escape: `"` `&quot;` `&#34;` `&#x22;` · `'` `&apos;` `&#39;`
  `&#x27;` · `<` `&lt;` `&#60;` `&#x3C;` · `>` `&gt;` `&#62;` `&#x3E;` · `&` `&amp;` `&#38;` `&#x26;` ·
  `©` `&copy;` `&#169;` `&#xA9;` · `€` `&euro;` `&#8364;` `&#x20AC;` · `®` `&reg;` `&#174;` `&#xAE;`.
  Do **not** write "five characters" — that understates a DGII requirement.
- **TEC-03**, the _following_ table of the same section → a **separate** set of **28** QR/URL
  reserved characters for the QR data of the printed representation (space, `!` `#` `$` `&` `'` `(` `)`
  `*` `+` `,` `/` `:` `;` `=` `?` `@` `[` `]` `"` `-` `.` `<` `>` `\` `^` `_` `` ` ``), each replaced
  by its **hex escape only** (`%20`…`%60`). The table spans TEC-03 pp. 5–6 — four of its rows open
  p. 6, which is why it is easy to undercount. This is a different rule from the eight above; keep
  them apart.
- **TEC-03 bitácora** → _Actualizaciones al 03-04-2025_ added the new escape characters;
  _Actualizaciones al 02-01-2026_ records the split of the technical description into TEC-02 + TEC-03.
  Quote TEC-03 for both dates.
- **STD-01…STD-04** → the normative meaning of each URI: enveloped transform and `SignedInfo`
  construction (STD-01), inclusive C14N (STD-02), the SHA-256 digest URI (STD-03), RSA-SHA256 (STD-04).
- **LEG-04 (NG 05-2019 Art. 11)** → legal requirement that an e-CF be signed with a digital certificate;
  **LEG-05 (Resolución 035-2020)** → the "Certificados Digitales para Procedimientos Tributarios"
  attributes (this is the legal home of the `.p12`/"Persona Física" certificate, not the technical docs);
  **LEG-03 (NG 01-2020 Art. 5, _Del Certificado Digital_)** → the issuer-side certificate obligation;
  **LEG-06** → the statutory signature framework.
- **XSD-01…XSD-09** → the element order/structure that the digest covers, and the presence of the
  `Signature` slot. Cite the type-specific XSD, not `e-CF 31` (XSD-13) for anything but reference — it
  does not compile.
- ⚠ **`<KeyValue>` / `<RSAKeyValue>` / `<Exponent>`: this is an SDK rule, not a DGII prohibition.**
  Ground truth §8 says they "must **NOT** be emitted". No DGII document forbids them. TEC-10's PHP
  sample says only "los tag KeyValue, RSAKeyValue, Exponent **no son necesarios**" — _not necessary_, in
  a code comment; TEC-03's _Firmado de XML_ list does not mention them at all. Write "the SDK omits
  `KeyValue`/`RSAKeyValue`/`Exponent` and emits `X509Data` only (TEC-10 shows them as unnecessary)" and
  never cite TEC-03 for a prohibition.

### 5. submit

- **TEC-02**, _Recepción de e-CF_ → POST `/api/facturaselectronicas`, multipart field `xml`, response
  `{trackId, error, mensaje}` with **`mensaje` singular (a string)** — not an array.
- **TEC-02**, _Recepción de resumen factura de consumo electrónica (RFCE)_ → POST
  `recepcionfc/api/recepcion/ecf`, synchronous response
  `{codigo, estado, mensajes[], encf, secuenciaUtilizada}` with `mensajes` **plural (objects)**.
- **TEC-02** per-service cURL blocks → `Authorization: bearer` + `Content-Type: multipart/form-data` +
  `xml=@…;type=text/xml` on every submit.
- **TEC-01 §4.2–4.3** → the same two receptions described at model level; **TEC-01 §12–13** →
  tolerance/cuadratura and rounding rules to reconcile before sending.
- **TEC-03**, _Nombre de los Archivos XML_ → the file-name convention for all four formats:
  `RNCEmisor + e-NCF` for e-CF and for the `<250,000` summary, `RNCComprador + e-NCF` for ACECF and
  ARECF, with 13-character examples throughout (`101672919E310000000001.xml`). This governs the `file`
  argument the SDK requires.
- ⚠ **Do not copy either technical description's file-name example.** TEC-02 prints
  `"101672919E3100000001.xml"` (p. 12) and `"101672919E3200000001.xml"` (p. 16); TEC-03's cURL
  blocks print `101672919e3100000001.xml` (p. 10) and `101672919E3100000001.xml` (p. 12). All four are
  **11-character** e-NCFs, inconsistent with TEC-01 §7's 13 positions, with TEC-03's _Nombre de los
  Archivos XML_ table and with every schema. It is a typo in both documents. Cite TEC-03's table
  (`101672919E310000000001.xml`, 13 characters), never an example block.
- **TEC-06 / XSD-14** → the RFCE document that gets submitted for the below-threshold path.
- **LEG-01 / LEG-02** → the obligation framing, if the paragraph needs a legal anchor. **No article
  number and no calendar date** — see judgement call 6.

### 6. track

- **TEC-02**, _Consulta de resultado e-CF_ → GET
  `/consultaresultado/api/consultas/estado?trackid=`; the five codes
  **0 No encontrado, 1 Aceptado, 2 Rechazado, 3 En Proceso, 4 Aceptado Condicional**.
- **TEC-02**, _Consulta de estado e-CF_ → GET
  `/consultaestado/api/consultas/estado?rncemisor=&ncfelectronico=&rnccomprador=&codigoseguridad=`;
  codes 0/1/2 plus a note that **Aceptado condicional is only observable for consumption invoices below
  RD$250,000.00**.
- **TEC-02** on the same section → `codigoSeguridad` is defined as the first six digits of the hash of
  the `SignatureValue` of the received e-CF (same derivation as TEC-06's `CodigoSeguridadeCF`).
- **TEC-02**, _Consulta de Resumen de Factura de Consumo Electrónica (RFCE)_ (pp. 19–21) → GET
  `fc.dgii.gov.do/{ambiente}/consultarfce/api/Consultas/Consulta?RNC_Emisor=&ENCF=&Cod_Seguridad_eCF=`,
  the non-trackId route to an RFCE's current state. Added in the bitácora _Actualizaciones al
  12-06-2023_ as "un nuevo servicio de consulta de Resúmenes de factura". Step 7 names it as the
  endpoint behind the RFCE reuse signal (see below); without this row that advice is unactionable.
- **TEC-01 §4.5–4.6** → the same two consults at model level; **§5** → the human consults (portal, OFV,
  app) that a support paragraph may reference.

**`secuenciaUtilizada` — the track step is correctly sourced; do not soften it.**

- **TEC-02**, _Consulta de resultado e-CF_, publishes the field **in the `consultaresultado`/trackId
  response itself** — JSON on p. 23 and XML on p. 24 (`<RespuestaConsultaTrackId>` →
  `<secuenciaUtilizada>true</secuenciaUtilizada>`), and documents its meaning in _DESCRIPCIÓN
  PARÁMETROS DE SALIDA_ (pp. 24–25): `true` = the sequence **may not** be reused, `false` = it may,
  when the rejection was for an invalid certificate/signature, an invalid XML structure, a non-delegated
  signer, an unauthorized or expired e-NCF, a non-electronic issuer, or an unknown/inactive RNC.
- **TEC-02's bitácora**, _Actualizaciones al 18-04-2022_, item 1 records that the parameters were added
  "a la respuesta del servicio de **Consulta Resultado** para retroalimentar cuando el número del
  comprobante fiscal electrónico (eNCF) puede ser reutilizado". That is the same service.
- Therefore the sentence in `docs/en/guides/flow.md` step 6 — "On a rejection, `secuenciaUtilizada`
  decides the next step", read from `statusTrackId` → `consultaresultado` — **and its mermaid branch are
  correct and DGII-documented. Cite TEC-02 p. 24. Leave the wording alone.**
- The field is also published on the **RFCE reception response** (step 5) and on **`consultarfce`**
  (p. 21, which carries the same field name; the flag's semantics are documented for
  `consultaresultado`, pp. 24–25 — `consultarfce`'s own parameter description does not define it). It
  is **absent only from `consultaestado`**: `RespuestaConsultaEstado`
  (pp. 27–28) carries `codigo`, `estado`, `rncEmisor`, `ncfElectronico`, `montoTotal`, `totalITBIS`,
  `fechaEmision`, `fechaFirma`, `rncComprador`, `codigoSeguridad`, `idExtranjero` — no reuse flag.
- The consequence of that absence is an **SDK defect, not a docs defect**: `reconcileSubmission` reads
  the flag from `inquiryStatus` (`consultaestado`), so `canReuseSequence` returns `false` for every
  documented `consultaestado` response — it could only answer `true` if DGII returned a field it does
  not document, and the response is a cast (`ok(data as T)`), so nothing in the code prevents that.
  Recorded in
  [Findings for separate issues](#findings-for-separate-issues-recorded-not-fixed-here); do not change
  the guides to match the bug.

### 7. reconcile

- **TEC-02**, _Consulta de trackId e-CF_ → GET
  `/consultatrackids/api/trackids/consulta?rncemisor=&encf=`, response `{trackId, estado, fechaRecepcion}`;
  the "No encontrado" state means DGII holds **no record** of that e-NCF — the exact fact the
  `reconcileSubmission` decision depends on.
- **TEC-02**, _Recepción RFCE_ → `secuenciaUtilizada` (true = consumed, false = reusable) in the
  reception response; **TEC-02**, _Consulta de resultado e-CF_ (p. 24) → the same flag keyed by
  `trackId`; **TEC-02**, _Consulta de Resumen de Factura de Consumo Electrónica (RFCE)_ (p. 21) → the
  same flag keyed by RNC + e-NCF + security code. Name the endpoint that applies to the document type
  in hand — the reuse signal exists on those three and **not** on `consultaestado`.
- **TEC-01 §4.7** → the trackId consult at model level; **§10** → corrections/replacements once a
  document is known to DGII.
- **TEC-04 §5.2–5.3** → the publishable rule behind "persist before transmit": sign and store locally,
  transmit when available, verify the first documents before draining the queue, then check status.
  Idempotency keying itself is the SDK's design — attribute it to the resilience guide, not to DGII.

### 8. commercial approval

- **TEC-07 (Formato ACECF)** → `DetalleAprobacionComercial` (`Version`, `RNCEmisor`, `eNCF`,
  `FechaEmision`, `MontoTotal`, `RNCComprador`, **`Estado` 1 = e-CF Aceptado / 2 = e-CF Rechazado**,
  `DetalleMotivoRechazo`, `FechaHoraAprobacionComercial` in `dd-MM-AAAA HH:mm:ss`) + `Signature`.
  The tag is `Estado` — write `Estado`, not `EstadoAprobacion`.
- **XSD-15 (ACECF v.1.0)** → machine-verifiable authority for that tag and its domain:
  `<xs:element name="Estado" type="EstadoType" minOccurs="1" maxOccurs="1"/>` with
  `EstadoType` restricted to `1` (e-CF Aceptado) and `2` (e-CF Rechazado). Cite XSD-15 alongside
  TEC-07 for the enumeration.
- **TEC-02**, _Recepción de aprobación comercial_ → POST `/aprobacioncomercial/api/aprobacioncomercial`,
  multipart `xml`, response `{mensaje[], estado, codigo}` with **`codigo` `"1"` (approved) or `"2"`
  (not found / not processed)** and the two exact `estado` strings
  _"Aprobación comercial aprobada"_ / _"Aprobación comercial rechazada"_.
- **TEC-07 preamble** → DGII only receives approvals for e-CF **previously accepted by DGII**.
- **TEC-01 §4.4 and §10** → the service in context, and the rule that a **commercial rejection obliges
  the issuer to void via an E34 Nota de Crédito**.
- **LEG-03 (NG 01-2020)** → Art. 8 ¶I (_Aprobación y Rechazo_: the receiver states its conformity via
  the Aprobación/Rechazo Comercial **or** by reporting the purchase in the 606) and Art. 12
  (_Correcciones y Anulación_: corrections are made with credit/debit notes). The legal companion to the
  E34 rule.
- ⚠ **The AC filing deadline: no article number, no date.** `dgii-ground-truth.md` §9 cites "Decreto
  587-24 Art. 17 ¶V, Norma General 01-2020 Art. 14 ¶I". **NG 01-2020 Art. 14 is _Consultas_** — it
  starts on LEG-03 p. 9 (only its _Párrafo_ runs onto p. 10), it obliges DGII to offer an e-CF validity
  query and says nothing about deadlines. The nearest verified text is **NG 01-2020 Art. 8 ¶I**, which
  ties the AC to "la siguiente fecha de presentación del formato" (606) and names **no calendar date**;
  Decreto 587-24 Art. 17 ¶V cannot be read (LEG-02 is a scan). Publish "with the corresponding 606
  filing" and stop there. See judgement call 6.

### 9. range voiding

- **TEC-08 (Formato ANECF)** → `Encabezado` (`Version`, `RncEmisor`, `CantidadeNCFAnulados`,
  `FechaHoraAnulacioneNCF` in `dd-MM-AAAA HH:mm:ss`), `DetalleAnulacion` → 1..10 `Anulacion`
  (`NoLinea`, `TipoeCF`, `TablaRangoSecuenciasAnuladaseNCF` → a `Secuencias` element (1..10000), each
  `Secuencias` holding `SecuenciaeNCFDesde`/`SecuenciaeNCFHasta`, then `CantidadeNCFAnulados`),
  `Signature`.
- **TEC-08 preamble** → the admissibility rule: void only if the invoice was **not sent to DGII and not
  delivered to the receiver**; if it was, the only route is an E34 Nota de Crédito.
- **TEC-02**, _Anulación de e-NCF_ → POST `/anulacionrangos/api/operaciones/anularrango`, multipart
  `xml`, response `{rnc, codigo, nombre, mensajes}`.
- **XSD-10** → the machine-checked occurrence limits quoted above (`Anulacion` 1..10, `Secuencias`
  1..10000, and the `Secuencias` wrapper itself); contents in `ANECF v.1.0` are described in TEC-08.
- **TEC-01 §10** → corrections and voiding at model level, including the rule that the ANECF route only
  exists while the document has not been sent; **LEG-03 Art. 12** → the legal basis for
  correction-by-note.

### 10. directory / B2B

- **TEC-02**, _Consulta Directorio de Servicios_ → GET by RNC
  `/consultadirectorio/api/consultas/obtenerdirectorioporrnc?RNC=` and the general listing
  `/consultadirectorio/api/consultas/listado`; each item carries `nombre`, `rnc`, `urlRecepcion`,
  `urlAceptacion`, `urlOpcional` with DGII's definitions: reception host, approval host, and the optional
  authentication host, marked optional.
- **TEC-03**, _Estándar como Receptor Electrónico_ + _Creación de Servicios_ → the receiver must expose
  `/fe/autenticacion/api/semilla` (GET, optional), `/fe/autenticacion/api/validacioncertificado` (POST,
  optional), and the reception/approval services under the same naming standard; also the
  "SSL / traditional ports / case-insensitive / internet-reachable" receiver requirements.
- **TEC-02**, _Comunicación Emisor-Receptor_ → the same B2B endpoints as DGII publishes them, plus the
  token JSON returned by `/fe/autenticacion/api/validacioncertificado`.
- **TEC-09 (ARECF)** + **XSD-11** → the `<ARECF>` acknowledgement the receiver returns before (and
  independently of) the `<ACECF>`; TEC-09 states it implies neither acceptance nor rejection.
  **LEG-03 Art. 8 ¶I** → the legal duty to acknowledge receipt; **LEG-03 Art. 11(c)** → the duty to
  receive every validly issued e-CF from its suppliers. (Art. 9 only states that every issuer is also
  a receiver — it imposes no acknowledgement duty.)
- **TEC-01 §4.8 and §4.11** → directory consultation and issuer↔receiver communication at model level;
  **§5.2** → the OFV screen where an issuer maintains those three URLs.
- ⚠ **The B2B type exclusion is an SDK rule, not DGII text.** "B2B direct delivery does not apply to E32
  < RD$250k, E41, E43, E45, E46, E47" (§10, last line) is **not locatable in TEC-02, TEC-03, TEC-05 or
  TEC-01** — DGII's published documents state no type exclusion for the B2B flow. The restriction is
  implemented in the SDK: `B2B_EXCLUDED_TYPES` (`packages/typescript/src/reception.ts:151`, whose own
  doc comment repeats the false DGII attribution) and `checkB2BApplicability`
  (`packages/typescript/src/reception.ts:166`), enforced by the `enforceB2BRules` option
  (`packages/typescript/src/client.ts:134`, default `true`).
  **Truthful sentence: "the SDK refuses B2B delivery for these types (`enforceB2BRules`); DGII's
  published documents do not state a type exclusion."** Keep the reader-facing warning — someone who
  sends an E41 straight to a buyer will fail — but move the attribution from DGII to the SDK. Do **not**
  write "in practice, these types are not delivered B2B": that keeps a DGII voice on an SDK rule.

---

## F. Ground-truth § coverage — what the § column means

Each row of the tables above lists only the ground-truth sections its document actually carries a claim
for. This table proves it from the other direction: every `§` in `dgii-ground-truth.md`, the register
rows that back it, and the step that consumes it. Two claim areas have **no ground-truth section at
all** — they are marked, not hidden.

| GT § | Claim area                  | Backed by (row — the part that carries the claim)                                                                                                                                                                                                                                                                                                                                                                   | Consumed at step     |
| ---- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| §1   | Hosts and environments      | TEC-02 — per-service URL blocks (`ecf.dgii.gov.do`, `fc.dgii.gov.do`, `{ambiente}`) and the bitácora 18-05-2023 "Servicios no sensitivos a mayúsculas y minúsculas"; TEC-11 — status host; TEC-04 §5.1 — the `statusecf.dgii.gov.do` URL                                                                                                                                                                            | 1, 2, 5, 6           |
| §2   | Endpoints (literal)         | TEC-02 — one section per service; TEC-11 — the three `/api/EstatusServicios/*` paths                                                                                                                                                                                                                                                                                                                                | 1–10, 2              |
| §3   | Multipart field `xml`       | TEC-02 — `xml*` parameter + cURL blocks; TEC-03 — cURL examples post `xml=@…`                                                                                                                                                                                                                                                                                                                                       | 1, 5, 8, 9           |
| §4   | Authentication              | TEC-02 — semilla/validarsemilla, token JSON, 1-hour validity; XSD-12 — `SemillaModel`; TEC-01 §4.1                                                                                                                                                                                                                                                                                                                  | 1                    |
| §5   | Status codes                | TEC-02 — _Consulta de resultado_, _Consulta de estado_, _Consulta de Resumen (RFCE)_; TEC-01 §4.5–4.6; TEC-06 — `CodigoSeguridadeCF` derivation                                                                                                                                                                                                                                                                     | 6                    |
| §6   | Reception responses         | TEC-02 — recepción e-CF, recepción RFCE, aprobación comercial, anulación                                                                                                                                                                                                                                                                                                                                            | 5, 8, 9              |
| §7   | e-CF types and routing      | TEC-01 §6.1 + §9 — type catalogue and threshold; **TEC-01 §7 — 13-position e-NCF structure**; TEC-05 — `<TipoeCF>` 31–47; TEC-06 — RFCE rules; TEC-02 — threshold; LEG-07 — structure notice (31–45); XSD-01…09 — element models                                                                                                                                                                                    | 3, 5                 |
| §8   | XMLDSig requirements        | TEC-10 — algorithm URIs and by-example structure; TEC-03 — _Firmado de XML_; STD-01…04 — normative meaning of each URI; LEG-04, LEG-05, LEG-06, LEG-03 Art. 5 — certificate law; XSD-01…09 — the `Signature` slot only                                                                                                                                                                                              | 4                    |
| §9   | Approval and voiding        | TEC-07 + **XSD-15** — ACECF fields and `Estado` {1,2}; TEC-02 — aprobación comercial + anulación; TEC-08 + XSD-10 — ANECF and its occurrence limits; **TEC-01 §7 — e-NCF validity (31 Dec of the following year)** and §10 — corrections; LEG-03 Arts. 8, 12 — legal basis for approval and correction                                                                                                              | 8, 9                 |
| §10  | Directory / B2B             | TEC-02 — directorio + comunicación emisor-receptor; TEC-03 — receiver standard; TEC-09 + XSD-11 — ARECF; LEG-03 Art. 8 ¶I — duty to acknowledge receipt; Art. 11(c) — duty to receive                                                                                                                                                                                                                               | 10                   |
| —    | **Contingency (no GT §)**   | **TEC-04 §5–6** — availability, 72 h / 15 días hábiles / 15 días calendario, and its own quotation of Ley 32-23 Art. 21, NG 01-2020 Arts. 3(i)/10, Decreto 587-24 Arts. 40–43; **TEC-01 §19** — the same regime at model level, both clocks, and the `NCFModificado`/`CodigoModificacion` = 4 replacement path; LEG-02 — the same articles, quotable only _through_ TEC-04; OPS-04 — the manual TEC-04 §6 points to | 2, 7                 |
| —    | **Certification (no GT §)** | OPS-01, OPS-02 — the two certification paths; OPS-03 — NG 10-2021 for PSEs                                                                                                                                                                                                                                                                                                                                          | outside the 10 steps |

Reading the table:

- `§1` is backed by **TEC-02 / TEC-11 / TEC-04 §5.1**, not by a statute. Neither LEG-01 nor LEG-02 is in
  that cell any more.
- `§7` is backed by **TEC-01 §6.1 and TEC-01 §7** in addition to TEC-05 — "the only published list" was
  false, and the e-NCF structure/validity rules have a locatable, extractable source. XSD-13 and XSD-14
  are **not** in that cell: neither compiles, so neither can back a claim.
- `§9` now has a **machine-verifiable** schema authority for the ACECF `Estado` tag (XSD-15) and a
  locatable validity rule (TEC-01 §7). It does **not** have a verifiable article for the AC filing
  deadline — see judgement call 6 — and it has **no legal-instrument row**: LEG-01 and LEG-02 are
  scans, so their § cells are blank.
- **Contingency and certification are ground-truth gaps, not register gaps.** They are documented (TEC-04
  §5–6, TEC-01 §19, OPS-*) and verified, but `dgii-ground-truth.md` has no section for them, so a writer
  citing them cannot point at a `§`. Scope those citations to the document section, and do not invent a
  `§` number.
- **Every `§` above is provable from a mapping line** in steps 1–10, and every row whose § cell is blank
  says why: the two scans (LEG-01, LEG-02), the two schemas that do not compile (XSD-13, XSD-14), and
  the six `OPS-*` manuals.

---

## Verified count

**43 URLs verified `200` on 2026-11-09**, in four groups:

- **32 documents that carry at least one verified normative claim** — 5 legal/normative
  (`LEG-03`…`LEG-07`), 10 technical and service-level specifications (`TEC-01`…`TEC-10`), 13 schemas
  (`XSD`, of which **12 compile** upstream and are the SDK's pinned fixtures, while `XSD-15` does not
  compile but is cited for its readable `EstadoType` domain), and 4 XML/XMLDSig standards (`STD`).
- **4 rows carried for identity or traceability only, with no verified normative claim** — `LEG-01`
  and `LEG-02` (scans, **0** extractable characters: identity verified from the file, the page count
  and DGII's own avisos) and `XSD-13` / `XSD-14` (do not compile upstream). Their § cell is `—` and
  says why.
- **1 machine-readable service specification** — `TEC-11`, the OpenAPI document. Counted separately
  because it is a service contract, not a normative text.
- **6 operational/certification manuals** — `OPS-*`, which support no claim in `dgii-ground-truth.md`.

The internal audit that produced `project-docs/dgii-ground-truth.md` cites **34 sources** in its
notebook. That notebook and its 34 entries are not in this repository, so the audit's list cannot be
enumerated and **34 and 43 are not comparable numbers**: this register publishes the list and the
URLs so that anyone can re-measure them, and states what each row adds. It is not a correction of the
audit and not an overshoot of it. Nothing was added to reach 34 and nothing was padded to match it.
The honest comparison unit is the row, not the total: 37 rows under A–D (32 claim-bearing documents +
4 identity/traceability rows + 1 service spec) plus 6 operational rows, and 43 `200`s.

---

## Received judgement calls

1. **Status-service endpoint paths live only in TEC-11; the service itself does not.** The literal
   `/api/estatusservicios/…` paths that `dgii-ground-truth.md` §2 lists appear in **no PDF** — they exist
   only in the FE Estatus Servicios API spec (TEC-11). But the service is documented: **TEC-01 §4.9
   _Web Service – Consulta Estatus Servicios_** describes it as providing status, availability and
   maintenance windows, and defers structure to the technical description; **TEC-04 §5.1** names and
   mandates the portal. The register maps pre-flight to TEC-11 (paths) + TEC-01 §4.9 (service) +
   TEC-04 §5.1 (mandate) — not to TEC-02, which indeed does not carry it.
2. **`Ambiente` labels 1/2/3 are unlabelled in TEC-11.** The spec enumerates only integers. Chose to
   publish the enum as "ambiente code" and record the SDK's PreCert/Prod/Cert interpretation as an
   interpretation, not as DGII's.
3. **Two technical descriptions, not one.** **TEC-03's own bitácora _Actualizaciones al 02-01-2026_,
   item 2, records the split** ("Se segrega en dos documentos la Descripción Técnica de Facturación
   Electrónica: a. Servicios DGII, b. Servicios Emisores Electrónicos") — quote that date from TEC-03
   itself, not only TEC-02. Chose both current files and deliberately cite neither the pre-split combined
   PDF nor the third-party copies of it that dominate search results.
4. **`Formato e-CF V1.0` is a moving target with a frozen version string.** DGII republishes it without
   bumping v1.0 (the file itself carries "Actualizaciones al 30-08-2022" plus a 2025 cover). Chose the
   currently served file and recorded the site publication date (2025-10-30) beside the version, so a
   future divergence is detectable. Same pattern for TEC-08 (`v1.0`, rev. 2022-05-24) and TEC-09.
5. **Types 46/47 vs Aviso 24-19.** LEG-07 is the e-NCF structure notice but stops at type 45. Chose to
   cite **TEC-01 §7 for the structure and validity, TEC-05 and TEC-01 §6.1 for the full 31–47 code
   list, and LEG-07 only as the structure notice** — rather than cite LEG-07 for something it does not
   say, or call TEC-05 unique when TEC-01 §6.1 prints the same table.
6. **The AC filing deadline: the ground-truth citation is wrong, and the date must not be published.**
   `dgii-ground-truth.md` §9 attributes a deadline ("aligned with Formato 606, due by the 15th of the
   following month") to **Decreto 587-24 Art. 17 ¶V** and **Norma General 01-2020 Art. 14 ¶I**.
   Verified by extraction: **NG 01-2020 Art. 14 is _Consultas_** (LEG-03, p. 9; its _Párrafo_ runs onto
   p. 10) — DGII must offer an e-CF validity query; it says nothing about approval deadlines. So the
   citation is not merely unverified, it is **wrong**, and the register records it as a correction
   ([Findings](#findings-for-separate-issues-recorded-not-fixed-here) #2). The nearest verified text is
   **NG 01-2020 Art. 8 ¶I**: the electronic receiver must acknowledge receipt and then give its
   conformity "mediante la Aprobación o Rechazo Comercial **o** mediante su remisión en el Formato de
   Envío de Costos y Gastos (606) **en la siguiente fecha de presentación del formato**" — it ties the
   AC to the 606 filing and names **no calendar date**. Decreto 587-24 Art. 17 ¶V cannot be read on this
   machine (LEG-02 is a scan: 29 pages, **0** extractable characters). The specific "15th of the following
   month" date belongs to NG 07-2018, which is not a row here (adding it would change the frozen row
   set). **Ruling: print neither the article number nor the date.** Say "with the corresponding 606
   filing" and stop.
7. **`CodigoSeguridadeCF` algorithm.** TEC-06 says "the first 6 characters of the hash of the digital
   signature"; TEC-02 says "los primeros seis (6) dígitos del hash generado en el SignatureValue" — the
   **algorithm is never named**. SHA-256 is an inference from the signature profile. Chose to publish the
   derivation as "first 6 characters of the SHA-256 digest of the signature value (DGII names only
   'hash')" and to keep the parenthetical, so the inference is visible.
8. **Norma General 06-2018 considered and omitted.** It is on DGII's own Marco Legal list and governs
   paper NCF, but no statement in `dgii-ground-truth.md` depends on it. Including it would pad the count,
   so it is absent (verified 200 at `.../NG%20sobre%20Comprobantes%20Fiscales/Norma06-18.pdf` if a later
   issue needs it).
9. **Representación Impresa (modelos ilustrativos) and the Facturador Gratuito manual considered and
   omitted.** Both are published and verified, but the RI is a rendering artefact and the free-invoicer
   manual addresses a different population; neither governs an integration step. They belong to a
   user-facing page, not to this register.
10. **B2B exclusion list: keep the warning, move the attribution.** The E32<250k / E41 / E43 / E45 / E46
    / E47 exclusion is the one substantive claim in `docs/**` with no DGII source. Re-checked: no type
    exclusion is published in TEC-02, TEC-03, TEC-05 or TEC-01. The restriction is the SDK's —
    `B2B_EXCLUDED_TYPES` (`reception.ts:151`) checked by `checkB2BApplicability` (`reception.ts:166`),
    enforced by `enforceB2BRules` (`client.ts:134`, default `true`). Keep the reader-facing warning and
    attribute it to the SDK. Do not soften it into "in practice" DGII language.
11. **W3C statuses recorded as 200, not 403.** `www.w3.org` rejects the browser UA that `dgii.gov.do`
    requires on this network. Verified the four STD rows with a plain curl UA; recorded the UA divergence
    in the [verification recipe](#verification-recipe-reproduce-it-before-trusting-a-row) so the next
    auditor does not raise a false alarm.

---

## Findings for separate issues (recorded, not fixed here)

These are out of this task's scope — no docs edit, no code change, no change to
`project-docs/dgii-ground-truth.md`. Each is filed here so the finding is not lost.

1. **`canReuseSequence` returns `false` for every documented response — SDK defect.**
   `reconcileSubmission` (`packages/typescript/src/client.ts:373`, inquiry at `:390`, call at `:403`)
   obtains `inquiry = await this.inquiryStatus(rnc, encf)` — i.e. `consultaestado` — and passes it to
   `canReuseSequence` (`packages/typescript/src/reconciliation.ts:29`), whose test is
   `secuenciaUtilizada === false`. TEC-02 publishes no such element on `consultaestado` (pp. 27–28), so
   the field is `undefined` in every documented response and the helper answers `false` ("not
   reusable"); it could only answer `true` if DGII returned a field it does not document, and the
   response is an unchecked cast (`packages/typescript/src/http.ts:222`, `ok(data as T)`), so nothing
   in the code would catch that. The same defect is in the Python twin —
   `packages/python/src/py_dgii_ecf/reconciliation.py:30`, called from
   `packages/python/src/py_dgii_ecf/client.py:520` — which parity requires fixing at the same time. The
   flag DGII _does_ publish is modelled correctly on the track response
   (`TrackingStatusResponse.secuenciaUtilizada`, `packages/typescript/src/types.ts:32`) and read
   correctly by `statusTrackId`. File as a code issue; `docs/en/guides/resilience.md`'s paragraph
   points the reader at the consult that does not carry the flag. **The guides are not wrong to say the
   flag decides reuse — the SDK reads it from the wrong service.**
2. **`dgii-ground-truth.md` §9 mis-cites NG 01-2020 Art. 14 ¶I** for the AC filing deadline. Art. 14 is
   _Consultas_ (LEG-03 p. 9; its _Párrafo_ runs onto p. 10). Correction to make in a separate issue; do
   not propagate the article number into the docs.
3. **`dgii-ground-truth.md` §10's B2B exclusion list has no DGII text**, and the same false attribution
   is written into the code in four places: `packages/typescript/src/client.ts:67` (the option's doc
   comment describes `enforceB2BRules` as rejecting "the e-CF types DGII excludes"),
   `packages/typescript/src/reception.ts:150` (_"Type codes DGII excludes from the direct
   Emisor↔Receptor flow"_), `packages/typescript/src/reception.ts:162–165` ("DGII excludes E32 below
   RD$250,000 … plus E41, E43, E45, E46 and E47"), and the Python twin at
   `packages/python/src/py_dgii_ecf/reception.py:124` and `:133`. Correct all of them when the code
   issue is filed.
4. **`dgii-ground-truth.md` §8's "`<KeyValue>` must NOT be emitted" is stronger than its source.**
   TEC-10 says "los tag KeyValue, RSAKeyValue, Exponent **no son necesarios**"; TEC-03 does not mention
   them. Omitting them is right for interoperability, but it is an SDK rule, not a DGII prohibition.
5. **`dgii-ground-truth.md` has no contingency section.** TEC-04 §5–6, TEC-01 §19 and OPS-04 are the
   verified sources; a future ground-truth revision should add that section rather than leave the
   register's § column permanently unable to name it.
6. **Ledger bookkeeping.** `project-tasks/124-dgii-official-sources-ledger.md` recorded **T1 attempt 1 =
   PASS** and **T2 attempt 1 = PASS**; both validators returned **FAIL**. The two rows are corrected to
   FAIL in this revision, pointing at
   `project-tasks/124-evidence/t1-refuter-register.md` and
   `project-tasks/124-evidence/t2-evidence-collector-links.md`.

---

## Residual risk for the writer

- **Highest risk: the B2B exclusion list.** It is in the published guides today and no DGII document
  states it. Keep the warning, attribute it to the SDK (`enforceB2BRules`), never to DGII. See step 10
  and judgement call 10.
- **Withdrawn:** `secuenciaUtilizada` is **not** a risk. It is documented on `consultaresultado`
  (TEC-02 p. 24 + bitácora 18-04-2022) and the guide sentence that reads it from `statusTrackId` is
  correct. Do not soften it. The defect is in the SDK's reconcile path, not in the docs (Finding 1).
- **Second: article-level legal citations.** Do not print an article number for the AC deadline or a
  calendar date for it (judgement call 6 — the ground-truth citation is wrong). For contingency, the only
  verifiable article numbers are the ones **TEC-04 and TEC-01 §19 quote themselves**: Ley 32-23
  Art. 21, NG 01-2020 Arts. 3(i) and 10, Decreto 587-24 Arts. 40–43.
- **Third: `dgii-ground-truth.md` has no contingency section**, so a contingency citation cannot name a
  `§`. Scope it to TEC-04 §5–6 and TEC-01 §19 (and OPS-04 as the operational manual). Do not invent a
  section number, and do not let a shared block template imply one exists.
- **Fourth: DGII republishes in place.** Any row can change content without changing URL or version. The
  register's status column is a snapshot; `MANIFEST.json` sha256 is the only content guard, and only for
  the 12 pinned schemas — the 3 `excluded` entries carry no hash, so their silent republish is not
  hash-detected.
- **Fifth: two rows are unreadable by machine.** LEG-01 and LEG-02 are scans. Never quote their article
  text on the site, and never cite them for a ground-truth section; quote TEC-04's and TEC-01 §19's
  quotation of Decreto 587-24 instead, which is extractable and verified.
