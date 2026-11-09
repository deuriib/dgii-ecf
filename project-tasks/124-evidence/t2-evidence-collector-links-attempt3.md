# QA — Link integrity of the #124 official-source register (attempt 3 of 3, final)

Independent, from-scratch re-measurement of every URL in **revision 3** of
`project-tasks/124-source-register.md` (760 lines), plus the count, manifest, access-date and
User-Agent claims that the two previous attempts contested. Nothing in the file was trusted: the
`HTTP` column, the entry-point links, the byte sizes, the "Verified count" sentence and the UA recipe
were all re-observed from this machine on 2026-11-09. The prior evidence files were read **only** to
learn what had been claimed before, never as a source of status facts.

**Verdict: FAIL.** The URL layer is completely clean — the attempt-2 blocker is genuinely fixed and
nothing new is broken. All 43 rows are `200` under the per-host UA rule the file itself documents, the corrected entry point
`documentacionSobree-CF.aspx` is `200` (385,863 B, exactly the 18 PDFs + 15 XSDs the register
describes), `marcoLegal.aspx` is `200`, and the stale `documentacionSobre-e-CF.aspx` string is gone
from the file (0 matches) while still returning `404` on the server, which confirms the fix was the
right one. 15/15 manifest `source_url` values are byte-identical, the group counts and the § split
reconcile with the count sentence, the access date is today UTC, no PDF is under 10 KB, and the UA
recipe now describes all three hosts exactly as they behave.

The attempt fails on **two documentation claims**, both reproducible, both one-line fixes, neither
affecting a URL, a status, a count or an access date:

1. **`sha256` coverage is overstated by three.** The file says `sha256` for **the 15** schemas lives in
   `MANIFEST.json` (line 74) and that the manifest hash is "the only content guard, and only for
   **the 15** schemas" (line 756). The manifest carries `sha256` for **12**; its three `excluded`
   entries (`e-CF 31`, `RFCE 32`, `ACECF`) carry only `name` / `reason` / `source_url`.
2. **The scanned-instrument dates are attributed to the wrong place in one of two rows.** The file says
   both dates come from the avisos, "which … date the instrument **in their closing line**" (line 98).
   That is true for LEG-02 and false for LEG-01: Aviso 07-23 states Ley 32-23's date in its **body**
   ("de fecha 16 de mayo de 2023"), while its closing line reads **25 May 2023**.

Both quotes themselves verify verbatim — attempt 2's LEG-02 finding does not reproduce (the aviso's
closing line does carry `a los diecisiete (17) días … (2024)`), so that defect is genuinely closed.

| Gate                                                          | Expected                               | Observed                                                                                                                                                           | Result   |
| ------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Every URL in the file reachable                               | all `2xx` under the UA each host needs | 43/43 rows `200` (40 with the recipe UA; the 3 `www.w3.org` rows `403`→`200` with the plain UA the recipe prescribes); 4/4 prose URLs and 3/3 elided targets `200` | PASS     |
| Register `HTTP` column vs observation                         | `200` on all 43 rows                   | `200` on all 43 rows, 0 disagreements                                                                                                                              | PASS     |
| Corrected entry point `documentacionSobree-CF.aspx`           | `200`                                  | `200`, 385,863 B, 18 PDF + 15 XSD links                                                                                                                            | PASS     |
| Stale `documentacionSobre-e-CF.aspx` gone from the file       | 0 matches                              | 0 matches (`rg`), file has exactly one `Sobree`                                                                                                                    | PASS     |
| `marcoLegal.aspx`                                             | `200`                                  | `200`, 315,728 B                                                                                                                                                   | PASS     |
| Manifest `source_url` byte-for-byte                           | 15/15                                  | 15/15 identical, 0 mismatches                                                                                                                                      | PASS     |
| Manifest content guard                                        | 12/12 `sha256` + `bytes`               | 12/12 identical                                                                                                                                                    | PASS     |
| Group row counts vs tables vs count sentence                  | consistent                             | 7/11/15/4/6 = 43; 32+4+1+6 = 43; § split 33/10                                                                                                                     | PASS     |
| Access date = today UTC                                       | `2026-11-09`                           | `date -u +%F` = `2026-11-09`; 43/43 cells                                                                                                                          | PASS     |
| No `200` PDF under 10 KB                                      | none                                   | smallest 109,973 B (LEG-04, 9 pp)                                                                                                                                  | PASS     |
| UA recipe vs reality, 3 hosts                                 | matches                                | matches on all three, claim by claim                                                                                                                               | PASS     |
| "`sha256` for the 15 schemas lives in `MANIFEST.json`"        | 15 hash-tracked                        | **12** tracked; 3 `excluded` entries have no hash                                                                                                                  | **FAIL** |
| Scanned-instrument dates come from the avisos' "closing line" | true for both                          | true for LEG-02 only; LEG-01's date is in the body                                                                                                                 | **FAIL** |

**Totals: 50 URL targets requested (47 distinct URLs in the file + 3 elided targets), 50 × `200`
under the document's own per-host UA rule; 0 × `404`, 0 × `5xx`. Plus 2 not-reachable probes, 40 UA
matrix probes (8 paths × 5 UA strings), 10 `statusecf` `/` probes, and a 45-URL browser-UA / no-UA
cross-check with 0 status disagreements.**

---

## Commands run (reproduce in this order)

