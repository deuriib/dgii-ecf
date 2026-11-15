# Risk Review

**Reviewer:** Risk Reviewer (p9) · **Scope:** consolidated risk adjudication of the DGII e-CF dual-SDK
review board · **Date basis:** `main` @ `8b7879a`, released artifacts TS `0.6.1` / PY `0.7.2`
· **Mode:** read-only; no repo file changed except this report.

**Inputs consumed:** `p1-dgii-domain.md`, `p2-testing.md`, `p3-reliability.md`, `p5-security.md`,
`p5b-appsec.md`, `p7-observability.md`. `p4`, `p6`, `p8` **do not exist** in
`project-tasks/review-board/reports/` — the board is missing three dimensions (see *Coverage*).

---

## Verdict

**HOLD — both published artifacts carry release-blocking fiscal-integrity defects. Do not promote
`main` to a release until Cohort 0–3 of the fix plan land; the current publications need a patched
release plus, for four of them, a security advisory.**

The decisive fact, which frames every other judgment in this report: **there are zero source commits
between the release tags and `main`.**

```
$ git diff --stat typescript-v0.6.1 HEAD -- packages/typescript/src   # empty
$ git diff --stat python-v0.7.2   HEAD -- packages/python/src         # empty
$ git log --oneline python-v0.7.2..HEAD
8b7879a chore(release): auto-update marketing copy deck versions
0ef1d6e docs: correct unsourced and mis-cited claims in dgii-ground-truth.md
```

Only a docs commit and a marketing-version chore separate `main` from what is on npm and PyPI.
**There is no "latent on main" category for any behavioural finding in this review: everything the
six reviewers reproduced runs on the machine of every user who installed the current version.** That
converts a review of code into a review of shipped liability, and it is why my verdict is HOLD rather
than "fix before next release".

The second decisive fact: **the two packages do not fail the same way.** The board's headline
invariant is behavioural identity, and I found that the identity holds beautifully where DGII's rules
live (endpoints, routing, the RD$250,000 boundary, and — proven by matching `<DigestValue>` — the
canonical bytes) and breaks precisely where the SDKs decide what to do with an answer. In the
idempotency layer the divergences are not cosmetic: TypeScript destroys its own lock on a response it
cannot parse (R-01), Python transmits twice under two threads (R-03), and the two packages do not
even agree on how to spell "pending" in a shared store (R-05). A dual-language fleet — which this
project's Redis-store documentation explicitly contemplates — gets the union of both defect sets.

My disagreements with the board are narrow and mostly about grading, not about facts. I override
thirteen grades — eight raised (the destination-omitted key, the duplicate-send race, the TS 2xx
defect, `buyerHost`, redirects, token egress, the certificate lifecycle, store-error escapes) and five
lowered (the Python marker divergence, both observability BLOCKERs, and two test-gap HIGHs that have no
current defect behind them). I reject one third-party framing outright: the "XXE" label on
`F-APPSEC-08`, which the security reviewer himself disproved for external entities. My reasoning is in
*Severity reconciliation*; the register is below.

**Recommendation: Hold.** Concretely: (1) do not tag a release from `main` today; (2) open the
advisory track for R-01/R-02/R-03/R-04 and the egress trio R-14/R-15/R-16; (3) land Cohort 0
(the parity gate, R-34) **first**, because it is a two-hour change that prevents this entire class of
defect from recurring, and every later fix in this plan is one-package-drifting by construction.

---

## Risk register

37 de-duplicated risks. Grades use the board's vocabulary — **BLOCKER** (release-blocking: must be
fixed before the next artifact is published), **HIGH** (must be fixed or explicitly risk-accepted by
the maintainer before the next minor), **MEDIUM** (schedule within the quarter), **LOW**.

`Shipped` is `S` (present in TS 0.6.1 / PY 0.7.2 — verified identical to `main`) or `L` (latent: no
current behavioural defect). Likelihood and impact are graded **for a real issuer** running this SDK
against the real DGII endpoints, not for an abstract adversary.

### Family A — Idempotency and submission integrity

The board found five distinct defects here. **Decision on the family question asked of me:** the
TypeScript marker-wipe defect (R-01) and the Python duplicate-send race (R-03) belong to **one
family but are two risks, not one.** They share the same root cause — the idempotency layer has no
atomic claim and cannot distinguish "definitely not delivered" from "unknown" — but they fail through
different mechanisms and need different fixes: R-01 is a *response-validation* defect in the HTTP
layer (`http.ts:202-223` trusts any 2xx), R-03 is a *store-protocol* defect (a three-method Protocol
with no conditional write). Merging them would produce a fix (an atomic claim) that leaves R-01 wide
open, or a fix (strict decoding) that leaves the race open. I therefore keep them separate and record
the shared root cause here once. R-04 (retry on an ambiguous POST) and R-05 (marker encoding) are
siblings with their own mechanisms.

| ID    | Category               | Sev         | Shp | Likelihood                                                                        | Impact                                                                              | Mitigation (owner)                                                                                                                                             |
| ----- | ---------------------- | ----------- | --- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-01  | TS response contract   | **BLOCKER** | S   | **High** — any 200 with empty/HTML/malformed body (WAF, LB, maintenance page)      | Lost filing reported as delivered **and** marker destroyed → unbounded re-send        | Mirror PY `_cache_submission`: a submit response that is not a JSON object is `VALIDATION` and **keeps** the marker; never key parsing off `content-type` (p1/p3, fix spec in `F-REL-05`; p5 concurs) |
| R-02  | Idempotency key space  | **BLOCKER** | S   | **High** — B2B delivery + DGII filing of one document is the documented flow       | Silent non-delivery to buyer B and no DGII filing, both returned as `Ok`               | Put `method:host+path` in the key; stop caching a B2B 400 as accepted (`F-REL-02`; p1, p5b concur)                                                              |
| R-03  | Concurrency            | **BLOCKER** | S   | **High** — PY: any thread pool; both: any multi-process/multi-instance deploy      | Duplicate e-CF with two `trackId`s; sequence consumed twice                           | `setIfAbsent`/`set_if_absent` atomic claim in the store contract + port `singleFlight` to PY (`F-REL-03`, `F-TEST-03`, `F-APPSEC-09`)                             |
| R-04  | Retry on non-idempotent POST | **BLOCKER** | S   | **High** — retries are the *default* on transport failure                          | 3–5 copies of one e-NCF at DGII for a single caller intent                            | Classify `maybeDelivered` at the transport; delete the marker only when `false`; never retry a POST body in the HTTP layer (`F-REL-01`)                           |
| R-05  | Cross-package wire format | HIGH     | S   | **Medium** — needs a mixed TS+PY fleet on one store (documented, not default)       | Other package reads "pending" as a cached success → lost filing reported `Ok`          | One versioned marker in a **shared fixture** both suites load; dual-read legacy shapes for one deprecation window (`F-REL-04`)                                    |
| R-06  | Result contract        | HIGH        | S   | **High** — the store *is* a network dependency (Redis/Postgres) per the docs       | Store error crashes `Result`-only callers; `set()` failing post-transmit loses the `trackId` | Wrap all three store ops → `DgiiError(IDEMPOTENCY)`; on post-transmit `set` failure return the success anyway (`F-REL-06`, `F-APPSEC-05`)                          |
| R-07  | Recoverability         | HIGH        | S   | **Medium** — follows R-01/R-04, which are common                                              | A document becomes permanently un-sendable; only escape is a process restart           | Add a public `clear`/`reset` (guarded by an explicit acknowledgement) and widen `cleared` to the `Rechazado` case (`F-REL-10`)                                     |
| R-08  | Cache hygiene          | LOW         | S   | Low                                                                               | Stale entries / needless re-parse                                                     | Monotonic clock for TTL; store the parsed model (`F-REL-18`, `F-REL-19`)                                                                                         |

