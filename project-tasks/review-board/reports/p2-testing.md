# Testing Review

Scope: `packages/typescript` (`@deuriib/dgii-ecf`) and `packages/python` (`py-dgii-ecf`).
Dimension: **testing** — is what these SDKs can do actually proven, in both packages, at the
right levels?

Baseline taken as given (not re-measured): TS 212 passed / 3 skipped across 17 files, PY 244
passed / 3 skipped, lints green, both XMLDSig gates green against libxmlsec1 1.3.9.

Every claim below is either **verified by running** (probe or command included) or **verified by
reading** (`file:line` cited). Read-only: no repository file was modified; scratch files were
written under `/tmp`.

---

## Verdict

**ADEQUATE WITH GAPS**

The suites are genuinely good at what they choose to test. The reconciliation state machine is
proven case by case in both languages (`test/reconciliation.test.ts:284-1105` ↔
`tests/test_reconciliation.py:156-742`), reception routing and B2B gating are asserted with the
same table in both packages (`test/reception.test.ts:76-179` ↔ `tests/test_reception.py:82-169`),
and — critically — the signing tests are **not** self-consistent: each package pins at least one
digest computed outside its own code path (`test/signing.test.ts:68-71` pins `3Nh+cOuHkKl+…`,
`tests/test_signing.py:30` pins `+NKTZptYJLdy7jDJHPcsUrG1AtnnY7yP7yExeU+WmO8=`), and both gates
re-verify with libxmlsec1.

What keeps the verdict off STRONG:

1. The one place the TS suite talks to an external binary is a **fiction**: the `xmllint` tests run
   against fake shell scripts that emit a stderr format real `xmllint` never produces, and the
   parser is broken against the real one. Verified by running (F-TEST-01).
2. A **proven duplicate-submission race** in Python that both suites miss, plus a behaviour
   divergence from TS (F-TEST-03).
3. The **multipart wire contract** — part name `xml`, caller filename, `Accept`, no hand-set
   `Content-Length` — is asserted in neither package, although both suites contain a test whose
   *name* claims to prove it (F-TEST-02).
4. Public surface is asymmetric: Python's `P12Reader` (7 methods) and `track_statuses` have zero
   unit tests while TS has dedicated suites for the same behaviours (F-TEST-04, F-TEST-05).
5. Host routing for the summary path (`fc.dgii.gov.do` vs `ecf.dgii.gov.do`) is asserted nowhere
   (F-TEST-06).

The documentation site *is* covered by a real gate: `mkdocs build --strict` passes (en + es, 13
nav translations) and demonstrably fails on a broken link (verified by running, see Gate inventory).

---

## Findings

| ID | Severity | Title | Package | Verified-by |
|----|----------|-------|---------|-------------|
| F-TEST-01 | HIGH | TS `xmllint` violation parser never matches real stderr; `SchemaViolation.path` is always empty and TS/PY violations diverge | TS | running |
| F-TEST-02 | HIGH | Multipart wire contract (`xml` part, filename, headers) asserted in neither package | both | reading |
| F-TEST-03 | HIGH | Python `_submit_idempotent` is check-then-act: two concurrent callers transmit the same e-CF twice; TS coalesces. No concurrency test in either suite | PY (+ TS divergence) | running |
| F-TEST-04 | HIGH | Python `P12Reader` / `CertificateInfo` (7 public methods) have no unit tests; TS has 5 including the plain-keybag fallback | PY | reading |
| F-TEST-05 | MEDIUM | `track_statuses` (public, PY) has zero tests; TS has a dedicated 4-case suite for the same rules | PY | reading |
| F-TEST-06 | MEDIUM | Summary (RFCE) host `fc.dgii.gov.do` never asserted — only the path substring | both | reading |
| F-TEST-07 | MEDIUM | Endpoint/BaseUrl tables hand-maintained, unpinned and not cross-checked; reconciliation tests build expected URLs with the function under test | both | reading + running |
| F-TEST-08 | MEDIUM | `HttpClient` is exported public API with no direct test in either package | both | reading |
| F-TEST-09 | MEDIUM | Hostile XML (DTD/XXE/entity expansion) untested; PY expands internal entities and signs them, TS rejects — divergence unpinned | both | running |
| F-TEST-10 | MEDIUM | `to_dgii_error` — the invariant's "single normalizer" — has no test at all in Python; `toDgiiError` has 2 narrow tests in TS | both | reading |
| F-TEST-11 | MEDIUM | Fiscal date formatting asserted structurally only, although both functions accept an injectable instant | both | running |
| F-TEST-12 | MEDIUM | Live-DGII integration tests are collected by the default `test` command; with `DGII_*` exported, `mise run test` submits real documents | both | reading |
| F-TEST-13 | MEDIUM | No test asserts the shipped artifact contains the schemas, nor that all three XSD copies are byte-identical | both | running |
| F-TEST-14 | LOW | `mise run ci` omits both XMLDSig gates and `uv lock --check`; the Python gate has no mise task | repo | reading |
| F-TEST-15 | LOW | No fixture digest pinned: reformatting `examples/fixtures/*.xml` breaks nothing | both | reading |
| F-TEST-16 | LOW | `validateXMLCertificate` edge cases (missing cert, `ds:` prefix) are TS-only; `formatViolations` untested in TS | both | reading |
| F-TEST-17 | LOW | `compareDecimal` never tested with negative or `-0.00` operands | both | running |

---

### F-TEST-01 — TS violation parsing is proven against a fabricated stderr format — HIGH (TS)

**Verified by running.**

`parseViolations` (`packages/typescript/src/validation.ts:84-111`) only extracts a path when the
line matches:

```ts
const VIOLATION_LINE = /^.*?:(\d+):\s*element\s+([^:]+):\s*(.*)$/;   // validation.ts:84
```

Real `xmllint --noout --schema … -` emits no `element NAME:` token. Raw stderr, captured with
`printf '<ECF><Encabezado><IdDoc><TipoeCF>32</TipoeCF></IdDoc></Encabezado></ECF>' | xmllint --noout --schema packages/typescript/schemas/e-cf-32.xsd -`:

```
-:1: Schemas validity error : Element 'IdDoc': This element is not expected. Expected is ( Version ).
-:1: Schemas validity error : Element 'ECF': Missing child element(s). Expected is ( DetallesItems ).
- fails to validate
```

The test that "proves" the parser (`packages/typescript/test/validation.test.ts:79`,
`it('parses the element and reason from xmllint stderr')`) feeds it a hand-written line
(`test/validation.test.ts:47-50`) containing exactly the token the regex needs:

```
/tmp/x.xml:7: element FechaLimitePago: Schemas validity error : Element 'FechaLimitePago': bad date
```

Consequence, measured with the real binary against the real fixtures:

| document | TS `validateDocument` (real xmllint) | PY `validate_document` |
|---|---|---|
| `examples/fixtures/invoice-32.xml` | `[{path: "", message: "-:12: Schemas validity error : Element 'ECF': Missing child element(s). Expected is one of ( {*}*, * )."}]` | `[{path: "/ECF", message: "Element 'ECF': Missing child element(s). …"}]` |
| `INVALID_ECF_32` | 2 violations, both `path: ""`, both messages prefixed `-:1: Schemas validity error : ` | `path: "/ECF/Encabezado/IdDoc"`, `path: "/ECF"` |

