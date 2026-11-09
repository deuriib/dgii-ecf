# QA — Link integrity of the #124 official-source register (attempt 1 of 3)

Independent re-measurement of every URL in `project-tasks/124-source-register.md`. The register's
`HTTP` column was **not** trusted; every status below is an observation made today.

**Verdict: FAIL.** Zero URL-level failures (47/47 reachable, 43/43 rows agree with the register's `200`),
but one register claim assigned to me for reproduction — that `statusecf.dgii.gov.do` needs a browser
User-Agent and answers `403` to a default curl UA — **could not be reproduced** (it answers `200` to
every UA). Per the acceptance rule ("PASS requires zero discrepancies") this attempt fails on that
discrepancy alone; no URL re-measurement is needed to unblock, only a one-line correction to the
register's verification recipe.

| Gate                                                               | Expected                                                                                                                  | Observed                                                                                                      | Result   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------- |
| Every URL reachable                                                | 47/47 `2xx`                                                                                                               | 47/47 `200`                                                                                                   | PASS     |
| Register `HTTP` column vs observation                              | `200` on all 43 rows                                                                                                      | `200` on all 43 rows, 0 disagreements                                                                         | PASS     |
| Canonical hosts only                                               | `dgii.gov.do`, `statusecf.dgii.gov.do`, `w3.org`, `rfc-editor.org`                                                        | exactly those 4 hosts; no mirror/blog                                                                         | PASS     |
| Manifest `source_url` vs `examples/fixtures/schemas/MANIFEST.json` | 12/12 compiling + 3/3 excluded byte-identical                                                                             | 15/15 byte-identical (0 mismatches)                                                                           | PASS     |
| Access date = today UTC                                            | `2026-11-09`                                                                                                              | `date -u +%F` = `2026-11-09`; 43/43 Access cells = `2026-11-09`                                               | PASS     |
| Redirects landing on a different document                          | none                                                                                                                      | 1 redirect (STD-04 `→ /info/rfc6931/`, same document, documented in the register); 1 scheme upgrade (STD-02b) | PASS     |
| Register's UA claim (assigned to reproduce)                        | `dgii.gov.do` + `statusecf.dgii.gov.do` → `403` on default curl UA; `www.w3.org` → `403` on browser UA, `200` on plain UA | `dgii.gov.do` `403` ✓ / `www.w3.org` `403`→`200` ✓ / `statusecf.dgii.gov.do` **`200` in every case** ✗        | **FAIL** |

**Totals: 47 URLs checked, 47 × `200`, 0 failures.** (43 register row URLs + 2 entry-point links +
1 `statusecf` help link + 1 protocol-downgrade copy of STD-02 quoted in the mapping prose.)

---

## Commands run

```bash
# 0. Access date the register claims
date -u +%F                                        # → 2026-11-09

# 1. Extract every URL (markdown-table aware; balanced parens kept, e.g. "%20(XSD)", "(e-CF)")
grep -oE 'https?://[^ )|`"<>]+' project-tasks/124-source-register.md    # first pass, then:
python3 /tmp/lv/extract.py > /tmp/lv/urls.json      # row-aware extraction → 47 occurrences
grep -E '^\| (LEG|TEC|XSD|STD|OPS)-' project-tasks/124-source-register.md | awk -F'|' '{gsub(/ /,"",$6); print $6}' | sort | uniq -c   # → 43 × "200"

# 2. Per-URL measurement (browser UA for dgii hosts, plain UA elsewhere; bodies kept for content checks)
#    /tmp/lv/urls.txt is TSV: "<row ID>\t<url>"; /tmp/lv/fetch.sh runs this loop (sleep 0.3 between hits)
UA_B="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
while IFS=$'\t' read -r row url; do
  n=$((n+1)); n=$(printf '%02d' "$n")
  case "$url" in
    *dgii.gov.do*) curl -sS -A "$UA_B" -L --max-time 40 -o "/tmp/lv/bodies/$n" -D "/tmp/lv/heads/$n" \
      -w "%{http_code}\t%{content_type}\t%{url_effective}\t%{size_download}\t%{num_redirects}\n" "$url" ;;
    *) curl -sS -A "curl/8.18.0" -L --max-time 40 -o "/tmp/lv/bodies/$n" -D "/tmp/lv/heads/$n" \
      -w "%{http_code}\t%{content_type}\t%{url_effective}\t%{size_download}\t%{num_redirects}\n" "$url" ;;
  esac
  sleep 0.3
