# QA — Link integrity of the #124 official-source register (attempt 2 of 3)

Independent re-measurement of every URL in revision 2 of `project-tasks/124-source-register.md`
(707 lines). The register's `HTTP` column was not trusted; every status below is an observation made
today from this machine. Attempt 1's two prose findings were re-tested from scratch, not re-read.

**Verdict: FAIL.** Both User-Agent prose defects from attempt 1 are genuinely fixed and the corrected
recipe matches observation item by item. All 43 register rows are still `200` with unchanged byte
counts, 15/15 manifest `source_url` values are byte-identical, the group counts and the "Verified
count" sentence reconcile, and the access date is today. The attempt fails on **one URL-level
discrepancy**: the register's first entry-point link —
`…/Paginas/documentacionSobre-e-CF.aspx` — returns **`404`**, while the real page name
(`…/Paginas/documentacionSobree-CF.aspx`, which DGII's own `marcoLegal.aspx` links) returns `200` with
the same 385,863 bytes. Attempt 1 recorded `200` for that string; the measurement does not reproduce.

| Gate                                                    | Expected                            | Observed                                                                         | Result   |
| ------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------- | -------- |
| Every register URL reachable                            | all `2xx`                           | 43/43 rows `200`; 3/4 prose links `200`; **1 entry point `404`**                 | **FAIL** |
| Register `HTTP` column vs observation                   | `200` on all 43 rows                | `200` on all 43 rows, 0 disagreements                                            | PASS     |
| New URLs vs attempt 1                                   | none, or a reported addition        | none: 47 occurrences / 47 distinct URLs, identical set                           | PASS     |
| UA prose defect 1 (`statusecf` needs browser UA)        | corrected and accurate              | corrected to "serves any User-Agent"; matches all 5 UA probes                    | PASS     |
| UA prose defect 2 (`dgii.gov.do` browser UA "required") | corrected and accurate              | corrected to "rejects known bot UA strings… no UA header also gets 200"; matches | PASS     |
| `www.w3.org` inverse-UA claim                           | `403` browser UA, `200` plain/no UA | `403` / `200` / `200` — as written                                               | PASS     |
| Manifest `source_url`                                   | 15/15 byte-identical                | 15/15 identical; 12/12 `sha256` + `bytes` also identical                         | PASS     |
| Group row counts vs tables vs "Verified count"          | consistent                          | 7/11/15/4/6 = 43; 36 + 1 + 6 = 43; 37 under A–D                                  | PASS     |
| Access date = today UTC                                 | `2026-11-09`                        | `date -u +%F` = `2026-11-09`; 43/43 Access cells                                 | PASS     |
| No `200` PDF under 10 KB                                | none                                | smallest PDF 109,973 B (LEG-04, 9 pp); 0 under 10 KB                             | PASS     |

**Totals: 50 URLs requested. 49 × `200`, 1 × `404`. 43/43 register rows `200` with 0 status-cell
disagreements; 1 of 4 prose URLs broken.**

---

## Commands run

```bash
# 0. Access date the register claims
date -u +%F                                              # → 2026-11-09

# 1. Row-aware extraction (markdown-table aware: 43 rows, column 4 = Canonical URL, columns 5-6)
python3 /tmp/lv2/extract.py > /tmp/lv2/rows.json          # 43 rows; Counter({'XSD':15,'TEC':11,'LEG':7,'OPS':6,'STD':4})
# 1b. Whole-file URL scan with balanced-paren handling for "…Técnica (XSD)/…" and "…(e-CF)…"
python3 /tmp/lv2/scan.py                                 # 48 occurrences → 47 real URLs
                                                         # (1 false positive: the curl format string "%{http_code}\n")

# 2. Per-URL measurement (browser UA for dgii hosts, plain UA elsewhere; mirrors attempt 1)
UA_B="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
while IFS=$'\t' read -r row url; do
  case "$url" in *dgii.gov.do*) UA="$UA_B" ;; *) UA="curl/8.18.0" ;; esac
  curl -sS -A "$UA" -L --max-time 60 -o "/tmp/lv2/bodies/$n" -D "/tmp/lv2/heads/$n" \
    -w "%{http_code}\t%{content_type}\t%{url_effective}\t%{size_download}\t%{num_redirects}\n" "$url"
  sleep 0.3
done < /tmp/lv2/urls.tsv                    # 50 rows → /tmp/lv2/results.tsv

# 3. UA matrix: curl default / python-requests / Googlebot / Chrome 126 / no User-Agent header
bash /tmp/lv2/ua.sh > /tmp/lv2/ua.matrix    # (a) bot-ish, (b) browser, (c) no UA header
curl -sS -H 'User-Agent:' -o /dev/null -w '%{http_code}\n' '<url>'      # no UA at all

# 4. The entry-point discrepancy, reproduced
base=https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas
for i in $(seq 10); do curl -sS -A "$UA_B" -o /dev/null -w '%{http_code} ' "$base/documentacionSobre-e-CF.aspx"; done
                                                         # 404 404 404 404 404 404 404 404 404 404
for i in $(seq 5);  do curl -sS -A "$UA_B" -o /dev/null -w '%{http_code} ' "$base/documentacionsobree-cf.aspx"; done
                                                         # 200 200 200 200 200
curl -sS -A "$UA_B" -L -o ml.html '<…/Paginas/marcoLegal.aspx>'
grep -oiE 'href="[^"]*[Dd]ocumentaci[^"]*"' ml.html      # DGII's own href = documentacionSobreE-CF.aspx
curl -sS -A "$UA_B" -o /dev/null -w '%{http_code} %{size_download}\n' "$base/documentacionSobreE-CF.aspx"
                                                         # 200 385863  (= attempt 1's EP-1 byte count)
curl -sS -A "$UA_B" -o e404 "$base/documentacionSobre-e-CF.aspx"; grep -o 'requestUrl=[^"]*' e404

# 5. Manifest byte-for-byte + content identity
python3 - <<'PY'
import json,hashlib
m=json.load(open('examples/fixtures/schemas/MANIFEST.json'))   # 12 schemas + 3 excluded
# register XSD row URL == source_url ; sha256(download) == manifest.sha256 == MANIFEST bytes
PY

# 6. Body sanity: magic bytes, BOM, PDF page count (pypdf), title corroboration, <10 KB rule
uv run --quiet --with pypdf python -c "from pypdf import PdfReader; ..."    # page counts + page-1 text
jq -r '.openapi, .info.title, (.paths|keys[]), .components.schemas.Ambiente' /tmp/lv2/bodies/18
```

Raw captures: `/tmp/lv2/{results.tsv,bodies/,heads/,ua.matrix,e404,ep1low.html,ml.html}`.

---

## Every URL, re-measured

50 requests: the 43 register rows (IDs as in the register), 4 URLs quoted in prose, and 3 elided paths
whose register prose asserts `200` (resolved against their own bases — `P-1…P-3`). `effective URL` is
`same` when no redirect occurred. `bytes` is the transferred body length. Byte counts are identical to
attempt 1 for all 47 previously measured URLs — no content drift overnight.

| row ID  | URL                                                                                                                                                                                                                                                                  | status  | effective URL                                    | content type                   | title-consistent                                                                    | bytes      |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------ | ------------------------------ | ----------------------------------------------------------------------------------- | ---------- |
| LEG-01  | https://dgii.gov.do/legislacion/leyesTributarias/Documents/Otras%20Leyes%20de%20Inter%C3%A9s/32-23.pdf                                                                                                                                                               | 200     | same                                             | application/pdf                | Y (scan)                                                                            | 10,685,026 |
| LEG-02  | https://dgii.gov.do/legislacion/decretos/Documents/2024/Decreto587-24.pdf                                                                                                                                                                                            | 200     | same                                             | application/pdf                | Y (scan)                                                                            | 9,317,697  |
| LEG-03  | https://dgii.gov.do/legislacion/normasGenerales/Documents/NG%20sobre%20Comprobantes%20Fiscales/Norma01-20.pdf                                                                                                                                                        | 200     | same                                             | application/pdf                | Y (`NORMA GENERAL NÚM. 01-2020`)                                                    | 247,981    |
| LEG-04  | https://dgii.gov.do/legislacion/normasGenerales/Documents/NG%20sobre%20Comprobantes%20Fiscales/Norma05-19.pdf                                                                                                                                                        | 200     | same                                             | application/pdf                | Y (`NORMA GENERAL NÚM. 05-2019`)                                                    | 109,973    |
| LEG-05  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documents/Marco%20Legal/Resolucion%20035-2020.pdf                                                                                                                            | 200     | same                                             | application/pdf                | Y (`RESOLUCIÓN NÚM. 035-2020`, INDOTEL)                                             | 1,074,731  |
| LEG-06  | https://dgii.gov.do/legislacion/leyesTributarias/Documents/Otras%20Leyes%20de%20Inter%C3%A9s/126-02.pdf                                                                                                                                                              | 200     | same                                             | application/pdf                | Y (`Ley No. 126-02 sobre el Comercio Electronico…`)                                 | 1,711,220  |
| LEG-07  | https://dgii.gov.do/publicacionesOficiales/avisosInformativos/Documents/2019/24-19.pdf                                                                                                                                                                               | 200     | same                                             | application/pdf                | Y (`AVISO ESTRUCTURA DE COMPROBANTE FISCAL ELECTRÓNICO`)                            | 187,229    |
| TEC-01  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Informe%20T%C3%A9cnico%20e-CF%20v1.0.pdf                                                            | 200     | same                                             | application/pdf                | Y                                                                                   | 1,821,456  |
| TEC-02  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Descripcion%20Tecnica%20Servicios%20DGII.pdf                                                        | 200     | same                                             | application/pdf                | Y (`…: a. Servicios DGII`)                                                          | 2,451,054  |
| TEC-03  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Descripcion%20Tecnica%20Emisores%20Electronicos.pdf                                                 | 200     | same                                             | application/pdf                | Y (`…: b. Servicios Emisores Electrónicos`)                                         | 1,648,404  |
| TEC-04  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Estandares%20de%20Comportamiento%20Esperado%20en%20la%20Integracion.pdf                             | 200     | same                                             | application/pdf                | Y                                                                                   | 395,573    |
| TEC-05  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Comprobante%20Fiscal%20Electr%C3%B3nico%20(e-CF)%20V1.0.pdf                                                              | 200     | same                                             | application/pdf                | Y (`Versión 1.0 / Octubre 2025`)                                                    | 2,353,589  |
| TEC-06  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Resumen%20Factura%20Consumo%20Electr%C3%B3nica%20v1.0.pdf                                                                | 200     | same                                             | application/pdf                | Y (`…<DOP250,000`)                                                                  | 281,618    |
| TEC-07  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Aprobaci%C3%B3n%20Comercial%20v1.0.pdf                                                                                   | 200     | same                                             | application/pdf                | Y (`Formato Aprobación Comercial (ACECF)`)                                          | 217,252    |
| TEC-08  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Anulaci%C3%B3n%20de%20e-NCF%20v1.0.pdf                                                                                   | 200     | same                                             | application/pdf                | Y (`Anulación de e-NCF`, bitácora `24-05-2022`)                                     | 506,229    |
| TEC-09  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Acuse%20de%20Recibo%20v%201.0.pdf                                                                                        | 200     | same                                             | application/pdf                | Y (`Formato Acuse de Recibo (ARECF)`)                                               | 197,791    |
| TEC-10  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Firmado%20de%20e-CF.pdf                                                                | 200     | same                                             | application/pdf                | Y (`Firmado Comprobantes Fiscales Electrónicos (e-CF)`)                             | 1,283,845  |
| TEC-11  | https://statusecf.dgii.gov.do/api-docs/v1/definition.json                                                                                                                                                                                                            | 200     | same                                             | application/json;charset=utf-8 | Y (`FE Estatus Servicios API`)                                                      | 2,116      |
| XSD-01  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2032%20v.1.0.xsd                                                                                   | 200     | same                                             | text/xml                       | Y (root `ECF`, BOM)                                                                 | 122,998    |
| XSD-02  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2033%20v.1.0.xsd                                                                                   | 200     | same                                             | text/xml                       | Y (root `ECF`, BOM)                                                                 | 124,484    |
| XSD-03  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2034%20v.1.0.xsd                                                                                   | 200     | same                                             | text/xml                       | Y (root `ECF`, BOM)                                                                 | 122,024    |
| XSD-04  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2041%20v.1.0.xsd                                                                                   | 200     | same                                             | text/xml                       | Y (root `ECF`, BOM)                                                                 | 111,171    |
| XSD-05  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2043%20v.1.0.xsd                                                                                   | 200     | same                                             | text/xml                       | Y (root `ECF`, BOM)                                                                 | 96,111     |
| XSD-06  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2044%20v.1.0.xsd                                                                                   | 200     | same                                             | text/xml                       | Y (root `ECF`, BOM)                                                                 | 114,302    |
| XSD-07  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2045%20v.1.0.xsd                                                                                   | 200     | same                                             | text/xml                       | Y (root `ECF`, BOM)                                                                 | 121,785    |
| XSD-08  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2046%20v.1.0.xsd                                                                                   | 200     | same                                             | text/xml                       | Y (root `ECF`, BOM)                                                                 | 115,951    |
| XSD-09  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2047%20v.1.0.xsd                                                                                   | 200     | same                                             | text/xml                       | Y (root `ECF`, BOM)                                                                 | 101,382    |
| XSD-10  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/ANECF%20v.1.0.xsd                                                                                       | 200     | same                                             | text/xml                       | Y (root `ANECF`, BOM)                                                               | 5,160      |
| XSD-11  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/ARECF%20v1.0.xsd                                                                                        | 200     | same                                             | text/xml                       | Y (root `ARECF`, no BOM)                                                            | 2,871      |
| XSD-12  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/Semilla%20v.1.0.xsd                                                                                     | 200     | same                                             | text/xml                       | Y (root `SemillaModel`, no BOM)                                                     | 487        |
| XSD-13  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2031%20v.1.0.xsd                                                                                   | 200     | same                                             | text/xml                       | Y (root `ECF`, no BOM)                                                              | 123,019    |
| XSD-14  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/RFCE%2032%20v.1.0.xsd                                                                                   | 200     | same                                             | text/xml                       | Y (root `RFCE`, no BOM)                                                             | 15,325     |
| XSD-15  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/ACECF%20v.1.0.xsd                                                                                       | 200     | same                                             | text/xml                       | Y (root `ACECF`, no BOM)                                                            | 3,567      |
| STD-01  | https://www.w3.org/TR/xmldsig-core1/                                                                                                                                                                                                                                 | 200     | same                                             | text/html; charset=utf-8       | Y (`XML Signature Syntax and Processing Version 1.1`)                               | 402,341    |
| STD-02  | https://www.w3.org/TR/2001/REC-xml-c14n-20010315                                                                                                                                                                                                                     | 200     | same                                             | text/html; charset=iso-8859-1  | Y (`Canonical XML`)                                                                 | 76,370     |
| STD-03  | https://www.w3.org/TR/xmlenc-core1/                                                                                                                                                                                                                                  | 200     | same                                             | text/html; charset=utf-8       | Y (`XML Encryption Syntax and Processing Version 1.1`)                              | 336,750    |
| STD-04  | https://www.rfc-editor.org/rfc/rfc6931                                                                                                                                                                                                                               | 200     | https://www.rfc-editor.org/info/rfc6931/         | text/html;charset=utf-8        | Y (`RFC 6931: Additional XML Security URIs`)                                        | 511,023    |
| OPS-01  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaciones%20Proceso%20de%20Certificaci%C3%B3n%20FE/Proceso%20de%20Certificacion%20para%20ser%20Emisor%20Electronico.pdf                     | 200     | same                                             | application/pdf                | Y (`Certificación Emisor Electrónico`)                                              | 1,678,092  |
| OPS-02  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaciones%20Proceso%20de%20Certificaci%C3%B3n%20FE/Proceso-Certificacion-EmisorElectronico-Proveedor-Servicios-FECertificado.pdf            | 200     | same                                             | application/pdf                | Y (`Emisor Electrónico con Proveedor de Servicios…`)                                | 968,165    |
| OPS-03  | https://dgii.gov.do/legislacion/normasGenerales/Documents/NG%20sobre%20Comprobantes%20Fiscales/Norma10-21.pdf                                                                                                                                                        | 200     | same                                             | application/pdf                | Y (`NORMA GENERAL NÚM. 10-2021`)                                                    | 241,769    |
| OPS-04  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Instructivo%20de%20Contingencia%20de%20FE.pdf                                          | 200     | same                                             | application/pdf                | Y (`Instructivo de Contingencia de Facturación Electrónica`)                        | 578,774    |
| OPS-05  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Instructivo%20App%20Firma%20Digital.pdf                                                | 200     | same                                             | application/pdf                | Y (`APP FIRMA`, v1.0 Enero 2020)                                                    | 326,451    |
| OPS-06  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Instructivo%20Delegaciones%20de%20Roles%20de%20Facturaci%C3%B3n%20Electr%C3%B3nica.pdf | 200     | same                                             | application/pdf                | Y (`Instructivo Delegaciones de Roles…`)                                            | 1,594,778  |
| EP-1    | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/documentacionSobre-e-CF.aspx                                                                                                                                         | **404** | same                                             | text/html; charset=utf-8       | **N — SharePoint `PageNotFoundError`**                                              | 754        |
| EP-2    | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/marcoLegal.aspx                                                                                                                                                      | 200     | same                                             | text/html; charset=utf-8       | Y (`Marco Legal`)                                                                   | 315,728    |
| TEC-11n | https://statusecf.dgii.gov.do/help/index.html                                                                                                                                                                                                                        | 200     | same                                             | text/html;charset=utf-8        | Y (`FE Estatus Servicios API`)                                                      | 4,841      |
| STD-02b | http://www.w3.org/TR/2001/REC-xml-c14n-20010315                                                                                                                                                                                                                      | 200     | https://www.w3.org/TR/2001/REC-xml-c14n-20010315 | text/html; charset=iso-8859-1  | Y (`Canonical XML`)                                                                 | 76,370     |
| P-1     | https://dgii.gov.do/publicacionesOficiales/avisosInformativos/Documents/2023/07-23.pdf                                                                                                                                                                               | 200     | same                                             | application/pdf                | Y (`AVISO PROMULGACION LEY GENERAL DE FACTURACIÓN ELECTRÓNICA… 16 de mayo de 2023`) | 214,601    |
| P-2     | https://dgii.gov.do/publicacionesOficiales/avisosInformativos/Documents/2024/20-24.pdf                                                                                                                                                                               | 200     | same                                             | application/pdf                | Y (`A VISO PROMULGACIÓN DEL DECRETO 587-24…`)                                       | 172,630    |
| P-3     | https://dgii.gov.do/legislacion/normasGenerales/Documents/NG%20sobre%20Comprobantes%20Fiscales/Norma06-18.pdf                                                                                                                                                        | 200     | same                                             | application/pdf                | Y (`…06-2018`)                                                                      | 299,075    |

Notes on the table:

- **No new URL appeared.** Revision 2's URL set is the attempt-1 set: 43 row URLs + 2 entry points +
  the `statusecf` help link + the `http://` C14N copy TEC-10's mapping quotes
  (`STD-02b`, an algorithm-URI quote, not a link). Hosts remain exactly
  `dgii.gov.do`, `statusecf.dgii.gov.do`, `www.w3.org`, `www.rfc-editor.org`.
- **`P-1…P-3`** are not full URLs in the register: §A's note writes them elided
  (`.../2023/07-23.pdf`, `.../2024/20-24.pdf`, and judgement call 8's
  `.../NG%20sobre%20Comprobantes%20Fiscales/Norma06-18.pdf`), each with an asserted `200`. Resolved
  against their own bases, all three are `200`; their byte counts match attempt 1 exactly
  (214,601 / 172,630 / 299,075).
- Only two redirects, both already documented in the register: `STD-04` →
  `https://www.rfc-editor.org/info/rfc6931/` (same document) and `STD-02b` `http:` → `https:`.
- `text/xml` for the XSDs, `application/json` for TEC-11, `application/pdf` for all 29 PDFs, `text/html`
  for the 4 HTML pages — no `text/plain`, no HTML error page served with `200`.
- `LEG-01` (33 pp) and `LEG-02` (29 pp) have no text layer (page 1 extracts empty); their identity
  rests on URL + `application/pdf` + page count + DGII's own avisos (`P-1` names Ley 32-23 and its
  `16 de mayo de 2023`; `P-2` names Decreto 587-24).
