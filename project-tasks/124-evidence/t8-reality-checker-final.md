# T8 — Final integration gate (Reality Checker), issue #124

**Reviewer role:** Reality Integration (final gate; reviewer only, no file in the repository was modified)
**Date of this run:** 2026-11-09 (−04:00) · **Branch:** `docs/124-dgii-official-sources` · **HEAD:** `b44ebb4`
**Change under review:** uncommitted working tree (7 modified tracked files + 2 new reference pages + run artifacts)
**Inputs re-tested, not trusted:** `gh issue view 124`; `project-tasks/124-dgii-official-sources-ledger.md`;
`project-tasks/124-source-register.md`; all 13 files in `project-tasks/124-evidence/` (t1 ×3, t2 ×3, t3 ×2, t4t5 ×2, t6 ×2, t7 ×1).

---

## 1. Verdict

# PASS

**Scope of the PASS: the documentation change is fit to publish on the public site.** All six acceptance
bullets of #124 were re-executed by me from scratch — the CI locale diff, the `--strict` build, the nav and
`nav_translations` in both locales, the 43-row catalogue in both locales, every one of the 43 external links
(`43/43 HTTP 200`), and the "no copied DGII content" rule (measured, not assumed: **0 shared 12-, 15- and
20-grams** against five DGII PDFs). I did not take a single sub-gate claim on trust: I re-downloaded
TEC-01/02/03/10 and NG 01-2020 and re-derived the six riskiest factual statements on the pages (RD$250,000
routing, the multipart `xml` field, `secuenciaUtilizada`, the commercial-approval wording, the B2B exclusion
attribution, the 12-vs-3 schema hashing), and I checked 20+ "site-updated" dates against DGII's own listing
page instead of against the register. Every one reproduced, several of them to the character. This is not a
"first pass looks fine" approval: it is attempt-3/attempt-2 evidence that survived an independent rebuild.

**The PASS carries three conditions that land on T9 (commit/PR packaging), not on the content.** (a) The nav
**shape** deviates from the run's own tasklist (Decision 7 / D8 requires a flat entry and the issue author's
sign-off; the delivered nav is a `Reference:` group) — the published nav is correct and translated in both
locales, but the deviation is undocumented in the tasklist, which T7 flagged as F1 and no one has closed.
(b) The ledger rows for T3–T7 still read `PENDING — blocked by C-1`, contradicting the evidence files.
(c) `git add -A` would sweep in an unrelated pre-existing orphan (`project-docs/marketing/github-listing.md`)
and must not. None of the three changes a byte of what ships; all three are traceability/staging defects that
would embarrass the PR.

**I deliberately did not upgrade this to "A+" or claim "nothing left to say."** Eleven residual risks are
listed in §5, four of them real (one medium), and one of them (R-2, the `canReuseSequence` code defect) is a
product bug the docs describe correctly and cannot fix. `project-tasks/124-evidence/.pdfcache/` — the 22-file,
28 MB binary cache the T6 evidence warned about — **is absent** from the tree today; I verified that, and I
verified that the evidence directory contains 13 markdown files and nothing else (440 KB total).

---

## 2. What I actually ran (this machine, this run)

```bash
cd /home/deuriib/projects/dgii-ecf
gh issue view 124
git status --short ; git diff --stat ; git diff --name-only ; git diff --cached --name-only
git status --porcelain -uall | grep '^??'                      # untracked inventory
find project-tasks/124-evidence -type f | sed 's/.*\.//' | sort | uniq -c   # 13 md, nothing else
ls project-tasks/124-evidence/.pdfcache                        # No such file or directory
file -b on every untracked path                               # no binary, no key material

# acceptance 1 + 5, verbatim from .github/workflows/docs.yml
diff <(cd docs/en && find . -name '*.md' | sort) <(cd docs/es && find . -name '*.md' | sort)   # exit 0
uvx --from mkdocs --with mkdocs-material --with "mkdocs-static-i18n>=1.0,<2" mkdocs build --strict
test -f site/es/index.html                                     # exit 0
packages/typescript/node_modules/.bin/prettier --check docs/ mkdocs.yml   # exit 0

# acceptance 3 + 4 + link re-request: URLs taken from the BUILT pages, not from markdown
python3 <extract hrefs from <article> of the 8 generated pages>  # 43 distinct external URLs
while read -r u; do curl -sS -A <browser UA | curl UA for www.w3.org> -L -o /dev/null \
  -w '%{http_code}\t%{content_type}\t%{size_download}' "$u"; done  # 43/43 → 200
curl -sS -A <browser UA> -o /dev/null -w '%{http_code}' https://www.w3.org/TR/xmldsig-core1/   # 403
curl -sS                     -o /dev/null -w '%{http_code}' https://www.w3.org/TR/xmldsig-core1/   # 200

# acceptance 6: verbatim-content measurement (not a grep for "copied")
uvx --from pypdf python <normalise docs+5 DGII PDFs, extract n-grams>   # N=8:5, N=12/15/20: 0

# risky claims, from the regulators' own PDFs
curl -A <browser UA> -o tec0{1,2,3}.pdf/-o tec10.pdf -o ng0120.pdf <the five URLs the pages cite>
uvx --from pypdf python <page-level extraction of §Autenticación, Recepción de e-CF, RFCE,
                          consultaresultado, Nombre de los Archivos XML, §19 Operación en Contingencia,
                          NG 01-2020 Arts. 8/9/11/12/14>
curl -A <browser UA> https://statusecf.dgii.gov.do/api-docs/v1/definition.json    # 200, 3 paths, Ambiente enum [1,2,3]
curl -A <browser UA> https://dgii.gov.do/.../Paginas/documentacionSobree-CF.aspx  # 200, 33 dated entries
```

