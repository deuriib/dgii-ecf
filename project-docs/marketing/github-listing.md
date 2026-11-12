# GitHub Listing — Description & Topics

Copy deck for the repository listing. Every claim below is traceable to `README.md`, `packages/*/src/index.ts`,
`packages/python/src/py_dgii_ecf/__init__.py` or `project-specs/dgii-ecf-setup.md`. Nothing here claims DGII
certification or endorsement; the packages are pre-1.0 (current versions in [`versions.json`](./versions.json)).

## 1. Repository description (About field)

**Primary — 269 characters (limit 350):**

```
Independent, open-source SDKs for DGII e-CF electronic invoicing in the Dominican Republic — TypeScript (npm @deuriib/dgii-ecf) and Python (PyPI py-dgii-ecf). XMLDSig signing (C14N + RSA-SHA256), SEED auth, e-CF/RFCE submission, status queries, idempotent retries. MIT.
```

Why it is shaped this way:

- The first six words carry the search weight: `DGII`, `e-CF`, `electronic invoicing`, `Dominican Republic`.
- `Independent` is both the honest disclaimer and a trust signal placed before the feature list.
- Both distribution names are literal, so npm and PyPI lookups resolve without a second click.
- It never says "DGII-approved", "certified" or "compliant out of the box".

**Short alternative — 136 characters (limit 160):**

```
Independent DGII e-CF SDKs for the Dominican Republic: TypeScript and Python, with XMLDSig signing, SEED auth and idempotent submission.
```

Use the short form where the field hard-clips: org-level pinned listings, link previews, chat unfurls.

## 2. Product description

### Tagline

`Ship DGII e-CF compliance in TypeScript or Python.`

Alternates: `One e-CF contract. Two languages. No hidden failures.` ·
`Sign, validate and submit without fighting XMLDSig.`

### Short description (138 characters)

```
Open-source TypeScript and Python SDKs for DGII e-CF: sign, validate and submit electronic invoices from your ERP, POS or billing backend.
```

### Long description (100 words)

```
Add e-CF compliance to an ERP, POS or billing system without building the DGII plumbing yourself. These SDKs own the parts that are easy to get wrong: SEED authentication, XMLDSig signing over inclusive C14N with RSA-SHA256, reception routing derived from the signed XML, and idempotent submission keyed by RNC + eNCF + SHA-256 of that XML. Every method returns a Result you must handle, money stays decimal instead of floating point, and the bundled DGII XSDs are validated before anything is sent. Bring your own payload as XML or JSON. MIT, server-side only, pre-1.0, independently maintained.
```

### Value proposition

- **Result-based APIs in both languages** — no hidden exceptions on rejected e-CFs, timeouts or bad certificates.
- **Retries for transient failures only**, plus circuit breaker and timeout; a rejected e-CF is never re-sent.
- **Idempotent submission** keyed by `RNC + eNCF + SHA-256(signed XML)`, recorded before the request leaves.
- **One design, two runtimes** — byte-faithful XMLDSig, decimal money, bundled XSD validation, same semantics.

### Positioning

Under Ley 32-23 and Decreto 587-24, Dominican businesses must issue e-CF through DGII's web services, which puts
XMLDSig correctness and submission semantics on every ERP, POS and billing vendor's roadmap. Most teams end up
rebuilding the same authentication, signature and idempotency plumbing in-house, so this project makes it shared,
reviewable, MIT-licensed code instead.

## 3. Topics (20 — GitHub maximum)

| #   | Topic                     | Bucket              |
| --- | ------------------------- | ------------------- |
| 1   | `e-invoicing`             | domain              |
| 2   | `dgii`                    | country / regulator |
| 3   | `electronic-invoicing`    | domain              |
| 4   | `dominican-republic`      | country / regulator |
| 5   | `ecf`                     | domain              |
| 6   | `facturacion-electronica` | domain              |
| 7   | `typescript`              | technology          |
| 8   | `python`                  | technology          |
| 9   | `xml-dsig`                | technology          |
| 10  | `tax-compliance`          | domain              |
| 11  | `xml`                     | technology          |
| 12  | `invoicing`               | domain              |
| 13  | `digital-signature`       | technology          |
| 14  | `x509`                    | technology          |
| 15  | `ncf`                     | country / regulator |
| 16  | `ley-32-23`               | country / regulator |
| 17  | `latam`                   | country / regulator |
| 18  | `erp-integration`         | use case            |
| 19  | `c14n`                    | use case            |
| 20  | `accounting`              | use case            |

Ordering is deliberate: GitHub renders topics in insertion order, and the first four are what appear in search
snippets and the sidebar.

Notes and trade-offs:

- `typescript`, `python` and `xml` are saturated. Kept because language tags drive GitHub's topic _filtering_,
  not search ranking; they cost nothing and are what developers actually use to narrow results.
- `c14n` replaces `b2b`. Canonicalization is the single hardest part of this domain and near-zero repos claim
  the tag, so it converts a generic repo into the obvious hit for someone debugging C14N 1.0.
- `ncf` replaces `ecommerce`. NCF is the predecessor numbering vocabulary this market still types; it has far
  more purchase intent in the Dominican Republic than a generic commerce tag.
- `ecf` is short and collides with unrelated abbreviations, but it is DGII's own term and what the official spec
  says, so a developer reading that spec searches exactly this string.
- Deliberately excluded: `sdk` (describes nothing, no discovery value), `invoice-generator` (wrong audience, implies
  PDF/template tooling), `decreto-587-24` (covered by `ley-32-23`), `neverthrow`, `cockatiel`, `lxml`, `httpx`
  (internal implementation details), `bun` and `nodejs` (build/runtime tooling, not discovery surfaces).

Format check: all 20 are lowercase `[a-z0-9-]`, single hyphens only, no leading/trailing hyphen, longest is
`facturacion-electronica` (23 characters), count is exactly 20.

## 4. Applying it

```bash
gh repo edit deuriib/dgii-ecf \
  --description "Independent, open-source SDKs for DGII e-CF electronic invoicing in the Dominican Republic — TypeScript (npm @deuriib/dgii-ecf) and Python (PyPI py-dgii-ecf). XMLDSig signing (C14N + RSA-SHA256), SEED auth, e-CF/RFCE submission, status queries, idempotent retries. MIT." \
  --add-topic e-invoicing,dgii,electronic-invoicing,dominican-republic,ecf,facturacion-electronica,typescript,python,xml-dsig,tax-compliance,xml,invoicing,digital-signature,x509,ncf,ley-32-23,latam,erp-integration,c14n,accounting
```

Also set the website field to `https://deuriib.github.io/dgii-ecf/` (the mkdocs site) so the sidebar links to
the documentation instead of the repo root.