- `OPS-04`'s PDF **metadata** `/Title` is `Instructivo Facturador Gratuito de FE` (a DGII template
  leftover) while its page 1 reads `Instructivo de Contingencia de Facturación Electrónica`. The row's
  title matches page 1; the metadata string is DGII's sloppiness, not a register defect.

## Page counts (the < 10 KB PDF check)

Every PDF was parsed with `pypdf`. **No `200` PDF is under 10 KB**; the smallest is LEG-04 at 109,973 B
(9 pp). Page counts also confirm the register's own page-count claims in the verification recipe and
show that the multi-page documents arrive whole:

| Row    | Bytes      | Pages | Row    | Bytes     | Pages |
| ------ | ---------- | ----- | ------ | --------- | ----- |
| LEG-01 | 10,685,026 | 33    | TEC-05 | 2,353,589 | 89    |
| LEG-02 | 9,317,697  | 29    | TEC-06 | 281,618   | 12    |
| LEG-03 | 247,981    | 10    | TEC-07 | 217,252   | 6     |
| LEG-04 | 109,973    | 9     | TEC-08 | 506,229   | 9     |
| LEG-05 | 1,074,731  | 27    | TEC-09 | 197,791   | 6     |
| LEG-06 | 1,711,220  | 27    | TEC-10 | 1,283,845 | 20    |
| LEG-07 | 187,229    | 1     | OPS-01 | 1,678,092 | 26    |
| TEC-01 | 1,821,456  | 53    | OPS-02 | 968,165   | 17    |
| TEC-02 | 2,451,054  | 47    | OPS-03 | 241,769   | 9     |
| TEC-03 | 1,648,404  | 13    | OPS-04 | 578,774   | 16    |
| TEC-04 | 395,573    | 13    | OPS-05 | 326,451   | 4     |
| P-1    | 214,601    | 2     | OPS-06 | 1,594,778 | 9     |
| P-2    | 172,630    | 1     | P-3    | 299,075   | 7     |

