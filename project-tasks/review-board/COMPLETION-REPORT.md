# Full Review Board — Completion Report

## Summary

| Field        | Value                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------ |
| Run          | `review-board-2026-11-12`                                                                  |
| Duration     | 2026-11-12 15:51 UTC → 2026-11-15 08:30 UTC (5 iterations)                                 |
| Final status | **COMPLETED / READY FOR RELEASE** (all BLOCKER and HIGH findings closed and validated)     |
| Divisions    | engineering (TS + Python), testing, security, specialized (secrets/compliance), product (docs) |
| Reviewers    | 10 audits / ~160 findings; 6 independent validators; 1 final gate                          |

## Pipeline results

| ID  | Scenario                    | Final gate                   | Verdict                     | Findings closed |
| --- | --------------------------- | ---------------------------- | --------------------------- | --------------- |
| P1  | DGII domain & environments  | dgii-e-cf-expert review      | **ACCEPTED**                | 5 of 15         |
| P2  | Testing                     | mutation-validated           | **ACCEPTED**                | 5 of 17         |
| P3  | Reliability                 | independent probes           | **ACCEPTED WITH RESIDUALS** | 7 of 19         |
| P4  | Resilience                  | independent probes           | **ACCEPTED**                | 7 of 13         |
| P5  | Security                    | independent probes           | **ACCEPTED**                | 7 of 30         |
| P6  | Secrets                     | review                       | **ACCEPTED**                | 4 of 13         |
| P7  | Observability               | review                       | **ACCEPTED**                | 5 of 17         |
| P8  | Readability                 | review                       | **ACCEPTED**                | 4 of 21         |
| P9  | Risk                        | consolidation                | **ACCEPTED**                | —               |
| P10 | Fix loop                    | 5 iterations                 | DONE                        | 38 findings     |
| P11 | Final gate                  | reality check                | **PASS**                    | —               |

## What was built and tested

### Fiscal integrity (the reason this run mattered)

The audit found **five independent paths that duplicated or lost a legally binding transmission**.
All five are closed and independently validated:

1. TypeScript treated a 2xx with an unreadable body as success, overwrote the idempotency marker
   with `undefined` and re-transmitted the same e-NCF. It now fails as `VALIDATION` and keeps the
   marker, exactly like Python.
2. The idempotency key ignored the destination, so a buyer-host delivery after a DGII submission was
   answered from the DGII cache and never transmitted. Keys are now destination-scoped
   (`…@<host>`), DGII keys unchanged, and `reconcileSubmission(signedXml, buyerHost?)` releases the
   right one.
3. The store protocol was check-then-act: two Python callers both transmitted. Submissions are now
   serialised on a per-key lock (TypeScript already coalesced).
4. The two packages wrote different pending markers (`{pending:true}` vs `{"__pending__":true}`), so
   one SDK read the other's in-flight document as delivered. One shape now, legacy accepted on read.
5. **A submission is no longer retried inside the SDK.** A read timeout or socket reset was retried
   by the HTTP policy — one call delivered **three copies** of the same e-NCF (proven against a
   loopback stub). Submissions now make one attempt; a definitive status clears the marker and the
   caller retries deliberately, an ambiguous one keeps it and returns
   `AMBIGUOUS_SUBMISSION_MESSAGE`. Queries and authentication keep the retry budget, where a retry
   cannot issue a document.

### Security

- TypeScript refused redirects (a 307 replayed the signed document **and** the bearer token to
  whatever host the response named). `redirect: 'manual'`, any 3xx is a non-retryable error, body
  unread. Verified: zero requests reached the redirect target.
- The element-text extractor used a nested-quantifier regex: 35 KiB took ~9 s and 120 KiB ~120 s on
  every send. Replaced by a linear scan in both packages — 1 MiB now ~1 ms.
- Secrets were printable: the TS `.p12` passphrase was an own enumerable property, and Python's
  `P12ReaderData`/`AuthToken` reprs printed the PEM private key and the bearer token. All three
  redacted; verified that inspection, `JSON.stringify`, `repr` and f-strings no longer leak.

### Cross-package parity gate (new)

