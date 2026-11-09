# QA evidence — issue #124, English docs deliverable (attempt 2 of 3)

**Validator:** EvidenceQA (evidence collector, gates T3/T4/T5)
**Date of this run:** 2026-11-09, 16:03–16:20 UTC (12:03–12:20 −04:00) · **Branch:** `docs/124-dgii-official-sources` · **HEAD:** `b44ebb4` (`chore: release main (#123)`; the docs change is still uncommitted working tree)
**Attempt:** 2 of 3 — re-verification of the writer's revision against attempt 1 (`t3-evidence-collector-en-docs.md`, gates 1–7 PASS, D-1 + D-2 open).

**Working tree under review (same 4 paths as attempt 1, revised):**

| Path                                 | State           | Lines (att. 1 → att. 2) | Bytes  | mtime (−04:00)      |
| ------------------------------------ | --------------- | ----------------------- | ------ | ------------------- |
| `docs/en/reference/dgii-official.md` | new (untracked) | 179 → **181**           | 44,661 | 2026-11-09 12:01:36 |
| `docs/en/guides/flow.md`             | modified        | 299 → **305**           | 16,853 | 2026-11-09 12:01:36 |
| `docs/en/guides/signing.md`          | modified        | 72 → **78**             | 3,506  | 2026-11-09 12:01:42 |
| `docs/en/guides/resilience.md`       | modified        | 137 → **144**           | 6,226  | 2026-11-09 12:01:42 |

---

## 1. Verdict

**ATTEMPT 2: PASS on all six re-run gates. D-1 is closed by the accepted ruling.**

The writer's revision is exactly what was described — nothing more, and nothing that breaks a gate. Each of
the three guides now carries a byte-identical `!!! note "Link verification"` block dated `2026-11-09` that
links `../reference/dgii-official.md`; in all three generated pages that link renders as
`href="../../reference/dgii-official/"` and resolves to `site/reference/dgii-official/index.html`
(HTTP `200` from a static server rooted at `site/`). The external URL set is **byte-identical to attempt 1's
45 URLs** (0 added, 0 removed) and all 45 answer `200` again. Both build gates are green. No repo link was
reintroduced and no file outside the four `docs/en/` paths changed.

**One caveat, stated up front and not buried.** Delta item 1 — the replacement sentence in _Scope of this
page_ — is the one place where the revision introduced a claim that the page itself contradicts. **D-3**
(§10, Low, open, non-blocking on the six gates): the sentence says documents "that no step here depends on
are **not** listed", while the page lists three schemas for exactly that reason ("listed for
traceability"). This is a prose-accuracy defect in the rewritten sentence, not a gate failure; a one-line fix
is given in §10.

| #   | Gate re-run               | Expected                                                                                       | Observed                                                                                                                                                                               | Result   |
| --- | ------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | Internal link resolution  | note link in each of 3 guides renders to an `href` that resolves to an existing generated page | `../../reference/dgii-official/` ×3 → `site/reference/dgii-official/index.html` (55,935 B), `200`; 0 broken relative links and 0 broken anchors across all 4 pages                     | **PASS** |
| 2   | External links unchanged  | same count as attempt 1's 45, all `200`                                                        | **45 distinct, set-identical to attempt 1**, 45/45 `200`                                                                                                                               | **PASS** |
| 3   | Build gates               | `prettier --check docs/en` exit 0; `mkdocs build --strict` exit 0                              | exit 0 / exit 0                                                                                                                                                                        | **PASS** |
| 4   | Self-contained            | 0 `project-docs`, no new `github.com/deuriib/dgii-ecf` under `docs/en/`                        | 0 `project-docs`; 4 `github.com` hits, all pre-existing and unchanged; delta added 0                                                                                                   | **PASS** |
| 5   | No new scope              | only the 4 `docs/en/` paths + `project-tasks/**`                                               | exactly that, plus the pre-existing untracked orphan from attempt 1 (unchanged mtime); `mkdocs.yml`, `docs/es/**`, `packages/**`, `examples/**`, `project-docs/**` tracked paths empty | **PASS** |
| 6   | Access dates (D-1 ruling) | three notes state `2026-11-09`, mutually consistent                                            | three blocks **byte-identical** (`sha256 28274d3f78512c2a…`, 257 B each), one date each, matches the reference page's `Access date for every row: 2026-11-09.`                         | **PASS** |