```bash
# 0. Access date the register claims
date -u +%F                                   # → 2026-11-09
date -u +'%F %T %Z'                           # → 2026-11-09 15:30:17 UTC

# 1. Stale-slug grep (attempt-2 blocker): must be absent from the FILE
rg -n -i 'documentacionSobre-e-CF' project-tasks/124-source-register.md   # → no match
rg -n -o -i '[^ (]*Paginas/[A-Za-z0-9._%-]+\.aspx' project-tasks/124-source-register.md
                                              # → line 30 documentacionSobree-CF.aspx, line 32 marcoLegal.aspx
rg -c -i 'Sobree' project-tasks/124-source-register.md                   # → 1

# 2. Row-aware table parse (43 rows; column 4 = Canonical URL, 5 = HTTP, 6 = Access)
python3 /tmp/lv3/extract.py                   # → 43 rows, Counter({'XSD':15,'TEC':11,'LEG':7,'OPS':6,'STD':4})
python3 /tmp/lv3/sec.py                       # → 43 § cells: 33 populated, 10 blank(—)

# 3. Whole-file URL scan (balanced-paren aware, for "…Técnica (XSD)/…" and "…(e-CF)…")
python3 /tmp/lv3/scan.py                      # → 47 occurrences → 47 distinct URLs, 0 false positives
                                              #   hosts: dgii.gov.do 40, statusecf 2, w3.org 4, rfc-editor 1

# 4. Per-URL measurement, recipe UA for dgii hosts (50 targets = 47 + 3 elided)
python3 /tmp/lv3/drive.py                     # → 46 × 200, 4 × 403 (all four www.w3.org URLs)
                                              #   writes /tmp/lv3/{results.tsv,bodies/,heads/}

# 5. The four W3C URLs re-fetched with a plain curl UA (as the recipe prescribes)
curl -sS -A 'curl/8.18.0' -L -o bodies/STD-01.plain -D heads/STD-01.plain \
     -w '%{http_code}\t%{content_type}\t%{url_effective}\t%{size_download}\n' \
     'https://www.w3.org/TR/xmldsig-core1/'   # → 200 402341 (+ STD-02, STD-03, STD-02b: 200)

# 6. UA matrix: 5 UA strings × 8 paths on 3 hosts (+ statusecf / with and without -L)
python3 /tmp/lv3/ua_matrix.py                 # → /tmp/lv3/ua.matrix

# 7. Browser-UA vs no-UA divergence across every dgii/statusecf URL (45 URLs)
#    (this is the test that exposed the 404 slug last time)
python3 - <<'PY'                              # → 0 status disagreements, 2 HTML byte-only diffs
# curl -A "$UA_B" … vs curl -H 'User-Agent:' … on every dgii.gov.do + statusecf URL
PY

# 8. Plain curl UA across every dgii/statusecf URL (43 dgii → 403, 2 statusecf → 200)
python3 - <<'PY'                              # → {'403': 43, '200': 2}
PY

# 9. Entry-point link census: does EP-1 really list 18 PDFs + all 15 XSDs?
curl -sS -A "$UA_B" -L -o ep1_browser.html '…/Paginas/documentacionSobree-CF.aspx'
grep -oiE 'href="[^"]*\.pdf"' ep1_browser.html | sort -u | wc -l   # → 18
grep -oiE 'href="[^"]*\.xsd"' ep1_browser.html | sort -u | wc -l   # → 15
# which slug does DGII itself link from Marco Legal?
curl -sS -A "$UA_B" -L -o ml.html '…/Paginas/marcoLegal.aspx'
grep -oiE 'href="[^"]*[Dd]ocumentaci[^"]*\.aspx"' ml.html
                                              # → …/Paginas/documentacionSobreE-CF.aspx  (200)

# 10. Manifest reconciliation: 15 source_url byte-for-byte + 12 sha256/bytes
python3 - <<'PY'
import json,hashlib      # compare register XSD rows against schemas[]+excluded[], then hash bodies
PY

# 11. PDF page counts, text layer, <10 KB rule (the register's own recipe)
uv run --quiet --with pypdf python /tmp/lv3/pdfs.py      # pypdf 7.0.0
uv run --quiet --with pypdf python /tmp/lv3/dates.py     # full text of Aviso 07-23 and 20-24

# 12. Not-reachable-table claims re-probed
curl -sS -A "$UA_B" 'https://ecf.dgii.gov.do/testecf/autenticacion/swagger/index.html'
                                              # → curl: (1) Received HTTP/0.9 when not allowed
curl -sS -A "$UA_B" -o fbody -w '%{http_code}\n' '…/Documentacin%20sobre%20eCF/'
                                              # → 401, body "401 UNAUTHORIZED"
```

Raw captures: `/tmp/lv3/{results.tsv,ua.matrix,ua_vs_noua.json,plainua.json,std_plain.tsv,pdfs.json,`
`bodies/,heads/,ep1_browser.html,ep1_noua.html,ml.html}`.

---

## Every URL, re-measured

50 targets. The 43 rows carry the register's own IDs; `EP-1`/`EP-2` are the two entry-point links,
`TEC-11n` is the `statusecf` help link quoted in §B's note, `STD-02b` is the `http://` C14N URI quoted
in step 4 (an algorithm-URI quote, not a link), and `P-1…P-3` are the three elided targets whose
register prose asserts `200` (`.../2023/07-23.pdf`, `.../2024/20-24.pdf`, `.../Norma06-18.pdf`),
resolved against their own bases. `effective URL` is `same` when no redirect occurred.

Bold is the status under the User-Agent the document prescribes for that host (browser UA for
`dgii.gov.do`, any UA for `statusecf`, plain UA for `www.w3.org`); the `bytes` column is the size of
the `200` body.