Two environment notes that matter for anyone reproducing this: (1) `www.w3.org` answers **403** to the
chrome-style UA this harness normally sends and **200** to a bare `curl` UA — the UA divergence the register
documents is real and reproduced; a real browser is unaffected. (2) The build emits Material's
end-of-life banner, whose text contains the token `NO_MKDOCS_2_WARNING`; `grep -c WARNING` therefore reads
`1` on a log with **zero** warnings. `grep -c 'WARNING *-'` → `0`.

---

## 3. Acceptance criteria — judged one by one, independently

| #   | Criterion (from `gh issue view 124`)                                                                                                   | What I ran                                                                                                                                                               | Observed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Verdict  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | New reference page in **both** locales, identical file list (CI locale diff passes)                                                    | `diff <(cd docs/en && find . -name '*.md' \| sort) <(cd docs/es && find . -name '*.md' \| sort)`; then the same over **all** files, not just `*.md`                      | `diff` exit **0**, 11 `.md` per locale; all-file diff exit **0** (`reference/dgii-official.md` exists in both)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | **PASS** |
| 2   | `mkdocs.yml` nav updated for both locales, incl. `nav_translations` for the new entry                                                  | `git diff mkdocs.yml` (`+4 −0`); build log; parse `md-nav--primary` in `site/index.html`, `site/es/index.html`, `site/guides/flow/`, `site/es/guides/flow/`              | `Reference: → reference/dgii-official.md` in `nav:`; `Reference: Referencia` + `Official DGII references: Referencias oficiales de la DGII` in the `es` map; build logs `Translated 13 navigation elements` (11 baseline + 2); rendered nav: EN `Official DGII references → reference/dgii-official/`, ES `Referencias oficiales de la DGII → reference/dgii-official/`, correct `../../` depth from a guide page; language switcher round-trips (`../../es/reference/dgii-official/` ↔ `../../../reference/dgii-official/`)                                                                                                                                                                                                                    | **PASS** |
| 3   | Every numbered step in the flow guide cites ≥1 official DGII document by title **and** working link, access date noted where URLs move | `grep -c 'Official source' docs/{en,es}/guides/flow.md`; `grep -n '^## ' docs/en/guides/flow.md`; 43-URL `curl` sweep from the built pages                               | 7 numbered steps (`## 1. Authenticate` … `## 7. Reconcile`) **plus** `## Auxiliary flows` each carry one `**Official source:**` / `**Fuente oficial:**` line naming documents by title and linking to `dgii.gov.do` / `statusecf.dgii.gov.do`; **8 lines in EN, 8 in ES**, same order, same URLs. Access date is carried **once per page** (`Official links on this page were verified on 2026-11-09`) and **per row on the reference page** (`Access date for every row: 2026-11-09`), plus DGII's own `site-updated <date>` beside each document. See RR-2 for the per-link variant not being used                                                                                                                                            | **PASS** |
| 4   | `signing.md` and `resilience.md` gain their governing DGII references **alongside** the existing standards links                       | `git diff docs/en/guides/signing.md docs/en/guides/resilience.md` and the ES twins                                                                                       | `signing.md`: the W3C algorithm bullets (`xmldsig-core1`, `xmldsig-more#rsa-sha256`, `URI=""`) are untouched and a `**Official source:**` bullet adds _Firmado Comprobantes Fiscales Electrónicos (e-CF)_ + _Descripción Técnica Servicios Emisores Electrónicos / Firmado de XML_ — 1 citation line in each locale. `resilience.md`: three citation lines in each locale — _Informe Técnico_ §19 + _Instructivo de Contingencia_ (contingency, scoped by the lead-in "When a transmission fails and you fall back to contingency, this governs it"), _Estándares de Comportamiento_ §5.2–5.3 (idempotency, with "The keying scheme is the SDK's design"), _Descripción Técnica Servicios DGII_ (the reuse flag). Counts identical EN/ES: 8/1/3 | **PASS** |
| 5   | `mkdocs build --strict` passes locally (no broken nav or links) in both locales                                                        | The exact CI command, from a clean `site/` (mkdocs cleans it itself)                                                                                                     | **exit 0**, `Documentation built in 2.10 seconds`, **0** `WARNING -` records; builds `en` → `site/`, `es` → `site/es/`; `site/reference/dgii-official/index.html` (59,897 B) and `site/es/reference/dgii-official/index.html` (61,485 B) both emitted; `test -f site/es/index.html` exit 0. Independently resolved every non-http `href` in `<article>` of the 8 pages (internal pages **and** `#anchors`): **0 broken**                                                                                                                                                                                                                                                                                                                        | **PASS** |
| 6   | No DGII content copied verbatim — links and short attributions only                                                                    | Normalised (accent-stripped, punctuation-stripped, lowercased) the 8 pages and the full text of TEC-01, TEC-02, TEC-03, TEC-10, NG 01-2020, then intersected n-gram sets | **N=12: 0 shared n-grams. N=15: 0. N=20: 0.** N=8 finds 5 hits total across 8 pages, and every one is unavoidable attribution vocabulary: `recepción de resumen factura de consumo electrónica (rfce)` (a DGII service/document name, 4 pages) and `hasta el 31 de diciembre del año siguiente` (a date expression in the ES routing row). No passage, no paragraph, no table is reproduced                                                                                                                                                                                                                                                                                                                                                     | **PASS** |

