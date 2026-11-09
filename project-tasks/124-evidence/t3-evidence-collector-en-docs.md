# QA evidence — issue #124, English docs deliverable (attempt 1 of 3)

**Validator:** EvidenceQA (evidence collector, gates T3/T4/T5)
**Date:** 2026-11-09 (UTC) · **Branch:** `docs/124-dgii-official-sources` · **HEAD:** `b44ebb4` (`chore: release main (#123)`; the docs change is uncommitted working tree)
**Working tree under review (4 paths):**

| Path                                 | State                | Lines |
| ------------------------------------ | -------------------- | ----- |
| `docs/en/reference/dgii-official.md` | new (untracked)      | 179   |
| `docs/en/guides/flow.md`             | modified (`+27 −10`) | 299   |
| `docs/en/guides/signing.md`          | modified (`+1 −0`)   | 72    |
| `docs/en/guides/resilience.md`       | modified (`+6 −0`)   | 137   |

**Frozen input:** `project-tasks/124-source-register.md` (760 lines, revision 3 / attempt 3).
**Acceptance source:** `gh issue view 124`; operative brief: `project-tasks/124-dgii-official-sources-tasklist.md` §3 Decisions 1–11.

---

## 1. Verdict

**GATES 1–7: PASS — zero unresolved discrepancies on the seven gates measured below.**

The en deliverable reproduces the frozen register exactly (43/43 URLs byte-identical, 43/43 title
pairings and 21/21 guide citations correct), every one of the 45 URLs it publishes answers `200`, the
nav-less page builds green under `--strict`, renders with all 7 tables and 109 `href`s, contains no
lifted DGII prose and no mirrored binaries, and the change touches nothing outside the four expected
paths.

Two items outside the gate set are recorded in §10 and need an owner decision. **D-1** (per-citation
access date, Low) is the only one that touches a stated acceptance bullet; it does not affect any of
the seven gates. **D-2** is a conflict between two governance artifacts, and the implementation matches
the later one.

| #   | Gate                                      | Expected                                                                           | Observed                                                                                                                                                                    | Result                                   |
| --- | ----------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | Every external link works                 | 45/45 `200` with the host-appropriate UA; no PDF under 10 KB                       | 45/45 `200`; effective URL equals the requested one except 5 benign canonical redirects; 23 PDFs, smallest 109,973 B                                                        | **PASS**                                 |
| 2   | Every cited URL equals the register row   | 43/43 exact string equality, correct title↔URL pairing                             | 43/43 exact; 0 docs-only URLs, 0 register-only rows, 0 drifted pairings                                                                                                     | **PASS**                                 |
| 3   | Site is self-contained                    | 0 `project-docs` links, 0 new `github.com/deuriib/dgii-ecf` links under `docs/en/` | 0 `project-docs` hits; 4 `github.com` hits, all pre-existing at HEAD in files this change does not touch; the change **removed** the one pre-existing repo link (`flow.md`) | **PASS**                                 |
| 4   | Build gates                               | `prettier --check docs/en` exit 0; `mkdocs build --strict` exit 0                  | exit 0 / exit 0; orphan-page `INFO` for the new page, not a warning                                                                                                         | **PASS**                                 |
| 5   | No DGII body text copied; no PDF mirrored | no lifted sentence; no binary under `docs/`                                        | longest shared word run with any source = **10 words = a document title**; 34 n-gram hits, all titles / section names / algorithm URIs; 0 non-`.md` files under `docs/`     | **PASS**                                 |
| 6   | Nothing else changed                      | only the 4 `docs/en/` paths + untracked `project-tasks/**`                         | exactly the 4 paths; 1 extra untracked orphan (`project-docs/marketing/github-listing.md`) proven pre-existing and not attributable (§8)                                    | **PASS** (with a documented observation) |
| 7   | Render sanity                             | page rendered, tables intact, links are `href`s                                    | `site/reference/dgii-official/index.html`, 55,844 B, 7 tables / 7 `thead` / 60 rows, 109 `href`, 0 raw-markdown artifacts, all 9 self-anchors resolve                       | **PASS**                                 |

---

## 2. Commands run (verbatim, with exit codes)

