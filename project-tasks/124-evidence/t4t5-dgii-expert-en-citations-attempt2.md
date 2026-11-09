# T4/T5 — DGII expert review of the English citations (attempt 2 of 3)

**Reviewer role:** domain reviewer (DGII e-CF). I wrote the frozen register; this review judges the
_writer's_ representation of it, not the register.

**Standard applied:** `project-tasks/124-source-register.md` (Scope and method, "Mapping to the
documented integration steps", judgement calls 8–9, "Residual risk for the writer") and
`project-tasks/124-dgii-official-sources-tasklist.md` Decisions 1–7. Where the tasklist and the
register disagree substantively, the register wins.

**Supersedes / follows:** `project-tasks/124-evidence/t4t5-dgii-expert-en-citations.md` (attempt 1,
FAIL on D1). This file judges the revision against that verdict and hunts for regressions the
revision could have introduced.

**Files read in this attempt**

- `docs/en/reference/dgii-official.md` (181 lines; 43 document rows + 10 step rows)
- `docs/en/guides/flow.md` (305 lines; 8 `**Official source:**` lines = 7 steps + Auxiliary flows)
- `docs/en/guides/signing.md` (78 lines; 1 citation line)
- `docs/en/guides/resilience.md` (144 lines; 3 citation lines)
- `git diff docs/en/` (vs `b44ebb4`), the register, the tasklist, the run ledger

**Side effects of the review:** `mkdocs build --strict` was run (output in `site/`, gitignored;
log at `/tmp/build.log`) and `prettier --check` was run on the four pages. No file under `docs/**`,
`mkdocs.yml`, the register or any prior evidence file was edited.

**Method limitation, stated up front.** No byte snapshot of the attempt-1 pages exists on disk
(`docs/` is uncommitted, `git stash list` is empty, and the four files carry a single `12:01`
mtime against my attempt-1 file's `11:59`). "Unchanged" is therefore proven three ways, not by a
diff: (1) structural fingerprints that a reword would move — 8/1/3 citation lines, 43 document rows,
10 step rows, per-line document pairs, per-line version stamps; (2) byte-presence of every phrase
attempt 1 quoted verbatim; (3) a fresh re-check of every title, section name, version/date and URL
against the register. Where a claim below rests on (2)+(3) rather than a byte diff, it says so.

---

## Verdict: **PASS** — attempt 2 of 3

The blocking defect is fixed, and it is fixed with the sentence I supplied, near-verbatim. D2 is
fixed by a prefix that scopes the citation rather than softening it. D3 was left alone as
instructed. The three new link-verification notes are accurate, byte-identical to each other, and
their relative link resolves in the built site (`mkdocs build --strict`, exit `0`, 0 warnings).
No citation line was reworded, re-paired or restamped.

Two items remain, both about the _coverage description_, not about what DGII publishes:

- **R-1 (required, one clause, my fault):** the replacement sentence I supplied states a coverage
  rule narrower than the page's own contents — the "Operational and certification manuals" section
  lists six documents while saying "no integration step below depends on these". The scope
  paragraph therefore contradicts itself. This is an artefact of my sentence, not of the writer's
  work; the exact replacement clause is in [R-1](#r-1-required-one-clause--the-new-scope-rule-contradicts-the-ops-section-my-wording).
- **W-1 (optional, one phrase):** `flow.md`'s intro still calls the reference page "the whole set",
  a phrase that invites the completeness reading D1 removed. Attempt 1 missed it.

Neither re-opens D1: neither can make an auditor believe DGII publishes _less_ than it does, and
neither asserts a document that does not exist. They are accuracy defects in the page's
self-description, fixable in the same touch-up that lands C-2.

---

## 1. Prior items, judged

| Item                                                                 | Attempt-1 severity  | Status                          | Evidence (current text)                                                                                                                                        |
| -------------------------------------------------------------------- | ------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** — scope note claimed completeness                             | **BLOCKING**        | **RESOLVED**                    | Scope paragraph now carries the claim-dependence rule plus the explicit exclusion clause, verbatim as supplied; the old sentence is gone; no row count printed |
| **D2** — retry-policy citation read as governing the retry predicate | non-blocking        | **RESOLVED**                    | Prefix "When a transmission fails and you fall back to contingency, this governs it:" binds the citation to contingency                                        |
| **D3** — eighth citation line under `## Auxiliary flows`             | non-blocking, scope | **LEFT AS INSTRUCTED (closed)** | Line still present at `flow.md:277`; the run ledger's own T4 gate requires it                                                                                  |

### D1 — RESOLVED

Current text, `docs/en/reference/dgii-official.md:170-177`:

> ## Scope of this page
>
> The SDKs' internal normative reference was assembled from 34 sources; this page
> is not that list and does not claim to be. What is published here is each
> document that a step or a field on this site depends on, verified reachable on
> the access date, with the URL and the version each one was checked at, so anyone
> can re-check them. Documents DGII publishes that no step here depends on are
> not listed.
>
> DGII publishes no machine-readable definition of the five e-CF web services and
> no public certification test-case set, so neither is cited here: the service
> shapes come from the technical description.

Checks, each mechanical:

| Check                                                                  | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The failing sentence is gone                                           | `grep -c "every document that could be verified"` → **0**                                                                                                                                                                                                                                                                                                                                                                                                   |
| Replacement is the sentence I supplied, semantically and near-verbatim | **Identical word for word**; the only difference is the line wrapping at 80 columns. Sentence 1: "What is published here is each document that a step or a field on this site depends on, verified reachable on the access date, with the URL and the version each one was checked at, so anyone can re-check them." Sentence 2: "Documents DGII publishes that no step here depends on are not listed." Both match the attempt-1 fix instruction verbatim. |
| States the coverage rule, not completeness                             | Yes — inclusion requires dependence ("a step or a field on this site depends on") **and** reachability ("verified reachable on the access date"), which is the register's rule ("a document appears here only if a ground-truth claim or the XSD manifest depends on it **and** the URL returned a success status")                                                                                                                                         |
| Does not print a row count / does not compare counts                   | No digit other than the mandated `34` in the paragraph; `grep` for `rows`/`documents`/`entries` followed by a number → no hit. The seven-row table and the 43-row catalogue are never totalled                                                                                                                                                                                                                                                              |
| The 34-sources, not-this-list sentence is intact and compliant         | "assembled from 34 sources; this page is not that list and does not claim to be." — states the human-decision count, disclaims identity with the internal audit, compares nothing (tasklist Decision 2 / risk D2)                                                                                                                                                                                                                                           |
| No completeness vocabulary left anywhere on the page                   | `grep -E "complete\|completeness\|exhaustive\|every document\|all DGII\|whole set\|entire"` → **0 hits** in the whole page                                                                                                                                                                                                                                                                                                                                  |
| Register judgement calls 8–9 are now consistent with the page          | `NG 06-2018` and the Representación Impresa models / Facturador Gratuito manual remain absent, and the page now says why in the reader's own terms: documents no step depends on are not listed. Absence no longer implies "not published"                                                                                                                                                                                                                  |

**Residual (see R-1):** the rule as worded is _narrower_ than the page's actual inclusion set,
because of the six operational/certification manuals. That is my drafting error and it is a
different, smaller defect than D1.

### D2 — RESOLVED

Current text, `docs/en/guides/resilience.md:20-21`:

> A rejected e-CF (e.g. `400`, `401`) is **never** blindly re-sent.
>
> When a transmission fails and you fall back to contingency, this governs it:
> **Official source:** Informe Técnico Comprobante Fiscal Electrónico — §19: contingency operation,
> the clocks it sets for transmitting what was generated offline, and the identifiers that mark a
> replacement receipt (v1.0; site-updated 2026-10-16) · Instructivo de Contingencia de Facturación
> Electrónica — the operational manual for working in contingency (site-updated 2026-10-15).

Why this is a fix and not a softening:

- The citation is no longer the paragraph's citation; it is now the consequent of an explicit
  conditional ("When … you fall back to contingency, this governs it:"). A reader can no longer
  assign the citation to the `3` attempts / `408`/`429`/`5xx` predicate printed three lines above.
- The render proves the binding: in `site/guides/resilience/index.html` the prefix and the label
  are one `<p>` — "When a transmission fails and you fall back to contingency, this governs it:
  Official source: Informe Técnico …" — so the scoping clause cannot be separated from the label by
  layout, and the retry-options table still renders below it as a table.
- Content is true of the cited documents and of nothing else: register TEC-01 row maps §19 to
  "contingency operation", and the register's residual-risk section instructs exactly this pair
  ("Scope it to TEC-04 §5–6 and TEC-01 §19 (and OPS-04 as the operational manual)").
- What the register does **not** carry is a retry predicate; retry/backoff remains SDK design, and
  the page no longer implies otherwise. The predicate is stated with no citation at all, which is
  the correct outcome.

Residual, non-blocking: the line still sits inside `## Retry policy` (attempt 1's option B, which
was the acceptable fix). Physical relocation to "Reconciling a pending submission" is now optional
polish, not a correctness fix.

### D3 — LEFT AS INSTRUCTED (closed)

The eighth line is still there, untouched, under `## Auxiliary flows` (`flow.md:277`), citing the
three TEC-02 auxiliary services and `Formato Anulación de e-NCF v1.0` with the admissibility rule
("only sequences never sent to DGII nor delivered to the buyer may be voided"). It was not expanded,
moved or merged in this revision.

It is also not a silent deviation any more — the **run ledger's own acceptance criterion for T4
requires it**: "All 7 numbered steps **+ aux flows** cite a governing document"
(`124-dgii-official-sources-ledger.md`, task table, row T4). Tasklist Decision 6 says the opposite
("`Auxiliary flows` and `Common mistakes` are … get **no** citation lines"). The register-vs-tasklist
precedence rule I applied in attempt 1 does not settle a ledger-vs-tasklist clash, so the correct
disposition is the one taken: left alone, because the ledger's gate is the one T12 applies. One line
in the ledger's "Stage 6 — Lessons" recording which of the two governs (ledger T4 wins) closes this
permanently; content-wise there is nothing to change.

---

## 2. Regression hunt

### 2.1 The three `!!! note "Link verification"` blocks — accurate, identical, resolving

All three are **byte-identical** (compared with a Python block extractor: one unique value across
`flow.md`, `signing.md`, `resilience.md`):

> !!! note "Link verification"
>
>     Official links on this page were verified on 2026-11-09. DGII republishes
>     files in place, so re-check a document before relying on a section
>     reference. See [Official DGII references](../reference/dgii-official.md).

| Claim in the note                                                              | Verified against                                                                                                                                                                                                        | Result                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "verified on 2026-11-09" — i.e. the register's access date, not a new one      | register: "**Access date for every row: 2026-11-09.**"; T2 attempt 3: 50/50 URLs `200` on that date                                                                                                                     | **Accurate.** Every URL on the three guide pages is one of the register's rows (script: 8 unique in `flow.md`, 4 in `signing.md`, 4 in `resilience.md`, **0** absent from the register; the single "miss" in `signing.md` is the `xmldsig-more#rsa-sha256` algorithm URI inside the pre-existing W3C bullet, not a DGII link) |
| "DGII republishes files in place"                                              | register: "**Fourth: DGII republishes in place.** Any row can change content without changing URL or version." Also the concrete instance at register line 645 (`Formato e-CF V1.0` republished without a version bump) | **Accurate**, and this is precisely what the register verified — URL stability _and_ content drift without a version bump. The inference "re-check a document before relying on a section reference" follows from that content drift, not from a broken link                                                                  |
| `../reference/dgii-official.md` is the right path from a page inside `guides/` | `docs/en/guides/` and `docs/en/reference/` are siblings                                                                                                                                                                 | **Correct**                                                                                                                                                                                                                                                                                                                   |

Note placement is safe in all three pages: `flow.md:10-14` (after the intro, before `## The main flow`),
`signing.md:14-18` (after the bullet list, before `## Why a real canonicalization implementation
matters`), `resilience.md:5-9` (before `## Retry policy`). No note sits inside a numbered step, so no
step's citation was displaced.

### 2.2 The built site resolves the link — measured, not assumed

```
NO_MKDOCS_2_WARNING=1 uvx --from mkdocs --with mkdocs-material \
  --with "mkdocs-static-i18n>=1.0,<2" mkdocs build --strict
EXIT=0
WARNINGS: 0
INFO    -  Documentation built in 2.60 seconds
```

Emitted `href` in the generated HTML (Material i18n rewrites `.md` to a directory URL, so the check
has to be on the output, not on the source):

| Page                                | Emitted `href`                   | Occurrences                | Resolves to                     | Exists  |
| ----------------------------------- | -------------------------------- | -------------------------- | ------------------------------- | ------- |
| `site/guides/flow/index.html`       | `../../reference/dgii-official/` | 2 (intro link + note link) | `site/reference/dgii-official/` | **yes** |
| `site/guides/signing/index.html`    | `../../reference/dgii-official/` | 1 (note link)              | `site/reference/dgii-official/` | **yes** |
| `site/guides/resilience/index.html` | `../../reference/dgii-official/` | 1 (note link)              | `site/reference/dgii-official/` | **yes** |

The reverse link and the page-internal anchor also resolve: `site/reference/dgii-official/index.html`
emits `../guides/flow/` and contains `id="which-document-governs-which-step"` with three internal
`href="#which-document-governs-which-step"` references pointing at it.

Nav status (informational, **not** a regression of this revision): the page is not in `mkdocs.yml`'s
nav, which the build reports as `INFO` — "The following pages exist in the docs directory, but are
not included in the "nav" configuration: - en/reference/dgii-official.md" — not as a warning, so
`--strict` stays green and the page is served at its URL. Nav is owned by T7/P4 (tasklist risk D4:
"Exactly one owner"), and the page existed before this revision, so nothing changed here.

### 2.3 The access-date note did not weaken the per-step citations

| Check                                                               | Evidence                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Citation lines still present and unchanged in number                | `flow.md` **8**, `signing.md` **1**, `resilience.md` **3** — identical to attempt 1                                                                                                                                                                                                                                                                        |
| No citation was replaced by the page-level note                     | Every line still carries its own document title, section name and version/date stamp; the note adds the access date, it removes nothing. Diff of `signing.md` is `7 insertions, 0 deletions` (1 citation line + blank + note), so the W3C/C14N bullets and their URIs are untouched — `grep -c "REC-xml-c14n-20010315"` = 1 (C9 additive-only still holds) |
| No incoherent duplication with the reference page's own global line | Reference page line 13: "**Access date for every row: 2026-11-09.**"; the guides say "Official links on this page were verified on 2026-11-09". Same date, different and non-overlapping scopes (rows of the reference page vs links of that guide page), and the guides point at the page rather than restating its rule. **Coherent.**                   |
| Note ordering helps rather than confuses                            | The note is the first block after the intro on all three pages, so a reader meets the access date _before_ the first `(site-updated …)` stamp — the two label families cannot be confused into each other                                                                                                                                                  |
| Cosmetic only                                                       | `flow.md` now links the reference page twice within eight lines (intro + note). Harmless redundancy                                                                                                                                                                                                                                                        |

### 2.4 No citation line was reworded, re-paired or restamped

| Check                                                             | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document pairings per line                                        | Identical to attempt 1's table: step 1 TEC-02 + Semilla XSD-12; step 2 TEC-11 + TEC-04; step 3 TEC-02 + TEC-01; step 4 TEC-10 + TEC-03; step 5 TEC-02 + TEC-03; step 6 TEC-02; step 7 TEC-02 + TEC-04; aux TEC-02 + TEC-08; `signing.md` TEC-10 + TEC-03; `resilience.md` TEC-01 + OPS-04 / TEC-04 / TEC-02. No line added, removed or re-paired                                                                                                                                                                                         |
| Every version/date stamp still matches the register byte for byte | `2026-05-29` (TEC-02/TEC-03) × 8+2, `2026-11-06` (TEC-04) × 3, `2026-10-16` (TEC-01) × 2, `2023-11-22` (TEC-10) × 2, `2020-11-12` (XSD-12), `rev. 2022-05-24` (TEC-08), `2026-10-15` (OPS-04). **No new date appears and none moved.** A restamp would have had to swap one register date for a different register date on the same document, which no line shows                                                                                                                                                                        |
| Phrases attempt 1 quoted verbatim are still byte-present          | step 5: "the file name is `RNCEmisor` + the e-NCF, 13 characters, as that section's own table shows" → 1 hit in `flow.md`; step 6: "_Consulta de resultado e-CF_: the five result codes and `secuenciaUtilizada` in the same trackId response" → present; §19 line: "§19: contingency operation, the clocks it sets for transmitting what was generated offline, and the identifiers that mark a replacement receipt" → present; RFCE row: "DGII names only a \"hash\"; SHA-256 is the SDK's reading of the signature profile" → present |
| URL set did not grow                                              | `flow.md` 8 unique, `signing.md` 4, `resilience.md` 4, reference page 29 unique / 81 occurrences — **0** URL outside the register's own URL set                                                                                                                                                                                                                                                                                                                                                                                          |
| Page inventory did not drift                                      | 43 document rows (7 legal + 6 technical + 5 formats + 15 schemas + 4 standards + 6 operational) and 10 step rows — identical to attempt 1. No row was added, dropped or re-scoped                                                                                                                                                                                                                                                                                                                                                        |

### 2.5 Nine binding constraints re-verified on the current text

| #   | Constraint                                                                                  | Status                  | Evidence in the current text                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Commercial-approval deadline: no article number, no calendar date                           | **HONOURED**            | Commercial-approval row cites `Formato Aprobación Comercial (ACECF) v1.0`, `ACECF v.1.0 XSD`, `Descripción Técnica Servicios DGII` — no `Art.`, no date. The only `Art.` strings on all four pages are `NG 05-2019 Art. 11` (line 32), `Art. 12` (range voiding), `Art. 11(c)` (directory/B2B); `grep "15th\|following month\|fifteenth"` → 0 |
| C2  | B2B type exclusion attributed to the SDK guard                                              | **HONOURED**            | `flow.md` Common mistakes: "The SDK refuses it (`enforceB2BRules`); DGII's documents state no such exclusion"; reference page warning names `enforceB2BRules` / `enforce_b2b_rules` and ends "it is not a cited DGII requirement". `grep "DGII excludes those types"` → 0; `grep "in practice"` → 0                                           |
| C3  | `secuenciaUtilizada` stays on the track step, cited to the track-result consult, unsoftened | **HONOURED**            | `flow.md:213` cites _Consulta de resultado e-CF_ for "the five result codes and `secuenciaUtilizada` in the same trackId response"; the sentence at `flow.md:244` "On a rejection, `secuenciaUtilizada` decides the next step: `false` means the e-NCF may be reused, `true` means it is consumed and a new one is required." is untouched    |
| C4  | `CodigoSeguridadeCF`: DGII says only "hash"                                                 | **HONOURED**            | Unchanged sentence quoted in 2.4                                                                                                                                                                                                                                                                                                              |
| C5  | No DGII-attributed labels on the status ambiente codes                                      | **HONOURED**            | "the three status operations and their integer ambiente codes (v1)"; `grep` for `PreCert` / `Ambiente:` labels → 0. The only `Environment.Prod` hits are SDK code samples, not DGII attributions                                                                                                                                              |
| C6  | Issuer-standards file-name **table** cited, not the short example                           | **HONOURED**            | Quoted in 2.4                                                                                                                                                                                                                                                                                                                                 |
| C7  | `<KeyValue>`/`<RSAKeyValue>`/`<Exponent>` prohibition never attributed to DGII              | **HONOURED BY ABSENCE** | `grep` on all four pages → 0 hits                                                                                                                                                                                                                                                                                                             |
| C8  | Schema hashing not claimed for all pinned schemas                                           | **HONOURED**            | "The SDKs ship the twelve schemas that compile as pinned fixtures and record a `sha256` for each of those; the three excluded entries carry no hash."                                                                                                                                                                                         |
| C9  | `signing.md` additive only                                                                  | **HONOURED**            | `git diff --numstat` = `7 0` (0 deletions); both algorithm URIs still present; no code block or command edited                                                                                                                                                                                                                                |

### 2.6 Nothing else drifted

- `git diff --numstat docs/en/guides/` → `33 10 flow.md`, `13 0 resilience.md`, `7 0 signing.md`. The
  only deletions in the whole change set are attempt 1's intro rewrite and the Common-mistakes row
  (C2) — both already accepted; this revision added lines only.
- `prettier --check` on all four pages → "All matched files use Prettier code style!" (tasklist risk
  D7 gate stays green).
- `mkdocs build --strict` → exit `0`, 0 warnings.
- `docs/es/` is untouched by this revision, as expected: P3/T6 mirrors the English pages, and
  tasklist risk D5 records that "Landing the EN page alone turns `docs` red" — a repo-level gate
  owned by T6/T7, not by this review.
- The five new English items T6 must mirror, so the translator does not miss them: (1) the D1 scope
  paragraph, (2) the D2 contingency prefix, (3) the `!!! note "Link verification"` block ×3 — plus
  the unchanged `../reference/dgii-official.md` link target, which must stay byte-identical across
  locales (tasklist Decision 5).

---

## 3. Regression findings

### R-1 (required, one clause) — the new scope rule contradicts the OPS section (my wording)

**Quote A** — `docs/en/reference/dgii-official.md:172-177` (the sentence I supplied):

> What is published here is each document that a step or a field on this site depends on, verified
> reachable on the access date, … Documents DGII publishes that no step here depends on are not
> listed.

**Quote B** — `docs/en/reference/dgii-official.md:127-130` (pre-existing, unchanged):

> ## Operational and certification manuals
>
> Operational material rather than normative sources: no integration step below
> depends on these, but certification and contingency handling send readers to
> them.

…followed by six rows, including `Instructivo de Contingencia de Facturación Electrónica` — the row
`resilience.md` cites as `OPS-04`.

**The defect.** The page states that documents no step depends on are _not_ listed, and then lists
six of them while saying no step depends on them. An auditor comparing the two statements finds the
page's own coverage rule false about the page's own contents. It is a smaller and opposite error to
D1 (an _under_-description, not an over-claim) — and it is mine, because the sentence is mine.

**Fix — replace the scope sentence with this** (only the inclusion list and the guard change; the
register-facing behaviour is untouched):

> What is published here is each document that a step or a field on this site depends on, together
> with the certification and contingency material those steps send readers to, verified reachable on
> the access date, with the URL and the version each one was checked at, so anyone can re-check them.
> DGII publishes more than this: documents that nothing here depends on are not listed.

Why this is non-blocking: it adds no document, no URL, no date and no section reference; it only
describes a set that is already visible on the page. It cannot overstate what DGII publishes, and it
does not require a third review cycle — the wording above was checked against the same register rows
the six OPS entries already rest on.

### W-1 (optional, one phrase) — `flow.md` still says "the whole set"

**Quote** — `docs/en/guides/flow.md:6-8`:

> Every step below matches the official DGII documents, and each one names the
> document that governs it. [Official DGII references](../reference/dgii-official.md)
> lists the whole set, with a link per document.

The antecedent of "the whole set" is the set of per-step governing documents, and the linked page
states the exclusion rule — so a reader who follows the link is not misled. But "the whole set"
carried in isolation is exactly the completeness reading D1 removed from the page it points at, and
an auditor skimming the intro could take it as "the complete DGII catalogue". Suggested: "lists all
of them, with a link per document." **Attempt 1 missed this phrase; the omission is mine, not the
writer's.** Non-blocking.

### R-2 (informational) — page not in nav, page not in `docs/es`

Both are other tasks' gates and both were true before this revision: nav is T7/P4, the Spanish
mirror is T6/P3. Recorded only so the publishability statement below is not read as claiming a
shippable tree.

### R-3 (informational) — attempt-1 structural notes still open by decision

Tasklist Decision 5's `, accessed <YYYY-MM-DD>` suffix is still not on the individual lines; the new
per-page note now supplies the access date once per page instead. Tasklist Decision 4's
"first paragraph after each `## N.` heading" rule and T3/T5's `## DGII normative references` heading
check still do not pass against the current layout (citations sit 2–6 lines below their headings
behind the step intro: distances 5, 5, 4, 5, 2, 5, 6, 2). Both were raised in attempt 1 as non-provenance deviations; they are
unchanged and remain a tasklist-verification problem for T12 to rule on, not a defect in what the
pages say.

---

## 4. Publishability statement

**Could an auditor read these pages and be misled about what DGII publishes? No.**

- The page no longer claims to be DGII's catalogue. It states the opposite twice: coverage is
  claim-driven ("each document that a step or a field on this site depends on"), and DGII publishes
  documents that are deliberately absent ("Documents DGII publishes that no step here depends on are
  not listed"). The falsifiable-in-one-click failure of attempt 1 is gone.
- The 34-sources note is honest and non-comparative: it publishes the internal audit's count and
  explicitly declines to equate the two lists. Nothing pads the count and nothing prints a row total
  for a reader to reconcile.
- Every document, section, version and URL on the four pages was re-checked against the frozen
  register in this attempt: 43 document rows, 10 step rows, 12 citation lines, 0 URLs outside the
  register's set, 0 invented dates, 0 forbidden article numbers.
- The three new notes make the pages' own verification status legible — verified on `2026-11-09`,
  with an accurate warning that DGII republishes files in place — and the relative link resolves in
  the built site rather than 404-ing into a made-up path.
- The one sentence that would mislead an auditor about DGII's provenance is fixed. What remains is
  R-1, where the page contradicts _itself_ about why six manuals are listed: a reader comes away
  thinking the page is careless about its own rule, not that DGII publishes less than it does.

**Publishable on provenance grounds: yes, once R-1's one clause is applied** (and once T6 lands the
Spanish mirror and T7 the nav entry — both already scheduled, both repo-level gates unrelated to what
these pages assert). I would sign the provenance of these pages today; I would not sign a _frozen_
C-2 while the scope paragraph contradicts the section twenty lines above it, because the translation
inherits the contradiction.

## Outcome

Outcome: PASS — attempt 2 of 3: D1 resolved (my sentence applied near-verbatim, no completeness
claim, no row count, 34-sources sentence intact); D2 resolved by a scoping prefix, not a softening;
D3 left as instructed and required by the ledger's own T4 gate. No citation reworded, re-paired or
restamped (8/1/3 lines, 43+10 rows, 0 URLs outside the register); `mkdocs --strict` exit 0 / 0
warnings with the emitted `../../reference/dgii-official/` href resolving; prettier green.
Details: one required one-clause edit (R-1: my scope sentence says "no step here depends on are not
listed" while the OPS section lists six manuals "no integration step … depends on" — replacement
given verbatim), plus one optional phrase (W-1: `flow.md` "lists the whole set"), both my wording, not
the writer's. Nav (T7) and the `docs/es` mirror (T6) remain other gates; C-2 can freeze after R-1.
`project-tasks/124-evidence/t4t5-dgii-expert-en-citations-attempt2.md` — this review: per-item
status table, D1/D2/D3 proofs, regression hunt (notes, built hrefs, citation fingerprints), R-1/W-1
with exact replacement text, publishability statement.