---

## 2. Delta — expected vs. observed

Method (only reproducible way to isolate the delta, since the working tree is uncommitted and attempt 1's
markdown was never captured): the site build produced during attempt 1 was preserved at
`/tmp/qa124/site.previous` and is provably a build of the **attempt-1 sources** — its
`reference/dgii-official/index.html` is exactly **55,844 B**, the byte size attempt 1 measured in its own
independent build of the same source. Diffing that snapshot against this run's build yields the complete
rendered delta. Line-count arithmetic corroborates it (see the table's last column).

| #   | Delta item (writer's claim)                                                             | Expected                                                          | Observed                                                                                                                                                                                                                                                              | Result                                                                  |
| --- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | `docs/en/reference/dgii-official.md` — one replacement sentence in _Scope of this page_ | exactly one sentence replaced, nothing else on the page touched   | **exactly one sentence replaced**, page 55,844 → 55,935 B (+91 B); every structural counter unchanged: 7 `<table>`, 7 `<thead>`, 60 `<tr>`, 109 `href`, 87 `href="http`, 56 `<code>`, 6 admonition fragments, 0 raw-markdown leaks, 19 internal anchors all resolving | **PASS** on the "one sentence" claim; **D-3** on the sentence's content |
| 2   | `docs/en/guides/flow.md` — new `!!! note "Link verification"` near the top              | one 6-line note, nothing else                                     | rendered diff vs attempt 1 = **one inserted `<div class="admonition note">` block and nothing else**; +6 lines (299 → 305)                                                                                                                                            | **PASS**                                                                |
| 3   | `docs/en/guides/signing.md` — same note                                                 | one 6-line note, nothing else                                     | rendered diff = **one inserted admonition block only**; +6 lines (72 → 78)                                                                                                                                                                                            | **PASS**                                                                |
| 4   | `docs/en/guides/resilience.md` — same note                                              | one 6-line note, nothing else                                     | rendered diff = **one inserted admonition block only**; +6 of the +7 lines                                                                                                                                                                                            | **PASS**                                                                |
| 5   | `docs/en/guides/resilience.md` — prefix on the retry-policy citation                    | one lead-in added before the existing `**Official source:**` line | rendered diff = `<p>` → `<p>When a transmission fails and you fall back to contingency, this governs it:` — the rest of the paragraph (both citations, both versions) byte-unchanged; +1 line                                                                         | **PASS**                                                                |

**Nothing outside the five claimed edits changed in any of the four pages** — the rendered diff for
`flow.md`, `signing.md` and `resilience.md` is a single insertion each (plus the one `<p>` opening in
`resilience.md`), and `dgii-official.md` differs only in the `<p>` that carries the replaced sentence. No
table cell, link destination, version string, `Official source` line or section heading moved.

**The three notes are byte-identical** (a single `sha256` for all three, 257 bytes each, trailing blank line
included):

```markdown
!!! note "Link verification"

    Official links on this page were verified on 2026-11-09. DGII republishes
    files in place, so re-check a document before relying on a section
    reference. See [Official DGII references](../reference/dgii-official.md).
```

Placement, for the record: `resilience.md:5` (after the one-sentence lead, before `## Retry policy`),
`flow.md:10` (after the lead-in paragraph, before `## The main flow`), `signing.md:14` (after the XMLDSig
bullet list, before `## Why a real canonicalization implementation matters`). All three are "near the top";
`signing.md`'s is the lowest at line 14 of 78 because that page opens with a bullet list.

---

## 3. Gate 1 — rendered internal link evidence

The note's `../reference/dgii-official.md` is resolved twice: at source level by mkdocs (a missing target
would have failed `--strict`, and it did not), and at render time by the browser. Only the second one is
checked here, because a `--strict` build proves the _source_ path exists, not that the emitted `href` is
correct relative to the emitted page.

**Rendered `href`, per generated file:**

| Generated page                                 | Emitted `href` (verbatim, from the admonition block) | Resolves to                                          | Target exists | HTTP  |
| ---------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- | ------------- | ----- |
| `site/guides/flow/index.html` (62,001 B)       | `../../reference/dgii-official/`                     | `site/reference/dgii-official/index.html` (55,935 B) | yes           | `200` |
| `site/guides/signing/index.html` (29,063 B)    | `../../reference/dgii-official/`                     | `site/reference/dgii-official/index.html` (55,935 B) | yes           | `200` |
| `site/guides/resilience/index.html` (36,024 B) | `../../reference/dgii-official/`                     | `site/reference/dgii-official/index.html` (55,935 B) | yes           | `200` |

