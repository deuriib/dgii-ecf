# P11 — Final Gate (Reality Check)

| Field | Value |
| --- | --- |
| Pipeline | P11 Final gate |
| Agent | TestingRealityChecker — reality-check discipline, default NEEDS WORK |
| Repo | `/home/deuriib/projects/dgii-ecf` @ `main` `8b7879a` + uncommitted working tree (32 modified, 7 untracked) |
| Scope | The changes in this working tree only — **not** the whole product |
| Method | READ-ONLY on tracked files. Every gate re-run from scratch. The ledger is treated as a claim, never as evidence |
| Date | 2026-11-12 |
| Scratch | `/tmp/finalgate/` (probes `probe1.ts`, `probe2.py`, `probe2b.py`, `probe3.ts`, `probe4.ts`, `probe5.ts`, `negctl.py`, gate logs, out-of-tree parity copy) |

---

## Verdict

**NEEDS WORK** — for the changes in this working tree.

Not "NOT READY": I broke nothing, and every gate the ledger claimed is genuinely green. I re-ran all
six gate groups, and I mutation-tested the two gates that are supposed to be able to *fail* (XMLDSig,
parity). All three required behavioural probes passed on the real code paths.

Not "PRODUCTION READY": four independent reasons, all evidence-backed.

1. **The single highest-value fix in this tree has no regression test.** The destination-scoped
   idempotency key (`@<host>`, F-DGII-02 / F-REL-02 / F-APPSEC-04) is called from five sites in TS
   and five in Python, and is referenced by **zero tests in either package**. The one test in the
   whole workspace that mentions `buyer_host` asserts *rejection* on a zero-request path. I proved
   the behaviour works right now by probe — but a one-line revert of `destinationScope(buyerHost)`
   leaves both suites green and silently reintroduces the bug the ledger calls "a delivery to a
   buyer was answered from the DGII cache entry and never transmitted".
2. **The new parity gate cannot catch the bug it was written to catch.** Its own docstring cites
   "an idempotency marker written in two different shapes" as motivation; the check is
   `"__pending__" in source` — a substring test. I mutated the TS writer to emit `{pending: true}`
   and the gate still printed `parity: OK (15 checks)`. One of the 15 checks is decorative.
