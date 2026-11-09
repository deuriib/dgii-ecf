# T1 (Refuter) — `project-tasks/124-source-register.md`, attempt 3 of 3

**Verdict: QA PASS — safe to publish from.**

Attempt 3 resolves every blocking item from attempt 1 (R1–R4), every medium finding (M1–M6), all nine
nits, and all eighteen new defects from attempt 2 (N-1…N-18). I re-derived the four facts that changed
twice — TEC-03's QR/URL character set, NG 01-2020's acknowledgement article, TEC-01 §7's e-NCF
structure/validity and the `consultaresultado` response block — plus six more, all from the PDFs
themselves, and I re-ran the whole-document stale-string sweep in both directions. **No stale copy of
any corrected fact survives anywhere in the file.**

Four residual inconsistencies remain. All four are **cosmetic** (they are described as L-1…L-4 in §6):
none of them can make a writer invent a source or over-claim what a source says, because in each case
the mapping line next to the stale phrase is correct and the wrong reading is not producible from the
register as written. I name them explicitly so this PASS is not read as "nothing left to say".

The one thing a reader must not misread: this PASS is **not** a statement that the register was right
all along. Attempt 3 changed real, checkable content — the count sentence, LEG-01/LEG-02's § cells,
LEG-07's § cell, the 28-character QR table, `Art. 8 ¶I` and TEC-01 §19 — and each of those is now
verified true against the document it cites, not merely plausible.

---

## 1. Re-verification base (done from scratch on this machine)

Everything below was fetched and extracted fresh. The register's `§Verification recipe` is the recipe
used here and it works verbatim.

| Document                                           | HTTP | Pages | Extracted                 |
| -------------------------------------------------- | ---- | ----- | ------------------------- |
| TEC-01 `Informe Técnico e-CF v1.0`                 | 200  | 53    | 79 734 non-ws chars       |
| TEC-02 `Descripcion Tecnica Servicios DGII`        | 200  | 47    | 52 299                    |
| TEC-03 `Descripcion Tecnica Emisores Electronicos` | 200  | 13    | 12 045                    |
| TEC-04 `Estandares de Comportamiento Esperado…`    | 200  | 13    | ok                        |
| TEC-07 `Formato Aprobación Comercial v1.0`         | 200  | 6     | ok                        |
| TEC-10 `Firmado de e-CF`                           | 200  | 20    | ok                        |
| LEG-03 `Norma01-20.pdf` (NG 01-2020)               | 200  | 10    | 29 498                    |
| LEG-04 `Norma05-19.pdf` (NG 05-2019)               | 200  | 9     | ok                        |
| LEG-07 `24-19.pdf` (Aviso 24-19)                   | 200  | 1     | full text                 |
| LEG-01 Ley 32-23                                   | 200  | 33    | **0** non-ws chars (scan) |
| LEG-02 Decreto 587-24                              | 200  | 29    | **0** non-ws chars (scan) |
| TEC-11 `definition.json`                           | 200  | —     | `openapi 3.0.1`           |

```bash
cd project-tasks/124-evidence/.pdfcache
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
uv run --with pypdf python -c "from pypdf import PdfReader; r=PdfReader('tec03.pdf'); print(r.pages[5].extract_text())"
```

Also read directly: `examples/fixtures/schemas/{MANIFEST.json,anecf.xsd,upstream-invalid/ACECF v.1.0.xsd}`,
the TS sources (`client.ts`, `reception.ts`, `reconciliation.ts`, `http.ts`, `types.ts`), the Python
sources (`reception.py`, `reconciliation.py`, `client.py`), and
`project-tasks/124-dgii-official-sources-ledger.md`.

Re-measured live, all consistent with the register's recipe:

- `dgii.gov.do` → browser UA `200`; the entry point
  `…/Paginas/documentacionSobree-CF.aspx` → **200** (18 distinct `.pdf` links + 15 `.xsd` links on the
  page — the register's "18 PDF links + all 15 XSDs" is exact); the old hyphenated
  `…/Paginas/documentacionSobre-e-CF.aspx` → **404**.
- `www.w3.org/TR/{xmldsig-core1,xml-c14n-20010315,xmlenc-core1}` → **403** browser UA, **200** plain
  curl UA (UA divergence reproduced).
- `statusecf.dgii.gov.do/api-docs/v1/definition.json` → `200` for curl, python-requests, no UA and
  browser UA.
- `www.rfc-editor.org/rfc/rfc6931` → `200`, redirects to `/info/rfc6931/`.

---

## 2. Status of every prior finding

Line numbers are into the **current** register (760 lines). "Own check" = I re-derived it this pass;
"carried" = attempt 2's derivation, which I spot-confirmed but did not re-extract end to end (named
where that matters).

### 2.1 Blocking refutations (attempt 1)