**Emitted markup, verbatim (identical in all three pages except the surrounding position):**

```html
<div class="admonition note">
  <p class="admonition-title">Link verification</p>
  <p>
    Official links on this page were verified on 2026-11-09. DGII republishes
    files in place, so re-check a document before relying on a section
    reference. See
    <a href="../../reference/dgii-official/">Official DGII references</a>.
  </p>
</div>
```

**Resolution proven against a server, not against `os.path.exists` alone:**

```text
$ python3 -m http.server 8124          # rooted at the built site/
GET /guides/flow/              -> 200  62001
GET /guides/signing/           -> 200  29063
GET /guides/resilience/        -> 200  36024
GET /reference/dgii-official/  -> 200  55935    <- what ../../reference/dgii-official/ resolves to
GET /reference/dgii-official/index.html -> 200
GET /es/reference/dgii-official/        -> 200  56099
```

**Whole-page link sweep** (every relative `href` and every `#anchor` on the four generated pages, resolved
against the URL they are served from):

| Page                                      | relative hrefs | broken | anchors | broken |
| ----------------------------------------- | -------------- | ------ | ------- | ------ |
| `site/guides/flow/index.html`             | 15             | **0**  | 32      | **0**  |
| `site/guides/signing/index.html`          | 15             | **0**  | 11      | **0**  |
| `site/guides/resilience/index.html`       | 15             | **0**  | 14      | **0**  |
| `site/reference/dgii-official/index.html` | 15             | **0**  | 19      | **0**  |

The `es` locale builds of the same guides (`site/es/guides/*/index.html`, 14 relative links each) are also
clean — they carry no note (§10 O-5) because `docs/es/**` is untouched by design.

**No defect found here: the emitted `href` is correct, the target is a real generated page, and it is
reachable by relative traversal from each of the three guides.**

---

## 4. Gate 2 — external link census

**Extraction.** Both markdown destinations and the two inline-code algorithm URIs are re-extracted from the
four revised files with a balanced-parenthesis destination parser (the `<…>` destinations that contain
spaces and parentheses are read to the closing `>`; the `](…)` form is read to the matching `)`).

| File                         | destinations | external (occurrences) | internal                                                      | inline-code URIs |
| ---------------------------- | ------------ | ---------------------- | ------------------------------------------------------------- | ---------------- |
| `reference/dgii-official.md` | 83           | 81                     | 2 (`#which-document-governs-which-step`, `../guides/flow.md`) | 0                |
| `guides/flow.md`             | 17           | 15                     | 2 (`../reference/dgii-official.md` ×2)                        | 0                |
| `guides/signing.md`          | 3            | 2                      | 1 (`../reference/dgii-official.md`)                           | 2                |
| `guides/resilience.md`       | 5            | 4                      | 1 (`../reference/dgii-official.md`)                           | 0                |

**Count against attempt 1: 45 → 45, set-identical.**

```text
attempt 1 distinct URLs (parsed from /tmp/qa124/urls.txt, JSON of 45 keys): 45
attempt 2 distinct URLs:                                                   45
only in attempt 1: []
only in attempt 2: []
IDENTICAL SET: True
```

**The delta introduced no external URL.** The only links it added are the five internal ones (three notes +
the two already-present references on `flow.md`), and `flow.md` / `signing.md` / `resilience.md` keep exactly
their attempt-1 occurrence counts (15 / 2 / 4).

**Re-requested today (2026-11-09, this run), per-host UA as measured in attempt 1:**

| Host                    | URLs | UA                     | Result    |
| ----------------------- | ---- | ---------------------- | --------- |
| `dgii.gov.do`           | 38   | browser (`Chrome/126`) | `200` ×38 |
| `statusecf.dgii.gov.do` | 1    | browser                | `200`     |
| `www.w3.org`            | 5    | plain (`curl/8.5.0`)   | `200` ×5  |
| `www.rfc-editor.org`    | 1    | plain                  | `200`     |

**45/45 `200`. Zero non-`200`.** Content-type split: `application/pdf` **23**, `text/xml` **15** (the 15
XSDs), `text/html` **6** (3 W3C RECs + RFC 6931 + the 2 `http://` inline-code URIs), `application/json` **1**
(`definition.json`, 2,116 B).

