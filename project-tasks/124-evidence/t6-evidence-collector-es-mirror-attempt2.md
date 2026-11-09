# QA evidence — issue #124, Spanish mirror of the official DGII references (attempt 2 of 3)

**Validator:** EvidenceQA (evidence collector, gate T6) · **Date:** 2026-11-09 (−04:00) ·
**Branch:** `docs/124-dgii-official-sources` · **HEAD:** `b44ebb4` (whole docs change still uncommitted
working tree) · **Re-verification of:** `project-tasks/124-evidence/t6-evidence-collector-es-mirror.md`
(attempt 1, verdict FAIL on gates 4 and 5).

**Files under review — the four `docs/es/` counterparts (state now vs attempt 1):**

| Path                                 | Lines         | Bytes           | mtime (−04:00) | ES-only line delta since attempt 1  |
| ------------------------------------ | ------------- | --------------- | -------------- | ----------------------------------- |
| `docs/es/reference/dgii-official.md` | 185 → 185     | 46,236 → 46,710 | 12:39:52       | 0                                   |
| `docs/es/guides/flow.md`             | 310 → 310     | 17,370 → 17,521 | 12:39:49       | 0                                   |
| `docs/es/guides/signing.md`          | 82 → 82       | 3,726 → 3,759   | 12:39:49       | 0                                   |
| `docs/es/guides/resilience.md`       | 146 → **147** | 6,458 → 6,588   | 12:39:49       | **+1** (the D-5 sentence, own line) |

**English originals (the frozen baseline) are byte-identical to attempt 1** — same lines, same bytes,
same mtimes (`reference` 182 / 44,763 / 12:12:07, `flow` 306 / 16,851 / 12:12:11, `signing` 78 / 3,506 /
12:01:42, `resilience` 144 / 6,226 / 12:01:42). So the attempt-1 EN-drift observation (`O-2`) is
unchanged, and every parity number below is measured against the same English bytes as attempt 1.

**Requirement sources:** same as attempt 1 — `gh issue 124`, `project-tasks/124-source-register.md`
(revision 3, mtime 11:24, untouched), `project-tasks/124-dgii-official-sources-tasklist.md` §3 Decisions
1–11 (Decision 9 = translation boundary).

---

## 1. Verdict

**ATTEMPT 2: PASS — 8 of 8 gates green, zero gate-level discrepancies, no parity drift.**

