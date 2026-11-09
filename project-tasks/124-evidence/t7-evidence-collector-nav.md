# T7 / #124 — Navigation wiring evidence (`mkdocs.yml`)

**Agent:** EvidenceQA (command-verified; every claim below is pasted output)
**Date:** 2026-11-09
**Attempt:** 1 of 3
**File under review:** `mkdocs.yml` (the only file in scope for this review)
**Branch:** `docs/124-dgii-official-sources` @ `b44ebb4`, working tree dirty, index empty
**Toolchain:** `uvx --from mkdocs --with mkdocs-material --with "mkdocs-static-i18n>=1.0,<2"`

## Verdict

**QA PASS — 7 of 7 criteria from the review brief.**

The diff is exactly the four intended lines, `mkdocs build --strict` exits 0 with zero `WARNING`
records, both locale artifacts are emitted and non-trivial, and the rendered nav in **both** locales
carries `Reference → Official DGII references` with the Spanish labels resolved (no silent English
fallback).

Two findings, neither of them a build defect:

| ID     | Severity                          | Summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F1** | Medium — **needs owner decision** | The delivered nav **shape** (a `Reference:` parent group + 2 translation keys) contradicts `project-tasks/124-dgii-official-sources-tasklist.md` **Decision 7**, **D8**, **D6** and likely **T10's DoD + Verify**, which mandate a **flat** entry, **one** key, `+2` lines and 12 translated elements. The brief for this review explicitly specifies the _group_ shape, so the implementation matches the brief and fails the plan. D8 says deviating requires the issue author's sign-off, and no sign-off artifact exists in the repo. |
| **F2** | Low — process note                | `mkdocs.yml` now cites `reference/dgii-official.md`, but `docs/en/reference/` and `docs/es/reference/` are **untracked** in this working tree. `mkdocs.yml` therefore cannot land alone: `--strict` fails hard (reproduced, exit 1). Already implied by plan risks D4/D5.                                                                                                                                                                                                                                                                 |

Nothing in `theme`, `markdown_extensions`, `site_*` or `docs_dir` changed, and `es` is still declared
**first**.

---

## 1. Minimal diff

### 1.1 `--numstat` and `--stat`

```
$ git diff --numstat mkdocs.yml
4	0	mkdocs.yml

$ git diff --stat mkdocs.yml
 mkdocs.yml | 4 ++++
 1 file changed, 4 insertions(+)

$ git diff --cached --numstat -- mkdocs.yml
(empty — nothing staged; the whole change is in the working tree)
```

**4 insertions, 0 deletions, 1 file.** No rename, no mode change, no staged half.

### 1.2 Every hunk, zero context (`-U0`) — this is the complete change

```
$ git diff -U0 mkdocs.yml
mkdocs.yml | 4 ++++
 1 file changed, 4 insertions(+)

Changes:

mkdocs.yml
@@ -41,0 +42,2 @@ nav:
+  - Reference:
+      - Official DGII references: reference/dgii-official.md
@@ -83,0 +86,2 @@ plugins:
+            Reference: Referencia
+            Official DGII references: Referencias oficiales de la DGII
  +4 -0
```

Exactly **two hunks, four added lines, nothing removed**.

### 1.3 Word-level diff (shows the inserts sit between untouched neighbours)

```
$ git diff --word-diff=plain mkdocs.yml
@@ -39,6 +39,8 @@ nav:
      - Signing (XMLDSig): guides/signing.md
      - Resilience & idempotency: guides/resilience.md
      - Releases & publishing: guides/releases.md
  {+- Reference:+}
{+      - Official DGII references: reference/dgii-official.md+}
  - Examples: examples.md
  - FAQ: faq.md

@@ -81,6 +83,8 @@ plugins:
            Signing (XMLDSig): Firma (XMLDSig)
            Resilience & idempotency: Resiliencia e idempotencia
            Releases & publishing: Lanzamientos y publicación
            {+Reference: Referencia+}
{+            Official DGII references: Referencias oficiales de la DGII+}
            Examples: Ejemplos
            FAQ: Preguntas frecuentes
        - locale: en
```

The offending nav group lands **after** `Guides` and **before** `Examples`; the translation keys land
**after** `Releases & publishing` and **before** `Examples: Ejemplos`. Both are in the position the
brief describes.

### 1.4 Guardrail check against the "must not change" list