**PDF floor: 109,973 B** (`Norma05-19.pdf`) — no sub-10 KB PDF, so no DGII error page served under a PDF
content type. Next smallest: `24-19.pdf` 187,229 B, `Formato Acuse de Recibo v 1.0.pdf` 197,791 B.

**Effective URL vs. requested — 3 differ, all benign and all the same 3 as attempt 1:**

| Requested                                           | Effective                                          | Why                                                 |
| --------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------- |
| `http://www.w3.org/TR/2001/REC-xml-c14n-20010315`   | `https://www.w3.org/TR/2001/REC-xml-c14n-20010315` | W3C forces https (pre-existing inline-code URI)     |
| `http://www.w3.org/2001/04/xmldsig-more#rsa-sha256` | `https://www.w3.org/2001/04/xmldsig-more`          | idem; the `#` fragment is never sent                |
| `https://www.rfc-editor.org/rfc/rfc6931`            | `https://www.rfc-editor.org/info/rfc6931/`         | rfc-editor's documented `/rfc/` → `/info/` redirect |

(The 15 space-bearing DGII URLs were requested with `%20` and with `%28`/`%29` for the literal parentheses;
DGII answers `200` to both encodings and the two forms differ only in my request string, not in a server
redirect — they are not counted as redirects.)

**Full census (45/45):**

| #   | Host                    | UA      | HTTP | Type             | Bytes       |
| --- | ----------------------- | ------- | ---- | ---------------- | ----------- |
| 1   | `dgii.gov.do`           | browser | 200  | text/xml         | 3,567       |
| 2   | `dgii.gov.do`           | browser | 200  | text/xml         | 5,160       |
| 3   | `dgii.gov.do`           | browser | 200  | text/xml         | 2,871       |
| 4   | `dgii.gov.do`           | browser | 200  | text/xml         | 15,325      |
| 5   | `dgii.gov.do`           | browser | 200  | text/xml         | 487         |
| 6   | `dgii.gov.do`           | browser | 200  | text/xml         | 123,019     |
| 7   | `dgii.gov.do`           | browser | 200  | text/xml         | 122,998     |
| 8   | `dgii.gov.do`           | browser | 200  | text/xml         | 124,484     |
| 9   | `dgii.gov.do`           | browser | 200  | text/xml         | 122,024     |
| 10  | `dgii.gov.do`           | browser | 200  | text/xml         | 111,171     |
| 11  | `dgii.gov.do`           | browser | 200  | text/xml         | 96,111      |
| 12  | `dgii.gov.do`           | browser | 200  | text/xml         | 114,302     |
| 13  | `dgii.gov.do`           | browser | 200  | text/xml         | 121,785     |
| 14  | `dgii.gov.do`           | browser | 200  | text/xml         | 115,951     |
| 15  | `dgii.gov.do`           | browser | 200  | text/xml         | 101,382     |
| 16  | `dgii.gov.do`           | browser | 200  | application/pdf  | 1,678,092   |
| 17  | `dgii.gov.do`           | browser | 200  | application/pdf  | 968,165     |
| 18  | `dgii.gov.do`           | browser | 200  | application/pdf  | 197,791     |
| 19  | `dgii.gov.do`           | browser | 200  | application/pdf  | 506,229     |
| 20  | `dgii.gov.do`           | browser | 200  | application/pdf  | 217,252     |
| 21  | `dgii.gov.do`           | browser | 200  | application/pdf  | 2,353,589   |
| 22  | `dgii.gov.do`           | browser | 200  | application/pdf  | 281,618     |
| 23  | `dgii.gov.do`           | browser | 200  | application/pdf  | 1,648,404   |
| 24  | `dgii.gov.do`           | browser | 200  | application/pdf  | 2,451,054   |
| 25  | `dgii.gov.do`           | browser | 200  | application/pdf  | 395,573     |
| 26  | `dgii.gov.do`           | browser | 200  | application/pdf  | 1,821,456   |
| 27  | `dgii.gov.do`           | browser | 200  | application/pdf  | 1,283,845   |
| 28  | `dgii.gov.do`           | browser | 200  | application/pdf  | 326,451     |
| 29  | `dgii.gov.do`           | browser | 200  | application/pdf  | 1,594,778   |
| 30  | `dgii.gov.do`           | browser | 200  | application/pdf  | 578,774     |
| 31  | `dgii.gov.do`           | browser | 200  | application/pdf  | 1,074,731   |
| 32  | `dgii.gov.do`           | browser | 200  | application/pdf  | 9,317,697   |
| 33  | `dgii.gov.do`           | browser | 200  | application/pdf  | 1,711,220   |
| 34  | `dgii.gov.do`           | browser | 200  | application/pdf  | 10,685,026  |
| 35  | `dgii.gov.do`           | browser | 200  | application/pdf  | 247,981     |
| 36  | `dgii.gov.do`           | browser | 200  | application/pdf  | **109,973** |
| 37  | `dgii.gov.do`           | browser | 200  | application/pdf  | 241,769     |
| 38  | `dgii.gov.do`           | browser | 200  | application/pdf  | 187,229     |
| 39  | `statusecf.dgii.gov.do` | browser | 200  | application/json | 2,116       |
| 40  | `www.rfc-editor.org`    | plain   | 200  | text/html        | 511,023     |
| 41  | `www.w3.org`            | plain   | 200  | text/html        | 1,218       |
| 42  | `www.w3.org`            | plain   | 200  | text/html        | 76,370      |
| 43  | `www.w3.org`            | plain   | 200  | text/html        | 76,370      |
| 44  | `www.w3.org`            | plain   | 200  | text/html        | 402,341     |
| 45  | `www.w3.org`            | plain   | 200  | text/html        | 336,750     |