```bash
# scope + baseline
git status --short ; git status --porcelain -uall ; git diff --stat ; git diff --name-only
git rev-parse --short HEAD
stat -c '%y  %n' <reviewed files>

# gate 1 — URL extraction and re-request (per-host UA, see §3)
python3 - <<'PY'   # markdown-destination + inline-code extraction -> /tmp/qa124/urls.txt
PY
#   per-URL probe:
#   curl -sS --globoff -A "$UA_B" -o /dev/null -L --max-time 60 \
#        -w '%{http_code}\t%{url_effective}\t%{content_type}\t%{size_download}\t%{num_redirects}' <url>
#   UA_B='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
#   89 probes total (each UA-sensitive URL under both UA modes)

# gate 2 — register cross-check
python3 - <<'PY'   # register row parser -> {ID, title, version/date, url}; set + pairing comparison
PY

# gate 3 — self-containment
grep -rn "github.com/deuriib/dgii-ecf" docs/en/
grep -rn "project-docs" docs/en/
for f in docs/en/faq.md docs/en/typescript.md docs/en/python.md docs/en/examples.md \
         docs/en/installation.md docs/en/guides/flow.md; do
  git show HEAD:$f | grep -c "github.com/deuriib/dgii-ecf\|project-docs"; done

# gate 4 — build gates
packages/typescript/node_modules/.bin/prettier --check docs/en
uvx --from mkdocs --with mkdocs-material --with "mkdocs-static-i18n>=1.0,<2" mkdocs build --strict

# gate 5 — copy check (source text extracted from the cached PDFs with pypdf)
uv run --with pypdf python -c "from pypdf import PdfReader; ..."    # 11 corpora, 36,024 words
python3 - <<'PY'   # 7-gram index over all corpora vs all 4 files; longest-common-run DP
PY

# gate 7 — render
grep -o '<table' site/reference/dgii-official/index.html | wc -l
grep -o '<a href=' site/reference/dgii-official/index.html | wc -l
grep -c '](http' site/reference/dgii-official/index.html

# extra (repo CI gate, .github/workflows/docs.yml)
diff <(cd docs/en && find . -name '*.md' | sort) <(cd docs/es && find . -name '*.md' | sort)   # exit 1
```

---

## 3. Gate 1 — every external link works

**Extraction.** 45 distinct URLs come out of the four files: 43 markdown link destinations plus 2
inline-code algorithm URIs in `guides/signing.md` (`http://www.w3.org/TR/2001/REC-xml-c14n-20010315`,
`http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`) that are identifiers in a bullet list, not links.
They are probed and reported anyway. 15 URLs carry literal spaces inside a `<...>` destination
(`Formato Comprobante Fiscal Electrónico (e-CF) V1.0.pdf`, the `Documentación Técnica (XSD)/…` set);
those were requested with `%20` so `curl` would accept them.