Register claims reproduced exactly: TEC-01 53 pp, TEC-02 47 pp, TEC-03 13 pp, TEC-04 13 pp, TEC-05
89 pp, LEG-02 29 pp.

---

## User-Agent matrix (attempt 1's two defects, re-tested)

`curl/8.18.0`, `python-requests/2.31.0` and a `Googlebot/2.1` string are the bot-ish cases; Chrome 126
is the register's recipe UA; `no UA` sends no `User-Agent` header at all. Requests without `-L`, so a
bare `302`/`301` is visible.

| Host · path                                              | curl | python-requests | Googlebot | Chrome 126 | no UA   |
| -------------------------------------------------------- | ---- | --------------- | --------- | ---------- | ------- |
| `dgii.gov.do` · LEG-01 PDF                               | 403  | 403             | 403       | **200**    | **200** |
| `dgii.gov.do` · TEC-02 PDF                               | 403  | 403             | 403       | 200        | 200     |
| `dgii.gov.do` · XSD-12                                   | 403  | 403             | 403       | 200        | 200     |
| `dgii.gov.do` · EP-2 page                                | 403  | 403             | 403       | 200        | 200     |
| `dgii.gov.do` · EP-1 page (register slug)                | 403  | 403             | 403       | **404**    | **404** |
| `statusecf.dgii.gov.do` · `/api-docs/v1/definition.json` | 200  | 200             | 200       | 200        | 200     |
| `statusecf.dgii.gov.do` · `/help/index.html`             | 200  | 200             | 200       | 200        | 200     |
| `statusecf.dgii.gov.do` · `/` (no `-L`)                  | 302  | 302             | 302       | 302        | 302     |
| `statusecf.dgii.gov.do` · `/` (with `-L`)                | 200  | 200             | 200       | 200        | 200     |
| `www.w3.org` · STD-01                                    | 200  | 200             | 200       | **403**    | 200     |
| `www.rfc-editor.org` · STD-04 (no `-L`)                  | 301  | 301             | 301       | 301        | 301     |