3. **Two ledger entries are only validated by a manual probe, not by the suite** (see #1). The
   ledger reports them as "Validated by Reliability (PASS)", which reads like coverage and is not.
4. **Four open BLOCKERs and two open human decisions remain** (F-RES-01/02/05/07, F-OBS-01/02,
   `buyerHost` trust model, money-as-float). The changes in this tree are compatible with those
   being open — but a release is not, and this tree is otherwise release-shaped (version-agnostic,
   docs built, parity wired into CI). See *Conditions*.

Honest quality rating for this diff: **B**. Safety-positive, correct, and verified where it was
verified — but shippable engineering requires the fix to be pinned by a test, and one of the two new
gates to actually work.

---

## Evidence

### 1. TypeScript unit — `cd packages/typescript && bun run test`

```
 Test Files  17 passed | 1 skipped (18)
      Tests  228 passed | 3 skipped (231)
   Duration  8.15s
EXIT=0
```

Claim was **228 passed, 3 skipped**. **MATCH.** (The skipped file is `test/integration`.)

### 2. Python unit — `cd packages/python && uv run python -m pytest tests`

```
sss..................................................................... [ 27%]
........................................................................ [ 54%]
........................................................................ [ 81%]
.................................................                        [100%]
262 passed, 3 skipped in 9.34s
EXIT=0
```

Claim was **262 passed, 3 skipped**. **MATCH.**

### 3. Lint

`cd packages/typescript && bun run lint`:

```
$ tsc --noEmit && prettier --check .
Checking formatting...
All matched files use Prettier code style!
EXIT=0
```

`cd packages/python && uv run ruff check . && uv run ruff format --check . && uv run mypy src`:

```
All checks passed!              RUFF_CHECK_EXIT=0
43 files already formatted      RUFF_FMT_EXIT=0
Success: no issues found in 18 source files   MYPY_EXIT=0
```

I also ran the repo-wide aggregate the ledger implies — `mise run lint` (prettier over the whole
repo + both packages): `EXIT=0`, `All matched files use Prettier code style!`.

**MATCH.**

### 4. Parity — `mise run parity`

```
[parity] $ uv run --no-project python scripts/check_parity.py
parity: OK (15 checks)
EXIT=0
```

Claim was **OK, 15 checks**. **MATCH** on the number. The gate's *quality* does not match its
description — see the mutation table below.

I decomposed the 15 checks from `scripts/check_parity.py` (the count is exact):
6 literal-map comparisons (Endpoint, SenderReceiverEndpoint, StatusEndpoint, BaseUrl, Environment,
StatusEnvironment), 1 error-code set, 4 resilience numbers, 1 idempotency TTL, 1 pending-marker,
1 consumption-summary threshold, 1 XSD byte-identity = 15.

**Mutation test of the parity gate** (out-of-tree copy at `/tmp/finalgate/paritycopy2`; baseline
verified green before any mutation, and green again after each revert):

| # | Mutation injected | Gate result | Caught? |
| --- | --- | --- | --- |
| M1 | TS `maxRetries: 3` → `4` (retry-budget drift) | `1 failure(s) across 15 checks — resilience.maxRetries (attempts): TypeScript 4 vs Python 3` | **YES** |
| M2 | TS pending marker writer → `{ pending: true }` | `parity: OK (15 checks)` | **NO** |
| M3 | one byte appended to one of the three vendored `anecf.xsd` copies | `schemas: anecf.xsd differs between copies` | **YES** |
| M4 | Python `VALIDATION = "VALIDATION"` → `VALIDATION_REMOVED` (same member name, different emitted code) | `parity: OK (15 checks)` | **NO — by design, names are compared, not values** |
| M5 | Python member renamed `VALIDATION` → `VALIDATION_RENAMED` | `DgiiErrorCode: validation exists in TypeScript only` + inverse | **YES** |

So: the gate is real and earns its keep for tables, retry budget, thresholds and schema bytes. Two of
its fifteen checks are weaker than advertised (M2, M4).

### 5. XMLDSig gates

```bash
export LD_LIBRARY_PATH=$HOME/.cache/dgii-tools/usr/lib/x86_64-linux-gnu
export PATH=$HOME/.cache/dgii-tools/usr/bin:$HOME/.cache/dgii-tools/bin:$PATH
export DGII_XMLSEC_BIN=$HOME/.cache/dgii-tools/bin/xmlsec1
```

`cd packages/typescript && bun run scripts/verify-signing.ts`:

```
xmlsec1 verification PASSED (invoice-31)
xmlsec1 verification PASSED (c14n-sensitive)
EXIT=0
```

`cd packages/python && uv run --with xmlsec python scripts/verify_signing.py`:

```
xmlsec verification PASSED
EXIT=0
```

**MATCH** — including the ledger's specific claim of `invoice-31 + c14n`.

**Negative control (the part the ledger does not show).** A gate that cannot fail is not a gate, so
I signed the fixture, verified it, tampered one business value inside the signed body, and re-ran
both verifiers (`/tmp/finalgate/negctl.py`):

```
A) pristine  -> xmlsec verify PASSED (expected)
B) tampered  -> correctly REJECTED (Signature is invalid.)
C) shim on signed.xml    -> PASS   (exit 0) OK
C) shim on tampered.xml  -> REJECT (exit 1) OK
```

Both the Python-path verifier and the `~/.cache/dgii-tools/bin/xmlsec1` shim used by the TypeScript
gate reject a tampered payload. **The XMLDSig evidence in the ledger is sound.**

Environment note, for honesty about what I actually exercised: `~/.cache/dgii-tools/usr/bin` and
`~/.cache/dgii-tools/usr/lib/x86_64-linux-gnu` **do not exist**; the only thing there is
`bin/xmlsec1` (a Python shim over libxmlsec1 via the `xmlsec` binding, run from
`~/.cache/dgii-tools/venv`). There is **no `xmllint` on this machine at all**. So `LD_LIBRARY_PATH`
is a no-op here, and `xmllint`-dependent paths (`validateDocument`, schema validation) were not
exercised by anything I ran.

### 6. Docs build — `mise run docs-build`

```
INFO -  mkdocs_static_i18n: Building 'en' documentation to directory: …/site
INFO -  mkdocs_static_i18n: Building 'es' documentation to directory: …/site/es
INFO -  Building documentation to directory: …/site
INFO -  Documentation built in 2.44 seconds
i18n sitemap: wrote site/es/sitemap.xml (11 URLs)
i18n search: wrote site/es/search/search_index.json (83 documents)
EXIT=0
```

`mkdocs build --strict` passes under the i18n plugin, and both per-locale projections are written
with non-trivial content (11 URLs, 83 documents). **MATCH.**

### 7. Behavioural spot-checks (probes, not diff-reading)

**Probe 1 — a submission is not retried, a query is** (`probe1.ts`, stub fetch, `maxRetries: 3`):

```
SUBMISSION 503 -> requests=1 isErr=true code=HTTP
  VERDICT submission-not-retried: PASS
QUERY 503 -> requests=3 isErr=true code=HTTP
  VERDICT query-retried (maxRetries=3 => >=2 attempts): PASS
SUBMISSION 200 -> requests=1 isOk=true
```

One call = one transmission on 503; the query path still spends its 3-attempt budget. Exactly the
invariant AGENTS.md states. **PASS.**

**Probe 2 — two concurrent Python submissions of one document** (`probe2.py`, same `ECF` instance,
thread A held inside the transport by an `Event` so B is guaranteed to overlap):

```
transmissions = 1   (must be exactly 1)
  A: is_ok=True code=- msg=-
  B: is_ok=True code=- msg=-
  VERDICT one-transmission-on-concurrent-submit: PASS
```

**PASS** — the per-key lock works; B is served the cached result instead of re-transmitting.

*Boundary the ledger omits* (`probe2b.py`, two separate `ECF` instances, same document, same
overlap):

```
two SEPARATE ECF instances -> transmissions = 2
```

The lock is **per-instance, per-process**. It protects a shared client, not a fleet. That is a fair
design for an SDK, but "two callers, one transmission" is only true for callers sharing an instance.

**Probe 3 — a TS `HttpClient` refuses a 307 without contacting the target** (`probe3.ts`, two real
loopback `node:http` servers and the **real global `fetch`**, so `redirect: 'manual'` is the thing
under test):

```
origin hits   = 1
target hits   = 0  (must be 0)
target auth   = []  (must be empty)
result        = isErr=true code=HTTP status=307
message       = DGII responded with a redirect (307); refusing to replay the request to another host
  VERDICT redirect-refused-and-not-followed: PASS
```

The DGII bearer token (`SECRET-DGII-BEARER`) never reached the redirect origin. **PASS** — this is
real replay protection, not a mock.

**Probe 4 — is the idempotency key really destination-scoped?** (`probe4.ts`; submit to DGII, then
to a buyer host, then to DGII again, same signed document):

```
1) DGII submit           -> ok=true sends=1
2) buyer-host submit     -> ok=true sends=1 (must be 1: not served from the DGII cache entry)
3) repeat DGII submit    -> ok=true sends=0 (must be 0: served from cache)
   urls: ["ecf.dgii.gov.do/TesteCF/recepcion/api/FacturasElectronicas",
          "buyer.example/fe/recepcion/api/ecf"]
  VERDICT destination-scoped-idempotency: PASS
```

The fix **works**. (My first run of this probe reported FAIL — that was my probe passing `buyerHost`
as an options object instead of the third positional argument. I fixed the probe, not the code, and
re-ran. Recorded here because a probe that reports a failure it caused itself is exactly the kind of
noise a reality check exists to filter out.) **PASS — behaviour, zero test coverage.**

**Probe 5 — ambiguous failure keeps the marker, and in the shared wire shape** (`probe5.ts`,
transport failure with no HTTP status):

```
result     = isErr=true code=IDEMPOTENCY
message    = The submission outcome is unknown: it may have reached DGII; the pending marker was
             kept — call reconcileSubmission() before retrying
store size = 1
marker     = {"__pending__":true}
  VERDICT ambiguous-keeps-marker: PASS
  VERDICT wire-shape-{__pending__:true}: PASS
```

**PASS** — but note the TS suites never assert the *written* shape: `grep -rn "__pending__"
packages/typescript/test/` → **0 hits**; TS tests only cover *reading* the legacy `{pending: true}`
(a deliberate compatibility path, `client.test.ts:814`). So F-REL-04's write side is pinned in
Python only, and therefore unprotected by test on the TS side.

### 8. Extra gate not in the ledger (build)

`mise run build` — **EXIT=0**: tsup ESM/CJS + `.d.ts` success, `py_dgii_ecf-0.7.2` sdist + wheel
built. The tree compiles and packages.

### 9. Read-only discipline

`git status --porcelain` before and after is identical for tracked files (**32 modified, 7 untracked**,
the same lists) — I modified nothing. Running `mise run docs-build` and `mise run build` regenerated
`site/`, `dist/` and `__pycache__`, all of which `git check-ignore` reports as ignored
(`.gitignore:210:site/`, etc.). All scratch artefacts are under `/tmp/finalgate/`.

### 10. Not verified by me (stated, not implied)

I did not re-run: `axe-core` WCAG 2.0 AA (ledger claims 0 violations / 12 nodes), the Chromium
search behaviour on EN and ES pages (ledger claims broken → works), `gitleaks` / `mise run hooks`,
or the full `pre-commit run --all-files`. They are outside the six gates and three probes I was
asked to certify, and none of them changes the verdict above. The ledger's claims there are
**unverified**, not confirmed.

---

## What the ledger overstates or omits

**1. "Validated" is doing work it has not earned.** Two fixes are marked
`Validated by Reliability (PASS)` on the strength of a manual probe:

- **F-DGII-02 / F-REL-02 / F-APPSEC-04** (destination-scoped idempotency, `@<host>`) — `buyerHost`
  appears **0 times** in `packages/typescript/test/`; `buyer_host` appears **2 times** in
  `packages/python/tests/`, both inside `test_send_document_rejects_a_buyer_host_for_an_rfce`, which
  asserts `calls["n"] == 0`. It is a *rejection* test. There is no positive test of a buyer-host
  delivery in either SDK, in either language. The most safety-critical fix in the tree is
  unprotected.
- **F-REL-04** (one pending-marker wire shape) — the *write* side is asserted in Python
  (`test_client.py:231,547`) and nowhere in TypeScript. A TS regression to `{pending: true}` would
  be absorbed by the legacy-read path on the Python side and caught by no test on either side.

**2. The new parity gate is overstated in its own docstring.** "the idempotency threshold and
pending-marker shape" — the shape is not compared (M2 above: gate green while the writer emitted a
different shape). "every literal table both packages must agree on … error codes" — the error-code
check compares member *names*; changing the emitted value on one side is invisible (M4). R-34 is
still worth having (M1 and M3 are genuinely valuable), but "parity 15 checks" should read "13
substantive checks plus a substring test and a name-set test". Its being wired into `mise run ci`,
the pre-commit hook and an `always_run` entry is correctly reported, and I confirmed all three.

