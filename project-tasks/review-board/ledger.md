# Full Review Board — Run Ledger

> Single source of truth for the review-board run. A finding moves to `VALIDATED` only when a
> different agent than the one who wrote the fix has confirmed it with evidence.

## Run

| Field          | Value                                                                                                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run            | `review-board-2026-11-12`                                                                                                                                                                                |
| Mode           | Full (review board, multi-pipeline)                                                                                                                                                                      |
| Started        | 2026-11-12 15:51 UTC                                                                                                                                                                                     |
| Target         | Both SDKs aligned on: DGII functionality, testing, environments, reliability, readability, security, observability, risk                                                                                  |
| Source of truth | `project-specs/dgii-ecf-setup.md`, `project-docs/architecture.md`, `project-docs/dgii-ground-truth.md`, `AGENTS.md`                                                                                      |
| Expert input   | `.omp/agents/engineering-dgii-ecf-expert.md` (dgii-e-cf-expert / Rafael)                                                                                                                                  |
| Human approver | Deuri Vasquez — required for signing semantics, published-schema decisions, the `buyerHost` trust model, and any release                                                                                   |

## Iterations

| #   | Scope                                                                                       | Gates at close                                                                                                    |
| --- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Baseline + toolchain (`xmlsec1`/`xmllint` sandbox workaround), 10 review-board audits        | TS 212, PY 244, lint green, both XMLDSig gates PASS                                                                |
| 2   | Integrity + security + parity cohort (details below)                                        | TS 228, PY 262, prettier/tsc/ruff/mypy green, parity 15 checks, both XMLDSig gates PASS                            |
| 3   | Submission retry removal (proven duplicate path) + docs/browser cohort                       | TS 228, PY 262, docs `--strict` PASS, axe WCAG 2.0 AA 0 violations, search verified in EN and ES                    |
| 4   | Resilience isolation/bulkhead/timeouts + Telemetry seam + Testing/DGII/CI-security cohort  | TS 241, PY 275, prettier/tsc/ruff/mypy green, parity 16 checks, 4 independent validators PASS                       |
| 5   | Human decisions: `buyerHost` HTTPS + per-origin tokens & Money migration (`string`/`Decimal`) | TS 246, PY 288, prettier/tsc/ruff/mypy green, parity 16 checks, AppSec + DGII Expert validators PASS               |

## Baseline vs final gates (measured, not assumed)

| Gate                | Command                                                        | Baseline                | Final                        |
| ------------------- | -------------------------------------------------------------- | ----------------------- | ---------------------------- |
| TS unit             | `cd packages/typescript && bun run test`                       | 212 passed, 3 skipped   | **246 passed, 5 skipped**    |
| PY unit             | `cd packages/python && uv run python -m pytest tests`          | 244 passed, 3 skipped   | **288 passed, 3 skipped**    |
| TS lint             | `bun run lint` (`tsc --noEmit` + prettier)                     | PASS                    | PASS                         |
| PY lint             | `ruff check`, `ruff format --check`, `mypy src`                | PASS                    | PASS                         |
| Parity (new)        | `mise run parity`                                              | —                       | **OK (16 checks)**           |
| XMLDSig gate (PY)   | `uv run --with xmlsec python scripts/verify_signing.py`        | PASS                    | PASS                         |
| XMLDSig gate (TS)   | `DGII_XMLSEC_BIN=… bun run scripts/verify-signing.ts`          | PASS                    | PASS (invoice-31 + c14n)     |
| Docs build          | `mise run docs-build` (`mkdocs build --strict` + localizers)   | PASS (root artifacts)   | PASS (sitemap + ES search)   |
| Docs accessibility  | axe-core 4.12, WCAG 2.0 A/AA, 3 pages                          | 1 violation / 12 nodes  | **0 violations**             |
| Docs search (browser) | Chromium, EN home + EN inner page + ES home                | **broken everywhere**   | **works (EN + ES)**          |