| row     | URL                                                                                                                                                                                                                                                                  | browser UA (recipe) | plain `curl/8.18.0` | no UA header | effective URL                                    | content type                   | bytes (200 body) |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------- | ------------ | ------------------------------------------------ | ------------------------------ | ---------------- |
| EP-1    | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/documentacionSobree-CF.aspx                                                                                                                                          | **200**             | 403                 | 200          | same                                             | text/html; charset=utf-8       | 385,863          |
| EP-2    | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/marcoLegal.aspx                                                                                                                                                      | **200**             | 403                 | 200          | same                                             | text/html; charset=utf-8       | 315,728          |
| LEG-01  | https://dgii.gov.do/legislacion/leyesTributarias/Documents/Otras%20Leyes%20de%20Inter%C3%A9s/32-23.pdf                                                                                                                                                               | **200**             | 403                 | 200          | same                                             | application/pdf                | 10,685,026       |
| LEG-02  | https://dgii.gov.do/legislacion/decretos/Documents/2024/Decreto587-24.pdf                                                                                                                                                                                            | **200**             | 403                 | 200          | same                                             | application/pdf                | 9,317,697        |
| LEG-03  | https://dgii.gov.do/legislacion/normasGenerales/Documents/NG%20sobre%20Comprobantes%20Fiscales/Norma01-20.pdf                                                                                                                                                        | **200**             | 403                 | 200          | same                                             | application/pdf                | 247,981          |
| LEG-04  | https://dgii.gov.do/legislacion/normasGenerales/Documents/NG%20sobre%20Comprobantes%20Fiscales/Norma05-19.pdf                                                                                                                                                        | **200**             | 403                 | 200          | same                                             | application/pdf                | 109,973          |
| LEG-05  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documents/Marco%20Legal/Resolucion%20035-2020.pdf                                                                                                                            | **200**             | 403                 | 200          | same                                             | application/pdf                | 1,074,731        |
| LEG-06  | https://dgii.gov.do/legislacion/leyesTributarias/Documents/Otras%20Leyes%20de%20Inter%C3%A9s/126-02.pdf                                                                                                                                                              | **200**             | 403                 | 200          | same                                             | application/pdf                | 1,711,220        |
| LEG-07  | https://dgii.gov.do/publicacionesOficiales/avisosInformativos/Documents/2019/24-19.pdf                                                                                                                                                                               | **200**             | 403                 | 200          | same                                             | application/pdf                | 187,229          |
| TEC-01  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Informe%20T%C3%A9cnico%20e-CF%20v1.0.pdf                                                            | **200**             | 403                 | 200          | same                                             | application/pdf                | 1,821,456        |
| TEC-02  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Descripcion%20Tecnica%20Servicios%20DGII.pdf                                                        | **200**             | 403                 | 200          | same                                             | application/pdf                | 2,451,054        |
| TEC-03  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Descripcion%20Tecnica%20Emisores%20Electronicos.pdf                                                 | **200**             | 403                 | 200          | same                                             | application/pdf                | 1,648,404        |
| TEC-04  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Estandares%20de%20Comportamiento%20Esperado%20en%20la%20Integracion.pdf                             | **200**             | 403                 | 200          | same                                             | application/pdf                | 395,573          |
| TEC-05  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Comprobante%20Fiscal%20Electr%C3%B3nico%20(e-CF)%20V1.0.pdf                                                              | **200**             | 403                 | 200          | same                                             | application/pdf                | 2,353,589        |
| TEC-06  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Resumen%20Factura%20Consumo%20Electr%C3%B3nica%20v1.0.pdf                                                                | **200**             | 403                 | 200          | same                                             | application/pdf                | 281,618          |
| TEC-07  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Aprobaci%C3%B3n%20Comercial%20v1.0.pdf                                                                                   | **200**             | 403                 | 200          | same                                             | application/pdf                | 217,252          |
| TEC-08  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Anulaci%C3%B3n%20de%20e-NCF%20v1.0.pdf                                                                                   | **200**             | 403                 | 200          | same                                             | application/pdf                | 506,229          |
| TEC-09  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Acuse%20de%20Recibo%20v%201.0.pdf                                                                                        | **200**             | 403                 | 200          | same                                             | application/pdf                | 197,791          |
| TEC-10  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Firmado%20de%20e-CF.pdf                                                                | **200**             | 403                 | 200          | same                                             | application/pdf                | 1,283,845        |
| TEC-11  | https://statusecf.dgii.gov.do/api-docs/v1/definition.json                                                                                                                                                                                                            | **200**             | 200                 | 200          | same                                             | application/json;charset=utf-8 | 2,116            |
| XSD-01  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2032%20v.1.0.xsd                                                                                   | **200**             | 403                 | 200          | same                                             | text/xml                       | 122,998          |
| XSD-02  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2033%20v.1.0.xsd                                                                                   | **200**             | 403                 | 200          | same                                             | text/xml                       | 124,484          |
| XSD-03  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2034%20v.1.0.xsd                                                                                   | **200**             | 403                 | 200          | same                                             | text/xml                       | 122,024          |
| XSD-04  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2041%20v.1.0.xsd                                                                                   | **200**             | 403                 | 200          | same                                             | text/xml                       | 111,171          |
| XSD-05  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2043%20v.1.0.xsd                                                                                   | **200**             | 403                 | 200          | same                                             | text/xml                       | 96,111           |
| XSD-06  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2044%20v.1.0.xsd                                                                                   | **200**             | 403                 | 200          | same                                             | text/xml                       | 114,302          |
| XSD-07  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2045%20v.1.0.xsd                                                                                   | **200**             | 403                 | 200          | same                                             | text/xml                       | 121,785          |
| XSD-08  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2046%20v.1.0.xsd                                                                                   | **200**             | 403                 | 200          | same                                             | text/xml                       | 115,951          |
| XSD-09  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2047%20v.1.0.xsd                                                                                   | **200**             | 403                 | 200          | same                                             | text/xml                       | 101,382          |
| XSD-10  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/ANECF%20v.1.0.xsd                                                                                       | **200**             | 403                 | 200          | same                                             | text/xml                       | 5,160            |
| XSD-11  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/ARECF%20v1.0.xsd                                                                                        | **200**             | 403                 | 200          | same                                             | text/xml                       | 2,871            |
| XSD-12  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/Semilla%20v.1.0.xsd                                                                                     | **200**             | 403                 | 200          | same                                             | text/xml                       | 487              |
| XSD-13  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2031%20v.1.0.xsd                                                                                   | **200**             | 403                 | 200          | same                                             | text/xml                       | 123,019          |
| XSD-14  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/RFCE%2032%20v.1.0.xsd                                                                                   | **200**             | 403                 | 200          | same                                             | text/xml                       | 15,325           |
| XSD-15  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/ACECF%20v.1.0.xsd                                                                                       | **200**             | 403                 | 200          | same                                             | text/xml                       | 3,567            |
| STD-01  | https://www.w3.org/TR/xmldsig-core1/                                                                                                                                                                                                                                 | **403**ᵃ            | 200                 | 200          | same                                             | text/html; charset=utf-8       | 402,341          |
| STD-02  | https://www.w3.org/TR/2001/REC-xml-c14n-20010315                                                                                                                                                                                                                     | **403**ᵃ            | 200                 | 200          | same                                             | text/html; charset=iso-8859-1  | 76,370           |
| STD-03  | https://www.w3.org/TR/xmlenc-core1/                                                                                                                                                                                                                                  | **403**ᵃ            | 200                 | 200          | same                                             | text/html; charset=utf-8       | 336,750          |
| STD-04  | https://www.rfc-editor.org/rfc/rfc6931                                                                                                                                                                                                                               | **200**             | 200                 | 200          | https://www.rfc-editor.org/info/rfc6931/         | text/html;charset=utf-8        | 511,023          |
| OPS-01  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaciones%20Proceso%20de%20Certificaci%C3%B3n%20FE/Proceso%20de%20Certificacion%20para%20ser%20Emisor%20Electronico.pdf                     | **200**             | 403                 | 200          | same                                             | application/pdf                | 1,678,092        |
| OPS-02  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaciones%20Proceso%20de%20Certificaci%C3%B3n%20FE/Proceso-Certificacion-EmisorElectronico-Proveedor-Servicios-FECertificado.pdf            | **200**             | 403                 | 200          | same                                             | application/pdf                | 968,165          |
| OPS-03  | https://dgii.gov.do/legislacion/normasGenerales/Documents/NG%20sobre%20Comprobantes%20Fiscales/Norma10-21.pdf                                                                                                                                                        | **200**             | 403                 | 200          | same                                             | application/pdf                | 241,769          |
| OPS-04  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Instructivo%20de%20Contingencia%20de%20FE.pdf                                          | **200**             | 403                 | 200          | same                                             | application/pdf                | 578,774          |
| OPS-05  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Instructivo%20App%20Firma%20Digital.pdf                                                | **200**             | 403                 | 200          | same                                             | application/pdf                | 326,451          |
| OPS-06  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Instructivo%20Delegaciones%20de%20Roles%20de%20Facturaci%C3%B3n%20Electr%C3%B3nica.pdf | **200**             | 403                 | 200          | same                                             | application/pdf                | 1,594,778        |
| P-1     | https://dgii.gov.do/publicacionesOficiales/avisosInformativos/Documents/2023/07-23.pdf                                                                                                                                                                               | **200**             | 403                 | 200          | same                                             | application/pdf                | 214,601          |
| P-2     | https://dgii.gov.do/publicacionesOficiales/avisosInformativos/Documents/2024/20-24.pdf                                                                                                                                                                               | **200**             | 403                 | 200          | same                                             | application/pdf                | 172,630          |
| P-3     | https://dgii.gov.do/legislacion/normasGenerales/Documents/NG%20sobre%20Comprobantes%20Fiscales/Norma06-18.pdf                                                                                                                                                        | **200**             | 403                 | 200          | same                                             | application/pdf                | 299,075          |
| TEC-11n | https://statusecf.dgii.gov.do/help/index.html                                                                                                                                                                                                                        | **200**             | 200                 | 200          | same                                             | text/html;charset=utf-8        | 4,841            |
| STD-02b | http://www.w3.org/TR/2001/REC-xml-c14n-20010315                                                                                                                                                                                                                      | **403**ᵃ            | 200                 | 200          | https://www.w3.org/TR/2001/REC-xml-c14n-20010315 | text/html; charset=iso-8859-1  | 76,370           |