| #      | Finding (verbatim short form)                                           | Status       | Current proof                                                                                                                                                                                                                                                                                                                                 | Own check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------ | ----------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1** | Step 6 ⚠ inverted: `secuenciaUtilizada` **is** on `consultaresultado`   | **RESOLVED** | 434–447: heading "**`secuenciaUtilizada` — the track step is correctly sourced; do not soften it**"; 436–441 the p. 23 JSON / p. 24 XML / pp. 24–25 semantics; 442–444 bitácora 18-04-2022 item 1 quoted; 445–447 "Cite TEC-02 p. 24. Leave the wording alone." No `⚠` remains in step 6. Residual risk 745–747 "**Withdrawn:** … not a risk" | **First-hand**: TEC-02 p. 23 JSON has `"secuenciaUtilizada": true`; p. 24 XML `<RespuestaConsultaTrackId> … <secuenciaUtilizada>true</secuenciaUtilizada>`; pp. 24–25 list all **eight** rejection reasons the register collapses into six clauses; p. 25 "True = No puede reutilizarse la secuencia / False = Puede reutilizarse". `RespuestaConsultaEstado` (pp. 27–28) has exactly the eleven elements at 451–453 and no flag. No stale copy of the inverted claim anywhere (`rg 'never of .consultaresultado'` → 0) |
| **R2** | `Ground-truth §` column attributes sections the documents do not govern | **RESOLVED** | Every one of the 43 rows is now backed; see §5 below. LEG-01 85 `—`, LEG-02 86 `—`, LEG-03 87 `§8, §9, §10`, LEG-04 88 `§8`, LEG-07 91 `§7`, TEC-04 133 `§1 (status host only, §5.1)`, TEC-05 134 `§7`, XSD-13/14 188/189 `—`, OPS-01…06 230–235 `—`                                                                                          | **First-hand** row-by-row against the F table (§5). No `§` cell asserts a section that no mapping line names. Old strings `§1, §7, §9`, `§4, §9, §10`, `§1, §2, §5, §9`, `§7, §8, §10` → **0 occurrences**                                                                                                                                                                                                                                                                                                              |
| **R3** | "the only published list that includes 46 and 47" was false             | **RESOLVED** | 330–332 "TEC-05 `<TipoeCF>` and TEC-01 §6.1 **both** list the full catalogue … Do not call either 'the only published list'"; 333–335 LEG-07 demoted to "structure notice … types 31–45 only"; 336–344 TEC-01 §7 added for structure **and** validity                                                                                         | **First-hand**: TEC-01 §6.1 (p. 13) prints 31/32/33/34/41/43/44/45/46/47; TEC-01 §7 (p. 15) "estructura de trece (13) posiciones alfanuméricas" and "vigente desde la fecha de autorización hasta el 31 de diciembre del año siguiente y no podrá ser usada posterior a su vencimiento" — the register quotes both exactly                                                                                                                                                                                              |
| **R4** | TEC-03's escape rule understated as five characters                     | **RESOLVED** | 359–363: **eight** characters, each with named + decimal + hex form, and "Do **not** write 'five characters' — that understates a DGII requirement."                                                                                                                                                                                          | **First-hand**: TEC-03 pp. 4–5 table is `"` `'` `<` `>` `&` `©` `€` `®` with `&quot;/&#34;/&#x22;` … `&reg;/&#174;/&#xAE;`, order and values character-for-character as printed at 359–362                                                                                                                                                                                                                                                                                                                              |

### 2.2 Medium refutations (attempt 1)

| #                                                   | Status       | Current proof                                                                                                                                                        | Own check                                                                                                                                                                                                                                                            |
| --------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M1** — status service overstated as absent        | **RESOLVED** | JC 1 (630–636) rewritten: paths in TEC-11 only, service in TEC-01 §4.9, mandate in TEC-04 §5.1; step 2 277–288 maps all three                                        | **First-hand**: TEC-04 §5.1 exists as cited and names the portal; TEC-11 carries the three literal paths (below)                                                                                                                                                     |
| **M2** — multipart `xml` "only inside TEC-02"       | **RESOLVED** | 151–154 (B-note), step 1 260–262, "Normative but not publicly reachable" row 240, step 5 397–398                                                                     | **First-hand**: TEC-03 posts `-f 'xml=@archivosemillafirmado.xml;type=text/xml'` (p. 9), `-F 'xml=@101672919e3100000001.xml…'` (p. 10), `-F 'xml=@101672919E3100000001.xml…'` (p. 12) — "plus two more" is exact                                                     |
| **M3** — B2B remedy mis-attributed to DGII          | **RESOLVED** | Step 10 ⚠ 544–556 (required sentence verbatim at 552–555), JC 10 681–686, residual risk #1 742–744, Finding 3 718–725                                                | **First-hand** in code: `B2B_EXCLUDED_TYPES` = 41/43/45/46/47 at `reception.ts:151`; `checkB2BApplicability` at `:166`; `this.enforceB2BRules = options.enforceB2BRules ?? true` at `client.ts:134`                                                                  |
| **M4** — JC 6 withheld the article but not the date | **RESOLVED** | JC 6 653–670: calls the citation **wrong**, records it as a correction, "**print neither the article number nor the date**"; step 8 ⚠ 499–506; residual risk 748–751 | **First-hand**: LEG-03 p. 9 `Artículo 14. Consultas` (no deadline), `Artículo 8 … Párrafo I` on p. 8 with "en la siguiente fecha de presentación del formato" and no calendar date; LEG-02 = 0 extractable chars                                                     |
| **M5** — 34-vs-37 guess presented as reconciliation | **RESOLVED** | 618–624: the causal story is gone; "34 and 43 are **not comparable numbers** … publishes the list … not a correction … nothing was padded"                           | Arithmetic re-done in §5                                                                                                                                                                                                                                             |
| **M6** — `consultarfce` missing                     | **RESOLVED** | Step 6 452–458 names endpoint, pp. 19–21 and the 12-06-2023 bitácora; step 7 464–466 uses it                                                                         | **First-hand**: TEC-02 pp. 19–21 `fc.dgii.gov.do/{ambiente}/consultarfce/api/Consultas/Consulta?RNC_Emisor=&ENCF=&Cod_Seguridad_eCF=`; p. 21 JSON carries `secuenciaUtilizada`; bitácora 12-06-2023 item 1 = "un nuevo servicio de consulta de Resúmenes de factura" |