| Zone                                                                             | Changed? | Evidence                                                                                       |
| -------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `theme` (name / language / palette / features)                                   | **No**   | no hunk touches lines 9–30; `-U0` shows additions only at `nav:` and inside `nav_translations` |
| `plugins` — plugin list, order, `i18n` options                                   | **No**   | see note below                                                                                 |
| `markdown_extensions` (incl. the `pymdownx.superfences` `!!python/name:` tag)    | **No**   | no hunk in lines 47–60                                                                         |
| `site_name`, `site_description`, `site_url`, `repo_url`, `repo_name`, `edit_uri` | **No**   | no hunk in lines 1–6                                                                           |
| `docs_dir`                                                                       | **No**   | line 7 unchanged                                                                               |
| Unrelated lines / whitespace / re-indent / EOF churn                             | **No**   | `-U0` reports **0 deletions**, so no existing line was rewritten                               |

**Flagging the `plugins` question explicitly, as asked:** there _is_ one hunk inside the `plugins:`
block — but it is the authorized one. The `i18n` plugin keeps a `nav_translations:` map per locale, so
the two new `es` keys necessarily land under `plugins:`. Verified untouched: `search`, `i18n`,
`docs_structure: folder`, `fallback_to_default: true`, `reconfigure_material`, `reconfigure_search`,
the `languages:` list, and both `locale:` / `name:` / `build:` / `default:` keys. **No plugin was
added, removed or reconfigured.**

### 1.5 `es` is still declared **first** — the 404 rationale is intact

```
$ grep -n 'locale:' mkdocs.yml          # working tree
73:        - locale: es
90:        - locale: en

$ git show HEAD:mkdocs.yml | grep -n 'locale:'
71:        - locale: es
86:        - locale: en
```

Identical relative order at `HEAD` and in the working tree; the line numbers moved by +2 because of the
insertion above them. `es` remains the **first** entry of `languages:`; `en` is still the only locale
carrying `default: true` and is still listed **after** `es`.

The explanatory comment is untouched (it is context, not a change) and still reads at lines 70–72:

```yaml
# `es` is listed first on purpose: the plugin has no per-locale 404
# page support, so the last built locale wins the shared `404.html`.
# Building `en` last keeps that shared page in the default language.
```

**Behavioural proof that the order was not flipped** — the shared `404.html` is still owned by `en`,
which is only true when `en` is still built last:

```
$ grep -oE '<html lang="[^"]*"' site/404.html
<html lang="en"

$ grep -oE '<h1[^>]*>[^<]*</h1>' site/404.html
<h1>404 - Not found</h1>
```

The build log (§2) confirms the order: `Building 'es' … → site/es` then `Building 'en' … → site`. A
reordering of `languages:` would have flipped this to `lang="es"`. **No regression.**

---

## 2. Build — `--strict`, exit 0, zero warnings

Run verbatim from `.github/workflows/docs.yml`, after moving the stale `site/` aside so nothing is
carried over (`site/` is gitignored — `.gitignore:210`):

```
$ uvx --from mkdocs --with mkdocs-material --with "mkdocs-static-i18n>=1.0,<2" mkdocs build --strict
EXIT=0
```

Full output (ANSI stripped), in order:

```
 │  Material for MkDocs reaches end of life on May 5, 2027.
 │  Critical fixes and security updates continue until that date.
 │
 │  Zensical is its maintained successor, built by the same team.
 │  Try it alongside MkDocs with your existing mkdocs.yml:
 │  https://zensical.org/docs/compatibility/mkdocs/migration/
  To disable this warning, set NO_MKDOCS_2_WARNING=1.
INFO    -  mkdocs_static_i18n: Building 'en' documentation to directory: /home/deuriib/projects/dgii-ecf/site
INFO    -  mkdocs_static_i18n: Adding 'es' to the 'material/search' plugin 'lang' option
INFO    -  Cleaning site directory
INFO    -  Building documentation to directory: /home/deuriib/projects/dgii-ecf/site
INFO    -  mkdocs_static_i18n: Building 'es' documentation to directory: /home/deuriib/projects/dgii-ecf/site/es
INFO    -  mkdocs_static_i18n: Translated 13 navigation elements to 'es'
INFO    -  mkdocs_static_i18n: Building 'en' documentation to directory: /home/deuriib/projects/dgii-ecf/site
INFO    -  Documentation built in 1.98 seconds
```

### 2.1 Zero warnings — and the one `grep` trap

```
$ grep -c 'WARNING' /tmp/mkdocs-build-nav.log
1
```

That single hit is **not** a build warning: it is the literal token `NO_MKDOCS_2_WARNING` inside
Material's unconditional end-of-life banner. Proof:

```
$ grep -niE 'warn' /tmp/mkdocs-build-nav.log
9:  To disable this warning, set NO_MKDOCS_2_WARNING=1.

$ grep -c 'WARNING *-' /tmp/mkdocs-build-nav.log
0
```

Zero mkdocs `WARNING -` records. Re-running with the banner suppressed produces a log with **no**
case-insensitive `warn` match at all, still exit 0:

```
$ NO_MKDOCS_2_WARNING=1 uvx --from mkdocs … mkdocs build --strict
INFO    -  mkdocs_static_i18n: Building 'en' documentation to directory: …/site
INFO    -  mkdocs_static_i18n: Adding 'es' to the 'material/search' plugin 'lang' option
INFO    -  Cleaning site directory
INFO    -  Building documentation to directory: …/site
INFO    -  mkdocs_static_i18n: Building 'es' documentation to directory: …/site/es
INFO    -  mkdocs_static_i18n: Translated 13 navigation elements to 'es'
INFO    -  mkdocs_static_i18n: Building 'en' documentation to directory: …/site
INFO    -  Documentation built in 1.98 seconds
EXIT=0

$ grep -ciE 'warning' (that log)
0
```

### 2.2 The "not included in the nav" INFO is gone — proven with a negative control

```
$ grep -c 'not included in the nav' /tmp/mkdocs-build-nav.log /tmp/mkdocs-build-nav-nowarn.log
/tmp/mkdocs-build-nav.log:0
/tmp/mkdocs-build-nav-nowarn.log:0

$ grep -c 'pages exist in the docs directory' /tmp/mkdocs-build-nav.log
0
```

A zero-hit grep can also mean "the plugin never emits that message", so I also built the **same working
tree against the `HEAD` nav** — the current `mkdocs.yml` minus the four added lines, first confirmed
byte-identical to `git show HEAD:mkdocs.yml` — into `/tmp/navneg/site`. The real `site/` was not
touched:

```
$ diff <(git show HEAD:mkdocs.yml) <(sed 's#^docs_dir: .*#docs_dir: docs#' /tmp/navneg/mkdocs-head.yml) && echo "IDENTICAL to HEAD (modulo the temp docs_dir rewrite)"
IDENTICAL to HEAD (modulo the temp docs_dir rewrite)      ← diff printed nothing; the echo is the `&&` confirmation

$ uvx --from mkdocs … mkdocs build -f /tmp/navneg/mkdocs-head.yml -d /tmp/navneg/site
INFO    -  Building documentation to directory: /tmp/navneg/site
INFO    -  The following pages exist in the docs directory, but are not included in the "nav" configuration:
  - en/reference/dgii-official.md
INFO    -  Building 'es' documentation to directory: /tmp/navneg/site/es
INFO    -  The following pages exist in the docs directory, but are not included in the "nav" configuration:
  - es/reference/dgii-official.md
INFO    -  Translated 11 navigation elements to 'es'
INFO    -  Building 'en' documentation to directory: /tmp/navneg/site
INFO    -  The following pages exist in the docs directory, but are not included in the "nav" configuration:
  - en/reference/dgii-official.md
INFO    -  Documentation built in 3.11 seconds
EXIT=0
```

So:

| Signal                             | `HEAD` nav (control)                             | Delivered nav | Effect                                                         |
| ---------------------------------- | ------------------------------------------------ | ------------- | -------------------------------------------------------------- |
| pages-not-in-nav INFO              | **3 occurrences**, naming both `en/…` and `es/…` | **0**         | the stated goal, achieved for **both** locales                 |
| `Translated N navigation elements` | **11**                                           | **13**        | both new `nav_translations` keys are live; neither is orphaned |
| `--strict`                         | 0 (that INFO is not a gate)                      | 0             | —                                                              |

13 = 11 baseline + 2 new keys, and the `es` map does contain exactly 13 keys: `Home, Installation,
TypeScript, Python, Guides, End-to-end flow, Signing (XMLDSig), Resilience & idempotency, Releases &
publishing, Reference, Official DGII references, Examples, FAQ`. One key per rendered element, no dead
key.

---

## 3. Emitted pages

```
$ stat -c '%n = %s bytes' site/reference/dgii-official/index.html site/es/reference/dgii-official/index.html
site/reference/dgii-official/index.html = 59897 bytes
site/es/reference/dgii-official/index.html = 61485 bytes

$ wc -c site/reference/dgii-official/index.html site/es/reference/dgii-official/index.html
 59897 site/reference/dgii-official/index.html
 61485 site/es/reference/dgii-official/index.html
121382 total
```