ᵃ `www.w3.org` refuses the recipe's browser UA on this network (`403`, 5,608–5,668 B block page) and
serves the document to a plain UA — the register documents this and says the `STD-*` rows were verified
with a plain UA. Re-fetched that way, all four are `200` with the sizes shown, so the row status is
`200` as recorded and the `403` is W3C edge behaviour, not a broken link.

Notes on the table:

- **No new URL appeared and none disappeared.** Revision 3's URL set is exactly attempt 2's: 47 distinct
  URLs, same hosts (`dgii.gov.do`, `statusecf.dgii.gov.do`, `www.w3.org`, `www.rfc-editor.org`).
- **The one changed URL is the fix and it holds.** `EP-1` is now
  `…/Paginas/documentacionSobree-CF.aspx` → `200`, 385,863 B. Attempt 2 measured the stale
  `documentacionSobre-e-CF.aspx` at `404`, 754 B.
- **Byte counts are unchanged from attempt 2 on 45 of 50 targets.** The 5 that differ are fully
  explained: `EP-1` (the fixed slug: 754 → 385,863 B) and `STD-01/02/03/02b`, which attempt 2 measured
  with a plain UA and this pass measured first with the recipe's browser UA (`403` block page);
  re-fetched with a plain UA they are 402,341 / 76,370 / 76,370 / 336,750 B — identical to attempt 2.
  **No content drift between attempts.**