---

## 5. Gate 3 — build gates

```text
$ packages/typescript/node_modules/.bin/prettier --check docs/en
Checking formatting...
All matched files use Prettier code style!
PRETTIER_EXIT=0

$ uvx --from mkdocs --with mkdocs-material --with "mkdocs-static-i18n>=1.0,<2" mkdocs build --strict
INFO    -  mkdocs_static_i18n: Building 'en' documentation to directory: …/site
INFO    -  The following pages exist in the docs directory, but are not included in the "nav"
           configuration:
  - en/reference/dgii-official.md
INFO    -  mkdocs_static_i18n: Building 'es' documentation to directory: …/site/es
INFO    -  … (same orphan INFO)
INFO    -  mkdocs_static_i18n: Translated 11 navigation elements to 'es'
INFO    -  mkdocs_static_i18n: Building 'en' documentation to directory: …/site
INFO    -  Documentation built in 2.16 seconds
MKDOCS_EXIT=0
```

Toolchain: prettier **3.9.10**; mkdocs **1.6.1** (Python 3.12.16) with `mkdocs-material` and
`mkdocs-static-i18n` as pinned by the command line above.

The orphan-page line for `en/reference/dgii-official.md` is `INFO`, not `WARNING`, so `--strict` stays green;
the nav entry is task T7 and out of scope. Before this run, `site/` was moved aside
(`mv site /tmp/qa124b/site-previous-live`) so every artifact inspected above comes from this build alone.

---

## 6. Gate 4 — the site is still self-contained

```text
$ grep -rn "project-docs" docs/en/
(no output — 0 hits across the entire English tree)

$ grep -rn "github.com/deuriib/dgii-ecf" docs/en/
docs/en/typescript.md:203:[package README](https://github.com/deuriib/dgii-ecf/tree/main/packages/typescript).
docs/en/faq.md:48:See [SECURITY.md](https://github.com/deuriib/dgii-ecf/blob/main/SECURITY.md).
docs/en/examples.md:3:The [`examples/`](https://github.com/deuriib/dgii-ecf/tree/main/examples)
docs/en/python.md:204:[package README](https://github.com/deuriib/dgii-ecf/tree/main/packages/python).
```

| Check                                                           | Expected                                       | Observed                                                                                | Result   |
| --------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------- | -------- |
| `project-docs` references under `docs/en/`                      | 0 (the delta links inside the site instead)    | **0**                                                                                   | **PASS** |
| new `github.com/deuriib/dgii-ecf` links introduced by the delta | 0                                              | **0** — the 4 hits are the same 4 files at `HEAD`, each `HEAD=1 → now=1`                | **PASS** |
| repo link in the reviewed set                                   | still removed (attempt 1 deleted the only one) | `flow.md` `HEAD=1 → now=0`; `signing.md` 0/0; `resilience.md` 0/0; `dgii-official.md` 0 | **PASS** |

