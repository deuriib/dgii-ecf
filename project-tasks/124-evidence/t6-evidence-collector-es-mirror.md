# QA evidence — issue #124, Spanish mirror of the official DGII references (attempt 1 of 3)

**Validator:** EvidenceQA (evidence collector, gate T6) · **Date:** 2026-11-09 (−04:00) ·
**Branch:** `docs/124-dgii-official-sources` · **HEAD:** `b44ebb4` (`chore: release main (#123)`; the whole docs change is still uncommitted working tree)

**Files under review — the `docs/es/` counterparts of the frozen English page set:**

| Path                                 | State              | Lines | Bytes  | mtime (−04:00) |
| ------------------------------------ | ------------------ | ----- | ------ | -------------- |
| `docs/es/reference/dgii-official.md` | new (untracked)    | 185   | 46,236 | 12:26:02       |
| `docs/es/guides/flow.md`             | modified `+35 −10` | 310   | 17,370 | 12:24:49       |
| `docs/es/guides/signing.md`          | modified `+9 −0`   | 82    | 3,726  | 12:24:13       |
| `docs/es/guides/resilience.md`       | modified `+13 −0`  | 146   | 6,458  | 12:24:13       |

**English originals compared against (claimed frozen):** `docs/en/reference/dgii-official.md` (182 lines /
44,763 B / 12:12:07), `docs/en/guides/flow.md` (306 / 16,851 / 12:12:11), `docs/en/guides/signing.md`
(78 / 3,506 / 12:01:42), `docs/en/guides/resilience.md` (144 / 6,226 / 12:01:42).

**Requirement sources:** `gh issue view 124`; `project-tasks/124-source-register.md` (frozen, revision 3);
`project-tasks/124-dgii-official-sources-tasklist.md` §3 Decisions 1–11 (Decision 9 = translation boundary).

---

## 1. Verdict

**ATTEMPT 1: FAIL — 2 of 8 gates fail. Gates 1, 2, 3, 6, 7 pass with zero discrepancies; gate 8 passes on
scope with one documented drift; gate 4 and gate 5 fail.**