Both exist; both are ~60 KB of rendered HTML (source markdown is 43.7 KB / 45.6 KB). Neither is a stub
or near-empty page.

### 3.1 The Spanish page is genuinely Spanish, not an English fallback

`fallback_to_default: true` would silently have produced an English `es` page. It did not:

| Signal        | `site/reference/dgii-official/index.html`               | `site/es/reference/dgii-official/index.html`                                                                                                                                                                                                                     |
| ------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<html lang>` | `en`                                                    | **`es`**                                                                                                                                                                                                                                                         |
| `<h1>`        | `official-dgii-references` → "Official DGII references" | **`referencias-oficiales-de-la-dgii` → "Referencias oficiales de la DGII"**                                                                                                                                                                                      |
| `<title>`     | `Official DGII references - DGII e-CF SDKs`             | **`Referencias oficiales de la DGII - DGII e-CF SDKs`**                                                                                                                                                                                                          |
| `<h2>` ids    | English slugs                                           | **`marco-legal-y-normativo`, `especificacion-tecnica-y-especificaciones-de-servicio`, `formatos-de-documento`, `esquemas-xml`, `estandares-de-firma-y-xml`, `manuales-operativos-y-de-certificacion`, `que-documento-rige-cada-paso`, `alcance-de-esta-pagina`** |

---

## 4. Rendered nav, both locales

**Extraction method (reproducible):** parse the built HTML, walk **only**
`<nav class="md-nav md-nav--primary">` — the drawer nav Material renders from the `nav:` tree —
skipping `md-nav__title` labels and the `md-nav--secondary` page-TOC node Material embeds inside the
active item. Tree shape comes from `md-nav` nesting depth; leaf text is the `<a class="md-nav__link">`
label. Script lives at `/tmp/navtree.py` (read-only).

### 4.1 `site/index.html` (English) — verbatim

```
===== site/index.html — extracted nav =====
Home  ->  .
Installation  ->  installation/
TypeScript  ->  typescript/
Python  ->  python/
Guides  [4 children]
  End-to-end flow  ->  guides/flow/
  Signing (XMLDSig)  ->  guides/signing/
  Resilience & idempotency  ->  guides/resilience/
  Releases & publishing  ->  guides/releases/
Reference  [1 child]
  Official DGII references  ->  reference/dgii-official/
Examples  ->  examples/
FAQ  ->  faq/
--- top-level entries: 8 ---
```

### 4.2 `site/es/index.html` (Spanish) — verbatim

```
===== site/es/index.html — extracted nav =====
Inicio  ->  ./
Instalación  ->  installation/
TypeScript  ->  typescript/
Python  ->  python/
Guías  [4 children]
  Flujo de extremo a extremo  ->  guides/flow/
  Firma (XMLDSig)  ->  guides/signing/
  Resiliencia e idempotencia  ->  guides/resilience/
  Lanzamientos y publicación  ->  guides/releases/
Referencia  [1 child]
  Referencias oficiales de la DGII  ->  reference/dgii-official/