The new note points at `../reference/dgii-official.md`, an intra-site relative link — the opposite direction
from a repo link. Nothing was reintroduced.

---

## 7. Gate 5 — no new scope

```text
$ git status --porcelain -uall | grep -v '^?? project-tasks/'
 M docs/en/guides/flow.md
 M docs/en/guides/resilience.md
 M docs/en/guides/signing.md
?? docs/en/reference/dgii-official.md
?? project-docs/marketing/github-listing.md        <- attempt-1 orphan, unchanged

$ git diff --cached --name-only
(empty — nothing staged)

$ git status --porcelain -uall -- mkdocs.yml docs/es packages examples project-docs
?? project-docs/marketing/github-listing.md        <- the only entry

$ git diff --name-only -- mkdocs.yml docs/es packages examples project-docs
(empty)
```

| Path family                     | Expected  | Observed                                                                                                                                         | Result   |
| ------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `docs/en/` (3 modified + 1 new) | 4 paths   | exactly 4                                                                                                                                        | **PASS** |
| `mkdocs.yml`                    | untouched | no diff, no status entry; mtime still **2026-11-02 20:33**                                                                                       | **PASS** |
| `docs/es/**`                    | untouched | no diff, no status entry                                                                                                                         | **PASS** |
| `packages/**`, `examples/**`    | untouched | no diff, no status entry                                                                                                                         | **PASS** |
| `project-docs/**`               | no edits  | no tracked modification; the one untracked orphan is unchanged from attempt 1 (mtime **2026-11-03 06:21:12**, still absent from `git log --all`) | **PASS** |
| `project-tasks/**` artifacts    | allowed   | `git status` shows only `project-tasks/124-*` files and the `.pdfcache/` directory                                                               | **PASS** |

`project-docs/marketing/github-listing.md` stays workspace dirt from another task, exactly as documented in
attempt 1 §8: six days older than the earliest artifact of this pipeline, zero mentions of `124` /
`dgii-official`, never committed. It must not be swept into the `docs:` commit — operator action, not a
change to this deliverable.

No file under `docs/` other than the four `.md` paths exists: `find docs -type f ! -name '*.md'` → 0 results.

---

## 8. Gate 6 — the D-1 ruling is implemented and consistent

| Check                                        | Expected                                 | Observed                                                                                                                                                                                   | Result   |
| -------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| access date stated in each of the 3 notes    | `2026-11-09`                             | `2026-11-09` in all three                                                                                                                                                                  | **PASS** |
| the three notes mutually consistent          | no differing dates, no differing claims  | **byte-identical**: `sha256:28274d3f78512c2a…`, 257 bytes each; a single distinct block across the three files                                                                             | **PASS** |
| consistent with the reference page           | same date                                | page states `**Access date for every row: 2026-11-09.**` — the only `2026-11-09` on the page                                                                                               | **PASS** |
| date is the real verification date           | `2026-11-09`                             | run executed 2026-11-09 16:03–16:20 UTC; every one of the 45 URLs re-requested and `200` **on that date** — so the note's claim is now empirically true for each page                      | **PASS** |
| no half-applied per-line stamps left behind  | 0                                        | `grep -rni "accessed" docs/en/` → **0 hits**; the guides keep their 12 register-backed `**Official source:**` lines (flow 8, signing 1, resilience 3) with DGII's own `site-updated` dates | **PASS** |
| wording of the note is truthful for its page | every official link on the page verified | `flow.md` 15 official-link occurrences (14 `dgii.gov.do` + 1 `statusecf`), `signing.md` 2, `resilience.md` 4 — all inside the 45 verified today                                            | **PASS** |

All occurrences of the access date under `docs/en/`, for completeness:

```text
docs/en/guides/signing.md:16:    Official links on this page were verified on 2026-11-09. DGII republishes
docs/en/guides/flow.md:12:    Official links on this page were verified on 2026-11-09. DGII republishes
docs/en/guides/resilience.md:7:    Official links on this page were verified on 2026-11-09. DGII republishes
docs/en/reference/dgii-official.md:13:**Access date for every row: 2026-11-09.**
```

The note's operational claim ("DGII republishes files in place, so re-check a document before relying on a
section reference") is the same statement the reference page makes in its own words ("DGII republishes files
in place — the URL stays the same while the file's content changes"), so the two loci agree rather than
compete.

