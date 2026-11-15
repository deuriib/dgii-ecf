# DGII Domain & Environments Review

> **Reviewer:** Rafael — DGII e-CF domain expert (review board, phase 1)
> **Dimension:** DGII functionality + environments (parity between `@deuriib/dgii-ecf` and `py-dgii-ecf`)
> **Baseline accepted as measured, not re-run:** TS 212 tests / PY 244 tests green, both lints green, both
> libxmlsec1 XMLDSig gates green.
> **Method:** read `AGENTS.md`, `project-specs/dgii-ecf-setup.md` (+ Appendix A), `project-docs/dgii-ground-truth.md`,
> `project-docs/architecture.md` (§4–§14), `project-docs/response-contracts.md`, then both source trees in full.
> Every behavioural claim was then exercised with throwaway probes in `/tmp` (no repo file touched): a local
> HTTP echo server for wire-shape parity, mocked transports for the response paths, and both SDKs run side by
> side on the same fixtures. Local environment: Bun 1.4.4, Node 26.13.0, CPython 3.12.16, `httpx2` 2.16.0.
> `xmlsec1` and `xmllint` are **not** installed on this machine, so the XMLDSig gates were not re-run here
> (baseline relied upon; see Coverage).

---

## Verdict

**NOT ALIGNED.**

The *shared DGII contract* is aligned and I could not find a single divergence in it: the 21 environment /
endpoint / sender-receiver / status literals are set-identical across the two packages (machine-diffed), every
call site uses the same base URL and verb, the multipart wire shape is byte-comparable on a local echo server,
the RD$250,000 reception boundary agrees on all 10 edge cases I threw at it, the QR URLs are byte-identical,
and the same document signed by both SDKs produces the **same `<DigestValue>`** — which proves the canonical
bytes agree, not merely that each package agrees with itself. The divergence is therefore not in "does it know
DGII's rules" but in **what each package does with what DGII answers**. TypeScript treats any 2xx as success and
casts the body to the model with no check (`packages/typescript/src/http.ts:222`), which on an unreadable 200
returns `Ok(undefined)`, *overwrites the pending idempotency marker with `undefined`
(`packages/typescript/src/client.ts:255`) and re-transmits the same e-NCF on the next call* — the exact failure
`AGENTS.md` forbids. Python refuses the same bodies and keeps the lock (`packages/python/src/py_dgii_ecf/client.py:251,261`).
On top of that, both packages share one idempotency key across destinations, so a B2B delivery after a DGII
submission is answered from cache and **never sent to the buyer** (proven). Environments, endpoints, routing
and signing are production-ready; the submission/response contract is not, and it is not identical.

---

## Findings

| ID        | Severity | Title                                                                                                        | Package(s)  | Verified by |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------ | ----------- | ----------- |
| F-DGII-01 | BLOCKER  | A 2xx with an unreadable body is success in TS: `Ok(undefined)` destroys the idempotency lock and re-sends   | TS          | running     |
| F-DGII-02 | HIGH     | One idempotency key for all destinations: a buyer-host delivery after a DGII submission is served from cache  | TS + PY     | running     |
| F-DGII-03 | HIGH     | `validateBeforeSend` refuses E31 (and cannot validate RFCE/ACECF): the pre-send gate blocks the common case  | TS + PY     | running     |
| F-DGII-04 | HIGH     | `convertECF32ToRFCE` throws on a non-`ECF` root (TS) and returns a structurally invalid RFCE (TS vs PY)      | TS (vs PY)  | running     |
| F-DGII-05 | MEDIUM   | TS applies no success-path model validation where PY fails the whole read; §14.1 misdescribes PY as "drops"  | TS + PY     | running     |
| F-DGII-06 | MEDIUM   | Money as floating point in both packages (`montoTotal`/`totalITBIS`, FC QR argument)                          | TS + PY     | reading     |
| F-DGII-07 | MEDIUM   | No e-NCF structure validation and no `TipoeCF` ↔ e-NCF consistency rule; routing and QR infer type differently | TS + PY    | reading     |
| F-DGII-08 | MEDIUM   | No certificate preflight: expiry and signer-RNC binding are never checked before signing or sending          | TS + PY     | reading     |
| F-DGII-09 | LOW      | `check_b2b_applicability` is not exported by `py_dgii_ecf`, though the contract says it is                   | PY          | running     |
| F-DGII-10 | LOW      | `Transformer.json2xml` accepts multiple roots (TS) and pretty-prints (TS) where PY errors and emits one line  | TS (vs PY)  | running     |
| F-DGII-11 | LOW      | PY decimal pattern accepts a trailing newline that TS rejects (currently unreachable through the client)      | PY (vs TS)  | running     |
| F-DGII-12 | LOW      | `DgiiError.resource`/`method` never populated by PY on HTTP failures (wider than registered F-126-12)        | PY (vs TS)  | reading     |
| F-DGII-13 | LOW      | §9.1 promises a `fileName` fallback for the idempotency key; neither package implements it                   | TS + PY     | reading     |
| F-DGII-14 | LOW      | The injectable clock has different units under the same option name (`now`: ms vs s)                         | TS + PY     | reading     |
| F-DGII-15 | LOW      | `formatViolations` / `format_violations` render path-less violations differently                             | TS + PY     | reading     |

---

### F-DGII-01 — BLOCKER — A 2xx with an unreadable body is success in TypeScript: `Ok(undefined)` destroys the idempotency lock and re-sends

**Where.** `packages/typescript/src/http.ts:202-213` (`readBody`: the decoder is chosen by `content-type`;
any JSON parse failure or empty body collapses to `undefined`), `packages/typescript/src/http.ts:219-222`
(`if (response.ok) return ok(data as T)` — an unchecked cast, no shape rule at all),
`packages/typescript/src/client.ts:242-243` (`cached !== undefined` decides "not cached"),
`packages/typescript/src/client.ts:253-256` (`set(key, result.value)` — caches `undefined`).
Python counterpart for contrast: `packages/python/src/py_dgii_ecf/http.py:156-165` (tries `response.json()`
regardless of `content-type`, falls back to text/`None`), `packages/python/src/py_dgii_ecf/client.py:251`
(refuses a non-dict), `:261` (caches the raw dict), `:277` (`cached is not None`).

**What is wrong (verified by running).** Same client, same signed XML, three DGII-shaped 200s:

| DGII 200 body                         | TypeScript                                     | Python                                             |
| ------------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| `text/plain` + `{"trackId":"T1",…}`   | `Ok("{\"trackId\":\"T1\",…}")` → `.trackId` is `undefined` | `Ok(InvoiceResponse(track_id='T1'))`     |
| empty body, `application/json`        | `Ok(undefined)`; **2nd call re-sends** (1 → 2 HTTP calls) | `Err(VALIDATION)`, marker kept, **no** re-send |
| `text/html` + `<html>OK</html>`       | `Ok("<html><body>OK</body></html>")`           | `Err(VALIDATION)`                                   |

The middle row is the fiscal one: `submitIdempotent` writes `PENDING_SUBMISSION`, gets an `Ok(undefined)`,
and stores `undefined` in place of the response. The next call's `cached !== undefined` is `false`, so the
SDK fires the POST again with the same `eNCF`. `AGENTS.md` ("Idempotency persists before transmit… delete it
on failure") and `architecture.md` §9.3 assume a success replaces the marker; here success *deletes* its value.

**Why it matters to a real issuer.** The trigger is any 200 whose body the SDK cannot read, and nothing in
the repo guarantees that a 200 always carries a JSON object: `response-contracts.md` already records that
DGII's bodies include bare strings, ProblemDetails and HTML pages. An empty 200 (a proxy or an ASP.NET action
returning no content) is the cheapest way to hit it, and the consequence is a duplicate e-CF submission of a
sequence the issuer has already consumed — an audit finding, plus a rejected duplicate that must be reversed
with an E34. The caller cannot detect it: `isOk()` is `true`. I am not claiming DGII does this on a given day;
I am claiming the package has no defence and the other package does.

**Fix.**
- `packages/typescript/src/http.ts`: decode like Python does — attempt JSON first, ignore `content-type`;
  return the text only when JSON fails, `undefined` only when the body is truly empty.