---

## 4. The things the sub-gates could have missed

### 4.1 Cross-locale consistency — measured, not read

I compared the two reference pages structurally rather than by eye:

| Measure                                             | EN                                     | ES                                           | Equal                                                                                                                        |
| --------------------------------------------------- | -------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Table rows                                          | 60                                     | 60                                           | ✔                                                                                                                            |
| Column-count vector                                 | `[4,4,…]` (60)                         | `[4,4,…]` (60)                               | ✔                                                                                                                            |
| Document rows (with link column)                    | 43                                     | 43                                           | ✔                                                                                                                            |
| Rows per section                                    | 7 / 6 / 5 / 15 / 4 / 6 (+10 step rows) | 7 / 6 / 5 / 15 / 4 / 6 (+10 step rows)       | ✔                                                                                                                            |
| Link occurrences / distinct                         | 83 / 45                                | 83 / 45                                      | ✔                                                                                                                            |
| Ordered link sequence                               | —                                      | —                                            | ✔ except index 7, the one in-page anchor (`#which-document-governs-which-step` ↔ `#que-documento-rige-cada-paso`)            |
| Rows whose **digit multiset** differs               | —                                      | —                                            | **0 of 60**                                                                                                                  |
| Translation drift in the version/date column        | `site-updated`, `May/Oct/Jan/Apr`      | `actualizado en el sitio`, `may/oct/ene/abr` | only the translated tokens; **no version number, no date and no ordinal moved**                                              |
| Residual English in ES (month tokens `Jan\|Feb\|…`) | —                                      | —                                            | **0** (the T6 attempt-2 O-4 nit — `May`/`Oct`/`Oct` capitalised — **has since been closed**; I re-checked the current bytes) |

Same 43 documents, same order, same versions, same URLs. The one anchor that differs is translated, which is
correct behaviour, not drift. **No translation drift found.**

### 4.2 The claim that matters — six riskiest statements, re-derived from DGII's own PDFs