- Only two redirects, both already documented: `STD-04` →
  `https://www.rfc-editor.org/info/rfc6931/` (301, same document), and `STD-02b` `http:` → `https:`.
- Content types are coherent: `application/pdf` × 26, `text/xml` × 15 (the XSDs), `application/json`
  for TEC-11, `text/html` × 8. No `text/plain`, and no HTML error page served with `200`.
- `TEC-11` was parsed as JSON and matches every claim the register makes about it: `openapi` `3.0.1`,
  `info.title` "FE Estatus Servicios API", `info.version` `v1`, exactly the three paths
  `/api/EstatusServicios/{ObtenerEstatus,ObtenerVentanasMantenimiento,VerificarEstado}`, the `Ambiente`
  query parameter with `enum [1,2,3]` and **no labels**, and `securitySchemes.ApiKey`
  (`type: apiKey`, `in: header`, `name: Authorization`, description `"Authorization: ApiKey {key}"`).
- The 3 elided `P-*` targets are all `200`. The 3 `upstream-invalid/` copies on disk are byte-identical
  to what DGII serves now — `e-CF 31` 123,019 B, `RFCE 32` 15,325 B, `ACECF` 3,567 B, equal `sha256`
  before and after download.

## Entry points — the attempt-2 blocker, re-tested from zero

| Check                                         | Expected                                                       | Observed                                                                                                                                                          |
| --------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File contains the corrected slug              | `documentacionSobree-CF.aspx`                                  | **1 occurrence (line 30)**; `rg -c -i Sobree` = 1                                                                                                                 |
| File contains the stale slug                  | 0 occurrences                                                  | **0** (`rg` returns nothing)                                                                                                                                      |
| Corrected slug responds                       | `200`                                                          | **`200`**, `text/html; charset=utf-8`, 385,863 B, 3/3 identical sizes                                                                                             |
| Stale slug responds (server side)             | `404` (it is genuinely wrong)                                  | **`404`**, 754 B, 3/3 with browser UA **and** `404` with no UA header                                                                                             |
| `marcoLegal.aspx` responds                    | `200`                                                          | **`200`**, 315,728 B                                                                                                                                              |
| EP-1 lists what the register says             | "18 PDF links + all 15 XSDs"                                   | **exactly 18 unique `.pdf` hrefs + 15 unique `.xsd` hrefs**                                                                                                       |
| Those 15 XSD links are the register's 15 rows | 15/15                                                          | **15/15** after percent-decoding (the page emits raw spaces/accents; the register's encoded form is the same path and fetches `200` with the manifest's `sha256`) |
| EP-2 lists what the register says             | Leyes, Decretos, Normas Generales, Resolución 035-2020, Avisos | **all five labels present** on the page                                                                                                                           |
| DGII's own link to the e-CF docs page         | agrees with the corrected slug                                 | `…/Paginas/documentacionSobreE-CF.aspx` → `200` (case/`E` variant of the same page)                                                                               |

The interrupted-resume question does not arise for the slug: the corrected form is the only form in the
file, and the stale string survives nowhere — not in prose, not in the revision note, not in a
judgement call.

## User-Agent matrix (all three hosts, re-measured)

`curl/8.18.0`, `python-requests/2.31.0` and a `Googlebot/2.1` string are the bot-ish cases; Chrome 126
is the register's recipe UA; `noUA` sends **no `User-Agent` header at all**. No `-L`, so a bare
`302`/`301` would be visible.

| probe                                        | `curl/8.18.0` | `python-requests` | `Googlebot` | Chrome 126 | no UA   |
| -------------------------------------------- | ------------- | ----------------- | ----------- | ---------- | ------- |
| `dgii.gov.do` · LEG-01 PDF                   | 403           | 403               | 403         | **200**    | **200** |
| `dgii.gov.do` · TEC-02 PDF                   | 403           | 403               | 403         | 200        | 200     |
| `dgii.gov.do` · XSD-12                       | 403           | 403               | 403         | 200        | 200     |
| `dgii.gov.do` · EP-2 page                    | 403           | 403               | 403         | 200        | 200     |
| `dgii.gov.do` · EP-1 page (corrected)        | 403           | 403               | 403         | 200        | 200     |
| `statusecf` · `/api-docs/v1/definition.json` | 200           | 200               | 200         | 200        | 200     |
| `statusecf` · `/help/index.html`             | 200           | 200               | 200         | 200        | 200     |
| `statusecf` · `/` (no `-L`)                  | 302           | 302               | 302         | 302        | 302     |
| `statusecf` · `/` (with `-L`)                | 200           | 200               | 200         | 200        | 200     |
| `www.w3.org` · STD-01                        | 200           | 200               | 200         | **403**    | 200     |
| `www.rfc-editor.org` · STD-04 (no `-L`)      | 301           | 301               | 301         | 301        | 301     |

Exhaustive, not sampled: the plain `curl/8.18.0` UA was sent to **every** `dgii.gov.do` and
`statusecf.dgii.gov.do` target (45 URLs) — **43 × `403` on `dgii.gov.do`, 2 × `200` on `statusecf`** —
and the browser-UA / no-UA pair was compared on the same 45 URLs: **0 status disagreements**, with the
only field differences being the two HTML pages' byte counts (`EP-1` 385,863 vs 384,119; `EP-2` 315,728
vs 313,965) — both `200`; the no-UA response carries SharePoint's `class="ms-isBot"` on `<html>` and
serves the **identical 33-document link set**. That is a markup variant, not a block.

### The recipe as written, claim by claim