### 2.3 The nine nits from attempt 1

| Nit                                      | Status       | Proof                                                                                                                                                                                                                           |
| ---------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1 ANECF drops the `Secuencias` wrapper  | **RESOLVED** | XSD-10 row 187; C-note 202–205; step 9 515–517. Re-read `anecf.xsd:19–32`: `TablaRangoSecuenciasAnuladaseNCF` → `Secuencias` (1..10000) → `SecuenciaeNCFDesde`/`Hasta` ✓                                                        |
| N2 cite XSD-15 for ACECF `Estado`        | **RESOLVED** | Step 8 492–495; C-note 206. `upstream-invalid/ACECF v.1.0.xsd:15` `<xs:element name="Estado" type="EstadoType" minOccurs="1" maxOccurs="1"/>`; `EstadoType` = `xs:integer` enum `{1}` _e-CF Aceptado_, `{2}` _e-CF Rechazado_ ✓ |
| N3 TEC-04's two 15-day rules             | **RESOLVED** | Step 2 289–301 splits 72 h / 15 días hábiles (§5.2) / 15 días calendario (§6.2)                                                                                                                                                 |
| N4 warn off the 11-char e-NCF examples   | **RESOLVED** | 405–410 names TEC-02 p. 12/p. 16 **and** TEC-03 p. 10/p. 12 — all four verified                                                                                                                                                 |
| N5 `<KeyValue>` has no DGII prohibition  | **RESOLVED** | Step 4 ⚠ 381–389; Finding 4 726–729. TEC-10 p. 18 (printed 17) PHP comment: "los tag KeyValue, RSAKeyValue, Exponent no son necesarios" ✓                                                                                       |
| N6 manifest bookkeeping (12 + 3, not 15) | **RESOLVED** | 168–175. `MANIFEST.json`: `schemas` 12, `excluded` 3 (e-CF 31 → unresolved `IndicadorServicioTodoIncluidoType`; RFCE 32 → invalid `[$0-9]` + `\-`; ACECF → invalid `\-`) ✓                                                      |
| N7 ledger said T1/T2 attempt 1 = PASS    | **RESOLVED** | Finding 6 732–736; ledger lines 91–92 now both read **FAIL** with evidence pointers ✓                                                                                                                                           |
| N8 state the 15-XSD framing in the count | **RESOLVED** | 606–612 (12 compile, XSD-13/14 out of the claim-bearing set, XSD-15 in)                                                                                                                                                         |
| N9 label TEC-11 as a spec, not a norm    | **RESOLVED** | B-note 144–150; its own count group at 614–615                                                                                                                                                                                  |

### 2.4 Attempt-2 defects N-1…N-18