| Statement on the page                                                                                                         | Where it appears                                                                                                                                     | What DGII actually publishes (my extraction)                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Verdict                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| E32 **≥ RD$250,000** → general reception; **below** → RFCE summary; the general service does not accept a below-threshold E32 | `flow.md` §3 citation + table + main-flow graph; reference page row _Routing_; `Common mistakes` row 1                                               | TEC-02 p. 12 (_Recepción de e-CF_): "Las Facturas de Consumo Electrónicas con un monto inferior a los RD$250,000.00 **no serán recibidas por este servicio**, se deberá remitir un resumen"; p. 15 (_Recepción de resumen… RFCE_): "con un monto **superior o igual** a los RD$250,000.00 deben ser remitidas … por el servicio de Recepción de e-CF"; p. 6 format table: `Resumen Factura de Consumo (32 < 250,000.00)`. TEC-01 §9 is literally titled "Factura de Consumo Electrónica menor a DOP$250 mil" | **Supported** (first-hand)                                                                                                  |
| The reception takes a multipart field named `xml`                                                                             | `flow.md` §5 citation; reference page row _Submit_                                                                                                   | TEC-02 p. 14: `-H 'Content-Type: multipart/form-data'` + `-F 'xml=@response_…xml;type=text/xml'`, input table `xml*`; same on pp. 11, 17, 33                                                                                                                                                                                                                                                                                                                                                                 | **Supported**                                                                                                               |
| `secuenciaUtilizada` is published **in the trackId/result consult**, and is the reuse signal                                  | `flow.md` §6 citation; reference page rows _Track_ and _Reconcile_; `resilience.md`                                                                  | TEC-02 p. 23 `REQUEST URL …/consultaresultado/api/consultas/estado?trackid=…` with `"secuenciaUtilizada": true` in the JSON; p. 24 XML `<RespuestaConsultaTrackId> … <secuenciaUtilizada>true</secuenciaUtilizada>` and the semantics "puede reutilizarse … en el escenario de que el resultado … haya sido _Rechazado_". The state consult (`RespuestaConsultaEstado`, pp. 27–28) has 11 elements and **no** such flag — the page's _Reconcile_ row says so explicitly ("not part of the state consult")    | **Supported**                                                                                                               |
| The commercial-approval duty carries **no article number and no date**                                                        | `flow.md` _Auxiliary flows_ bullet; reference page row _Commercial approval_                                                                         | NG 01-2020 Art. 8 ¶I: "…o mediante su remisión en el Formato de Envío de Costos y Gastos (606) **en la siguiente fecha de presentación del formato**" — a relative event, no calendar date, no deadline in days. `Artículo 14. Consultas` is consultation only. I grepped the four public pages: the **only** article numbers present are `Art. 11(c)` and `Art. 12`; **`Art. 14` appears zero times**, as does any AC deadline                                                                              | **Supported**; the forbidden citation is absent                                                                             |
| The B2B type exclusion is the **SDK's** rule, not DGII's                                                                      | reference page `!!! warning`; `flow.md` `Common mistakes` row 6 ("The SDK refuses it (`enforceB2BRules`); DGII's documents state no such exclusion") | SDK: `packages/typescript/src/reception.ts:151` `B2B_EXCLUDED_TYPES = ['41','43','45','46','47']`, `checkB2BApplicability` also rejects an E32 below the threshold and any `RFCE` root; Python twin `reception.py:125`. DGII: I found **no** published list of types excluded from the direct issuer↔receiver flow in TEC-01/02/03, NG 01-2020 or the ARECF/ACECF material                                                                                                                                   | **Correctly attributed to the SDK** — and the warning's SDK description is accurate, including the E32-below-threshold case |
| 12 schemas pinned with `sha256`, 3 excluded **without** hash                                                                  | reference page _XML schemas_ note, both locales                                                                                                      | `examples/fixtures/schemas/MANIFEST.json`: `schemas` **12** (all 12 carry `sha256`), `excluded` **3** (`e-CF 31`, `RFCE 32`, `ACECF`, no hash field). The page says exactly that, and the register's own 15-vs-12 overstatement (T2 attempt-3 D1 / ledger R-1) **did not reach the public page**                                                                                                                                                                                                             | **Supported**; the escalated register defect has no public footprint                                                        |

Two bonus verifications, because the version/date column is 60 claims on its own: I fetched DGII's
`Paginas/documentacionSobree-CF.aspx` (200, 385,863 B, 33 dated entries) and compared its
`Modificado: dd/mm/yyyy` to the page's `site-updated` cells. **20+ of 20 matched**, e.g. _Descripción Técnica
Servicios DGII_ 29/05/2026, _Estándares de Comportamiento_ 06/11/2026, _Firmado de e-CF_ 22/11/2023,
_Semilla v.1.0_ 12/11/2020, _ACECF v.1.0_ 21/12/2022, `e-CF 33/34` 01/04/2026. The one row that uses a
non-listing date — _Formato Anulación de e-NCF_, `v1.0, rev. 2022-05-24` — is the PDF's own revision stamp,
which I extracted: p. 2 reads `24-05-2022`. Accurate, and labelled `rev.` rather than `site-updated`.

### 4.3 Did the change stay docs-only? Yes.

```
$ git status --short
 M docs/en/guides/{flow,resilience,signing}.md
 M docs/es/guides/{flow,resilience,signing}.md
 M mkdocs.yml
?? docs/{en,es}/reference/          ?? project-tasks/124-*   ?? project-docs/marketing/

$ git diff --stat
 docs/en/guides/flow.md 44 ++ | resilience 13 ++ | signing 7 ++
 docs/es/guides/flow.md 45 ++ | resilience 14 ++ | signing 9 ++
 mkdocs.yml 4 ++        7 files changed, 116 insertions(+), 20 deletions(-)
```

- **`packages/**` untouched. `examples/**` untouched. The vendored XSDs untouched** (no path under
  `packages/typescript/schemas/`, `packages/python/src/py_dgii_ecf/schemas/` or `examples/fixtures/schemas/`
  appears in `git status`, `git diff --name-only` or the untracked list; the three schema copies are
  therefore still byte-identical because nobody wrote to any of them).
- **No changelog, no version field, no lockfile.** `mkdocs.yml` is the only non-`docs/` tracked file, `+4 −0`.
- `git diff --cached` is **empty** (nothing staged) and `git stash list` is empty.
- **No binary, no secret, no `.pdfcache`.** `project-tasks/124-evidence/` holds **13 markdown files, 440 KB
  total**; `file -b` on every untracked path returns text; `.pdfcache/` **does not exist** (the 22-file,
  28 MB commit hazard the T6 evidence raised was cleaned up, not merely gitignored — it is not in
  `.gitignore` either, so its absence is the only thing protecting the commit).