### Family B — Transport, retry and availability

| ID   | Category            | Sev    | Shp | Likelihood                                                          | Impact                                                                     | Mitigation (owner)                                                                                                                       |
| ---- | ------------------- | ------ | --- | ------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| R-09 | Retry budget        | HIGH   | S   | **High** — every 5xx/429/408 path                                     | TS spends **4** attempts where docs say 3 → one extra duplicate transmission; PY misses `ReadError`/`WriteError` and **retries** `CircuitBreakerError`; `Retry-After` ignored | Fix the off-by-one, add the missing/removed predicate classes, honour `Retry-After`, jitter PY (`F-REL-08`, `F-REL-12`, `F-REL-13`)        |
| R-10 | Availability (PY)   | HIGH   | S   | **High** — every Python deployment                                     | Peak in-flight = **1**; a single slow endpoint blocks all traffic *and* the diagnostic calls | Stop running the I/O inside `CircuitBreaker.call`; add a bulkhead to match TS 20/40 (`F-REL-07`)                                          |
| R-11 | Availability (PY)   | HIGH   | S   | **Medium** — slow/trickling DGII endpoints                             | Unbounded call duration; `timeout_s` reports a value nothing enforces        | Total deadline (not per-phase); make the reported option the one in force (`F-REL-09`, `F-OBS-13`)                                        |
| R-12 | Availability (both) | HIGH   | S   | **High** — every send parses caller XML with this regex                | 8.9 s at 35 KiB, **119.8 s at 120 KiB** — a legitimately large invoice blows the attempt budget and *causes* R-04's duplication | Linear scan or bounded regex; hard input size cap (`F-APPSEC-03`)                                                                        |
| R-13 | Resource limits     | MEDIUM | S   | Medium                                                                 | `xmllint` subprocess with no timeout; unbounded response body; `err.data` uncapped; PY client never closed | Timeout + output cap on the subprocess; body size cap; cap `err.data` (`F-REL-11`, `F-SEC-08`, `F-OBS-14`, `F-REL-16`)                     |

### Family C — Egress, secrets and XML hardening

| ID   | Category            | Sev    | Shp | Likelihood                                                                  | Impact                                                                              | Mitigation (owner)                                                                                                                       |
| ---- | ------------------- | ------ | --- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| R-14 | SSRF / credential egress | HIGH | S  | **High** — the docs teach passing `urlRecepcion` from the DGII directory as `buyerHost` | Seller's DGII bearer token handed to an arbitrary host, plaintext if `http://`; `file://` accepted | Validate scheme+host against an allowlist (or an explicit `allowCustomHosts` opt-in); never attach `Authorization` to a non-DGII host (`F-APPSEC-01`, `F-SEC-02`) |
| R-15 | Redirect            | HIGH   | S   | **Medium** — needs a 307/308 from a peer or an intermediary                  | Signed invoice + token replayed to an arbitrary URL, reported `Ok`                   | `redirect: 'error'` on the invoice POST (PY already does not follow) (`F-APPSEC-02`, `F-SEC-05`)                                          |
| R-16 | Secret exposure     | HIGH   | S   | **High** — the PY CLI prints the token and both doc sets teach the pattern   | Token in terminal scrollback/CI logs; secrets exposed by object inspection; passphrase on argv | Stop printing the token; document-side fix; redact in `toJSON`/`__repr__`; read the passphrase from a prompt/env (`F-OBS-05`, `F-SEC-03`, `F-SEC-06`) |
| R-17 | XML hardening / sign-what-you-see | MEDIUM | S | **Low** — requires a `DOCTYPE` in caller XML                        | PY expands **internal** entities and drops the `DOCTYPE`, so the signed bytes ≠ the reviewed bytes; TS refuses the same document | One hardened parser factory (`resolve_entities=False, no_network=True, load_dtd=False`) and reject `DOCTYPE` in both (`F-APPSEC-08`, `F-SEC-09`, `F-TEST-09`) |
| R-18 | TLS / proxy         | MEDIUM | S   | **Medium** — Python honours `HTTP(S)_PROXY`/`.netrc` by default              | Token follows an unvetted proxy; TLS-off injection undocumented                     | Document both injection points; require an explicit opt-in to disable verification; consider `trust_env=False` (`F-APPSEC-10`)            |
| R-19 | Unvalidated secondary inputs | MEDIUM | S | Medium                                                                    | Seed signed without shape/size checks; routing rule bypassable at three call sites; regex interpolation; `xml-js` `<` escaping; terminal escapes survive normalization | Validate the seed; route inside the client only; escape interpolations; strip control chars (`F-SEC-10`, `F-APPSEC-15/16/17`, `F-SEC-07`)  |

### Family D — Domain correctness