| #        | Defect                                                                         | Status                                 | Current proof + own check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------- | ------------------------------------------------------------------------------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **N-1**  | QR/URL table undercounted 24 instead of 28                                     | **RESOLVED**                           | 364–368: "a **separate** set of **28** QR/URL reserved characters … (`%20`…`%60`). The table spans TEC-03 pp. 5–6 — four of its rows open p. 6". **Re-counted from the PDF: p. 5 carries 24 rows (Espacio `%20` … Mayor `%3E`), p. 6 carries 4 (Barra inversa `%5C`, `^` `%5E`, `_` `%5F`, Tilde grave `` ` `` `%60`) = 28, min `%20`, max `%60`.** The register's 28-character list matches the PDF row-for-row _and in the PDF's order_, including `"` between `]` and `-`                                                                                          |
| **N-2**  | `Aviso 24-19` credited with a validity rule it lacks                           | **RESOLVED**                           | LEG-07 91 § cell = `§7` (only); F §9 row 576 no longer lists LEG-07; note 117–123 says "it states **no e-NCF validity rule**". **First-hand**: LEG-07 (1 page) = 13-character structure sentence + type table 31–45 + authorisation sentence, nothing about validity                                                                                                                                                                                                                                                                                                  |
| **N-3**  | `Art. 9 ¶I` where the text is `Art. 8 ¶I`                                      | **RESOLVED**                           | `rg 'Art\. 9 ¶I'` → **0**. Acknowledgement is `Art. 8 ¶I` at **115, 496–497, 503, 540, 577, 660**; `Art. 9` appears only as receiver status (113–116, 541–542) with the explicit correction "Art. 9 is a single unnumbered paragraph and imposes no acknowledgement duty". **First-hand**: LEG-03 p. 8 `Artículo 8 … Párrafo I` = "El receptor electrónico deberá acusar de recibo del e-CF …"; p. 9 `Artículo 9. Del Receptor Electrónico` = one unnumbered paragraph; p. 9 `Art. 11(c)` "Recibir todos los e-CF de sus proveedores que sean emitidos válidamente" ✓ |
| **N-4**  | TEC-05 `§8, §10` unbacked                                                      | **RESOLVED**                           | 134 = `§7` only; step 3 330 is the only TEC-05 mapping line                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **N-5**  | LEG-04 `§7` unbacked                                                           | **RESOLVED**                           | 88 = `§8`; step 4 375 cites NG 05-2019 **Art. 11**. **First-hand**: NG 05-2019 p. 8 `Artículo 11` + `Párrafo I` "deberá estar firmado con un certificado digital de persona física" ✓                                                                                                                                                                                                                                                                                                                                                                                 |
| **N-6**  | LEG-03 § cell omitted `§8`                                                     | **RESOLVED**                           | 87 = `§8, §9, §10`; step 4 377–378 cites Art. 5 (p. 7) ✓                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **N-7**  | TEC-04 contradicted itself on `§1`                                             | **RESOLVED**                           | Row 133 `§1 (status host only, §5.1)`; F §1 row 566 lists "TEC-04 §5.1 — the `statusecf.dgii.gov.do` URL" → the two now agree. **First-hand**: TEC-04 §5.1 (p. 10) names `statusecf.dgii.gov.do/help/index.html`                                                                                                                                                                                                                                                                                                                                                      |
| **N-8**  | Count qualifier false for LEG-02; LEG-01/02 asymmetric; "28 extractable chars" | **RESOLVED**                           | 606–612: `32 … at least one verified normative claim` = LEG-03…07 + TEC-01…10 + 13 XSD + 4 STD; 610–612 moves LEG-01/LEG-02/XSD-13/XSD-14 out into "4 rows … no verified normative claim"; both scans now say "**0** extractable characters" (68, 95, 611, 664, 758). **First-hand**: both files extract **0** non-whitespace chars (`leg01.pdf` 33 pp, `leg02.pdf` 29 pp). `rg '28 extractable'` → 0                                                                                                                                                                 |
| **N-9**  | Incomplete code locations                                                      | **RESOLVED**                           | Finding 1 adds `reconciliation.py:30` + `client.py:520` (708–709); Finding 3 adds `reception.ts:150`, `:162–165`, and `reception.py:124`/`:133` (721–724). **Verified line by line**: `reception.py:124` = `#: Type codes DGII excludes…`, `:133` = "DGII excludes E32 below RD$250,000…", `reconciliation.py:30` = `def can_reuse_sequence`, `client.py:520` = `can_reuse_sequence=can_reuse_sequence(value)`; `client.ts:67` doc comment, `client.ts:373/390/403`, `reconciliation.ts:29`, `http.ts:222` `return ok(data as T)`, `types.ts:32` all correct          |
| **N-10** | Strongest contingency source (TEC-01 §19) missing                              | **RESOLVED**                           | Step 2 307–314; F contingency row 578; residual risk 752–754; TEC-01's description cell 130 mentions "contingency operation §19". **First-hand**: TEC-01 §19 (printed 46–47) states "los artículos 40 al 43 del Reglamento … Decreto núm. 587-24", "un plazo no mayor de setenta y dos (72) horas", "no podrá exceder de quince (15) días calendario", and the `NCFModificado`/`FechaNCFModificado`/`CodigoModificacion` = 4 replacement path — all four quotes in 307–314 are exact                                                                                  |
| **N-11** | Authorisation attributed to TEC-04 §5.1                                        | **RESOLVED**                           | 285–287 `§5.1 → first check; §7 (Canales de Verificación y Referencias) → prior authorisation`. **First-hand**: TEC-04 §7 (p. 12) "Para su utilización, se requiere gestionar previamente la autorización de acceso correspondiente" ✓                                                                                                                                                                                                                                                                                                                                |
| **N-12** | 404 entry-point link                                                           | **RESOLVED**                           | Line 30 now `…/Paginas/documentacionSobree-CF.aspx` → **200** (re-tested; hyphenated form still **404**; the host is case-insensitive, both `Sobree`/`SobreE` answer 200). Page really does link 18 PDFs + 15 XSDs                                                                                                                                                                                                                                                                                                                                                    |
| **N-13** | `LEG-03 p. 10` for Art. 14                                                     | **RESOLVED**                           | 501–502, 612–613, 656: "starts on LEG-03 p. 9 (only its _Párrafo_ runs onto p. 10)". **First-hand**: `Artículo 14. Consultas` is on p. 9; its Párrafo ("Las Facturas de Consumo Electrónicas …") is on p. 10 ✓                                                                                                                                                                                                                                                                                                                                                        |
| **N-14** | TEC-03's own 11-char e-NCF typo unwarned                                       | **RESOLVED**                           | 405–410 warns TEC-03 pp. 10 and 12 with the exact two strings. **First-hand**: p. 10 `101672919e3100000001.xml`, p. 12 `101672919E3100000001.xml`; p. 4's table example `101672919E310000000001.xml` is 13 ✓                                                                                                                                                                                                                                                                                                                                                          |
| **N-15** | "can never return `true`" stated as code certainty                             | **RESOLVED**                           | 454–457: "returns `false` for every **documented** `consultaestado` response — it could only answer `true` if DGII returned a field it does not document, and the response is a cast (`ok(data as T)`)" ✓ (`reconciliation.ts:31` is `=== false`; `types.ts:51` is optional)                                                                                                                                                                                                                                                                                          |
| **N-16** | `reception.ts:151` cited for two symbols                                       | **RESOLVED**                           | 547–549 cites `reception.ts:151` (`B2B_EXCLUDED_TYPES`) and `reception.ts:166` (`checkB2BApplicability`) separately ✓                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **N-17** | "same reuse semantics" for `consultarfce`                                      | **RESOLVED**                           | 448–450: "carries the same field name; the flag's semantics are documented for `consultaresultado`, pp. 24–25 — `consultarfce`'s own parameter description does not define it" ✓ (verified: p. 21 describes Código/Estado/RncEmisor/NcfElectronico/codigoSeguridad only)                                                                                                                                                                                                                                                                                              |
| **N-18** | `—` cell naming a `§`; unbacked step cells                                     | **RESOLVED (with one thin spot, L-2)** | OPS-06 235 no longer names a `§`; LEG-01's steps are now `routing, submit` (cited at step 3 346–347 and step 5 412–413). LEG-02's `pre-flight` is only "cited" in step 2 negatively (305) — cosmetic, see L-2                                                                                                                                                                                                                                                                                                                                                         |