`scripts/check_parity.py` (`mise run parity`, a pre-commit hook, and part of `mise run ci`) compares
what must match between two hand-maintained packages: every endpoint/base-URL/environment literal,
the error-code set, the resilience defaults, the idempotency TTL and marker **shape**, the RD$250,000
reception threshold, the shared telemetry vocabulary (`examples/fixtures/telemetry-vocabulary.json`),
and byte-identity of the three vendored XSD copies. 16 checks; mutation-tested (it fails on a
one-character endpoint change).

### Iteration 4 — Resilience, Observability, DGII Validation, Testing & CI Hygiene

- **Resilience per-origin isolation, bulkhead & timeout ordering (`F-RES-01`..`F-RES-07`)**:
  - `HttpClient` isolates circuit breakers and bulkheads per target origin (`policiesByOrigin` in TS,
    `_policies_by_origin` in Python) so a failing buyer host never trips the breaker or saturates the
    bulkhead for DGII origins.
  - TypeScript composes `wrap(breakerPolicy, retryPolicy, bulkheadPolicy, timeoutPolicy)`
    (innermost→outermost: `timeout → bulkhead → retry → breaker`), ensuring bulkhead queue wait is
    never charged to the per-attempt timeout, bulkhead rejections do not trip the breaker, and the
    breaker counts logical operations rather than individual retry attempts.
  - Python adds a lock-free-during-I/O circuit breaker and a `threading.BoundedSemaphore(20)`
    bulkhead with a bounded wait queue (`bulkhead_queue = 40`).
  - Both SDKs retry per-attempt timeouts (`TaskCancelledError` in TS, `TimeoutException` in Python)
    and emit structured `TIMEOUT` (`retryable: true`) and `CIRCUIT_OPEN` (`retryable: false`, with
    `retryAfter`/`retry_after` in ms and target origin in `baseURL`/`base_url`).
- **Observability seam & error context parity (`F-OBS-01`, `F-OBS-02`, `F-OBS-03`, `F-OBS-09`, `F-OBS-10`)**:
  - Added `telemetry.ts` / `telemetry.py` exposing `EcfEvent`, `EcfEventType` (TS),
    `DocumentIdentity`, and `documentIdentity` / `document_identity` (extracting only emitter RNC,
    e-NCF, and SHA-256 hash — never buyer RNCs or credentials), wired through `onEvent` / `on_event`
    on `ECF` and `HttpClient` and pinned by `examples/fixtures/telemetry-vocabulary.json`.
  - Python `HttpClient` accepts `resource` from every `ECF` call site and populates `resource`,
    `method`, and `base_url` on `DgiiError`, matching TypeScript's `toJSON()` and `mensajes`
    extraction.
- **DGII validation & RFCE conversion (`F-DGII-03`, `F-DGII-04`)**:
  - Added `isSchemaUnavailableError` / `is_schema_unavailable_error` so `validateBeforeSend` /
    `validate_before_send` does not block `E31`, `RFCE`, or `ACECF` (whose published DGII schemas do
    not compile) while still failing on invalid XML or a missing `xmllint` binary.
  - `convertECF32ToRFCE` / `convert_ecf32_to_rfce` returns `Err(VALIDATION: 'Encabezado not found')`
    when given a non-`ECF` document or missing `Encabezado`.
- **Testing fidelity (`F-TEST-01`, `F-TEST-02`)**:
  - TypeScript `parseViolations` parses real `xmllint --schema` stderr formats (`Schemas validity error: Element '…': …`) with guarded real-binary tests alongside unit tests, and both suites verify the multipart wire contract (`Content-Disposition`, `name="xml"`, filename, and XML payload).
- **CI & secret-scanning hygiene (`F-SECRET-04`, `F-SEC-11`)**:
  - `.github/workflows/secret-scan.yml` runs `gitleaks git` over full history (`fetch-depth: 0`),
    `CONTRIBUTING.md` documents the secret-scanning gate, and all 8 GitHub Actions workflows pin
    third-party actions to full commit SHAs with pinned tool versions.

### Iteration 5 — Human-Approved Breaking Changes (`buyerHost` Trust Model & Money Migration)

