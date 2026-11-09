# T1 (Refuter) — `project-tasks/124-source-register.md`, attempt 2 of 3

**Verdict: FAIL — not yet safe to publish from. Attempt 3 is a small diff, not a rewrite.**

Revision 2 lands the two instructions that mattered most and lands them cleanly: the
`secuenciaUtilizada` ⚠ is withdrawn and replaced with a correct, page-level attribution, and the B2B
exclusion is re-attributed to the SDK. R1, R3, R4 and four of the six medium findings are fully
resolved. What blocks publication is a different order of problem: **three false statements that a
writer would print verbatim** — a DGII character table undercounted by the same mechanism R4 flagged
(24 vs 28), `Aviso 24-19` credited with an e-NCF validity rule it does not contain, and an
acknowledgement duty pinned to `NG 01-2020 Art. 9 ¶I` when the text is `Art. 8 ¶I` — plus a **404
entry-point link** in the method section and a `Ground-truth §` column that is still not backed row by
row (R2 partially landed).

Attempt 1's headline failure is fixed. Attempt 2's failures are narrower, cheaper, and all of them are
in material that revision 2 either added or newly quantified, so they are exactly the kind of defect a
third pass exists to catch.

---

## 1. Evidence base (reproduced from scratch on this machine)

Everything below was re-derived, not carried over from attempt 1. PDFs fetched with a browser UA and
extracted with `pypdf` (recipe in the register's §Verification recipe is correct and works):

| Document                                           | HTTP | Pages | Extraction                          |
| -------------------------------------------------- | ---- | ----- | ----------------------------------- |
| TEC-01 `Informe Técnico e-CF v1.0`                 | 200  | 53    | full text                           |
| TEC-02 `Descripcion Tecnica Servicios DGII`        | 200  | 47    | full text, page-by-page             |
| TEC-03 `Descripcion Tecnica Emisores Electronicos` | 200  | 13    | full text, page-by-page             |
| TEC-04 `Estandares de Comportamiento Esperado…`    | 200  | 13    | full text                           |
| TEC-05 `Formato e-CF V1.0`                         | 200  | 89    | full text                           |
| TEC-06 `Formato Resumen FC v1.0`                   | 200  | 12    | full text                           |
| TEC-10 `Firmado de e-CF`                           | 200  | 20    | full text                           |
| LEG-01 Ley 32-23                                   | 200  | 33    | **0 extractable characters** (scan) |
| LEG-02 Decreto 587-24                              | 200  | 29    | **0 extractable characters** (scan) |
| LEG-03 NG 01-2020                                  | 200  | 10    | full text                           |
| LEG-07 Aviso 24-19                                 | 200  | 1     | full text                           |
| TEC-11 `definition.json`                           | 200  | —     | 2 116 bytes, `openapi 3.0.1`        |

Also read directly: `examples/fixtures/schemas/{MANIFEST.json,anecf.xsd}`,
`packages/typescript/src/{client.ts,reception.ts,reconciliation.ts,types.ts,http.ts}`,
`packages/python/src/py_dgii_ecf/{reconciliation.py,client.py}`,
`project-docs/dgii-ground-truth.md`, `docs/en/guides/{flow,resilience}.md`,
`project-tasks/124-dgii-official-sources-ledger.md`, `project-tasks/124-evidence/t2-evidence-collector-links.md`.

Live HTTP re-checks (UA divergence reproduced): `www.w3.org/TR/xmldsig-core1/` → **403** browser UA,
**200** plain curl UA (same for C14N 1.0 and XML-Enc 1.1); `dgii.gov.do` → **403** `curl/8.12.1`,
**200** browser UA; `statusecf.dgii.gov.do` → **200** for every UA. `rfc-editor.org/rfc/rfc6931` → 200.

---

## 2. Status of every attempt-1 finding

Legend: **L** = landed, **P** = partially landed (blocking residual), **N** = not landed.
Line references are into the revised register unless prefixed with a file name.

### Blocking refutations

| #                                                                    | Status                                                  | Proof (register line)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Independent verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1** — `secuenciaUtilizada` ⚠ was inverted                         | **L**                                                   | 408–430: bold block "the track step is correctly sourced; do not soften it", with p. 23 JSON / p. 24 XML / pp. 24–25 parameter description, bitácora 18-04-2022, and `consultaestado` field list; the ⚠ is gone (no `⚠` remains in step 6); residual risk 692 "**Withdrawn:** `secuenciaUtilizada` is **not** a risk"                                                                                                                                                                                                                                                                                                               | TEC-02 p. 23 JSON block contains `"secuenciaUtilizada": true`; p. 24 contains `<RespuestaConsultaTrackId>` … `<secuenciaUtilizada>true</secuenciaUtilizada>`; pp. 24–25 carry the rejection-reason list **verbatim** as the register quotes it; p. 25 "True = No puede reutilizarse / False = Puede reutilizarse"; p. 4 bitácora 18-04-2022 item 1 word-for-word as quoted; pp. 27–28 `RespuestaConsultaEstado` has exactly the eleven fields the register lists and no reuse flag. All four claims hold. |
| **R2** — § column attributes sections the documents do not govern    | **P**                                                   | Fixed for the rows attempt 1 named: LEG-01 line 84 = `§9` only (+ notes 94–104), LEG-02 line 85 = `— (contingency…)`, note 94–100, LEG-03 line 86 = `§9, §10` (no §4), TEC-04 line 123 = `— (operational…)`, XSD §8 withdrawn (C-note 183–187). **Still wrong:** LEG-07 line 90 `§7, §9` (see N-2), TEC-05 line 124 `§7, §8, §10` (§8/§10 unbacked, N-4), LEG-04 line 87 `§7, §8` (§7 unbacked, N-5), LEG-03 line 86 omits `§8` that line 355 and F line 541 both claim (N-6), TEC-04 line 123 `—` contradicts F lines 534/549 (N-7), LEG-01 line 84 `§9` unprovable while LEG-02 line 85 is blanked for the same scan status (N-8) | Own extraction (see §5 below).                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **R3** — "the only published list that includes 46 and 47" was false | **L**                                                   | 309–310 "TEC-05 `<TipoeCF>` and TEC-01 §6.1 both list the full catalogue … Do not call either 'the only published list'"; 312–314 LEG-07 demoted to the notice with "types 31–45 only"; 316–322 TEC-01 §7 added for structure **and** validity, and ground-truth §9's last bullet explicitly mapped to it                                                                                                                                                                                                                                                                                                                           | TEC-01 p. 13 (§6.1) prints all ten types 31/32/33/34/41/43/44/45/**46/47**; TEC-05 p. 3 prints the same ten; TEC-01 p. 15 (§7): "estructura de trece (13) posiciones alfanuméricas" + "vigente desde la fecha de autorización hasta el 31 de diciembre del año siguiente y no podrá ser usada posterior a su vencimiento" — the register's quote is exact; LEG-07 p. 1 stops at 45.                                                                                                                       |
| **R4** — TEC-03's escape rule understated as five characters         | **L** (but the adjacent table repeats the defect — N-1) | 338–342: **eight** characters, each with named + decimal + hex form, plus "Do not write 'five characters' — that understates a DGII requirement"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | TEC-03 p. 4–5 table is exactly `"` `'` `<` `>` `&` `©` `€` `®` with `&quot;/&#34;/&#x22;`, `&apos;/&#39;/&#x27;`, `&lt;/&#60;/&#x3C;`, `&gt;/&#62;/&#x3E;`, `&amp;/&#38;/&#x26;`, `&copy;/&#169;/&#xA9;`, `&euro;/&#8364;/&#x20AC;`, `&reg;/&#174;/&#xAE;` — character-for-character as the register prints them.                                                                                                                                                                                         |

### Medium refutations

| #                                                                       | Status | Proof                                                                                                                                                                                                                                                                                                                         | Verification                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M1** — judgement call 1 overstated the absence of the status service  | **L**  | Judgement call 1 (586–592) rewritten; step 2 (266–274) now maps TEC-11 (paths) + TEC-01 §4.9 (service) + TEC-04 §5.1 (mandate)                                                                                                                                                                                                | TEC-01 p. 10 §4.9: "Servicio responsable de proporcionar el estatus y disponibilidad de los servicios de facturación electrónica, como también las ventanas de mantenimientos de estos" — the register's quotation is exact; TEC-01 p. 10 footnote defers structure to the technical description ✓; TEC-04 p. 10 §5.1 names `statusecf.dgii.gov.do` as "la primera consulta ante cualquier error de conectividad" ✓ |
| **M2** — "the multipart field name exists only inside TEC-02" was false | **L**  | Step 1 249–252; B-notes 147–149; "Normative but not publicly reachable" row 229; F §3 line 536                                                                                                                                                                                                                                | TEC-03 pp. 9, 10, 12 all post `xml=@…;type=text/xml` (`-f 'xml=@archivosemillafirmado.xml;type=text/xml'`, `101672919e3100000001.xml`, `101672919E3100000001.xml`) ✓                                                                                                                                                                                                                                                |
| **M3** — the B2B remedy was mis-attributed to DGII                      | **L**  | Step 10 ⚠ (512–521) verbatim per attempt 1's required sentence; judgement call 10; residual risk #1 (689)                                                                                                                                                                                                                     | `reception.ts:151` `B2B_EXCLUDED_TYPES = ['41','43','45','46','47']`; `reception.ts:166` `checkB2BApplicability` (rejects RFCE root, those five, and E32 below threshold); `client.ts:134` `this.enforceB2BRules = options.enforceB2BRules ?? true` ✓. Residual: the code locations named are incomplete (N-9).                                                                                                     |
| **M4** — judgement call 6 withheld the article but not the date         | **L**  | Judgement call 6 (609–625): calls the citation **wrong**, records it as a correction, and rules "print neither the article number nor the date"; step 8 ⚠ (469); residual risk #2                                                                                                                                             | LEG-03 p. 9 `Artículo 14. Consultas` ("La DGII pondrá a disposición … la consulta de validación de los e-CF") — no deadline ✓; `Artículo 8 … Párrafo I` quoted by the register word-for-word ✓ and names no calendar date ✓                                                                                                                                                                                         |
| **M5** — the 34-vs-37 paragraph was a guess presented as reconciliation | **P**  | 574–581 drop the causal story and say "34 and 43 are not comparable numbers … publishes the list … not a correction"; but the count sentence 566 still reads "**36 documents that carry at least one verified normative claim**" and that set includes LEG-02, whose own § cell is `—` and whose text is unreadable (see N-8) | See §4 for the arithmetic.                                                                                                                                                                                                                                                                                                                                                                                          |
| **M6** — `consultarfce` was missing                                     | **L**  | Step 6 411–415 names the endpoint, the pp. 19–21 section and the bitácora 12-06-2023 addition; step 7 434–438 uses it as the RFCE reuse route                                                                                                                                                                                 | TEC-02 pp. 19–21: `fc.dgii.gov.do/{ambiente}/consultarfce/api/Consultas/Consulta?RNC_Emisor=&ENCF=&Cod_Seguridad_eCF=`; p. 21 response JSON contains `secuenciaUtilizada`; bitácora 12-06-2023 item 1 = "un nuevo servicio de consulta de Resúmenes de factura" ✓. Minor: "same reuse semantics" (435) is an inference — the p. 21 parameter block does not describe the flag (N-17).                               |

### Nits from attempt 1 (7 listed + the 2 padding items = 9)

| #   | Nit                                                           | Status | Proof                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| N1  | ANECF nesting drops the `Secuencias` wrapper                  | **L**  | XSD-10 row 174; C-note 190–193 "three levels, not two"; step 9 481–484. `anecf.xsd:24–37` = `TablaRangoSecuenciasAnuladaseNCF` → `Secuencias` (minOccurs 1, maxOccurs 10000) → `SecuenciaeNCFDesde`/`SecuenciaeNCFHasta` ✓                       |
| N2  | Cite XSD-15 for ACECF `Estado`                                | **L**  | Step 8 456–460; C-note 194                                                                                                                                                                                                                       |
| N3  | TEC-04 has **two** 15-day rules                               | **L**  | Step 2 280–289 separates 72 h / 15 días hábiles / 15 días calendario. TEC-04 p. 10 §5.2 "más de 15 días hábiles"; p. 11 §5.3 "72 horas desde el restablecimiento"; p. 12 §6.2 "15 días calendario (imposibilidad) … (Art. 40, Decreto 587-24)" ✓ |
| N4  | Warn off TEC-02's 11-character e-NCF example                  | **L**  | 382–387. TEC-02 p. 12 `101672919E3100000001.xml` and p. 16 `101672919E3200000001.xml` — both 11-character e-NCFs ✓. (But see N-14: TEC-03 has the same typo.)                                                                                    |
| N5  | Ground-truth §8's `<KeyValue>` prohibition has no DGII source | **L**  | Step 4 ⚠ 360–366; Finding 4 673–675. TEC-10 p. 18: "los tag KeyValue, RSAKeyValue, Exponent **no son necesarios**" ✓; TEC-03's _Firmado de XML_ (p. 6, four bullets) never mentions them ✓                                                       |
| N6  | Manifest bookkeeping (12 + 3, not 15)                         | **L**  | C-section 157–161. `MANIFEST.json`: `schemas` = 12, `excluded` = 3, reasons = unresolved `IndicadorServicioTodoIncluidoType` (e-CF 31), invalid `[$0-9]` + `\-` (RFCE 32), invalid `\-` (ACECF) — exactly as the register states ✓               |
| N7  | The ledger recorded T1 attempt 1 = PASS                       | **L**  | Finding 6 679–686; ledger T1/T2 rows now read **FAIL** with pointers to the two evidence files ✓                                                                                                                                                 |
| N8  | The 15-XSD framing should be stated in the count sentence     | **L**  | 566–570 states 12 compile / 3 reference-only inline                                                                                                                                                                                              |
| N9  | TEC-11 is a service spec, not a normative document — label it | **L**  | B-note 134–138; counted as its own group at 571–573                                                                                                                                                                                              |

**Score: R1 L, R2 P, R3 L, R4 L; M1 L, M2 L, M3 L, M4 L, M5 P, M6 L; nits 9/9 L.**

---

## 3. New defects

Each item was introduced or newly quantified by revision 2, or is a pre-existing line that revision 2
now contradicts. Severity is judged by one test: _would a writer copying this line put a false or
unverifiable statement on the public site?_

### Blocking

**N-1 — TEC-03's QR/URL character table is undercounted 24 instead of 28 (lines 343–346).**
The register prints "a **separate** set of 24 QR/URL reserved characters … (space, `!` `#` `$` `&` `'`
`(` `)` `*` `+` `,` `/` `:` `;` `=` `?` `@` `[` `]` `"` `-` `.` `<` `>`) … (`%20`…`%3E`)".
TEC-03's table **continues past the page break**: p. 5 ends at `>` `%3E`, and p. 6 opens with four more
rows — `\` `%5C`, `^` `%5E`, `_` `%5F`, `` ` `` `%60`. The table is 28 rows and the escape range is
`%20`…`%60`. This is R4's own defect relocated one table down: R4 was "a writer reproducing 'five'
understates a DGII requirement", and revision 2 now instructs the writer to reproduce "24".
_Fix:_ "a **separate** set of **28** QR/URL reserved characters … (space, `!` `#` `$` `&` `'` `(` `)`
`*` `+` `,` `/` `:` `;` `=` `?` `@` `[` `]` `"` `-` `.` `<` `>` `\` `^` `_` `` ` ``), each replaced by
its hex escape only (`%20`…`%60`) — the table spans TEC-03 pp. 5–6."