done < /tmp/lv/urls.txt                         # results → /tmp/lv/results.tsv

# 3. UA behaviour matrix (each host × {curl default, python-requests, no UA header, browser})
bash /tmp/lv/ua2.sh                             # see table below

# 4. Manifest byte-for-byte compare + content identity
python3 - <<'PY'                                # 15/15 source_url equal, 12/12 sha256 equal
import json; m=json.load(open('examples/fixtures/schemas/MANIFEST.json'))
# compare each register XSD row URL == manifest source_url; sha256(download) == manifest sha256; bytes match
PY

# 5. Content checks (python3 stdlib only; no pdftotext/xmllint/qpdf on this machine)
head -c 12 bodies/<n>                           # XSD → "<?xml" (+UTF-8 BOM on 10/15); JSON → "{"
head -c 5  bodies/<n>                           # PDF → "%PDF-"
python3 -c "import os;print(os.stat('bodies/<n>').st_size)"   # non-trivial byte size
python3 -c "import zlib,re;..."                 # inflate FlateDecode streams → text probes (e.g. b'<DOP250,000' in TEC-06)
jq -r '.openapi, .info.title' bodies/20         # → 3.0.1 / "FE Estatus Servicios API"
jq -r '.paths|keys[]' bodies/20                 # → 3 /api/EstatusServicios/* paths
jq -r '.components.schemas.Ambiente' bodies/20  # → enum [1,2,3]
```

## UA behaviour evidence

`UA-C` = curl default (`curl/8.18.0`), `UA-P` = `python-requests/2.31.0`, `UA-N` = no `User-Agent`
header sent at all, `UA-B` = the register's Chrome 126 browser UA.

| Host                    | Path                                    | UA-C    | UA-P    | UA-N | UA-B    |
| ----------------------- | --------------------------------------- | ------- | ------- | ---- | ------- |
| `dgii.gov.do`           | `…/Otras Leyes de Interés/32-23.pdf`    | **403** | **403** | 200  | 200     |
| `dgii.gov.do`           | `…/Paginas/documentacionSobreE-CF.aspx` | **403** | –       | –    | 200     |
| `statusecf.dgii.gov.do` | `/api-docs/v1/definition.json`          | 200     | 200     | 200  | 200     |
| `statusecf.dgii.gov.do` | `/help/index.html`                      | 200     | 200     | 200  | 200     |
| `statusecf.dgii.gov.do` | `/`                                     | 200     | 200     | 200  | 200     |
| `www.w3.org`            | `/TR/xmldsig-core1/`                    | 200     | –       | 200  | **403** |
| `www.rfc-editor.org`    | `/rfc/rfc6931`                          | 200     | –       | 200  | 200     |

Confirmed: `dgii.gov.do` rejects a known bot UA string with `403` and serves the browser UA (it also
serves a request with **no** UA header — the block is UA-string based, so "the browser UA is required"
is an over-statement of an observed `403`). Confirmed: `www.w3.org` is the inverse — `403` to the
browser UA, `200` to a plain/absent UA. **Not confirmed**: `statusecf.dgii.gov.do` never returned
`403`; it does not need the browser UA.

## Every URL, re-measured

`effective URL` is `same` when no redirect occurred. `bytes` is the transferred body length (raw
download size), evidence that each response is the real document and not a stub.

| row ID  | URL                                                                                                                                                                                                                                                                  | observed status | effective URL                                    | content type                   | title-consistent (Y/N) | bytes      |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------ | ------------------------------ | ---------------------- | ---------- |
| EP-1    | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/documentacionSobreE-CF.aspx                                                                                                                                          | 200             | same                                             | text/html; charset=utf-8       | Y                      | 385,863    |
| EP-2    | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/marcoLegal.aspx                                                                                                                                                      | 200             | same                                             | text/html; charset=utf-8       | Y                      | 315,728    |
| LEG-01  | https://dgii.gov.do/legislacion/leyesTributarias/Documents/Otras%20Leyes%20de%20Inter%C3%A9s/32-23.pdf                                                                                                                                                               | 200             | same                                             | application/pdf                | Y                      | 10,685,026 |
| LEG-02  | https://dgii.gov.do/legislacion/decretos/Documents/2024/Decreto587-24.pdf                                                                                                                                                                                            | 200             | same                                             | application/pdf                | Y                      | 9,317,697  |
| LEG-03  | https://dgii.gov.do/legislacion/normasGenerales/Documents/NG%20sobre%20Comprobantes%20Fiscales/Norma01-20.pdf                                                                                                                                                        | 200             | same                                             | application/pdf                | Y                      | 247,981    |
| LEG-04  | https://dgii.gov.do/legislacion/normasGenerales/Documents/NG%20sobre%20Comprobantes%20Fiscales/Norma05-19.pdf                                                                                                                                                        | 200             | same                                             | application/pdf                | Y                      | 109,973    |
| LEG-05  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documents/Marco%20Legal/Resolucion%20035-2020.pdf                                                                                                                            | 200             | same                                             | application/pdf                | Y                      | 1,074,731  |
| LEG-06  | https://dgii.gov.do/legislacion/leyesTributarias/Documents/Otras%20Leyes%20de%20Inter%C3%A9s/126-02.pdf                                                                                                                                                              | 200             | same                                             | application/pdf                | Y                      | 1,711,220  |
| LEG-07  | https://dgii.gov.do/publicacionesOficiales/avisosInformativos/Documents/2019/24-19.pdf                                                                                                                                                                               | 200             | same                                             | application/pdf                | Y                      | 187,229    |
| TEC-01  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Informe%20T%C3%A9cnico%20e-CF%20v1.0.pdf                                                            | 200             | same                                             | application/pdf                | Y                      | 1,821,456  |
| TEC-02  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Descripcion%20Tecnica%20Servicios%20DGII.pdf                                                        | 200             | same                                             | application/pdf                | Y                      | 2,451,054  |
| TEC-03  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Descripcion%20Tecnica%20Emisores%20Electronicos.pdf                                                 | 200             | same                                             | application/pdf                | Y                      | 1,648,404  |
| TEC-04  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Estandares%20de%20Comportamiento%20Esperado%20en%20la%20Integracion.pdf                             | 200             | same                                             | application/pdf                | Y                      | 395,573    |
| TEC-05  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Comprobante%20Fiscal%20Electr%C3%B3nico%20(e-CF)%20V1.0.pdf                                                              | 200             | same                                             | application/pdf                | Y                      | 2,353,589  |
| TEC-06  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Resumen%20Factura%20Consumo%20Electr%C3%B3nica%20v1.0.pdf                                                                | 200             | same                                             | application/pdf                | Y                      | 281,618    |
| TEC-07  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Aprobaci%C3%B3n%20Comercial%20v1.0.pdf                                                                                   | 200             | same                                             | application/pdf                | Y                      | 217,252    |
| TEC-08  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Anulaci%C3%B3n%20de%20e-NCF%20v1.0.pdf                                                                                   | 200             | same                                             | application/pdf                | Y                      | 506,229    |
| TEC-09  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Acuse%20de%20Recibo%20v%201.0.pdf                                                                                        | 200             | same                                             | application/pdf                | Y                      | 197,791    |
| TEC-10  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Firmado%20de%20e-CF.pdf                                                                | 200             | same                                             | application/pdf                | Y                      | 1,283,845  |
| TEC-11  | https://statusecf.dgii.gov.do/api-docs/v1/definition.json                                                                                                                                                                                                            | 200             | same                                             | application/json;charset=utf-8 | Y                      | 2,116      |
| TEC-11n | https://statusecf.dgii.gov.do/help/index.html                                                                                                                                                                                                                        | 200             | same                                             | text/html;charset=utf-8        | Y                      | 4,841      |
| XSD-01  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2032%20v.1.0.xsd                                                                                   | 200             | same                                             | text/xml                       | Y                      | 122,998    |
| XSD-02  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2033%20v.1.0.xsd                                                                                   | 200             | same                                             | text/xml                       | Y                      | 124,484    |
| XSD-03  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2034%20v.1.0.xsd                                                                                   | 200             | same                                             | text/xml                       | Y                      | 122,024    |
| XSD-04  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2041%20v.1.0.xsd                                                                                   | 200             | same                                             | text/xml                       | Y                      | 111,171    |
| XSD-05  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2043%20v.1.0.xsd                                                                                   | 200             | same                                             | text/xml                       | Y                      | 96,111     |
| XSD-06  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2044%20v.1.0.xsd                                                                                   | 200             | same                                             | text/xml                       | Y                      | 114,302    |
| XSD-07  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2045%20v.1.0.xsd                                                                                   | 200             | same                                             | text/xml                       | Y                      | 121,785    |
| XSD-08  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2046%20v.1.0.xsd                                                                                   | 200             | same                                             | text/xml                       | Y                      | 115,951    |
| XSD-09  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2047%20v.1.0.xsd                                                                                   | 200             | same                                             | text/xml                       | Y                      | 101,382    |
| XSD-10  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/ANECF%20v.1.0.xsd                                                                                       | 200             | same                                             | text/xml                       | Y                      | 5,160      |
| XSD-11  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/ARECF%20v1.0.xsd                                                                                        | 200             | same                                             | text/xml                       | Y                      | 2,871      |
| XSD-12  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/Semilla%20v.1.0.xsd                                                                                     | 200             | same                                             | text/xml                       | Y                      | 487        |
| XSD-13  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2031%20v.1.0.xsd                                                                                   | 200             | same                                             | text/xml                       | Y                      | 123,019    |
| XSD-14  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/RFCE%2032%20v.1.0.xsd                                                                                   | 200             | same                                             | text/xml                       | Y                      | 15,325     |
| XSD-15  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/ACECF%20v.1.0.xsd                                                                                       | 200             | same                                             | text/xml                       | Y                      | 3,567      |
| STD-01  | https://www.w3.org/TR/xmldsig-core1/                                                                                                                                                                                                                                 | 200             | same                                             | text/html; charset=utf-8       | Y                      | 402,341    |
| STD-02  | https://www.w3.org/TR/2001/REC-xml-c14n-20010315                                                                                                                                                                                                                     | 200             | same                                             | text/html; charset=iso-8859-1  | Y                      | 76,370     |
| STD-03  | https://www.w3.org/TR/xmlenc-core1/                                                                                                                                                                                                                                  | 200             | same                                             | text/html; charset=utf-8       | Y                      | 336,750    |
| STD-04  | https://www.rfc-editor.org/rfc/rfc6931                                                                                                                                                                                                                               | 200             | https://www.rfc-editor.org/info/rfc6931/         | text/html;charset=utf-8        | Y                      | 511,023    |
| OPS-01  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaciones%20Proceso%20de%20Certificaci%C3%B3n%20FE/Proceso%20de%20Certificacion%20para%20ser%20Emisor%20Electronico.pdf                     | 200             | same                                             | application/pdf                | Y                      | 1,678,092  |
| OPS-02  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaciones%20Proceso%20de%20Certificaci%C3%B3n%20FE/Proceso-Certificacion-EmisorElectronico-Proveedor-Servicios-FECertificado.pdf            | 200             | same                                             | application/pdf                | Y                      | 968,165    |
| OPS-03  | https://dgii.gov.do/legislacion/normasGenerales/Documents/NG%20sobre%20Comprobantes%20Fiscales/Norma10-21.pdf                                                                                                                                                        | 200             | same                                             | application/pdf                | Y                      | 241,769    |
| OPS-04  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Instructivo%20de%20Contingencia%20de%20FE.pdf                                          | 200             | same                                             | application/pdf                | Y                      | 578,774    |
| OPS-05  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Instructivo%20App%20Firma%20Digital.pdf                                                | 200             | same                                             | application/pdf                | Y                      | 326,451    |
| OPS-06  | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Instructivo%20Delegaciones%20de%20Roles%20de%20Facturaci%C3%B3n%20Electr%C3%B3nica.pdf | 200             | same                                             | application/pdf                | Y                      | 1,594,778  |
| STD-02b | http://www.w3.org/TR/2001/REC-xml-c14n-20010315                                                                                                                                                                                                                      | 200             | https://www.w3.org/TR/2001/REC-xml-c14n-20010315 | text/html; charset=iso-8859-1  | Y                      | 76,370     |

---

## Content / title consistency

| Group                 | Rows                                        | Check                                                                                        | Result                                                                                                                                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PDFs                  | 23 (LEG-01…07, TEC-01…10, OPS-01…06)        | `content-type: application/pdf`, body magic `%PDF-`, non-trivial size                        | 23/23 `application/pdf` + `%PDF-`; sizes 109,973 B (LEG-04) – 10,685,026 B (LEG-01); all ≥ 109 KB                                                                                                                                                                                                                                   |
| XSDs                  | 15 (XSD-01…15)                              | `content-type: text/xml`, body starts with an XML declaration                                | 15/15 `text/xml` + `<?xml`; BOM on 10 (XSD-01…10), no BOM on 5 (XSD-11…15) — matches the byte-identical repo copies                                                                                                                                                                                                                 |
| TEC-11 JSON           | 1                                           | valid JSON, no truncation                                                                    | parses; `openapi: 3.0.1`; `info.title: "FE Estatus Servicios API"`; the 3 `/api/EstatusServicios/*` paths; `securitySchemes.ApiKey`; `Ambiente.enum = [1,2,3]` — matches the row's title claim item by item                                                                                                                         |
| Schema identity       | XSD-01…15                                   | `sha256(download)` vs `MANIFEST.json.sha256`; size vs `MANIFEST.json.bytes`                  | 12/12 compiling schemas: hash and size **identical** (files unchanged since the manifest's `2026-11-02` retrieval)                                                                                                                                                                                                                  |
| Manifest URL equality | XSD-01…12 (compiling), XSD-13…15 (excluded) | register URL string `==` `MANIFEST.json` `source_url`, byte-for-byte                         | 15/15 identical, 0 mismatches                                                                                                                                                                                                                                                                                                       |
| Title corroboration   | all PDF/HTML rows                           | DGII's own listing labels on the two entry-point pages, cross-checked against the row titles | every row matched; see notes                                                                                                                                                                                                                                                                                                        |
| STD pages             | STD-01…04                                   | page `<title>` vs row title                                                                  | `XML Signature Syntax and Processing Version 1.1` / `Canonical XML` (the `REC-xml-c14n-20010315` REC) / `XML Encryption Syntax and Processing Version 1.1` / `RFC 6931: Additional XML Security Uniform Resource Identifiers (URIs)`; bodies also contain `enveloped-signature`, `2001/04/xmlenc#sha256`, `xmldsig-more#rsa-sha256` |

Notes on title consistency:

- Every DGII row's file name and the anchor label DGII publishes for it on the entry-point pages agree
  with the row's title. DGII uses the short form `NN-YY` where the register writes `NN-YYYY`
  (LEG-03 `01-20`, LEG-04 `05-19`, OPS-03 `10-21`) — same documents, not a mismatch.
- `TEC-06`: DGII's label is "Formato Resumen Factura Consumo Electrónico v1.0"; the register's title
  adds `<DOP250,000 (RFCE)`. The served PDF contains the string `<DOP250,000` in its own text layer, so
  the qualifier is in the document even though it is absent from the listing label.
- The register's `site-updated` dates reproduce against the listings: TEC-01 `16/10/2026`,
  TEC-02/TEC-03 `29/05/2026`, TEC-04 `06/11/2026`, TEC-05 `30/10/2025`, TEC-06 `19/08/2020`,
  TEC-07 `10/01/2020`, TEC-09 `30/10/2025`, TEC-10 `22/11/2023`, OPS-01 `19/08/2025`,
  OPS-02 `29/05/2026`, OPS-04 `15/10/2026`, OPS-05 `22/11/2023`, OPS-06 `11/06/2025`,
  XSD-01 `16/10/2025`, XSD-02/03 `01/04/2026`, XSD-04…09 `16/10/2025`, XSD-10/11/14 `20/06/2023`,
  XSD-12 `12/11/2020`, XSD-13 `16/10/2025`, XSD-15 `21/12/2022`.
- Two rows are **scanned images** (no text layer), as the register says: LEG-01 (`0` fonts, `33` image
  XObjects) and LEG-02. Their identity rests on the URL, the `application/pdf` type and DGII's own
  anchor label, not on extractable text.

## Discrepancies (expected vs actual)

1. **`statusecf.dgii.gov.do` UA requirement — register claim is false.**
   - Register (Scope and method, verification recipe): _"`dgii.gov.do` and `statusecf.dgii.gov.do`
     answer `403` to a default curl UA — the browser UA above is required."_
   - Expected: `403` with `curl/8.18.0`.
   - Actual: `200` with `curl/8.18.0`, `200` with `python-requests/2.31.0`, `200` with no `User-Agent`
     header, `200` with the browser UA — on `/api-docs/v1/definition.json`, `/help/index.html` and `/`.
     Severity: **documentation only** — no row status changes (`TEC-11` was `200` either way), no URL
     needs re-testing. Fix: restrict the `403` sentence to `dgii.gov.do` (and note that a missing UA is
     accepted there too), and state that `statusecf.dgii.gov.do` serves any UA.
2. **`dgii.gov.do` "browser UA is required" — over-stated, not false.**
   - Expected per register: default curl UA → `403`, browser UA required.
   - Actual: curl UA → `403` ✓, `python-requests` UA → `403` ✓, **no UA header at all → `200`**,
     browser UA → `200`. The block is UA-string blacklisting, not a browser requirement.
     Severity: documentation only. Fix: "rejects known bot UA strings (`curl`, `python-requests`)".

Both items are register _prose_ defects. Every URL, every `HTTP` cell, every manifest URL and the
access date are correct as measured.

## Not tested / coverage gaps

- Link liveness only: no semantic reading of article numbers or field-level claims inside the PDFs.
  Title/version identity was checked against DGII's listing labels, the served file type and (for
  schemas) the manifest hashes; the internal content of each PDF was **not** diffed against the row's
  description.
- The 9 `e-CF` type schemas share one `TipoeCFType` enumeration (31,32,33,34,41,43,44,45,46,47), so the
  per-type identity is carried by the file name, DGII's listing label and the manifest hash — not by a
  type-specific element set. Their byte identity with the pinned fixtures is proven; a per-type XSD
  structural diff was not performed.
- The register's "DGII folder listings answer `401`" claim was **not** re-measured (not part of the row
  set). The elided footnote paths (`…/2023/07-23.pdf`, `…/2024/20-24.pdf`,
  `…/NG sobre Comprobantes Fiscales/Norma06-18.pdf`) are not full URLs; resolved against their bases
  they return `200 application/pdf` (214,601 B / 172,630 B / 299,075 B).
- `TEC-08`'s internal revision string `2022-05-24` was not machine-verifiable (the PDF yields only the
  date `2011-07-08`); DGII's listing shows `Modificado: 20/06/2022`.
- XMLSchema compilation of the 12 "compiles" schemas and the 3 `upstream-invalid/` ones was not
  re-run here (no `xmllint`/`libxmlsec` on this machine) — that is the SDK's gate, not a link check.
- Network conditions were those of this machine on 2026-11-09; DGII republishes files in place, so a
  `200` is not a content guarantee (the manifest `sha256` is, and it matched today).

---

**QA Agent**: EvidenceQA · **Evidence date**: 2026-11-09 · **Attempt**: 1 of 3 ·
**Raw captures**: `/tmp/lv/{results.tsv,bodies/,heads/,ua-probe.log,ua2.log,cmds.log}`