| Register claim (revision 3)                                                                                               | Observation                                                                                                                              | Verdict                                                                     |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| "`dgii.gov.do` rejects known bot User-Agent strings. `curl/8.18.0` and `python-requests/2.31.0` both get `403`"           | `403` for both on every path; also for `Googlebot`; 43/43 with plain curl                                                                | accurate                                                                    |
| "a browser UA gets `200`"                                                                                                 | Chrome 126 → `200` on all 40 `dgii.gov.do` targets                                                                                       | accurate                                                                    |
| "A request with **no `User-Agent` header at all also gets `200`**"                                                        | no-UA → `200` on all 40                                                                                                                  | accurate                                                                    |
| "the block is UA-string blacklisting, not a browser requirement"                                                          | consistent: bot strings `403`, browser and absent UA served; the WAF answers `403`, never `200`-with-error                               | accurate                                                                    |
| "`statusecf.dgii.gov.do` serves any User-Agent … on `/api-docs/v1/definition.json`, `/help/index.html` and `/`"           | `200` for all 5 UA cases on the JSON and the help page; `/` is a `302`→`/help/index.html` chain that lands `200` under the recipe's `-L` | accurate as written (the `200` on `/` requires `-L`, which the recipe uses) |
| "`www.w3.org` … answers `403` to that browser UA on this network and `200` to a plain curl UA or to no UA at all"         | `403` / `200` / `200` reproduced on all four W3C URLs                                                                                    | accurate                                                                    |
| "The `STD-*` rows were verified with a plain UA"                                                                          | with `curl/8.18.0`: 200 / 200 / 200 / 200, sizes 402,341 · 76,370 · 336,750 · 76,370                                                     | accurate                                                                    |
| "This works for TEC-01 (53 pp), TEC-02 (47 pp), TEC-03 (13 pp), TEC-04 (13 pp), TEC-05 (89 pp), TEC-10 and LEG-03/LEG-07" | all eight extract text; page counts 53 / 47 / 13 / 13 / 89 / 20 / 10 / 1                                                                 | accurate                                                                    |
| "**Two rows are scanned images with no text layer** … LEG-01 and LEG-02 — 29 pages, **0** extractable characters"         | LEG-01 0 chars (33 pp), LEG-02 0 chars (29 pp)                                                                                           | accurate                                                                    |
| the `uv run --with pypdf` extraction snippet                                                                              | runs verbatim (pypdf 7.0.0) and prints text                                                                                              | accurate                                                                    |

Both attempt-1 UA defects stay closed: the prose is accurate for all three hosts, and the inverse
`www.w3.org` behaviour is documented rather than hidden.

## Manifest reconciliation (15 `source_url` values, byte-for-byte)

| Check                                                            | Expected                                                                                                | Observed                                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Register XSD row URL `==` `MANIFEST.json` `source_url`           | 15/15                                                                                                   | **15/15 identical, 0 mismatches**, both directions (no manifest-only, no register-only URL) |
| `sha256(download)` `==` manifest `sha256`                        | 12/12 pinned                                                                                            | **12/12 identical**                                                                         |
| `bytes(download)` `==` manifest `bytes`                          | 12/12 pinned                                                                                            | **12/12 identical** (XSD-01 122,998 … XSD-12 487)                                           |
| `excluded` entries carry no hash (by design)                     | 3                                                                                                       | confirmed: `name` / `reason` / `source_url` only                                            |
| Manifest composition claim ("12 in `schemas` + 3 in `excluded`") | 12 + 3 = 15                                                                                             | `len(schemas)=12`, `len(excluded)=3`                                                        |
| Register's summary of the three `reason` strings                 | invalid pattern facets on `RFCE 32` + `ACECF`; missing `IndicadorServicioTodoIncluidoType` on `e-CF 31` | the three `reason` strings say exactly that                                                 |
| `upstream-invalid/` copies match what is served                  | 3                                                                                                       | 3 files, byte-identical to the downloads (`sha256` equal)                                   |

The 15 `source_url` values are therefore verified **and** unmodified, and the 12 pinned fixtures are
content-identical to what DGII serves today. (What the file claims about _how many_ of the 15 are hash
-tracked is the discrepancy below.)

## Group counts and the § split

| Group                               | Rows in its table  | Register's "Verified count" claim                                                                               | Match                             |
| ----------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| A — `LEG-01…07`                     | 7                  | "5 legal/normative (`LEG-03`…`LEG-07`)" + LEG-01/LEG-02 as identity-only                                        | ✓ 5 + 2                           |
| B — `TEC-01…11`                     | 11                 | "10 technical … (`TEC-01`…`TEC-10`)" + "1 machine-readable service specification — `TEC-11`"                    | ✓ 10 + 1                          |
| C — `XSD-01…15`                     | 15                 | "13 schemas … (12 compile …, `XSD-15` does not compile but is cited)" + XSD-13/14 as traceability-only          | ✓ 13 + 2                          |
| D — `STD-01…04`                     | 4                  | "4 XML/XMLDSig standards (`STD`)"                                                                               | ✓                                 |
| E — `OPS-01…06`                     | 6                  | "6 operational/certification manuals"                                                                           | ✓                                 |
| A–D subtotal                        | 37                 | "37 rows under A–D (32 claim-bearing documents + 4 identity/traceability rows + 1 service spec)"                | ✓ 32+4+1 = 37; 7+11+15+4 = 37     |
| Total                               | 43                 | "**43 URLs verified `200` on 2026-11-09**" / "43 `200`s"                                                        | ✓ 32+4+1+6 = 43; 7+11+15+4+6 = 43 |
| `§`-carrying rows                   | 33 measured        | 32 claim-bearing + `TEC-11` (service spec, counted separately)                                                  | ✓ 33 − 1 = 32                     |
| Blank (`—`) `§` cells               | 10 measured        | "4 rows carried for identity or traceability only" (LEG-01, LEG-02, XSD-13, XSD-14) + "the six `OPS-*` manuals" | ✓ 4 + 6 = 10                      |
| `HTTP` cells                        | 43/43 `200`        | `200` on every row                                                                                              | ✓                                 |
| Access cells                        | 43/43 `2026-11-09` | "Access date for every row: 2026-11-09"                                                                         | ✓                                 |
| IDs referenced anywhere in the file | 43 distinct        | 43 rows; no ID without a row, no duplicate URL among rows                                                       | ✓                                 |