| ID   | Category                 | Sev    | Shp | Likelihood                                                                    | Impact                                                                                 | Mitigation (owner)                                                                                                                    |
| ---- | ------------------------ | ------ | --- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| R-20 | Pre-send validation      | HIGH   | S   | **High for anyone who enables the flag** — E31 is *the* crédito-fiscal document | Turning the SDK's own gate on makes the flagship document type unsendable; `sendSummary` never validates at all | Ship or generate a working E31 schema; make "schema unavailable" a warning, not a hard `Err`; validate the RFCE path (`F-DGII-03`)      |
| R-21 | E32→RFCE conversion      | HIGH   | S   | **High** — mandatory for every E32 below RD$250,000, per the SDK's own routing | Conversion throws (TS) or emits a structurally invalid RFCE; the routing rule's only escape hatch is broken | Fix the root check and align the output shape with PY; add a both-packages fixture test (`F-DGII-04`)                                    |
| R-22 | Certificate lifecycle    | HIGH   | S   | **Near-certain within 12 months** — certificates expire by construction        | Silent signing with an expired/not-yet-valid/mismatched certificate; issuance outage until rotation; `validateXMLCertificate`'s name over-promises what it checks | Preflight on send (expiry window + signer-RNC binding), a startup check, and a documented alert hook (`F-DGII-08`, `F-APPSEC-06`, `F-OBS-08`, `F-SEC-04`) |
| R-23 | Money                    | MEDIUM | S   | Medium                                                                        | Float on `InquiryStatusResponse.montoTotal/totalITBIS` and in the FC QR helper; breaks the repo's own money invariant on one model | `string`/`Decimal` on that model; keep the QR helper on decimals (`F-DGII-06`, `F-REL-15`, `F-APPSEC-13`)                               |
| R-24 | Document identity        | MEDIUM | S   | Medium                                                                        | No e-NCF structure check, no `TipoeCF`↔e-NCF consistency, nothing requires a signature; schema validation is opt-in while the XSDs ship | Cheapest high-value subset: require a signature + e-NCF before transmit; consider defaulting validation on for E32 (`F-DGII-07`, `F-APPSEC-07`, `F-APPSEC-12`) |
| R-25 | Response models (TS)     | MEDIUM | S   | Medium                                                                        | Unchecked `data as T`; fields typed `string` arrive `undefined`; TS validates nothing on the success path | Shape predicate per resource, as PY already does (`F-DGII-05`, `F-APPSEC-11`) — **must land with R-01**                                 |
| R-26 | Key-material contract    | MEDIUM | S   | Medium                                                                        | PY `Signature()`/`from_p12()` **raise** where TS returns `Err`; refresh failures swallowed; a bad PEM raises `ValueError` | Route both through the normalizer; keep the raising variant as an alias (`F-APPSEC-14`, `F-REL-17`)                                      |
| R-27 | Parity / documentation   | LOW    | S   | Low                                                                           | Clock-unit mismatch (`now`: ms vs s), `fileName` fallback promised but absent, `expira` TZ-dependent, `formatViolations` path-less rendering, `json2xml` multi-root, `check_b2b_applicability` unexported, `unknown-` sentinels | Batch as one "contract truth-up" PR with doc edits (`F-DGII-09..15`, `F-REL-14`, `F-OBS-16`, `F-OBS-17`)                                 |

### Family E — Observability

| ID   | Category          | Sev    | Shp | Likelihood                              | Impact                                                                                   | Mitigation (owner)                                                                                                       |
| ---- | ----------------- | ------ | --- | --------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| R-28 | Instrumentation   | HIGH   | S   | **High** — 4 of 7 3 a.m. questions unanswerable | Every failure in families A–D surfaces as an audit finding instead of an incident         | Add an optional `onEvent`/telemetry sink to the client options; expose the correlation key publicly (`F-OBS-01`, `F-OBS-06`) |
| R-29 | Error identity    | MEDIUM | S   | **High** — every PY wire failure        | An operator switching SDKs loses "which endpoint failed"                                  | Populate `resource`/`method`/`baseURL` in `to_dgii_error` (`F-OBS-02`, `F-DGII-12`)                                       |
| R-30 | Error taxonomy    | MEDIUM | S   | **High** — breaker opens are inevitable | `TIMEOUT`/`CIRCUIT_OPEN` never emitted; no attempt record; idempotency outcomes invisible; `mensajes` never populated on the wire path; `str(err)` loses everything | Emit the declared codes, add an attempt record, populate `mensajes` (`F-OBS-03`, `F-OBS-04`, `F-OBS-07`, `F-OBS-09`, `F-OBS-10`, `F-OBS-11`, `F-OBS-12`, `F-REL-12`) |

### Family F — Test, release and process engineering

| ID   | Category                  | Sev    | Shp | Likelihood                                                                       | Impact                                                                                     | Mitigation (owner)                                                                                                     |
| ---- | ------------------------- | ------ | --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| R-34 | **Parity gate (process)** | **HIGH** | S | **High** — 6 of the 37 risks below are explicitly "the packages disagree"          | Every fix in this plan can land in one package and no gate notices; drift is the repo's stated headline invariant | Add a cross-package conformance job: one shared fixture set + a script asserting both packages produce identical wire bytes, digests, routing decisions and error codes for a fixed table. **Cheapest high-value item in this report** |
| R-36 | **Bus factor (process)**  | **HIGH** | S | **Certain** — measured                                                        | One human reviews and writes both implementations and all six invariants; there is no second opinion on signing or idempotency | Name a second reviewer for the invariants list; require a second pair of eyes on `signing.*`, `client.*` idempotency paths and both `CHANGELOG`s |
| R-31 | Proof gaps                | MEDIUM | S   | Medium                                                                           | The TS `xmllint` parser is proven only against fabricated stderr (real one never matches); PY `P12Reader`/`CertificateInfo`/`track_statuses` untested | Test against the real binary in CI; port the TS suites to PY (`F-TEST-01`, `F-TEST-04`, `F-TEST-05`, `F-TEST-08`, `F-TEST-10`, `F-TEST-11`, `F-TEST-16`, `F-TEST-17`) |
| R-32 | Unasserted wire contract  | MEDIUM | S   | Medium                                                                           | Multipart part name/filename/`Accept`, and the summary host, are asserted nowhere — a refactor breaks submission silently | Assert the wire contract against a local echo server, both packages (`F-TEST-02`, `F-TEST-06`, `F-TEST-07`)              |
| R-33 | Artifact integrity        | MEDIUM | S   | Low today                                                                        | Nothing proves the published artifact carries its schemas; fixtures' byte-sensitivity is a claim, not a test; the three schema copies have **no gate** | Add a built-artifact smoke test and a `diff` gate over the three schema trees (`F-TEST-13`, `F-TEST-15`)                  |
| R-35 | Test isolation            | MEDIUM | S   | **Medium** — any developer who exported `DGII_*` for `examples/`                  | `mise run test`/`ci` transmits **live**, burning a single-use authorized sequence and creating real documents | Make integration opt-in by marker/dir exclusion, not by absence of env vars (`F-TEST-12`)                                |
| R-37 | Supply chain              | LOW    | S   | Low                                                                              | 20 TS advisories (3 critical, dev-only); `node-forge` has no fix; CI actions on movable tags; secret detection narrower than the hooks imply | Pin actions by SHA; scope the docs; keep gitleaks current (`F-APPSEC-18`, `F-SEC-11`, `F-SEC-12`)                        |

**Shared root cause, stated once:** R-01, R-03, R-04 and R-05 are four symptoms of one architectural
gap — *the idempotency layer cannot express "unknown outcome", and its store cannot make an atomic
claim.* A fix sequence that lands R-06 (errors into the `Result`) and then R-04 (the
`maybeDelivered` flag) before touching R-01/R-03 gives the later changes a vocabulary they need;
that is why Cohort 2 is ordered the way it is in *Fix risk and sequencing*.