The register's corrected prose, claim by claim:

| Register claim (revision 2)                                                                                                                                                             | Observation                                                                                                                                                     | Verdict                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| "`dgii.gov.do` rejects known bot User-Agent strings. `curl/8.18.0` and `python-requests/2.31.0` both get `403`"                                                                         | both `403` on PDF, XSD and HTML paths (also `wget/1.21.4` → `403`)                                                                                              | accurate                                                         |
| "a browser UA gets `200`"                                                                                                                                                               | Chrome 126 → `200` on every path that exists                                                                                                                    | accurate                                                         |
| "A request with **no `User-Agent` header at all also gets `200`**"                                                                                                                      | no-UA → `200` on PDF/XSD/pages                                                                                                                                  | accurate                                                         |
| "the block is UA-string blacklisting, not a browser requirement"                                                                                                                        | consistent: bot strings rejected, browser and absent UA served; the WAF answers `403`, never a `200`-with-error                                                 | accurate                                                         |
| "`statusecf.dgii.gov.do` serves any User-Agent" — "`200` for `curl`, `python-requests`, no UA header and the browser UA, on `/api-docs/v1/definition.json`, `/help/index.html` and `/`" | `200` in all 5 UA cases on the JSON and the help page; `/` is a `302`→`/help`→`/help/index.html` chain that lands on `200` for every UA under the recipe's `-L` | accurate (the `200` on `/` requires `-L`, which the recipe uses) |
| "`www.w3.org` … answers `403` to that browser UA on this network and `200` to a plain curl UA or to no UA at all"                                                                       | `403` / `200` / `200` reproduced                                                                                                                                | accurate                                                         |