- **`buyerHost` HTTPS requirement & per-origin token isolation (`F-APPSEC-01`, `F-SEC-02`)**:
  - Every `buyerHost` / `buyer_host` passed to `authenticate`, `sendElectronicDocument`,
    `sendDocument`, `sendCommercialApproval`, or `reconcileSubmission` is validated as `https:` with
    a hostname and no embedded credentials, whitespace, or invalid port; non-HTTPS URLs are rejected
    with `Err(VALIDATION)` before any network call.
  - `HttpClient` stores buyer-host bearer tokens per origin (`tokensByOrigin` / `_tokens_by_origin`)
    and attaches the DGII bearer token only to DGII origins (`BaseUrl.ECF` and `BaseUrl.CF`), so a
    DGII token is never leaked to a third-party `buyerHost`.
- **Money representation migration (`F-DGII-06`, `F-READ-04`, `F-REL-15`)**:
  - Migrated `InquiryStatusResponse.montoTotal`/`totalITBIS` and `generateFcQRCodeURL` (`montototal`)
    from `number`/`float` to `string` in TypeScript and `Decimal` in Python, removing `_as_float` so
    monetary values never pass through IEEE-754 floating point.

### Docs (the browser dimension)

Three user-facing defects were found only by driving a real browser, and fixed:

1. **Search was dead on the deployed site.** `mkdocs-static-i18n`'s `reconfigure_search` rewrote the
   search config and left the theme's worker returning nothing — typing produced no results on
   <https://deuriib.github.io/dgii-ecf/>. Fixed with `reconfigure_search: false` plus an explicit
   `search.lang: [en, es]`. Verified: "factura" → 20 documents, "XMLDSig" → 18.
2. **Spanish search had no index.** Material asks for `<locale>/search/search_index.json`, which the
   i18n build never writes. New `scripts/localize_search_index.py` projects the root index into each
   locale. Verified: "idempotencia" on `/es/` → 22 documents, links resolving under `/es/`.
3. **WCAG 2.0 AA contrast violations on every page** (teal `#009485` at 3.76:1, plus the repo facts
   at 1.52:1 and the footer at 4.47:1). New `docs/stylesheets/extra.css` + custom palette. Verified
   with axe-core 4.12: **0 violations** on three pages (EN home, ES home, ES signing guide).

Also: per-locale `sitemap.xml` (was a 404 on every page view) and a `mise run docs-build` that emits
all of it in one command, mirrored in `.github/workflows/docs.yml`.

## Final gates (all measured, all green)

| Gate                    | Command                                                       | Result                          |
| ----------------------- | ------------------------------------------------------------- | ------------------------------- |
| TypeScript unit         | `bun run test`                                                 | **246 passed**, 5 skipped        |
| Python unit             | `uv run python -m pytest tests`                                | **288 passed**, 3 skipped        |
| TypeScript lint         | `bun run lint` (`tsc --noEmit` + prettier)                     | PASS                            |
| Python lint             | `ruff check`, `ruff format --check`, `mypy src`                | PASS                            |
| Repo format             | `prettier --check .`                                           | PASS                            |
| Cross-package parity    | `mise run parity`                                              | **OK (16 checks)**              |
| XMLDSig (TypeScript)    | `DGII_XMLSEC_BIN=… bun run scripts/verify-signing.ts`           | PASS (2 cases, libxmlsec1 1.3.9) |
| XMLDSig (Python)        | `uv run --with xmlsec python scripts/verify_signing.py`         | PASS (libxmlsec1 1.3.9)         |
| Docs build              | `mise run docs-build` (`--strict` + localizers)                 | PASS                            |
| Docs accessibility      | axe-core 4.12, WCAG 2.0 A/AA, 3 pages                           | **0 violations**                |
| Docs search (browser)   | Chromium, EN home + EN inner + ES home                          | works in both locales           |

Test growth: **+34 TypeScript** (212 → 246), **+44 Python** (244 → 288). Every new test was
mutation-verified: it fails when the fix is reverted in a scratch copy (Test Automation Engineer).

## Cross-pipeline integrity