The mirror is structurally and numerically exact: 11/11 locale file parity, 104 external-URL occurrences per
locale in **identical order** (45 distinct, identical host split), identical heading level/order/count on all
four pages, identical per-table row vectors, identical citation counts (8/1/3) in identical document order,
identical rendered counters (7 tables / 60 `<tr>` / 126 `href` …) and clean internal anchors. The accuracy
constraints from the English page are all carried over (no AC deadline article or date, B2B exclusion
attributed to the SDK guard, `secuenciaUtilizada` on the track step, `CodigoSeguridadeCF` hash marked as the
SDK's reading, no DGII-attributed ambiente labels, `2026-11-09` present and correct). Build and format gates
are green.

Both failures are localised and mechanical:

- **Gate 4 (FAIL).** Four English fragments survive inside Spanish prose: the connective `and` at
  `docs/es/reference/dgii-official.md:152` and `:161`, the phrase `(escape rules 2025-04-03)` at `:54`, and
  the label `site-updated`, left in English **48 times** across the four pages (29 in the reference page)
  even though Decision 9 requires table-cell prose to be translated and the same cells already translate
  `bitácora`.
- **Gate 5 (FAIL).** `by example` is rendered `por ejemplo` ("for example") twice — `reference:56` and
  `signing:13` — which inverts the sense of the attribution ("the profile _as demonstrated by_ an example")
  and reads as machine translation. Additionally `docs/es/guides/resilience.md` **drops one English
  sentence**: the lead-in `When a transmission fails and you fall back to contingency, this governs it:`
  is absent, so the contingency citation at line 22 hangs off the `nunca se reenvía a ciegas` sentence with
  no connection to contingency.

**No DGII attribution changes meaning.** Every one of the 12 guide citation lines and all 29 reference rows
were read side by side against the English on the same row/line: document identity, article/section number,
version, date and URL survive intact in all of them. The two gate-5 defects above are wording defects, not
attribution defects. The automatic-FAIL trigger ("alters the meaning of a DGII attribution") was therefore
**not** tripped; the FAIL is on the stated zero-tolerance rules for gates 4 and 5.

| #   | Gate                       | Expected                                                                              | Observed                                                                                                                                                                                | Result                            |
| --- | -------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1   | Locale file parity         | `diff` of the two `find \| sort` lists empty; `site/es/index.html` exists after build | 11 files each, `diff` exit 0; `site/es/index.html` = 26,822 B; 11 ES pages built                                                                                                        | **PASS**                          |
| 2   | URL parity per page        | identical URL set per page, both directions                                           | 81/81, 15/15, 4/4, 4/4 occurrences; **ordered** identity on all four; 45 distinct each; 0 only-in-EN, 0 only-in-ES                                                                      | **PASS**                          |
| 3   | Structural parity          | same heading levels/order/count; same table rows; same citations                      | headings 9/11/4/5 identical; row vectors `[7,6,5,15,4,6,10]`, `[3,5,6]`, `[],` `[4]` identical; citations 8/1/3 identical and in order; rendered counters identical                     | **PASS**                          |
| 4   | No untranslated prose      | zero English left in ES body prose                                                    | 4 distinct defects, 51 occurrences (`and` ×2, `escape rules` ×1, `site-updated` ×48)                                                                                                    | **FAIL**                          |
| 5   | Spanish quality spot-check | no literal MT, no register clash, no term drift, no attribution shift                 | 2 literal-MT hits (`por ejemplo` for `by example`), 1 dropped sentence; **no attribution shift**; register matches the pre-existing `docs/es/` pages                                    | **FAIL** (not a blocker per §7.4) |
| 6   | Accuracy carried over      | 6 named constraints hold in ES exactly as in EN                                       | all 6 hold; article/date multiset identical (`Art. 11`, `Art. 12`, `Art. 11(c)`); ISO-date multiset identical on all four pages                                                         | **PASS**                          |
| 7   | Build + format             | `prettier --check docs/es` exit 0; `mkdocs build --strict` exit 0                     | exit 0; exit 0 (1.90 s, 0 warnings); `site/es/**` renders                                                                                                                               | **PASS**                          |
| 8   | Scope                      | only `docs/en/**`, the 4 `docs/es/**` paths, `project-tasks/**`                       | exactly that + 1 pre-existing untracked orphan; `mkdocs.yml`, `packages/**`, `examples/**`, `project-docs/**` tracked-clean; **EN drifted 2 sentences since the last validation** (O-2) | **PASS** (drift documented)       |

---

## 2. Commands run (verbatim, with exit codes)

```bash
# [gate 1] exactly the two commands .github/workflows/docs.yml runs, plus the artifact check
diff <(cd docs/en && find . -name '*.md' | sort) <(cd docs/es && find . -name '*.md' | sort) ; echo "diff exit=$?"
(cd docs/en && find . -name '*.md' | sort) | wc -l ; (cd docs/es && find . -name '*.md' | sort) | wc -l
uvx --from mkdocs --with mkdocs-material --with "mkdocs-static-i18n>=1.0,<2" mkdocs build --strict   # EXIT=0
test -f site/es/index.html && stat -c%s site/es/index.html
find site/es -name index.html | sort

# [gate 2] naive pass (the gate as specified) then a balanced-destination re-extraction
for f in reference/dgii-official.md guides/flow.md guides/signing.md guides/resilience.md; do
  diff <(grep -o 'https[^)]*' docs/en/$f | sort) <(grep -o 'https[^)]*' docs/es/$f | sort)
done
python3 /tmp/qa124_detail.py    # markdown destinations [x](<url>) / [x](url) + inline-code URIs, ordered

# [gate 3] headings / tables / citations / rendered counters
diff <(grep -o '^#*' <(grep -n '^#' docs/en/$f)) <(grep -o '^#*' <(grep -n '^#' docs/es/$f))
python3 /tmp/qa124_tables.py reference/dgii-official.md guides/flow.md guides/signing.md guides/resilience.md
grep -c '\*\*Official source:\*\*' docs/en/$f ; grep -c '\*\*Fuente oficial:\*\*' docs/es/$f

# [gate 4] English-function-word scan outside code fences, inline code and URLs stripped
python3 /tmp/qa124_en.py docs/es/reference/dgii-official.md docs/es/guides/{flow,signing,resilience}.md
grep -o 'site-updated' docs/es/**/*.md | wc -l

# [gate 5] sentence-level EN↔ES alignment per section + targeted phrase checks
python3 /tmp/qa124_sent2.py {reference/dgii-official,guides/flow,guides/signing,guides/resilience}.md
grep -n -o 'por ejemplo[^.]\{0,60\}' docs/es/**/*.md ; grep -n -o 'by example[^.]\{0,40\}' docs/en/**/*.md

# [gate 6] constraint-by-constraint
python3 - <<'PY'  # Art. reference multiset + ISO-date multiset per page, EN vs ES
git diff docs/en/guides/resilience.md docs/es/guides/resilience.md

# [gate 7]
packages/typescript/node_modules/.bin/prettier --check docs/es ; echo "exit=$?"
packages/typescript/node_modules/.bin/prettier --check docs/en ; echo "exit=$?"
packages/typescript/node_modules/.bin/prettier --check .

# [gate 8]
git status --short ; git status --porcelain -uall -- docs/
git status --porcelain -uall -- mkdocs.yml packages examples project-docs
git diff --name-only -- mkdocs.yml packages examples project-docs
git diff --numstat docs/en/ docs/es/
stat -c '%y %s %n' docs/{en,es}/{reference/dgii-official.md,guides/flow.md,guides/signing.md,guides/resilience.md}
# EN drift pinned against the attempt-2 build snapshot preserved by the T3 run:
python3 /tmp/qa124_html.py /tmp/qa124b/site-previous-live/reference/dgii-official/index.html site/reference/dgii-official/index.html
python3 /tmp/qa124_html.py /tmp/qa124b/site-previous-live/guides/flow/index.html site/guides/flow/index.html
```

Helper scripts written by this run (throwaway, `/tmp` only): `qa124_en.py` (prose scanner), `qa124_tables.py`
(table row counter), `qa124_sent2.py` (per-section sentence alignment), `qa124_detail.py` (balanced markdown
destination parser), `qa124_html.py` (rendered `<article>` text differ). No file under `docs/`,
`mkdocs.yml`, the register or a prior evidence file was modified by this run.

---

## 3. Gate 1 — locale file parity (PASS)

The two commands the workflow runs, verbatim, plus the artifact test:

```text
$ diff <(cd docs/en && find . -name '*.md' | sort) <(cd docs/es && find . -name '*.md' | sort) ; echo "diff exit=$?"
diff exit=0
$ (cd docs/en && find . -name '*.md' | sort) | wc -l ; (cd docs/es && find . -name '*.md' | sort) | wc -l
11
11
```

Both trees carry the same 11 pages: `examples.md`, `faq.md`, `guides/{flow,releases,resilience,signing}.md`,
`index.md`, `installation.md`, `python.md`, `reference/dgii-official.md`, `typescript.md`. `reference/` is new
in both locales, so the mirror is complete at directory level too.

Build (the workflow's exact `uvx` invocation) and the artifact check:

```text
$ uvx --from mkdocs --with mkdocs-material --with "mkdocs-static-i18n>=1.0,<2" mkdocs build --strict
INFO    -  mkdocs_static_i18n: Building 'es' documentation to directory: .../site/es
INFO    -  The following pages exist in the docs directory, but are not included in the "nav" configuration:
  - es/reference/dgii-official.md
INFO    -  mkdocs_static_i18n: Translated 11 navigation elements to 'es'
INFO    -  Documentation built in 1.90 seconds
EXIT=0
$ test -f site/es/index.html && stat -c%s site/es/index.html
26822
```

11 ES pages are emitted, including `site/es/reference/dgii-official/index.html` (57,259 B). The orphan-page
`INFO` line is the same line the English build prints for `en/reference/dgii-official.md` and is **not** a
warning, so `--strict` stays green (the tasklist records this behaviour as verified). The missing nav entry
is therefore identical in both locales — it is the English deliverable's open item (T3 D-2), inherited here,
not an ES-specific defect.

---

## 4. Gate 2 — URL parity per page (PASS)

Both extraction methods agree. First the literal gate (`grep -o 'https[^)]*' … | sort | diff`):

| Page                         | EN distinct | ES distinct | `diff`         | only-in-EN | only-in-ES |
| ---------------------------- | ----------- | ----------- | -------------- | ---------- | ---------- |
| `reference/dgii-official.md` | 29          | 29          | empty (exit 0) | —          | —          |
| `guides/flow.md`             | 8           | 8           | empty (exit 0) | —          | —          |
| `guides/signing.md`          | 2           | 2           | empty (exit 0) | —          | —          |
| `guides/resilience.md`       | 4           | 4           | empty (exit 0) | —          | —          |

`https[^)]*` truncates URLs that contain parentheses (`(XSD)`, `(e-CF)`), so the set was re-extracted with a
balanced-destination parser over markdown destinations **and** inline-code URIs, ordered:

| Page                         | EN destinations                                     | EN external occ. | ES destinations | ES external occ. | ordered-identical |
| ---------------------------- | --------------------------------------------------- | ---------------- | --------------- | ---------------- | ----------------- |
| `reference/dgii-official.md` | 83                                                  | 81               | 83              | 81               | **True**          |
| `guides/flow.md`             | 17                                                  | 15               | 17              | 15               | **True**          |
| `guides/signing.md`          | 5 = 3 markdown (2 ext + 1 internal) + 2 inline-code | 4                | 5 = same split  | 4                | **True**          |
| `guides/resilience.md`       | 5                                                   | 4                | 5               | 4                | **True**          |

Union across the four pages: **104 occurrences, 45 distinct in each locale**, byte-identical and in the same
order; host split identical (`dgii.gov.do` 38, `statusecf.dgii.gov.do` 1, `www.w3.org` 5,
`www.rfc-editor.org` 1). This reproduces the English census in `t3-evidence-collector-en-docs-attempt2.md`
§4 (45 distinct, same host split) exactly.

The only non-URL destination that differs is the expected translation of the in-page anchor:

```text
internal EN = ['#which-document-governs-which-step', '../guides/flow.md']
internal ES = ['#que-documento-rige-cada-paso',       '../guides/flow.md']
```

`#que-documento-rige-cada-paso` resolves in the built ES page (19 anchors, 0 broken — §5.4).

---

## 5. Gate 3 — structural parity (PASS)

### 5.1 Headings — same levels, same order, same count

| Page                         | EN  | ES  | level sequence                    | `diff` of level sequences |
| ---------------------------- | --- | --- | --------------------------------- | ------------------------- |
| `reference/dgii-official.md` | 9   | 9   | `# ## ## ## ## ## ## ## ##`       | identical                 |
| `guides/flow.md`             | 11  | 11  | `# ## ## ## ## ## ## ## ## ## ##` | identical                 |
| `guides/signing.md`          | 4   | 4   | `# ## ## ##`                      | identical                 |
| `guides/resilience.md`       | 5   | 5   | `# ## ## ## ##`                   | identical                 |

Heading texts are translated one-for-one (`## Which document governs which step` → `## Qué documento rige
cada paso`, `## Scope of this page` → `## Alcance de esta página`, …). The four ES page titles match the
`nav_translations` values already in `mkdocs.yml` (`Flujo de extremo a extremo`, `Firma (XMLDSig)`,
`Resiliencia e idempotencia`) — no nav/heading drift.

### 5.2 Table rows per table

Column counts in brackets, then data rows:

| Page                         | EN tables / rows per table         | ES tables / rows per table         | equal   |
| ---------------------------- | ---------------------------------- | ---------------------------------- | ------- |
| `reference/dgii-official.md` | 7 / `[7, 6, 5, 15, 4, 6, 10]` = 53 | 7 / `[7, 6, 5, 15, 4, 6, 10]` = 53 | **yes** |
| `guides/flow.md`             | 3 / `[3, 5, 6]` = 14               | 3 / `[3, 5, 6]` = 14               | **yes** |
| `guides/signing.md`          | 0                                  | 0                                  | **yes** |
| `guides/resilience.md`       | 1 / `[4]`                          | 1 / `[4]`                          | **yes** |

Column-count vectors are also identical, so no cell moved column.

### 5.3 Citation lines per guide

| Page                   | `**Official source:**` (EN) | `**Fuente oficial:**` (ES) | URLs on those lines | ordered diff                           |
| ---------------------- | --------------------------- | -------------------------- | ------------------- | -------------------------------------- |
| `guides/flow.md`       | 8                           | 8                          | 15 / 15             | identical — same documents, same order |
| `guides/signing.md`    | 1                           | 1                          | 2 / 2               | identical — same documents, same order |
| `guides/resilience.md` | 3                           | 3                          | 4 / 4               | identical — same documents, same order |
| `reference/…`          | 0 (table-driven page)       | 0                          | 0 / 0               | n/a                                    |

Citation placement is also positionally identical: in both locales the line sits directly after the step's
intro paragraph for steps 1–4, 6, 7, is the first paragraph for step 5, and one line precedes `Auxiliary
flows` (which Decision 6 says should not carry one — present in **both** locales, so parity holds and the
deviation is the English deliverable's, already adjudicated in T3).

### 5.4 Rendered artifact counters (markdown ⇄ build cross-check)

Independent of the markdown, the generated pages agree element for element:

| Page                       | bytes EN → ES   | `<table>` | `<thead>` | `<tr>`  | `href=`   | `<code>` | admonitions | `#anchor` links |
| -------------------------- | --------------- | --------- | --------- | ------- | --------- | -------- | ----------- | --------------- |
| `reference/dgii-official/` | 56,037 → 57,259 | 7 → 7     | 7 → 7     | 60 → 60 | 126 → 126 | 56 → 56  | 6 → 6       | 21 → 21         |
| `guides/flow/`             | 61,999 → 62,783 | 3 → 3     | 3 → 3     | 17 → 17 | 76 → 76   | 63 → 63  | 2 → 2       | 34 → 34         |
| `guides/signing/`          | 29,063 → 29,568 | 0 → 0     | 0 → 0     | 0 → 0   | 41 → 41   | 17 → 17  | 4 → 4       | 13 → 13         |
| `guides/resilience/`       | 36,024 → 36,553 | 1 → 1     | 1 → 1     | 5 → 5   | 46 → 46   | 28 → 28  | 4 → 4       | 16 → 16         |

Link sweep on the ES pages: internal `href`s 39/55/33/36, anchors 19/32/11/14, **0 broken anchors, 0 broken
relative links**.

Code fences and Python/TypeScript tab labels are untouched (fences 0/4/2/0, `=== "TypeScript"` +
`=== "Python"` 0/14/2/8 — identical per locale), so Decision 9's "do not change code blocks" holds.

---

## 6. Gate 4 — untranslated prose (FAIL)

Method: strip fenced code, inline code, link destinations and URLs from every ES line, then look for English
function words; separately, diff the ES vocabulary against the English file's vocabulary and against the
HEAD (pre-existing) `docs/es/` corpus, and review every non-matching token by hand. Legitimate English was
excluded as instructed: code blocks and their comments, identifiers and API names (`VALIDATION`,
`IDEMPOTENCY`, `preservewhitespace = false`, `enforceB2BRules`), URLs, algorithm URIs, XML field names, CLI
commands, W3C/IETF document titles (`XML Signature Syntax and Processing 1.1`, `Canonical XML 1.0`, `XML
Encryption 1.1`, `RFC 6931`), DGII document titles, `sha256`/`SHA-256`, and `Pre-flight` (pre-existing in
`docs/es/guides/flow.md` at HEAD — see §7.3).

**Hits classified as untranslated prose — 4 defects, 51 occurrences:**

| #   | Location                                 | Text (verbatim)                                                                                                 | Why it is untranslated prose                                                                                                                                                                                                                                                                                         |
| --- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `docs/es/reference/dgii-official.md:152` | `_Autenticación_: \`semilla\` and \`validarsemilla\``                                                           | English conjunction between two identifiers inside a translated step row; the same page writes `y` in `_Consulta de resultado e-CF_ y _Consulta de estado e-CF_`                                                                                                                                                     |
| 2   | `docs/es/reference/dgii-official.md:161` | `_Consulta Directorio de Servicios_ and _Comunicación Emisor-Receptor_`                                         | Same defect inside the `Directorio / B2B` row; the identical construction two rows earlier reads `_Recepción de e-CF_ y _Recepción de resumen …_`                                                                                                                                                                    |
| 3   | `docs/es/reference/dgii-official.md:54`  | `site-updated 2026-05-29; bitácora rev. 2026-01-02 (escape rules 2025-04-03)`                                   | English noun phrase left untranslated in a cell whose neighbour label was translated (`bitácora`); inconsistent within a single cell                                                                                                                                                                                 |
| 4   | all four ES files                        | `site-updated` ×48 occurrences (29 lines in `reference`, 13/8 in `flow`, 2/1 in `signing`, 4/3 in `resilience`) | The label is the page's own coinage (English original: "the publication date DGII shows for the file"), not a DGII term or an identifier, so Decision 9 ("translate … table headers/cells that are prose") applies; today 100 % of the occurrences are English while every adjacent word in the same cell is Spanish |

Counts per file for defect 4:

```text
docs/es/reference/dgii-official.md        occ=29 lines=29
docs/es/guides/flow.md                    occ=13 lines=8
docs/es/guides/signing.md                 occ=2  lines=1
docs/es/guides/resilience.md              occ=4  lines=3
TOTAL ES occ=48
```

**Reviewed and deliberately NOT counted as prose (so the list is auditable):**

- `16 May 2023`, `17 Oct 2024`, `08 Apr 2019`, `v1.0, Jan 2020` — date tokens, not sentences (`may`/`oct`
  are legitimate Spanish abbreviations; `Jan`/`Apr` are not, which is a formatting nit under `O-5`, not
  untranslated prose).
- `W3C Recommendation` ×3 (`reference:120–122`) — formal W3C maturity designation inside a document-status
  column; kept as a term. Worth revisiting (`O-4`) because the same table translates `RFC 6931 (IETF)`.
- `slot` ×3 (`reference:100`, `:152`, `flow:51`), `multipart` ×1 (`flow:188`) — technical loanwords; `multipart`
  matches repo convention, `slot` is new (see §7.3).
- `enveloped`, `enveloped-signature`, `digest`, `endpoint`, `payload`, `token`, `hash`, `store`, `fixtures`,
  `bearer`, `worker` — all already used by the pre-existing `docs/es/` pages
  (`git grep -o -i -h -- <term> HEAD -- docs/es/ | wc -l`: `endpoint` 9, `token` 14, `payload` 6, `hash` 2,
  `store` 11, `fixture` 17, `bearer` 3, `digest` 2), which is what makes them repo convention rather than
  leftovers.
- `VALIDATION`, `IDEMPOTENCY` — SDK error codes (`packages/typescript/src/errors.ts:11–12`), inside a mermaid
  block; identifiers.

---

## 7. Gate 5 — Spanish quality spot-check (FAIL)

Read as a Dominican/LatAm Spanish reader: the full reference page plus `guides/flow.md`, plus
`guides/resilience.md` and `guides/signing.md`; register compared against the pages already shipping in
`docs/es/` (and against the HEAD versions of the three guides).

### 7.1 Literal machine-translation phrasing — 2 hits (blocking for this gate, not for the attribution)

`by example` is rendered `por ejemplo` ("for example"), which changes the sense: the English says DGII's
document _demonstrates_ the signature profile **through an example**, not "for example".

```text
docs/en/reference/dgii-official.md:55  — DGII's own signature profile by example: C14N URI, RSA-SHA256, …
docs/es/reference/dgii-official.md:56  — el perfil de firma de la propia DGII por ejemplo: URI de C14N, …
docs/en/guides/signing.md:12           — DGII's own signature profile by example: …
docs/es/guides/signing.md:13           — el perfil de firma de la propia DGII por ejemplo: …
```

Suggested: `a modo de ejemplo` / `ilustrado con un ejemplo`. (The unrelated `por ejemplo` in
`resilience:20` correctly renders `e.g.` and must stay.)

### 7.2 Dropped content — 1 sentence missing

`docs/en/guides/resilience.md` (frozen) carries a lead-in before the contingency citation; the ES mirror
does not:

```text
EN  When a transmission fails and you fall back to contingency, this governs it:
    **Official source:** [Informe Técnico …] — §19: contingency operation, …
ES  (nothing)
    **Fuente oficial:** [Informe Técnico …] — §19: operación en contingencia, …
```

Sentence-level alignment per section shows `## Retry policy` at EN 6 / ES 4 sentences and the other ten
sections equal. Effect: in ES the §19 contingency citation follows `Un e-CF rechazado … nunca se reenvía a
ciegas` with nothing linking it to contingency, so a reader cannot tell why the citation is there. The
citation body itself is translated faithfully.

### 7.3 Register and terminology against the pre-existing `docs/es/` pages

Register **matches** and was not flagged: informal `tú` imperatives throughout (`Tómalo`, `Empieza`, `vuelve
a comprobar`, `Resuélvelo`) exactly as the pages at HEAD (`la firmas`, `la canjeas`, `Guarda`); `la DGII` as
a feminine agent; `e-CF`/`e-NCF`/`RFCE`/`ACECF`/`ANECF`/`trackId`/`secuenciaUtilizada`/`C14N`/`RSA-SHA256`
kept verbatim (Decision 9); `lote`, `semilla`, `comprobante`, `receptor`, `comprador`, `umbral`, `contingencia`,
`bitácora` used consistently with HEAD. `## Verificación obligatoria`, `## Firmar`, `## 2. Pre-flight
(opcional)` and the four page titles are **unchanged from HEAD**, i.e. the translator reused the repo's own
existing renderings instead of inventing new ones — correct behaviour.

Minor wording notes, non-blocking:

- `slot de extensión` ×3 (`reference:100`, `reference:152`, `flow:51`) — `slot` appears nowhere in the pre-existing
  `docs/es/` corpus (`git grep -i slot HEAD -- docs/es/` → no match). `ranura`/`espacio de extensión` would
  match repo register.
- `republica los archivos en el mismo sitio` ×4 — `sitio` can be read as "website"; the English "in place"
  is about the _file_ being replaced in the same location. `en la misma ubicación` removes the ambiguity.
- `W3C Recommendation` ×3 (see §6).
- `v1.0, Jan 2020` / `NG 05-2019 (08 Apr 2019)` — English month abbreviations in an otherwise Spanish date
  column (`ene`, `abr` are the Spanish forms).

### 7.4 Attribution meaning — no change found (the automatic-FAIL trigger was NOT tripped)

All 29 reference rows and all 12 guide citations were compared row-by-row / line-by-line against the English.
Document identity, governing article or section number, version, date and URL are correct in every one; no
attribution was re-pointed, softened or widened. Specifically re-verified: `Norma General 05-2019 … Art. 11`
and `… con su firma digital obligatoria`; `Norma General 01-2020 … Art. 12` (voiding) and `Art. 11(c)`
(directory); `§6.1, §7, §9` (type catalogue, e-NCF, threshold); `§4.1`, `§4.5–4.6`, `§4.9`, `§5.1`,
`§5.2–5.3`, `§10`, `§12–13`, `§19`; the three `Descripción Técnica`/`Informe Técnico` distinctions; the
`Firmado de XML` sentence; the RFC-6931-is-IETF clarification. The two gate-5 defects above are phrasing and
completeness defects, not attribution defects — which is why the verdict is a rule-based FAIL rather than an
automatic attribution FAIL.

---

## 8. Gate 6 — accuracy carried over (PASS)

| #   | Constraint (from the English page)                             | Evidence in ES                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Result   |
| --- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | No article number or date for the commercial-approval deadline | Article-reference multisets are identical in both locales and contain no AC-deadline article: EN `{Art. 11: 1, Art. 12: 1, Art. 11(c): 1}` = ES `{Art. 11: 1, Art. 12: 1, Art. 11(c): 1}`; the AC row says only `la conformidad del receptor, dada por la aprobación o por presentar la compra en el formulario 606 correspondiente` (= EN `… or by filing the purchase with the corresponding 606 filing`); no `plazo`/`días`/date added                                                                                                                                                     | **PASS** |
| 2   | B2B exclusion attributed to the SDK guard                      | Warning admonition `La exclusión de tipos para B2B es regla del SDK, no de la DGII` … `El SDK aplica su propia guarda (\`enforceB2BRules\` / \`enforce_b2b_rules\`, activa por defecto) … Tómalo como una regla del SDK: evita que una entrega falle en el comprador, pero no es un requisito de la DGII que se pueda citar.`; `flow.md`common-mistakes row`El SDK lo rechaza (\`enforceB2BRules\`); los documentos de la DGII no enuncian tal exclusión` (= EN)                                                                                                                              | **PASS** |
| 3   | `secuenciaUtilizada` on the track step                         | reference `Consultar el resultado` row: `… y \`secuenciaUtilizada\`, publicado en la respuesta del trackId como la señal de si una secuencia rechazada puede reutilizarse`(1 occurrence, as EN);`flow`5 = EN 5;`resilience` 2 = EN 2                                                                                                                                                                                                                                                                                                                                                          | **PASS** |
| 4   | `CodigoSeguridadeCF` hash marked as the SDK's reading          | `… la definición de \`CodigoSeguridadeCF\` — la DGII solo nombra un "hash"; SHA-256 es la lectura del SDK del perfil de firma`(= EN`DGII names only a "hash"; SHA-256 is the SDK's reading of the signature profile`); `flow`code comments keep`-> CodigoSeguridadeCF`                                                                                                                                                                                                                                                                                                                        | **PASS** |
| 5   | No DGII-attributed ambiente labels                             | Every `ambiente` occurrence in the ES set is mirrored from EN and none attaches an SDK-style label (`Producción`, `Pruebas`) to DGII's integer codes: `reference:57` and `:153` (`el parámetro \`Ambiente\``, `los códigos enteros de \`Ambiente\``) = EN; `flow:87`/`:91` (`si el ambiente está dentro de una ventana de mantenimiento`, `códigos enteros de ambiente`) = EN and pre-existing at `HEAD`; `signing:72` (`el ambiente de **certificación** de la DGII`) renders EN `the DGII **certification** environment` and is pre-existing (`git show HEAD:docs/es/guides/signing.md:63`) | **PASS** |
| 6   | Access date `2026-11-09` present and correct                   | one `2026-11-09` per page in each locale (reference: `**Fecha de consulta de todas las filas: 2026-11-09.**`; each guide: `Los enlaces oficiales de esta página se verificaron el 2026-11-09.`). ISO-date multisets are **identical per page** (`identical=True` for all four), so no date was mistyped or added                                                                                                                                                                                                                                                                              | **PASS** |

---

## 9. Gate 7 — build + format (PASS)

```text
$ packages/typescript/node_modules/.bin/prettier --check docs/es
Checking formatting...
All matched files use Prettier code style!            # exit=0

$ packages/typescript/node_modules/.bin/prettier --check docs/en
All matched files use Prettier code style!            # exit=0

$ uvx --from mkdocs --with mkdocs-material --with "mkdocs-static-i18n>=1.0,<2" mkdocs build --strict
INFO - Documentation built in 1.90 seconds            # EXIT=0, 0 WARNING lines
```

Observation `O-1`: repo-wide `prettier --check .` (what `mise run lint-format` runs) still reports 11 files —
10 pre-existing `project-tasks/124-evidence/*.md` artifacts from earlier task attempts and
`project-docs/marketing/github-listing.md`. **Zero `docs/**` files are in that list**, so the ES deliverable
adds nothing to it, and the count is unchanged by this work. It is a pre-existing lint debt that will fail
`mise run ci` regardless of the translation; flagged for the pipeline owner, out of scope here.

---

## 10. Gate 8 — scope (PASS, with one documented drift)

```text
$ git status --short
 M docs/en/guides/flow.md
 M docs/en/guides/resilience.md
 M docs/en/guides/signing.md
 M docs/es/guides/flow.md
 M docs/es/guides/resilience.md
 M docs/es/guides/signing.md
?? docs/en/reference/
?? docs/es/reference/
?? project-docs/marketing/          <-- pre-existing orphan, not attributable (§10.2)
?? project-tasks/124-dgii-official-sources-ledger.md
?? project-tasks/124-dgii-official-sources-tasklist.md
?? project-tasks/124-evidence/
?? project-tasks/124-source-register.md
```

`git status --porcelain -uall -- docs/` resolves the two untracked directories to exactly
`docs/en/reference/dgii-official.md` and `docs/es/reference/dgii-official.md`, so the change set is the four
ES paths plus the four English paths, plus `project-tasks/**`.

Out-of-scope areas, checked individually:

```text
$ git diff --name-only -- mkdocs.yml packages examples project-docs
(empty)
$ git status --porcelain -uall -- mkdocs.yml packages examples project-docs
?? project-docs/marketing/github-listing.md
$ stat -c '%y %n' mkdocs.yml project-docs/dgii-ground-truth.md
2026-11-02 20:33:10  mkdocs.yml
2026-11-02 20:05:35  project-docs/dgii-ground-truth.md
```

`mkdocs.yml`, `packages/**`, `examples/**` and `project-docs/dgii-ground-truth.md` are untouched (mtimes
predate this branch's work). The single untracked entry under `project-docs/` is the orphan already proven
pre-existing and not attributable in `t3-evidence-collector-en-docs.md` §8 and re-confirmed unchanged in
`t3-evidence-collector-en-docs-attempt2.md` §3 (mtime `2026-11-03 06:21`, `git log --all -- project-docs/marketing/`
empty). It is workspace dirt from another task, not part of this change.

`project-tasks/` also holds `project-tasks/124-evidence/.pdfcache/` (22 untracked PDF/TXT cache files from
the earlier research runs). It is inside the allowed `project-tasks/**` scope, but it is a **commit hazard**:
those binaries must not ride along in the docs commit (`O-3`).

### 10.1 The English side did change since the last validation — measured, explained, non-blocking

`docs/en/**` is _not_ byte-identical to the artifact `t3-evidence-collector-en-docs-attempt2.md` describes.
Two of the four files were rewritten at 12:12, i.e. **after** that run snapshotted them (12:01:36) and
**before** the ES translation was written (12:24–12:26). Pinned against the attempt-2 build snapshot the T3
run preserved at `/tmp/qa124b/site-previous-live/` (rendered `<article>` text diff):

```diff
--- /tmp/qa124b/site-previous-live/reference/dgii-official/index.html
+++ site/reference/dgii-official/index.html
 (Scope of this page)
-document that a step or a field on this site depends on, verified reachable on
-the access date, with the URL and the version each one was checked at, so anyone
-can re-check them. Documents DGII publishes that no step here depends on are
-not listed.
+document that a step or a field on this site depends on, together with the
+certification and contingency material those steps send readers to, verified
+reachable on the access date, with the URL and the version each one was checked
+at, so anyone can re-check them. DGII publishes more than this: documents that
+nothing here depends on are not listed.

--- /tmp/qa124b/site-previous-live/guides/flow/index.html
+++ site/guides/flow/index.html
-lists the whole set, with a link per document.
+lists all of them, with a link per document.
```

```text
$ python3 /tmp/qa124_html.py <snapshot>/signing/index.html site/guides/signing/index.html      -> NO DIFF
$ python3 /tmp/qa124_html.py <snapshot>/resilience/index.html site/guides/resilience/index.html -> NO DIFF
$ git diff --numstat docs/en/           34  10  flow.md | 13  0  resilience.md | 7  0  signing.md
   attempt 1 recorded:                   27  10  flow.md (-> 299 lines)
   attempt 2 recorded (+6-line note):    33  10  flow.md (-> 305 lines); 13 0 resilience.md; 7 0 signing.md
   HEAD baseline for flow.md = 282 lines, so 282 + 34 - 10 = 306 today
```

Assessment: the drift is two sentences (reference _Scope of this page_, flow intro), both of which the **ES
mirror already carries** (`… junto con el material de certificación y contingencia al que esos pasos remiten
al lector …`, `los lista todos, con un enlace por documento`). No URL, heading, table row, citation line,
version string or date changed (all gate 1–3 counters are identical to attempt 2's: 45 distinct URLs, 7
tables / 7 `thead` / 60 `<tr>` on the reference page, 8/1/3 citation lines). So the ES was translated from the
current EN, not from the attempt-2 snapshot; parity is intact. Reported as `O-2` because the brief asks to
confirm the match and the honest answer is "matches in substance, not byte-for-byte".

### 10.2 File-level diff of the ES work (for the record)

```text
$ git diff --numstat docs/es/
35  10  docs/es/guides/flow.md
13  0   docs/es/guides/resilience.md
9   0   docs/es/guides/signing.md
(new, untracked) docs/es/reference/dgii-official.md
```

The ES delta is the EN delta plus the translation overhead only: the flow diff replaces the pre-existing
`project-docs/dgii-ground-truth.md` repo pointer with the new reference-page link (Decision 3, both locales),
adds 8 `**Fuente oficial:**` lines, the `Verificación de enlaces` note and the corrected B2B common-mistakes
row; signing adds the citation bullet + note; resilience adds the note and 3 citations.

---

## 11. Discrepancies — expected vs actual, with the fix

| ID  | Gate | Expected                                 | Actual                                                                                                                                               | Fix                                                                                                                                                                                                                                                                                              |
| --- | ---- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-1 | 4    | No English in Spanish prose (Decision 9) | `reference:152` `\`semilla\` and \`validarsemilla\``; `reference:161` `_Consulta Directorio de Servicios_ and _Comunicación Emisor-Receptor_`        | `… \`semilla\` y \`validarsemilla\``, `… _Consulta Directorio de Servicios_ y _Comunicación Emisor-Receptor_`                                                                                                                                                                                    |
| D-2 | 4    | Table-cell prose translated              | `reference:54` `(escape rules 2025-04-03)`                                                                                                           | `(reglas de escape 2025-04-03)`                                                                                                                                                                                                                                                                  |
| D-3 | 4    | Table-cell prose translated              | `site-updated` ×48 across the four ES files                                                                                                          | Translate consistently — e.g. `actualizado en el sitio 2026-05-29`, or `act. sitio 2026-05-29` if width matters — and apply the same rendering in all four files. If the team decides to keep the English label on purpose, record that decision in the tasklist so the mirror is not re-flagged |
| D-4 | 5    | Faithful rendering of `by example`       | `por ejemplo` at `reference:56` and `signing:13` (= "for example")                                                                                   | `a modo de ejemplo` / `ilustrado con un ejemplo`; leave `resilience:20` (`por ejemplo` for `e.g.`) alone                                                                                                                                                                                         |
| D-5 | 5    | Every English sentence carried over      | `docs/es/guides/resilience.md` is missing `When a transmission fails and you fall back to contingency, this governs it:` before the line-22 citation | Insert `Cuando una transmisión falla y recurres a contingencia, esto es lo que la rige:` immediately before `**Fuente oficial:**` at line 22 (same position as EN)                                                                                                                               |
| O-4 | 5    | —                                        | `W3C Recommendation` ×3 untranslated; `slot` ×3; `en el mismo sitio` ×4; `Jan`/`Apr` month abbreviations                                             | Optional polish: `Recomendación del W3C`, `ranura/espacio de extensión`, `en la misma ubicación`, `ene`/`abr`                                                                                                                                                                                    |

Non-blocking observations: `O-1` repo-wide prettier debt (11 `project-tasks`/`project-docs` files, no
`docs/**`); `O-2` EN drift of two sentences since the attempt-2 validation (§10.1); `O-3` untracked
`project-tasks/124-evidence/.pdfcache/` binaries must not be committed; `O-5` the new reference page is
absent from `nav` in both locales — the T3 D-2 item, inherited, not an ES regression.

**Re-check after fixes (must stay green):**

```bash
packages/typescript/node_modules/.bin/prettier --write docs/es && packages/typescript/node_modules/.bin/prettier --check docs/es
uvx --from mkdocs --with mkdocs-material --with "mkdocs-static-i18n>=1.0,<2" mkdocs build --strict
diff <(cd docs/en && find . -name '*.md' | sort) <(cd docs/es && find . -name '*.md' | sort) && test -f site/es/index.html
# and re-run the four URL / heading / table / citation comparisons in §4–§5 — no fix above may change a URL,
# a heading or a row count
```

---

## 12. Coverage gaps (what this run does not prove)

- **No live re-request of the 45 external URLs.** The brief scopes this gate to _parity_; reachability was
  proven per-URL by T2/T3 on the same day (`45/45 200`). This run proves only that the ES links are the same
  bytes in the same order — which is the property that could regress in a translation.
- **No screenshot pass.** The four pages carry no interactive element; structural equivalence was proven on
  the built DOM (element counters, anchor resolution) instead. A visual pass belongs with T7, when the page
  enters the nav.
- **register and prose review is a human-language judgement**, sampled exhaustively on the reference page and
  `flow.md` and section-by-section on the other two, not a formal terminology glossary.
- **The EN "frozen" baseline is the working tree, not a commit.** §10.1 pins the drift against the preserved
  attempt-2 build; a whitespace-only EN edit that renders identically would not appear there.

---

## 13. Method notes

- Spanish quality was read against the repo's own Spanish corpus: the 7 unchanged `docs/es/` pages plus the
  `HEAD` blobs of the three modified guides (`git show HEAD:docs/es/guides/*.md`), which is what makes
  "the repo already renders this another way" a measurement rather than an opinion.
- Every count in this report is a command output pasted above; nothing is estimated. Where two extraction
  methods disagreed (naive `grep -o 'https[^)]*'` vs balanced destination parsing) both are reported so the
  reader can see why the distinct-URL numbers differ (29/8/2/4 truncated vs 45 full).
- Only this evidence file was written. No file under `docs/`, `mkdocs.yml`, the source register or any prior
  evidence file was modified.

---

**QA Agent:** EvidenceQA · **Evidence date:** 2026-11-09 · **Reviewed build:** `site/` (mkdocs 1.90 s,
`--strict`), `site/es/**` 11 pages.

## Outcome

Outcome: FAIL — attempt 1 of 3. Gates 1, 2, 3, 6, 7 pass with zero discrepancies; gate 8 passes on scope with one documented EN drift; gates 4 and 5 fail (English left in ES prose; `by example` rendered `por ejemplo`; one EN sentence dropped in `resilience.md`). No DGII attribution changed meaning, so the automatic-FAIL trigger was not tripped.
Details: The mirror is numerically exact — 11/11 file parity, 104 external URLs per locale in identical order (45 distinct), identical headings/tables/citations and identical rendered counters. Five mechanical fixes are listed in §11 (D-1…D-5) with exact locations; re-run prettier + `--strict` build after applying them.
`project-tasks/124-evidence/t6-evidence-collector-es-mirror.md` — QA evidence for the Spanish mirror: gate table, parity diffs (files, URLs, headings, rows, citations), untranslated-prose list, Spanish-quality findings, expect-vs-actual fixes.