Both attempt-1 defects are fixed and the replacement text is reproducible as written. The one thing the
prose cannot explain is EP-1's `404`: a `404` is returned **with no UA header too** (i.e. it survives
the bot filter), and the body is SharePoint's `PageNotFoundError`, so it is a missing page name, not a
UA rejection.

---

## Manifest reconciliation (15 `source_url` values)

| Check                                                                 | Expected                                                                                          | Observed                                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Register XSD row URL `==` `MANIFEST.json` `source_url`, byte-for-byte | 15/15                                                                                             | **15/15 identical, 0 mismatches** (12 `schemas` + 3 `excluded`)             |
| `sha256(download)` `==` manifest `sha256`                             | 12/12 compiling                                                                                   | **12/12 identical**                                                         |
| `bytes` `==` manifest `bytes`                                         | 12/12 compiling                                                                                   | **12/12 identical** (e.g. XSD-01 122,998; XSD-12 487)                       |
| `excluded` entries carry no hash (by design)                          | 3                                                                                                 | confirmed — `e-CF 31`, `RFCE 32`, `ACECF` have `source_url` + `reason` only |
| Register's summary of the `excluded` reasons                          | invalid pattern facets on RFCE 32 + ACECF; missing `IndicadorServicioTodoIncluidoType` on e-CF 31 | the three `reason` strings say exactly that                                 |
| Manifest composition claim ("12 in `schemas` + 3 in `excluded`")      | 12 + 3 = 15                                                                                       | `len(schemas)=12`, `len(excluded)=3`                                        |