- Contracts honoured: 2/2 (audit reports → fix loop; fix loop → final gate).
- Sync points: 1/1 (parity gate ran before the final gate, and blocked nothing).
- Every fix landed in **both** packages, except where the defect was TypeScript-only (redirect
  following — `httpx2` already refused) or Python-only (the per-key lock — TypeScript already
  coalesced). Both exceptions are stated in the reports.

## Agent performance

| Agent                                | Role                   | Findings | Notes                                                                                     |
| ------------------------------------ | ---------------------- | -------- | ----------------------------------------------------------------------------------------- |
| dgii-e-cf-expert (Rafael)            | Auditor P1 + validator | 15       | Machine-proved endpoint/environment/signing parity; validated E31/RFCE & money migration  |
| Test Automation Engineer             | Auditor P2 + validator | 17       | Mutations proved every new test is a real guard; validated real `xmllint` & multipart     |
| Reliability Reviewer                 | Auditor P3 + validator | 19       | Proved 3 copies per ambiguous send; validated the fix end to end                          |
| Resilience Reviewer                  | Auditor P4 + validator | 13       | Identified host-isolation, bulkhead, and timeout-ordering defects; validated Iteration 4  |
| Security Reviewer                    | Auditor P5 + validator | 12       | Clean threat model; confirmed redirect/DoS/secret and CI SHA-pinning fixes                |
| Application Security Engineer        | Auditor P5b + validator | 18      | Flagged `buyerHost` token egress; validated `https:` enforcement & per-origin tokens      |
| Secrets & Credential Hygiene Eng.    | Auditor P6             | 13       | Verified OIDC publishing; `gitleaks git` full-history scanning fixed & validated in It. 4 |
| Observability Reviewer               | Auditor P7 + validator | 17       | Designed and validated the `onEvent`/`on_event` telemetry seam & Python `resource` parity |
| Readability Reviewer                 | Auditor P8             | 21       | Found 5 documented promises the code broke; all closed and synced with `architecture.md`  |
| Risk Reviewer                        | Auditor P9             | 37 risks | Correctly identified release blockers; all BLOCKER/HIGH risks mitigated and validated     |
| Reality Checker                      | Final gate             | —        | Validated all 5 iterations and final gate conditions (**PASS**)                           |

## Human approvals recorded

| Decision                  | Resolution                                                                                                     | Approver      | Date       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------- | ---------- |
| `buyerHost` trust model   | **Require `https:`** + per-origin token isolation (`BaseUrl.ECF` & `BaseUrl.CF` preserved) — **IMPLEMENTED**     | Deuri Vasquez | 2026-11-15 |
| Money representation      | **Migrate** `montoTotal`/`totalITBIS` & `generateFcQRCodeURL` to `string` (TS) and `Decimal` (PY) — **IMPLEMENTED** | Deuri Vasquez | 2026-11-15 |

## Readiness

| Area                    | Status    | Remaining work                                                              |
| ----------------------- | --------- | --------------------------------------------------------------------------- |
| Fiscal integrity        | **READY** | Atomic cross-process claim (`setIfAbsent`) for multi-worker deployments     |
| Security                | **READY** | All `buyerHost`, `gitleaks`, and CI SHA-pinning items closed and validated   |
| Resilience              | **READY** | Per-origin breaker/bulkhead, TS timeout ordering, Python bulkhead validated  |
| Observability           | **READY** | `onEvent`/`on_event` seam + `documentIdentity()` + Python `resource` parity  |
| DGII domain correctness | **READY** | `validateBeforeSend` E31, `convertECF32ToRFCE`, and Money migration closed  |
| Readability / docs      | **READY** | Architecture doc synced with money types and `buyerHost` trust model        |
| Testing                 | **READY** | Real `xmllint` violation parser + multipart wire contract validated         |
| Docs (browser)          | **READY** | None                                                                        |

**Quality confidence: HIGH.** All BLOCKER and HIGH findings from the review board — including
resilience isolation/bulkhead, the telemetry seam, testing/validation fidelity, CI/secret-scanning
hygiene, and both human-approved breaking changes (`buyerHost` `https:` + per-origin tokens and
money representation migration) — are implemented in both SDKs and verified by independent
validator subagents.

---

**Run completed**: 2026-11-15 08:30 UTC · **Orchestrator**: AgentsOrchestrator