**D-1: CLOSED.** The accepted ruling (one note per guide instead of 12 stamped lines) is implemented exactly
as ruled, and the note is the stronger artifact: it is page-scoped, it says _why_ the date matters, and it
routes the reader to the per-document versions.

---

## 9. Discrepancies

### D-3 — the replacement Scope sentence claims a rule the page itself breaks (NEW, Low, open, non-blocking)

- **Expected:** delta item 1 replaces a sentence with wording that is true of the page's own content.
- **Actual (verbatim, `docs/en/reference/dgii-official.md:172–177`):**

  > What is published here is each document that a step or a field on this site depends on, verified
  > reachable on the access date, with the URL and the version each one was checked at, so anyone can
  > re-check them. **Documents DGII publishes that no step here depends on are not listed.**

- **Why it is a deviation (same page, `docs/en/reference/dgii-official.md:103`):**

  > The three rows marked _does not compile_ are **listed for traceability**: the file DGII publishes is
  > broken …

  and those three rows' own "What it governs" cells say nothing about a step or a field for two of them
  (`e-CF 31 v.1.0` → "the published file does not compile"; `RFCE 32 v.1.0` → "Consumption-invoice summary
  (RFCE) — the published file does not compile"). The frozen register agrees: `XSD-13`/`XSD-14` carry `—` in
  both the `Ground-truth §` and `Doc-site step(s)` columns and are described as "carried for traceability
  only … they support no step" (`project-tasks/124-source-register.md:188–189, 199`).

  So the page publishes two documents that no step here depends on, while the paragraph says such documents
  are not listed. A reader can catch this without leaving the page.

- **Severity:** Low — a scope statement, not a cited fact; no row, URL, version or table changes.
- **Two readings, stated fairly:** if "a field on this site depends on" is stretched to cover the schemas the
  SDK ships and reports as _schema unavailable_, the first clause can be defended — but the third clause says
  **"no step"**, and no stretch makes XSD-13 support a step.
- **Fix (one sentence, writer's choice):** either drop the third sentence, or make it true —
  e.g. "…depends on, plus the three published schemas that do not compile, which are listed for traceability."
  Re-run `prettier --check docs/en` and `mkdocs build --strict` afterwards (both take seconds).
- **Not a gate failure:** none of the six re-run gates measures the truth of that sentence; recorded here so
  it is not shipped silently.

### D-1 — per-citation access date (CLOSED by the accepted ruling)

See §8. Implemented and verified; nothing left open.

### D-2 — "Auxiliary flows" citation vs tasklist Decision 6 (UNCHANGED, still open)

The delta touched nothing in this area. `flow.md` still carries one `**Official source:**` line under
_Auxiliary flows_ and none under _Common mistakes_; the implementation still matches ledger task T4, not
tasklist Decision 6. The correction belongs in the tasklist, not in the docs.

### O-1 — en/es file-list parity (carried, out of gate set, expected red)

```text
$ diff <(cd docs/en && find . -name '*.md' | sort) <(cd docs/es && find . -name '*.md' | sort)
10d9
< ./reference/dgii-official.md
(exit 1)
```

Unchanged from attempt 1: `docs/es/` has 10 pages, `docs/en/` 11. Task T6 owns the mirror; the docs workflow
stays red until it lands.

### O-2 — `/es/reference/dgii-official/` serves the English page (carried, informational)

`site/es/reference/dgii-official/index.html`, 56,099 B, English heading — `fallback_to_default: true` doing
its job until T6.

### O-5 — the note exists only in the English locale (NEW, informational, not a defect)

`site/es/guides/{flow,signing,resilience}/index.html` contain **no** `Link verification` block: the `es`
guides are real source files that this change correctly left untouched. The Spanish reader therefore sees no
access date until T6 mirrors the page. Expected at this stage; recorded so "the note is everywhere" is not
assumed.

### O-6 — attempt 1's content-type split was off by one (informational, no action)

Attempt 1 reported 23 PDF / 16 `text/xml` / 1 JSON / 5 `text/html`. This run measures 23 / **15** / 1 / **6**
(the 15 XSDs are `text/xml`; the six HTML responses are the 3 W3C RECs, RFC 6931 and the 2 inline-code W3C
URIs). Totals agree at 45 and every status is `200`; the difference is a tally slip in attempt 1, not a
change in the deliverable.

---

## 10. Coverage gaps (what this run does not prove)

- **The markdown-source delta was reconstructed from rendered HTML, not from attempt-1 markdown.** The
  writer's working tree is uncommitted and attempt 1's markdown was not captured, so the rendered diff
  against the preserved attempt-1 build is the strongest available evidence. It catches every change that
  affects output; a whitespace-only edit that renders identically would not appear. Line counts
  (179→181, 299→305, 72→78, 137→144) match the five claimed edits exactly.
- **Point-in-time links.** All statuses are a single observation from this machine on 2026-11-09. DGII
  republishes in place; a `200` is reachability, not content, and `MANIFEST.json` hashes — not this table —
  are the content signal for the 15 XSDs.
- **No browser pass (deliberate).** The delta adds static prose and one admonition block; there is no
  interactive element on any of the four pages. The rendered-DOM assertions in §2, §3 and §8 stand in for
  screenshots. A visual diff should ride along with T7, when the page first appears in navigation.
- **Out of scope by design:** nav entry and `nav_translations` (T7), `docs/es` content and en/es link
  byte-identity (T6).
- **D-3 was not adjudicated as a gate.** If the pipeline owner treats on-page factual consistency as a
  release gate, D-3 blocks the `docs:` commit; under the six gates this attempt was asked to re-run, it does
  not.

---

## 11. Commands run (verbatim, with exit codes)

```bash
# scope + baseline
git status --short ; git status --porcelain -uall ; git diff --name-only ; git diff --stat ; git diff --cached --name-only
git status --porcelain -uall -- mkdocs.yml docs/es packages examples project-docs
git diff --name-only -- mkdocs.yml docs/es packages examples project-docs
stat -c '%y %s %n' <the 4 reviewed files> mkdocs.yml
date -u

# gate 3 — build gates  (site/ moved aside first: mv site /tmp/qa124b/site-previous-live)
packages/typescript/node_modules/.bin/prettier --check docs/en                     # exit 0
uvx --from mkdocs --with mkdocs-material --with "mkdocs-static-i18n>=1.0,<2" mkdocs build --strict   # exit 0

# gate 1 — rendered internal links
diff <(sed 's/></>\n</g' /tmp/qa124/site.previous/guides/flow/index.html) \
     <(sed 's/></>\n</g' site/guides/flow/index.html)        # … same for signing, resilience, dgii-official
python3 -m http.server 8124          # rooted at site/ ; then curl each page and /reference/dgii-official/
python3 -c '<relative-href + #anchor sweep over the 4 generated pages>'              # 0 broken

# gate 2 — external census
python3 - <<'PY'   # balanced-paren markdown destination parser -> /tmp/qa124b/urls.txt (45)
PY
bash /tmp/qa124b/probe.sh          # 45 curl probes, per-host UA -> /tmp/qa124b/results.tsv
python3 - <<'PY'   # set comparison against /tmp/qa124/urls.txt (attempt 1, 45 keys) -> identical
PY

# gate 4 — self-containment
grep -rn "project-docs" docs/en/
grep -rn "github.com/deuriib/dgii-ecf" docs/en/
for f in typescript faq examples python; do git show HEAD:docs/en/$f.md | grep -c 'github.com/deuriib/dgii-ecf'; done

# gate 6 — access dates
python3 - <<'PY'   # extract the 3 note blocks, sha256 + length + date scan -> one distinct block
PY
grep -rn "2026-11-09" docs/en/ ; grep -rni "accessed" docs/en/ ; grep -c '\*\*Official source:\*\*' <guides>

# extra (repo CI gate, out of the gate set)
diff <(cd docs/en && find . -name '*.md' | sort) <(cd docs/es && find . -name '*.md' | sort)   # exit 1 (T6)
```

---

**Evidence produced by:** EvidenceQA · **Screenshots:** none (static pages; the rendered-DOM assertions above
are the evidence) · **Raw artifacts:** `/tmp/qa124b/{urls.txt,urls.json,results.tsv,probe.sh,mkdocs-build.log}`,
attempt-1 build snapshot `/tmp/qa124/site.previous`, pre-build site dir `/tmp/qa124b/site-previous-live`.

**Files this validator wrote:** this report only. No file under `docs/`, `mkdocs.yml`, the register or any
prior evidence file was touched.