**3. The Python concurrency fix is per-instance, and the ledger does not say so.** "Python per-key
submission lock (parity with TS `inFlight`) — two callers, one transmission" is true only for callers
that share an `ECF` instance. Two instances of the same document transmit twice (`probe2b.py`). Not
a defect — an SDK cannot hold a cross-process lock — but the claim invites a reader to over-trust it.

**4. Open BLOCKERs and the honest boundary — is this safe to ship?**

The ledger is candid that the audit left BLOCKERs open, and I credit it for that; P4/P7/P9 are marked
open, and the two human decisions are correctly escalated. What it does not do is state the
consequence for this diff. So, plainly:

*Safe to ship as a code change, per what I measured.* Nothing in this tree touches the breaker, the
bulkhead, httpx2 client lifecycle or the instrumentation seam. Every change here is
safety-**positive** and independently verified: submissions no longer retried (kills the proven
duplicate-transmission path), redirects refused (kills token replay to a third host), the
catastrophic-backtracking regex replaced by a linear scan, secrets redacted from
`P12ReaderData`/`AuthToken` reprs and TS `#passphrase`, destination-scoped idempotency, and docs
fixes. Regression risk is contained: 228 + 262 tests, both XMLDSig gates with a working negative
control, docs `--strict`, and a build that packages.