### Sandbox tool note (not a repo change)

The Ubuntu 26.04 `xmlsec1` CLI cannot load command-line keys
(`xmlSecKeysMngrGetKey: key is not found`), so the TypeScript gate is unusable with it even though
libxmlsec1 is healthy. Workaround lives outside the repository, at
`~/.cache/dgii-tools/`: distribution packages extracted there, `python-xmlsec` built against them,
and a `bin/xmlsec1` shim implementing the `--verify --pubkey-cert-pem` subset on the same
libxmlsec1. CI keeps using the real binary; nothing in the repo depends on the shim.

## Pipelines

| ID  | Pipeline                                  | Owner (producer)                                     | Validator                 | Status                       |
| --- | ----------------------------------------- | ---------------------------------------------------- | ------------------------- | ---------------------------- |
| P0  | Baseline & toolchain                      | AgentsOrchestrator                                   | —                         | DONE                         |
| P1  | DGII domain & environments                | dgii-e-cf-expert (Rafael, loaded from `.omp/agents/`) | Refuter Reviewer          | AUDITED + FIXED VALIDATED    |
| P2  | Testing                                   | Test Automation Engineer                             | Reality Checker           | AUDITED + FIXED VALIDATED    |
| P3  | Reliability                               | Reliability Reviewer                                 | Resilience Reviewer       | AUDITED + FIXED VALIDATED    |
| P4  | Resilience                                | Resilience Reviewer                                  | Reliability Reviewer      | AUDITED + FIXED VALIDATED    |
| P5  | Security                                  | Security Reviewer + Application Security Engineer    | Refuter Reviewer          | AUDITED + FIXED VALIDATED    |
| P6  | Secrets & credential hygiene              | Secrets & Credential Hygiene Engineer                | Security Reviewer         | AUDITED + FIXED VALIDATED    |
| P7  | Observability                             | Observability Reviewer                               | Reliability Reviewer      | AUDITED + FIXED VALIDATED    |
| P8  | Readability                               | Readability Reviewer                                 | DX Engineer               | AUDITED + FIXED VALIDATED    |
| P9  | Risk                                      | Risk Reviewer                                        | Refuter Reviewer          | AUDITED (37 risks, HOLD)     |
| P10 | Fix + validate loop                       | Build (orchestrator)                                 | dimension validator       | 5 iterations                 |
| P11 | Final gate                                | Reality Checker                                      | —                         | DONE (PASS)                  |

## Findings closed in this run (validated)