One measurement nuance, because it changes the number a mechanical count produces: LEG-02's blank `§`
cell **contains** the `§` glyph in its justification ("— (contingency: TEC-04 §5–6 + TEC-01 §19, no
ground-truth §)"), so `grep -c '§'` over the table rows yields **34**, not 33. The cell is still a blank
claim — it starts with `—` and says why — and the register's own sentences ("neither row carries a `§`",
"the four identity/traceability rows") are consistent with 33/10. Counted by first character rather than
by glyph: **33 §-carrying, 10 blank**.

Every number in the "Verified count" section is arithmetically consistent with the tables, with the §
split, and with the measured totals. The two prose URLs that are not rows (`EP-1`/`EP-2`, `TEC-11n`,
`STD-02b`) sit outside the 43, which is why they neither inflate nor falsify the count sentence.

## Access date and the PDF sanity check

- `date -u +%F` → **`2026-11-09`**; `date -u` at measurement time → `2026-11-09 15:30 UTC`.
- All 43 `Access` cells read `2026-11-09`; the three prose uses (lines 27, 77, 604) also read
  `2026-11-09`. No other access-style date appears.
- **No `200` PDF is under 10 KB.** Smallest: LEG-04, 109,973 B (9 pp). The 26 PDFs range from 109,973 B
  to 10,685,026 B and every one parses with `pypdf` (7.0.0); page counts reproduce the register's own
  claims exactly (TEC-01 53, TEC-02 47, TEC-03 13, TEC-04 13, TEC-05 89, LEG-02 29, LEG-01 33, OPS-04
  16, OPS-05 4).
- `OPS-04`'s PDF metadata `/Title` still reads `Instructivo Facturador Gratuito de FE` (a DGII template
  leftover) while page 1 reads _Instructivo de Contingencia de Facturación Electrónica_; `P-1`'s is
  `Certificación DGII Color`. Both are DGII metadata sloppiness, not register defects.

## Not-reachable table and other host-level claims

| Claim                                                                                                                | Expected                           | Observed                                                                                                                                     | Verdict                             |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `ecf.dgii.gov.do/{ambiente}/{servicio}/swagger/…` "does not return a document; curl aborts with `Received HTTP/0.9`" | transport-level abort, no document | `curl: (1) Received HTTP/0.9 when not allowed` on two `…/swagger/index.html` paths; `404` (empty body) on a `…/swagger/v1/swagger.json` path | accurate — no document is published |
| "DGII folder listings answer `401`"                                                                                  | `401`                              | `401`, 16-byte body `401 UNAUTHORIZED`; subfolder listings `302` → `Forms/AllItems.aspx` → `401`                                             | accurate                            |
| "DGII folder listings answer `401`" (browser UA _and_ no UA)                                                         | same                               | `401` in both modes                                                                                                                          | accurate                            |
| `statusecf` `/`                                                                                                      | reachable                          | `302` → `/help/index.html`, `200` with `-L` for every UA                                                                                     | accurate (recipe uses `-L`)         |

## Discrepancies (expected vs actual)

### D1 — `sha256` coverage is overstated by three (LOW, documentation only)

- **Where**: line 74 (`§Scope and method`) — "`sha256` for **the 15** schemas lives in `MANIFEST.json`
  — if a schema changes, the manifest hash is what detects it"; line 164–165 (`§C`) — "Byte-identity is
  tracked by `sha256` in the manifest"; line 756 (`Residual risk` #4) — "`MANIFEST.json` sha256 is the
  only content guard, and **only for the 15 schemas**".
- **Expected**: 15 hash-tracked schemas.
- **Actual**: `MANIFEST.json` holds `sha256` for **12** entries (the `schemas` array). Its three
  `excluded` entries — `e-CF 31` (XSD-13), `RFCE 32` (XSD-14), `ACECF` (XSD-15) — carry exactly
  `name`, `reason`, `source_url` and **no hash and no byte count**. Consequence: the stated detector
  does not exist for those three; a silent republish of `ACECF v.1.0.xsd` — which the register cites at
  step 8 for the `Estado` `{1,2}` domain (§9), not merely for traceability — would be caught by nothing
  in this artifact.
- **Fix**: change "the 15 schemas" to "the **12** pinned schemas" and add the qualifier, e.g. _"`sha256`
  for the 12 pinned schemas lives in `MANIFEST.json`; the three `excluded` entries carry only a
  `reason`, so a change to `e-CF 31`, `RFCE 32` or `ACECF` is not hash-detected."_ Same substitution in
  Residual risk #4. No URL, status or count changes.

### D2 — LEG-01's date is attributed to a closing line it is not in (LOW, documentation only)