*Not safe to release, given those open items — and this is the sharp edge:*

- **F-RES-01 (shared breaker/bulkhead across DGII, `fc`, `statusecf` and every buyer host) combined
  with this tree's `retry: false` on submissions is a new availability failure mode.** Pre-change, a
  retry could paper over a transient rejection. Post-change, one sick buyer host can open the shared
  breaker and a legitimate `sendElectronicDocument` fails fast **without ever being transmitted** —
  no duplicate (good) but no delivery either, and the pending marker is cleared by the definitive
  status, so the caller is told "retry". For a fiscal document that is an outage, and it is a
  *regression in blast radius* introduced by a change that is individually correct. This pairing is
  the single most important thing in this report.
- **F-RES-05/07 (Python serialises all traffic on pybreaker's lock; no bulkhead, no shedding).**
  Python honours "one transmission per call" while serialising every call — under load, throughput
  collapses and timeouts accrue against the same shared breaker. Shipping Python as-is means the
  no-retry guarantee is preserved at the cost of a queue.
- **F-OBS-01/02 (no instrumentation seam reachable from `ECF`; Python errors carry no endpoint
  identity).** With submissions no longer retried, "did the e-CF reach DGII?" is now a question the
  SDK answers only via `reconcileSubmission`. An operator with no observability hook cannot tell an
  ambiguous submission from a breaker-open rejection from a slow host. The SDK got stricter about
  duplicates at the exact moment it remained blind. Do not release to anyone who cannot observe it.
- **`buyerHost` trust model (F-APPSEC-01 / F-SEC-02, needs Deuri Vasquez).** The destination-scoped
  key makes buyer-host delivery *correct*; it also makes it *easier to reach*. The SDK still sends
  the DGII bearer token to whatever URL the caller passes, and the documented way to obtain that URL
  is the DGII directory. **Must not ship** to a caller that resolves `buyerHost` from an untrusted
  source until option (a) `https:`-only, (b) token withheld unless opted in, or (c) explicit
  allowlist is chosen. The `@<host>` fix does not mitigate this; it amplifies it.
- **Money as float (F-DGII-06 / F-READ-04, needs a version decision).** Unchanged by this tree, and
  still a direct violation of `AGENTS.md` ("Money is never floating point … a rounding drift
  corrupts the signed digest"). **Must not ship** as a VAT-compliant release until `montoTotal` /
  `totalITBIS` are `string`/`Decimal`. This is a breaking change and needs a version decision, which
  is why it is *not* a defect of this diff — but it is a reason the tree cannot be called
  production-ready.
- **F-DGII-03/04 (`validateBeforeSend` refuses E31; `convertECF32ToRFCE` throws in TS and emits an
  invalid RFCE).** Both are HIGH and unresolved. A caller who reaches for E31 or the E32→RFCE
  conversion hits a wrong-or-throwing path while every gate stays green. **Must not ship.**

**5. What the ledger gets right, so the record is fair.** The gate numbers are exact (228/262,
`15 checks`, both XMLDSig PASS with the same two cases, docs artifacts named correctly). The
`xmlsec1` sandbox note is accurate as far as the shim goes, and correctly labelled as a workaround
outside the repo rather than a repo change. The open-BLOCKER table does not pretend the product is
clean. This is a review board that mostly told the truth; the problem is that two "validated" labels
mean "someone ran a probe once", and one new gate does not do what its docstring says.

---

## Conditions

Shortest set that must be true before a release, in order.

1. **Pin the destination-scoped idempotency in both suites.** One test per package: submit the same
   document to DGII, then with `buyerHost` — assert **two** transmissions; then repeat the DGII
   submit — assert **zero**. Without this the tree's best fix is one revert away from silent
   regression, in the one place where a regression double-issues a fiscal document.
2. **Pin the pending-marker write side in TypeScript.** Assert the store holds exactly
   `{"__pending__":true}` after an ambiguous (no-HTTP-status) failure, and that the key survives.
3. **Make the parity marker check compare shapes, not substrings** (parse the written literal on both
   sides), and compare error-code *values* in addition to names. Until then, do not describe R-34 as
   pinning the marker shape.
4. **Fix F-RES-01 before the no-retry change reaches a real deployment** — per-host breakers, or at
   minimum exclude buyer hosts from the DGII breaker. Condition 4 exists because condition "no
   retries" is already shipped in this tree and turns a cross-host breaker trip into undelivered
   fiscal documents.
5. **Deuri Vasquez decides the `buyerHost` trust model** (`https:`-only / opt-in token / allowlist)
   before any release that advertises buyer-host delivery.
6. **Deuri Vasquez decides the money representation and its version bump**; implement
   `montoTotal`/`totalITBIS` as `string`/`Decimal` before any release sold as DGII-compliant.
7. **An observability seam reachable from `ECF`** (F-OBS-01/02) before operators are expected to
   reconcile ambiguous submissions in production.

Conditions 1–3 are this working tree's own unfinished work — small, and they are why the verdict is
NEEDS WORK rather than "ship it". Conditions 4–7 are the audit's open items; they gate the *release*,
not the merge.

---

### Evidence location

Gate logs and probes: `/tmp/finalgate/` (`ts-test.log`, `py-test.log`, `ts-lint.log`, `py-lint.log`,
`lint-all.log`, `parity.log`, `docs-build.log`, `xmldsig-ts.log`, `xmldsig-py.log`, `build.log`,
`probe1.ts`, `probe2.py`, `probe2b.py`, `probe3.ts`, `probe4.ts`, `probe5.ts`, `negctl.py`,
`paritycopy2/`). Reproducible as-is; nothing depends on state I left behind.

**Assessment**: TestingRealityChecker · **Re-assessment required**: after Conditions 1–3.