**Score: R1–R4 resolved · M1–M6 resolved · nits 9/9 resolved · N-1…N-18 resolved (N-18 cosmetically
partial).**

---

## 3. My own extraction evidence (the four facts that changed twice, plus six more)

1. **TEC-03 QR/URL set (N-1).** p. 5: `Espacio %20`, `! %21`, `# %23`, `$ %24`, `& %26`, `' %27`,
   `( %28`, `) %29`, `* %2A`, `+ %2B`, `, %2C`, `/ %2F`, `: %3A`, `; %3B`, `= %3D`, `? %3F`, `@ %40`,
   `[ %5B`, `] %5D`, `" %22`, `- %2D`, `. %2E`, `< %3C`, `> %3E` — **24 rows**. p. 6: `\ %5C`,
   `^ %5E`, `_ %5F`, `` ` %60 `` — **4 rows**. Total **28**, hex only, `%20`…`%60`. Register 364–368 is
   correct in count, in membership, in order and in page range. The 8-character entity table is
   pp. 4–5 (5 rows then 3), as 359–362 prints it.
2. **NG 01-2020 acknowledgement article (N-3).** p. 8 `Artículo 8 … Párrafo I`: "El receptor
   electrónico deberá acusar de recibo del e-CF al emisor electrónico y posteriormente su conformidad
   mediante la Aprobación o Rechazo Comercial o mediante su remisión en el Formato de Envío de Costos
   y Gastos (606) en la siguiente fecha de presentación del formato." p. 9 `Artículo 9. Del Receptor
Electrónico` = "Todo emisor electrónico será también receptor electrónico…" — one paragraph, no ¶,
   no acknowledgement duty. `Artículo 11(c)` = "Recibir todos los e-CF de sus proveedores que sean
   emitidos válidamente". `Artículo 14. Consultas` on p. 9, its `Párrafo` on p. 10. `Artículo 5` on
   p. 7; `Artículo 12` on p. 9. Every citation the register now makes to NG 01-2020 is correct.
3. **TEC-01 §7 (structure + validity).** p. 15: "La secuencia del comprobante fiscal electrónico
   dispone de una estructura de trece (13) posiciones alfanuméricas." / "Dicha secuencia estará
   vigente desde la fecha de autorización hasta el 31 de diciembre del año siguiente y no podrá ser
   usada posterior a su vencimiento." §6.1 (p. 13) prints all ten types including 46 and 47.
4. **`consultaresultado` response (R1's linchpin).** p. 23 JSON `{trackId, codigo, estado, rnc, eNCF,
secuenciaUtilizada: true, fechaRecepcion, mensajes[{valor,codigo}]}`; p. 24 XML
   `<RespuestaConsultaTrackId>` with `<secuenciaUtilizada>true</secuenciaUtilizada>`; pp. 24–25 the
   `secuenciaUtilizada` description with the eight rejection reasons; p. 25 "True = No puede
   reutilizarse la secuencia / False = Puede reutilizarse la secuencia". `RespuestaConsultaEstado`
   (pp. 27–28) = `codigo, estado, rncEmisor, ncfElectronico, montoTotal, totalITBIS, fechaEmision,