---

## Severity reconciliation

Fourteen findings were graded more than once, or produced contradictory verdicts. I adjudicate each
to a single grade below. **I overrode a reviewer's grade in thirteen of them — eight raised, five
lowered** — and reject one framing outright. Where I move a grade down, it is because I am scoring the
*risk* (likelihood × impact for a real issuer), not the *defect* (how wrong the code is) — a reviewer
looking at a broken code path naturally grades it by how broken it is, which systematically inflates
findings with low reach. Where I move one up, it is because the reviewed precondition is in fact the
documented happy path.

| Risk (findings merged)                                 | Grades as filed                       | **Adjudicated** | Whose grade I overrode, and why                                                                                                                                                                                                                     |
| ------------------------------------------------------ | ------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-01 (`F-DGII-01`, `F-REL-05`, `F-SEC-01`)             | BLOCKER / BLOCKER / HIGH               | **BLOCKER**     | Overrode **p5 (HIGH)**. p5 graded it inside a security frame where its primitive is "caller is lied to"; correct in that frame. But the release question is whether this may ship, and a destroyed lock plus a lost filing is the exact failure `AGENTS.md` forbids. |
| R-02 (`F-DGII-02`, `F-REL-02`, `F-APPSEC-04`)          | HIGH / BLOCKER / MEDIUM                | **BLOCKER**     | Overrode **p1 (HIGH)** and **p5b (MEDIUM)**. All three proved silent non-transmission reported as `Ok`; p5b scored the CWE-697 logic flaw rather than its fiscal consequence. Materially worsened by `#109` direct B2B delivery, which created the multi-destination flow a single-destination key cannot serve. |
| R-03 (`F-REL-03`, `F-TEST-03`, `F-APPSEC-09`)          | BLOCKER / HIGH / MEDIUM                | **BLOCKER**     | Overrode **p2 (HIGH)** and **p5b (MEDIUM)**. p2 graded the *test gap* and p5b the *design*; the risk is a duplicate legally-binding document, and Python needs only two threads.                                                                       |
| R-05 (`F-REL-04`)                                      | BLOCKER                                | **HIGH**        | Overrode **p3 (BLOCKER), downward**. Graded by impact alone; the reproduction requires a mixed TS+PY fleet on one store. Likelihood is Medium, not High. Returns to BLOCKER the moment a mixed-runtime migration is documented.                          |
| R-14 (`F-APPSEC-01`, `F-SEC-02`)                       | HIGH / MEDIUM                          | **HIGH**        | Overrode **p5 (MEDIUM), upward**. p5 required "an untrusted `buyerHost`"; but the docs *teach* taking `urlRecepcion` from the DGII directory (`docs/en/guides/flow.md:294`), so the precondition is the documented path, not an attack.                |
| R-15 (`F-APPSEC-02`, `F-SEC-05`)                       | HIGH / MEDIUM                          | **HIGH**        | Overrode **p5 (MEDIUM), upward**. Needs no hostile actor — any WAF or load balancer answering `307` triggers a replay of a signed legal document.                                                                                                        |
| R-16 (`F-OBS-05`, `F-SEC-03`, `F-SEC-06`)              | HIGH / MEDIUM / MEDIUM                 | **HIGH**        | Overrode **p5 (MEDIUM ×2), upward**. p5's "each needs a precondition" reasoning fails here: the CLI prints the token by default; the precondition is the shipped default behaviour.                                                                     |
| R-22 (`F-DGII-08`, `F-APPSEC-06`, `F-OBS-08`)          | MEDIUM / MEDIUM / HIGH                 | **HIGH**        | Overrode **p1 and p5b (MEDIUM), upward**. Both scored it conditionally ("if the certificate expires"), which inverts the base rate: for a 1-year certificate, expiry is a certainty on a 12-month horizon and the impact is a total issuance outage.    |
| R-28 (`F-OBS-01`)                                      | BLOCKER                                | **HIGH**        | Overrode **p7 (BLOCKER), downward**. A library that returns structured errors can ship without an I/O hook; an absent telemetry seam does not corrupt or duplicate a fiscal document. It is an *amplifier* of families A–D (hence HIGH and Cohort 1), not a release gate. |
| R-29 (`F-OBS-02`, `F-DGII-12`)                         | BLOCKER / LOW                          | **MEDIUM**      | Overrode **p7 (BLOCKER) down two, and p1 (LOW) up one**. It is a one-function fix in `to_dgii_error` with a real parity consequence (the repo's headline invariant) but no fiscal or security consequence.                                            |
| R-06 (`F-REL-06`, `F-APPSEC-05`)                       | HIGH / MEDIUM                          | **HIGH**        | Overrode **p5b (MEDIUM), upward**. A crash out of a `Result`-only API is a contract break, and the "`set()` fails after DGII accepted" row loses the only handle to a delivered document.                                                                    |
| R-31 (`F-TEST-01` and seven others)                    | HIGH / MEDIUM / LOW                    | **MEDIUM**      | Overrode **p2 (HIGH), downward** on `F-TEST-01`. The `xmllint` parser never matches real stderr, so `SchemaViolation.path` is always empty — a diagnostics defect. Its severity is contained by R-20, which makes the whole validation gate unusable anyway. |
| R-32 (`F-TEST-02`)                                     | HIGH                                   | **MEDIUM**      | Overrode **p2 (HIGH), downward**. There is no current defect; a future multipart regression fails **loudly** (DGII rejects the request), not silently. Missing test ≠ present risk.                                                                     |
| R-33 (`F-TEST-13`, `F-TEST-15`)                        | MEDIUM / LOW                           | **MEDIUM**      | No override; took the higher grade because the three-way schema triplication has no gate at all (see *Coverage* — verified by direct comparison).                                                                                                        |

### Rejected framing: "XXE" on `F-APPSEC-08`

p5's verdict states "there is no XXE / entity-expansion / external-DTD path in either package"; p5b
files `F-APPSEC-08` as CWE-611 (XXE) / CWE-776 (entity expansion), MEDIUM. **On the evidence the two
reviewers themselves produced, there is no conflict on external entities and no conflict on DoS:**
p5 measured `SYSTEM "file:///etc/passwd"` refused in Python even with `load_dtd=True`, and p5b's own
reproduction line reads "External `SYSTEM` entities were **refused** in this build". Billion-laughs
is bounded by libxml2's amplification guard on the installed 2.14.x. **I therefore reject the XXE
label and the DoS label, and neither enters the register.**

The residual risk is real but different, and I record it as R-17 (MEDIUM): Python expands *internal*
entities and silently drops the `DOCTYPE`, so the bytes signed are not the bytes reviewed; TS refuses
the same document. That is a **sign-what-you-see and parity** defect, not an XXE. p5's headline
sentence conflates "no external entity resolution" with "no entity expansion" and should be
corrected in that report before it is used to reassure anyone.

### Grades I left alone, and why that matters

Twenty-three findings carried a single grade and it survived scrutiny. Two of them (R-20's E31 gate,
R-21's broken E32→RFCE conversion) are graded HIGH by a single reviewer each and I confirmed both,
because both are reached by **documented, mandatory flows** rather than by edge cases. I mention this
because an adjudicator who only ever moves grades is not adjudicating — most of this board's grading
was sound.

---

## Shipped vs latent

**Answer: twenty of the twenty HIGH-or-worse risks are SHIPPED. There is no latent behavioural
defect anywhere in this review, and one risk class (R-34, R-36) is not in the artifacts at all.**

The evidence is a three-line `git` check, not an inference:

| Check                                                       | Result                                    |
| ----------------------------------------------------------- | ----------------------------------------- |
| `git diff typescript-v0.6.1 HEAD -- packages/typescript/src` | empty — TS `0.6.1` source **is** `main`   |
| `git diff python-v0.7.2 HEAD -- packages/python/src`          | empty — PY `0.7.2` source **is** `main`   |
| `git log python-v0.7.2..HEAD`                                 | 2 commits: docs + marketing-version chore |
| `.release-please-manifest.json`                               | `typescript: 0.6.1`, `python: 0.7.2`      |
| `packages/*/package.json|pyproject.toml` on `main`              | `0.6.1` / `0.7.2` — matches the manifest  |

So the board's findings are not "defects waiting for the next release". They are on npm and PyPI
now, and every issuer who has adopted either package is exposed today.

### Shipped, release-blocking, and advisory-grade (fiscal integrity)

These four make a caller believe a legally binding document was delivered when it was not, or create
a duplicate legal document. They map to CWE-354 (integrity check not validated), CWE-697 (incorrect
comparison) and CWE-362 (race). **Disclosure obligation: a GitHub Security Advisory listing both the
npm and the PyPI package, published after the patched versions are on the registries.**

| Risk  | Packages                       | What a user on the current version experiences                                                                 | Obligation                                                                                     |
| ----- | ------------------------------ | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| R-01  | TS `0.6.1` only                | A 200 with an empty/HTML/malformed body is a delivered `Ok`; the marker is deleted, so a retry loop re-sends forever | Advisory + **TS patch ≥ `0.6.2`**. PY is already correct — say so in the advisory, it narrows the blast radius. |
| R-02  | TS `0.6.1` **and** PY `0.7.2`  | Second and third destinations return the first destination's cached `Ok` with **zero** transmission            | Advisory + patch in **both** artifacts                                                          |
| R-03  | TS `0.6.1` **and** PY `0.7.2` (PY far worse) | Two threads (PY) or two instances sharing a store (both) transmit the same e-CF twice, both `Ok` | Advisory + patch in **both**                                                                   |
| R-04  | TS `0.6.1` **and** PY `0.7.2`  | One read timeout puts 3 copies at DGII and then clears the lock; the caller's retry adds more                   | Advisory + patch in **both**                                                                    |

### Shipped, release-blocking, patch-grade (correctness; no advisory needed)

| Risk  | Packages            | Obligation                                                                                                                              |
| ----- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| R-05  | both                | Patch — but **only** with dual-read landing on both sides in the same window (see the sequencing rule below)                              |
| R-06  | both                | Patch                                                                                                                                   |
| R-07  | both                | Patch (adds a `clear` API → prefer patch as an additive method; PY minor if the Protocol changes)                                          |
| R-09  | both                | Patch — this is also a **doc correction** ("3 attempts" is 4 in TS today)                                                                |
| R-10  | PY `0.7.2`          | Patch — throughput bug with a measurable repro; no advisory                                                                              |
| R-11  | PY `0.7.2`          | Patch — and correct the changelog claim that `timeout_s` is enforced                                                                     |
| R-12  | both                | Patch — and note it in the advisory above as a *contributing* factor to R-04, since a slow parse manufactures the timeouts that cause duplicates |
| R-20  | both                | Patch: make "schema unavailable" a warning instead of a hard `Err` (a one-line behaviour change restores E31 sendability)                 |
| R-21  | TS `0.6.1` (vs PY)  | Patch — the E32-below-threshold path is currently a dead end                                                                             |
| R-22  | both                | Minor: a preflight that newly rejects a send is a behaviour change users must be told about in the changelog                             |

### Shipped, security-adjacent but not fiscal (advisory-grade on their own)

| Risk | Packages                          | Obligation                                                                                                              |
| ---- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| R-14 | both                              | Advisory + patch. The fix (host allowlist) is a **behaviour-tightening change** — users passing a legitimate custom peer must get an explicit opt-in, documented in the same release |
| R-15 | TS `0.6.1`                        | Advisory + patch (`redirect: 'error'`, one line)                                                                        |
| R-16 | PY CLI + both doc sets            | Advisory + patch + **a docs correction**, because SECURITY.md's own guidance is undermined by the CLI printing the token  |

### Shipped, capability gap (no advisory)

R-28 (no instrumentation seam) and R-19/R-23/R-24/R-25/R-26/R-27/R-29/R-30/R-31/R-32/R-33/R-35/R-37
ship as-is and are fixed on a normal cadence. R-28 is additive (a new optional option) → **minor**,
not patch.

### Not shipped at all — and this is the part that predicts recurrence

| Risk | Where it lives | Why it is absent from the artifacts |
| ---- | -------------- | --------------------------------------------------------------------------------------------------- |
| R-34 | `.github/workflows/`, `mise.toml` | A missing CI gate. Nothing in the `.tgz`/`.whl` changes because of it — but it is the **mechanism** that let R-01…R-12 ship as a *set* rather than as isolated bugs. |
| R-36 | the repository's history | `git shortlog -sn` is `160 Deuri Vasquez`, then bots. Not a code defect; the reason a second reader never caught the marker-format divergence. |
| R-35 | `vitest.config.ts`, `pyproject.toml` | `mise run ci` → `mise run test` can transmit **live**; the risk is to the maintainer's own credentials and a single-use DGII sequence, not to a user |

### Precise release mechanics the maintainer will hit

1. **Version ownership.** release-please owns versions and changelogs; the fixes must land as `fix:`
   commits so it produces `0.6.2` / `0.7.3`, and `feat:` for R-28. Never hand-edit a version.
2. **R-03 changes a public Protocol.** Adding a *required* `setIfAbsent`/`set_if_absent` to
   `IdempotencyStore` breaks every user-supplied store at type-check time (structural typing). Ship it
   as an **optional** method with a documented, loudly-warned check-then-act fallback, so it stays a
   patch; promoting it to required is a separate minor release.
3. **R-05 has a mixed-version hazard created by independent versioning.** If TS ships the new marker
   format first, a Python worker still on `0.7.3` reads it as a cached success — the same bug,
   reversed. Sequencing rule: **dual-read ships first in both packages (that is safe in any order),
   the writer switch ships only after both readers accept both formats.** This is one of the few places
   where independent per-package versioning actively works against a safe change.
4. **SECURITY.md says "latest version only".** The advisory must therefore name the minimum safe
   versions explicitly, and accept that every earlier version stays broken by policy.
5. **Two registries, one advisory.** Publish after both artifacts are live; OIDC trusted publishing
   means there is no long-lived token to revoke, so the only coordination is release ordering.

## Fix risk and sequencing

A fix for a fiscal-integrity bug can itself create fiscal-integrity bugs. I graded every proposed fix
on that basis, not on how good the intended outcome is.

### Fix risk by class

| Fix class | Grade | Why |
| --- | --- | --- |
| **Signing path** — R-17 (PY parser hardening), R-19's `json2xml` escaping | **HIGHEST** | These change the bytes that enter canonicalization. Both suites' unit tests **recompute the same code path**, so a broken digest passes CI green and only `libxmlsec1` disagrees. A mistake here produces documents DGII may accept while no independent tool can ever reproduce the digest. R-17 also changes the signed output for any document carrying internal entities — semantically a fix, operationally a silent output change on the most safety-critical path in the repo. |
| **Retry predicate** — R-04 + R-09 | **HIGHEST (behavioural)** | The task brief's warning is right and understated: this is the fix most likely to *create* the defect it removes. Widen the predicate and you get more duplicate e-NCFs; narrow it and transient blips become permanent failures whose only recourse is `reconcileSubmission`. It also spans two unrelated transport stacks (cockatiel + `fetch` vs `httpx2` + `pybreaker`) whose error taxonomies already disagree (R-09). |
| **Idempotency-marker wire format** — R-05 | **HIGH** | A silent behaviour change across a shared store, and independent per-package versioning means the writer can change on one side alone. Getting it wrong reproduces R-05 in the opposite direction: pending read as delivered, filing lost, caller told `Ok`. Requires dual-read on both sides plus a shared fixture before any writer moves. |
| **Public API / semver** — R-03 (`IdempotencyStore`), R-26 (`Signature` raise to `Err`), R-27 (`now` units) | **HIGH** | R-03 breaks every user-supplied store at type-check time if the new method is required. R-26 and R-27 are silent semantic breaks under an unchanged name — the worst kind. Additive fixes (R-07 `clear`, R-28 telemetry option) are only **MEDIUM**. |
| **Cache-key inputs** — R-02 (destination), R-12 (regex rewrite) | **HIGH, and under-appreciated by the board** | Both change what the key is computed *from*. A new key format makes every existing delivered entry **unreachable**, and a miss on this store does not mean "safe": `_submit_idempotent` transmits on a miss, so the first call after upgrade **re-sends documents that were already accepted**. The fix must carry a key version prefix and an upgrade note, or it manufactures duplicates on day one. |
| **Concurrency primitive** — R-10 (pybreaker restructure) | **HIGH** | Rerouting the call out from under pybreaker's lock risks leaving the breaker no longer counting failures, at which point retries hammer DGII during an outage. Needs a load test asserting both peak in-flight **and** that the breaker still opens. |
| **Behaviour tightening** — R-14 (host allowlist), R-22 (cert preflight) | **MEDIUM–HIGH** | Each can reject a call that succeeded yesterday. Legitimate, but only with an explicit opt-out and a changelog line. R-20 moves in the safe direction (a hard `Err` becomes a warning). |
| **Strict decoding** — R-01, R-25 | **MEDIUM** | Isolated, and fail-safe in the right direction: a 200 that cannot be decoded becomes `Err` **and keeps the lock**, so the worst case is a loud failure rather than a lost filing. |
| **Test and process gates** — R-31 … R-35 | **LOW** | Cannot corrupt anything at runtime. Their value is precisely that they are boring. |

### Dependency-ordered plan

Seven cohorts. The order is not a preference — each cohort supplies a capability the next one needs in
order to be *verifiable*.

**Cohort 0 — Safety net. Land first, this week, no runtime behaviour change.**
`R-34` parity gate, then `R-35` test isolation, `R-33` schema-triplication diff, `R-32` wire-contract
test, `R-31` real-`xmllint` test. Rationale: every later cohort must land in **two hand-written
codebases**. Without the gate you are performing seven dual-package changes blind.

**Cohort 1 — Observability. Additive; ships as a minor, in parallel with design of Cohort 2.**
`R-29` (PY error identity), then `R-28` (telemetry seam, `feat:`), then `R-30` (taxonomy, attempt record,
`mensajes`). Rationale: duplicate suppression cannot be proven in production without seeing attempts and
idempotency outcomes. Landing Cohort 2 without this makes the fix unverifiable outside tests.

**Cohort 2 — Idempotency core. One release window per package; strict internal ordering:**
1. `R-06` store errors into the `Result` — prerequisite; every later step adds a failure path.
2. `R-04` `maybeDelivered` classification (consumes R-06's error channel).
3. `R-09` attempt budget and predicate classes — same surface as R-04; splitting them ships a predicate
   that contradicts the classifier.
4. `R-01` + `R-25` strict TS decoding — **same seam as R-04**. If R-01 lands first, its new `VALIDATION`
   error is classified as ambiguous and retried, which is worse than today.
5. `R-03` atomic claim + PY single-flight (depends on R-06 so a store failure cannot crash a caller mid-claim).
6. `R-05` dual-read of both marker formats — **reader only**.
7. `R-07` public `clear`/`reset` and widen `cleared` to `Rechazado` (needs the format settled).

*Must-land-together sets:* {R-06, R-04, R-09, R-01, R-25} is one atomic change. {R-03} may follow by one
release. {R-01, R-25} and {R-17, R-19} are each indivisible for the reasons above. R-05's writer switch is
a separate, later release, after both readers are proven.

**Cohort 3 — Key space. A data migration, not just a code change.**
`R-02` (destination in the key, with a key-version prefix) **together with** `R-12` (parse rewrite), since
both alter key inputs. Required alongside: an upgrade note (clear or re-key the idempotency store) and,
ideally, reconcile-before-send for one release.

**Cohort 4 — Egress hardening.** `R-15` first (one line, no user impact), `R-16` (CLI + docs), `R-18`
(documentation), `R-14` last (allowlist + explicit opt-in, because it can break honest users).

**Cohort 5 — Availability.** `R-11` (total deadline), `R-13`, then `R-10` (breaker restructure, load-tested).

**Cohort 6 — Domain correctness.** `R-20` (restores E31 sendability — highest user value, smallest diff),
`R-21`, `R-22`, `R-23`, `R-24`, `R-26`, `R-27`, `R-08`, `R-37`.

**Cohort 7 — Signing-adjacent. Last, and only with the XMLDSig gate as the acceptance test.**
`R-17` and R-19's transformer escaping. Acceptance is **not** "unit tests pass"; it is
`mise run verify-signing-typescript` plus the Python `xmlsec` script green, plus a new cross-package fixture
asserting both SDKs produce the **same `<DigestValue>`** for a `DOCTYPE`-bearing document (today they
disagree; after the fix both must refuse it).

### Fixes that need human sign-off before implementation

Not because they are risky to type, but because each makes a product decision an agent should not make
alone.

| Fix | The decision a human must make |
| --- | --- |
| `R-34` parity gate | What "behaviourally identical" means as an executable table, and whether a one-package PR is *blocked* or merely *warned*. |
| `R-04` + `R-09` | Which transport failures count as "maybe delivered". This is fiscal policy: it decides when a caller is forbidden from retrying. |
| `R-03` | Whether `setIfAbsent` is required (semver minor) or optional-with-warning (patch). |
| `R-05` | Whether a mixed-runtime fleet on one store is a supported deployment at all. If not, the fix is documentation, not code. |
| `R-02` | How to treat existing store entries at upgrade — clear, re-key, or accept a possible duplicate re-send. |
| `R-14` | Who is allowed to receive a bearer token. An allowlist is security policy, not a code detail. |
| `R-17` + `R-19` | Whether a `DOCTYPE`-bearing document is refused outright (TS behaviour) — an output change on the signing path. |
| `R-10` | Whether to keep pybreaker at all, versus a small in-repo breaker that does not hold a lock across I/O. |
| `R-36` | Naming a second maintainer for the invariants list. Only the human can do this. |

---

## Cross-package coupling and process risk

### Risk that a fix lands in one package only: HIGH — and it is the already-observed failure mode

This is not speculative. **Sixteen findings across the six reports are, in their own words, "the packages
disagree"**: R-01 (TS wrong, PY right), R-03 (PY races, TS coalesces), R-05 (different markers), R-06 (TS
rejects, PY raises), R-10 (PY peak in-flight 1 vs TS 4), R-11 (TS total deadline vs PY per-phase), R-17 (TS
refuses `DOCTYPE`, PY expands it), R-18 (PY honours proxies, TS ignores), R-25 (TS casts, PY validates),
R-26 (TS `Err`, PY raises), R-27 (ms vs s and six more), R-29/R-30 (TS attaches `resource`/`method`/
`baseURL`, PY attaches none). One or two would be bad luck. Sixteen is a process with no gate.

**Verified: there is no cross-package behavioural parity gate anywhere.**

- `.github/workflows/` holds `docs.yml`, `integration.yml`, `labels.yml`, `pre-commit.yml`, `python.yml`,
  `release-please.yml`, `typescript.yml`. A grep for `parity|drift|identical|cross-package` returns exactly
  one hit — `docs.yml:38`, **`Check en/es translation parity`**, which verifies the English and Spanish doc
  trees have the same file list. The documentation is gated. The **behaviour is not.**
- `mise.toml` has 18 tasks and none compares the packages; `mise run ci` is lint + test + build, run per
  package.
- `scripts/` contains one file, `check_commit_msg.sh`.
- The only substitute in existence is **hand-maintained parity matrices kept equal by a human**, visible as
  comment prose in both suites (`packages/typescript/test/reconciliation.test.ts:705`,
  `packages/python/tests/test_reconciliation.py:19` — "`R…` ids are the parity-matrix rows"). That is a
  discipline, not a gate, and the sixteen divergences above are what it produced.

**What would detect it — and it is genuinely cheap.** The repo already has both hard parts: a shared,
byte-sensitive fixture tree (`examples/fixtures/`) used by both suites, and a proven technique for
cross-language agreement (the signing work already proves both SDKs produce the *same* `<DigestValue>`).
The gate is a shared JSON conformance table — one row per input, covering expected wire bytes, digest,
reception route, idempotency key, error code and attempt count — executed by both suites, plus a CI job
that fails when a PR touches `packages/{typescript,python}/src/` asymmetrically. That is **R-34**; it needs
no new dependency and it retires the entire recurrence class.

### Process risks

| Risk | Grade | Assessment |
| --- | --- | --- |
| **Bus factor** (R-36) | **HIGH** | `git shortlog -sn --all` gives `160 Deuri Vasquez`, `18 github-actions[bot]`, `8 dependabot[bot]`. One human authors both implementations, both changelogs, and the only judgement on canonicalization and idempotency — the two areas where this review found every serious defect. With no second reader on the invariants, the divergences above were never *reviewable*, only observable after the fact. |
| **Semantic drift** | **HIGH** | Independent release-please versioning is right for the registries but has a real cost: the packages sit at `0.6.1` and `0.7.2` with **different** defensive behaviour while `AGENTS.md` and the architecture doc promise identity. A user who reads "behaviourally identical" and switches packages inherits a different set of bugs. R-05's reader-before-writer rule is the concrete case where independent versioning endangers a fix. |
| **DGII spec changes** | **MEDIUM, rising** | Three published DGII schemas do not compile and are quarantined under `upstream-invalid/`; that workaround converts a spec problem into a **silent capability gap** — R-20, where E31 (the crédito-fiscal document, and this repo's own flagship fixture) cannot be validated at all. Nothing notices a new DGII schema revision. Not an immediate outage, but it erodes the one thing that distinguishes this SDK from `curl`. |
| **Real-user certificate expiry** (R-22) | **HIGH** | Certainty over a 12-month horizon against a total issuance outage, with no preflight in either package and no signal before signing. `SECURITY.md` already tells users to alert at 60/30/7 days, and then the SDK offers no hook to do it from. The risk most likely to produce the first real production incident, and cheap to close. |
| **Accidental live submission from the default test command** (R-35) | **MEDIUM** | `mise run ci` calls `mise run test`, which runs the live integration suite for anyone who exported `DGII_*` for `examples/`, consuming a single-use authorized sequence. CI is unaffected, which is exactly why it will surprise someone locally. |

---

## Top 7 risks this week

Ranked by impact x likelihood / cost to mitigate. The order deliberately puts a two-hour process change
first and the most dramatic-looking defect fourth.

1. **R-34 — no cross-package parity gate (HIGH, ~2 hours).** Every other item here must land twice. Do
   this first or spend the quarter re-introducing R-01 … R-12 in the other package.
2. **R-01 — TS reports `Ok` for a 2xx it cannot parse (BLOCKER, ~1 file).** A lost tax filing reported as
   delivered, plus a destroyed lock that makes retries re-send forever. The best impact-to-diff ratio in
   the report.
3. **R-02 — idempotency key omits the destination (BLOCKER).** Buyer B and DGII are both silently skipped
   while the caller logs three `Ok`s, through the documented B2B flow.
4. **R-04 + R-09 — retrying a POST DGII may already have accepted (BLOCKER).** 3–5 copies of one e-NCF
   from a single caller intent. The fix whose *implementation* needs the most care.
5. **R-03 — no atomic claim, no Python single-flight (BLOCKER).** Two threads in Python, or two instances
   in either language, duplicate a legal document.
6. **R-22 — no certificate preflight or signal (HIGH).** Not reproducible on demand, but the first thing
   an issuer hits, and the cheapest HIGH item here to close.
7. **R-16 + R-14 + R-15 — bearer-token egress (HIGH).** Three vectors, one asset, and `SECURITY.md`
   already promises the 48-hour process these should enter through.

*Honourable mention:* **R-35** (make the live suite opt-in) is a ten-minute change that prevents burning a
DGII authorization sequence while working on everything above.

---

## Coverage

### Reports consumed

| Report | Verdict as filed | Used for |
| --- | --- | --- |
| `p1-dgii-domain.md` | NOT ALIGNED (1 BLOCKER, 3 HIGH) | R-01, R-02, R-20, R-21, R-22, R-23, R-24, R-25, R-27, R-29 |
| `p2-testing.md` | ADEQUATE WITH GAPS (3 HIGH) | R-03, R-17, R-31, R-32, R-33, R-34, R-35 |
| `p3-reliability.md` | UNRELIABLE (5 BLOCKER, 5 HIGH) | the backbone of families A and B: R-01 … R-13, R-30 |
| `p5-security.md` | PASS WITH FINDINGS (1 HIGH) | R-01, R-14, R-15, R-16, R-17, R-18, R-19 |
| `p5b-appsec.md` | FAIL (3 HIGH, 9 MEDIUM, 6 LOW) | R-02, R-03, R-12, R-14, R-15, R-22, R-25, R-26, R-37 |
| `p7-observability.md` | BLACK BOX (2 BLOCKER, 6 HIGH) | R-16, R-22, R-28, R-29, R-30 |

**Missing: `p4`, `p6`, `p8` do not exist** in `project-tasks/review-board/reports/`. I could not read them
and I have not guessed at their content. Consequences: **no entry in this register rests on those
dimensions.** Specifically, nothing here assesses **performance/latency under real DGII load**, a
**fiscal record-keeping / data-retention** dimension (what an issuer must retain and for how long, and
whether the SDK's 24 h idempotency TTL is compatible with it), or the **documentation contract** beyond the
specific broken promises already cited (`F-DGII-13`, R-27).

### Verified by me, not taken on trust

| Claim | Method | Result |
| --- | --- | --- |
| Findings are in the published artifacts | `git diff <tag> HEAD` on both `src/` trees, plus tags and manifest | **Identical — everything is shipped** |
| `main` matches the release manifest | `package.json`, `pyproject.toml` | `0.6.1` / `0.7.2` — yes |
| No cross-package parity gate | grep of all 7 workflows, `mise.toml`, `scripts/` | Only `docs.yml:38` en/es **docs** parity — confirmed absent |
| Schema triplication state | per-file `sha256sum` across all three trees | 14/14 XSDs byte-identical; only `README.md` differs; 3 extras are the quarantine dir. **In sync today, ungated** (R-33) |
| Bus factor | `git shortlog -sn --all` | 160 / 18 / 8 — one human |
| Disclosure channel exists | read `SECURITY.md` | Present: private reporting, 48 h ack, "latest version only", advisory + credit |
| TS trusts any 2xx | read `http.ts:202-223` | `return ok(data as T)` on `response.ok` — confirmed |
| Marker formats differ | read `client.ts:141` and `client.py:63` | `{ pending: true }` vs `{ "__pending__": True }` — confirmed |
| TS follows redirects | read `http.ts:281-285` | `fetchImpl(url, {...})` with no `redirect` option — confirmed |

### Limits of this review

- **I did not re-run any reviewer's repro.** I trusted "verified by running" claims, but I read the code
  for every citation I cite myself, and I state that distinction above. Two reproductions I would not
  accept without a re-run if they are used for an advisory: the exact attempt counts in R-09 (they depend
  on cockatiel's internal loop index) and the 119.8 s parse figure in R-12 (machine-dependent).
- **Two conflicts I could not settle from the reports alone** and had to adjudicate on the evidence
  presented: the XXE framing (rejected — see *Severity reconciliation*), and whether a mixed-runtime fleet
  is a supported deployment (left as an explicit human decision, R-05 sign-off row).
- **I did not review signing.** No reviewer proposed a signing change, and the board's own evidence (matching
  `<DigestValue>` across both SDKs, green XMLDSig gates) says the signing path is the healthiest part of the
  repo. My only concern there is prospective: R-17 and R-19 are the fixes most capable of damaging it.

---

## Needs follow-up

**For the maintainer (blocking a release):**

1. Decide the four human-sign-off items in one sitting — R-04/R-09's `maybeDelivered` policy, R-03's semver
   mode, R-05's supported-deployment question, and R-02's store migration. They are coupled and cheap to
   settle together.
2. Open the advisory track. `SECURITY.md` promises a 48-hour acknowledgement; the fiscal-integrity items
   (R-01 … R-04) and the egress trio (R-14/R-15/R-16) map onto CWE-354/697/362/918/601/522 and belong in one
   advisory listing both registry packages.
3. Confirm the exact published version history, so the advisory can name the first affected version. I
   verified the *current* release contains every finding but did not audit older releases; R-02's severity
   materially worsened in `0.6.0`/`0.7.0` when direct B2B delivery (`#109`) introduced the multi-destination
   flow, and the advisory should say so.

**For the board:**

4. `p4`, `p6`, `p8` are missing. Until the performance/timeliness, data-retention and documentation
   dimensions exist, this register cannot claim to cover release risk completely, and I do not.
5. `p5` should correct the "no entity-expansion path" sentence in its verdict (see *Severity
   reconciliation*); `p5b` should drop the CWE-611 tag from `F-APPSEC-08`. The underlying finding is real and
   MEDIUM; the label is not.
6. `p7` owes the board a distinction between "the SDK cannot be operated" (BLOCKER, in its framing) and
   "the SDK is unoperable but correct". Two of its findings lose a grade under the second reading, and that
   is not a criticism of the evidence — the evidence was excellent.

**Cheap wins worth scheduling above their severity:**

7. **R-34** and **R-35**: hours of work, they retire the recurrence class and protect a DGII sequence.
8. **R-20**: making "schema unavailable" a warning restores E31 sendability — the flagship document type —
   for a one-line behaviour change.
9. **R-15**: `redirect: 'error'` is a one-line fix to a HIGH finding.

**Open question I could not answer from the reports:** whether any real issuer is running TypeScript and
Python against a *shared* idempotency store today. It decides whether R-05 is HIGH or BLOCKER, and the
reports contain no deployment evidence either way — only that the docs recommend a Redis/Postgres store.

---