**N-2 — `Aviso 24-19` is credited with an e-NCF validity rule it does not contain (line 90, and F line 542).**
LEG-07's § cell reads `§7, §9`. §9 is _Approval and voiding_, into which the register has just moved the
validity bullet ("TEC-01 §7 — e-NCF validity (31 Dec of the following year)", F line 542). The Aviso is
one page; its full text is the 13-character structure sentence, the type table 31–45, and the
authorisation sentence. It says nothing about validity, and the register's own new note (109–114) says
LEG-07 "is cited for the e-NCF structure notice **and nothing else**", which the cell contradicts. F's
§9 cell also lists "LEG-01/LEG-07 — legal anchor (no article number, no date)".
_Fix:_ LEG-07 § cell → `§7`; delete LEG-07 from F's §9 cell (keep LEG-01 there or drop the pair).

**N-3 — the acknowledgement duty is pinned to `NG 01-2020 Art. 9 ¶I`; the text is `Art. 8 ¶I` (lines 107–108, 509, 543).**
Three occurrences: the LEG-03 note ("§10 (Art. 9 _Del Receptor Electrónico_, ¶I: the receiver must
acknowledge receipt)"), step 10 ("**LEG-03 Art. 9 ¶I** → the legal duty to acknowledge receipt"), and F
§10 ("LEG-03 Art. 9 ¶I — duty to acknowledge"). LEG-03 p. 9: `Artículo 9. Del Receptor Electrónico` is
one unnumbered paragraph ("Todo emisor electrónico será también receptor electrónico y recibirá de
manera electrónica los comprobantes…"); it has no ¶I and imposes no acknowledgement duty. The duty is
`Artículo 8 … Párrafo I` (p. 8): "El receptor electrónico deberá acusar de recibo del e-CF al emisor
electrónico y posteriormente su conformidad mediante la Aprobación o Rechazo Comercial o mediante su
remisión en el Formato de Envío de Costos y Gastos (606)…" — the very paragraph the register quotes
correctly elsewhere (judgement call 6, step 8). So revision 2 corrects ground truth's mis-citation of
Art. 14 while introducing a fresh mis-citation of Art. 9 in three places.
_Fix:_ `Art. 8 ¶I` everywhere; for §10 cite `Art. 9` (receiver status) **and** `Art. 11(c)` ("Recibir
todos los e-CF de sus proveedores que sean emitidos válidamente", p. 9) if a §10 duty is wanted, and
drop the invented "¶I".

### Medium

**N-4 — TEC-05's § cell claims `§8, §10` with nothing behind them (line 124).** Step 4 never cites
TEC-05, step 10 never cites TEC-05, and F's §8 and §10 rows do not list TEC-05. Fix: `§7` only, or add
a mapping line.
**N-5 — LEG-04's § cell claims `§7` (line 87).** NG 05-2019 is cited by step 4 for the signature
obligation (§8) only; F's §7 row does not include LEG-04. Fix: `§8`.
**N-6 — LEG-03's § cell omits `§8` (line 86) while step 4 (355) and F (541) attribute `Art. 5 Del
Certificado Digital` to §8.** One of the two is wrong; the mapping is the substantiated one (Art. 5
exists, p. 7). Fix: `§8, §9, §10`.
**N-7 — TEC-04 contradicts itself on `§1` (line 123 vs 534/549).** The row says `— (operational … no
ground-truth claim)`; F's §1 row and F's reading note both count "TEC-04 §5.1 — the
`statusecf.dgii.gov.do` URL" as backing for §1. Fix: either `§1 (status host only)` in the row, or drop
TEC-04 from F's §1 cell.
**N-8 — the count sentence's qualifier is false for at least one row (566–567), and LEG-01/LEG-02 are
treated asymmetrically (84 vs 85).** "36 documents that carry at least one verified normative claim"
includes LEG-02, whose § cell is `—` and whose text cannot be read at all. The register also states
LEG-02 has "28 extractable characters"; I measure **0** non-whitespace characters with `pypdf` on the
same 29-page file (attempt 1 measured 0 too). Two smaller halves of the same problem: LEG-01 keeps
`§9` although it is equally unreadable (attempt 1's R2 rationale was exactly that a scan cannot support
a § claim), and XSD-13/14 are labelled `§7 (reference only)` while being counted among the
claim-bearing 36.
_Fix:_ keep the arithmetic (43 = 36 + 1 + 6, 12 compile + 3 reference-only) but make the qualifier
true: "**35 documents that carry at least one verified normative claim**, plus 1 legal instrument
verified for identity only (LEG-02, scanned), plus 1 service spec (TEC-11), plus 6 operational manuals"
— or add a per-row marker and say "36 rows under A–D, of which LEG-02 and XSD-13/14 are carried for
traceability". Replace "28 extractable characters" with "0 extractable characters".

**N-9 — the code findings name an incomplete set of code locations (655–672).** `reception.ts` carries
the same false DGII attribution the register is correcting in `client.ts:67`:
`reception.ts:150` — `/** Type codes DGII excludes from the direct Emisor↔Receptor flow. */` — and
`reception.ts:161–165` — "DGII excludes E32 below RD$250,000 … plus E41, E43, E45, E46 and E47."
Finding 3 names only `client.ts:67`. And per `AGENTS.md` parity is mandatory: the Python twin has the
same defect (`packages/python/src/py_dgii_ecf/reconciliation.py:30` `can_reuse_sequence`, called from
`client.py:520`), which Finding 1 does not mention.
_Fix:_ Finding 1 → add `python reconciliation.py:30` / `client.py:520`; Finding 3 → add
`reception.ts:150` and `reception.ts:161–165`.

**N-10 — the strongest extractable contingency source is missing: TEC-01 §19 _Operación en
Contingencia_ (pp. 46–47).** TEC-01 §19 quotes "los artículos 40 al 43 del Reglamento … Decreto núm.
587-24", states the 72-hour limit ("Enviar los e-CF pendientes … en un plazo no mayor de setenta y dos
(72) horas") **and** the 15-day limit ("Esta contingencia no podrá exceder de quince (15) días
calendario"), and adds the replacement-document rules (`NCFModificado`, `CodigoModificacion` = 4) that
no other row carries. The register instead instructs the writer to scope every contingency line to
"TEC-04 §5–6 (optionally + OPS-04)" (294–295, 544, 694–697) and — true but now misleading — says the
contingency article numbers "come from TEC-04's extractable text" (291), as if TEC-04 were the only
extractable source. This is a source-coverage gap of the M6 type: the advice is unactionable for the
replacement path.
_Fix:_ add TEC-01 §19 to the contingency scope in step 2, in F's "— Contingency" row and in residual
risk #3, and add "§19" to TEC-01's description cell.

**N-11 — "access requires prior authorization" is attributed to TEC-04 §5.1 (275–276); it is §7.**
§5.1 (p. 10) mandates the portal as the first check; the authorisation sentence is in §7 _Canales de
Verificación y Referencias_ (p. 12): "Para su utilización, se requiere gestionar previamente la
autorización de acceso correspondiente." _Fix:_ "TEC-04 §5.1 → first check; §7 → prior authorisation."

### Low (fix in the same pass; none blocks alone)

**N-12 — the first "Working entry point" link is a 404 (line 29).** The register links
`…/Paginas/documentacionSobre-e-CF.aspx`; the live page is `…/Paginas/documentacionSobreE-CF.aspx`
(no hyphen). Verified twice with the browser UA **and** with no UA header: hyphen → 404, no hyphen →
200; `marcoLegal.aspx` → 200 both ways. T2's evidence (line 99) used the correct hyphenless URL, so the
typo is in the register text, not in the evidence.
**N-13 — `LEG-03 p. 10` for Art. 14 (471, 612, 667).** `Artículo 14. Consultas` starts on **p. 9**;
only its _Párrafo_ runs onto p. 10. Fix: "p. 9 (Párrafo p. 10)".
**N-14 — TEC-03 carries the same 11-character e-NCF typo as TEC-02, unwarned (378–384).** The register
says TEC-03's table has "13-character examples throughout" (true of the table) and warns only about
TEC-02's example. TEC-03's own cURL blocks on pp. 9 and 10 use `101672919(e|E)3100000001.xml` — 11
characters. Fix: extend the ⚠ to "TEC-02 p. 12/16 and TEC-03 pp. 9–10; use TEC-03's table".
**N-15 — "`canReuseSequence` can never return `true`" is stated as a code certainty (655).** The
response parser is a cast (`http.ts:222` `return ok(data as T)`), and `types.ts:51` declares
`secuenciaUtilizada?: boolean` on `InquiryStatusResponse`, so the impossibility comes from DGII's
documented response, not from the code. Fix: "returns `false` for every documented `consultaestado`
response; it can only ever be `true` if DGII returns a field it does not document."
**N-16 — `reception.ts:151` is cited for two symbols (515–516).** 151 is `B2B_EXCLUDED_TYPES`;
`checkB2BApplicability` is at 166. Fix: `reception.ts:151` and `reception.ts:166`.
**N-17 — "same reuse semantics" for `consultarfce` (435).** The p. 21 response JSON carries the field,
but the p. 21 _DESCRIPCIÓN PARÁMETROS DE SALIDA_ does not describe it. Fix: "the same field name; the
semantics are documented for `consultaresultado` (p. 24)".
**N-18 — "—" cells that still name a `§` (OPS-06 line 223) and step cells with no mapping line (LEG-01
"track", LEG-02 "reconcile").** Cosmetic, but they are the same class as R2: drop the `§8` from OPS-06's
cell and align the two step cells with the mapping (LEG-02 is cited in steps 2 and 5 only).

---

## 4. Count verification (numbers vs tables)

Row count by prefix, counted from the tables:

```
grep -cE '^\| (LEG|TEC|XSD|STD|OPS)-[0-9]+' 124-source-register.md     → 43
per prefix: LEG 7 · TEC 11 · XSD 15 · STD 4 · OPS 6                     → 43
```

The "Verified count" section (562–581) then says:

| Claim                                                                                          | Arithmetic                                     | Verdict                                                                                                                                                |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 43 URLs verified `200`                                                                         | 7+11+15+4+6 = 43 rows, every `HTTP` cell `200` | **consistent** (independently corroborated by `t2-evidence-collector-links.md`: 47 URL occurrences = 43 row URLs + 2 entry pages + 2 others, 47 × 200) |
| "36 documents that carry at least one verified normative claim — 7 LEG, 10 TEC, 15 XSD, 4 STD" | 7+10+15+4 = 36                                 | **arithmetic OK, qualifier false** — LEG-02's own § cell is `—` and its text is unreadable (N-8)                                                       |
| "1 machine-readable service spec — TEC-11"                                                     | 36+1 = 37                                      | **consistent** with "37 rows under A–D"                                                                                                                |
| "6 operational manuals"                                                                        | 37+6 = 43                                      | **consistent**                                                                                                                                         |
| "of which 12 compile and 3 are reference-only"                                                 | 15−3 = 12                                      | **consistent** with `MANIFEST.json` (12 `schemas` + 3 `excluded`)                                                                                      |
| "34 and 43 are not comparable … not a correction and not an overshoot"                         | —                                              | **holds** (M5's causal story is gone)                                                                                                                  |

No count sentence contradicts the tables arithmetically. The only contradiction is the _qualifier_
(N-8), which is a truth claim about two rows, not about the totals.

---

## 5. `Ground-truth §` column, row by row

Backing = a mapping line that names the row **and** the section, or an F-table row that does. "Clean"
rows are listed compactly; the rest carry a defect number.

| Row                 | § cell (line)                      | Backing                                                         | Verdict                                                                                                   |
| ------------------- | ---------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| LEG-01 (84)         | `§9`                               | step 5 (384) legal anchor; F §9 (542)                           | **P** — unprovable (scan), asymmetric with LEG-02 (N-8)                                                   |
| LEG-02 (85)         | `— (contingency…)`                 | step 2 (290–291), step 5 (384), F "— Contingency" (544)         | clean; step cell "reconcile" unbacked (N-18). Add TEC-01 §19 (N-10)                                       |
| LEG-03 (86)         | `§9, §10`                          | step 8 (465–468) §9; step 10 (509) §10                          | **P** — §8 missing (N-6); Art. 9 ¶I wrong (N-3)                                                           |
| LEG-04 (87)         | `§7, §8`                           | step 4 (352) §8 only                                            | **P** — §7 unbacked (N-5)                                                                                 |
| LEG-05 (88)         | `§8`                               | step 4 (355–356)                                                | clean                                                                                                     |
| LEG-06 (89)         | `§8`                               | step 4 (356)                                                    | clean                                                                                                     |
| LEG-07 (90)         | `§7, §9`                           | step 3 (312–314) §7                                             | **P** — §9 false (N-2)                                                                                    |
| TEC-01 (120)        | `§1–§10` (master, not per-section) | steps 1–10 at § level                                           | clean as declared                                                                                         |
| TEC-02 (121)        | `§1–§10` (master)                  | steps 1–10; F §1–§10                                            | clean as declared                                                                                         |
| TEC-03 (122)        | `§3, §8, §10`                      | step 1 (249–252) §3; step 4 (334–337) §8; step 10 (501–506) §10 | clean                                                                                                     |
| TEC-04 (123)        | `— (operational…)`                 | step 2 (275–296), step 7 (444–446)                              | **P** — F attributes §1 to it (N-7); missing from contingency scope as a co-source with TEC-01 §19 (N-10) |
| TEC-05 (124)        | `§7, §8, §10`                      | step 3 (309) §7                                                 | **P** — §8, §10 unbacked (N-4)                                                                            |
| TEC-06 (125)        | `§7, §5`                           | step 3 (325) §7; step 6 (407–409) §5                            | clean                                                                                                     |
| TEC-07 (126)        | `§9`                               | step 8 (450–455)                                                | clean                                                                                                     |
| TEC-08 (127)        | `§9`                               | step 9 (479–480)                                                | clean                                                                                                     |
| TEC-09 (128)        | `§10`                              | step 10 (507–508)                                               | clean                                                                                                     |
| TEC-10 (129)        | `§8`                               | step 4 (330–333)                                                | clean                                                                                                     |
| TEC-11 (130)        | `§1, §2`                           | step 2 (266–271); F §1/§2                                       | clean                                                                                                     |
| XSD-01…09 (165–173) | `§7`                               | step 4 (364–366); F §7 (540)                                    | clean                                                                                                     |
| XSD-10 (174)        | `§9`                               | step 9 (483)                                                    | clean                                                                                                     |
| XSD-11 (175)        | `§10`                              | step 10 (507)                                                   | clean                                                                                                     |
| XSD-12 (176)        | `§4`                               | step 1 (255–257)                                                | clean                                                                                                     |
| XSD-13/14 (177–178) | `§7 (reference only)`              | C-note 188–189                                                  | **P** — counted among the claim-bearing 36 (N-8)                                                          |
| XSD-15 (179)        | `§9`                               | step 8 (456–460)                                                | clean                                                                                                     |
| STD-01…04 (200–203) | `§8`                               | step 4 (363)                                                    | clean                                                                                                     |
| OPS-01…05 (218–222) | `—`                                | —                                                               | clean                                                                                                     |
| OPS-06 (223)        | `— (context for §8 …)`             | —                                                               | cosmetic (N-18)                                                                                           |

**Result: 30 of 37 A–D rows are backed by a mapping line; 6 carry a § that nothing backs or that the
document does not carry, and 1 (LEG-01) is unprovable.** R2's core — "delete the sections a document
does not govern" — was applied to the rows attempt 1 named and not to the rest of the table, so the
column is better but still not load-bearing. That is why R2 stays at PARTIALLY LANDED.

---

## 6. The two withdrawn instructions (both correctly withdrawn)

| Instruction on the table in attempt 1                                                        | Status in revision 2                                                                                                                                                                                                           | Proof                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Withdraw the `secuenciaUtilizada` ⚠ — the field **is** on `consultaresultado` (TEC-02 p. 24) | **Withdrawn.** No ⚠ remains in step 6; the block at 408–430 states the opposite of attempt 1's complaint, tells the writer to cite TEC-02 p. 24 and to "leave the wording alone", and turns the finding into an SDK code issue | `grep '⚠'` → 7 hits, none in step 6 on this topic (259 seed, 294 contingency, 296 Ambiente, 360 KeyValue, 382 filename, 469 AC deadline, 512 B2B). `docs/en/guides/flow.md:225` still reads "On a rejection, `secuenciaUtilizada` decides the next step" — untouched, correctly |
| Residual risk must stop listing `secuenciaUtilizada`                                         | **Gone.** Line 692: "**Withdrawn:** `secuenciaUtilizada` is **not** a risk … The defect is in the SDK's reconcile path, not in the docs (Finding 1)"                                                                           | Residual risk now lists B2B (689), legal article numbers (693), the missing contingency ground-truth section (694), in-place republication (699), and the two scans (703)                                                                                                       |
| B2B must be attributed to the SDK (`enforceB2BRules`), not DGII                              | **Landed.** Step 10 ⚠ (512–521), judgement call 10 (637–646), residual risk #1 (689), Finding 3 (669)                                                                                                                          | Code verified: `reception.ts:151/166`, `client.ts:134`. The only remaining gap is that the code's _own_ doc comments still say "DGII excludes" and the register's Finding 3 does not list them (N-9)                                                                            |

---

## 7. Reproduced PDF claims (three required, eight done)

1. **TEC-02 `consultaresultado` response block.** p. 23 JSON `{trackId, codigo, estado, rnc, eNCF,
secuenciaUtilizada, fechaRecepcion, mensajes[]}` and p. 24 XML `<RespuestaConsultaTrackId>` …
   `<secuenciaUtilizada>true</secuenciaUtilizada>` … `</RespuestaConsultaTrackId>`; pp. 24–25
   description with the eight rejection reasons; p. 25 "True = No puede reutilizarse la secuencia /
   False = Puede reutilizarse la secuencia". Register lines 411–422 quote all of it correctly, and
   `RespuestaConsultaEstado` (pp. 27–28) has no reuse flag (register line 423–425). **R1 verified.**
   The extraction recipe in the register's §Verification recipe works verbatim.
2. **TEC-03 reserved-character tables.** Eight characters with named/decimal/hex escapes on pp. 4–5
   (`&quot; &#34; &#x22;` … `&reg; &#174; &#xAE;`), then the QR/URL table spanning **pp. 5–6** with
   **28** rows, hex only, `%20`…`%60`. Register lines 338–342 accurate; **343–346 wrong (N-1)**.
3. **TEC-01 §6.1 / §7.** p. 13 lists the ten types including 46/47; p. 15 states the 13-position
   structure and the 31-December validity rule in the words the register quotes. **R3 verified.**
4. **TEC-02 bitácora.** p. 3: 02-01-2026 item 4 = the split; 03-04-2025 = new escape characters;
   12-06-2023 item 1 = the RFCE consult service; 18-05-2023 item 3 = "Servicios no sensitivos a
   mayúsculas y minúsculas". p. 4: 18-04-2022 item 1 exactly as the register quotes. All four
   attributions correct — including judgement call 3's "item 2", which is TEC-03's item 2 (p. 3), not
   TEC-02's item 4.
5. **TEC-04 §5–6.** p. 10 §5.2 "más de 15 días hábiles"; p. 11 §5.3 72 hours; p. 12 §6.2 "15 días
   calendario … (Art. 40, Decreto 587-24)" and the base-legal line "Ley 32-23 Art. 21 · Norma 01-2020
   Arts. 3(i) y 10 · Decreto 587-24 Arts. 40, 41, 42 y 43" — identical to register line 291.
6. **LEG-03.** p. 8 `Artículo 8 … Párrafo I`; p. 9 `Artículo 9` (one paragraph, no ¶),
   `Artículo 12`, `Artículo 14. Consultas`; p. 7 `Artículo 5. Del Certificado Digital`. Confirms
   N-3 (Art. 9) and N-13 (Art. 14 is on p. 9).
7. **LEG-07.** Full one-page text: the 13-character structure sentence quoted accurately, eight type
   rows ending at 45, no validity rule. Confirms N-2.
8. **TEC-11 `definition.json`.** `openapi 3.0.1`; the three `/api/EstatusServicios/*` paths;
   `components.schemas.Ambiente` = `enum [1,2,3]`, integer, **no labels**;
   `securitySchemes.ApiKey` with `Authorization: ApiKey {key}`. Judgement call 2 holds exactly.

Two claims I could **not** reproduce: LEG-02 "28 extractable characters" (I measure **0**) — N-8; and
the "Working entry point" URL on line 29 (404) — N-12.

---

## 8. Decision

**Reject — attempt 2 of 3 fails. Not safe to publish from yet.**

The revision is materially better than attempt 1 and its riskiest instruction is now correct. Attempt 3
needs only the following, in this order:

1. **N-1** (28 QR/URL characters, `%20`…`%60`, pp. 5–6) — the only place where revision 2 newly
   understates a DGII requirement.
2. **N-2** (LEG-07 → `§7`; drop it from F's §9) and **N-3** (`Art. 8 ¶I`, not `Art. 9 ¶I`) — two false
   attributions a writer would print as-is.
3. **R2 residual** — N-4, N-5, N-6, N-7: make every `§` in the 43 rows backed by a mapping line, so the
   column does what §F claims for it.
4. **N-8** — one truthful count sentence (LEG-02 verified for identity only; `0` extractable
   characters).
5. **N-10** — add TEC-01 §19 to the contingency scope, and **N-9** — complete the code locations and
   name the Python twin.
6. N-11…N-18 are one-line edits; ship them in the same commit.

No further PDF reading is needed for any of this: every fix above is a correction the extracted text
already sits behind, and every location is quoted in §3. After them the register's remaining risk is
ordinary (DGII republishes in place), which the document already states.

## Outcome

Outcome: FAIL — attempt 2 of 3 is not safe to publish from; attempt 3 needs a small, fully specified diff.
Details: The two withdrawn instructions are correctly withdrawn (R1 landed with TEC-02 pp. 23–25; B2B now attributed to `enforceB2BRules`), R3/R4/M1–M4/M6 and all 9 nits landed. Blocking remain: TEC-03's QR/URL table undercounted 24 vs 28 (register L343), `Aviso 24-19` credited with a validity rule it lacks (L90, L542), `NG 01-2020 Art. 9 ¶I` where the text is `Art. 8 ¶I` (L107, L509, L543), a 404 entry-point link (L29), and 6 unbacked/wrong `§` cells (R2 partial).
`project-tasks/124-evidence/t1-refuter-register-attempt2.md` — attempt-2 QA verdict: per-finding status for R1–R4/M1–M6/9 nits, 18 new defects with exact lines and fixes, count and §-column verification, and 8 reproduced PDF claims.