- **The change reduces internal-repo links on public pages.** `blob/main` occurrences under `docs/`:
  **4 at HEAD → 2 now**. The two removed are the `project-docs/dgii-ground-truth.md` pointers in
  `docs/{en,es}/guides/flow.md` (the issue's "public site is self-contained" requirement). The 2 remaining
  are the pre-existing `SECURITY.md` links in `faq.md`, unchanged by this work.

### 4.4 Would a reader be misled? The single most likely misreading

**The most likely misreading is the sign order for a below-threshold E32.** `flow.md`'s main-flow graph draws
`E32 < RD$250,000 → convertECF32ToRFCE() "summary of the signed E32" → Sign`, i.e. **one** signing node after
the conversion, while the prose twenty lines later says the summary "is built from the **already signed**
E32". An integration team skimming the graph can conclude that the E32 does not need signing before
conversion, get an unsigned input into `convertECF32ToRFCE`, and then be surprised when the RFCE's
`CodigoSeguridadeCF` does not match DGII's expectation — the doc's own code sample only saves it if the reader
notices the variable is named `signedEcf`.

**Is it pre-existing? Yes.** `git diff docs/en/guides/flow.md` shows the graph and that sentence are untouched
context; the only text this change alters there is the `Common mistakes` table width and its last row. The new
`**Official source:**` line arguably _raises_ the risk slightly by making the graph look audited ("Every step
below matches the official DGII documents") — but the graph is not the artefact DGII governs, and no new false
statement was introduced. Verdict: **pre-existing, worth its own docs issue, not a reason to hold #124.**

Two lesser readings, both also pre-existing or explicitly fenced off: (i) a reader may take "only sequences
never sent to DGII nor delivered to the buyer may be voided" as a DGII-article claim — it is attributed to the
_Formato Anulación de e-NCF_ and NG 01-2020 **Art. 12**, which carries only the credit/debit-note route, so
the attribution is right but the article number covers less than the sentence; (ii) a reader may believe DGII
endorses the SDK's B2B guard — that is now explicitly forbidden by the `!!! warning` on the reference page,
which is the change working as intended.

### 4.5 Trailing quality

| Check                                                                                      | Result                                                                                                                                                         |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TODO` / `FIXME` / `TBD` / `XXX` / `Lorem` / `placeholder` (case-sensitive) in the 8 pages | **0** (a case-insensitive `TODO` grep is a false positive trap: it matches Spanish `todo`/`todos`, which is why one ES row and one ES sentence look like hits) |
| Literal `...` ellipsis / stub text                                                         | **0**                                                                                                                                                          |
| Duplicate headings / dead anchors on the 4 pages ×2 locales                                | **0** duplicate heading slugs; **0** broken in-page anchors; **0** broken relative links in the built HTML                                                     |
| Internal repo links (`project-docs`, `project-tasks`, `blob/main`) on the 8 pages          | **0**                                                                                                                                                          |
| Trailing whitespace, missing final newline                                                 | none; both new pages end in `0a`                                                                                                                               |
| `prettier --check docs/ mkdocs.yml`                                                        | exit **0**, "All matched files use Prettier code style!"                                                                                                       |

---

## 5. Residual risks

| ID        | Risk                                                                                                                                                                                                                                                                                                                                                                                                                                 | Severity                                        | Blocks shipping?                                                                                                               | Owner / action                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **RR-1**  | **Nav shape deviates from the run's own plan.** Tasklist Decision 7 / D8 / D6 / T10 specify a _flat_ entry, **one** `nav_translations` key, `+2` lines, `Translated 12`; delivered is a `Reference:` **group**, **two** keys, `+4` lines, `Translated 13`. D8 says deviating "requires the issue author's sign-off" and **no sign-off artifact exists**. The rendered nav is correct and fully translated in both locales either way | **Medium** (traceability, not behaviour)        | **No** — the issue's own acceptance bullet is satisfied. But it must not reach the PR unexplained                              | T9 owner: either record the author's sign-off + amend Decision 7/T10/D6/A2, or apply the 2-line flatten (t7 §8 F1 option b) and re-run T7 |
| **RR-2**  | **Per-link access dates were replaced by one page-level date.** Tasklist Decision 5 wanted `, accessed <YYYY-MM-DD>` on each citation line; delivered is one `!!! note "Link verification"` per page (`verified on 2026-11-09`) plus the reference page's `Access date for every row: 2026-11-09` and DGII's own `site-updated` per document                                                                                         | **Low**                                         | **No** — the acceptance bullet is satisfied by a dated, per-page verification statement; a per-link stamp is strictly stronger | Optional follow-up; if the owner wants literal Decision 5, it is a mechanical edit                                                        |
| **RR-3**  | **Ledger rows contradict the evidence.** `124-dgii-official-sources-ledger.md` still shows T3 `PENDING — blocked by C-1`, T4/T5/T6 attempt `0`, and a malformed T7 row, while the evidence files record **PASS at attempt 2** for T3, T4/T5, T6 and PASS at attempt 1 for T7. The ledger's own start date (`2026-02-14`) also disagrees with every evidence timestamp (`2026-11-09`)                                                 | **Low–Medium** (the ledger _is_ the run record) | **No** for the docs; **yes** for a clean T9                                                                                    | T9: rewrite T3–T7 verdicts from the evidence files and fix the date before opening the PR                                                 |
| **RR-4**  | **`project-docs/marketing/github-listing.md` is an untracked orphan inside a protected path.** mtime `2026-11-03`, six days before this work — not created by #124, but `git add -A` / `git commit -a` would ship it as part of a docs commit and it is **not** gitignored                                                                                                                                                           | **Low** (commit hygiene)                        | **No**, if T9 stages explicitly                                                                                                | T9: `git add docs/ mkdocs.yml` only; leave the orphan out (or land it in its own task)                                                    |
| **RR-5**  | **`canReuseSequence` / `can_reuse_sequence` is fed from `inquiryStatus` (`consultaestado`), where `secuenciaUtilizada` does not exist, so it is always `false`** (ledger R-2, refuter finding 1, reproduced by me from TEC-02 pp. 23–28). The docs are correct ("the reuse flag … is not part of the state consult") — the **SDK** is wrong                                                                                          | **Medium** (product bug)                        | **No** — #124 explicitly excludes SDK code changes                                                                             | Needs its own issue against `packages/*`; do not "fix" it in this docs branch                                                             |
| **RR-6**  | **`packages/typescript/src/reception.ts:162–164` still contains the comment "DGII excludes E32 below RD$250,000 … plus E41, E43, E45, E46 and E47"**, which the public page now correctly contradicts ("DGII's published documents state no list"). A reader who opens the source sees the old attribution                                                                                                                           | **Low**                                         | **No** (docs-only scope forbids touching it)                                                                                   | Follow-up code commit: reword the comment to match the docs                                                                               |
| **RR-7**  | **Ledger escalations R-1 and R-2 are still `OPEN`.** R-1 (register prose: `sha256` covers 12 not 15; Aviso 07-23 date is in the body not the closing line) is **mitigated to zero public footprint** — I verified both statements on the pages are correct. R-2 is RR-5 above                                                                                                                                                        | **Low** (R-1)                                   | **No** for R-1                                                                                                                 | Close R-1 in the ledger with a pointer to this file; keep R-2 open as a code issue                                                        |
| **RR-8**  | **All link statuses are a single observation** (2026-11-09). DGII republishes in place and the site has already demonstrated slug churn (`documentacionSobre-e-CF.aspx` → 404, `documentacionSobree-CF.aspx` → 200). The pages warn about exactly this                                                                                                                                                                               | **Inherent**                                    | **No** — mitigated by the on-page warning and by `MANIFEST.json` hashes for the 12 pinned schemas                              | Nothing further; re-measure at release time if the pages are touched again                                                                |
| **RR-9**  | **One "site-updated" is a different kind of date**: _Formato Anulación de e-NCF_ shows `v1.0, rev. 2022-05-24` (the PDF's internal revision stamp) where every neighbour shows DGII's listing date (`Modificado 20/06/2022` for the same file). Both are true; the column mixes two sources for one row                                                                                                                              | **Low**                                         | **No**                                                                                                                         | Optional: label it as the document's revision date, or add the listing date                                                               |
| **RR-10** | **Pre-existing reader trap**: the main-flow graph implies a single signing step after the E32→RFCE conversion while the prose and the code sample require signing the E32 first (§4.4)                                                                                                                                                                                                                                               | **Low–Medium** (docs clarity)                   | **No** — pre-existing, unchanged by this diff                                                                                  | Separate docs issue; do not expand #124                                                                                                   |
| **RR-11** | **This harness gets `403` from `www.w3.org` with a browser-style UA and `200` with a bare curl UA.** Anyone re-running the link sweep without the per-host UA rule will record 3 false failures                                                                                                                                                                                                                                      | **Informational**                               | **No**                                                                                                                         | Keep the register's UA recipe in the PR body so the next auditor does not raise a phantom                                                 |

**No residual risk is a shipping blocker.** Nothing on these pages asserts a DGII rule the regulator's
documents do not support; the four items that could embarrass the PR (RR-1, RR-3, RR-4, and closing RR-7/R-1)
are all commit-time bookkeeping.

---

## 6. Evidence index — which file proves which criterion

| Evidence file                                       | What it proves                                                                                                                                                                                                                                        | Its verdict                                | How I re-tested it                                                                                                                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `t1-refuter-register.md`                            | Attempt 1 of the internal register: not safe to publish from                                                                                                                                                                                          | **FAIL**                                   | Read for the finding list only; superseded                                                                                                                                                      |
| `t1-refuter-register-attempt2.md`                   | Attempt 2: 18 new defects (N-1…N-18)                                                                                                                                                                                                                  | **FAIL**                                   | Read for the finding list only; superseded                                                                                                                                                      |
| `t1-refuter-register-attempt3.md`                   | Attempt 3: every prior finding resolved against freshly extracted PDFs; 4 cosmetic residuals (L-1…L-4)                                                                                                                                                | **PASS**                                   | Spot-re-derived 4 of its facts (TEC-02 §Recepción, NG 01-2020 Art. 8 ¶I, Art. 12, `secuenciaUtilizada`) — reproduced                                                                            |
| `t2-evidence-collector-links.md`                    | Attempt 1: 47/47 URLs `200`, but register self-claims wrong                                                                                                                                                                                           | **FAIL**                                   | Superseded                                                                                                                                                                                      |
| `t2-evidence-collector-links-attempt2.md`           | Attempt 2: stale-slug blocker fixed                                                                                                                                                                                                                   | **FAIL**                                   | Superseded                                                                                                                                                                                      |
| `t2-evidence-collector-links-attempt3.md`           | **URL layer clean: 50/50 targets `200`, 15/15 manifest URLs byte-identical, UA recipe correct; 2 LOW prose defects (D1 15-vs-12 hash, D2 LEG-01 date location)**                                                                                      | PASS (gate) / FAIL (zero-discrepancy rule) | I re-ran the whole external sweep myself (43/43 `200`) and confirmed **both D1 and D2 were kept off the public pages** (§4.2, last row)                                                         |
| `t3-evidence-collector-en-docs.md`                  | EN attempt 1: gates 1–7 green, D-1 + D-2 open                                                                                                                                                                                                         | PASS w/ defects                            | Superseded                                                                                                                                                                                      |
| `t3-evidence-collector-en-docs-attempt2.md`         | EN attempt 2: 6/6 gates green, 45/45 links `200`, one sentence replaced, 3 byte-identical link-verification notes; **D-3 open** (scope paragraph contradicts itself)                                                                                  | PASS + D-3                                 | D-3 **is now closed in the delivered bytes** — the scope paragraph reads "together with the certification and contingency material those steps send readers to … DGII publishes more than this" |
| `t4t5-dgii-expert-en-citations.md`                  | Attempt 1: **blocking** D1 (page claimed completeness)                                                                                                                                                                                                | **FAIL**                                   | Superseded                                                                                                                                                                                      |
| `t4t5-dgii-expert-en-citations-attempt2.md`         | Attempt 2: D1 resolved, D2 resolved by scoping prefix, D3 closed; **R-1 required** (scope clause contradicts the OPS section) + W-1 optional (`"the whole set"`)                                                                                      | PASS + R-1/W-1                             | Both **applied**: `flow.md:7` now reads "lists **all of them**"; the scope paragraph carries the R-1 replacement clause near-verbatim (EN 182 lines / 44,763 B, mtime 12:12:07)                 |
| `t6-evidence-collector-es-mirror.md`                | ES attempt 1: FAIL on gates 4 & 5                                                                                                                                                                                                                     | **FAIL**                                   | Superseded                                                                                                                                                                                      |
| `t6-evidence-collector-es-mirror-attempt2.md`       | ES attempt 2: 8/8 gates green, 11/11 file parity, 104 URL occurrences per locale ordered-identical, D-1…D-5 resolved, **O-4 partially applied** (3 capitalised month tokens) + `.pdfcache` commit hazard                                              | **PASS**                                   | O-4 **is now fully closed** (I found 0 English month tokens in ES); `.pdfcache` **is gone**                                                                                                     |
| `t7-evidence-collector-nav.md`                      | Nav: `+4 −0`, `--strict` exit 0 / 0 warnings, negative control (3 "not in nav" INFO → 0, `Translated 11 → 13`), both emitted pages, rendered nav trees, CI parity commands verbatim; **F1** (shape vs plan) + **F2** (`mkdocs.yml` cannot land alone) | **PASS**, F1 needs a human decision        | Re-ran the build (exit 0, `Translated 13`), re-parsed both rendered navs, re-ran the parity commands. F2 is now resolved by the change set being complete in the tree                           |
| `project-tasks/124-source-register.md`              | The frozen internal truth (760 lines, 43 rows, 33 with a backed `§`, 10 deliberately blank)                                                                                                                                                           | frozen artifact                            | Used as a _claim_, verified against the PDFs for the six riskiest statements                                                                                                                    |
| `project-tasks/124-dgii-official-sources-ledger.md` | Run record, roster, pipeline contracts, escalations R-1/R-2                                                                                                                                                                                           | —                                          | Read; **RR-3** found (rows T3–T7 stale)                                                                                                                                                         |
| **this file**                                       | The six acceptance criteria re-executed end to end, the six riskiest claims re-derived from DGII PDFs, 20+ `site-updated` dates checked against DGII's listing page, cross-locale parity measured, docs-only scope, verbatim-copy measurement         | **PASS + 3 commit conditions**             | —                                                                                                                                                                                               |

---

## 7. What I could not verify

1. **The internal "34 sources".** The issue's premise is that `project-docs/dgii-ground-truth.md` rests on 34
   documents. No enumeration of those 34 exists in the repo, `dgii.gov.do` folder listings return `401`, and
   the page publishes 43 claim-derived rows instead. The ledger records this as a human decision
   (deuriib, 2026-02-14) and the page states it honestly ("assembled from 34 sources; this page is not that
   list and does not claim to be"). **I cannot confirm or refute the 34, and neither can anyone from the
   repository.** What I _can_ confirm is that the page does not pad to 34 and does not claim to be that list.
2. **Ley 32-23 and Decreto 587-24 as documents.** Both are image-only scans (0 extractable characters in the
   refuter's and my own reading). Their content claims are verified only through the DGII technical documents
   that quote them (TEC-01 §19 quotes Decreto 587-24 arts. 40–43; NG 01-2020 is extractable and carries the
   duties). The page says exactly this ("Two of these are scans … cited at title level only"), so the page is
   honest about the limit — but the underlying legal text was not machine-verified by anyone in this run.
3. **The authenticated service endpoints quoted in the flow** (`ecf.dgii.gov.do/{ambiente}/recepcion/...`,
   `fc.dgii.gov.do/.../consultarfce/...`). They require a token and a provisioned e-NCF; I did not call them,
   and they are not link-checkable. Their shape is verified only against TEC-02/TEC-01's published text.
4. **The true HTTP behaviour of the three `www.w3.org` RECs for a real browser.** I observed `403` for a
   chrome-like `curl` UA and `200` for a bare UA; I cannot distinguish "bot filtering triggered by header
   fingerprints" from anything else. A human browser click is outside what this harness can prove.
5. **Content-level equality of the PDFs over time.** Every status is a 2026-11-09 observation. For the 12
   pinned schemas, `MANIFEST.json` hashes are the real guard; the 3 excluded schemas carry **no hash**, so a
   silent re-publication of E31/RFCE 32/ACECF would be invisible to the SDK _and_ to this gate.
6. **The ES translation as a professional review.** I verified structural and numeric parity and the absence
   of English, drift and MT-flavoured phrasing on the risky claims; I am not a native-speaker reviewer and the
   full-page language quality judgement rests on the T6 attempt-2 review.
7. **Whether the owner accepts the nav group shape.** RR-1 is a decision, not a fact. Nothing in the repo
   records it.
8. **`mise run lint` / `mise run ci` (tsc, ruff, mypy, repo-wide prettier).** Out of scope for a docs-only
   change and not exercised by the `docs` workflow; I ran `prettier --check docs/ mkdocs.yml` (exit 0) and the
   exact `docs.yml` commands instead.

---

## 8. Conditions on the hand-off to T9 (commit + PR)

1. **Record the nav-shape decision (RR-1)** — either amend `124-dgii-official-sources-tasklist.md`
   Decision 7 / D6 / D8 / T10 / A2 to the group shape and note the author's sign-off, or flatten the two nav
   lines and re-run T7. Do not open the PR with the tasklist and the diff disagreeing silently.
2. **Bring the ledger up to date (RR-3)** — T3/T4/T5/T6 → PASS (attempt 2), T7 → PASS (attempt 1, F1 open),
   T8 → this file, and reconcile the `2026-02-14` start date with the `2026-11-09` evidence.
3. **Stage explicitly (RR-4)** — `git add docs/ mkdocs.yml` (plus `project-tasks/124-*` if the run artifacts
   are meant to ship). Never `git add -A`: `project-docs/marketing/github-listing.md` is an unrelated orphan
   from 2026-11-03. Confirm `git diff --cached --name-only` shows nothing under `packages/`, `examples/`,
   `project-docs/`, no `CHANGELOG*`, no lockfile, no `.pdfcache/`.
4. **Carry the UA recipe into the PR body** (RR-11) so the next auditor does not report three phantom W3C
   failures.

---

**Integration agent:** RealityIntegration · **Assessment:** PASS for publication, with four commit-time
conditions · **Re-assessment required:** no, unless the nav is flattened (RR-1 option b), in which case re-run
T7 only.
**Files written by this review:** this file only. `git status --short` and `git diff --stat` are byte-identical
to the state I found at the start of this run.

## Outcome

Outcome: PASS — the #124 docs change is fit to publish; all six acceptance bullets re-executed and green (locale diff exit 0, `--strict` exit 0 with 0 warnings, nav + `nav_translations` correct in both locales, 43/43 external links `200`, 0 verbatim DGII content at N≥12).
Details: 11 residual risks, none a shipping blocker; four are commit-time conditions — record the nav-group sign-off (tasklist Decision 7 wants a flat entry), update stale ledger rows T3–T7, stage explicitly (a `project-docs/marketing/github-listing.md` orphan and `.pdfcache/` must stay out), and carry the per-host UA recipe into the PR. The `canReuseSequence` code defect (R-2) stays out of scope; `.pdfcache/` is absent.
`project-tasks/124-evidence/t8-reality-checker-final.md` — verdict, per-criterion table with the commands I ran, six risky claims re-derived from DGII's PDFs, cross-locale parity measurements, residual-risk register, evidence index, and the eight things I could not verify.