All five blocking fixes are **RESOLVED** and verified against the current file content (not against the
producer's claim), and the optional polish `O-4` is **PARTIALLY** applied: three of its four sub-items are
complete, and the fourth (month abbreviations) is 3 of 6 tokens done, leaving `May`, `Oct`, `Oct`
capitalised where the same column now writes `ene`, `abr` in lowercase (§11, non-blocking).

The parity regression check is the important half of this run and it is clean: every structural measure I
took at attempt 1 reproduces **exactly** — 11/11 locale file parity, 104 external-URL occurrences per
locale in identical order (45 distinct, identical host split 38/1/5/1), identical heading level/order/count
on all four pages, identical per-table row **and** column vectors, identical citation counts (8/1/3) in
identical document order, identical rendered element counters (7 tables / 60 `<tr>` / 126 `href` …), zero
broken anchors and zero broken relative links. Two independent new measures this run reinforce it: the
version/date cell of all **60** reference-table rows carries an identical numeral token sequence in both
locales, and the ordered inline-code + numeral skeleton has the same length in both locales on every page
(1158 / 328 / 71 / 105).

| #   | Gate                       | Expected                                                                       | Observed this run                                                                                                                                                                     | Result   |
| --- | -------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | Locale file parity         | `diff` of the two `find \| sort` lists empty; `site/es/index.html` after build | 11 files each, `diff` exit 0; `site/es/index.html` = 26,822 B; 11 ES pages built (incl. `site/es/reference/dgii-official/index.html` = 57,607 B)                                      | **PASS** |
| 2   | URL parity per page        | identical URL set per page, both directions                                    | 81/81, 15/15, 4/4, 4/4 occurrences; **ordered** identity on all four; 43/8/4/4 distinct per page, 45 distinct in the union each locale; 0 only-in-EN, 0 only-in-ES                    | **PASS** |
| 3   | Structural parity          | same headings, table rows, citations                                           | headings 9/11/4/5 identical; row vectors `[7,6,5,15,4,6,10]`, `[3,5,6]`, `[]`, `[4]` and column vectors identical; citations 8/1/3 identical and ordered; rendered counters identical | **PASS** |
| 4   | No untranslated prose      | zero English left in ES body prose                                             | **0 defects, 0 occurrences.** 2 scanner hits, both in the agreed exclusion classes (W3C document title, Spanish homograph); `site-updated` = **0** under `docs/es`                    | **PASS** |
| 5   | Spanish quality / fidelity | no literal MT, no dropped content, no attribution shift                        | `by example` → `a modo de ejemplo` (2/2); D-5 sentence present in the EN position; 29/29 sections with **0** sentence-count deltas; no attribution change found                       | **PASS** |
| 6   | Accuracy carried over      | 6 named constraints hold in ES exactly as in EN                                | all 6 hold; `Art.` and `§` token multisets identical; ISO-date multiset identical per page; version/date column token-identical across all 60 rows                                    | **PASS** |
| 7   | Build + format             | `prettier --check docs/es` exit 0; `mkdocs build --strict` exit 0              | exit 0; exit 0 (2.18 s, **0** warning lines); CI's two parity commands pass verbatim                                                                                                  | **PASS** |
| 8   | Scope                      | only `docs/en/**`, the 4 `docs/es/**` paths, `project-tasks/**`                | exactly that (+1 pre-existing untracked orphan); `mkdocs.yml`, `packages/**`, `examples/**`, `project-docs/**`, register and prior evidence untouched; `.pdfcache/` **not** added to  | **PASS** |

---

## 2. Commands run (verbatim, with exit codes)

```bash
# [state] what actually changed since attempt 1
git status --short ; git status --porcelain -uall -- docs/ ; git diff --numstat docs/en/ docs/es/
stat -c '%y %s %n' docs/{en,es}/{reference/dgii-official.md,guides/flow.md,guides/signing.md,guides/resilience.md}
wc -l docs/{en,es}/{reference/dgii-official.md,guides/{flow,signing,resilience}.md}

# [D-1…D-5] each fix, proving line
rg -n '`semilla`' docs/es/reference/dgii-official.md docs/en/reference/dgii-official.md
rg -n 'Consulta Directorio de Servicios' docs/es/reference/dgii-official.md docs/en/reference/dgii-official.md
rg -n 'escape rules|reglas de escape' docs/es/reference/dgii-official.md docs/en/reference/dgii-official.md
rg -n 'by example|a modo de ejemplo|por ejemplo' docs/{en,es}/{reference/dgii-official.md,guides/{signing,resilience}.md}
rg -n 'When a transmission fails and you fall back to contingency' docs/en/guides/resilience.md
rg -n 'Cuando una transmisión falla'                                  docs/es/guides/resilience.md
sed -n '14,26p' docs/en/guides/resilience.md ; sed -n '14,28p' docs/es/guides/resilience.md    # D-5 position

# [D-3] no English label survives, and the replacement is uniform
rg -n 'site-updated' docs/                                  # 41 line hits, all docs/en
rg -c 'site-updated' docs/es                                # no match (exit 1)
rg -o 'actualizado en el sitio' docs/es -c                  # 29 / 13 / 2 / 4
rg -o 'actualizado en el sitio' docs/es | wc -l              # 48
rg -o -n 'actualizad[oa] [a-zá-ú]* ?[a-zá-ú]*' docs/es | awk -F: '{print $3}' | sort | uniq -c   # 48x one form
for f in reference/dgii-official.md guides/flow.md guides/signing.md guides/resilience.md; do
  diff <(rg -o 'site-updated [0-9]{4}-[0-9]{2}-[0-9]{2}' docs/en/$f | sed 's/site-updated //') \
       <(rg -o 'actualizado en el sitio [0-9]{4}-[0-9]{2}-[0-9]{2}' docs/es/$f | sed 's/actualizado en el sitio //')
done                                                        # all four empty (ordered date identity)

# [O-4] each sub-item
rg -c 'W3C Recommendation|Recomendación del W3C' docs/es/reference/dgii-official.md
rg -n -o 'slot[a-z ]*|espacio de extensión|ranura' docs/es docs/en
rg -n -o 'en el mismo sitio|en la misma ubicación' docs/es docs/en
rg -n -o '\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b' docs/es/reference/dgii-official.md
rg -n -o '\b(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\b' docs/es/reference/dgii-official.md

# [gate 2 / 3 / 6] structural extraction (balanced markdown destinations + inline-code URIs)
python3 /tmp/qa124b/parity.py <en,es pairs for the four pages>          # §4, §5, §8 tables below
python3 /tmp/qa124b/parity.py-union                                     # 104 occ / 45 distinct / host split
python3 /tmp/qa124b/sent.py docs/en/<page> docs/es/<page>               # sentence alignment, 29 sections
# version/date cell token sequence per row, both locales (60 rows)
python3 - <<'PY'
... re.findall(r'v?[0-9][0-9A-Za-z.\-–]*|NG [0-9\-]+|RFC [0-9]+', cells[1]) ...   # 0 mismatches
PY
# ordered inline-code + numeral skeleton per page, both locales
python3 - <<'PY'  # '\`([^\`]*)\`' and '§..|Art...|[0-9][0-9.,]*' in document order
PY                                                                     # 1158/1158, 328/328, 71/71, 105/105

# [gate 4] three independent scanners over the four ES files
python3 /tmp/qa124b/scan.py     docs/es/{reference/dgii-official.md,guides/flow.md,guides/signing.md,guides/resilience.md}
python3 /tmp/qa124b/encensus.py docs/es/{...same four...}
python3 /tmp/qa124b/vocab.py    <EN four> <ES four> <HEAD-es corpus + HEAD blobs of the 3 guides>

# [gate 7] format + build + the CI parity commands verbatim
packages/typescript/node_modules/.bin/prettier --check docs/es   ; echo "exit=$?"
packages/typescript/node_modules/.bin/prettier --check docs/en   ; echo "exit=$?"
packages/typescript/node_modules/.bin/prettier --check .         ; echo "exit=$?"
uvx --from mkdocs --with mkdocs-material --with "mkdocs-static-i18n>=1.0,<2" mkdocs build --strict
bash -c 'diff <(cd docs/en && find . -name "*.md" | sort) <(cd docs/es && find . -name "*.md" | sort) ; echo "diff exit=$?"'
bash -c 'test -f site/es/index.html ; echo "artifact test exit=$?"'

# [gate 3 rendered] element counters + anchor/link sweep on the built pages
python3 /tmp/qa124b/html.py site/<page>/index.html site/es/<page>/index.html   # four pages

# [gate 8] scope + the commit hazard
git diff --name-only -- mkdocs.yml packages examples project-docs
git status --porcelain -uall -- mkdocs.yml packages examples project-docs
stat -c '%y %n' mkdocs.yml project-docs/dgii-ground-truth.md project-tasks/124-source-register.md
ls -l --time-style=+%H:%M:%S project-tasks/124-evidence/*.md
stat -c '%y %s %n' project-tasks/124-evidence/.pdfcache/* | sort | tail -3
ls -lt --time-style=full-iso project-tasks/124-evidence/.pdfcache/ | head -4
find project-tasks/124-evidence/.pdfcache -type f | wc -l          # 22
git check-ignore -v project-tasks/124-evidence/.pdfcache/leg01.pdf # exit 1 -> NOT ignored
```

Helper scripts written by this run (throwaway, `/tmp/qa124b/` only): `parity.py` (balanced destinations,
tables, headings, citations, dates, `Art.`/`§`), `scan.py` (function-word prose scanner), `encensus.py`
(targeted English-word census), `vocab.py` (EN∩ES vocabulary + new-ES-vocabulary diff against HEAD),
`sent.py` (per-section sentence alignment), `html.py` (rendered counters + anchor/link sweep). No file
under `docs/`, `mkdocs.yml`, the register or a prior evidence file was modified by this run; `site/` is
gitignored (`.gitignore:210`) and was rebuilt as CI does.

---

## 3. Per-fix verification — D-1 … D-5 and O-4

Each row quotes the **current** line that proves the state. Nothing here relies on the producer's
description.

| ID  | Gate | Claim made                                     | Status        | Proven by (current content)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ---- | ---------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1 | 4    | `and` → `y` ×2                                 | **RESOLVED**  | `docs/es/reference/dgii-official.md:152` — ``… , _Autenticación_: `semilla` y `validarsemilla` · [Semilla v.1.0](…)`` · `:161` — `… _Consulta Directorio de Servicios_ y _Comunicación Emisor-Receptor_ · … y [ARECF v1.0 XSD](…) · … Art. 11(c)`. A word-boundary sweep for `\band\b` over all four ES files returns **only** `enveloped-signature` and pre-existing Python/TS code (`is_ok() and …`) — zero prose conjunctions left.                                                                                                                                                                                                                                                                                                                                                                                                          |
| D-2 | 4    | `(escape rules …)`                             | **RESOLVED**  | `docs/es/reference/dgii-official.md:54` — `actualizado en el sitio 2026-05-29; bitácora rev. 2026-01-02 (reglas de escape 2025-04-03)`; no `escape rules` anywhere in `docs/es` (`rg` exit 1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D-3 | 4    | `site-updated` ×48 → `actualizado en el sitio` | **RESOLVED**  | `rg -c 'site-updated' docs/es` → no match (**0**). `rg -o 'actualizado en el sitio' docs/es \| wc -l` → **48** = 29 (`reference`) + 13 (`flow`) + 2 (`signing`) + 4 (`resilience`) — the same 29/13/2/4 occurrence distribution attempt 1 measured. Rendering is **uniform**: the unique-form census (`actualizad[oa] [a-zá-ú]* ?[a-zá-ú]*`) returns exactly 48× `actualizado en el` — no `act. sitio`, no `sitio web`, no capitalised variant, one single rendering in all four files. Per-line distribution identical to EN and ordered date sequence identical (`diff` empty on all four pages). Built output agrees: `rg -o 'site-updated' site/es \| wc -l` → **0**, `site/es/reference/…/index.html` → 29× `actualizado en el sitio`, while `site/reference/…` keeps 29× `site-updated` (the English source is unchanged, as it must be). |
| D-4 | 5    | `por ejemplo` → `a modo de ejemplo`            | **RESOLVED**  | `docs/es/reference/dgii-official.md:56` — `El perfil de firma del e-CF a modo de ejemplo: URI de C14N, …` · `docs/es/guides/signing.md:13` — `… el perfil de firma de la propia DGII a modo de ejemplo: …`. The only surviving `por ejemplo` is `docs/es/guides/resilience.md:20` (`(por ejemplo \`400\`, \`401\`)`), which correctly renders `e.g.`and had to stay. Built pages:`a modo de ejemplo`×2,`por ejemplo` ×1.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D-5 | 5    | Contingency lead-in inserted                   | **RESOLVED**  | `docs/es/guides/resilience.md:22` — `Cuando una transmisión falla y recurres a contingencia, esto es lo que la rige:` with `**Fuente oficial:** …` on line 23. **Position matches the English exactly**: EN line 20 lead-in → line 21 `**Official source:** …`, after the blank line that follows `A rejected e-CF … never blindly re-sent`; ES line 22 lead-in → line 23 citation, after the blank line that follows `Un e-CF rechazado … nunca se reenvía a ciegas`. Same relative position, same adjacency to the §19 citation. Sentence alignment for `## Política de reintentos` / `## Retry policy` is now **2 / 2** (attempt 1 measured EN 6 / ES 4 under the same script — the section is now line-for-line complete).                                                                                                                  |
| O-4 | 5    | optional polish                                | **PARTIALLY** | Done: `W3C Recommendation` ×3 → `Recomendación del W3C` ×3 (zero `W3C Recommendation` left in `docs/es`); `slot` ×3 → `espacio de extensión` ×3 (`reference:100`, `reference:152`, `flow:51`; zero `slot` in `docs/es`); `en el mismo sitio` ×4 → `en la misma ubicación` ×4 (`reference:9`, `resilience:9`, `flow:14`, `signing:18`); `Jan` → `ene` ×2 and `Apr` → `abr` ×1. **Not done:** 3 of the 6 month tokens keep the English capitalisation — `reference:30` `16 May 2023`, `reference:31` `17 Oct 2024`, `reference:75` `v1.0, Oct 2025` — beside `08 abr 2019` and `v1.0, ene 2020` in the same column. Non-blocking (§11).                                                                                                                                                                                                           |

---

## 4. Gate 4 re-run — untranslated body prose (PASS, zero hits)

Method, unchanged from attempt 1 so the two runs are comparable, plus a third scanner this run:

1. `scan.py` — strip fenced code, inline code, markdown destinations (balanced), bare URLs and table pipes,
   then match ~230 English function words and domain verbs/inflections.
2. `encensus.py` — a longer targeted English census (pronouns, auxiliaries, prepositions, domain verbs and
   nouns such as `update`, `escape`, `rules`, `value`, `field`, `page`, `document`, `default`, `breaker`)
   with word boundaries, printing every hit with its line.
3. `vocab.py` — vocabulary diff against the repo's own Spanish corpus: the 7 unchanged `docs/es/` pages plus
   the `HEAD` blobs of the three modified guides (`git show HEAD:docs/es/guides/*.md`), so "new word" is a
   measurement, not an opinion.

**Result of scanner 1: 2 hits, both excluded, therefore 0 untranslated prose.**

| Location                                 | Hit                 | Classification (agreed exclusion)                                                                                                          |
| ---------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/es/reference/dgii-official.md:120` | `and` / `Signature` | W3C document title `XML Signature Syntax and Processing 1.1` in the document-identity column — the untranslated proper title of a standard |
| `docs/es/reference/dgii-official.md:54`  | `escape`            | Spanish noun inside the translated phrase `reglas de escape` (D-2); `escape` is a Spanish word, not a leftover                             |

**Result of scanner 2: 19 hits, all classified, 0 prose defects.** Full list, so the judgement is
auditable:

| Class (excluded)                             | Hits | Where / why                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date tokens                                  | 1    | `16 May 2023` (`reference:30`) — a date, and the ISO dates beside the label are untouched (§11 residual)                                                                                                                                                                                                                              |
| W3C/IETF document titles + XML element names | 5    | `XML Signature Syntax and Processing 1.1` (`reference:120`), `enveloped-signature` (`reference:120`, `signing:10`), `**Signature**`/`**Reference**` (`signing:8,10` — XMLDSig element names, identical in EN)                                                                                                                         |
| Repo-convention borrowings already at HEAD   | 12   | `token` ×6 (`reference:152`, `flow:49,51,81,89`), `portal` ×2 (`reference:153`, `flow:91` — ordinary Spanish word), `breaker` ×2 (`resilience:3,28`), `circuit` ×1 (`resilience:3`), `default` ×1 (`resilience:105`) — `git grep -i` at HEAD over `docs/es/` counts `token` 14, `breaker` 5, `circuit` 2, `default` 1, `signature` 20 |
| Identifiers                                  | 1    | `<Signature>` element references inside prose are the same identifiers EN uses                                                                                                                                                                                                                                                        |

**Result of scanner 3:** the ES-only vocabulary (362 tokens absent from the pre-existing Spanish corpus)
contains no English sentence: the only English-looking members are `May`/`Oct`/`Jan`/`Apr` (dates),
`and`/`syntax`/`processing`/`encryption`/`canonical` (W3C/IETF titles), `rfc`/`ietf`/`pdf`/`openapi`/`pse`/
`app`/`dop`/`url`/`uri`/`xsd`/`rev`/`ng`/`art` (identifiers and DGII document jargon) and `escape` (Spanish
word). No English clause survives anywhere in the four ES files.

**Cross-check inside the built output:** `rg -o 'site-updated' site/es | wc -l` → **0**; the ES pages carry
`actualizado en el sitio` 48 times, i.e. the previous 48-occurrence defect is gone from the rendered site,
not just from the markdown.

---

## 5. Gate 5 re-run — Spanish quality and attribution fidelity (PASS)

Read end to end as a Dominican/LatAm Spanish reader: the whole reference page, all of `flow.md`'s prose,
`resilience.md` in full, `signing.md` in full; register compared against the pages already shipping in
`docs/es/` and against the `HEAD` blobs of the three guides.

### 5.1 The two attempt-1 language defects are gone

`by example` → `a modo de ejemplo` in both places (`reference:56`, `signing:13`), which restores the sense
("the profile _as shown by_ an example" rather than "for example"), and the unrelated `e.g.` → `por ejemplo`
at `resilience:20` was correctly left alone. The dropped contingency lead-in is present at `resilience:22`
in the English position (§3, D-5).

### 5.2 Nothing else dropped or added — measured, not sampled

Per-section sentence counts on all four pages, EN vs ES (prose only; code, tables, URLs and inline code
stripped): **29 sections, 29 × delta 0.** Attempt 1's mismatched section is now equal.

```text
reference/dgii-official.md   9 sections   6,3,4,1,4,3,1,5,4 sentences per section   all delta +0
guides/flow.md              11 sections   7,0,3,3,3,2,2,2,3,3,0                     all delta +0
guides/signing.md            4 sections   5,3,1,4                                   all delta +0
guides/resilience.md         5 sections   4,2,6,2,7                                   all delta +0
```

### 5.3 Register and terminology

Unchanged from attempt 1 and still correct: informal `tú` imperatives (`Tómalo`, `Empieza`, `Resuélvelo`,
`vuelve a comprobar`), `la DGII` as a feminine agent, and `e-CF`/`e-NCF`/`RFCE`/`ACECF`/`ANECF`/`trackId`/
`secuenciaUtilizada`/`C14N`/`RSA-SHA256` kept verbatim (Decision 9). `lote`, `semilla`, `comprobante`,
`receptor`, `comprador`, `umbral`, `contingencia`, `bitácora`, `espacio de extensión` used consistently.
The four page titles and `## Verificación obligatoria`, `## Firmar`, `## 2. Pre-flight (opcional)` remain
identical to HEAD — the repo's own renderings were reused, not reinvented.

### 5.4 Attribution fidelity — no change found

- **Version/date identity per row:** the version-date cell of **all 60** reference-table rows carries an
  identical numeral/version token sequence in both locales (`0` mismatches). No version, no DGII
  `site-updated` date and no `bitácora rev.` value drifted in the D-3 rewrite — which was the main risk of
  replacing a label in 29 cells.
- **Citations:** 8 (`flow`) + 1 (`signing`) + 3 (`resilience`) = 12 ES citation lines against 12 EN, on the
  same lines, with URLs in the same order (§6).
- **Article/section references:** `Art.` multiset identical (`Art. 11`, `Art. 11(c)`, `Art. 12`); `§`
  multiset identical on every page (21 tokens on the reference page, 5 in `flow`, 2 in `resilience`, 0 in
  `signing`), including `§4.1`, `§4.5–4.6`, `§4.9`, `§5.1`, `§5.2–5.3`, `§6.1`, `§7`, `§9`, `§10`,
  `§12–13`, `§19`.
- **Step-table document names:** the link texts in the `Documento(s) y sección que lo rigen` column are
  byte-identical to the English on all 11 rows (`same-links` on rows 50–60), so no attribution was
  re-pointed by the translated step labels.

---

## 6. Parity regression check — re-measured, nothing moved

Attempt 1's numbers, re-derived from today's bytes. **Every cell reproduces attempt 1 exactly**, except the
documented byte sizes (translation grows the pages) and the ES line numbers of the shifted citations.

### 6.1 Gate 1 — locale file parity

```text
$ diff <(cd docs/en && find . -name '*.md' | sort) <(cd docs/es && find . -name '*.md' | sort) ; echo "diff exit=$?"
diff exit=0
$ (cd docs/en && find . -name '*.md' | sort) | wc -l ; (cd docs/es && find . -name '*.md' | sort) | wc -l
11
11
$ test -f site/es/index.html ; echo "artifact test exit=$?"
artifact test exit=0
```

Both trees hold the same 11 pages (`examples.md`, `faq.md`, `guides/{flow,releases,resilience,signing}.md`,
`index.md`, `installation.md`, `python.md`, `reference/dgii-official.md`, `typescript.md`).

### 6.2 Gate 2 — URL parity per page (both extraction methods)

| Page                         | EN destinations                           | EN ext. occ. | ES destinations    | ES ext. occ. | ordered-identical | distinct EN/ES |
| ---------------------------- | ----------------------------------------- | ------------ | ------------------ | ------------ | ----------------- | -------------- |
| `reference/dgii-official.md` | 83 (81 md + 2 int)                        | 81           | 83 (81 md + 2 int) | 81           | **True**          | 43 / 43        |
| `guides/flow.md`             | 17 (15 md + 2 int)                        | 15           | 17 (15 md + 2 int) | 15           | **True**          | 8 / 8          |
| `guides/signing.md`          | 3 md (2 ext + 1 int) + 2 inline-code URIs | 4            | same split         | 4            | **True**          | 4 / 4          |
| `guides/resilience.md`       | 5 (4 md + 1 int)                          | 4            | 5 (4 md + 1 int)   | 4            | **True**          | 4 / 4          |

Union across the four pages: **104 occurrences, 45 distinct in each locale**, byte-identical and in the same
order; **0 only-in-EN, 0 only-in-ES**. Host split identical in both locales — distinct per host
`dgii.gov.do` 38, `statusecf.dgii.gov.do` 1, `www.w3.org` 5, `www.rfc-editor.org` 1 (= 45); occurrences per
host 91 / 3 / 8 / 2 (= 104). This is the same census attempt 1 and T3 recorded.

The only non-URL destination that differs remains the expected translation of the in-page anchor:
`internal EN = ['#which-document-governs-which-step', '../guides/flow.md']` vs
`internal ES = ['#que-documento-rige-cada-paso', '../guides/flow.md']`.

### 6.3 Gate 3 — headings, tables, citations, rendered counters

| Page                         | EN/ES headings | level sequence              | EN/ES table rows              | EN/ES table cols  | citations EN/ES |
| ---------------------------- | -------------- | --------------------------- | ----------------------------- | ----------------- | --------------- |
| `reference/dgii-official.md` | 9 / 9          | identical (`#` + 8 × `##`)  | `[7,6,5,15,4,6,10]` = 53 = 53 | `[4,4,4,4,4,4,3]` | 0 / 0           |
| `guides/flow.md`             | 11 / 11        | identical (`#` + 10 × `##`) | `[3,5,6]` = 14 = 14           | `[4,3,2]`         | 8 / 8           |
| `guides/signing.md`          | 4 / 4          | identical (`#` + 3 × `##`)  | `[]` = 0 = 0                  | `[]`              | 1 / 1           |
| `guides/resilience.md`       | 5 / 5          | identical (`#` + 4 × `##`)  | `[4]` = 4 = 4                 | `[2]`             | 3 / 3           |

Rendered element counters on the built pages (independent of the markdown):

| Page                       | bytes EN → ES   | `<table>` | `<thead>` | `<tr>`  | `href=`   | `<code>` | admonitions | `href="#…"` |
| -------------------------- | --------------- | --------- | --------- | ------- | --------- | -------- | ----------- | ----------- |
| `reference/dgii-official/` | 56,037 → 57,607 | 7 → 7     | 7 → 7     | 60 → 60 | 126 → 126 | 56 → 56  | 6 → 6       | 19 → 19     |
| `guides/flow/`             | 61,999 → 62,934 | 3 → 3     | 3 → 3     | 17 → 17 | 76 → 76   | 63 → 63  | 2 → 2       | 32 → 32     |
| `guides/signing/`          | 29,063 → 29,601 | 0 → 0     | 0 → 0     | 0 → 0   | 41 → 41   | 17 → 17  | 4 → 4       | 11 → 11     |
| `guides/resilience/`       | 36,024 → 36,683 | 1 → 1     | 1 → 1     | 5 → 5   | 46 → 46   | 28 → 28  | 4 → 4       | 14 → 14     |

Anchor/link sweep on the ES pages: **0 broken anchors, 0 broken relative links** on all four (15 distinct
internal link targets per page resolve). Byte sizes grew as expected for a translation (+217…+935 B per
page), no element count changed.

### 6.4 Two new regression measures this run

- **Version/date cell token sequence, per row, all 60 reference-table rows:** `0` mismatches between EN and
  ES. This is the measure that would have caught a date or version swallowed by the `site-updated` →
  `actualizado en el sitio` rewrite.
- **Ordered identifier/numeral skeleton per page** (every inline-code span plus every `§`/`Art.`/numeral in
  document order): identical length in both locales — 1158 / 1158 (`reference`), 328 / 328 (`flow`),
  71 / 71 (`signing`), 105 / 105 (`resilience`). The only positional differences are punctuation attached to
  a numeral by Spanish sentence structure (e.g. `256,` vs `256`) and the deliberately localised thousands
  separator (`1,000 entradas` EN → `1.000 entradas` ES).

---

## 7. Gate 6 — accuracy carried over (PASS)

| #   | Constraint                                                     | Evidence in ES today                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Result   |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| 1   | No article number or date for the commercial-approval deadline | `Art.` multisets identical and contain no AC-deadline article; `rg -i 'plazo\|días\|deadline'` over both reference pages → no match in either locale; the AC row still says only `la conformidad del receptor, dada por la aprobación o por presentar la compra en el formulario 606 correspondiente`                                                                                                                                                                                      | **PASS** |
| 2   | B2B exclusion attributed to the SDK guard                      | `reference:163` warning title `La exclusión de tipos para B2B es regla del SDK, no de la DGII`; guard identifiers `enforceB2BRules` / `enforce_b2b_rules` appear 1× each in both locales of `reference` and `flow`; `flow:310` keeps `El SDK lo rechaza (\`enforceB2BRules\`); los documentos de la DGII no enuncian tal exclusión`                                                                                                                                                        | **PASS** |
| 3   | `secuenciaUtilizada` on the track step                         | occurrences EN = ES per page: `reference` 1/1, `flow` 5/5, `resilience` 2/2; description unchanged (`… publicado en la respuesta del trackId como la señal de si una secuencia rechazada puede reutilizarse`)                                                                                                                                                                                                                                                                              | **PASS** |
| 4   | `CodigoSeguridadeCF` hash marked as the SDK's reading          | `reference:76` — `… la definición de \`CodigoSeguridadeCF\` — la DGII solo nombra un "hash"; SHA-256 es la lectura del SDK del perfil de firma`                                                                                                                                                                                                                                                                                                                                            | **PASS** |
| 5   | No DGII-attributed ambiente labels                             | `Ambiente` on `reference:57`, `:153` (parameter name / integer codes) mirrored from EN 2/2; `flow:87`, `:91`; `signing:72` `el ambiente de **certificación** de la DGII` (pre-existing at HEAD). `ambiente` counts EN/ES: `reference` 2/2, `flow` 1/2, `signing` 0/1, `resilience` 0/0 — the two ES-only counts are the translation of `environment` (EN `flow:86`) and the pre-existing `signing` line, not new DGII attributions (EN `flow:91` already uses the Spanish word `ambiente`) | **PASS** |
| 6   | Access date `2026-11-09` present and correct                   | exactly 1 per page in each locale (`reference`: `**Fecha de consulta de todas las filas: 2026-11-09.**`; each guide: `Los enlaces oficiales de esta página se verificaron el 2026-11-09.`); ISO-date multisets identical per page (`reference` 34/34, `flow` 15/15, `signing` 3/3, `resilience` 5/5)                                                                                                                                                                                       | **PASS** |

---

## 8. Gate 7 — build and format (PASS)

```text
$ packages/typescript/node_modules/.bin/prettier --check docs/es
Checking formatting...
All matched files use Prettier code style!                     # exit=0
$ packages/typescript/node_modules/.bin/prettier --check docs/en
All matched files use Prettier code style!                     # exit=0
$ uvx --from mkdocs --with mkdocs-material --with "mkdocs-static-i18n>=1.0,<2" mkdocs build --strict
INFO    -  mkdocs_static_i18n: Building 'es' documentation to directory: .../site/es
INFO    -  Documentation built in 2.18 seconds                 # BUILD_EXIT=0, 0 WARNING lines
$ bash -c 'diff <(cd docs/en && find . -name "*.md" | sort) <(cd docs/es && find . -name "*.md" | sort)'
diff exit=0
$ bash -c 'test -f site/es/index.html'
artifact test exit=0
```

The two `Check en/es translation parity` commands from `.github/workflows/docs.yml` pass **verbatim**. The
orphan-page `INFO` line for `es/reference/dgii-official.md` is the same line the English build prints and is
not a warning, so `--strict` stays green (the missing `nav` entry is the English deliverable's open item,
inherited — not an ES regression).

Observation `O-1` (unchanged from attempt 1): repo-wide `prettier --check .` still reports **11 files** —
10 `project-tasks/124-evidence/*.md` artifacts and `project-docs/marketing/github-listing.md` — and
**zero `docs/**` files**. Pre-existing lint debt, unaffected by this work.

---

## 9. Gate 8 — scope (PASS)

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
?? project-docs/marketing/          <-- pre-existing orphan, not attributable (attempt 1 §10.2 / T3 §3)
?? project-tasks/124-dgii-official-sources-ledger.md
?? project-tasks/124-dgii-official-sources-tasklist.md
?? project-tasks/124-evidence/
?? project-tasks/124-source-register.md

$ git status --porcelain -uall -- docs/
 M docs/en/guides/{flow,resilience,signing}.md
 M docs/es/guides/{flow,resilience,signing}.md
?? docs/en/reference/dgii-official.md
?? docs/es/reference/dgii-official.md

$ git diff --name-only -- mkdocs.yml packages examples project-docs
(empty)
$ git status --porcelain -uall -- mkdocs.yml packages examples project-docs
?? project-docs/marketing/github-listing.md
```

Identical to attempt 1: the change set is the four `docs/es/**` paths plus the four `docs/en/**` paths plus
`project-tasks/**`. `mkdocs.yml` (mtime 2026-11-02 20:33) and `project-docs/dgii-ground-truth.md`
(2026-11-02 20:05) are untouched, `packages/**` and `examples/**` carry no modification, and
`project-tasks/124-source-register.md` (11:24) and the tasklist (10:26) were **not** edited by the fix pass.
All 11 prior evidence files keep their earlier mtimes and content (`t6-evidence-collector-es-mirror.md` is
still 590 lines ending with its own attempt-1 outcome block).

### 9.1 The stray binary cache was NOT added to — and must be excluded before any commit

```text
$ find project-tasks/124-evidence/.pdfcache -type f | wc -l
22
$ du -sh project-tasks/124-evidence/.pdfcache
28M
$ ls -lt --time-style=full-iso project-tasks/124-evidence/.pdfcache/ | head -1
-rw-r--r-- 1 deuriib deuriib 30444 2026-11-09 11:52:06.434762898 -0400 tec10.txt   <-- newest entry
$ git check-ignore -v project-tasks/124-evidence/.pdfcache/leg01.pdf
(no output)  -> exit 1, i.e. NOT ignored
```

Same 22 files (13 PDFs + 9 TXT, 28 MB), newest mtime **11:52:06** — i.e. before attempt 1's own report
(12:37) and well before this fix pass (12:39). **No file was added, updated or removed.** The directory is
still **not** covered by `.gitignore` (`.gitignore:210` only ignores `site/`) and `.git/info/exclude` is the
untouched git default, so `git add -A` or `git add project-tasks/` would sweep 28 MB of DGII PDFs into the
docs commit. **Flagged for exclusion:** stage with explicit paths (`git add docs/ project-tasks/124-*.md`,
`git add project-tasks/124-evidence/*.md`) or add `project-tasks/124-evidence/.pdfcache/` to
`.gitignore`/`.git/info/exclude` before staging. This is a commit-mechanics hazard, not a documentation
defect.

---

## 10. Reproduction summary of the attempt-1 defect list

| Attempt-1 defect                                                            | Attempt-2 state                                                                          |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| D-1 `and` ×2 in reference prose (`:152`, `:161`)                            | `y` / `y` — resolved                                                                     |
| D-2 `(escape rules 2025-04-03)` (`:54`)                                     | `(reglas de escape 2025-04-03)` — resolved                                               |
| D-3 `site-updated` ×48 across four files                                    | `actualizado en el sitio` ×48, zero English, uniform, ordered dates identical — resolved |
| D-4 `por ejemplo` for `by example` (`reference:56`, `signing:13`)           | `a modo de ejemplo` ×2, `por ejemplo` only for `e.g.` — resolved                         |
| D-5 dropped contingency lead-in (`resilience`)                              | present at `:22` in the EN position — resolved                                           |
| O-4 polish (`W3C Recommendation`, `slot`, `en el mismo sitio`, `Jan`/`Apr`) | 3 of 4 sub-items done; month capitalisation 3/6 — **partially**                          |
| O-1 repo-wide prettier debt (11 non-`docs` files)                           | unchanged, out of scope                                                                  |
| O-2 English drift of two sentences since the attempt-2 EN validation        | unchanged (EN bytes identical to attempt 1)                                              |
| O-3 `.pdfcache/` binaries                                                   | unchanged: 22 files, newest 11:52:06 — still must be excluded                            |
| O-5 reference page absent from `nav` in both locales                        | unchanged — the T3 D-2 item, inherited, not an ES regression                             |

---

## 11. Remaining discrepancies (all non-blocking, none gate-level)

1. **O-4 month capitalisation, 3 occurrences.** `docs/es/reference/dgii-official.md:30` `16 May 2023`,
   `:31` `17 Oct 2024`, `:75` `v1.0, Oct 2025` keep the English capitalisation while the same column now
   writes `08 abr 2019` and `v1.0, ene 2020` in lowercase. `may`/`oct` are legitimate Spanish abbreviations,
   so this is a typographic inconsistency, not untranslated prose — the gate-4 scanner rightly excludes date
   tokens and gate 5's rubric (MT phrasing, dropped content, attribution) is untouched. **Recommendation:**
   finish the pass (`may`, `oct`) or revert the three converted tokens, so the column reads one way. Decide
   before the commit; do not leave the mix in place indefinitely.
2. **`Ese es el default seguro`** (`resilience:105`) keeps the borrowing `default` for EN "the safe
   default" — consistent with the one pre-existing `default` at HEAD, so it is repo convention rather than a
   leftover. Optional: `valor por defecto` (the same page's config table already uses that rendering).
3. Nothing else. No attachment, wording, version, article, section or date changed meaning in the fix pass.

**Nothing in this list is a gate failure**, and no fix introduced parity drift: every structural measure
from attempt 1 reproduces exactly (§6).

---

## 12. Coverage gaps (what this run does not prove)

- **No live re-request of the 45 external URLs.** The gate is parity; reachability was proven per-URL by
  T2/T3 the same day (45/45 HTTP 200), and no URL byte changed here (ordered-identity check, §6.2).
- **No screenshot pass.** The four pages have no interactive element; structural equivalence was proven on
  the built DOM (element counters, anchor and relative-link resolution) instead. A visual pass belongs with
  T7, when the page enters the `nav`.
- **The register/prose judgement is a human-language review** carried out exhaustively on the reference page
  and on all of `resilience`/`signing` plus the prose of `flow`, not a formal terminology glossary.
- **The English baseline is the working tree, not a commit.** It is byte-identical to attempt 1's, which is
  what makes this run's parity comparison like-for-like.

---

## 13. Method notes

- Every number above is a pasted command output; nothing is estimated. Where a scanner produced a
  false positive (`escape`, `ambiente`, `May`), the classification is shown with the reason so the reader can
  disagree with the judgement rather than having to trust it.
- Spanish quality was read against the repo's own Spanish corpus (7 unchanged `docs/es/` pages plus
  `git show HEAD:docs/es/guides/*.md`), so "the repo already renders this another way" is a measurement.
- Only this evidence file was written. No file under `docs/`, `mkdocs.yml`, the register, the tasklist or any
  prior evidence file was modified; `site/` (gitignored) was rebuilt exactly as CI does.

---

**QA Agent:** EvidenceQA · **Evidence date:** 2026-11-09 · **Reviewed build:** `site/` + `site/es/`
(mkdocs 2.18 s, `--strict`, 0 warnings).

## Outcome

Outcome: PASS — attempt 2 of 3. Gates 1–8 are all green: D-1…D-5 verified RESOLVED against the current content (D-3 uniform in all four ES files with zero `site-updated` surviving; D-5 inserted in the English position), gate 4 finds zero untranslated prose, gate 5 finds no MT phrasing, no dropped sentence and no attribution change, and the parity re-measurement reproduces attempt 1 exactly (11/11 files, 104 URLs / 45 distinct in identical order, identical headings, row/column vectors, 8/1/3 citations, identical rendered counters, 0 sentence-count deltas over 29 sections). No fix introduced parity drift.
Details: One non-blocking residual — optional polish O-4 is partially applied (3 of 4 sub-items done; `May`, `Oct`, `Oct` at `reference:30/31/75` keep English capitalisation beside `ene`/`abr`), which touches no gate but should be finished or reverted before commit. Commit hazard: `project-tasks/124-evidence/.pdfcache/` (22 files, 28 MB, not gitignored, untouched at 11:52) must be excluded from staging.
`project-tasks/124-evidence/t6-evidence-collector-es-mirror-attempt2.md` — QA evidence for attempt 2: per-fix table D-1…D-5/O-4 with proving lines, 8-gate table with re-measured parity numbers, untranslated-prose census with exclusions, Spanish-quality and attribution-fidelity review, scope and build evidence.