---

## Group-count reconciliation

| Group           | Rows physically present in its table | Register's "Verified count" claim                                                            | Match                       |
| --------------- | ------------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------- |
| A — `LEG-01…07` | 7                                    | "7 legal/normative (`LEG`)"                                                                  | ✓                           |
| B — `TEC-01…11` | 11                                   | "10 technical … (`TEC-01`…`TEC-10`)" + "1 machine-readable service specification — `TEC-11`" | ✓ (10 + 1)                  |
| C — `XSD-01…15` | 15                                   | "15 schemas … (12 compile … 3 are reference-only: XSD-13/14/15)"                             | ✓                           |
| D — `STD-01…04` | 4                                    | "4 XML/XMLDSig standards (`STD`)"                                                            | ✓                           |
| E — `OPS-01…06` | 6                                    | "6 operational/certification manuals"                                                        | ✓                           |
| A–D subtotal    | 37                                   | "37 rows under A–D (36 documents + 1 service spec)"                                          | ✓ (7+10+15+4 = 36; +1 = 37) |
| Total           | 43                                   | "**43 URLs verified `200` on 2026-11-09**" / "43 `200`s"                                     | ✓                           |
| Access cells    | 43/43 = `2026-11-09`                 | "Access date for every row: 2026-11-09"                                                      | ✓                           |
| `HTTP` cells    | 43/43 = `200`                        | `200` on every row                                                                           | ✓                           |