- **Where**: lines 97–99 (`§A` notes) — "Their dates come from DGII's own avisos, which are
  text-extractable and date the instrument **in their closing line**: LEG-01 = 16 May 2023 (Aviso
  07-23 … "la publicación oficial de la Ley no. 32-23 … de fecha 16 de mayo de 2023"); LEG-02 = 17 Oct
  2024 (Aviso 20-24 … "a los diecisiete (17) días del mes de octubre del año dos mil veinticuatro
  (2024)")".
- **Expected**: both dates stated in the avisos' closing lines.
- **Actual**: verified by full-text extraction.
  - **LEG-02 ✅** — Aviso 20-24's closing line is verbatim `a los diecisiete (17) días del mes de octubre
del año dos mil veinticuatro (2024).` The quote is exact and the row's `17 Oct 2024` follows. Attempt
    2's finding ("no day/month date in that aviso") **does not reproduce**; the defect it reported is
    genuinely fixed.
  - **LEG-01 ❌** — the quoted sentence sits in Aviso 07-23's **opening paragraph** (the preamble that begins
    _"La Dirección General de Impuestos Internos informa…"_), not in its closing line:
    `la publicación oficial de la Ley no. 32-23 de Facturación Electrónica de la República Dominicana, de
fecha 16 de mayo de 2023.` The same aviso's closing line reads `a los veinticinco (25) días del mes
de mayo del año dos mil veintitrés (2023).` A reader who applies the stated method to LEG-01 gets
    **25 May 2023**, nine days off the row's `16 May 2023`. (The row's date is right; the sentence's
    location claim is wrong.)
- **Fix**: drop the shared "in their closing line" clause and attribute per row, e.g. _"Their dates come
  from DGII's own text-extractable avisos: LEG-01's date from Aviso 07-23's opening paragraph
  ('…de fecha 16 de mayo de 2023'), LEG-02's from Aviso 20-24's closing line ('a los diecisiete (17)
  días…')."_ No date in the row set changes.

Nothing else in the file contradicts its own measurement. In particular the attempt-3 change list holds
up: one URL changed (the entry point), and no `HTTP` cell and no access date moved (both re-measured;
per-row titles were sampled, not exhaustively diffed); the
QR/URL character set is listed as **28** characters and I count 28 with endpoints `%20`(space) …
`%60`(backtick), so that census is internally consistent; "the § cells of the two scanned instruments"
and "neither row carries a `§`" agree with the measured `—` cells; and "adds TEC-01 §19 to the
contingency scope" is present in LEG-02's § cell, step 2 and the §F contingency row.

## Did the interrupted-and-resumed revision leave an inconsistency?

**In the row set: no.** The row set is coherent in every dimension I can measure — 43 rows, 43 distinct
URLs, no ID referenced without a row, no URL duplicated across rows, all 43 `HTTP` cells `200` and all
43 `Access` cells `2026-11-09`, group counts 7/11/15/4/6 reconciling with the count sentence, the §
split 33/10 reconciling with the "32 claim-bearing + 4 identity/traceability + 6 OPS" sentence, and
15/15 manifest `source_url` values unchanged. No half-applied row edit, no orphaned row, no stale
count, no duplicated or dropped table entry, and the corrected slug is the only slug in the file.

**In the prose: yes — and there are three signals, of which D2 is only one.**

- **O1 (clearest artifact, verified by reading both passages; outside the URL remit).** Step 2 still
  says the contingency article numbers "come from **TEC-04's extractable text**" (lines 304–305, framed
  as exclusive), while Residual risk #2 (line 750) says they are "the ones **TEC-04 and TEC-01 §19
  quote themselves**". The revision added TEC-01 §19 as a co-source two paragraphs later (307–312,
  verified: TEC-01 §19 really does read _"De conformidad con los artículos 40 al 43 del Reglamento …
  Decreto núm. 587-24"_ and carries both clocks) but left the older single-source sentence in place.
  Both sentences are individually true of TEC-04; they disagree about the source **set**. Fix: make
  lines 304–305 read "…and they come from TEC-04's and TEC-01 §19's extractable text". No verdict
  impact — it is an incompleteness, not a false attribution.
- **D2 is the strongest artifact**, because it changes a fact's stated _location_. The attempt-3
  revision rewrote the LEG-01/LEG-02 provenance sentence to quote both avisos. The LEG-02 half was
  written from the closing line and is exact; the LEG-01 half was patched with a quote taken from the
  aviso's body while the shared descriptor stayed "closing line". That is exactly the shape a
  stop-and-resume leaves: one branch of a shared sentence updated from a different source location, the
  shared qualifier never reconciled.
- **D1** is a separate, coarser overstatement (15 vs 12 hash-tracked) rather than a mid-edit artifact,
  but it is the same class of defect: a scope claim about the artifact's own bookkeeping that the
  artifact does not satisfy.

All three are prose-only one-line edits in `project-tasks/124-source-register.md`; none touches a URL, a
status, a byte count, a manifest value, the access date or the frozen row set.

## Not tested / coverage gaps

- Link liveness, content type, redirect, byte size, page count and entry-page link census only. Article
  numbers and field names that the register claims from PDF text were **not** re-derived today.
- Per-row "title-consistent" was not re-established for all 26 PDFs; the sampled titles (TEC-01,
  TEC-05, TEC-06, TEC-10, OPS-01, OPS-02, OPS-06, and the two avisos) all match their rows.
- The 9 `e-CF`-type XSDs share one root element (`ECF`); per-type identity rests on file name, DGII's
  listing label and the manifest `sha256`, not on a distinct root element. No per-type structural diff.
- `fc.dgii.gov.do/{ambiente}/consultarfce/...` and the `ecf.dgii.gov.do` service paths quoted in steps
  3–10 are authenticated service endpoints, not documents; they are not link-checkable and were not
  requested.
- The `mise run verify-signing-*` / `xmllint` gates were not run: they are the SDK's build gates, not
  link checks.
- A `200` is a snapshot, not a content guarantee: DGII republishes in place, and for the three
  non-compiling schemas nothing is hash-tracked (D1).

---

**QA Agent**: EvidenceQA · **Evidence date**: 2026-11-09 (15:25–15:35 UTC) · **Attempt**: 3 of 3 ·
**Verdict**: FAIL — 2 LOW documentation discrepancies, 0 URL-level defects ·
**Raw captures**: `/tmp/lv3/`