- `packages/typescript/src/http.ts:222`: do not hand back an unchecked cast for the submission methods.
  Either (a) `postMultipart` validates the body is a JSON object and returns `Err(VALIDATION)` with
  `'Unexpected DGII response payload'` (Python's literal) otherwise, or (b) `client.ts` validates the three
  submission models before caching.
- `packages/typescript/src/client.ts:242-256`: never cache a non-object; keep `PENDING_SUBMISSION` and return
  `Err(VALIDATION)` telling the caller to `reconcileSubmission()` — exactly `Python`'s
  `_cache_submission` contract (`client.py:241-262`).
- Mirror the behaviour test in both suites so parity is enforced, not remembered.

**How to verify.** Add `packages/typescript/test/http.test.ts` and `packages/python/tests/test_http.py` cases
for the three bodies above asserting `Err(VALIDATION)` + one HTTP attempt on the repeat call; then
`cd packages/typescript && bunx vitest run test/http.test.ts test/client.test.ts` and
`cd packages/python && uv run pytest tests/test_http.py tests/test_client.py`.

---

### F-DGII-02 — HIGH — One idempotency key for all destinations: a buyer-host delivery after a DGII submission is served from cache

**Where.** `packages/typescript/src/client.ts:573-578` (key computed, then either the DGII URL or the
`buyerHost` URL is sent under it), `:821-851` (same for ACECF: one `key`, two branches),
`packages/python/src/py_dgii_ecf/client.py:408-412` / `:704-728` (identical structure),
key derivation `packages/typescript/src/client.ts:215` / `packages/python/src/py_dgii_ecf/client.py:223`
(`RNC:eNCF:SHA-256(xml)` — no destination, no endpoint, in the key).

**What is wrong (verified by running).** Submit to DGII, then deliver the same document to the buyer:

```
TS: dgii  -> true {"trackId":"DGII-TRACK-1","mensaje":"Recibido"}
    buyer -> true {"trackId":"DGII-TRACK-1","mensaje":"Recibido"}
    http calls made: 1   ["https://ecf.dgii.gov.do/TesteCF/recepcion/api/FacturasElectronicas"]
PY: dgii  -> True InvoiceResponse(track_id='DGII-TRACK-1', …)
    buyer -> True InvoiceResponse(track_id='DGII-TRACK-1', …)      # identical object, no request
    http calls: 1
ACECF (PY): dgii -> Ok(CommercialApprovalResponse(codigo='1', …))
            buyer -> Err VALIDATION: field 'status' must be an integer, got NoneType
ACECF (TS): dgii -> Ok({"codigo":"1", …})
            buyer -> Ok({"codigo":"1", …})  accepted: undefined      # no request
```

The buyer host is **never contacted**, and `sendElectronicDocument` returns `Ok`. TS has no test that
produces this state — every `buyerHost` test builds a fresh client
(`packages/typescript/test/client.test.ts:648-700`), and the only PY `buyer_host` test covers the RFCE
rejection (`packages/python/tests/test_client.py:647`).

**Why it matters to a real issuer.** Ground truth §9/§10 (quoting Norma General 01-2020 Art. 8 ¶I) puts the
acknowledgement duty on the receiver and the conformity duty on the buyer — but a document nobody delivered
cannot be acknowledged, and the issuer's only fallback is reporting it in Formato 606. An issuer that calls
"send to DGII, then send to the buyer" ends with a green log line, no buyer delivery, no `<ARECF>`, and no
evidence for its own 606 position. The ACECF variant is worse: the buyer's approval is never requested, so the
issuer must assume "not approved" and issue an E34 for a document the buyer may well have accepted.

**Fix.** Scope the key to the destination. Cheapest correct form, in both packages:
`key = ${rnc}:${encf}:${sha256(signedXml)}:${destination}` where `destination` is
`dgii:${endpoint}` or `buyer:${normalisedHost}${path}`. Keep `buildIdempotencyKey` as the pure document hash
and wrap it at the four call sites (`sendElectronicDocument`, `sendSummary`, `sendCommercialApproval`,
`voidENCF`). Update `architecture.md` §9.1 in the same commit (the doc is the contract for the key).

**How to verify.** New test per package: one client, `sendElectronicDocument(xml, f)` then
`sendElectronicDocument(xml, f, buyerHost)` → assert **2** HTTP calls and the second URL is
`{buyerHost}/fe/recepcion/api/ecf`; same for `sendCommercialApproval` asserting
`{status: 200, accepted: true}` / `B2BCommercialApprovalResponse`. Run the existing
`test/client.test.ts` + `tests/test_client.py` for regressions.

---

### F-DGII-03 — HIGH — `validateBeforeSend` refuses E31 (and cannot validate RFCE/ACECF): the pre-send gate blocks the common case

**Where.** `packages/typescript/src/validation.ts:27-41` (`SCHEMA_FILES` has no `ECF|31`),
`:43-46` (`UNAVAILABLE_SCHEMAS['ECF|31']`), `:126-136` (an unavailable schema returns `Err`),
`packages/typescript/src/client.ts:556-569` (an `Err` from `validateDocument` aborts the send);
`packages/python/src/py_dgii_ecf/validation.py:23-37`, `:39-41`, `:94-104`;
`packages/python/src/py_dgii_ecf/client.py:381-396`. Manifest rationale:
`packages/typescript/schemas/MANIFEST.json` (`excluded`), `examples/fixtures/schemas/README.md`.

**What is wrong (verified by running).**

```
invoice-31.xml -> Err: Schema unavailable for ECF 31: the published schema references
                       IndicadorServicioTodoIncluidoType, which does not resolve
invoice-32.xml -> Ok(1 violations)
anecf.xml      -> Ok(1 violations)
acecf.xml      -> Err: Schema unavailable for ACECF: … invalid pattern facet
```

E31 is *the* crédito-fiscal document — the flagship fixture of this repo is an E31
(`examples/fixtures/invoice-31.xml`, `verify-signing.ts` signs it). RFCE 32 and ACECF are equally
unavailable. `sendSummary` never validates at all (`client.ts:588-601`), so the RFCE path is unchecked
even when the caller asked for validation.

**Why it matters to a real issuer.** Turning on the SDK's own quality gate makes the most common document
type unsendable — a support ticket that reads "the SDK says my schema is missing" on day one of production.
The alternative (turn it off) means E31s ship with no structural check whatsoever — and E31 is where a
malformed `RNCEmisor`/`RNCComprador` (`RNCValidationType`, `[0-9]{11}|[0-9]{9}`, `e-cf-32.xsd:542-546`) or a
missing mandatory `Encabezado` child is caught before DGII rejects it.

**Fix.** Separate "the document does not validate" (block) from "DGII never published a usable schema for
this type" (degrade, loudly). In `validation.ts:126-136` / `validation.py:94-104`, return a distinct
outcome — e.g. `Ok([])` plus a `skipped: true` flag, or a new `DgiiErrorCode` — and have
`client.ts:556-569` / `client.py:381-396` send anyway while surfacing the skip (log/callback). Bundling the
three `upstream-invalid/` schemas is explicitly forbidden (`AGENTS.md`), so degrading is the only honest
option. Document the E31/RFCE/ACECF hole in `docs/en|es` and `architecture.md` §14.

**How to verify.** `cd packages/python && uv run pytest tests/test_validation.py` after
`validate_document(Path('examples/fixtures/invoice-31.xml').read_text())` is asserted to be `Ok` + skipped;
TS: `DGII_XMLLINT_BIN` fake + `validateDocument` returning the skip marker, and
`validateBeforeSend: true` on an E31 producing exactly one HTTP attempt.

---

### F-DGII-04 — HIGH — `convertECF32ToRFCE` throws on a non-`ECF` root (TS) and returns a structurally invalid RFCE (TS vs PY)

**Where.** `packages/typescript/src/utils.ts:170-185` — `const encabezado = parsed.value.ECF.Encabezado;`
(`ECF` is not optional-chained), `:241-252` (`Ok` whenever the pruned object is an object);
`packages/python/src/py_dgii_ecf/utils.py:134-147` (`_as_dict(_deep_get(parsed, "ECF", "Encabezado"))`,
`None` → `Err("Encabezado not found")`).

**What is wrong (verified by running).**

```
input: <ANECF><SignatureValue>abcdef123456</SignatureValue></ANECF>
  TS -> THREW: TypeError: undefined is not an object (evaluating 'parsed.value.ECF.Encabezado')
  PY -> Err(VALIDATION)

input: <ECF><SignatureValue>abcdef123456</SignatureValue></ECF>   (no Encabezado)
  TS -> Ok("<?xml…?>\n<RFCE>\n  <Encabezado>\n    <CodigoSeguridadeCF>abcdef</…>")
  PY -> Err(VALIDATION: Encabezado not found)
```

So on a document of the wrong root TS **throws out of a `Result`-returning API** (violating the
"results, not exceptions" invariant, `AGENTS.md` §Invariants), and on a truncated E31 it hands back an
RFCE containing only a security code.

**Why it matters to a real issuer.** `convertECF32ToRFCE` sits on the mandatory path for every E32 below
RD$250,000 (ground truth §7 — those *must* be sent as an RFCE). A caller who loops over a mixed batch and
catches nothing gets a process-killing `TypeError` mid-batch, or — worse — signs and submits an RFCE with no
`Version`, `IdDoc`, `Emisor` or `Totales`, which DGII rejects on receipt while the issuer believes the
summary was built.

**Fix.** In `utils.ts`, mirror the Python contract: read the root from the parsed JSON, and if
`parsed.value.ECF?.Encabezado` is not an object return
`err(new DgiiError('Encabezado not found', { code: 'VALIDATION' }))` — the Python literal — before touching
any field. Wrap the whole body so nothing can escape as a `TypeError` (the existing `try/catch` policy is
`err`-only via `Transformer`, which does not cover this line). Fix needs no Python change.

**How to verify.** Add to `packages/typescript/test/utils.test.ts`: an `ANECF` document with a
`SignatureValue` and an `ECF` without `Encabezado`; assert `isErr()` and the same message/code Python
produces. Run `bunx vitest run test/utils.test.ts` and `uv run pytest tests/test_utils.py`.

---

### F-DGII-05 — MEDIUM — TS applies no success-path model validation where PY fails the whole read; §14.1 misdescribes PY as "drops"

**Where.** `packages/typescript/src/http.ts:222` (no validation whatsoever) and the model methods that
consume it: `client.ts:734-760` (`getCustomerDirectory`), `:645-673` (`statusTrackId`),
`packages/python/src/py_dgii_ecf/types.py:428`, `:474`, `:539` (`_as_int` / `_as_str` **raise**
`ResponseShapeError` → `Err(VALIDATION)`), `client.py:84-100` (`_parse_one`).
The registered divergence that is supposed to cover this:
`project-docs/architecture.md` §14.1 "Model echo" — *"Python drops it (`0`/`null`)"*.

**What is wrong (verified by running).** Side by side, same body, same call:

| Call / body                                                    | TypeScript                       | Python                                    |
| -------------------------------------------------------------- | -------------------------------- | ----------------------------------------- |
| `sendSummary` ← `{"codigo":"x"}`                               | `Ok({"codigo":"x"})`             | `Err` `field 'codigo' must be an integer, got 'x'` |
| `getServiceStatus` ← `[{"servicio":5}]`                        | `Ok([{"servicio":5}])`           | `Err` `field 'estatus' must be a string…` |
| `getCustomerDirectory` ← `{"nombre":5}`                        | `Ok([{"nombre":5}])`             | `Err` `field 'rnc' must be a string…`     |
| `getCustomerDirectory` ← `"nope"`                              | `Ok(["nope"])`                   | `Err` `Unexpected DGII response payload`  |
| `statusTrackId` ← `{}`                                         | `Ok({})` (typed as an object with 6 **required** fields) | `Ok(TrackingStatusResponse(codigo=0, estado=''))` |

Two things are wrong. (a) The packages disagree on **whether the read happened**: TS reports success, PY
reports failure — that is decision-relevant and is a parity break, not a cosmetic one. (b) `§14.1`'s
"Model echo" entry says Python *drops* the value to `0`/`null`; for `InvoiceSummaryResponse.codigo`,
`ServiceStatusEntry.estatus` and `ServiceDirectoryResponse.rnc` Python **fails the parse**
(`types.py:428`, `:539`, `:443-453`). The registered divergence understates the difference, so a reader of the
parity promise is misled. Also note `packages/typescript/src/types.ts:26-40` declares
`trackId`/`codigo`/`estado`/`rnc`/`encf`/`fechaRecepcion` as required, while the runtime accepts `{}`.

**Why it matters to a real issuer.** A malformed directory entry makes the whole payable-master lookup fail
in Python but "succeed" in TS with a `urlRecepcion` of `undefined` — the same code, ported, either refuses to
deliver the e-CF or builds the URL `undefined/fe/recepcion/api/ecf`. Whichever direction the team picks, both
pick it.

**Fix.** Choose the strict side (Python) because a body the SDK cannot read is not evidence:
- TS: add the same field rules to the six response models (a tiny `readString`/`readInt` helper next to
  `isRecord` in `client.ts`) and return `Err(VALIDATION)` naming the field; then correct
  `types.ts:26-40` to optional where DGII omits.
- Or, if tolerance is wanted, relax Python and delete the "Model echo" row — but do not leave the two
  packages answering differently.
- Update `architecture.md` §14.1 with whatever is decided, in the same commit.

**How to verify.** Port the five rows of the table above into `test/types.test.ts` + `tests/test_types.py`
and require identical `Ok`/`Err` verdicts. Run both suites.

---

### F-DGII-06 — MEDIUM — Money as floating point in both packages

**Where.** `packages/typescript/src/types.ts:59-60` (`montoTotal?: number; totalITBIS?: number;`),
`packages/python/src/py_dgii_ecf/types.py:350-351` (`monto_total: float | None`),
`packages/typescript/src/utils.ts:27` (`montototal: number` in `generateFcQRCodeURL`),
`packages/python/src/py_dgii_ecf/utils.py:32` (`montototal: int | float | str`).
Invariant broken: `AGENTS.md` "Money is never floating point"; `architecture.md` §11 "Money round-trips as
`string` (TS) / `Decimal`→`str` (Python); no numeric coercion".

**Why it matters to a real issuer.** These are the fields a finance team reconciles `consultaestado` and the
printed QR against. `float`/`number` cannot represent `0.1` exactly, and a reconciliation that compares
`monto_total` to a ledger `Decimal` will disagree by a cent on some records — on a tax document. The FC QR
argument is worse: it *encourages* the caller to pass a computed total, and `String()` then prints the binary
artefact into the URL — `String(0.1 + 0.2)` is `"0.30000000000000004"` (verified by running), which is what
`generateFcQRCodeURL` would put in `montototal=`, producing a QR that does not match the ticket.

**Fix.** `types.ts:59-60` → `montoTotal?: string; totalITBIS?: string` (documented as DGII's decimal string);
`types.py:350-351` → `Decimal | None` parsed with `Decimal(str(value))`, never `_as_float`
(`types.py:170-181` is only used here — delete or repurpose it). `generateFcQRCodeURL` → `montototal: string`
and `generate_fc_qr_code_url` → `montototal: str`, with callers formatting via `roundHalfUpToCents` /
`Decimal.quantize`. Both packages, same commit; add the note to `response-contracts.md`.

**How to verify.** `grep -n "float\|: number" packages/python/src/py_dgii_ecf/types.py
packages/typescript/src/types.ts` shows no remaining money field; add a test asserting
`InquiryStatusResponse.from_dict({"montoTotal": "1180.10"}).monto_total == Decimal("1180.10")` and the TS
equivalent `=== '1180.10'` (no precision loss round-trip).

---

### F-DGII-07 — MEDIUM — No e-NCF validation and no `TipoeCF` ↔ e-NCF consistency rule

**Where.** No e-NCF pattern exists anywhere in `packages/typescript/src` or `packages/python/src` (grep for
`eNCF`, `[0-9]{11}` and `encf_pattern` matches only vendored XSDs). The type is read from `TipoeCF` for
routing (`packages/typescript/src/reception.ts:101-147`, `packages/python/src/py_dgii_ecf/reception.py:78-124`)
but **inferred from the e-NCF string** for the QR:
`packages/typescript/src/utils.ts:49-51` (`!/E43/i.test(encf) && !/E47/i.test(encf)`),
`packages/python/src/py_dgii_ecf/utils.py:57-59` (`re.search(r"E43|E47", encf, re.I)`).
What the schema does enforce: `eNCF` is `eNCFValidationType` =
`<xs:pattern value="([a-z0-9A-Z]{13})"/>` + `minLength`/`maxLength` 13 (`e-cf-32.xsd:452-456`, identical in
`e-cf-34.xsd:449-453` and in the E31 schema), i.e. 13 alphanumeric characters and nothing about the type
prefix. The repo's own fixtures follow the DGII convention `E` + 2-digit type + 10 digits
(`examples/fixtures/invoice-31.xml` → `E310000000001`).

**What is wrong (verified by reading).** Three gaps, all in both packages:
1. Even the XSD's 13-alphanumeric rule is unenforced before the `eNCF` is interpolated into the idempotency
   key (`client.ts:215-232`, `client.py:223-238`) and into the QR URL.
2. Nothing ties `IdDoc/TipoeCF` to the e-NCF prefix, so one document carries two self-declared types and the
   routing decision reads only one of them.
3. The QR decides "omit `RncComprador`" by regex-sniffing `E43`/`E47` out of whatever string the caller
   passes — the type of a fiscal document inferred from free text.

**Why it matters to a real issuer.** The printed QR is what the DGII verification portal and the customer
read: a QR built from an e-NCF whose prefix disagrees with `TipoeCF` shows the wrong document to the auditor,
and for E43 an e-NCF formatted differently (`"e43…"`, a bare sequence number, a trailing space) silently gets
the `RncComprador` parameter it must not carry. The e-NCF is also the legal counter (`AGENTS.md`, persona
rule 7): the SDK already assumes its shape when it derives the idempotency key, so validating it costs one
regex — and the mismatch is cheap to catch before signing, not after a DGII rejection.

**Fix.** Add to `reception.ts` / `reception.py` (exported from both, used by `resolveReceptionRoute` and by the
QR helpers):
- `ENCF_PATTERN = /^[A-Za-z][A-Za-z0-9]{12}$/` for the schema rule, plus the DGII convention check
  `/^E(3[1-4]|4[134567])\d{10}$/`.
- In `resolveReceptionRoute`, `Err(VALIDATION)` when the e-NCF fails either check, and when
  `eNCF.slice(1, 3) !== TipoeCF` — name the exact pair `IdDoc/eNCF` vs `IdDoc/TipoeCF` in the message.
- In `generateEcfQRCodeURL` / `generate_ecf_qr_code_url`, validate `encf` instead of regex-sniffing it (or take
  an explicit `tipoECF`/`tipo_ecf` argument, which is cleaner and removes the guess entirely).
Land it in both packages with identical messages. Record the convention in `dgii-ground-truth.md` §7 — the
file currently documents the type codes but not the e-NCF shape — and note in Needs follow-up whether DGII
actually rejects a `TipoeCF`/e-NCF mismatch (that is the one fact I could not source).

**How to verify.** Unit tests in both suites: `resolveReceptionRoute(<eNCF "E990000000001">)` → `Err`;
`<TipoeCF 31, eNCF E320000000001>` → `Err`; `<eNCF "E31000000001">` (12 chars) → `Err`;
QR with `encf="E4300000000"` → `Err`.

---

### F-DGII-08 — MEDIUM — No certificate preflight: expiry and signer-RNC binding are never checked

**Where.** `packages/typescript/src/signing.ts:70-76` (constructor stores the PEMs, no validity check) and
`:76-135` (`signXml`), `packages/python/src/py_dgii_ecf/signing.py:59-70`, `:112-160`;
`packages/typescript/src/certificate.ts:114-149` / `packages/python/src/py_dgii_ecf/certificate.py:116-172`
(`getCertificateInfo` exposes `validTo` but nothing consumes it). The only validity check in either package is
`validateXMLCertificate` (`signing.ts:150-178` / `signing.py:199-222`), which is a *post-hoc* helper and is **never
called** from `client.ts`/`client.py` or from `signXml`/`sign_xml` (verified by grep over `src`).

**What is wrong (verified by reading).** Nothing in either SDK refuses to sign with, or transmit under, an
expired, not-yet-valid or wrong-signer certificate, and nothing reads the certificate subject/serial to compare
it with `RNCEmisor`. Ground truth §8 states the requirement the SDK does not enforce: *"the certificate `SN`
must match the RNC/cédula of the authorized signer or delegate"*.

**Why it matters to a real issuer.** A certificate is production infrastructure that rotates
(persona: "Certificate expiry: zero surprise incidents"). An expired `.p12` produces a signature that is
cryptographically perfect and legally worthless: every document is rejected, and the issuer discovers it after
a day of invoicing. This is also the persona's own test matrix row — *"Expired cert, wrong key, revoked chain →
preflight rejects before send"* — which neither package satisfies.

**Fix.** Add an explicit gate, both packages, opt-in default-on for submissions:
- `Signature`/`signing.py`: on construction (or a new `assertUsable(now)`), check
  `not_before <= now <= not_after` and that the certificate's public key matches the private key; return
  `Err(CERTIFICATE)` — those are the only two checks that need no network.
- `ECF.sendElectronicDocument`/`sendSummary`/`sendCommercialApproval`/`voidENCF`: run that gate before the
  idempotency write (so a rejected preflight leaves no marker).
- Optional, and gated behind an option: compare the certificate's `subject`/`serialNumber` with the document's
  `RNCEmisor` and warn/err on mismatch. Note the revocation check needs an OCSP/CRL fetch, so it belongs to an
  option, not to the default path.

**How to verify.** Sign with an ephemeral certificate whose `notAfter` is in the past (both existing signers
already build one with `±1h/±24h` windows — `verify-signing.ts:59-63`,
`verify_signing.py:31-44`) and assert `Err` from `signXml`/`sign_xml` plus zero HTTP calls from the client.

---

### F-DGII-09 — LOW — `check_b2b_applicability` is not exported by `py_dgii_ecf`

**Where.** `packages/python/src/py_dgii_ecf/__init__.py:37-44` imports six names from `.reception`;
`check_b2b_applicability` (`packages/python/src/py_dgii_ecf/reception.py:130`) is absent from both the import
and `__all__` (`__init__.py:104-171`). TypeScript exports it via `export * from './reception.js'`
(`packages/typescript/src/index.ts:10`) and `architecture.md` §4.12 lists it in the package surface;
`architecture.md` §5.13 explicitly promises `check_b2b_applicability` in `__init__.py`.

**Verified by running:** `hasattr(py_dgii_ecf, 'check_b2b_applicability') is False`,
`'check_b2b_applicability' in py_dgii_ecf.__all__ is False`.

**Why it matters.** A caller that gates its own B2B routing ("will the SDK let me send this to the buyer?")
can do it in TS and not in Python, so the ported code either imports a private module or duplicates the rule —
and a duplicated rule drifts.

**Fix.** Add `check_b2b_applicability` to `__init__.py`'s reception import and to `__all__`. (Same commit:
`UNAVAILABLE_SCHEMAS` / `SCHEMA_DIR` are exported by TS `validation.ts` but not by Python — either export them
too or stop exporting them in TS; `AGENTS.md` says the exported surface is `index.ts`/`__init__.py`, so pick one.)

**How to verify.** `uv run python -c "import py_dgii_ecf as m; assert 'check_b2b_applicability' in m.__all__"`
plus the existing `tests/test_reception.py`.

---

### F-DGII-10 — LOW — `Transformer.json2xml` accepts multiple roots (TS) and pretty-prints (TS) where PY errors and emits one line

**Where.** `packages/typescript/src/transformer.ts:98-127` (`spaces: 2`, and the `data` object is spread
whatever its keys — no single-root rule); `packages/python/src/py_dgii_ecf/transformer.py:76-95`
(`if not isinstance(pruned, dict) or len(pruned) != 1: raise ValueError("Expected exactly one root element")`,
and `etree.tostring` emits no indentation).

**Verified by running.**
`Transformer.json2xml({A:{x:'1'}, B:{y:'2'}})` → `Ok('<?xml…?>\n<A>\n  <x>1</x>\n</A>\n<B>\n  <y>2</y>\n</B>')`
— an XML document with two roots, which is not well-formed: `Signature.signXml` then refuses it
(`Err INVALID_XML: … Only one …`), Python's transformer refuses it earlier (`Err … Expected exactly one root
element`). And `convertECF32ToRFCE` returns indented XML in TS versus a single line in Python for the same
input (both probes above).

**Why it matters.** The transformer is public in both packages and produces the bytes of a fiscal document.
An indent added after signing invalidates the digest; ground truth §8 says *"the XML must not be altered (no
reformatting, no added newlines/indentation)"*. Nothing in TS prevents a caller from round-tripping through
`json2xml` and destroying a signature, and the two packages disagree on the bytes they hand back.

**Fix.** TS: enforce exactly one root (throw/`err` like Python), and default `spaces` to `0` — or make
indentation opt-in (`{ pretty: true }`) and document that pretty output must be re-signed. Match Python's
message. Add the rule to `architecture.md` §11.

**How to verify.** `bunx vitest run test/transformer.test.ts` with a two-root case asserting `isErr()`, and a
`convertECF32ToRFCE` fixture asserting the wrapped string contains no `\n` (same assertion in
`tests/test_utils.py`).

---

### F-DGII-11 — LOW — PY decimal pattern accepts a trailing newline that TS rejects

**Where.** `packages/python/src/py_dgii_ecf/reception.py:24`
(`re.compile(r"^\d+(?:\.\d+)?$")` — Python's `$` also matches before a trailing `\n`) versus
`packages/typescript/src/reception.ts:56` (`/^\d+(?:\.\d+)?$/` — JS `$` is end-of-input without `/m`).

**Verified by running:** `_DECIMAL_PATTERN.match('300000\n')` is truthy and
`compare_decimal('300000\n','250000') == 1` in Python; the same string is `Err('MontoTotal "300000\n" is not a
decimal amount')` in TS. **Currently unreachable through the client**, because `extract_element_text` strips
the text (`packages/python/src/py_dgii_ecf/_xml.py:63`), so I am not claiming an exploitable routing
difference today — only that the two public predicates differ on an input a caller can construct.

**Fix.** `\Z` instead of `$` in `reception.py:24` (both occurrences at `:111`, `:172` consume it), and add the
newline case to `tests/test_reception.py`.

**How to verify.** `uv run pytest tests/test_reception.py -k decimal`.

---

### F-DGII-12 — LOW — `DgiiError.resource`/`method` never populated by PY on HTTP failures

**Where.** `packages/typescript/src/http.ts:228-236` passes `resource`/`method`/`baseURL` into every
`DgiiError`; `packages/python/src/py_dgii_ecf/http.py:172-178` builds the `DgiiError` with `status`,
`status_text` and `data` only. `architecture.md` §14.1 F-126-12 registers this as a *query-path* divergence;
it is in fact the whole HTTP path in Python (`to_dgii_error` is not used by `_execute`, `http.py:222-247`).

**Why it matters.** With several reads in flight, a Python operator cannot tell from the error which endpoint
failed; that is exactly the field DGII support asks for. The requirement source says so explicitly —
`project-specs/dgii-ecf-setup.md` A.8: *"keep `status`, `resource`, raw `data`, and `mensajes` on the error
object"* (line 279).

**Fix.** Thread `resource`/`method` from `client.py` into `HttpClient.get`/`post_multipart` (an optional kwarg
mirroring TS `RequestOptions.resource`) and set them in `_parse`; or call `to_dgii_error(exc, DgiiErrorContext(resource=…))`.
Correct the F-126-12 wording either way.

**How to verify.** `uv run pytest tests/test_http.py -k resource` after asserting
`err.resource == "<endpoint>"` for a 500 on `sendElectronicDocument`.

---

### F-DGII-13 — LOW — §9.1 promises a `fileName` fallback for the idempotency key; neither package implements it

**Where.** `project-docs/architecture.md` §9.1: *"`fileName` `{RNC}{eNCF}.xml` is the fallback when the
document does not expose them"*. Implementation: `packages/typescript/src/client.ts:215-232` and
`packages/python/src/py_dgii_ecf/client.py:223-238` both fall back to the literals `'unknown-rnc'` /
`'unknown-ncf'`, and neither function receives `fileName`.

**Why it matters.** Benign in effect (the hash still separates documents), but the doc is the contract and a
reader implementing a store backend will key on `RNC`/`eNCF` believing they are always real. Either implement
the fallback or delete the sentence — `AGENTS.md` says a contract change lands with the doc in the same commit.

**Fix.** Preferred: implement it — pass `fileName` into `buildIdempotencyKey(signedXml, fileName)` and parse
`^(?<rnc>\d{9,11})(?<encf>E\w{11})\.xml$` (both packages, same regex). Otherwise strike §9.1's clause.

**How to verify.** Unit test: a signature-less ANECF-ish document plus `fileName='101672919E3100000001.xml'`
→ key starts with `101672919:E310000000001:`.

---

### F-DGII-14 — LOW — The injectable clock has different units under the same option name (`now`: ms vs s)

**Where.** `packages/typescript/src/client.ts:61,173,188,290` (`now?: () => number` in **epoch ms**,
`tokenRefreshSkewMs`) versus `packages/python/src/py_dgii_ecf/client.py:160-161,200,211`
(`now: Callable[[], float] = time.time` in **epoch seconds**, `token_refresh_skew_s`).

**Why it matters.** A team that ports a test helper or a `Clock` adapter — the reason to inject a clock — can
inject milliseconds into Python. Then `self._now() < expires_at - skew` is always false, so **every** request
re-authenticates: two extra DGII round-trips per invoice and a token churn DGII can rate-limit. The skew
options are unit-suffixed, which is why the trap is survivable; `now` is not.

**Fix.** Rename Python's parameter to `now_s` (or accept a `datetime`), and add to the docstring
"epoch **seconds**". Same for `InMemoryIdempotencyStore(clock=…)` (`http.py:47`), which uses
`time.monotonic` — document that too.

**How to verify.** Type-level only; add a docstring/`mypy`-visible rename and a test that a `now` returning
seconds refreshes at the expected boundary (`tests/test_token.py` already covers skew logic).

---

### F-DGII-15 — LOW — `formatViolations` / `format_violations` render path-less violations differently

**Where.** `packages/typescript/src/validation.ts:175-192` (joins with `'; '`, prints `message` alone when
`path` is empty) versus `packages/python/src/py_dgii_ecf/validation.py:130-134`
(`f"{v.path}: {v.message}"` unconditionally) — for a path-less violation Python emits a leading `": "`.
The violation *entries* also differ in container type (`SchemaViolation[]` vs `tuple`), and TS `xmllint`
parsing can produce `path: ''` routinely (`validation.ts:87-107`).

**Why it matters.** This text is what the caller shows the operator when DGII would reject the document. A
leading `": element X: …"` reads as corrupted output, and the two SDKs' messages are compared in support
threads.

**Fix.** Mirror TS's conditional in Python (`f"{v.path}: {v.message}" if v.path else v.message`) and align the
container (`tuple` in TS is not idiomatic; leave it as an array but document).

**How to verify.** `uv run pytest tests/test_validation.py -k format` with a `SchemaViolation(path="", …)`
assertion matching TS's `formatViolations` output string.

---

## Parity matrix

Legend: ✅ identical · ⚠️ differs (see finding) · ➖ not applicable · (V) verified by running.

### Public client methods (`ECF`)

| Member                                                     | TypeScript                                                                  | Python                             | Match |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------- | ----- |
| `authenticate(buyerHost?)`                                 | `client.ts:318`                                                             | `client.py:294`                    | ✅ (V) |
| `sendElectronicDocument(signedXml, fileName, buyerHost?)`   | `client.ts:545`                                                             | `client.py:375`                    | ⚠️ F-01, F-02 |
| `sendSummary(signedXml, fileName)`                          | `client.ts:588`                                                             | `client.py:414`                    | ⚠️ F-05 |
| `sendDocument(signedXml, fileName, buyerHost?)`             | `client.ts:611`                                                             | `client.py:427`                    | ✅ (V: routing edge cases 10/10) |
| `sendCommercialApproval(signedXml, fileName, buyerHost?)`   | `client.ts:802-863` (overloads)                                             | `client.py:690-728` (union return) | ⚠️ F-02 |
| `voidENCF(signedXml, fileName)`                            | `client.ts:865`                                                             | `client.py:730`                    | ✅ |
| `statusTrackId(trackId)`                                   | `client.ts:645`                                                             | `client.py:449`                    | ⚠️ F-05 (partial-answer shape) |
| `inquiryStatus(rnc, ncf, rncComprador?, codigoSeguridad?)`  | `client.ts:675`                                                             | `client.py:468`                    | ✅ (V: both reject non-object / missing `estado`) |
| `trackStatuses(rncEmisor, encf)`                           | `client.ts:706`                                                             | `client.py:570`                    | ✅ (V) |
| `getCustomerDirectory(rnc)`                                | `client.ts:734` → `ServiceDirectoryResponse[] \| undefined`                 | `client.py:595` → `list[...] \| None` | ⚠️ F-05 |
| `getDirectoryListing()`                                    | `client.ts:752`                                                             | `client.py:608`                    | ✅ |
| `getSummaryInvoiceInquiry(rnc, encf, codSeguridad)`         | `client.ts:773` (PROD-only, `BaseUrl.CF`)                                   | `client.py:616`                    | ✅ (V: prod guard identical) |
| `reconcileSubmission(signedXml)`                           | `client.ts:438`                                                             | `client.py:490`                    | ✅ (V: §9.4 chain matches step for step) |
| `getServiceStatus()`                                       | `client.ts:360`                                                             | `client.py:640`                    | ⚠️ F-05 |
| `getMaintenanceWindows()`                                  | `client.ts:375`                                                             | `client.py:651`                    | ✅ |
| `checkServiceAvailability(ambiente)`                       | `client.ts:392`                                                             | `client.py:663`                    | ✅ |
| Constructor options                                        | `EcfOptions` object (`client.ts:48-82`)                                     | keyword arguments (`client.py:143-166`) | ⚠️ F-14 (`now` units) |

### Environments, endpoints, URLs

| Item                                              | TS                                                     | PY                       | Match |
| ------------------------------------------------- | ------------------------------------------------------ | ------------------------ | ----- |
| `TesteCF` / `CerteCF` / `eCF`                      | `environment.ts:1-9`                                   | `environment.py:9-15`    | ✅ (V) |
| `BaseUrl.ECF/CF/STATUS`                            | `environment.ts:11-18`                                 | `environment.py:18-22`   | ✅ (V) |
| 12 `Endpoint` literals (incl. casing)              | `environment.ts:24-37`                                 | `environment.py:25-38`   | ✅ (V, machine-diffed: 21 shared literals, 0 differences) |
| 4 `SenderReceiverEndpoint` (`fe/…`, no env segment) | `environment.ts:40-45`                                | `environment.py:41-47`   | ✅ (V, wire capture) |
| 3 `StatusEndpoint` + `StatusEnvironment` 1/2/3      | `environment.ts:48-60`                                | `environment.py:50-63`   | ✅ (V) |
| `buildUrl` / `buildStatusUrl` / `buildSenderReceiverUrl` | `environment.ts:63-84`                           | `environment.py:66-86`   | ✅ |
| Path form `{base}/{env}/{endpoint}`; `/env` absent for status and `fe/…` | ✅                       | ✅                       | ✅ (V) |
| Prod-only guard on `consultarfce`                  | `client.ts:778-789`                                    | `client.py:620-622`      | ✅ (V) |
| Query-param names (camelCase vs GT's lowercase)     | `client.ts:651,684,713,740`                            | `client.py:465,482,581,600` | ⚠️ both use camelCase — see Needs follow-up #1 |
| `consultarfce` param names (`RNC_Emisor`, `ENCF`, `Cod_Seguridad_eCF`) | `client.ts:793`                    | `client.py:633-636`      | ✅ (V) |

### HTTP wire shape (proved on a local echo server)

| Item                                    | TS                                        | PY                                  | Match |
| --------------------------------------- | ----------------------------------------- | ----------------------------------- | ----- |
| Verb per operation                      | POST ×5 (validate-seed, reception, RFCE, ACECF, ANECF); every other call GET | same | ✅ (V: wire capture + call-site audit) |
| Multipart field name `xml`              | `http.ts:317-336`                         | `http.py:285-295`                   | ✅ (V: `name="xml"`) |
| `fileName` in `Content-Disposition`     | ✅                                        | ✅                                  | ✅ (V) |
| Part content type                       | `application/xml`                         | `application/xml`                   | ✅ (V) |
| `Content-Length` auto                   | 419 bytes (Bun)                           | 375 bytes (httpx2)                  | ✅ (V: both present; difference is boundary length only) |
| `Accept: application/json`              | ✅                                        | ✅                                  | ✅ (V) |
| `Authorization: Bearer` / `Apikey`      | ✅ / ✅                                   | ✅ / ✅                             | ✅ (V) |
| Body decode rule                        | by `content-type`                         | try JSON first                      | ⚠️ F-01 |
| 2xx body treatment                      | unchecked cast                            | model-validated                     | ⚠️ F-01, F-05 |
| 401 keeps DGII's body                   | ✅ (`data`, `AUTH`)                       | ✅ (`data`, `AUTH`)                 | ✅   |
| Retry set                               | `{408,429,500,502,503,504}`               | same                                | ✅   |
| Attempts / backoff                      | 3 attempts, 100 ms exp. (`resilience.ts:84-85`) | 3 attempts, 10→1000 ms (`resilience.py:68-72`) | ⚠️ registered F-126-8/F-126-1 |
| Bulkhead                                | yes (`resilience.ts:94`)                 | no                                  | ✅ intentional (§12.8) |

### Reception routing (from the signed XML)

| Case                                        | Expected                                | TS (`reception.ts`)              | PY (`reception.py`)                      | Match |
| ------------------------------------------- | --------------------------------------- | -------------------------------- | ---------------------------------------- | ----- |
| `<RFCE>` root                               | `recepcionfc` summary                   | `:105-107`                       | `:86-87`                                 | ✅ (V) |
| E31/E33/E34/E41/E43/E44/E45/E46/E47         | general reception                       | `:123-125`                       | `:101-102`                               | ✅ (V) |
| E32 ≥ RD$250,000                            | general reception                       | `:141-146`                       | `:114-124`                               | ✅ (V: `250000`, `250000.00`, `250000.0`, `0250000`, `" 250000 "`) |
| E32 < RD$250,000                            | `Err` naming `convertECF32ToRFCE`       | `:135-146`                       | `:111-121`                               | ✅ (V: identical message text) |
| `MontoTotal` absent / not a decimal          | `Err`                                    | `:127-140`                       | `:104-113`                               | ✅ (V: `2.5e5`, `-1`, `250000,00`) |
| `MontoTotal` with trailing `\n`             | —                                       | `Err`                            | would pass the pattern                    | ⚠️ F-11 (unreachable) |
| Unknown root / unknown `TipoeCF`            | `Err`                                    | `:108-114`, `:116-122`           | `:88-94`, `:96-99`                       | ✅ (V) |
| B2B exclusion set `{41,43,45,46,47}` + E32 threshold | matches GT §10                 | `:166-222`                       | `:130-181`                               | ✅ (V) |
| `checkB2BApplicability` reachable by callers | exported                                | `index.ts:10`                    | **not exported**                         | ⚠️ F-09 |

### Signing (XMLDSig)

| Item                                                           | TS                                          | PY                                    | Match |
| -------------------------------------------------------------- | ------------------------------------------- | ------------------------------------- | ----- |
| `CanonicalizationMethod` inclusive C14N 1.0                    | `signing.ts:10`                             | `signing.py:34`                       | ✅ (V) |
| `SignatureMethod` rsa-sha256                                    | `signing.ts:11`                             | `signing.py:36`                       | ✅ (V) |
| `DigestMethod` sha256                                          | `signing.ts:12`                             | `signing.py:35`                       | ✅ (V) |
| `Reference URI=""`                                             | `isEmptyUri: true` (`:117`)                 | `reference.set("URI", "")` (`:158`)   | ✅ (V) |
| Transforms                                                     | enveloped only (`:115`)                     | enveloped + C14N (`:160-161`)         | ✅ spec-legal both (§10); **DigestValue identical (V)** |
| Digest computed before `<Signature>` is appended                | `computeSignature` (`:121`)                 | `:146` then `:169`                    | ✅ (V: same digest bytes) |
| `<Signature>` last child of root                                | ✅                                          | `root.append` (`:169`)                | ✅ (V) |
| `X509Certificate` = base64 DER                                  | xml-crypto `publicCert`                     | `Encoding.DER` (`:183`)               | ✅ (V) |
| No `KeyValue`/`RSAKeyValue`                                     | ✅                                          | ✅                                    | ✅ (V) |
| Whitespace/comments stripped before signing                     | `cleanNodes` (`:59-78`)                     | `remove_blank_text/remove_comments`   | ✅ (V: both emit a single line) |
| XML declaration preserved                                       | ✅                                          | ✅                                    | ✅ (V) |
| Digest pinned by independent verifier                           | `scripts/verify-signing.ts` (2 cases)       | `scripts/verify_signing.py` (1 case)  | ⚠️ PY gate lacks the C14N-sensitive case (see Needs follow-up #3) |
| Certificate validity / signer-RNC preflight                     | none                                        | none                                  | ⚠️ F-08 |

### Domain data helpers

| Item                                              | TS                                     | PY                                  | Match |
| ------------------------------------------------- | -------------------------------------- | ----------------------------------- | ----- |
| `getCodeSixDigitfromSignature`                    | `utils.ts:8-22`                        | `utils.py:19-27`                    | ✅ (V) — ADR 0001 |
| `generateEcfQRCodeURL` (param order, casing, `RncComprador` omission) | `utils.ts:38-63`   | `utils.py:46-70`                    | ✅ (V: byte-identical URLs) |
| `generateFcQRCodeURL` (`consultatimbrefc`)         | `utils.ts:24-36`                       | `utils.py:29-44`                    | ✅ (V) — but `montototal` floats in both (F-06) |
| `getCurrentFormattedDateTime` `DD-MM-YYYY HH:mm:ss`, `America/Santo_Domingo` | `utils.ts:65-89` (Intl) | `utils.py:72-75` (zoneinfo)     | ✅ (V: incl. local midnight → `00:00:00`, matching the XSD's `2[0-3]` hour) |
| `getCurrentFormattedDate` `DD-MM-YYYY`             | `utils.ts:92-93`                       | `utils.py:78-81`                    | ✅ (V) — matches `FechaValidationType` (`e-cf-32.xsd:1372-1376`) |
| `getXmlFromBodyResponse` (default tag `ACECF`)     | `utils.ts:96-101`                      | `utils.py:84-95`                    | ✅ |
| `convertECF32ToRFCE` shape / `CodigoSeguridadeCF`  | `utils.ts:170-253`                     | `utils.py:134-244`                  | ⚠️ F-04, F-10; return shape: `{xml, securityCode}` vs `dict[str,str]` (Python keys are strings, untyped) |
| `compareDecimal` / `compare_decimal`               | `reception.ts:64-92`                   | `reception.py:48-69`                | ✅ (V: 10/10 same verdicts) |
| `validateDocument` / `validate_document` (E31/RFCE/ACECF unavailable) | `validation.ts:43-46,126-136` | `validation.py:39-41,94-104`  | ✅ identical messages (V) — but the gate blocks (F-03) |
| Violation rendering                                | `validation.ts:175-192`                | `validation.py:130-134`             | ⚠️ F-15 |
| Vendored XSDs byte-identical (3 copies)            | ✅                                      | ✅                                  | ✅ (V: sha256 equal for all 12 + MANIFEST) |

### The remaining exported surface (types, errors, infra)

Everything below is exported from `index.ts` / `__init__.py`; only rows marked ⚠️ differ.

| Member                                                                        | TS                                        | PY                                        | Match |
| ----------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------- | ----- |
| `DgiiError`, `DgiiErrorCode` (10 codes)                                        | `errors.ts:3-14`, `:197-257`              | `errors.py:34-43`, `:157-196`              | ✅ (V: same 10 codes) |
| `toDgiiError` / `to_dgii_error`, `extractDgiiErrorMessage` / `extract_dgii_error_message` | `errors.ts:259-296` / `:96-195` | `errors.py:198-241` / `:69-149` | ✅ (V: identical message for 6 DGII error shapes) |
| `DgiiError.resource`/`method`/`baseURL` on HTTP failures                       | set (`http.ts:228-236`)                   | never set (`http.py:172-178`)              | ⚠️ F-12 |
| `DgiiError.mensajes` on a normalized error                                     | set (`errors.ts:290-294`)                 | never set (`errors.py:198-241`)            | ⚠️ minor, same family as F-12 |
| `Ok`/`Err`/`Result`/`DgiiResult`                                               | neverthrow re-export (`result.ts`)        | `result` re-export (`result.py`)           | ✅ (different libraries, same shape) |
| `HttpClient`, `HttpClientOptions`, `RequestOptions`                             | `http.ts:113-136`                         | `http.py:95-106` (kwargs, no `RequestOptions`) | ✅ functionally |
| `IdempotencyStore`, `InMemoryIdempotencyStore(ttl, clock)`                      | `http.ts:12-19,55-105`                    | `http.py:21-85`                            | ⚠️ F-14 (clock unit) |
| `ResilienceOptions`, `createResiliencePolicies` / `ResiliencePolicy`            | `resilience.ts:16-95`                     | `resilience.py:36-97`                      | ⚠️ registered F-126-8/F-126-1; no bulkhead in PY (§12.8) |
| `P12Reader`, `P12ReaderData`, `CertificateInfo`                                | `certificate.ts:6-149`                    | `certificate.py:21-172`                    | ⚠️ F-08 (no validity gate); `CertificateInfo.validFrom` is a `Date` vs `datetime` |
| `P12Reader.getKeyFromBytes` / `get_key_from_bytes` and base64 variants          | base64 only (`certificate.ts:59-104`)     | base64 **and** bytes (`certificate.py:66-114`) | ⚠️ additive: PY accepts raw bytes, TS does not |
| `Signature`, `XmlCertificateValidation`, `validateXMLCertificate`               | `signing.ts:70-178`                       | `signing.py:59-222`                        | ✅ (V: identical digest) — plus PY-only `Signature.from_p12` / `try_from_p12` (`signing.py:73-110`), absent in TS |
| `Transformer`, `pruneEmptyValues`, `roundHalfUpToCents`                         | `transformer.ts:34-127`                   | `transformer.py:25-137` (helpers private)  | ⚠️ F-10; F-06 keeps money strings |
| `ECF_TYPE_CODES`, `isEcfTypeCode`, `compareDecimal`, `resolveReceptionRoute`    | `reception.ts:8-147`                      | `reception.py:14-124`                      | ✅ (V) |
| `checkB2BApplicability` / `check_b2b_applicability`                             | exported (`index.ts:10`)                  | not exported                              | ⚠️ F-09 |
| `UNAVAILABLE_SCHEMAS`, `SCHEMA_DIR`, `ValidationOptions`                        | exported (`validation.ts:21,43,58`)       | not exported                              | ⚠️ surface drift, folded into F-09 |
| `convertECF32ToRFCE` return shape                                               | `{ xml, securityCode }` (typed)           | `dict[str, str]` with literal keys         | ⚠️ F-04 row; untyped dict is the Python idiom |
| `cli.py` (`py-dgii-ecf`, 3 commands)                                            | —                                         | `cli.py:1-117`                             | ➖ Python-only by design (§5.12) |

Every client method, endpoint pair, routing rule, signing element and domain helper is therefore accounted for.
The members with no counterpart are the Python-only CLI and three additive helpers (`P12Reader.get_key_from_bytes`,
`Signature.from_p12`, `Signature.try_from_p12`); the members missing on one side are the three
`reception`/`validation` exports listed in **F-09**.

---

## Coverage

**Verified by running** (probes under `/tmp`, repo untouched):

1. Environment/endpoint literal sets, machine-diffed between both `environment.*` files — 21 shared strings,
   0 one-sided values.
2. Reception routing on 10 `MontoTotal` variants plus missing/absent cases, both packages side by side.
3. QR URL generation for e-CF prod / e-CF cert / E43 / FC — byte-identical output.
4. Signing the same fixture with the same key/cert in both packages — identical `DigestValue`
   (`FK6y3t7CyblvxVQiMisKZwjo4ApDSEVAzWd3vHp7W64=`), identical element order, identical declaration.
5. Multipart wire shape against a local HTTP echo server (path, field name, filename, part content-type,
   `Content-Length` present, `Accept`), for the buyer-host reception endpoint in both packages.
6. Response-normalization matrix: 11 bodies × 2 packages (empty, HTML, `text/plain`-JSON, scalar, `{}`,
   malformed entries) across submission, directory, status, tracking and count models; plus the 6 documented
   DGII **error** shapes (bare string, `{mensajes}`, ProblemDetails, `{errors}`, HTML page, JSON-in-a-string)
   — the extracted message is identical in both packages for all 6.
7. Idempotency behaviour across two calls with the same document (DGII vs buyer host; DGII approval vs buyer
   approval) — HTTP call counts captured.
8. `convertECF32ToRFCE` on valid / truncated / wrong-root input in both packages.
9. `validate_document` on `invoice-31.xml`, `invoice-32.xml`, `anecf.xml`, `acecf.xml`.
10. `Environment` prod guard, `check_b2b_applicability` import, `format_violations`/`convert` output shapes.
11. Date/time formatting at local midnight and local noon in both packages.

**Verified by reading:** every endpoint call site (verb, base URL, resource), the idempotency and
reconciliation flows line by line against `architecture.md` §9.3/§9.4, both signing implementations against
ground truth §8 and §10 of the architecture, both error normalizers, both response-model sets, both validation
modules against `MANIFEST.json`, `__init__.py` vs `index.ts` surfaces, and the surviving doc contracts
(§4.11, §4.12, §5.13, §9.1, §14.1).

**Not covered — and why:**

- **Live DGII endpoints.** No credentials, no `.p12`, no `DGII_RNC`/unused `DGII_ENCF`; nothing in this report
  claims a live response. Every "DGII returns X" statement is taken from `dgii-ground-truth.md` or the repo's
  own contract docs.
- **`xmlsec1` / `xmllint` gates.** Neither binary is installed here; the XMLDSig baseline is accepted as
  measured. `validateDocument` therefore could not be exercised against a real `xmllint` (only the
  schema-availability branch, which does not spawn it).
- **.NET verification.** The claim "DGII's .NET stack accepts the TS single-transform reference" is *not*
  proven here; only libxmlsec1 (the baseline) and XMLDSig §4.4.3.3 support it. Tracked in Needs follow-up #3.
- **Full XSD review.** I spot-checked `e-cf-32.xsd` (`FechaValidationType`, `DateTimeValidationType`,
  `RNCValidationType`) to pin date and RNC formats; I did not review the other eight schemas or the
  `DetallesItems` arithmetic rules (that is the data-model dimension, not environments).
- **RNC/cédula check digits.** Not implemented in either SDK, and the algorithm is **not** in
  `dgii-ground-truth.md`; I did not assert it as a defect (Needs follow-up #4).
- **e-NCF sequence allocation/validity** (gaps, `31-dic` authorization window, contingency mode): by design the
  caller owns the counter — neither package allocates sequences, so there was nothing to compare.
- **`CodigoSeguridadeCF` derivation.** Ambiguous in the DGII text; both packages implement the ADR 0001
  decision (first 6 chars of `<SignatureValue>`) identically. Not re-litigated.

---

## Needs follow-up

Each item is a question I could not settle from the repo, with the exact check that settles it.

1. **Query-parameter casing.** Both packages send `trackId`, `rncEmisor`, `ncfElectronico`, `rncComprador`,
   `codigoSeguridad`, `rnc` (`client.ts:651,684,713,740`; `client.py:465,482,581,600`) while
   `dgii-ground-truth.md` §2 documents `trackid`, `rncemisor`, `ncfelectronico`, `rnccomprador`,
   `codigoseguridad`, `RNC`. GT also records "Servicios no sensitivos a mayúsculas y minúsculas", which
   plausibly covers service names only. *Check:* one authenticated GET against `TesteCF`
   `consultaestado` with both spellings for a known e-NCF; the answer must not be `codigo: 0` /
   "No encontrado" for the camelCase form. Same one-shot check for `consultaresultado?trackId=`.
2. **Multipart part content type.** Both packages send `application/xml`; DGII's own cURL examples use
   `type=text/xml` (`dgii-ground-truth.md` §3). *Check:* submit one document to `TesteCF`
   `recepcion/api/facturatelectronicas` with each and confirm both are accepted (a rejection on one settles it).
3. **Single vs double `<Transform>`.** TS emits enveloped only (`signing.ts:104`), PY emits enveloped + C14N
   (`signing.py:155-156`); digests agree and libxmlsec1 verifies both. *Check:* verify a TS-signed document
   with .NET `SignedXml.CheckSignature`, or submit one to `CerteCF` during certification. Also: give the PY
   gate the C14N-sensitive second case that the TS gate already has (`verify-signing.ts:34-44`), otherwise a
   raw-serialization regression in Python is invisible to the only independent check.
4. **RNC/cédula check-digit validation.** Not implemented, and not documented in GT. *Check:* confirm against
   DGII's *Validación de RNC/Cédula* guidance whether the SDK should ship a check-digit helper; if yes it is a
   new finding, if no it is a documented non-goal. The `SN` ↔ RNC requirement in GT §8 is the part to enforce
   regardless (F-08).
5. **TS timestamp portability.** `getCurrentFormattedDateTime` builds the fiscal timestamp from
   `Intl.DateTimeFormat('es-DO', {hour12:false})` (`utils.ts:65-89`). It is correct on Bun 1.4.4/Node 26
   (verified: `00:00:00` at local midnight), but `hour12:false` has produced `24` on some ICU versions, and
   `DateTimeValidationType` allows only `2[0-3]` (`e-cf-32.xsd:1378-1383`). *Check:* run the same assertion on
   Node 20 and 22 (`engines: >=20`) — if `24` appears anywhere, switch to `hourCycle: 'h23'`.
6. **`secuenciaUtilizada` on a non-rejected `consultaresultado`.** `canReuseSequence` requires both
   `secuenciaUtilizada === false` *and* `estado.trim() === 'Rechazado'`
   (`reconciliation.ts:76-85`, `reconciliation.py:59-65`). GT §5 scopes the flag to a rejection, so `false`
   for e.g. `Aceptado Condicional` is presumably right — but no DGII document shows the field on an accepted
   record. *Check:* capture one real `consultaresultado` body per `codigo` value (0–4) in `TesteCF` and confirm
   the flag's presence/type; if DGII sends `"false"` (string) anywhere, both packages already answer `false`
   for it — that is the correct conservative reading, but it should be written down.
7. **Re-published schemas.** `e-CF 31`, `RFCE 32` and `ACECF` are unbundled because DGII's published copies do
   not compile (`schemas/MANIFEST.json` `excluded`). *Check:* re-fetch the three `source_url`s and compare
   `sha256` — if DGII has republished a fixed version, F-03 shrinks to nothing.
8. **`getMaintenanceWindows` empty-body contract.** TS returns `[]` for a non-object body
   (`client.ts:375-390`), PY returns `[]` for a non-dict/list too (`client.py:651-662`) — parity holds, but
   neither distinguishes "no windows" from "unreadable", unlike the status reads. *Check:* confirm with one real
   response whether an empty maintenance schedule is `{ventanaMantenimientos: []}`, `null` or absent before
   deciding whether this deserves the same `VALIDATION` guard as F-01.