**UA matrix (measured, and it reproduces the register's own notes exactly):**

| Host                    | URLs | browser UA | plain curl UA | Conclusion                                |
| ----------------------- | ---- | ---------- | ------------- | ----------------------------------------- |
| `dgii.gov.do`           | 38   | `200` ×38  | `403` ×38     | browser UA required (UA-string blacklist) |
| `statusecf.dgii.gov.do` | 1    | `200`      | `200`         | UA-insensitive                            |
| `www.w3.org`            | 5    | `403` ×5   | `200` ×5      | inverse: plain UA required                |
| `www.rfc-editor.org`    | 1    | not probed | `200`         | plain                                     |

**Result: 45/45 `200`.** 23 PDFs (all `application/pdf`), 16 `text/xml` (the XSDs), 1
`application/json;charset=utf-8` (2,116 B, the OpenAPI definition), 5 `text/html` (W3C + RFC).

**PDF size check: no PDF is under 10 KB.** Smallest is `Norma05-19.pdf` at **109,973 B**; then
`24-19.pdf` 187,229 B, `Formato Acuse de Recibo` 197,791 B. A sub-10 KB PDF would signal DGII serving
an error page with a PDF content type; none occurs.

**Effective URL vs requested URL — 5 differ, all benign and none a dead end:**

| Requested                                                       | Effective                                          | Why                                                              |
| --------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| `https://www.rfc-editor.org/rfc/rfc6931`                        | `https://www.rfc-editor.org/info/rfc6931/`         | rfc-editor's documented `/rfc/` → `/info/` redirect; final `200` |
| `http://www.w3.org/TR/2001/REC-xml-c14n-20010315` (×2 probes)   | `https://www.w3.org/TR/2001/REC-xml-c14n-20010315` | W3C enforces https                                               |
| `http://www.w3.org/2001/04/xmldsig-more#rsa-sha256` (×2 probes) | `https://www.w3.org/2001/04/xmldsig-more`          | namespace document; the `#` fragment is never sent by design     |

Note the two `http://` W3C URLs are **pre-existing `signing.md` content** (present at HEAD, outside this
diff); the new page uses the `https://` forms. No fix required — an algorithm URI is not a link a reader
clicks, and `--strict` does not check external URLs.

### 3.1 URL table (45/45)

| #   | Register row    | URL                                                                                                                                                                                                                                                                    | UA      | HTTP | Effective-URL change                     | Content-Type                   | Bytes    |
| --- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---- | ---------------------------------------- | ------------------------------ | -------- |
| 1   | LEG-01          | `https://dgii.gov.do/legislacion/leyesTributarias/Documents/Otras%20Leyes%20de%20Inter%C3%A9s/32-23.pdf`                                                                                                                                                               | browser | 200  | —                                        | application/pdf                | 10685026 |
| 2   | LEG-02          | `https://dgii.gov.do/legislacion/decretos/Documents/2024/Decreto587-24.pdf`                                                                                                                                                                                            | browser | 200  | —                                        | application/pdf                | 9317697  |
| 3   | LEG-03          | `https://dgii.gov.do/legislacion/normasGenerales/Documents/NG%20sobre%20Comprobantes%20Fiscales/Norma01-20.pdf`                                                                                                                                                        | browser | 200  | —                                        | application/pdf                | 247981   |
| 4   | LEG-04          | `https://dgii.gov.do/legislacion/normasGenerales/Documents/NG%20sobre%20Comprobantes%20Fiscales/Norma05-19.pdf`                                                                                                                                                        | browser | 200  | —                                        | application/pdf                | 109973   |
| 5   | LEG-05          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documents/Marco%20Legal/Resolucion%20035-2020.pdf`                                                                                                                            | browser | 200  | —                                        | application/pdf                | 1074731  |
| 6   | LEG-06          | `https://dgii.gov.do/legislacion/leyesTributarias/Documents/Otras%20Leyes%20de%20Inter%C3%A9s/126-02.pdf`                                                                                                                                                              | browser | 200  | —                                        | application/pdf                | 1711220  |
| 7   | LEG-07          | `https://dgii.gov.do/publicacionesOficiales/avisosInformativos/Documents/2019/24-19.pdf`                                                                                                                                                                               | browser | 200  | —                                        | application/pdf                | 187229   |
| 8   | TEC-01          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Informe%20T%C3%A9cnico%20e-CF%20v1.0.pdf`                                                            | browser | 200  | —                                        | application/pdf                | 1821456  |
| 9   | TEC-02          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Descripcion%20Tecnica%20Servicios%20DGII.pdf`                                                        | browser | 200  | —                                        | application/pdf                | 2451054  |
| 10  | TEC-03          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Descripcion%20Tecnica%20Emisores%20Electronicos.pdf`                                                 | browser | 200  | —                                        | application/pdf                | 1648404  |
| 11  | TEC-04          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Estandares%20de%20Comportamiento%20Esperado%20en%20la%20Integracion.pdf`                             | browser | 200  | —                                        | application/pdf                | 395573   |
| 12  | TEC-10          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Firmado%20de%20e-CF.pdf`                                                                | browser | 200  | —                                        | application/pdf                | 1283845  |
| 13  | TEC-11          | `https://statusecf.dgii.gov.do/api-docs/v1/definition.json`                                                                                                                                                                                                            | browser | 200  | —                                        | application/json;charset=utf-8 | 2116     |
| 14  | TEC-05          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Comprobante%20Fiscal%20Electr%C3%B3nico%20(e-CF)%20V1.0.pdf`                                                              | browser | 200  | —                                        | application/pdf                | 2353589  |
| 15  | TEC-06          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Resumen%20Factura%20Consumo%20Electr%C3%B3nica%20v1.0.pdf`                                                                | browser | 200  | —                                        | application/pdf                | 281618   |
| 16  | TEC-07          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Aprobaci%C3%B3n%20Comercial%20v1.0.pdf`                                                                                   | browser | 200  | —                                        | application/pdf                | 217252   |
| 17  | TEC-08          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Anulaci%C3%B3n%20de%20e-NCF%20v1.0.pdf`                                                                                   | browser | 200  | —                                        | application/pdf                | 506229   |
| 18  | TEC-09          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Acuse%20de%20Recibo%20v%201.0.pdf`                                                                                        | browser | 200  | —                                        | application/pdf                | 197791   |
| 19  | XSD-01          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2032%20v.1.0.xsd`                                                                                   | browser | 200  | —                                        | text/xml                       | 122998   |
| 20  | XSD-02          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2033%20v.1.0.xsd`                                                                                   | browser | 200  | —                                        | text/xml                       | 124484   |
| 21  | XSD-03          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2034%20v.1.0.xsd`                                                                                   | browser | 200  | —                                        | text/xml                       | 122024   |
| 22  | XSD-04          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2041%20v.1.0.xsd`                                                                                   | browser | 200  | —                                        | text/xml                       | 111171   |
| 23  | XSD-05          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2043%20v.1.0.xsd`                                                                                   | browser | 200  | —                                        | text/xml                       | 96111    |
| 24  | XSD-06          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2044%20v.1.0.xsd`                                                                                   | browser | 200  | —                                        | text/xml                       | 114302   |
| 25  | XSD-07          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2045%20v.1.0.xsd`                                                                                   | browser | 200  | —                                        | text/xml                       | 121785   |
| 26  | XSD-08          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2046%20v.1.0.xsd`                                                                                   | browser | 200  | —                                        | text/xml                       | 115951   |
| 27  | XSD-09          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2047%20v.1.0.xsd`                                                                                   | browser | 200  | —                                        | text/xml                       | 101382   |
| 28  | XSD-10          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/ANECF%20v.1.0.xsd`                                                                                       | browser | 200  | —                                        | text/xml                       | 5160     |
| 29  | XSD-11          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/ARECF%20v1.0.xsd`                                                                                        | browser | 200  | —                                        | text/xml                       | 2871     |
| 30  | XSD-12          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/Semilla%20v.1.0.xsd`                                                                                     | browser | 200  | —                                        | text/xml                       | 487      |
| 31  | XSD-13          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2031%20v.1.0.xsd`                                                                                   | browser | 200  | —                                        | text/xml                       | 123019   |
| 32  | XSD-14          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/RFCE%2032%20v.1.0.xsd`                                                                                   | browser | 200  | —                                        | text/xml                       | 15325    |
| 33  | XSD-15          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/ACECF%20v.1.0.xsd`                                                                                       | browser | 200  | —                                        | text/xml                       | 3567     |
| 34  | STD-01          | `https://www.w3.org/TR/xmldsig-core1/`                                                                                                                                                                                                                                 | plain   | 200  | —                                        | text/html; charset=utf-8       | 402341   |
| 35  | STD-02          | `https://www.w3.org/TR/2001/REC-xml-c14n-20010315`                                                                                                                                                                                                                     | plain   | 200  | —                                        | text/html; charset=iso-8859-1  | 76370    |
| 36  | STD-03          | `https://www.w3.org/TR/xmlenc-core1/`                                                                                                                                                                                                                                  | plain   | 200  | —                                        | text/html; charset=utf-8       | 336750   |
| 37  | STD-04          | `https://www.rfc-editor.org/rfc/rfc6931`                                                                                                                                                                                                                               | plain   | 200  | https://www.rfc-editor.org/info/rfc6931/ | text/html;charset=utf-8        | 511023   |
| 38  | OPS-01          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaciones%20Proceso%20de%20Certificaci%C3%B3n%20FE/Proceso%20de%20Certificacion%20para%20ser%20Emisor%20Electronico.pdf`                     | browser | 200  | —                                        | application/pdf                | 1678092  |
| 39  | OPS-02          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaciones%20Proceso%20de%20Certificaci%C3%B3n%20FE/Proceso-Certificacion-EmisorElectronico-Proveedor-Servicios-FECertificado.pdf`            | browser | 200  | —                                        | application/pdf                | 968165   |
| 40  | OPS-03          | `https://dgii.gov.do/legislacion/normasGenerales/Documents/NG%20sobre%20Comprobantes%20Fiscales/Norma10-21.pdf`                                                                                                                                                        | browser | 200  | —                                        | application/pdf                | 241769   |
| 41  | OPS-04          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Instructivo%20de%20Contingencia%20de%20FE.pdf`                                          | browser | 200  | —                                        | application/pdf                | 578774   |
| 42  | OPS-05          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Instructivo%20App%20Firma%20Digital.pdf`                                                | browser | 200  | —                                        | application/pdf                | 326451   |
| 43  | OPS-06          | `https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Instructivo%20Delegaciones%20de%20Roles%20de%20Facturaci%C3%B3n%20Electr%C3%B3nica.pdf` | browser | 200  | —                                        | application/pdf                | 1594778  |
| 44  | inline-code URI | `http://www.w3.org/TR/2001/REC-xml-c14n-20010315`                                                                                                                                                                                                                      | plain   | 200  | http→https                               | text/html; charset=iso-8859-1  | 76370    |
| 45  | inline-code URI | `http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`                                                                                                                                                                                                                    | plain   | 200  | https://www.w3.org/2001/04/xmldsig-more  | text/html; charset=iso-8859-1  | 1218     |

---

## 4. Gate 2 — every cited URL matches the register

The register holds **43 rows** (7 `LEG`, 11 `TEC`, 15 `XSD`, 4 `STD`, 6 `OPS`). The docs publish **43
link URLs**. The two sets are in **exact string bijection**:

| Check                                                                                                                 | Expected | Observed |
| --------------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| docs URLs present in the register                                                                                     | 43       | **43**   |
| URLs cited but absent from the register                                                                               | 0        | **0**    |
| register rows not cited                                                                                               | 0        | **0**    |
| literal string drift between a docs URL and its register URL (percent-encoding, `http`/`https`, trailing slash, case) | 0        | **0**    |

**Title↔URL pairing — 0 drifted pairings.**

- New page: 43/43 table rows pair the _Document_ cell with its _own_ URL cell and with the correct
  register row (document titles compared token-by-token against the register title; e.g. `Descripción
Técnica Servicios DGII` → `TEC-02` and `Descripción Técnica Servicios Emisores Electrónicos` →
  `TEC-03` are not swapped, which is the failure mode that matters here — both URLs live in the same
  directory and differ by one path segment).
- Guides: **21/21** titled links resolve to the register row whose title matches the anchor text
  (`flow.md` 15, `signing.md` 2, `resilience.md` 4, counting repeats).

**Version/date cell fidelity** (adjacent to gate 2, checked because drift is otherwise silent): 39/43
cells are string-identical to the register. The 4 differences are cosmetic paraphrases with no factual
drift: `TEC-03` drops the word "added" (`escape rules 2025-04-03` vs `escape rules added 2025-04-03`),
and `STD-01/02/03` spell `W3C REC` out as `W3C Recommendation`. The dates cited inline in the guides
were compared line by line against the register cells — **21/21 match**, including the `semilla` XSD
(`v1.0; site-updated 2020-11-12` → `XSD-12`).

---

## 5. Gate 3 — the site is self-contained

```text
$ grep -rn "project-docs" docs/en/
(no output — 0 hits across the whole English tree)

$ grep -rn "github.com/deuriib/dgii-ecf" docs/en/
docs/en/typescript.md:203:[package README](https://github.com/deuriib/dgii-ecf/tree/main/packages/typescript).
docs/en/faq.md:48:See [SECURITY.md](https://github.com/deuriib/dgii-ecf/blob/main/SECURITY.md).
docs/en/examples.md:3:The [`examples/`](https://github.com/deuriib/dgii-ecf/tree/main/examples)
docs/en/python.md:204:[package README](https://github.com/deuriib/dgii-ecf/tree/main/packages/python).
```

All four hits are **pre-existing**, and `git diff` proves it: none of those files is modified
(`git diff --name-only` lists only the three guides), and `git show HEAD:<file> | grep -c` returns 1 for
each of them at HEAD. Nothing under `docs/en/reference/` and nothing in the three modified guides hits
either pattern.

**New links introduced by this change: zero.** The change moves in the opposite direction — it
**deletes** the only repo-file link that existed in the reviewed set:

```text
HEAD:docs/en/guides/flow.md -> 1 hit:  project-docs/dgii-ground-truth.md`](https://github.com/deuriib/dgii-ecf/blob/main/project-docs/dgii-ground-truth.md
working tree                -> 0 hits
HEAD:docs/en/guides/signing.md, resilience.md -> 0 hits (both states)
docs/en/reference/dgii-official.md            -> 0 hits (new file)
```

The replaced pointer now reads "…[Official DGII references](../reference/dgii-official.md) lists the
whole set…", an intra-site relative link that (verified in §8) renders as `../../reference/dgii-official/`.

---

## 6. Gate 4 — build gates

```text
$ packages/typescript/node_modules/.bin/prettier --check docs/en
Checking formatting...
All matched files use Prettier code style!
(exit 0)

$ uvx --from mkdocs --with mkdocs-material --with "mkdocs-static-i18n>=1.0,<2" mkdocs build --strict
INFO    -  mkdocs_static_i18n: Building 'en' documentation to directory: …/site
INFO    -  The following pages exist in the docs directory, but are not included in the "nav" configuration:
  - en/reference/dgii-official.md
INFO    -  mkdocs_static_i18n: Building 'es' documentation to directory: …/site/es
INFO    -  The following pages exist in the docs directory, but are not included in the "nav" configuration:
  - en/reference/dgii-official.md
INFO    -  mkdocs_static_i18n: Translated 11 navigation elements to 'es'
INFO    -  mkdocs_static_i18n: Building 'en' documentation to directory: …/site
INFO    -  Documentation built in 1.88 seconds
(exit 0)
```

**The orphan-page `INFO` for `en/reference/dgii-official.md` is present and is not a failure** — it is an
`INFO` line, not a `WARNING`, so `--strict` stays green; the nav entry is task T7 and out of scope here.
Confirmed empirically by the exit code `0`.

Before this run, `site/` was moved aside (`mv site /tmp/qa124/site.previous`) so the artifacts inspected
in §8 come from this build alone, not from a stale directory.

**Extra gate I ran (repo CI, `.github/workflows/docs.yml` step "Check en/es translation parity"): that
step FAILS today** — see §10 O-1. It is not one of the seven gates and it is expected to stay red until
the `docs/es` mirror lands.

---

## 7. Gate 5 — no DGII body text copied, no PDF mirrored

**Method.** All four files were normalized (NFD-folded, lowercased, punctuation to space) and compared
against an extracted-text corpus of the cited documents: `tec01` (11,899 words), `tec02` (7,032),
`tec03` (1,434), `tec04` (3,268), `tec07` (683), `tec10` (3,180), `leg03` (4,532), `leg04` (3,799),
`leg07` (209) — **36,024 words**, 31,602 distinct 7-grams indexed. Two independent measurements:

1. **7-gram membership scan** — every 7-word window of the docs text checked against the corpus.
   **34 matches**, and every one falls into one of three legitimate kinds:

   | Match (normalized)                                                                                      | Source  | Class                                                               |
   | ------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------- |
   | `estandares de comportamiento esperado en la integracion con el sistema` (5×)                           | `tec04` | **document title** — the issue requires citing documents "by title" |
   | `recepcion de resumen factura de consumo electronica (rfce)` (2×)                                       | `tec02` | **section name** used as an anchor (`_Recepción de resumen…_`)      |
   | `http www w3 org tr 2001 rec xml c14n 20010315`, `http www w3 org 2001 04 xmldsig more rsa sha256` (7×) | `tec10` | **algorithm URIs** — identifiers, pre-existing in `signing.md`      |

2. **Longest common contiguous word run** (DP over suffixes) between each file and each corpus — the
   strongest available "did a paragraph travel" signal:

   | File                                 | Max shared run                                                                          | Against                                                     |
   | ------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
   | `docs/en/reference/dgii-official.md` | **10 words** = `estandares de comportamiento esperado en la integracion con el sistema` | `tec04` (its own title)                                     |
   | `docs/en/guides/flow.md`             | 10 words, same title                                                                    | `tec04`                                                     |
   | `docs/en/guides/resilience.md`       | 10 words, same title                                                                    | `tec04`                                                     |
   | `docs/en/guides/signing.md`          | 12 words, `http www w3 org 2001 04 xmldsig more rsa sha256 reference uri`               | `tec10` (algorithm URI + the pre-existing word "reference") |

**No sentence of DGII prose is reproduced. Not one 11-word Spanish run exists anywhere in the four
files.** The Spanish that does appear is proper names (document titles, section headings), field and API
identifiers (`DetalleAprobacionComercial`, `secuenciaUtilizada`, `Ambiente`, `ApiKey`, `SemillaModel`,
`TipoeCF`), and short attributions written in English — exactly the "titles, versions, one-line
attributions and links only" the page's own note promises.

**No PDF or binary mirrored.** Under `docs/`: `find docs -type f ! -name '*.md'` returns **0 results**.
The only untracked artifact this change adds under `docs/` is the one `.md` file.

**Files this validator wrote:** this report, plus the extracted-text cache it produced next to the PDFs
(`project-tasks/124-evidence/.pdfcache/{leg01,leg02,leg04,leg07,tec04,tec07,tec10}.txt`) so the copy
check can be re-run. No file under `docs/`, `mkdocs.yml` or the register was touched.

> **Coverage gap, stated honestly:** `leg01.pdf` (Ley 32-23) and `leg02.pdf` (Decreto 587-24) yield **32
> and 28 characters** of extractable text — they are scans, exactly as the register says. Copying from
> those two cannot be excluded by text comparison; it is excluded for the other nine documents, and the
> page cites those two at title level only (verified by reading: the "Two of these are scans" admonition
> and the title-level wording are present).

---

## 8. Gate 6 — nothing else changed

```text
$ git status --porcelain -uall
 M docs/en/guides/flow.md
 M docs/en/guides/resilience.md
 M docs/en/guides/signing.md
?? docs/en/reference/dgii-official.md
?? project-docs/marketing/github-listing.md          <-- not attributable, see below
?? project-tasks/124-dgii-official-sources-ledger.md
?? project-tasks/124-dgii-official-sources-tasklist.md
?? project-tasks/124-evidence/…                      (6 evidence files + .pdfcache/)
?? project-tasks/124-source-register.md
```

| Path family                     | Expected  | Observed                                                   | Result   |
| ------------------------------- | --------- | ---------------------------------------------------------- | -------- |
| `docs/en/` (3 modified + 1 new) | 4 paths   | exactly 4                                                  | **PASS** |
| `mkdocs.yml`                    | untouched | not listed, `git diff` empty                               | **PASS** |
| `docs/es/**`                    | untouched | not listed                                                 | **PASS** |
| `packages/**`, `examples/**`    | untouched | not listed                                                 | **PASS** |
| `project-docs/**`               | no edits  | **no tracked file modified**; one untracked orphan (below) | **PASS** |
| staged content                  | none      | `git diff --cached` empty                                  | **PASS** |

**The one untracked orphan, `project-docs/marketing/github-listing.md` — proven not attributable:**

- `stat`: mtime **2026-11-03 06:21**, six days _before_ the earliest artifact of this pipeline
  (`124-source-register.md`, 2026-11-09 11:24; the new page 2026-11-09 11:45).
- `grep -c "124\|dgii-official\|Official DGII"` → **0**; the content is a GitHub-listing copy deck about
  repository descriptions and topics.
- `git log --all -- project-docs/marketing/` → empty: the path never existed in any commit, so this
  change cannot have produced it. `git ls-files project-docs/` → 5 tracked files, all untouched.

It is workspace dirt from another task, not a side effect of this deliverable. It must not be swept into
the `docs:` commit — the fix is an operator action (stash or ignore the path), not a change to this
deliverable. Reported rather than omitted because the brief's literal wording is "only the four expected
paths … plus untracked `project-tasks/**`", and this is one extra path.

Also noted: `project-tasks/124-evidence/.pdfcache/` holds 13 PDFs (~27 MB) downloaded by the earlier
link-verification attempts, **none under `docs/`**. That is an evidence cache, not a mirror, but it must
never be committed (it accounts for 13 of the entries in the `git status` output above).

---

## 9. Gate 7 — render sanity

**Emitted path: `site/reference/dgii-official/index.html`** — the en locale builds to the site root
(`mkdocs_static_i18n`, `docs_structure: folder`), so the page lands at the top level, **not** under
`site/en/`. 55,844 bytes on this build.

| Check                                                                                                                                    | Expected                                            | Observed                                                                                                                                       | Result |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `table` / `thead` elements                                                                                                               | 7 each (LEG, TEC, formats, XSD, STD, OPS, per-step) | **7 / 7**                                                                                                                                      | PASS   |
| table rows                                                                                                                               | 7 header + 53 data = 60                             | **60**                                                                                                                                         | PASS   |
| `a href=`                                                                                                                                | every markdown link rendered as an attribute        | **109** (87 external `http(s)`, 22 internal/asset)                                                                                             | PASS   |
| raw markdown leak (`](http`, literal `**`)                                                                                               | 0                                                   | **0 / 0**                                                                                                                                      | PASS   |
| admonitions (`!!! note` ×2, `!!! warning` ×1)                                                                                            | rendered blocks present                             | **6** matched markup fragments across 3 admonitions                                                                                            | PASS   |
| inline code                                                                                                                              | field identifiers preserved                         | **56** `code` elements                                                                                                                         | PASS   |
| self-anchors (`#which-document-governs-which-step`, `#legal-and-normative-framework`, `#xml-schemas`, `#signature-and-xml-standards`, …) | each `id` present                                   | **all 9 present, 1 each**                                                                                                                      | PASS   |
| cross-page link `../guides/flow.md`                                                                                                      | resolves                                            | `href="../../guides/flow/"`                                                                                                                    | PASS   |
| destination preserved byte-for-byte incl. `%20` and parentheses                                                                          | yes                                                 | `…/Formato%20Comprobante%20Fiscal%20Electr%C3%B3nico%20(e-CF)%20V1.0.pdf`, `…/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%2032%20v.1.0.xsd` | PASS   |

Sample of the emitted markup (first table, first row) — a real cell grid, links are `href`s, no pipe
characters survive as text:

```html
<table>
  <thead>
    <tr>
      <th>Document</th>
      <th>Version / date</th>
      <th>What it governs</th>
      <th>Official link</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Ley núm. 32-23, Ley General de Facturación Electrónica</td>
      <td>16 May 2023</td>
      <td>
        The e-CF regime as law: mandatory issuance, the structure of the system,
        the implementation calendar
      </td>
      <td>
        <a
          href="https://dgii.gov.do/legislacion/leyesTributarias/Documents/Otras%20Leyes%20de%20Inter%C3%A9s/32-23.pdf"
          >PDF</a
        >
      </td>
    </tr>
  </tbody>
</table>
```

The three guides also render correctly: `flow.md` keeps its 3 tables and its Mermaid diagrams and now
carries **8** `Official source` blocks (one per numbered step 1–7 plus _Auxiliary flows_); `signing.md`
**1**; `resilience.md` **3**. Sections _The main flow_ and _Common mistakes_ have none, which is correct —
neither is a numbered step.

---

## 10. Discrepancies and items needing a decision

### D-1 — Per-citation access date is absent from the guides (Low, **open**; outside gates 1–7)

- **Expected:** tasklist Decision 5 fixes the line shape as
  `**Official source:** [<title>](<URL>) — <section / article>, accessed <YYYY-MM-DD>.` The issue's
  acceptance bullet reads "…working link (**access date noted where DGII URLs are known to move**)".
- **Actual:** each of the 12 citation lines in the three guides ends in DGII's own file date
  (`(site-updated 2026-05-29)`, `(v1.0, rev. 2022-05-24)`, …), never an access date. An access date
  exists exactly once, on the reference page: **`Access date for every row: 2026-11-09.`**
- **Assessment:** the site as a whole does state the access date, and the site-updated dates are
  register-backed and arguably more informative than a bare "accessed" stamp. But a reader who stays on
  `flow.md` cannot tell when the URL was last checked, which is the reading Decision 5 was written for.
- **Fix (one mechanical edit, 12 lines):** append `, accessed 2026-11-09` to each `**Official source:**`
  line in `docs/en/guides/{flow,signing,resilience}.md` — e.g. `… (site-updated 2026-05-29), accessed
2026-11-09.` — then re-run `prettier --check docs/en`. If the page-level access date is deemed
  sufficient, amend Decision 5 in the tasklist instead so contract and artifact agree.

### D-2 — "Auxiliary flows" carries a citation; two governance artifacts disagree (informational)

- **Expected (tasklist Decision 6):** "`Auxiliary flows` and `Common mistakes` are not numbered steps and
  get **no** citation lines."
- **Expected (ledger, Stage 4 task T4):** "Evidence that counts: **All 7 numbered steps + aux flows**
  cite a governing document."
- **Actual:** `flow.md` has one citation line under _Auxiliary flows_ and none under _Common mistakes_.
- **Assessment:** the implementation matches the ledger (T4), which is the later artifact and the one the
  validator is scored against; the issue text ("each numbered step") is silent, so nothing is violated.
  No change to the deliverable — correct the tasklist to match T4.

### O-1 — The repo's docs workflow fails at the translation-parity step until the es mirror lands

```text
$ diff <(cd docs/en && find . -name '*.md' | sort) <(cd docs/es && find . -name '*.md' | sort)
10d9
< ./reference/dgii-official.md
(exit 1)
```

`docs/es/` has 10 `.md` files, `docs/en/` now has 11. This is issue acceptance item 1 ("both locales …
CI locale-diff check passes"), owned by task T6, which the ledger already lists as `PENDING — blocked by
C-2`. **Not a defect of this deliverable**, but the branch cannot be merged until T6 and T7 land; the
`docs` workflow stays red in the meantime. Recorded so nobody reads "build green" as "CI green".

### O-2 — `/es/reference/dgii-official/` serves the English page as a fallback (informational)

`site/es/reference/dgii-official/index.html` (56,008 B) is emitted with the English heading (`Official
DGII references`) because `mkdocs.yml` sets `fallback_to_default: true`. Spanish readers get the English
page instead of a 404 until T6. Correct plugin behaviour, expected at this stage.

### O-3 — Cosmetic register paraphrase in the date column (informational, no action)

`TEC-03` "escape rules 2025-04-03" vs the register's "escape rules added 2025-04-03"; `STD-01/02/03`
"W3C Recommendation" vs "W3C REC". Same facts, same dates.

### O-4 — Two `http://` W3C algorithm URIs in `signing.md` (informational, no action)

`http://www.w3.org/TR/2001/REC-xml-c14n-20010315` and `http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`
are pre-existing inline-code identifiers, not links, and W3C redirects both to `https`. Not part of this
diff; do not "fix" them under #124 (out of scope).

---

## 11. Coverage gaps / what a later run should re-check

- **Point-in-time links.** Every status above was observed once from this machine on 2026-11-09. DGII
  republishes files in place, so a `200` is not a content guarantee; `MANIFEST.json` hashes are the
  content signal for the 15 XSDs, not this table.
- **Two scans are not text-verifiable** (`leg01`, `leg02`), as stated in §7.
- **No browser pass.** This deliverable changes prose and tables only and adds no interactive element, so
  the rendered-HTML assertions in §9 stand in for screenshots. A visual diff of the page should ride
  along with the nav task T7, when the page first appears in navigation.
- **Not tested by design:** nav entry, `nav_translations` key, `docs/es` content, and en/es link
  byte-identity — tasks T6/T7.

---

**Evidence produced by:** EvidenceQA · **Screenshots:** none (static page; the DOM assertions in §9 are
the evidence) · **Raw artifacts:** `/tmp/qa124/{urls.txt,probe_list.txt,results.tsv,url_table.md,register_match.txt,title_pairing2.txt,copy-check.txt,date-check.txt,date-check-page.txt,mkdocs-build.log}`