The numbers in the "Verified count" section are internally consistent with the tables and with the
measured totals: 43 rows, 43 `200`s. (The two prose URLs that are not rows — EP-1/EP-2, `TEC-11n`,
`STD-02b` — are outside that count, which is why EP-1's `404` does not falsify the sentence "43 URLs
verified `200`"; it falsifies the register's working entry point instead.)

## Access date

`date -u +%F` → `2026-11-09`; all 43 `Access` cells and both prose uses of the date read `2026-11-09`.

---

## Discrepancies (expected vs actual)

1. **BLOCKING — the first entry-point link 404s.** §Scope and method, line 29:
   `[…](https://dgii.gov.do/…/Paginas/documentacionSobre-e-CF.aspx)`.
   - Expected: `200` (the register presents it as a working entry point that lists "all technical PDFs
     - all 15 XSDs"; attempt 1 recorded `200`, 385,863 B for this string).
   - Actual: **`404`**, `text/html; charset=utf-8`, 754 B, SharePoint `PageNotFoundError` — 10/10
     sequential requests with the browser UA, plus further requests with no-UA (`404`) and `wget`
     (`403`, bot filter). The slug does not exist: `documentacionSobre-e-CF.aspx`.
   - The page itself does exist one character away: `documentacionSobree-CF.aspx` → **`200`,
     385,863 B** — the exact byte count attempt 1 recorded — titled `Documentación sobre e-CF`, and it
     links the 15 XSDs + 18 PDFs as the register describes. DGII's own `marcoLegal.aspx` links the
     same page as `documentacionSobreE-CF.aspx` (`200`). Case is not the issue: `DOCUMENTACIONSOBREE-CF.ASPX`
     also returns `200`; only the `Sobre-e` spelling fails.
   - Severity: **blocks the register's discovery path**; the row set is unaffected (all 43 rows `200`).
   - Fix instruction: replace the link target in line 29 with
     `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/documentacionSobree-CF.aspx`
     (or DGII's own `documentacionSobreE-CF.aspx` form), then re-state the discovery path. No other line
     quotes that slug.
2. **LOW — the LEG-02 date attribution to `P-2` is not reproducible from that aviso.**
   §A note: "LEG-02 date from DGII Aviso 20-24 (`.../2024/20-24.pdf`, `200`)".
   - Expected: the aviso carries the decree's promulgation date (register's LEG-02 cell: `17 Oct 2024`).
   - Actual: the aviso is `200` (`application/pdf`, 172,630 B, 1 p) and its text confirms
     "PROMULGACIÓN DEL DECRETO 587-24" and mentions `2024`, but contains **no day/month date**
     (`16 de mayo de 2023`-style string absent; only the bare year `2024`).
   - Severity: documentation only, `HTTP` cell unaffected. Fix instruction: keep the aviso as the
     source for the decree's promulgation, and stop presenting it as the source of the exact date — or
     attribute `17 Oct 2024` to the decree/listing and drop the parenthetical claim.

Attempt 1's two defects are **closed** (verified above, not re-derived from prose).

## Not tested / coverage gaps

- Link liveness, content type, title identity and byte size only. No field-level re-reading of the
  PDFs was done beyond the title/bitácora probes listed in the commands; article numbers quoted by the
  register were not re-derived today.
- The 9 `e-CF`-type XSDs share one root element name (`ECF`); per-type identity is carried by the file
  name, DGII's listing label and the manifest `sha256`, not by a distinct root element. No per-type
  structural diff was performed.
- The register's "DGII folder listings answer `401`" claim was not re-measured (a bare listing path
  did return `401` with a 16-byte body during the entry-point probe; not counted in the totals).
- XMLSchema/XSDsig gates (`mise run verify-signing-*`, `xmllint`) were not run: they are the SDK's
  build gates, not link checks.
- A `200` is not a content guarantee: DGII republishes in place. Byte counts matching attempt 1 exactly
  is evidence of no change between the two attempts today, not a permanent guarantee.
- `statusecf.dgii.gov.do` `/` `200` holds only with `-L` (raw `302`); the register's recipe uses `-L`,
  so the claim stands as written, but a reader who drops `-L` will see `302`.

---

**QA Agent**: EvidenceQA · **Evidence date**: 2026-11-09 · **Attempt**: 2 of 3 ·
**Verdict**: FAIL (1 blocking URL discrepancy, 1 low-severity prose discrepancy) ·
**Raw captures**: `/tmp/lv2/{results.tsv,bodies/,heads/,ua.matrix,e404,ep1low.html,ml.html}`

## Outcome

Outcome: FAIL attempt 2 of 3 — both attempt-1 UA prose defects are genuinely fixed and reproduce exactly, but the register's first entry-point link `…/Paginas/documentacionSobre-e-CF.aspx` returns `404` (10/10 attempts, also with no UA), while the real slug `documentacionSobree-CF.aspx` returns `200`/385,863 B.
Details: All 43 rows are `200` with byte counts identical to attempt 1; 43/43 `HTTP` cells and 43/43 access cells (`2026-11-09` = today UTC) correct; 15/15 manifest `source_url` byte-identical (12/12 `sha256`+`bytes` too); group counts 7/11/15/4/6 = 43 reconcile with the "Verified count" sentence; no PDF under 10 KB (smallest 109,973 B). Fix: correct that one slug, and stop attributing LEG-02's exact date to Aviso 20-24 (it carries no day/month).

`/home/deuriib/projects/dgii-ecf/project-tasks/124-evidence/t2-evidence-collector-links-attempt2.md` — QA verdict, full 50-URL table, UA matrix, manifest and group-count reconciliation, commands, totals, discrepancies with fix instructions.