| ID                                                            | Dimension     | Fix (both packages unless noted)                                                                                                         | Validated by                     |
| ------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| F-DGII-01 / F-REL-05 / F-SEC-01                               | Integrity     | TS 2xx with an unreadable body is a `VALIDATION` failure and keeps the pending marker (parity with Python)                                | Reliability, Testing (mutation)  |
| F-DGII-02 / F-REL-02 / F-APPSEC-04                            | Integrity     | Idempotency key scoped to the destination (`@<host>`), DGII keys unchanged; `reconcileSubmission(signedXml, buyerHost?)`                  | Reliability (PASS)               |
| F-REL-03 / F-TEST-03                                          | Integrity     | Python per-key submission lock (parity with TS `inFlight`) — two callers, one transmission                                                | Reliability (PASS), Testing      |
| F-REL-04 / F-READ-13                                          | Integrity     | One pending-marker wire shape (`{"__pending__": true}`), legacy `{"pending": true}` accepted on read                                      | Reliability (PASS)               |
| F-REL-01 (+ residual)                                         | Integrity     | A failure with no HTTP status keeps the marker and returns `AMBIGUOUS_SUBMISSION_MESSAGE`                                                 | Reliability (PASS)               |
| F-REL-01 (duplicate path) / F-REL-08 / F-RES-10 / F-READ-01    | Integrity     | Submissions are not retried inside the SDK: one call = at most one transmission; queries/auth keep the attempt budget (3 = 3 attempts)     | Reliability (PASS), Testing      |
| F-APPSEC-02 / F-SEC-05                                        | Security      | TS refuses any 3xx (`redirect: 'manual'`), non-retryable, body unread — no replay of a signed document or token                            | Security (PASS)                  |
| F-APPSEC-03                                                   | Security      | Hand-rolled linear scan replaces the nested-quantifier regex (120 KiB: ~120 s → <2 ms; 1 MiB ~1 ms)                                        | Security (PASS)                  |
| F-SECRET-01 / 02 / 03                                         | Secrets       | TS `#passphrase`; Python `P12ReaderData.__repr__` and `AuthToken.__repr__` redact key and token                                            | Security (PASS)                  |
| F-TEST-04                                                     | Testing       | New `packages/python/tests/test_certificate.py` (8 tests: p12 round-trip, base64, file, info, reprs)                                       | Testing (mutation)               |
| R-34                                                          | Risk          | New cross-package parity gate (`scripts/check_parity.py`, `mise run parity`, pre-commit hook, `mise run ci`)                              | Testing (mutation: caught drift) |
| F-DOCS-01 (new)                                               | Browser/docs  | `reconfigure_search: false` + explicit `search.lang` — search was dead on the **deployed** site; now returns results                      | Orchestrator (Chromium)          |
| F-DOCS-02 (new)                                               | Browser/docs  | Per-locale `sitemap.xml` (`scripts/localize_sitemap.py`) — `/es/sitemap.xml` was 404                                                        | Orchestrator (Chromium)          |
| F-DOCS-03 (new)                                               | Browser/docs  | WCAG 2.0 AA contrast: custom palette + link underline + code/footer colours (`docs/stylesheets/extra.css`); axe 12 nodes → 0               | Orchestrator (axe-core)          |
| F-DOCS-04 (new)                                               | Browser/docs  | Per-locale search index (`scripts/localize_search_index.py`) — search was silent on every `/es/` page                                       | Orchestrator (Chromium)          |
| F-RES-01                                                      | Resilience    | Per-origin policy isolation (`policiesByOrigin` / `_policies_by_origin`) — sick buyer host no longer disables DGII                           | Resilience Reviewer (PASS)       |
| F-RES-02 / F-RES-03                                           | Resilience    | TS `wrap(breaker, retry, bulkhead, timeout)` + bulkhead excluded from breaker; logical operations counted                                    | Resilience Reviewer (PASS)       |
| F-RES-04                                                      | Resilience    | TS `TaskCancelledError` retried & both SDKs emit `TIMEOUT` (`retryable: true`)                                                               | Resilience Reviewer (PASS)       |
| F-RES-05 / F-RES-07                                           | Resilience    | Python lock-free-during-I/O breaker + `BoundedSemaphore` bulkhead (`20`/`40`)                                                                | Resilience Reviewer (PASS)       |
| F-RES-06 / F-OBS-03 / F-OBS-09 / F-OBS-10                     | Res / Obs     | `CIRCUIT_OPEN` & `TIMEOUT` emitted with `retryAfter`/`retry_after` & target origin; `toJSON()` + `mensajes` parity                           | Resilience & Obs Reviewers (PASS)|
| F-OBS-01                                                      | Observability | `onEvent`/`on_event` + `documentIdentity`/`document_identity` + `examples/fixtures/telemetry-vocabulary.json`                                | Observability Reviewer (PASS)    |
| F-OBS-02                                                      | Observability | Python `HttpClient` accepts `resource` from every `ECF` call site and populates `resource`/`method`/`base_url` on errors                     | Observability Reviewer (PASS)    |
| F-DGII-03                                                     | DGII Domain   | `isSchemaUnavailableError` / `is_schema_unavailable_error` keeps `validateBeforeSend` from blocking E31/RFCE/ACECF                           | Testing & Obs Reviewers (PASS)   |
| F-DGII-04                                                     | DGII Domain   | `convertECF32ToRFCE` returns `Err(VALIDATION: 'Encabezado not found')` on non-`ECF` / missing `Encabezado`                                   | Test Automation Eng. (PASS)      |
| F-TEST-01 / F-TEST-02                                         | Testing       | TS `parseViolations` parses real `xmllint` stderr + guarded real-binary tests; multipart wire contract tests in both SDKs                    | Test Automation Eng. (PASS)      |
| F-SECRET-04 / F-SEC-11                                        | Sec / CI      | `secret-scan.yml` (`fetch-depth: 0` + `gitleaks git`), `CONTRIBUTING.md` updated, all 8 workflows SHA-pinned + tool versions pinned          | Security Reviewer (PASS)         |
| F-APPSEC-01 / F-SEC-02                                        | AppSec        | `buyerHost` requires `https:` (no userinfo/whitespace/bad port) + per-origin token isolation (`BaseUrl.ECF` & `BaseUrl.CF` preserved)        | AppSec Engineer (PASS, Att 2/3)  |
| F-DGII-06 / F-READ-04 / F-REL-15                              | Domain / Read | `InquiryStatusResponse` (`montoTotal`/`totalITBIS`) & `generateFcQRCodeURL` migrated to `string` (TS) and `Decimal` (PY); `_as_float` gone  | DGII Expert (PASS)               |