Ejemplos  ->  examples/
Preguntas frecuentes  ->  faq/
--- top-level entries: 8 ---
```

### 4.3 Diff against the brief's expected trees

**English** — expected `Home, Installation, TypeScript, Python, Guides (4 children), Reference (1
child, "Official DGII references"), Examples, FAQ`:

| #   | Expected                                                      | Actual                                                           | Match |
| --- | ------------------------------------------------------------- | ---------------------------------------------------------------- | ----- |
| 1   | Home                                                          | Home                                                             | ✅    |
| 2   | Installation                                                  | Installation                                                     | ✅    |
| 3   | TypeScript                                                    | TypeScript                                                       | ✅    |
| 4   | Python                                                        | Python                                                           | ✅    |
| 5   | Guides, 4 children                                            | Guides, 4 children (`flow`, `signing`, `resilience`, `releases`) | ✅    |
| 6   | **Reference, 1 child "Official DGII references", position 6** | **Reference, 1 child "Official DGII references", position 6**    | ✅    |
| 7   | Examples                                                      | Examples                                                         | ✅    |
| 8   | FAQ                                                           | FAQ                                                              | ✅    |

**Spanish** — expected "the same shape with the translated labels, including `Referencias oficiales
de la DGII` and `Referencia`":

| #   | Expected                                                     | Actual                                                                                                                          | Match |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | translated Home                                              | Inicio                                                                                                                          | ✅    |
| 2   | translated Installation                                      | Instalación                                                                                                                     | ✅    |
| 3   | TypeScript                                                   | TypeScript                                                                                                                      | ✅    |
| 4   | Python                                                       | Python                                                                                                                          | ✅    |
| 5   | Guías, 4 children                                            | Guías, 4 children (`Flujo de extremo a extremo`, `Firma (XMLDSig)`, `Resiliencia e idempotencia`, `Lanzamientos y publicación`) | ✅    |
| 6   | **`Referencia`, 1 child `Referencias oficiales de la DGII`** | **`Referencia`, 1 child `Referencias oficiales de la DGII`**                                                                    | ✅    |
| 7   | translated Examples                                          | Ejemplos                                                                                                                        | ✅    |
| 8   | translated FAQ                                               | Preguntas frecuentes                                                                                                            | ✅    |

Order, shape, depth and labels are identical across locales. **No English leaked into the Spanish nav**
— `Reference` and `Official DGII references` do not appear in the `md-nav--primary` tree of
`site/es/index.html`.

### 4.4 The failure mode this task could have introduced — checked, absent

> "an entry that only exists in one locale is the failure mode this task could introduce"

```
$ for f in site/index.html site/es/index.html; do printf '%-22s ' "$f"; grep -c 'reference/dgii-official' "$f"; done
site/index.html        2
site/es/index.html     2
```

Both navs carry the entry, at the same position and depth. The entry is **not** one-locale-only.
(`grep -c` counts 2 because the drawer nav and the mobile-nav duplicate each other, as for every other
item.)

---

## 5. Cross-locale links

### 5.1 The Spanish page is reachable from the **Spanish** nav — from every Spanish page

Nav hrefs are page-relative, so a correct `es` entry must resolve inside `site/es/`, not `site/`:

```
$ python3 (resolve every md-nav--primary href against its page's directory)
OK   site/index.html                        nav href reference/dgii-official/        -> site/reference/dgii-official/index.html exists=True
OK   site/typescript/index.html             nav href ../reference/dgii-official/     -> site/reference/dgii-official/index.html exists=True
OK   site/guides/flow/index.html            nav href ../../reference/dgii-official/  -> site/reference/dgii-official/index.html exists=True
OK   site/faq/index.html                    nav href ../reference/dgii-official/     -> site/reference/dgii-official/index.html exists=True
OK   site/es/index.html                     nav href reference/dgii-official/        -> site/es/reference/dgii-official/index.html exists=True
OK   site/es/typescript/index.html          nav href ../reference/dgii-official/     -> site/es/reference/dgii-official/index.html exists=True
OK   site/es/guides/flow/index.html         nav href ../../reference/dgii-official/  -> site/es/reference/dgii-official/index.html exists=True
OK   site/es/faq/index.html                 nav href ../reference/dgii-official/     -> site/es/reference/dgii-official/index.html exists=True

ALL NAV LINKS RESOLVE: True
locale of resolved target matches page locale: True
```

The `es` hrefs resolve under `site/es/reference/dgii-official/`, never under `site/reference/…`. **The
Spanish page is reachable from the Spanish nav**, and the relative depth is correct at every nesting
level (locale root, one level down, two levels down).

### 5.2 The language switcher round-trips

```
$ grep md-select__link site/reference/dgii-official/index.html
<a href="../../es/reference/dgii-official/" hreflang="es" class="md-select__link">
<a href="./" hreflang="en" class="md-select__link">

$ grep md-select__link site/es/reference/dgii-official/index.html
<a href="./" hreflang="es" class="md-select__link">
<a href="../../../reference/dgii-official/" hreflang="en" class="md-select__link">
```

EN → ES and ES → EN both point at real, built paths.

### 5.3 The pages' own internal links resolve on disk

Every non-`http(s)` `href` inside `<article class="md-content__inner">` was resolved against the page's
own directory; in-page `#anchors` were checked for a matching `id=` in the same document.

```
--- EN reference page: internal hrefs on page: 11 ---
  OK   ../../guides/flow/                       -> site/guides/flow
  OK   #official-dgii-references (in-page anchor)
  OK   #legal-and-normative-framework (in-page anchor)
  OK   #which-document-governs-which-step (in-page anchor)
  OK   #technical-specification-and-service-level-specifications (in-page anchor)
  OK   #document-formats (in-page anchor)
  OK   #xml-schemas (in-page anchor)
  OK   #signature-and-xml-standards (in-page anchor)
  OK   #operational-and-certification-manuals (in-page anchor)
  OK   #scope-of-this-page (in-page anchor)
  --> 0 broken internal target(s) on EN reference page

--- ES reference page: internal hrefs on page: 11 ---
  OK   ../../guides/flow/                       -> site/es/guides/flow
  OK   #referencias-oficiales-de-la-dgii (in-page anchor)
  OK   #marco-legal-y-normativo (in-page anchor)
  OK   #que-documento-rige-cada-paso (in-page anchor)
  OK   #especificacion-tecnica-y-especificaciones-de-servicio (in-page anchor)
  OK   #formatos-de-documento (in-page anchor)
  OK   #esquemas-xml (in-page anchor)
  OK   #estandares-de-firma-y-xml (in-page anchor)
  OK   #manuales-operativos-y-de-certificacion (in-page anchor)
  OK   #alcance-de-esta-pagina (in-page anchor)
  --> 0 broken internal target(s) on ES reference page
```

Note `../../guides/flow/` resolves to `site/es/guides/flow` on the Spanish page — the two-level climb is
correct because the page sits at `es/reference/dgii-official/`. No internal link escapes into the
English tree. (Outbound `https://dgii.gov.do/…` targets are not validated by `--strict`; they are out of
scope for this navigation review and belong to T11's `curl` evidence.)

---

## 6. CI gates, verbatim from `.github/workflows/docs.yml`

The workflow step "Check en/es translation parity" is, character for character:

```yaml
- name: Check en/es translation parity
  run: |
    diff <(cd docs/en && find . -name '*.md' | sort) <(cd docs/es && find . -name '*.md' | sort)
    test -f site/es/index.html
```

Run exactly as written, in `bash` so process substitution works:

```
$ diff <(cd docs/en && find . -name '*.md' | sort) <(cd docs/es && find . -name '*.md' | sort)
diff exit=0                  ← no output: the two locale file lists are identical

$ test -f site/es/index.html
test -f site/es/index.html exit=0
```

For the record, both lists are 11 markdown files:

```
$ (cd docs/en && find . -name '*.md' | sort) | wc -l
11
$ (cd docs/es && find . -name '*.md' | sort) | wc -l
11
```

Baseline per the tasklist §2 was 10 per locale; each locale gained exactly one file, so the CI gate is
green only because both T2 and T6 landed — which they have.

---

## 7. Format

The repo's prettier gate (`mise run lint` → `prettier --check .` from the root, using the TypeScript
package's binary because there is no root `package.json`):

```
$ packages/typescript/node_modules/.bin/prettier --check mkdocs.yml
Checking formatting...
All matched files use Prettier code style!
exit=0

$ packages/typescript/node_modules/.bin/prettier --version
3.9.10
```

---

## 8. Findings — expected vs actual

### F1 — Nav **shape** deviates from the plan's Decision 7 / D8 (Medium, needs owner decision)

This is the one substantive discrepancy, and it is a **spec-vs-spec** conflict, not a build defect.

**What the plan says (flat entry, one key, 12 translations, `+2` lines):**

> `project-tasks/124-dgii-official-sources-tasklist.md:110` — **Decision 7. Nav shape (A2).** Exactly
> **one** new top-level nav label, placed after the `Guides` block, plus **one** `nav_translations`
> key. Introducing a new `Reference:` parent section would create a second untranslated key — **out of
> scope**.

> `:499` — **D8. A2 could be read as "add a nav section."** Creating a `Reference:` parent adds a
> second untranslated key. → Mitigation: "Decision 7 fixes the shape: one top-level entry, one
> translation key. **Deviating requires the issue author's sign-off.**"

> `:351-353` — T10, Definition of done: "**One** new top-level nav entry immediately after the
> `Guides:` block: `Official DGII references: reference/dgii-official.md`." / "**One** new
> `nav_translations` key under `es`" / "Nothing else changes: **no new nav section**, no
> theme/palette/features change, no new plugin/extension".

> `:359-364` — T10, Verify: `# nav translation count must go 11 -> 12` … `git diff --stat -- mkdocs.yml  # 2 added lines only`

> `:461` — A2 primary evidence row: "nav entry + `nav_translations` key; log line `Translated 12 navigation elements`"

**What this diff actually does:**

| Measured                           | Plan (T10 / D6 / D8 / A2)                  | Brief for this review         | Actual                         |
| ---------------------------------- | ------------------------------------------ | ----------------------------- | ------------------------------ |
| `git diff --numstat mkdocs.yml`    | `2 0`                                      | `4 0` (group + 2 keys)        | **`4 0`**                      |
| `nav_translations` keys added      | 1                                          | 2                             | **2**                          |
| Nav shape                          | flat top-level `Official DGII references:` | `Reference:` parent + 1 child | **parent + 1 child**           |
| `Translated N navigation elements` | **12**                                     | 13 (11 baseline + 2)          | **13**                         |
| Top-level nav entries              | 8, but the new one is a leaf               | 8, entry #6 is `Reference`    | **8, entry #6 is `Reference`** |

The "12" in D6/A2/T10 is arithmetically the _flat_ shape (11 + 1 key). The implementation is the
_group_ shape (11 + 2 keys), hence 13. Both are internally coherent; they are simply different designs.

**Which is authoritative?** The brief I was given for this review states the expected English tree as
"`… Guides (4 children), Reference (1 child, "Official DGII references"), Examples, FAQ`" and scopes the
diff as "a `Reference` group added to `nav:` plus two keys in the `es` locale's `nav_translations`" —
i.e. the **group** shape. The implementation matches that brief exactly, in both locales, at the right
position and depth. On the brief's own terms this is a PASS.

**But** D8 requires the issue author's explicit sign-off for this shape, and I found no sign-off
artifact in the repository:

```
$ grep -rniE 'sign-?off.*(nav|reference group)|Decision 7' project-tasks/*.md
project-tasks/124-dgii-official-sources-tasklist.md:499:| D8 | … Deviating requires the issue author's sign-off. |
```

The only hits are D8 and the still-flat Decision 7 text itself. Decision 7, T10's DoD/Verify, D6 and the
A2 evidence row have **not** been amended to the group shape.

**Fix — pick one; both are one-line edits for the owner. I did not touch any file.**

- **(a) Accept the group shape (no code change).** Amend
  `project-tasks/124-dgii-official-sources-tasklist.md` Decision 7, T10 DoD + Verify, D6 and the A2
  evidence row from "one entry / one key / 12 / `+2`" to "`Reference:` parent + child / two keys / 13 /
  `+4`", and record the issue-author sign-off that D8 demands. The delivered `mkdocs.yml` then stands
  as-is.
- **(b) Conform to the plan (2-line code change).** Replace the two nav lines with
  `  - Official DGII references: reference/dgii-official.md` and drop the `Reference: Referencia`
  translation key, keeping only `Official DGII references: Referencias oficiales de la DGII`. Expected
  result: `--numstat` = `2 0`, `Translated 12 navigation elements`, top-level entry #6 becomes the leaf
  `Official DGII references` — and the brief's expected tree in §4.3 would then have to be restated.

Not a blocker on engineering quality (build green, both locales correct, prettier clean). It is a
blocker on **traceability**: as it stands, an auditor comparing the change to the plan sees "out of
scope, sign-off required, not recorded".

### F2 — `mkdocs.yml` cannot land alone (Low, process)

`mkdocs.yml` now points at `reference/dgii-official.md`, but `docs/en/reference/` and
`docs/es/reference/` are **untracked** in this working tree:

```
$ git status --short
 M docs/en/guides/flow.md
 M docs/en/guides/resilience.md
 M docs/en/guides/signing.md
 M docs/es/guides/flow.md
 M docs/es/guides/resilience.md
 M docs/es/guides/signing.md
 M mkdocs.yml
?? docs/en/reference/
?? docs/es/reference/
?? project-docs/marketing/
?? project-tasks/124-dgii-official-sources-ledger.md
?? project-tasks/124-dgii-official-sources-tasklist.md
?? project-tasks/124-evidence/
?? project-tasks/124-source-register.md
```

Reproduced in `/tmp` (current `mkdocs.yml` with `docs_dir` repointed at a copy of `docs/` that has the
`reference/` directories removed — the repo was not modified):

```
$ uvx --from mkdocs … mkdocs build --strict -f /tmp/ordertest/mkdocs.yml -d /tmp/ordertest/site
INFO    -  Building documentation to directory: /tmp/ordertest/site
WARNING -  A reference to 'reference/dgii-official.md' is included in the 'nav' configuration, which is not found in the documentation files.
WARNING -  Doc file 'en/guides/flow.md' contains a link '../reference/dgii-official.md', but the target 'en/reference/dgii-official.md' is not found among documentation files.
WARNING -  Doc file 'en/guides/flow.md' contains a link '../reference/dgii-official.md', but the target 'en/reference/dgii-official.md' is not found among documentation files.
WARNING -  Doc file 'en/guides/resilience.md' contains a link '../reference/dgii-official.md', but the target 'en/reference/dgii-official.md' is not found among documentation files.
WARNING -  Doc file 'en/guides/signing.md' contains a link '../reference/dgii-official.md', but the target 'en/reference/dgii-official.md' is not found among documentation files.
INFO    -  mkdocs_static_i18n: Building 'es' documentation to directory: /tmp/ordertest/site/es
WARNING -  A reference to 'reference/dgii-official.md' is included in the 'nav' configuration, which is not found in the documentation files.
INFO    -  mkdocs_static_i18n: Translated 13 navigation elements to 'es'
WARNING -  Doc file 'es/guides/flow.md' contains a link '../reference/dgii-official.md', but the target 'es/reference/dgii-official.md' is not found among documentation files.
WARNING -  Doc file 'es/guides/resilience.md' contains a link '../reference/dgii-official.md', but the target 'es/reference/dgii-official.md' is not found among documentation files.
WARNING -  Doc file 'es/guides/signing.md' contains a link '../reference/dgii-official.md', but the target 'es/reference/dgii-official.md' is not found among documentation files.
Aborted with 5 warnings in strict mode!
EXIT=1
```

**Expected:** `mkdocs.yml`, `docs/en/reference/`, `docs/es/reference/` and the six edited guide pages
land in a single commit series (plan risks D4/D5: "Locale parity is a CI hard gate"). **Actual:** all of
them are present in the working tree — so the _change set_ is correct — but `mkdocs.yml` is the only
tracked file of that set, so a partial commit turns `docs` red. **Fix:** none in code; just do not split
the commit (or, if split, land the two reference pages first).

### Minor observations (not findings)

1. **T10's first `grep` alternative fails by design.** T10's verify block contains
   `grep -q 'href="../reference/dgii-official/"' site/es/index.html || grep -q 'reference/dgii-official' site/es/index.html`.
   On the homepage the href is `reference/dgii-official/` (no `../` — the page sits at the locale root),
   so the first `grep` exits 1 and the fallback exits 0. The gate passes; the pattern was written for a
   non-home page. Measured:
   `grep -q 'href="../reference/dgii-official/"' site/es/index.html` → exit **1**;
   `grep -q 'reference/dgii-official' site/es/index.html` → exit **0**.
2. **The build order is `en`, `es`, then `en`** (the plugin's final pass). The _last_ build wins the
   shared `404.html`, and it is `en` — matching the comment's intent. See §1.5.

---

## 9. Scope discipline

- Files written by this task: **only** `project-tasks/124-evidence/t7-evidence-collector-nav.md` (this
  file).
- `mkdocs.yml` and everything under `docs/` were **not** edited. `git diff --numstat -- mkdocs.yml` was
  re-polled after every build and is still `4 0 mkdocs.yml`; `git status --short` is unchanged apart from
  the pre-existing entries shown in §F2.
- The stale `site/` directory was moved to `/tmp/site-prebuild-124t7-401346` before rebuilding; `site/`
  is gitignored (`.gitignore:210`), so the repo is unaffected. Experimental builds went to
  `/tmp/navneg/site` and `/tmp/ordertest/site`. The real `site/` was verified intact afterwards
  (`site/reference/dgii-official/index.html` = 59,897 B, `site/es/…` = 61,485 B).

---

## 10. Criteria scorecard

| #   | Criterion                                                                                                                                    | Result   | Evidence                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------- |
| 1   | Minimal diff (`+4 -0`), only the nav group + 2 keys, no `theme`/`plugins`/`markdown_extensions`/`site_*`/`docs_dir` change, `es` still first | **PASS** | §1.1–§1.5                           |
| 2   | `mkdocs build --strict` → exit 0, zero warnings, "not included in the nav" INFO gone for both locales                                        | **PASS** | §2.1–§2.2 (negative control: 3 → 0) |
| 3   | Both `site/reference/dgii-official/index.html` and `site/es/reference/dgii-official/index.html` exist, non-trivial                           | **PASS** | §3 (59,897 B / 61,485 B)            |
| 4   | Rendered nav matches the expected EN and ES trees; reference link present in **both** navs                                                   | **PASS** | §4.1–§4.4                           |
| 5   | Spanish page reachable from the Spanish nav; its own internal links resolve on disk                                                          | **PASS** | §5.1–§5.3 (0 broken)                |
| 6   | Both CI gates verbatim: locale `diff` empty, `test -f site/es/index.html`                                                                    | **PASS** | §6 (both exit 0)                    |
| 7   | `prettier --check mkdocs.yml` → exit 0                                                                                                       | **PASS** | §7                                  |

**Retest required:** no, for the seven criteria. **F1 needs a human decision** (accept the group shape
and record sign-off, or flatten to one nav entry); only option (b) requires a re-run of this evidence.