fechaFirma, rncComprador, codigoSeguridad, idExtranjero`, **no flag**.
5. **TEC-02 bitácora.** p. 3: 12-06-2023 item 1 (new RFCE consult) ✓; 18-05-2023 item 3 "Servicios no
   sensitivos a mayúsculas y minúsculas" and item 4 (`encf` + `secuenciaUtilizada` added to the RFCE
   reception response) ✓; 02-01-2026 item 4 = the split ✓. p. 4: 18-04-2022 item 1 quoted verbatim by
   the register at 443–444 ✓. TEC-03 p. 3: 02-01-2026 item **2** = the split (so JC 3's "item 2" is
   TEC-03's numbering, not TEC-02's) ✓; 03-04-2025 item 1 = the new escape characters ✓.
6. **TEC-04.** §5.1 p. 10 (portal + "primera consulta"), §5.2 p. 10 ("más de 15 días hábiles"), §5.3
   p. 11 (72 h from restoration), §6.2 p. 12 ("15 días calendario … (Art. 40, Decreto 587-24)") and
   the base-legal line "Ley 32-23 Art. 21 · Norma 01-2020 Arts. 3(i) y 10 · Decreto 587-24 Arts. 40,
   41, 42 y 43" — identical to register 303–305. §7 p. 12 = the prior-authorisation sentence.
7. **Aviso 24-19 (LEG-07).** One page; the 13-character sentence as quoted at 119–121; eight type rows
   ending at **45**; the authorisation sentence. No validity rule — so `§7`-only is right.
8. **TEC-11.** `paths` = the three `/api/EstatusServicios/*`; `components.schemas.Ambiente` =
   `{"enum":[1,2,3],"type":"integer","format":"int32"}` with **no labels**; `securitySchemes.ApiKey`
   description "…esquema ApiKey. Ejemplo: \"Authorization: ApiKey {key}\"" ✓ JC 2 holds exactly.
9. **TEC-07 / TEC-10.** TEC-07 p. 2 footnote 2: "La DGII recibirá aprobación o rechazo comercial de
   e-CF previamente aceptadas por la DGII" ✓ step 8 496. TEC-10 p. 18 PHP comment: "los tag KeyValue,
   RSAKeyValue, Exponent no son necesarios" ✓ step 4 383–385.
10. **Manifest / schemas.** `schemas` 12 + `excluded` 3 with the stated reasons; `anecf.xsd` three-level
    nesting; `ACECF v.1.0.xsd` `Estado` `EstadoType` `{1,2}`; `SemillaModel` = `valor` + `fecha` +
    extension slot.

Not re-derived by me this pass (and not relied on for the PASS beyond attempt 2's derivation):
the `site-updated`/version strings in the tables (T2's title/link scope, not a normative claim), the
directory-service field list (`urlRecepcion`/`urlAceptacion`/`urlOpcional`), and TEC-05's internal
"Actualizaciones al 30-08-2022" note. None of them is a citation a writer would print as a rule.

---

## 4. Count reconciliation (the new count sentence vs the tables)

The brief expected a sentence claiming "43, split 33 rows carrying a `§` and 10 blank". The register
does not state it in those words; it states the split as **32 claim-bearing + 4 identity/traceability +
1 service spec + 6 operational = 43**. I counted both representations independently:

```
grep -cE '^\| (LEG|TEC|XSD|STD|OPS)-[0-9]+' 124-source-register.md   → 43
per prefix: LEG 7 · TEC 11 · XSD 15 · STD 4 · OPS 6                  → 43
HTTP cells: 43 × "200" · access cells: 43 × "2026-11-09"             → 43/43
distinct row URLs: 43
```

| Register's claim (line)                                                | Arithmetic                                       | Verdict                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| "32 documents … at least one verified normative claim" (606)           | 5 LEG (03–07) + 10 TEC (01–10) + 13 XSD + 4 STD  | **32 ✓** and every one of the 32 has a real `§` cell |
| "13 schemas … of which 12 compile … while XSD-15 does not" (606–609)   | XSD-01…12 (12, manifest `schemas`) + XSD-15 = 13 | **✓** matches `MANIFEST.json`                        |
| "4 rows … identity or traceability only" (610)                         | LEG-01, LEG-02, XSD-13, XSD-14                   | **✓** all four `§` cells are `—`                     |
| "1 machine-readable service specification" (614)                       | TEC-11                                           | **✓** TEC-11's cell is `§1, §2`                      |
| "6 operational/certification manuals" (616)                            | OPS-01…06                                        | **✓** all `—`                                        |
| "37 rows under A–D … plus 6 operational rows, and 43 `200`s" (623–624) | 32 + 4 + 1 = 37; 37 + 6 = 43                     | **✓**                                                |

**`§`-cell count, done by hand from the tables:** rows asserting at least one ground-truth section =
LEG-03…07 (5) + TEC-01…11 (11) + XSD-01…12 (12) + XSD-15 (1) + STD-01…04 (4) = **33**. Rows asserting
none = LEG-01, LEG-02, XSD-13, XSD-14, OPS-01…06 = **10**. **33 + 10 = 43 ✓ — the split the brief asked
me to check is exactly what the tables say.**

One presentational wrinkle only: LEG-02's cell reads
`— (contingency: TEC-04 §5–6 + TEC-01 §19, no ground-truth §)`, so a _mechanical_ count of cells
containing the `§` glyph returns 34. The cell opens with an em dash and ends "no ground-truth §", so
the intended reading (blank, counted in the 10) is unambiguous. Cosmetic; see L-3.

**No count sentence contradicts the tables.**

---

## 5. Is the `§` column now load-bearing? (R2, end to end)

I re-did the row-by-row check rather than trusting attempt 2's table. Backing = a mapping line that
names the row **and** the section, or an F-table cell that does. Result:

| Rows                                      | § cell                        | Backing                                                                      |
| ----------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------- |
| LEG-01, LEG-02, XSD-13, XSD-14, OPS-01…06 | `—` (+ reason)                | blank by design; §F's reading notes say exactly that                         |
| LEG-03                                    | `§8, §9, §10`                 | 377–378 (§8 Art. 5), 496–497 (§9 Art. 8/12), 540–541 (§10 Art. 8 ¶I / 11(c)) |
| LEG-04, LEG-05, LEG-06                    | `§8`                          | 375–378                                                                      |
| LEG-07                                    | `§7`                          | 333–335                                                                      |
| TEC-01, TEC-02                            | `§1–§10` master               | declared master, not per-section (F row 566–576)                             |
| TEC-03                                    | `§3, §8, §10`                 | 260–262, 354–363, 527–542                                                    |
| TEC-04                                    | `§1 (status host only, §5.1)` | 285–287 + F §1                                                               |
| TEC-05                                    | `§7`                          | 330                                                                          |
| TEC-06                                    | `§7, §5`                      | 344 (§7), 439–441 (§5 `CodigoSeguridadeCF`)                                  |
| TEC-07, TEC-08, XSD-15, XSD-10            | `§9`                          | 481–506, 510–523                                                             |
| TEC-09, XSD-11                            | `§10`                         | 538–542                                                                      |
| TEC-10, STD-01…04                         | `§8`                          | 351–388                                                                      |
| TEC-11                                    | `§1, §2`                      | 277–283                                                                      |
| XSD-01…09, XSD-12                         | `§7`, `§4`                    | 380–381 (element models / `Signature` slot), 265–269                         |

**33 rows carry a backed `§`, 10 are blank with a stated reason, and §F's claims match the rows 1:1**
(§1→TEC-02/TEC-11/TEC-04 §5.1; §9→TEC-07/XSD-15/TEC-02/TEC-08/XSD-10/TEC-01/LEG-03; §7→TEC-01/05/06/02/
LEG-07/XSD-01…09; no LEG-07 or LEG-01 in §9 anymore). R2's core requirement — "every `§` listed must be
backed by a mapping line" — now holds.

---

## 6. Half-revision orphan sweep

The revision was interrupted and resumed, so I looked specifically for split-brain artifacts:

| Check                                         | Method                                                                                                                                                                                                                                                                                                                                                                                                              | Result                                                                                                                                                                                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stale copy of a corrected fact                | `rg -F` over the old strings (`five reserved`, `five characters`, `24 QR`, `Art. 9 ¶I`, `§1, §7, §9`, `§4, §9, §10`, `§1, §2, §5, §9`, `§7, §8, §10`, `§7, §8`, `TEC-01 §4.3/§9`, `the only published list that includes`, `36 documents`, `28 extractable`, `documentacionSobre-e-CF`, `same reuse semantics`, `can never return`, `the two standards the notebook`, `in practice, these types are not delivered`) | all **0** except three legitimate hits: `five characters` (363 — the prohibition), `§5/§9` (151 — the withdrawal note), `in practice…` (555 — the prohibition), `Art. 14 ¶I` (501/655/715 — quoting ground truth's mis-citation in order to forbid it). One **stale half-fact**: L-1 |
| Duplicated paragraph from the resume          | identical-line dedupe on all non-table lines > 60 chars; repeated-sentence dedupe                                                                                                                                                                                                                                                                                                                                   | **0 duplicates**                                                                                                                                                                                                                                                                     |
| Mapping line citing a row that does not exist | extracted every `LEG                                                                                                                                                                                                                                                                                                                                                                                                | TEC                                                                                                                                                                                                                                                                                  | XSD | STD | OPS-nn` token and range-checked against the row set | **0 out of range** (LEG 1–7, TEC 1–11, XSD 1–15, STD 1–4, OPS 1–6 only) |
| Judgement call contradicting a table          | JC 1–11 read against the rows and §F                                                                                                                                                                                                                                                                                                                                                                                | consistent (JC 5 ↔ LEG-07 `§7`; JC 6 ↔ step 8 + F §9 note; JC 10 ↔ step 10 + Finding 3; JC 3 ↔ both bitácoras; JC 2 ↔ TEC-11 enum)                                                                                                                                                   |
| Heading with no content                       | all 27 headings; each has a table or prose under it                                                                                                                                                                                                                                                                                                                                                                 | **none empty**                                                                                                                                                                                                                                                                       |
| Table column vs prose number                  | the 4 count groups + `§`-cell count                                                                                                                                                                                                                                                                                                                                                                                 | see §4 — consistent                                                                                                                                                                                                                                                                  |
| Code citations changed this pass              | read every cited file at the cited line                                                                                                                                                                                                                                                                                                                                                                             | all correct except the trivial `reception.ts:162–165` tail (L-4)                                                                                                                                                                                                                     |

### Residual defects — all cosmetic, none blocking

**L-1 (stale half of a fact — the exact split-brain pattern this pass hunts).** Step 2, lines 303–305:
"These are the _only_ article numbers this register verifies for contingency, and they come from
**TEC-04's extractable text** — not from LEG-01/LEG-02, which are scans." The revision added TEC-01 §19
as a co-source two paragraphs below (307–314, "it states the basis … both clocks") and updated
Residual risk to "the ones **TEC-04 and TEC-01 §19 quote themselves**" (750), but left this sentence
behind. _Why it is not blocking:_ the sentence is incomplete, not false — TEC-04 really does carry all
four article numbers it lists (Ley 32-23 Art. 21, NG 01-2020 Arts. 3(i)/10, Decreto 587-24 Arts. 40–43,
p. 12), so a writer following it cites a source that says the thing. No false attribution is produced.
_Fix (one line):_ "…and they come from TEC-04's and TEC-01 §19's extractable text".

**L-2.** LEG-02's `Doc-site step(s)` cell (86) reads `pre-flight, submit`, and §F's contingency row
claims step `2, 7`. Step 5 cites LEG-02 (412–413) and step 2 mentions it **only** to say the article
numbers do _not_ come from it (305); step 7 never names it. _Why it is not blocking:_ the register's own
step 2 ⚠ fences the writer ("scope to TEC-04 §5–6 and TEC-01 §19, do not claim a `§`"), and step 5
forbids printing an article number or a date, so no citation can be produced that LEG-02 does not
support. _Fix:_ `submit` only, or drop LEG-02 from §F's "Consumed at" cell.

**L-3.** Cosmetic conventions in the non-`§` columns: LEG-02's `§` cell contains the `§` glyph (so a
mechanical grep counts 34 rather than 33 — the cell is still, correctly, a blank claim); XSD-03's step
cell says `voiding (E34 path)` although step 9 never cites XSD-03; the nine e-CF XSD rows say
`routing`, which no step-3 line names. None of these can be turned into a DGII citation for a rule the
document does not carry, because the `§` cell beside each is `§7`/`§9`-free of the voiding rule and the
C-notes state that a schema governs element structure only.

**L-4.** Finding 3 cites `reception.ts:162–165`; the "DGII excludes E32 below RD$250,000 …" comment text
occupies 162–164 and 165 is the closing `*/`. Harmless.

**Observation (not a register defect).** The ledger's T1 row (line 91) records only attempt 1's FAIL;
attempt 2's FAIL and this verdict still need recording there when this evidence is consumed, and the
register's header claim "Status: frozen artifact" only becomes true once T1 passes — which is what
this document decides.

---

## 7. Publishability

**Can a writer produce a public DGII citation from every mapping line without inventing a source or
over-claiming what the source says? Yes — for all ten steps.**

- Every `§` in the 43 rows is backed by a mapping line that names the document **and** the section
  (§5), and the two documents that cannot support a section claim are visibly blank with a reason.
- Every article-level legal claim now points at text I read in the PDF: NG 01-2020 Arts. 5, 8 ¶I, 9,
  11(c), 12, 14; NG 05-2019 Art. 11; TEC-01 §6.1/§7/§19; TEC-04 §5–7; TEC-02 pp. 19–28; TEC-03 pp. 4–6;
  TEC-07 p. 2; TEC-10 p. 18.
- The two rules that previously carried a false DGII voice are correctly re-attributed: the B2B type
  exclusion to `enforceB2BRules` (step 10, 544–556) and `secuenciaUtilizada` back to
  `consultaresultado`/TEC-02 p. 24 (step 6, 434–447). The guide sentence the register once told the
  writer to soften is now explicitly protected — that is the right call and it is the reason attempt
  1 failed.
- The three places where DGII publishes nothing to cite (the AC filing deadline, the `Ambiente` labels,
  the `<KeyValue>` omission) are stated as SDK rules or as forbidden, never as DGII text.

The four residuals in §6 are cosmetic in the strict sense: their fixes are wording, none of them can
change what a public page claims, and none of them sits on a path where the register tells a writer to
cite something. **I am explicitly saying that so this PASS is not mistaken for "nothing left to fix" —
ship L-1 and L-2 as a one-line cleanup if a later pass touches the file, and do not re-open T1 for
them.**

## Outcome

Outcome: QA PASS for attempt 3 of 3 — the register is safe to publish from.
Details: All 37 prior findings are resolved (R1–R4, M1–M6, 9 nits, N-1…N-18), verified against freshly extracted PDFs (TEC-01/02/03/04/07/10, NG 01-2020, NG 05-2019, Aviso 24-19, both scans) with the count 43 = 33 §-carrying + 10 blank reconciled; four cosmetic residuals (L-1 stale half-sentence at line 305, L-2 LEG-02 step cell, L-3 column conventions, L-4 comment line range) need no re-review.
`project-tasks/124-evidence/t1-refuter-register-attempt3.md` — attempt-3 QA verdict: PASS, per-item status for all 37 prior findings, 10 reproduced PDF facts, count reconciliation, and four named cosmetic residuals.