**What is unproven/wrong:** `SchemaViolation.path` — the documented "element DGII would complain
about" (`validation.ts:53-56`) — is dead on the TS side, and the message leaks
`-:LINE: Schemas validity error : ` noise. `formatViolations` therefore produces different strings
in the two SDKs, breaking the "behaviourally identical" contract on the one code path that reaches
an external binary. The suite cannot see it because no TS test ever runs the real binary; the TS
comment at `test/validation.test.ts:35-38` states the choice explicitly ("the plumbing is exercised
with stand-in binaries").

**Risk:** every `validateBeforeSend` failure, and every direct `validateDocument` caller, reports an
unusable violation in TS. The first real `xmllint` run in a user's CI is the first real test.

**Test to add** — `packages/typescript/test/validation.test.ts`:

```ts
const realXmllint = process.env['DGII_XMLLINT_BIN'] ?? 'xmllint';
const describeReal =
  spawnSync(realXmllint, ['--version']).status === 0 ? describe : describe.skip;

describeReal('validateDocument against the real xmllint binary', () => {
  it('reports the element path for a schema violation', () => {
    const result = validateDocument(INVALID_ECF_32, { bin: realXmllint });
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.length).toBeGreaterThan(0);
    // today: every path is '' and every message starts with "-:1: "
    expect(result.value[0]?.path).not.toBe('');
    expect(result.value[0]?.message).not.toMatch(/^-\d*:/);
  });

  it('produces the same violation paths as the Python SDK for invoice-32.xml', () => {
    const xml = readFileSync('../../examples/fixtures/invoice-32.xml', 'utf8');
    const result = validateDocument(xml, { bin: realXmllint });
    if (result.isErr()) throw new Error(result.error.message);
    expect(result.value.map((v) => v.path)).toEqual(['/ECF']);
  });
});
```

**Command that proves it:**
`cd packages/typescript && LD_LIBRARY_PATH=/tmp/dgii-tools/usr/lib/x86_64-linux-gnu DGII_XMLLINT_BIN=/tmp/dgii-tools/usr/bin/xmllint bunx vitest run test/validation.test.ts`
(fails today on both assertions).

---

### F-TEST-02 — The multipart wire contract is asserted nowhere — HIGH (both)

**Verified by reading.**

Both SDKs post signed XML as a multipart part named `xml` with the caller's filename:

- TS: `form.append('xml', new Blob([xml], { type: 'application/xml' }), fileName)` —
  `packages/typescript/src/http.ts:328`; headers `{ Accept: 'application/json' }` —
  `http.ts:332`; "never set `Content-Length`" exists only as a comment — `http.ts:314-317`.
- PY: `files = {"xml": (file_name, xml.encode("utf-8"), "application/xml")}` —
  `packages/python/src/py_dgii_ecf/http.py:294`.

What the tests actually assert:

- `packages/typescript/test/client.test.ts:25` `it('sends the bearer token and posts a multipart
  file part')` → `expect(captured?.init?.body).toBeInstanceOf(FormData)` (`client.test.ts:48`).
  Nothing reads the part name or the filename.
- `packages/python/tests/test_client.py:49` `test_sends_bearer_and_multipart` → captures
  `Authorization`, `method`, `url` only (`test_client.py:52-71`).

A grep for `request.content` across `packages/python/tests/` returns nothing; a grep for
`get('xml')` across `packages/typescript/test/` returns nothing. No test asserts `Accept`, and no
test asserts that `Content-Length` is left to the runtime.

**Risk:** renaming the part (`xml` → `document`, a plausible "cleanup") or dropping the filename
makes DGII reject every submission with a 400 while both suites and both gates stay green. The same
gap covers the login request, which also goes through `postMultipart` with filename `signed.xml`
(`packages/python/src/py_dgii_ecf/client.py:353-355`).

**Test to add:**

- `packages/python/tests/test_client.py`:
  `def test_posts_the_xml_field_with_the_caller_filename()` — capture `request.content` in the
  handler, then `assert b'name="xml"' in body`, `assert b'filename="f.xml"' in body`,
  `assert b"application/xml" in body`.
- `packages/python/tests/test_client.py`:
  `def test_leaves_content_length_to_the_transport()` — `assert
  int(request.headers["content-length"]) == len(request.content)` (a hand-set value drifts).
- `packages/typescript/test/client.test.ts`:
  `it('names the multipart part xml with the caller filename')` — read
  `(captured.init.body as FormData).get('xml')`, assert it is a `File` whose `name` is `'f.xml'`,
  and assert `(captured.init.headers as Record<string, string>).Accept === 'application/json'`.

**Command:** `cd packages/python && uv run python -m pytest tests/test_client.py -k multipart -q`
and `cd packages/typescript && bunx vitest run test/client.test.ts -t 'multipart part'`.

---

### F-TEST-03 — Python transmits the same document twice under concurrency — HIGH (PY; TS diverges)

**Verified by running.**

TS wraps the persist-before-transmit flow in a single-flight map:

```ts
return this.singleFlight(key, async () => {                 // client.ts:253
  await this.idempotency.set(key, PENDING_SUBMISSION);      // client.ts:254
  …
```

with `singleFlight` at `packages/typescript/src/client.ts:263-278`.

Python has no equivalent: `_submit_idempotent` (`packages/python/src/py_dgii_ecf/client.py:264-292`)
does `get` → `set(pending)` → `send()` with the check and the act in separate critical sections and
no lock. The window is invisible with the default dict-backed store but real for the documented
pluggable store (`IdempotencyStore` is public API; Redis/DB is the use case, where `get` is a
network round-trip).

Probe `/tmp/concurrent_probe3.py` — two threads, a store whose `get` releases both callers before
either `set` lands:

```
HTTP calls made: 2
results: ['ok', 'ok']
```

The same probe against TS (`/tmp/singleflight_probe.ts`, `Promise.all` of two submissions with a
20 ms-latency store):

```
HTTP calls made: 1
results: [ "ok", "ok" ]
```

**Risk:** two workers (or two threads) submitting the same signed e-CF produce two POSTs of the same
e-NCF to DGII. DGII either rejects the duplicate (noisy, burns the sequence) or accepts both
(duplicate fiscal document). Both calls report success, so the caller cannot detect it. Neither
suite has a concurrency test for submissions: `Promise.all` appears only in `test/token.test.ts:174`
and `ThreadPoolExecutor` only in `tests/test_token.py:184`.

**Test to add:**

- `packages/python/tests/test_client.py`:
  `def test_concurrent_identical_submissions_transmit_once()` — a store subclass whose `get`
  waits on `threading.Barrier(2)`, two `ThreadPoolExecutor` submissions of the same XML, then
  `assert calls["n"] == 1` and `assert all(r.is_ok() for r in results)`. **Fails today (2).**
- `packages/typescript/test/client.test.ts`:
  `it('coalesces concurrent identical submissions into one request')` — `Promise.all` of two
  `sendElectronicDocument` calls with a latency-injecting `IdempotencyStore`, `expect(calls).toBe(1)`.
  Passes today; locks the behaviour in.

**Command:** `cd packages/python && uv run python /tmp/concurrent_probe3.py` (2 calls) and
`cd packages/typescript && bun run /tmp/singleflight_probe.ts` (1 call).

---

### F-TEST-04 — Python's `P12Reader` and `CertificateInfo` are untested — HIGH (PY)

**Verified by reading.**

`packages/python/src/py_dgii_ecf/certificate.py` exports `P12Reader` with `get_key_from_file`
(:55), `get_key_from_base64` (:70), `get_key_from_bytes` (:81), `get_certificate_info` (:118),
`get_certificate_info_from_base64` (:131), `get_certificate_info_from_bytes` (:144), plus the
`CertificateInfo` dataclass (:29). A grep for `CertificateInfo` across `packages/python/tests/`
returns **zero** hits; `P12Reader` appears only as the type `P12ReaderData` in test fixtures and
once in the opt-in integration conftest (`tests/integration/conftest.py:48`), which never runs on a
PR. The only behavioural coverage is indirect, through `Signature.try_from_p12`
(`tests/test_signing.py:194-230`): success, missing file, wrong password.

TS, by contrast, has a dedicated suite (`packages/typescript/test/certificate.test.ts:49-92`) with
five cases including **both PKCS#12 encodings** — the shrouded key bag DGII ships and a plain
`keyBag` (`certificate.test.ts:57-66`, commented "which had no fallback"). Python has no equivalent
for the plain-keybag case, i.e. exactly the variation that was once a bug.

Asymmetric the other way: TS never tests `P12Reader.getKeyFromFile` with a missing path, while
Python does (`tests/test_signing.py:206-213`).

**Risk:** `get_key_from_base64`, `get_certificate_info*` and the plain-keybag path are shipped,
documented public API with no regression net. A refactor of `_load` (`certificate.py:41-47`) that
breaks unencrypted bundles ships silently in Python while TS catches it.

**Test to add** — new file `packages/python/tests/test_certificate.py` (mirror of the TS suite):

- `test_reads_a_shrouded_key_bag` — `P12Reader("secret").get_key_from_bytes(<3des p12>)`, assert
  `"PRIVATE KEY" in data.key`, `"CERTIFICATE" in data.cert`, `"PUBLIC KEY" in data.public_key`.
- `test_reads_a_plain_key_bag` — serialize with `encryption_algorithm=serialization.NoEncryption()`
  and no MAC, assert `is_ok()` (the case TS pins at `certificate.test.ts:57`).
- `test_reads_certificate_metadata` — `get_certificate_info_from_bytes`, assert
  `"dgii-ecf-p12-test" in info.subject` and `info.valid_to > datetime.now(UTC)`.
- `test_reports_a_missing_file` — `get_key_from_file(tmp_path / "absent.p12")`, assert
  `error.code is DgiiErrorCode.CERTIFICATE`.
- `test_rejects_a_malformed_base64_payload` — `get_key_from_base64("not base64!!")`.

**Command:** `cd packages/python && uv run python -m pytest tests/test_certificate.py -q`.

---

### F-TEST-05 — `track_statuses` has zero tests in Python — MEDIUM (PY)

**Verified by reading.**

`ECF.track_statuses` (`packages/python/src/py_dgii_ecf/client.py:570-593`) is public via `ECF` and
implements three non-obvious rules: a single object normalizes to a one-entry list, an absent body
is a `VALIDATION` error ("An absent body is not 'no records'"), and `estado` must be a string
(`types.py:318`). A grep for `track_statuses` across `packages/python/tests/` returns **zero**
hits — it is only exercised indirectly through `reconcile_submission` (`client.py:539`), which never
asserts the listing normalization, the empty body, or the non-string `estado`.

TS proves all four rules explicitly: `packages/typescript/test/reconciliation.test.ts:1050-1105`
(`normalizes a single object into a one-entry listing`, `keeps an explicit empty array as "no
track"`, `fails with VALIDATION when the body is empty`, `fails with VALIDATION when an entry has no
string estado`).

**Risk:** a direct caller of `track_statuses` has no proven contract. A regression returning
`Ok([])` for an absent body would make "DGII holds no record" indistinguishable from "DGII did not
answer" — the exact confusion the docstring guards against.

**Test to add** — `packages/python/tests/test_reconciliation.py` (mirror the four TS cases):

- `test_track_statuses_normalizes_a_single_object`
- `test_track_statuses_keeps_an_explicit_empty_array`
- `test_track_statuses_rejects_an_empty_body` (assert `error.code is DgiiErrorCode.VALIDATION` and
  `error.message == "Unexpected DGII response payload"`)
- `test_track_statuses_rejects_an_entry_without_a_string_estado`

**Command:** `cd packages/python && uv run python -m pytest tests/test_reconciliation.py -k track_statuses -q`.

---

### F-TEST-06 — The summary host is never asserted — MEDIUM (both)

**Verified by reading.**

`sendSummary` deliberately targets the *consumption* base URL:

- TS `buildUrl(this.environment, Endpoint.SendSummary, BaseUrl.CF)` —
  `packages/typescript/src/client.ts:592-596`
- PY `build_url(self._environment, Endpoint.SEND_SUMMARY, BaseUrl.CF.value)` —
  `packages/python/src/py_dgii_ecf/client.py:420`

The only assertions on that request are path substrings:
`expect(urls[1]).toContain('/TesteCF/recepcionfc/api/recepcion/ecf')`
(`packages/typescript/test/client.test.ts:96`) and
`assert "/TesteCF/recepcionfc/api/recepcion/ecf" in urls[1]`
(`packages/python/tests/test_client.py:619`). A grep for `fc.dgii` in both test trees hits only the
QR-code helper tests (`test/utils.test.ts:54`, `tests/test_utils.py:43`).

**Risk:** dropping `BaseUrl.CF` — one deleted argument — sends every RFCE to
`https://ecf.dgii.gov.do/…`, and no test, lint, build or XMLDSig gate notices. The summary never
reaches DGII and the failure is only visible in production.

**Test to add** (both packages, one assertion each):

- `packages/typescript/test/client.test.ts`: in `it('dispatches sendDocument to the endpoint the
  document belongs to')`, replace the substring with
  `expect(urls[1]).toBe('https://fc.dgii.gov.do/TesteCF/recepcionfc/api/recepcion/ecf')`.
- `packages/python/tests/test_client.py`: `assert urls[1] == "https://fc.dgii.gov.do/TesteCF/recepcionfc/api/recepcion/ecf"`
  in `test_send_document_dispatches_by_document_content` (`test_client.py:619`).
- Add a companion `it('sends an e-CF to the ecf host')` asserting
  `https://ecf.dgii.gov.do/TesteCF/recepcion/api/FacturasElectronicas`.

**Command:** `cd packages/typescript && bunx vitest run test/client.test.ts -t 'dispatches'`.

---

### F-TEST-07 — The endpoint table is unpinned and self-referentially tested — MEDIUM (both)

**Verified by reading**, plus one parity dump run.

`Endpoint`, `SenderReceiverEndpoint`, `StatusEndpoint` and `BaseUrl` are hand-maintained in both
packages (`packages/typescript/src/environment.ts:10-56`,
`packages/python/src/py_dgii_ecf/environment.py:24-56`) with no test file in either package
(`test/environment.test.ts` and `tests/test_environment.py` do not exist). The reconciliation suite
builds its expected URLs with the very function under test:

```ts
const inquiryStatusUrl = (encf: string): string =>
  `${buildUrl(Environment.Dev, Endpoint.InquiryStatus)}` + `?rncEmisor=…`;   // reconciliation.test.ts:55-57
```

so a typo in the `Endpoint.InquiryStatus` *value* is invisible: the mock and the expectation move
together. Python does the same via case-insensitive fragments (`tests/test_reconciliation.py:46-48`).

Literal endpoint assertions exist for only 4 of 12 `Endpoint` members
(`test/client.test.ts:43,95,96,580`; `tests/test_client.py:71,618,619,760`). Unproven paths:
`Seed`, `ValidateSeed`, `InquiryInvoiceSummary`, `CommercialApproval`, `TrackResultStatus`,
`InquiryStatus`, `AllTrackingEcf`, `Directory`, `Void`. `buildUrl`'s trailing-slash normalization
(`environment.ts:66`, `environment.py:70`) is untested in both.

Cross-package parity holds **today** — I dumped both tables and compared (`/tmp/env_dump.ts`,
`/tmp/env_dump.py`, `/tmp/cmp2.py`): `Endpoint` 12/12, `SenderReceiverEndpoint` 4/4,
`StatusEndpoint` 3/3, `BaseUrl` 3/3 identical (member names differ only in casing style). Nothing
enforces it, which is the exact failure mode AGENTS.md warns about ("parity is maintained by hand").

**Risk:** a URL typo or a one-sided edit ships; DGII answers 404/405 and the suite is green. The
`buildUrl` trailing-slash rule is the difference between `/TesteCF/x` and `/TesteCF//x`.

**Test to add:**

- `packages/typescript/test/environment.test.ts` — `it.each([...])('pins the %s endpoint path')`
  over all 12 literal strings, plus `it('normalizes a base URL with a trailing slash')`
  (`buildUrl(Environment.Dev, Endpoint.SendInvoice, 'https://ecf.dgii.gov.do/')`).
- `packages/python/tests/test_environment.py` — the same two cases.
- A parity guard that can run in CI: a script asserting the two tables agree
  (`scripts/check_endpoint_parity.py`), wired as a workflow step, or a JSON fixture both suites read.

**Command:** `cd packages/typescript && bunx vitest run test/environment.test.ts` (file absent today).

---

### F-TEST-08 — `HttpClient` is public API with no direct test — MEDIUM (both)

**Verified by reading.**

`HttpClient` (339 lines, `packages/typescript/src/http.ts:131-339`) and its Python twin (295 lines,
`packages/python/src/py_dgii_ecf/http.py`) are exported (`src/index.ts:6`, `__init__.py:36-41`) but
`test/http.test.ts` and `tests/test_http.py` contain **only** `InMemoryIdempotencyStore` tests
(`test/http.test.ts:25-103`, `tests/test_http.py:30-102`). Header composition, `Accept` handling,
timeout propagation, 401 replay and the normalization of a thrown transport error are proven only as
side effects of client tests.

**Risk:** a caller who constructs `HttpClient` directly (a documented option) has no proven
contract; the `Accept` header and the "no hand-set `Content-Length`" rule have no assertion at all.

**Test to add:** `packages/python/tests/test_http.py::test_normalizes_a_thrown_transport_error`
(inject a transport that raises `httpx2.ConnectError`, assert `is_err()`,
`error.code is DgiiErrorCode.NETWORK`, `error.retryable is True`) and
`packages/typescript/test/http.test.ts::it('normalizes a thrown fetch error into a retryable DgiiError')`.

**Command:** `cd packages/python && uv run python -m pytest tests/test_http.py -q`.

---

### F-TEST-09 — Hostile XML is untested and the two packages disagree — MEDIUM (both)

**Verified by running.**

Neither suite contains a single `DOCTYPE`/`ENTITY` case (grep over both test trees: no hits).

Probe results for identical inputs through `Signature.signXml` / `Signature.sign_xml`:

| input | TS | PY |
|---|---|---|
| `<!DOCTYPE ECF [<!ENTITY x "EXPANDED">]>…<Version>&x;</Version>…` | `ERR INVALID_XML` ("entity not found") | `OK` — entity expanded, `EXPANDED` signed into the document |
| `<!DOCTYPE ECF [<!ENTITY xxe SYSTEM "file:///etc/hostname">]>…` | `ERR INVALID_XML` | `ERR INVALID_XML` ("Entity 'xxe' not defined") — no file disclosure |
| same with an `http://` SYSTEM id | `ERR INVALID_XML` | `ERR INVALID_XML` |
| 6-level "billion laughs" (10^6 chars) | `ERR INVALID_XML`, 2 ms | `ERR INVALID_XML`, 0 ms |

Both are safe against external entities today, but for different reasons (xmldom refuses all
entities; lxml's `XMLParser(remove_blank_text=True, remove_comments=True)` at
`packages/python/src/py_dgii_ecf/signing.py:115` resolves *internal* ones), and the difference is an
observable behaviour divergence: the same document is signable in Python and rejected in TS.

**Risk:** nothing pins either behaviour, so a future change (adding a DTD resolver to accept a
customer's document, or switching the lxml parser to `resolve_entities=False`) flips security
posture or parity with no test failing. Entity expansion is also a digest hazard: the digest covers
the expanded text, not the bytes DGII received.

**Test to add:**

- `packages/python/tests/test_signing.py::test_rejects_an_external_entity` — assert `result.is_err()`
  and `code is DgiiErrorCode.INVALID_XML` for the `file:///etc/hostname` payload.
- `packages/python/tests/test_signing.py::test_rejects_an_entity_expansion_bomb` — the 6-level
  payload, assert `is_err()` and a wall-clock bound.
- `packages/python/tests/test_signing.py::test_pins_the_internal_entity_policy` — assert whichever
  policy is chosen (rejecting, to match TS) so the divergence becomes a decision.
- TS mirror in `packages/typescript/test/signing.test.ts` for the same three inputs.

**Command:** `cd packages/python && uv run python /tmp/xxe_probe.py` and
`cd packages/typescript && bun run /tmp/xxe_probe.ts`.

---

### F-TEST-10 — The "single normalizer" is barely tested — MEDIUM (both)

**Verified by reading.**

AGENTS.md makes `toDgiiError` / `to_dgii_error` "the single normalizer" for every non-programmer
error. Python's `to_dgii_error` (`packages/python/src/py_dgii_ecf/errors.py:198-232`) has **no
test**: `tests/test_result.py` exercises only `is_retryable_status` (:26-30) and
`extract_dgii_error_message` (:33-45). TS has two cases (`packages/typescript/test/errors.test.ts:5-19`)
that only check that a `mensajes[].codigo` survives as `'A01'` / `7`.

Unproven branches in both: the `DgiiError` passthrough, the `BaseException`/`Error` branch, the
`fallbackMessage` default, the `status` lift from a dict payload (`errors.py:220-221`,
`errors.ts:281-284`), and the `mensajes` extraction TS performs in the normalizer
(`errors.ts:290-292`; Python populates `mensajes` on a different path — `errors.py:101-105` — which
no test compares).

**Risk:** the invariant that every failure has one shape and one code is asserted by convention
only. A change to the branch order changes `code`/`status`/`retryable` — and therefore retry
behaviour — with no failing test.

**Test to add** — `packages/python/tests/test_result.py`:

- `test_to_dgii_error_passes_a_dgii_error_through` (identity),
- `test_to_dgii_error_wraps_an_exception` (assert `code is DgiiErrorCode.UNKNOWN`, `cause` set),
- `test_to_dgii_error_lifts_the_status_from_a_dict_payload`,
- `test_to_dgii_error_uses_the_fallback_message`,
- `test_to_dgii_error_reads_mensajes`.

TS mirror in `packages/typescript/test/errors.test.ts` for the same five branches.

**Command:** `cd packages/python && uv run python -m pytest tests/test_result.py -q`.

---

### F-TEST-11 — Fiscal date formatting is asserted structurally only — MEDIUM (both)

**Verified by running.**

Both functions accept an injectable instant — `getCurrentFormattedDateTime(date: Date = new Date())`
(`packages/typescript/src/utils.ts:88`) and `get_current_formatted_datetime(now: datetime | None = None)`
(`packages/python/src/py_dgii_ecf/utils.py:72`) — and neither test uses it:

- `packages/typescript/test/utils.test.ts:89` asserts a regex (`/^\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}$/`).
- `packages/python/tests/test_utils.py:76` asserts `len(split("-")) == 3` and `":" in …`.

Both are correct today and identical: `2026-01-01T02:30:00Z` → `31-12-2025 22:30:00` in both
(probe `/tmp/tz.ts`, `/tmp/tz.py`). A regression to UTC (`toISOString()` / `datetime.now(UTC)`) still
matches both assertions.

**Risk:** the emission date on a fiscal document is a legal field. A UTC regression produces
documents dated the previous or next day between 20:00 and 24:00 local time, and the suite stays
green.

**Test to add** (both, one case each):

- `packages/typescript/test/utils.test.ts`: `it('formats a fixed instant in Santo Domingo')` —
  `expect(getCurrentFormattedDateTime(new Date('2026-01-01T02:30:00Z'))).toBe('31-12-2025 22:30:00')`
  and `expect(getCurrentFormattedDate(new Date('2026-01-01T02:30:00Z'))).toBe('31-12-2025')`.
- `packages/python/tests/test_utils.py`: `test_formats_a_fixed_instant_in_santo_domingo` with
  `datetime(2026, 1, 1, 2, 30, tzinfo=UTC)`.

**Command:** `TZ=UTC bun run /tmp/tz.ts` / `TZ=UTC uv run python /tmp/tz.py`.

---

### F-TEST-12 — The default `test` command can transmit to DGII — MEDIUM (both)

**Verified by reading.**

- TS: `packages/typescript/vitest.config.ts:5` → `include: ['test/**/*.test.ts']`, which matches
  `test/integration/dgii.integration.test.ts`; that file flips from `describe.skip` to `describe` as
  soon as `DGII_P12_PATH`, `DGII_P12_PASSWORD` and `DGII_RNC` are set
  (`test/integration/dgii.integration.test.ts:30-40`).
- PY: `packages/python/pyproject.toml:88` → `testpaths = ["tests"]`, which matches
  `tests/integration/`; the autouse session fixture skips only when the variables are *missing*
  (`tests/integration/conftest.py:28-37`).

So `mise run test` — and `mise run ci`, which depends on it (`mise.toml:122-124`) — runs the live
suite for any developer who exported the `DGII_*` variables for `examples/`. Each run consumes an
authorised, single-use sequence number (`DGII_ENCF`, `DGII_RFCE_ENCF`, see
`test/integration/dgii.integration.test.ts:4-8`).

**Risk:** an accidental live submission during local development, burning a certification sequence
and creating real documents in DGII's environment. CI is unaffected (it never sets the variables),
which is precisely why this stays invisible.

**Test/change to add:** make the opt-in explicit rather than implicit.

- `packages/python/pyproject.toml`: register a marker and exclude the directory by default —
  `addopts = "-q -m 'not integration'"`, `markers = ["integration: live DGII calls"]`, and mark the
  three integration tests.
- `packages/typescript/vitest.config.ts`: `exclude: [...configDefaults.exclude, 'test/integration/**']`
  plus a separate `vitest.integration.config.ts` used by the `integration` workflow.

**Command:** `cd packages/typescript && DGII_P12_PATH=/tmp/x DGII_P12_PASSWORD=y DGII_RNC=1 bunx vitest list 2>/dev/null | grep -c integration`
(non-zero today).

---

### F-TEST-13 — Nothing proves the shipped artifact carries the schemas — MEDIUM (both)

**Verified by running** (byte-identity) **and by reading** (packaging).

The three XSD copies *are* byte-identical today: `diff -r packages/typescript/schemas
packages/python/src/py_dgii_ecf/schemas` reports differences only in `README.md`; `md5sum` of the
three `MANIFEST.json` copies is identical (`6dae4cd8a074da036e84888c5ae3e873`); 12 `.xsd` files in
each location. But:

- Python asserts only PY ↔ `examples/fixtures` (`tests/test_validation.py:154-158`).
- TS asserts only a **count** of 12 files (`test/validation.test.ts:61-68`) — no content, no
  comparison with Python, no MANIFEST check.
- No test asserts the *built* artifact contains them: TS relies on `publicDir: 'schemas'`
  (`packages/typescript/tsup.config.ts:7`) and ships `"files": ["dist", "README.md"]`
  (`packages/typescript/package.json:41-44`); Python relies on
  `[tool.hatch.build.targets.wheel] packages = ["src/py_dgii_ecf"]`
  (`packages/python/pyproject.toml:61-62`). A `tsup`/hatch change drops the schemas from the
  published package and every test still passes, because the suite reads `src/`, not `dist/`.

**Risk:** `validate_document`/`validateDocument` works in-repo and fails for every npm/PyPI consumer
with "Schema unavailable". The failure only appears after publish.

**Test to add:**

- `packages/typescript/test/validation.test.ts`: `it('keeps every schema byte-identical to the
  Python copy')` — compare `readFileSync` of each `.xsd` against
  `../../packages/python/src/py_dgii_ecf/schemas/<name>` (mirror of `tests/test_validation.py:154`).
- `packages/typescript/test/validation.test.ts`: `it('ships the schemas in the built bundle')` —
  guarded by a `dist/` presence check, run after `bun run build` in CI.
- `packages/python/tests/test_validation.py`: extend `test_every_bundled_schema_compiles` (`:45`)
  with a `zipfile` assertion over the built wheel.

**Command:** `diff -r packages/typescript/schemas packages/python/src/py_dgii_ecf/schemas` (only
README differs) and `cd packages/typescript && bun run build && ls dist/schemas/*.xsd | wc -l`.

---

### F-TEST-14 — `mise run ci` is not CI — LOW (repo)

**Verified by reading.**

`mise.toml:122-124` defines `ci` as `depends = ["lint", "test", "build"]`. It does **not** include
the XMLDSig gates — the only checks that catch canonicalization regressions — nor
`uv lock --check`. CI runs them as separate steps (`.github/workflows/typescript.yml:70-76`,
`.github/workflows/python.yml:52`, `.github/workflows/python.yml:31-35`). There is a mise task for
the TS gate (`mise.toml:78-82`) but **none** for the Python gate, so the Python gate exists only as
a raw command in AGENTS.md.

AGENTS.md documents the omission explicitly, so this is a drift/discoverability issue rather than a
broken promise — but a developer who trusts `mise run ci` gets green on a broken digest.

**Test/change to add:** `[tasks.verify-signing-python]` (`dir = "packages/python"`,
`run = "uv run --with xmlsec python scripts/verify_signing.py"`), `[tasks.lock-check-python]`, and
`[tasks.ci] depends = ["lint", "test", "build", "verify-signing-typescript",
"verify-signing-python", "lock-check-python"]`.

**Command:** `mise run ci` then count `verify_signing` occurrences in its output (0 today).

---

### F-TEST-15 — Fixture byte-sensitivity is a claim, not a test — LOW (both)

**Verified by reading.**

AGENTS.md and `.prettierignore` justify excluding `examples/fixtures/` with "reformatting them
invalidates signing tests". No test pins a fixture digest: a grep for `sha256`/`createHash` in
`test/fixtures.test.ts` and `tests/test_fixtures.py` returns nothing, and the only byte-consuming
gate signs the fixture at run time and verifies its own output
(`packages/typescript/scripts/verify-signing.ts:96` reads `invoice-31.xml`, then signs it), so a
reformatted fixture still verifies. The two fixture tests assert element presence only
(`test/fixtures.test.ts:12-57`, `tests/test_fixtures.py:14-54`).

**Risk:** low — nothing breaks today — but the exclusion rule is enforced by comment, and a
"harmless" reformat silently changes what the examples and the XMLDSig gate submit.

**Test to add:** `packages/python/tests/test_fixtures.py::test_fixture_bytes_are_pinned` — a
`sha256` map for the five fixtures under `examples/fixtures/`, so any reformat fails loudly.

**Command:** `cd packages/python && uv run python -m pytest tests/test_fixtures.py -q`.

---

### F-TEST-16 — `validateXMLCertificate` / `formatViolations` coverage is asymmetric — LOW (both)

**Verified by reading.**

TS tests three certificate-validation cases, including the `ds:` namespace prefix and the "no
certificate present" failure (`packages/typescript/test/signing.test.ts:103-135`). Python has one
happy-path case (`packages/python/tests/test_signing.py:156-163`). Conversely `formatViolations` has
a Python test (`tests/test_validation.py:101-107`) and no TS test — TS exercises it only indirectly
through the `validateBeforeSend` error message (`test/validation.test.ts:124-143`).

**Risk:** the `ds:`-prefixed certificate is what a .NET-generated signature looks like — the case TS
guards and Python does not.

**Test to add:** `packages/python/tests/test_signing.py::test_validate_xml_certificate_with_a_ds_prefix`
(replace `<X509Certificate>` with `<ds:X509Certificate>` as the TS test does) and
`::test_validate_xml_certificate_fails_without_a_certificate`; plus
`packages/typescript/test/validation.test.ts::it('summarises more than five violations with a count')`
for `formatViolations`.

**Command:** `cd packages/python && uv run python -m pytest tests/test_signing.py -k certificate -q`.

---

### F-TEST-17 — `compareDecimal` never sees a negative operand — LOW (both)

**Verified by running.**

Both suites assert the same five positive cases (`test/reception.test.ts:46-53`,
`tests/test_reception.py:56-62`). Negative amounts are rejected upstream by the decimal guard
(`resolveReceptionRoute` returns `VALIDATION` for `MontoTotal = -300000.00`, probe
`/tmp/reception_probe.ts`), so the rejection is real but untested. `compareDecimal('-0.00','0.00')`
returns `1` today in TS (probe), i.e. `-0.00` sorts above `0.00` — an edge no test pins.

**Risk:** low; the money comparison is the invariant-adjacent helper and its contract at the
boundary (negative, `-0.00`) is undefined by test.

**Test to add:** both packages, in the existing `compareDecimal` / `compare_decimal` test —
`expect(compareDecimal('-100.00', '0.00')).toBeLessThan(0)`,
`expect(compareDecimal('-0.00', '0.00')).toBe(0)`, and a reception case
`it('rejects a negative MontoTotal')` asserting the `VALIDATION` code.

**Command:** `cd packages/typescript && bun run /tmp/reception_probe.ts`.

---

## Coverage matrix

Levels: **U** unit · **F** functional (client + fake transport / mock server) · **C** contract
(wire shape: request body, multipart, headers) · **I** integration (opt-in, live DGII).

### Client (`ECF`)

| Member | TS test file(s) | TS level | PY test file(s) | PY level | Gap |
|---|---|---|---|---|---|
| constructor + options (`token`, `now`, `enforceB2BRules`, `validateBeforeSend`, `idempotencyStore`) | `client.test.ts:627`, `validation.test.ts:123-160`, `token.test.ts:183` | F, U | `test_client.py:814`, `test_validation.py:110-152`, `test_token.py:191` | F, U | — |
| `authenticate` | `token.test.ts:55-205` (5 cases) | F | `test_token.py:43-218` (6 cases) | F | login multipart shape unasserted (F-TEST-02) |
| `sendElectronicDocument` / `send_electronic_document` | `client.test.ts:25,52,238,263`, `validation.test.ts:123` | F | `test_client.py:49,193,219,704` | F | contract level missing (F-TEST-02) |
| `sendSummary` / `send_summary` | `client.test.ts:96` (path only) | F | `test_client.py:619` (path only) | F | **host unasserted (F-TEST-06)** |
| `sendDocument` / `send_document` (routing) | `client.test.ts:71,99` | F | `test_client.py:579,622,647` | F | — |
| `statusTrackId` / `status_track_id` | `reconciliation.test.ts:942-993` | F | indirect only (via `reconcile`) | F | PY has no direct test |
| `inquiryStatus` / `inquiry_status` | `reconciliation.test.ts:995-1048` | F | indirect only (3 references) | F | PY direct coverage thin (3 vs 27 refs) |
| `trackStatuses` / `track_statuses` | `reconciliation.test.ts:1050-1105` (4 cases) | F | **none** | — | **F-TEST-05** |
| `reconcileSubmission` / `reconcile_submission` | `reconciliation.test.ts:284-940` (~30 cases) | F | `test_reconciliation.py:191-742` (~35 cases) | F | — (strongest area of the repo) |
| `getCustomerDirectory` / `get_customer_directory` | `client.test.ts:215` | F | `test_client.py:167` | F | null/absent-body branch untested in TS |
| `getDirectoryListing` / `get_directory_listing` | `client.test.ts:560,584` | F | `test_client.py:734,763` | F | — |
| `getSummaryInvoiceInquiry` / `get_summary_invoice_inquiry` | `client.test.ts:289,322` | F | `test_client.py:353,386` | F | — |
| `sendCommercialApproval` / `send_commercial_approval` (DGII + B2B) | `client.test.ts:369,389,481,656,677,693,708` | F | `test_client.py:442,509,835,863,886` | F | PY has no "5xx on the B2B path" case |
| `voidENCF` / `void_encf` | `client.test.ts:413,433,452,505` | F | `test_client.py:465,488,534,907` | F | — |
| `getServiceStatus` / `getMaintenanceWindows` / `checkServiceAvailability` | `status.test.ts:56,101,117,128` | F, C | `test_status.py:35,93,108,120` | F, C | — (API-key header asserted in both) |
| idempotency ordering (persist-before-transmit) | `client.test.ts:168,238,263` | F | `test_client.py:118,193,219,704` | F | **ordering and atomicity unproven (F-TEST-03)** |

### Supporting public API

| Member | TS test | TS level | PY test | PY level | Gap |
|---|---|---|---|---|---|
| `P12Reader` + `CertificateInfo` | `certificate.test.ts:49-92` (5) | U | **none** (indirect via `try_from_p12`) | — | **F-TEST-04** |
| `Signature.signXml` / `sign_xml` | `signing.test.ts:30-147` (6, 2 pinned digests) | U | `test_signing.py:36-168` (8, 1 pinned digest) | U | hostile input unproven (F-TEST-09) |
| `Signature.tryFromP12` / `try_from_p12` | — (no TS equivalent) | — | `test_signing.py:194-230` (3) | U | PY-only API, untested in TS by design |
| `validateXMLCertificate` / `validate_xml_certificate` | `signing.test.ts:103-135` (3) | U | `test_signing.py:156-163` (1) | U | F-TEST-16 |
| `validateDocument` / `validate_document` | `validation.test.ts:70-121` (**fake binaries only**) | U (fake) | `test_validation.py:45-182` (real lxml + real fixtures) | U | **F-TEST-01**, F-TEST-13 |
| `formatViolations` / `format_violations` | indirect only | — | `test_validation.py:101` | U | F-TEST-16 |
| `Transformer` | `transformer.test.ts:10-132` | U | `test_transformer.py:10-136` | U | PY has `test_invalid_xml_is_rejected`; TS has no invalid-XML case |
| `HttpClient` | `http.test.ts` (store only) | — | `test_http.py` (store only) | — | **F-TEST-08** |
| `InMemoryIdempotencyStore` | `http.test.ts:25-103` (7) | U | `test_http.py:30-102` (7) | U | — (deterministic injected clocks in both) |
| `DgiiError` / `toDgiiError` / `to_dgii_error` | `errors.test.ts:5-19` (2) | U | `test_result.py` (helpers only) | U | **F-TEST-10** |
| `isRetryableStatus` / `isRetryableError` | `resilience.test.ts:5-26` (4) | U | `test_resilience.py:13-31` (4) | U | — |
| `resolveReceptionRoute` / `checkB2BApplicability` | `reception.test.ts:76-179` (12) | U | `test_reception.py:82-169` (12) | U | negative amount (F-TEST-17) |
| `compareDecimal` / `compare_decimal` | `reception.test.ts:46` | U | `test_reception.py:56` | U | F-TEST-17 |
| `canReuseSequence` | `reconciliation.test.ts:181-283` (9) | U | `test_reconciliation.py:156-190, 392-434` | U | — |
| `convertECF32ToRFCE` / `convert_ecf32_to_rfce` | `utils.test.ts:105` | U | `test_utils.py:88` | U | — |
| `generateEcfQRCodeURL` / `generateFcQRCodeURL` | `utils.test.ts:46-87` | U | `test_utils.py:39-74` | U | — |
| `getCodeSixDigitfromSignature` | `utils.test.ts:14-43` | U | `test_utils.py:17-37` | U | — |
| `getCurrentFormattedDate(Time)` | `utils.test.ts:89` (regex) | U | `test_utils.py:76` (structural) | U | **F-TEST-11** |
| `getXmlFromBodyResponse` | `utils.test.ts:98` | U | `test_utils.py:81` | U | — |
| `extractElementText` / `extractRootElementName` | `xml.test.ts:4-67`, `reception.test.ts:26` | U | `test_xml.py:8-67`, `test_reception.py:40` | U | — |
| `Environment` / `buildUrl` / `buildStatusUrl` / `buildSenderReceiverUrl` | **none** | — | **none** | — | **F-TEST-07** |
| `ECF_TYPE_CODES` / `isEcfTypeCode` | `reception.test.ts:56` | U | `test_reception.py:64` | U | — |
| response models (`InvoiceResponse`, `TrackingStatusResponse`, …) | `types.test.ts:11-41` (3) | U | `test_types.py:24-381` (~30) | U | deliberate asymmetry: TS has no runtime models; Python's coercion rules are Python-only |
| CLI (`py-dgii-ecf` console script) | — (no TS CLI) | — | `test_cli.py:25,51` (2) | F | PY-only surface; only `status` auth-failure + happy path covered |
| integration flow | `test/integration/dgii.integration.test.ts:128-193` | I (manual) | `tests/integration/test_dgii_flow.py:22-71` | I (manual) | auth + e-CF + status + RFCE only; reconciliation, approval and void have no live test |

**Asymmetry summary (behaviour proven in one language, untested in the other):**

| Behaviour | Proven in | Untested in |
|---|---|---|
| PKCS#12 plain (unencrypted) key bag fallback | TS `certificate.test.ts:57-66` | PY |
| `CertificateInfo` metadata (`subject`, `validTo`) | TS `certificate.test.ts:83-91` | PY |
| Missing `.p12` file on the reader path | PY `test_signing.py:206-213` | TS |
| `track_statuses` shape rules (4 cases) | TS `reconciliation.test.ts:1050-1105` | PY |
| `validateXMLCertificate` without a certificate / with `ds:` prefix | TS `signing.test.ts:114-135` | PY |
| Schema compilation and real-fixture validation | PY `test_validation.py:45-182` | TS (fake binaries only) |
| `formatViolations` summary string | PY `test_validation.py:101-107` | TS |
| Transformer rejects invalid XML | PY `test_transformer.py:69` | TS |
| `to_dgii_error` / `toDgiiError` branch behaviour | neither (2 narrow TS cases only) | both |
| XSD copy byte-identity | PY `test_validation.py:154-158` (PY ↔ fixtures only) | TS |
| B2B approval 5xx surfacing | TS `client.test.ts:693-706` | PY |

---

## Gate inventory

| Gate | Command | Runs on PR? | Evidence observed |
|---|---|---|---|
| TS typecheck | `bun run typecheck` | yes — `.github/workflows/typescript.yml:30-31` | step present |
| TS lint + prettier (package) | `bun run lint` | yes — `typescript.yml:33-34` | step present |
| Repo-wide prettier | `packages/typescript/node_modules/.bin/prettier --check .` | yes — `typescript.yml:38-41`; also `mise run lint-format` | `.prettierignore` excludes `examples/fixtures/` and `site/` (read) |
| TS tests | `bun run test` | yes — `typescript.yml:43-44` | baseline 212/3 given; also collects `test/integration` (F-TEST-12) |
| **TS XMLDSig gate** | `bun run scripts/verify-signing.ts` after `apt-get install xmlsec1` | yes — `typescript.yml:66-76` | script signs 2 cases (real fixture + C14N-sensitive synthetic) and verifies with libxmlsec1 (`scripts/verify-signing.ts:96-160`) |
| TS build | `bun run build` | yes — `typescript.yml:78-79` | `tsup` `publicDir: 'schemas'` copies the schemas; no artifact assertion (F-TEST-13) |
| PY lock check | `uv lock --check` | yes — `python.yml:31-35` | step present |
| PY lint / format / typecheck | `ruff check .`, `ruff format --check .`, `mypy src` | yes — `python.yml:41-49` | mypy covers `src` only (documented in AGENTS.md) |
| PY tests | `uv run pytest` | yes — `python.yml:51-52` | baseline 244/3 given; also collects `tests/integration` (F-TEST-12) |
| **PY XMLDSig gate** | `uv run --with xmlsec python scripts/verify_signing.py` | yes — `python.yml:52` | signs `invoice-31.xml` and verifies through the `xmlsec` binding (`scripts/verify_signing.py:62-80`) |
| PY build | `uv build` | yes — `python.yml:55-56` | no wheel-content assertion (F-TEST-13) |
| pre-commit bundle (ruff, ruff-format, prettier, tsc, mypy, gitleaks, certificate-material, commit-msg) | `mise run hooks` | yes — `.github/workflows/pre-commit.yml:38-46` | hooks present in `.pre-commit-config.yaml`; `gitleaks` has `always_run: true`; `certificate-material` is `language: fail` on `\.(p12\|pfx\|pem\|jks\|…)$` |
| **Docs build (en + es, nav, links)** | `uvx --from mkdocs --with mkdocs-material --with "mkdocs-static-i18n>=1.0,<2" mkdocs build --strict` | yes, **path-filtered** to `docs/**`, `mkdocs.yml`, `docs.yml` — `docs.yml:1-12,31-32` | **verified by running**: exit 0; builds `en` → `site/`, `es` → `site/es/`; "Translated 13 navigation elements to 'es'"; `site/search/search_index.json` written |
| Docs strictness actually fails on a broken link | same command, on a `/tmp` copy with `[broken](./does-not-exist.md)` appended to `docs/en/faq.md` | (same gate) | **verified by running**: exit 1 — `WARNING - Doc file 'en/faq.md' contains a link './does-not-exist.md', but the target 'en/does-not-exist.md' is not found among documentation files.` → `Aborted with 1 warnings in strict mode!` |
| Docs en/es file-list parity | `diff <(cd docs/en && find . -name '*.md' \| sort) <(cd docs/es && …)` + `test -f site/es/index.html` | yes — `docs.yml:34-38` | **verified by running**: `PARITY_OK`; 11 `.md` pages in each locale; `site/es/index.html` exists |
| Rendered-HTML / search / browser-level check | — | **no** | no Playwright, Cypress or any browser tooling in the repo (grep hits only `.omp/agent` prompt files). The docs gate proves *build* (and, via `--strict`, nav + internal links), not *render*: nothing asserts the `es` search index contains Spanish terms, that `site/es/**` pages carry translated nav, or that anchors resolve in the rendered HTML |
| Live DGII integration | `bun run vitest run test/integration`, `uv run pytest tests/integration -v` | **no** — `workflow_dispatch` only (`integration.yml:8-16`) | intentional and documented (consumes an authorised sequence per run); also reachable from the default `test` command locally (F-TEST-12) |

`mise.toml` ↔ workflows cross-check:

| Promised by | Promise | CI reality |
|---|---|---|
| `mise run ci` (`mise.toml:122-124`) | "Full CI pipeline locally (lint + test + build)" | omits both XMLDSig gates and `uv lock --check` (F-TEST-14) |
| `mise run docs-build` (`mise.toml:111-113`) | strict docs build | no workflow calls the task; `docs.yml:31-32` inlines the same `uvx` command (duplicated, can drift) |
| `mise run verify-signing-typescript` (`mise.toml:78-82`) | TS XMLDSig gate | run by `typescript.yml:76` ✅ |
| AGENTS.md §Commands (Python gate as a raw command) | PY XMLDSig gate | run by `python.yml:52` ✅, but there is **no mise task** for it |
| `mise run hooks` | every pre-commit hook | run by `pre-commit.yml:46` ✅ (with `SKIP=no-commit-to-branch`) |
| AGENTS.md §Tests ("Integration tests are opt-in via `DGII_*`") | live suite never runs by default | true in CI; **not** true locally (F-TEST-12) |
| AGENTS.md §Tests ("`examples/fixtures/` is byte-sensitive … reformatting invalidates signing tests") | a reformat must fail something | nothing fails (F-TEST-15) |
| AGENTS.md §Tests ("XSDs must stay byte-identical; edit all copies or none") | drift detection | only PY ↔ fixtures is asserted; TS copy unasserted (F-TEST-13) |

---

## Coverage

### What I checked

- **Public surface, both packages.** Every member of `src/index.ts` (14 re-exported modules) and
  `__init__.py` (`__all__`, 78 names) mapped to the tests that touch it, by grep plus reading.
  Matrix above.
- **Test file inventory and test names, both suites.** All 17 TS files and 17 PY files (incl.
  `tests/integration/`) listed and read; every `it(`/`def test_` name enumerated and compared across
  languages to find asymmetries.
- **Signing (read + run).** Verified that the digest assertions are *not* self-consistent
  (`signing.test.ts:52-73`, `signing.test.ts:137-147`, `test_signing.py:86-96` pin digests computed
  outside the SDK), and that the XMLDSig gates use libxmlsec1 rather than the SDK's own verifier.
- **Validation (run).** Ran the real `xmllint` (from `/tmp/dgii-tools`) through TS `validateDocument`
  and compared against PY `validate_document` on the same fixtures — the F-TEST-01 divergence.
- **Concurrency (run).** Barrier-store probe against PY `_submit_idempotent` and `Promise.all` probe
  against TS `submitIdempotent` — the F-TEST-03 divergence.
- **Hostile input (run).** Internal/external entities, `file://` and `http://` SYSTEM ids, and a
  6-level entity-expansion bomb through both signing implementations.
- **Endpoint parity (run).** Dumped both `Endpoint`/`SenderReceiverEndpoint`/`StatusEndpoint`/
  `BaseUrl` tables and diffed them: identical today.
- **Docs site (run).** `mkdocs build --strict` on the real repo (pass) and on a `/tmp` copy with a
  broken link (fail), plus en/es file-list parity and `site/es/index.html`.
- **Hygiene (run).** `diff -r` of the three schema directories, `md5sum` of the three
  `MANIFEST.json`, `git ls-files` for key material (none tracked; `examples/output/test.p12` is
  gitignored via `.gitignore:206`), `.prettierignore` and `.pre-commit-config.yaml` exclusions for
  the byte-sensitive fixtures.
- **CI wiring.** All 7 workflows read; `mise.toml` cross-checked against them (table above).

### What I did **not** check

- I did not re-run the suites (baseline supplied) and did not measure coverage numbers
  (`vitest --coverage` / `pytest --cov`); the matrix is test-name/file based, not line based.
- I did not run either XMLDSig gate myself (both reported green in the baseline); I read the scripts
  and confirmed they are independent of the SDK's own verifier.
- I did not run `bun run build` / `uv build`, so the claim that `dist/schemas` and the wheel
  currently contain the schemas is inferred from `tsup.config.ts` and `pyproject.toml`, not observed.
- I did not exercise the live DGII integration suites (no credentials, and they consume a sequence
  number).
- I did not test TLS errors, redirect handling, or oversized (>10 MB) payloads — see Needs follow-up.
- Browser-level: I verified the docs **build**, not the rendered HTML in a browser; no browser
  automation exists in the repo to reuse.

---

## Needs follow-up

1. **Decide and implement the fix for F-TEST-01** — `VIOLATION_LINE`
   (`packages/typescript/src/validation.ts:84`) needs to parse `LOC: Schemas validity error :
   Element 'X': …` (the real format), or the TS side should adopt a real XSD engine. Whichever way,
   the parity assertion against Python's `path` must exist.
2. **Fix or document the Python duplicate-submission race (F-TEST-03)** — add a lock (or a
   single-flight map) around `get`/`set` in `_submit_idempotent`, then add the failing-today test.
   This is the only finding with a plausible duplicate-fiscal-document outcome and it needs an
   owner decision, not just a test.
3. **Add the contract-level test layer that currently does not exist** (F-TEST-02, F-TEST-06): one
   assertion on the multipart body, one on the absolute summary URL, in each package. Cheap, and
   they close the two highest-value unproven wire facts.
4. **Close the Python public-API gaps** (F-TEST-04, F-TEST-05, F-TEST-10): `tests/test_certificate.py`,
   four `track_statuses` cases, five `to_dgii_error` cases.
5. **Make the live suite un-runnable by accident** (F-TEST-12) — a pytest marker plus a vitest
   `exclude`, before the next person exports `DGII_*` for `examples/`.
6. **Decide the DTD/entity policy explicitly** (F-TEST-09) and pin it in both suites; today the two
   SDKs answer the same document differently.
7. **Out of scope for this review but worth a security pass** — four behaviours with no test in
   either package:
   - *Redirect policy, and it differs.* TS calls `fetch` with no `redirect` option
     (`packages/typescript/src/http.ts`, grep for `redirect`: no hits), so it **follows** redirects
     and would replay the `Authorization: Bearer …` header to whatever host DGII (or a MITM) points
     at. Python builds `httpx2.Client(timeout=…)` with no `follow_redirects`
     (`packages/python/src/py_dgii_ecf/http.py:121`), and httpx's default is **not** to follow. Same
     request, two policies, zero assertions.
   - *Header injection:* the bearer token is whatever DGII returned (`client.ts:349`,
     `client.py:320`); no test feeds a `token` containing CR/LF or a space.
   - *TLS errors:* no test injects a certificate failure and asserts the resulting
     `code`/`retryable` (a retried TLS failure is a silent retry loop).
   - *Oversized payloads:* no test feeds a multi-megabyte XML body through signing, validation or
     the HTTP layer; the only bound in the code is `maxBuffer: 8 * 1024 * 1024`
     (`packages/typescript/src/validation.ts:142`).
8. **Suite-health note (not a finding):** there is no `waitForTimeout`-class problem, no committed
   key material, no network access in the unit suites, and both suites inject clocks where time
   matters (`test/http.test.ts:7-20`, `tests/test_http.py:13-24`, `test/token.test.ts:55-205`,
   `tests/test_token.py:43-218`). Determinism is not the risk here; the risk is what is *unasserted*.