## Findings still open (top, by severity — full list in the reports)

| ID                                                  | Severity | Why it matters                                                                                  | Owner           |
| --------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------- | --------------- |
| F-OBS-07, F-REL-09/10/13/16, F-READ-03/06/07/14/15/17 | MEDIUM | Remaining medium/low items (single-flight `joined` in PY, `Retry-After` sleep clamping, `httpx2.Client` close) | Backlog         |

## Handoff contracts

| ID  | From → To               | Artifact                                                                 | State     |
| --- | ----------------------- | ------------------------------------------------------------------------ | --------- |
| C-1 | P1..P9 → P10            | `project-tasks/review-board/reports/*.md` (frozen at triage)              | DELIVERED |
| C-2 | P10 → P11               | fix commits + gate evidence (`project-tasks/review-board/reports/validation-*.md`) | DELIVERED |

## Pen-test authorization scope

| Scope                                                    | Authorized     | Notes                                                                    |
| -------------------------------------------------------- | -------------- | ------------------------------------------------------------------------ |
| Local stubs, loopback servers, hostile XML/response probes | Yes (this run) | Owned harnesses only                                                     |
| `ecf.dgii.gov.do`, `fc.dgii.gov.do`, `statusecf.dgii.gov.do` | **No**         | No written authorization; offensive testing against DGII is out of scope  |

## Escalations

0. **Cross-checked against DGII's primary sources.** The DGII e-CF Expert's ruling
   (`reports/expert-consult-dgii-expert.md`) was verified in the NotebookLM notebook
   *Reglamento y Guía de Facturación Electrónica de la DGII* — see
   `reports/expert-consult-notebooklm-verification.md`. Both rulings hold; per-origin keying is
   refined to key on the **origin of each URL** (`urlOpcional`/`urlRecepcion`/`urlAceptacion` are
   independent host fields), and the `json2xml` money guard must be per-field because
   `PrecioUnitarioItem` allows up to 4 decimals.
1. **`buyerHost` trust model** (F-APPSEC-01 / F-SEC-02) — **RESOLVED (Approved by Deuri Vasquez, 2026-11-15: "1. require https")**. Implemented `https:` requirement + per-origin token isolation (`BaseUrl.ECF` & `BaseUrl.CF` preserved).
2. **Money representation** (F-DGII-06 / F-READ-04) — **RESOLVED (Approved by Deuri Vasquez, 2026-11-15: "2. migrate")**. Migrated `montoTotal`/`totalITBIS` and `generateFcQRCodeURL` to `string` (TS) and `Decimal` (Python).
