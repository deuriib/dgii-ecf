# Readability Review

Two hand-maintained SDKs for DGII e-CF: `@deuriib/dgii-ecf` (TypeScript) and `py-dgii-ecf` (Python).
No shared code, no codegen. Readability here is a correctness property: the Python package is kept in
sync with the TypeScript one **by a human reading both**, so a name that means two things, a comment
that describes a previous revision, or a module that exists in one tree only is a defect with a cost
measured in wrong ports, not in aesthetics.

- **Scope:** `packages/typescript/src` (16 files, 3 183 lines), `packages/python/src/py_dgii_ecf`
  (18 files, 3 621 lines), plus `AGENTS.md`, `project-docs/architecture.md`, `CONTRIBUTING.md`,
  `mise.toml`, `project-specs/dgii-ecf-setup.md` §4.3/§5.3.
- **Method:** every finding cites `file:line` and is marked *verified by running* or *verified by
  reading*. Nothing in the repo was modified; scratch scripts ran from `bun -e` and `uv run python -`
  heredocs, so no repository file was created.
- **Ground truth used:** `src/index.ts` and `__init__.py` are authoritative per `AGENTS.md:10-11`.

## Verdict

**Not safe to hand to a maintainer who has not already read both trees.** The exported surface is
85 % aligned, but five blockers sit exactly where the two packages are supposed to be
interchangeable, and each one is a *documented promise the code does not keep* — the worst kind of
readability defect, because the reader has been told not to look further:

1. `Signature.sign_xml`'s second parameter is inert in Python and load-bearing in TypeScript
   (`F-READ-02`) — on the signing path (`AGENTS.md:53-61`).
2. `maxRetries` in TypeScript means 4 attempts and `max_retries` in Python means 3, while the
   TypeScript field's own doc comment says "attempts including the first" (`F-READ-01`).
3. `architecture.md §5.13` names `check_b2b_applicability` as re-exported; it is not exported at all
   (`F-READ-03`).
4. `montoTotal` / `totalITBIS` are `number`/`float` — money in binary floating point — against an
   `AGENTS.md` invariant that says never (`F-READ-04`).
5. `convertECF32ToRFCE` returns the key `securityCode`; the contract documents `security_code`, so a
   Python caller following the doc gets a `KeyError` (`F-READ-06`).

The Python tree is the less readable of the two, for one structural reason: **the models do the
parsing**. `types.py` is 588 lines against `types.ts`'s 166 (3.5×) because every model carries a
`from_dict` whose field-by-field tolerance policy is the real contract — and that policy is spread
over nine private readers (`_as_str`, `_as_str_strict`, `_as_optional_str`, `_as_optional_or_none`,
`_as_int`, `_as_float`, `_as_bool`, `_as_bool_strict`, `_as_code`) whose names differ by one word and
whose behaviours differ by whether a read can fail the call. A reader cannot decide which reader a new
field needs without holding the whole reconcile decision tree in working memory.

**Readability score: 6/10.** Well-written at the sentence level — nearly every function has a docstring
explaining *why*, and the reconcile and signing comments are genuinely excellent. Fails at the
document level: three of the four sources of truth (AGENTS.md, architecture.md, the doc comments) each
disagree with the code somewhere, and the disagreements are concentrated on the paths where a mistake
issues a duplicate fiscal document.

**Single highest-leverage improvement:** make one table the contract. `architecture.md §14.1` already
has the right shape — "Registered parity divergences" — but it is 8 rows and the code has at least 15.
Every finding below that is a doc-vs-code drift is really the same bug: the register is incomplete, so
a maintainer reads it, believes the two packages are identical, and ports a fix into only one.

## Parity map

Spec §5.3 asks the Python map to "Mirror the TypeScript module map 1:1 (environment, types, errors,
result, resilience, http, certificate, signing, transformer, utils, client, cli)". Built from `wc -l`
on both trees:

| #   | TypeScript (`src/`) | lines | Python (`src/py_dgii_ecf/`) | lines | Δ      | Responsibility                                                                  |
| --- | ------------------- | ----- | --------------------------- | ----- | ------ | ------------------------------------------------------------------------------- |
| 1   | `index.ts`          | 14    | `__init__.py`               | 174   | +160   | Package surface                                                                 |
| 2   | `environment.ts`    | 75    | `environment.py`            | 85    | +10    | `Environment`, `BaseUrl`, `Endpoint`, URL builders                              |
| 3   | `types.ts`          | 166   | `types.py`                  | 588   | **+422** | Wire/response models — **and, in Python only, their parsers**                 |
| 4   | `errors.ts`         | 295   | `errors.py`                 | 232   | −63    | `DgiiError`, `DgiiErrorCode`, normalizer                                        |
| 5   | `result.ts`         | 20    | `result.py`                 | 19    | −1     | `neverthrow` / `result` re-exports + `DgiiResult`                               |
| 6   | `resilience.ts`     | 110   | `resilience.py`             | 92    | −18    | Retry + breaker (+ bulkhead in TS) + retry predicate                            |
| 7   | `http.ts`           | 339   | `http.py`                   | 295   | −44    | `HttpClient`, `IdempotencyStore`, in-memory store                              |
| 8   | `xml.ts`            | 68    | `_xml.py`                   | 63    | −5     | Tolerant root/element extraction — **name drift: `xml` vs `_xml`**             |
| 9   | —                   | —     | `_json.py`                  | 13    | **+13** | `JsonValue`/`JsonObject` aliases — **Python only**                             |
| 10  | `certificate.ts`    | 150   | `certificate.py`            | 172   | +22    | `P12Reader` (`node-forge` vs `cryptography`)                                    |
| 11  | `signing.ts`        | 178   | `signing.py`                | 228   | +50    | `Signature`, `validateXMLCertificate` — **`root_name` inert in Python**        |
| 12  | `transformer.ts`    | 151   | `transformer.py`            | 176   | +25    | JSON↔XML (`xml-js` vs internal `lxml`)                                          |
| 13  | `reception.ts`      | 224   | `reception.py`              | 181   | −43    | Reception routing + B2B applicability                                           |
| 14  | `reconciliation.ts` | 73    | `reconciliation.py`         | 71    | −2     | `canReuseSequence`, `ReconciliationResult`                                      |
| 15  | `validation.ts`     | 188   | `validation.py`             | 134   | −54    | XSD validation (`xmllint` subprocess vs bundled `lxml`)                          |
| 16  | `utils.ts`          | 253   | `utils.py`                  | 244   | −9     | Security code, QR URLs, dates, RFCE                                             |
| 17  | `client.ts`         | 879   | `client.py`                 | 737   | −142   | `ECF`                                                                           |
| 18  | —                   | —     | `cli.py`                    | 117   | +117   | typer entry point — **Python only**, documented                                 |
|     | **16 files**        | 3 183 | **18 files**                | 3 621 |        |                                                                                 |

Eleven pairs are clean: same name, same responsibility, size within 25 %. Four drifts matter.

### D-1 — `types.ts` 166 lines vs `types.py` 588 (3.5×)

**What a maintainer will get wrong:** they will add a field to `types.ts`, add the matching attribute
to the Python dataclass, and stop. They will not add the field to `from_dict`, because TypeScript has
no `from_dict` to remind them. The field then exists on the Python model and is always `None` — a
model that lies. This is not hypothetical: `InvoiceResponse.from_dict` (`types.py:405-412`) is the only
place `mensaje`/`mensajes` are read, and the dataclass's field list alone does not tell you that.

The asymmetry is architectural, not accidental — Python must parse, TypeScript declares and trusts
(`architecture.md §5.2`, §4.11). But nothing in the file *says* "if you add a field here you must add
three lines elsewhere". The `ResponseModel` protocol (`types.py:247-252`) is the only signal, and it is
114 lines above the first model.

**Concrete edit:** add a module docstring banner to `types.ts` naming the coupling, and to `types.py` a
one-line rule per model. Cheapest version that removes the trap:

```ts
// packages/typescript/src/types.ts — top of file
/**
 * Wire models only. TypeScript trusts the payload; the SDK validates shape at the
 * call site (`isInquiryStatusResponse` in client.ts). Python parses into these
 * models instead, so **a field added here must also be added to the matching
 * `from_dict` in packages/python/src/py_dgii_ecf/types.py**.
 */
```

```python
# packages/python/src/py_dgii_ecf/types.py — top of file, after the existing docstring
# Adding a field: add it to the dataclass *and* to that model's ``from_dict``, and
# choose the reader by asking "can an unreadable value fail the call?" — yes:
# _as_str_strict / _as_bool_strict; no: _as_optional_or_none. The TS model has no
# parser, so it is not a reminder.
```

**Verify:** `grep -c "from_dict" packages/python/src/py_dgii_ecf/types.py` = 12; the number of
dataclasses in the file is 12. Any new model without one is the defect.

### D-2 — `xml.ts` vs `_xml.py`: a leading underscore that does not mean private

**What a maintainer will get wrong:** in Python a leading `_` says "internal, do not import, free to
change". `_xml.py` is imported by `reception.py:9`, `validation.py:16`, `utils.py:10`, `client.py:14`,
and `reconciliation`-adjacent code, and its two functions are the *only* XML parser in the package. A
maintainer looking for "where does the SDK read `TipoeCF`" opens `xml.py` in the TypeScript tree and
greps `_xml` in Python; worse, a maintainer tidying "unused internals" sees `_xml.py` and `_json.py`
sitting beside `_parse_one`-style privates and treats them as removable. `_json.py` genuinely is
internal; `_xml.py` is not.

**Concrete edit:** rename `_xml.py` → `xml.py` (it is a top-level behavioural module, same tier as
`reception.py`), keeping `_json.py` private. If the rename is too broad, at minimum add to
`_xml.py:1`:

```python
"""Tolerant element-text extraction for signed DGII XML.

Not private despite the name: ``client``, ``utils``, ``reception`` and
``validation`` all import it. ``xml.ts`` is the TypeScript counterpart.
"""
```

**Verify:** `grep -rn "from \._xml import\|from \._json import" packages/python/src` — `_xml` has 4
importers across module tiers, `_json` has 3 and is a type alias only.

### D-3 — `_json.py` is a second Python-only module the spec does not allow for

Spec §5.3 lists exactly one Python-only module (`cli`). `architecture.md §3` says "`cli.py`
(Python-only) replacing `index.ts` as the 'extra' module" — which is wrong twice: `__init__.py` is the
`index.ts` analogue (the same paragraph says so), and `_json.py` is a second extra that the table lists
two lines earlier. A maintainer counting modules against the spec finds 18 where 17 are budgeted.

**What a maintainer will get wrong:** they will conclude the Python tree has drifted and look for a
removed TypeScript module, or they will add a third Python-only module on the precedent and cite
`_json.py` as cover. Neither is what the spec allows.

**Concrete edit:** in `architecture.md §3`, replace the sentence with the accurate count:

> Mirrors the TypeScript map 1:1 except for two Python-only modules: `cli.py` (the `py-dgii-ecf` entry
> point, no TypeScript equivalent) and `_json.py` (`JsonValue`/`JsonObject` aliases that exist because
> `mypy` runs with `disallow_any_explicit`, so Python cannot spell a decoded payload as `unknown` the
> way `typescript/src/types.ts` does). `__init__.py` is the `index.ts` analogue.

**Verify:** `ls packages/typescript/src | wc -l` = 16, `ls packages/python/src/py_dgii_ecf | wc -l`
= 18, minus `__pycache__`; the difference is exactly `cli.py` and `_json.py`.

### D-4 — `client.ts` 879 vs `client.py` 737 (−142), and `index.ts` 14 vs `__init__.py` 174 (+160)

`index.ts` being a pure barrel (14 `export *` lines) while `__init__.py` is 174 lines of explicit
imports plus a hand-maintained `__all__` is a **real readability asset inverted**: TypeScript's
surface cannot drift from what the modules export, Python's can, and does — see `F-READ-03` and
`F-READ-17`. The 160-line delta is the price of an explicit surface that is not derived from anything.

**What a maintainer will get wrong:** they will trust `architecture.md §5.13`'s prose ("Re-exports the
full public surface (mirror of TS `index.ts`)") because there is no mechanical check, add a function to
`reception.py`, and never notice it is unreachable from `py_dgii_ecf`. The TS side gets it for free.

**Concrete edit:** add a test that asserts parity mechanically, in both packages, driven by one list:

```python
# packages/python/tests/test_public_surface.py
import py_dgii_ecf as m

EXPECTED = {  # kept in sync with packages/typescript/src/index.ts's transitive exports
    "check_b2b_applicability", "SUMMARY_ACCEPTED", "SUMMARY_CONDITIONAL_ACCEPTED",
    "SUMMARY_REJECTED", "UNAVAILABLE_SCHEMAS", "SCHEMA_DIR",
}

def test_every_documented_name_is_importable() -> None:
    missing = sorted(name for name in EXPECTED if not hasattr(m, name))
    assert missing == []
```

plus `expect(Object.keys(await import('../src/index.js'))).toContain(...)` in
`packages/typescript/test/surface.test.ts`. Two assertions, and `F-READ-03`/`F-READ-17` become
impossible.

**Verify:** `uv run python -c "import py_dgii_ecf as m; print([n for n in ('check_b2b_applicability','SUMMARY_ACCEPTED','UNAVAILABLE_SCHEMAS') if not hasattr(m,n)])"`
prints all three today.

## Public-surface vocabulary

### Members present in both, same meaning

| TypeScript                      | Python                           | Notes                                              |
| ------------------------------- | -------------------------------- | -------------------------------------------------- |
| `ECF`                           | `ECF`                            | `AGENTS.md:10-11` names it explicitly — holds         |
| `P12Reader(passphrase)`         | `P12Reader(passphrase)`          | instance-based, `AGENTS.md:10-11` — holds             |
| `Signature(key, cert)`          | `Signature(key, cert)`           | instance-based — holds; behaviour does not (§below) |
| `getKeyFromFile`                | `get_key_from_file`              |                                                    |
| `getKeyFromStringBase64`        | `get_key_from_base64`            | name drifts, meaning holds                         |
| `getCertificateInfo`            | `get_certificate_info`           |                                                    |
| `sendElectronicDocument`        | `send_electronic_document`       |                                                    |
| `statusTrackId`                 | `status_track_id`                |                                                    |
| `trackStatuses`                 | `track_statuses`                 |                                                    |
| `getSummaryInvoiceInquiry`      | `get_summary_invoice_inquiry`    |                                                    |
| `reconcileSubmission`           | `reconcile_submission`           |                                                    |
| `voidENCF`                      | `void_encf`                      |                                                    |
| `canReuseSequence`              | `can_reuse_sequence`             | identical predicate, read side by side             |
| `compareDecimal`                | `compare_decimal`                | `AGENTS.md:51` names both — holds                  |
| `resolveReceptionRoute`         | `resolve_reception_route`        |                                                    |
| `validateDocument`              | `validate_document`              | returns array vs tuple; see `F-READ-12`            |
| `environment`/`Endpoint` enums  | same, `UPPER_SNAKE` members      | `Endpoint` values byte-identical (checked all 12)  |

`DgiiErrorCode` is identical in both packages, all ten values, no drift (`errors.ts:3-13`,
`errors.py:34-46`). Good.

### Names that diverge in **meaning**, not casing

| TypeScript                                                  | Python                                                    | Divergence                                                                                                                                                                                      |
| ----------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ResilienceOptions.maxRetries` (`resilience.ts:18`)         | `ResilienceOptions.max_retries` (`resilience.py:39`)       | Same name, **different count**: TS 3 → 4 transport attempts, PY 3 → 3. See `F-READ-01`.                                                                                                          |
| `ResilienceOptions.halfOpenAfterMs` (`resilience.ts:22`)    | `ResilienceOptions.reset_timeout_s` (`resilience.py:41`)   | Same concept, different **name and unit**. A ported config object silently reinterprets 30 000 as 30 000 seconds.                                                                                |
| `ResilienceOptions.timeoutMs` (`resilience.ts:24`)          | `ResilienceOptions.timeout_s` (`resilience.py:42`)         | Unit is in the name in both, so a port is visibly wrong — but the Python field is **inert** (`F-READ-09`), so the ported value does nothing at all.                                             |
| `InquiryStatusResponse.montoTotal?: number` (`types.ts:59`)  | `monto_total: float \| None` (`types.py:350`)              | Both floating point, so they agree with each other and disagree with `AGENTS.md:50-52` and `architecture.md §2.3`. See `F-READ-04`.                                                              |
| `generateFcQRCodeURL(rnc, encf, montototal: number, …)` (`utils.ts:27`) | `generate_fc_qr_code_url(rncemisor, encf, montototal: int\|float\|str, …)` (`utils.py:32`) | One rejects `string` for a money amount, the other accepts three types. Documented as `monto: string` in both (§4.10). See `F-READ-05`.                                                          |
| `XmlCertificateValidation.validFrom?: string` (`signing.ts:138`) | `valid_from: str \| None` (`signing.py:194`)         | Same field, **incompatible string formats**: `"Jan  1 00:00:00 2024 GMT"` vs `"2024-01-01T00:00:00+00:00"`. See `F-READ-11`.                                                                    |
| `XmlCertificateValidation.subject?: string` (`signing.ts:136`) | `subject: str \| None` (`signing.py:192`)              | `"C=DO\nO=…\nCN=…"` (newlines, CA-first) vs `"CN=…,O=…,C=DO"` (commas, leaf-first). Both "the subject". See `F-READ-11`.                                                                        |
| `SchemaViolation.path` (`validation.ts:54`)                 | `SchemaViolation.path` (`validation.py:59`)                | TS: the element name parsed out of `xmllint` stderr (`eNCF`). PY: `lxml`'s full XPath (`/ECF/Encabezado/IdDoc/eNCF`). See `F-READ-12`.                                                          |
| `ReconciliationResult.canReuseSequence` (`reconciliation.ts:28`) | `can_reuse_sequence` (`reconciliation.py:37`)        | The **field** and the **function** share a name in Python, so `can_reuse_sequence(r.can_reuse_sequence)` reads as a no-op. TS keeps `canReuseSequence` (field) and `canReuseSequence()` (function) — same collision, but TS's call syntax disambiguates. Nit-level, listed for completeness. |
| `convertECF32ToRFCE(...).securityCode` (`utils.ts:172`)     | `convert_ecf32_to_rfce(...)["securityCode"]` (`utils.py:244`) | Agree with each other; both disagree with `architecture.md §5.10`'s documented key `security_code`. See `F-READ-06`.                                                                            |
| `TrackStatusEnum` (`types.ts:16`)                           | `TrackStatus` (`types.py:56`)                              | `Enum` suffix dropped. Cosmetic, but it is the vocabulary a caller compares `estado` against.                                                                                                   |

### Names present in one package only

| TypeScript-only export                                                       | Python                                                   | Cost                                                                                                                     |
| ---------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `SUMMARY_ACCEPTED`, `SUMMARY_CONDITIONAL_ACCEPTED`, `SUMMARY_REJECTED` (`types.ts:92-94`) | Defined (`types.py:30-32`) but **not** in `__init__.__all__` | A Python caller hand-types `"Aceptado condicional"` — the exact string `types.ts:88-90` warns is cased inconsistently. See `F-READ-17`. |
| `InquiryStatus`, `InquiryStatusCode` (`types.ts:42-50`)                       | absent                                                   | Python cannot express "`estado` is one of four values"; `InquiryStatusResponse.estado: str` (`types.py:347`).            |
| `ServiceAvailability` (`types.ts:138`)                                        | absent                                                   | `ServiceStatusEntry.estatus: str` (`types.py:532`).                                                                       |
| `EcfTypeCode`, `TrackStatusCode`, `BaseUrlKey`, `DgiiDocumentType`            | absent (Python uses `Literal`/`str`)                     | Type-level only; acceptable.                                                                                             |
| `UNAVAILABLE_SCHEMAS`, `SCHEMA_DIR` (`validation.ts:21,43`)                   | defined (`validation.py:20,39`) but **not** exported      | A Python caller cannot enumerate why a schema is unavailable without importing the private-ish module.                     |
| `roundHalfUpToCents` (`transformer.ts:34`)                                    | `_round_monetary` (`transformer.py:32`), private          | **Money-critical primitive public in one package, private in the other.** A caller who must pre-round before building a document can only do so in TypeScript. See `F-READ-17`. |
| `createResiliencePolicies`, `defaultResilienceOptions`, `ResiliencePolicies` (`resilience.ts:33,68,78`) | `ResiliencePolicy` (class, `resilience.py:59`) | Different granularity: TS exposes a factory returning bundles; Python exposes the wrapper class.                          |
| `okAsync`, `errAsync`, `ResultAsync`, `fromThrowable`, `fromPromise`, `fromSafePromise` (`result.ts:6-17`) | absent                                    | TS-only by construction (async). `architecture.md §4.4` lists only 7 of the 13 names `result.ts` re-exports.              |
| `DgiiErrorOptions`, `InMemoryIdempotencyStoreOptions`, `RequestOptions`, `EcfOptions` | absent (Python uses kwargs)                     | Documented as an intentional shape difference (§4.11 vs §5.11).                                                          |
| —                                                                            | `is_ok`, `is_err` (`result.py:19`)                       | Not in `__init__.__all__`; unreachable from the package surface.                                                          |
| —                                                                            | `ResponseShapeError` (`types.py:66`)                     | Python-only public error type, exported (`__init__.py:69`) and used in `client.py:96`, but absent from §5.13's list.       |
| —                                                                            | `DEFAULT_IDEMPOTENCY_TTL_S`, `GENERAL_ROUTE`, `SUMMARY_ROUTE` (`http.py:17`, `reception.py:35-36`) | Not exported. TS has no equivalents (`GENERAL`/`SUMMARY` are module-private in `reception.ts:43-51`).                      |

### Error codes

`DgiiErrorCode` matches exactly. The **codes that actually reach a caller** do not, and three of the
four divergences are registered in `architecture.md §14.1` while one is not:

| Failure                                         | TS code                    | PY code                    | Registered?                          |
| ----------------------------------------------- | -------------------------- | -------------------------- | ------------------------------------ |
| Non-2xx, not 401                                | `HTTP` (`http.ts:229`)     | `HTTP` (`http.py:171`)     | n/a — identical                      |
| 401                                             | `AUTH`                     | `AUTH`                     | n/a — identical                      |
| Transport exception                             | `UNKNOWN` (`errors.ts:213` default) | `HTTP` for `httpx2.HTTPError` (`http.py:249-256`), `UNKNOWN` otherwise (`http.py:257-264`) | F-126-13, §14.1                       |
| Timeout                                         | `UNKNOWN` (never `TIMEOUT`) | `HTTP` (never `TIMEOUT`)   | §7 states it — holds                 |
| Circuit open                                    | `UNKNOWN`                  | `HTTP` via pybreaker       | F-126-1, §14.1                       |
| Unroutable/unreadable payload                   | `VALIDATION`               | `VALIDATION`               | n/a — identical code, different message (F-126-7) |
| DGII message text differs in whitespace only    | `JSON.stringify` (`errors.ts:185`) | `json.dumps` (`errors.py:135`) | **NOT registered** — see `F-READ-21` |

## Doc-vs-code drift

`AGENTS.md`'s invariants and `architecture.md`'s exported-surface claims, checked line by line.

| Doc claim                                                                                                                        | Code                                                                                          | Verdict |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------- |
| `AGENTS.md:50` "Money is never floating point. TS … `string`, Python … `Decimal`"                                                 | `types.ts:59-60` `number`; `types.py:350-351` `float`; `types.py:180` `_as_float`              | **BROKEN** — `F-READ-04` |
| `AGENTS.md:51` "never `Number()`/`parseFloat`/`float()` an amount"                                                                | `utils.ts:34` `String(montototal)` after a `number` parameter; `types.py:187` `float(value.strip())` | **BROKEN** — `F-READ-04`, `F-READ-05` |
| `AGENTS.md:47` "only programmer errors throw"                                                                                     | `signing.py:67,81` `raise ValueError`; `signing.py:74` `from_p12` raises on I/O               | **BROKEN** — `F-READ-08` |
| `AGENTS.md:53-61` signing "byte-fidelity work … do not simplify"                                                                  | `signing.py:112` accepts `root_name` and ignores it                                            | **BROKEN** — `F-READ-02` |
| `architecture.md §5.13:936` "`__init__.py` re-exports … `check_b2b_applicability`"                                                | not in `__init__.py:37-44`, not in `__all__`                                                   | **BROKEN** — `F-READ-03` |
| `architecture.md §5.13:935` "(mirror of TS `index.ts`)"                                                                           | `index.ts` is 14 `export *` lines; `__init__.py` is a hand-kept 80-name allowlist              | **BROKEN** — `F-READ-17` |
| `architecture.md §5.10:836` "`convert_ecf32_to_rfce(...) -> dict[str,str]` `# {"xml": …, "security_code": …}`"                     | `utils.py:244` returns `"securityCode"`                                                        | **BROKEN** — `F-READ-06` |
| `architecture.md §4.9:428-436` `static json2xml(json, opts?): string` / `static xml2json(xml, opts?): unknown`                      | `transformer.ts:98,134` instance methods returning `Result<string>` / `Result<T>`              | **BROKEN** — `F-READ-14` |
| `architecture.md §5.9:816-820` `@staticmethod def json_to_xml(data, round_monetary=False)`                                          | `transformer.py:76,100` instance methods; `round_monetary` keyword-only                        | **BROKEN** — `F-READ-14` |
| `architecture.md §5.8:805` `def sign_xml(self, xml, root_name: str \| None = None)`                                                | `root_name` never read                                                                         | **BROKEN** — `F-READ-02` |
| `architecture.md §9.1:1047` "Implemented by `HttpClient.buildIdempotencyKey` / `build_idempotency_key`"                            | private on `ECF` (`client.ts:215`, `client.py:223`); `HttpClient` has no such method            | **BROKEN** — `F-READ-15` |
| `architecture.md §4.6:373-375` "derived by the client (`ECF#buildIdempotencyKey`), not by `HttpClient`"                            | correct                                                                                        | holds — and contradicts §9.1 |
| `architecture.md §9.4:1085-1087` step 1 `rnc = extractElementText(signedXml,'RNCEmisor') ?? 'RncEmisor'`                           | `client.ts:441-443` falls back to *extracting* `RncEmisor`, not to the literal `'RncEmisor'`   | **BROKEN** (doc typo with a real consequence: `'RncEmisor'` would become every ANECF's key prefix) — folded into `F-READ-15` |
| `architecture.md §5.5:726` `max_retries: int = 3  # … (TS: 4, §14 F-126-8)`                                                        | correct                                                                                        | holds — and contradicts `resilience.ts:17` |
| `architecture.md §5.6:755` `timeout_s: float = 15.0` on `HttpClientOptions`                                                       | correct, and used (`http.py:121`)                                                              | holds |
| `architecture.md §5.5:729` `timeout_s` on `ResilienceOptions`                                                                     | never read by anything (`resilience.py:62-73` ignores it)                                      | **BROKEN** — `F-READ-09` |
| `architecture.md §4.8:424-426` "`rootElName` defaults to the parsed root element, so callers rarely pass it"                            | correct for TS (`signing.ts:98`), false for Python                                             | **BROKEN** — `F-READ-02` |
| `architecture.md §4.7:393-395` `getKeyFromStringBase64` / `getCertificateInfoFromBase64`                                              | correct                                                                                        | holds |
| `architecture.md §4.12:606-613` index.ts surface list                                                                             | omits `SUMMARY_*`, `UNAVAILABLE_SCHEMAS`, `SCHEMA_DIR`, `SCHEMA_FILES`-adjacent helpers, `TrackStatusEnum`, `roundHalfUpToCents`, `pruneEmptyValues`, `isRetryableStatus`, `extractDgiiErrorMessage`, `ResilienceOptions`, `EcfOptions`, `defaultResilienceOptions` | **BROKEN** — `F-READ-17` |
| `architecture.md §14.1:1393-1402` "Registered parity divergences"                                                                 | at least 7 further divergences unregistered                                                    | **BROKEN** — `F-READ-07`, `F-READ-13`, `F-READ-16`, `F-READ-11`, `F-READ-12` |
| `architecture.md §9.3:1063` "`store.set(key, pending)`"                                                                           | TS `{pending:true}` (`client.ts:141`), PY `{"__pending__":true}` (`client.py:63`)              | **BROKEN** — `F-READ-13` |
| `AGENTS.md:68` "TS `validateDocument` shells out to `xmllint`"                                                                    | correct (`validation.ts:139`)                                                                  | holds |
| `AGENTS.md:20-25` every `mise run …` command it promises                                                                          | all defined in `mise.toml` (`bootstrap`, `ci`, `lint`, `test`, `build`, `hooks`, `hooks-install`, `verify-signing-typescript`, `lint-python`) | **holds** |
| `AGENTS.md:38` focused runs: `test/signing.test.ts`, `tests/test_signing.py -k digest`                                            | both files exist (`typescript/test/signing.test.ts`, `python/tests/test_signing.py`)            | holds |
| `CONTRIBUTING.md:24-27,130` `bun run test|typecheck|lint|build`                                                                    | all four in `packages/typescript/package.json` `scripts`                                       | holds |
| `AGENTS.md:16-18` "no root `package.json`"                                                                                        | confirmed absent                                                                               | holds |

**No `mise.toml` mismatch exists.** Every task `AGENTS.md`/`CONTRIBUTING.md` invoke is defined
(`mise.toml:15,47,56,70,86,94,40,36`), and every `mise run` in any `.md` resolves. I diffed the two
sets mechanically. `bootstrap-python` uses plain `uv sync` rather than `--frozen` (`mise.toml:31`) —
`AGENTS.md:41-42` scopes the `--frozen` rule to hooks, so this is consistent.

## Findings

### F-READ-01 — `maxRetries` is documented as "attempts" and behaves as "retries"

- **Severity:** HIGH (blocker)
- **Where:** `packages/typescript/src/resilience.ts:17-18`; `packages/python/src/py_dgii_ecf/resilience.py:39`
- **Verified by running** (`bun -e` against `createResiliencePolicies`): `maxRetries: 3` produces **4**
  transport attempts; `maxRetries: 1` produces **2**.

The comment claims the opposite of the behaviour:

```ts
// resilience.ts:17-18
/** Maximum number of attempts (including the first). Default 3. */
maxRetries?: number;
```

but `maxRetries` is passed straight to cockatiel's `maxAttempts` (`resilience.ts:84`), which counts
*retries*, so 3 means 4 attempts. `architecture.md §4.5:316-326` documents this correctly and cites
`§14 F-126-8`; `resilience.ts` is the only place that says "including the first".

**What a maintainer will get wrong:** they will tune retries down to 3 attempts for a submission path,
read the field comment to confirm, ship 4 attempts, and then have to reason about why the
`architecture.md §9.5` lease arithmetic (≈61 s per reconcile call, `§9.5:1208-1212`) does not match
production timing. The Python side compounds it: `max_retries: int = 3` (`resilience.py:39`) feeds
`stop_after_attempt(3)` (`resilience.py:70`) — 3 attempts. **The same option name means 4 in one
package and 3 in the other**, both with default `3`.

**Concrete edit:**

```ts
// packages/typescript/src/resilience.ts:16-18
/**
 * Retries *after* the first attempt, passed to cockatiel's `maxAttempts`.
 * Default 3 — i.e. **4 transport attempts** per logical call, where Python's
 * `stop_after_attempt(3)` means 3 (`architecture.md §14`, F-126-8). Do not rename:
 * the divergence is frozen resource configuration.
 */
maxRetries?: number;
```

```python
# packages/python/src/py_dgii_ecf/resilience.py:39
# Total attempts (tenacity's stop_after_attempt). 3 here == 3 transport
# attempts; TypeScript's maxRetries=3 means 4 (`architecture.md §14`, F-126-8).
max_retries: int = 3
```

**Verify:** `bun -e 'import {createResiliencePolicies} from "./src/resilience.ts"; let n=0; try{await createResiliencePolicies({maxRetries:3}).policy.execute(async()=>{n++; throw Object.assign(new Error("network"),{name:"FetchError"})})}catch{}; console.log(n)'`
→ `4`.

---

### F-READ-02 — `Signature.sign_xml`'s `root_name` parameter is inert; in TypeScript it selects the signed element

- **Severity:** HIGH (blocker — signing path)
- **Where:** `packages/python/src/py_dgii_ecf/signing.py:112-143`; contrast `packages/typescript/src/signing.ts:96-118`
- **Verified by running:** signing the same document with `root_name="SemillaModel"` and with
  `root_name="TotallyWrongElement"` produces **byte-identical output**; `grep` for `root_name` inside
  the method body finds nothing.

```python
# signing.py:112 — root_name is declared here…
def sign_xml(self, xml: str, root_name: str | None = None) -> DgiiResult[str]:
    """Sign ``xml`` and return the signed document (declaration included)."""
    try:
        parser = etree.XMLParser(remove_blank_text=True, remove_comments=True)
        root = etree.fromstring(xml.encode("utf-8"), parser=parser)
    ...
    self._sign_element(root)          # …and never reaches here. Digest is over `root`.
```

```ts
// signing.ts:98,114 — in TypeScript it decides what gets digested
const elementName = rootElName ?? rootName;
sig.addReference({ xpath: `//*[local-name(.)='${elementName}']`, ... });
```

`ECF.authenticate` passes `"SemillaModel"` (`client.py:309-311`) — the value is discarded. The two
sites that *do* pass a name (`tests/test_signing.py:108`, `test_validation.py:165`) therefore test
nothing. `architecture.md §5.8:805` publishes the parameter as if it were meaningful.

**What a maintainer will get wrong:** everything signing-related. `AGENTS.md:53-61` says signing is
byte-fidelity work where a "simplification" is a production bug. A maintainer told that the reference
target is a parameter will, when DGII rejects a document, look at the parameter, not at the digest —
and will not discover that the Python digest target is *always the document root* while TypeScript's
is *the element you name*. For an envelope whose root is not the fiscal document, the two packages
sign different byte ranges and only libxmlsec1 will disagree (which is exactly the failure mode
`AGENTS.md:59-61` warns about).

**Concrete edit — either remove the lie or honour it.** If Python is intended to always sign the root
(the reference `URI=""` and `<Signature>`-as-last-child scheme only makes sense for the root), delete
the parameter and make the asymmetry explicit:

```python
# signing.py:112
def sign_xml(self, xml: str) -> DgiiResult[str]:
    """Sign ``xml`` and return the signed document (declaration included).

    The signature always references the document root: ``URI=""`` with
    ``<Signature>`` appended as the last child only verifies that way. The
    TypeScript SDK takes an optional element name and selects the referenced
    node by XPath; Python does not, deliberately — see architecture §14.1.
    """
```

and update the two call sites (`client.py:309`, `cli.py:67`, `tests/test_signing.py:108`,
`tests/test_validation.py:165`), plus `architecture.md §5.8:805`. If instead the parameter should work,
thread it into `_sign_element` and add a `c14n`-sensitive fixture with a non-root reference target.

**Verify:** the byte-identity check above; and after the edit, `grep -rn "sign_xml(" packages/python`
must show no second positional argument, and `uv run pytest tests/test_signing.py` must still pass.

---

### F-READ-03 — `architecture.md` says `__init__.py` re-exports `check_b2b_applicability`; it does not

- **Severity:** HIGH
- **Where:** `project-docs/architecture.md:936` vs `packages/python/src/py_dgii_ecf/__init__.py:37-44,95-174`
- **Verified by running:** `hasattr(py_dgii_ecf, "check_b2b_applicability")` → `False`.

```python
# architecture.md:935-938
# Re-exports the full public surface (mirror of TS index.ts): the client `ECF`, `P12Reader`,
# `Signature`, `Transformer`, `validate_document`, `format_violations`, `resolve_reception_route`,
# `check_b2b_applicability`, `can_reuse_sequence`, `InMemoryIdempotencyStore`, the URL builders, …
```

```python
# __init__.py:37-44 — the actual reception import list
from .reception import (
    CONSUMPTION_SUMMARY_THRESHOLD,
    ECF_TYPE_CODES,
    ReceptionRoute,
    compare_decimal,
    is_ecf_type_code,
    resolve_reception_route,
)
```

`check_b2b_applicability` is a public function (`reception.py:130`), is documented as public in
§5.13, and is exported by TypeScript via `index.ts` → `export * from './reception.js'`. In Python it
is reachable only as `py_dgii_ecf.reception.check_b2b_applicability`, i.e. via a submodule. The
asymmetry is invisible: `is_ecf_type_code` *from the same import block* **is** in `__all__`
(`__init__.py:167`), so the omission looks like an oversight rather than a decision — and nothing in
the tree records that it is intentional (it is not).

**What a maintainer will get wrong:** they will write Python code per the contract
(`from py_dgii_ecf import check_b2b_applicability`) and get `ImportError` — after the TypeScript
version worked. Then, having "fixed" it by importing the submodule, they will not notice that the
next such function added to `reception.py` is also missing.

**Concrete edit (both packages, one commit):**

```python
# packages/python/src/py_dgii_ecf/__init__.py:37
from .reception import (
    CONSUMPTION_SUMMARY_THRESHOLD,
    ECF_TYPE_CODES,
    ReceptionRoute,
    check_b2b_applicability,   # added — §5.13 already claims it
    compare_decimal,
    is_ecf_type_code,
    resolve_reception_route,
)
```

and `"check_b2b_applicability"` in the `__all__` list (`__init__.py:95-174`, alphabetical before
`compare_decimal`). No TypeScript change needed. Then add the surface test from D-4.

**Verify:** `uv run python -c "from py_dgii_ecf import check_b2b_applicability; print('ok')"`.

---

### F-READ-04 — Money is floating point in both packages

- **Severity:** HIGH (blocker — breaks a stated invariant)
- **Where:** `packages/typescript/src/types.ts:59-60`; `packages/python/src/py_dgii_ecf/types.py:350-351,369-374,180-192`
- **Verified by running:** `InquiryStatusResponse.from_dict({"montoTotal": "1234.565"}).monto_total`
→ `1234.565` as `float`.

```ts
// types.ts:52-66
export interface InquiryStatusResponse {
  codigo: InquiryStatusCode;
  estado: InquiryStatus;
  ...
  montoTotal?: number;   // ← money
  totalITBIS?: number;   // ← money
```

```python
# types.py:350-351 and the reader at 369-374
monto_total: float | None = None
total_itbis: float | None = None
...
monto_total=_as_optional_or_none(_as_float, data.get("montoTotal"), "montoTotal"),

# types.py:180-192
def _as_float(value: object, key: str) -> float:
    ...
    return float(value.strip())      # ← exactly what AGENTS.md:51 forbids
```

Three documents disagree with the code, and they disagree differently:

- `AGENTS.md:50-52`: "TS keeps amounts as `string`, Python as `Decimal` … Never
  `Number()`/`parseFloat`/`float()` an amount — a rounding drift corrupts the signed digest."
- `architecture.md §2.3:41`: "Python `Decimal`; TypeScript `string` in the document model."
- `architecture.md §4.2:190-191`: "monetary/amount fields are `string`."
- `architecture.md §5.2:658`: "Monetary fields are `Decimal` per §3.4."

The code is `number` / `float` in **both**. `float()` on an amount is `AGENTS.md:51`'s named
anti-pattern, verbatim, on the wire-parsing path.

**What a maintainer will get wrong:** the most expensive possible thing on this codebase. They will
add a new amount field, follow `AGENTS.md`, type it `string`/`Decimal`, and produce a model whose other
amount fields are floats — then compare across fields, or round-trip one into a signed document, and
have a one-cent drift that libxmlsec1 cannot localise. Conversely, a maintainer who trusts the code
will change `architecture.md §5.2` to say `float`, and the invariant dies by documentation.

**Concrete edit — pick the cheaper of two consistent worlds and write it down.**

Cheapest (models only, no signing impact, since these are response fields that nothing rounds):

```ts
// types.ts:59-60
  /** Decimal string, never a number — `AGENTS.md` money invariant. */
  montoTotal?: string;
  totalITBIS?: string;
```

```python
# types.py:350-351
monto_total: Decimal | None = None
total_itbis: Decimal | None = None
# types.py, reader: replace _as_float with a Decimal reader
def _as_decimal(value: object, key: str) -> Decimal:
    """Read a money amount as ``Decimal`` (never ``float`` — AGENTS.md invariant)."""
    if isinstance(value, bool):
        raise _type_error(key, "a decimal amount", value)
    if isinstance(value, Decimal):
        return value
    if isinstance(value, (int, str)):
        try:
            return Decimal(str(value).strip())
        except InvalidOperation:
            raise _type_error(key, "a decimal amount", value) from None
    raise _type_error(key, "a decimal amount", value)
```

and in `types.py:369-374`, `_as_optional_or_none(_as_decimal, …)`. Then delete `_as_float`
(`types.py:180-192`) so it cannot be reused. If `number` is truly intended, change `AGENTS.md:50-52`,
`architecture.md §2.3`, §4.2 and §5.2 in the same commit — but then `AGENTS.md`'s rationale
("a rounding drift corrupts the signed digest") needs a rebuttal, because nothing rebuts it today.

**Verify:** after the edit, `grep -n "float" packages/typescript/src/types.ts
packages/python/src/py_dgii_ecf/types.py` must be empty, and
`uv run python -c "from py_dgii_ecf.types import InquiryStatusResponse as R; print(type(R.from_dict({'codigo':1,'estado':'x','montoTotal':'1234.565'}).monto_total))"`
must print `<class 'decimal.Decimal'>`.

---

### F-READ-05 — `generateFcQRCodeURL` takes a money amount as `number` and silently drops trailing zeros

- **Severity:** HIGH
- **Where:** `packages/typescript/src/utils.ts:24-35`; `packages/python/src/py_dgii_ecf/utils.py:29-43`
- **Verified by running:**

```
generateFcQRCodeURL(…, 1234.50, …)  → …&montototal=1234.5&…
generateFcQRCodeURL(…, 1234.00, …)  → …&montototal=1234&…
generateEcfQRCodeURL(…, "1234.50", …) → …&montototal=1234.50&…
```

```ts
// utils.ts:24-35
export const generateFcQRCodeURL = (
  rncemisor: string,
  encf: string,
  montototal: number,          // ← money as a JS number
  codigoseguridad: string,
  env: Environment,
): string => `…&montototal=${encodeURIComponent(String(montototal))}&…`;
```

```python
# utils.py:29-35
def generate_fc_qr_code_url(
    rncemisor: str, encf: str,
    montototal: int | float | str,   # ← three types, one of them money-as-float
    ...
```

`architecture.md §4.10:442-448` documents `monto: string` for **both** helpers. The e-CF helper
(`utils.ts:41`) does take `string`, so the same SDK formats the same amount two different ways
depending on which QR you ask for: `"1234.50"` on the e-CF URL, `"1234.5"` on the FC URL. DGII's QR
payload is a fiscal amount; the trailing zero is part of how it is written.

**What a maintainer will get wrong:** they will call `generateFcQRCodeURL` with a decimal string
(what every other API in the package accepts, and what §4.10 says to pass), get a TypeScript compile
error, "fix" it with `Number(monto)`, and ship a QR that encodes `1234.5`. Or they will read
`montototal: number` and conclude money is numeric here — reinforcing `F-READ-04`.

**Concrete edit:**

```ts
// utils.ts:27
  montototal: string,
```

```ts
// utils.ts:34 — no String() conversion needed
  )}&montototal=${encodeURIComponent(montototal)}&codigoseguridad=${encodeURIComponent(
```

```python
# utils.py:32
    montototal: str,
```

Then update call sites (`examples/typescript`, `examples/python`) and any test passing a number. A
`number` argument should become a compile/type error, which is the point.

**Verify:** `bun -e` with `"1234.50"` must emit `montototal=1234.50` on both helpers; and
`uv run python -c "from py_dgii_ecf.utils import generate_fc_qr_code_url as f; from py_dgii_ecf import Environment; print('1234.50' in f('1','2','1234.50','x',Environment.CERT))"`.

---

### F-READ-06 — The documented RFCE result key is `security_code`; the code returns `securityCode`

- **Severity:** HIGH
- **Where:** `packages/python/src/py_dgii_ecf/utils.py:244`; contract at `project-docs/architecture.md:836`
- **Verified by reading** (the fixture in `examples/fixtures/invoice-32.xml` is unsigned, so the call
  short-circuits to `Err(SIGNING)` before reaching the return — the return statement at `utils.py:244`
  is the evidence).

```python
# architecture.md:836
def convert_ecf32_to_rfce(ecf32_xml: str) -> dict[str, str]: ...  # {"xml": ..., "security_code": ...}
```

```python
# utils.py:134, 244
def convert_ecf32_to_rfce(ecf32_xml: str) -> DgiiResult[dict[str, str]]:
    ...
    return Ok({"xml": xml.unwrap(), "securityCode": security_code})
```

The TypeScript version returns a **typed object** `{ xml: string; securityCode: string }`
(`utils.ts:172`), which the contract documents correctly at §4.10. Python returns a bare `dict[str, str]`
with a camelCase key — so §5.10's `security_code` is wrong on two counts (it exists nowhere, and
`securityCode` violates `architecture.md §2.5:45` "Signatures are snake_case in Python").

**What a maintainer will get wrong:** a Python integrator reading the contract writes
`result.unwrap()["security_code"]` and gets `KeyError` at runtime, with no type error to warn them —
`dict[str, str]` accepts any string key. This is the conversion path for every E32 below RD$250,000
(`AGENTS.md:63-67`), i.e. the common case for retail invoices.

**Concrete edit:** make the return type honest in Python (a frozen dataclass beats a dict) and fix
§5.10 to match. Minimal version that keeps the dict:

```python
# utils.py:134
def convert_ecf32_to_rfce(ecf32_xml: str) -> DgiiResult[dict[str, str]]:
    """Build the RFCE (summary invoice) document from a signed ECF-32 document.

    Returns ``{"xml": <unsigned RFCE>, "securityCode": <6-digit code>}``. The key is
    ``securityCode`` in both packages, matching ``convertECF32ToRFCE`` in TypeScript.
    """
```

and

```markdown
<!-- architecture.md:836 -->
def convert_ecf32_to_rfce(ecf32_xml: str) -> DgiiResult[dict[str, str]]: ...  # {"xml": ..., "securityCode": ...}
```

Better, if the surface can take it: `@dataclass(frozen=True) class RfceConversion: xml: str;
security_code: str` — a name that cannot be mistyped. That is a breaking change, so it should be the
`0.8.0` decision, not a hotfix.

**Verify:** a test that asserts the key set — `assert set(convert_ecf32_to_rfce(signed).unwrap()) == {"xml", "securityCode"}`
in `packages/python/tests/test_utils.py`, and the mirror assertion in `test/utils.test.ts`.

---

### F-READ-07 — `§14.1` presents itself as the register of divergences; at least seven are missing, and it mis-scopes `resource`

- **Severity:** HIGH (the failure mode is "trusted a complete list that is not complete")
- **Where:** `project-docs/architecture.md:1386-1402`; `packages/python/src/py_dgii_ecf/http.py:172-181`
- **Verified by reading** (grepped every `DgiiError(` construction in both packages for `resource=`)

`§14.1:1388-1391` opens: "The two packages are behaviourally identical on the reconcile path for every
response DGII answers … These divergences are known, permanent until their follow-up lands, and a
reader of the parity promise must know them." The table has 8 rows. The code has more:

| Divergence                                                                        | Where                                                                   | In §14.1? |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------- |
| `DgiiError.resource` / `method` / `base_url` are **never** set in Python, on any path | `http.py:172-181` builds the error with `message, code, status, status_text, data` only | **No** — F-126-12 says "not on the Python query path", which implies the submission path does |
| A non-object **submission** body: TS `Ok(body)`, Python `Err(VALIDATION)` + marker retained | `client.ts:251-260` vs `client.py:241-262`                                  | No — `F-READ-16` |
| Cached idempotency value shape: TS stores the parsed result, Python stores the raw `dict` and re-parses | `client.ts:255` vs `client.py:261`                                        | No — `F-READ-13` |
| Pending-marker key: `{pending:true}` vs `{"__pending__":true}`                      | `client.ts:141` vs `client.py:63`                                          | No — `F-READ-13` |
| `validateXMLCertificate` string formats for `validFrom`/`validTo`/`subject`/`issuer` | `signing.ts:166-169` vs `signing.py:223-226`                              | No — `F-READ-11` |
| `SchemaViolation.path`: element name vs XPath; `formatViolations` drops an empty label, `format_violations` does not | `validation.ts:180-187` vs `validation.py:132`                            | No — `F-READ-12` |
| Status-service payloads: Python parses strictly and can `Err`, TS passes through | `client.py:640-649` vs `client.ts:360-372`                                  | No |
| Fallback message text for an unclassifiable object: `JSON.stringify` vs `json.dumps` separators | `errors.ts:185` vs `errors.py:135`                                        | No — `F-READ-21` |
| `Signature` constructor can throw in Python, cannot in TS                          | `signing.py:62-71` vs `signing.ts:71-74`                                  | No — `F-READ-08` |

`F-126-12`'s scoping is the sharpest of these: the text says "`DgiiError.resource` is populated in
TypeScript and **not** on the Python query path, so only a TypeScript caller can name the failing
read." In fact Python never populates it, including for `send_electronic_document`, where TS always
does (`client.ts:582` `resource: Endpoint.SendInvoice`). A maintainer instrumenting submission
failures reads F-126-12 and writes `err.resource` on the Python side.

**What a maintainer will get wrong:** they will treat §14.1 as the closed set — that is what
"Registered parity divergences" and "the parity promise" mean — and will not re-derive parity for the
paths it omits. Every finding below that is a parity gap is, at the root, this one.

**Concrete edit:** rewrite the §14.1 preamble to say what the table is, and add rows:

> These are the divergences **on the reconcile path and its error classification**. The register is
> not exhaustive for the rest of the surface: **`DgiiError.resource`, `.method` and `.baseURL` are
> never populated in Python, on any path** (TypeScript always populates all three), and the
> model-parsing, schema-violation and certificate-metadata shapes differ as listed in rows F-126-14
> to F-126-19.

and give the Python error construction the `resource` it claims to have:

```python
# http.py:172-181 — thread the endpoint through `_parse`
error = DgiiError(
    message,
    code=code,
    status=response.status_code,
    status_text=response.reason_phrase,
    resource=resource,     # new: the `Endpoint`/`StatusEndpoint` the caller passed
    method=method,
    data=data,
)
```

with `_parse(self, response, *, resource, method)` and every `_execute` call updated — this deletes
row F-126-12 instead of documenting it.

**Verify:** `grep -rn "resource=" packages/python/src` must return non-zero after the edit;
`grep -c "resource" packages/typescript/src/*.ts` is the shape to match.

---

### F-READ-08 — `Signature` can throw domain errors in Python; "Results, not exceptions" says it cannot

- **Severity:** HIGH
- **Where:** `packages/python/src/py_dgii_ecf/signing.py:62-71` (`__init__`) and `:73-88` (`from_p12`)
- **Verified by reading**

```python
# signing.py:62-71
def __init__(self, private_key_pem: str, certificate_pem: str) -> None:
    loaded_key = serialization.load_pem_private_key(
        private_key_pem.encode("utf-8"), password=None     # raises ValueError
    )
    if not isinstance(loaded_key, rsa.RSAPrivateKey):
        raise ValueError("DGII signing requires an RSA private key")
```

```python
# signing.py:74-88
@classmethod
def from_p12(cls, file_name: str | Path, password: str) -> Signature:
    """Build a signer directly from a .p12 file."""
    data = Path(file_name).read_bytes()                    # raises OSError
    key, certificate, _ = pkcs12.load_key_and_certificates(...)   # raises ValueError
    if key is None or certificate is None:
        raise ValueError("PKCS#12 must contain a private key and certificate")
```

`AGENTS.md:46-48`: "Domain and I/O failures are returned (`neverthrow` in TS, `result` in Python);
only programmer errors throw." A wrong passphrase and a missing file are domain/I-O failures, not
programmer errors. TypeScript's constructor (`signing.ts:71-74`) stores two strings and cannot fail.

`from_p12` is `try_from_p12`'s raising twin (`signing.py:90-110`), whose docstring calls itself "the
additive counterpart … Prefer this when the caller already threads `Result`" — i.e. the package
knowingly ships the exception-shaped API beside the `Result` one, and nothing in `architecture.md §5.8`
mentions `from_p12` at all. `cli.py` and `client.py` use `Signature(credentials.key, credentials.cert)`
directly (`cli.py:67`, `client.py:309`), so **the CLI can crash with a traceback** where
`_load_credentials` already proved the PEMs parse — but any caller assembling `P12ReaderData` by hand
gets a `ValueError` out of a function whose signature promises `DgiiResult`.

**What a maintainer will get wrong:** they will `except` nothing (the type says they need not), and
their `Signature(...)` call in an `async`/job context will raise a raw `ValueError` past the Result
boundary — the exact class of failure the invariant exists to prevent. And a maintainer porting a
TypeScript `Result`-returning fix will not find a Python counterpart to put it in.

**Concrete edit:** keep `__init__` total — defer key loading to `sign_xml`, where `Result` already
lives — and delete or deprecate `from_p12`:

```python
# signing.py:59-71
class Signature:
    """Sign DGII XML documents with an RSA private key + X.509 certificate."""

    def __init__(self, private_key_pem: str, certificate_pem: str) -> None:
        self._private_key_pem = private_key_pem
        self._certificate_pem = certificate_pem
        self._loaded: tuple[rsa.RSAPrivateKey, x509.Certificate] | None = None

    def _load(self) -> DgiiResult[tuple[rsa.RSAPrivateKey, x509.Certificate]]:
        """Parse the PEMs once, reporting a bad key/cert as ``Err(CERTIFICATE)``."""
```

then `from_p12` becomes `Ok`-returning or is removed in favour of `try_from_p12`. Also add
`from_p12` to `architecture.md §5.8` if it survives, and mark it `# raises — prefer try_from_p12`.

**Verify:** `uv run python -c "from py_dgii_ecf import Signature; s=Signature('not a pem','nor this'); print('constructed')"`
must print, and `s.sign_xml('<ECF/>').is_err()` must be `True` with code `CERTIFICATE`.

---

### F-READ-09 — `HttpClient.timeout_s` reports a value that is not the timeout in effect; `ResilienceOptions.timeout_s` is dead

- **Severity:** MEDIUM
- **Where:** `packages/python/src/py_dgii_ecf/http.py:125-128`, `:121`; `resilience.py:42,62-73`
- **Verified by running:**

```
HttpClient(HttpClientOptions(base_url="x", timeout_s=3.0)).timeout_s          → 15.0
HttpClient(HttpClientOptions(..., timeout_s=3.0, resilience=ResilienceOptions(timeout_s=99.0))).timeout_s → 99.0
ECF(P12ReaderData(), Environment.DEV, timeout_s=1.0)._http.timeout_s        → 15.0
```

```python
# http.py:125-128
@property
def timeout_s(self) -> float:
    """The configured per-request timeout in seconds."""
    return self._policy.options.timeout_s        # ← the policy's field, never used as a timeout

# http.py:121 — the actual timeout
self._client = client or httpx2.Client(timeout=options.timeout_s)
```

`ResiliencePolicy.__init__` (`resilience.py:62-73`) reads `breaker_threshold`, `reset_timeout_s` and
`max_retries`; it never reads `timeout_s`. So `ResilienceOptions.timeout_s` (`resilience.py:42`,
documented in `architecture.md §5.5:729`) is inert configuration, and the one public property that
exposes a timeout exposes the inert one. A caller constructing `ECF(..., timeout_s=1.0)` gets a 1-second
HTTP timeout and a `15.0` from the accessor.

**What a maintainer will get wrong:** they will write a test or a health check against
`http.timeout_s` to assert the configured SLA, see `15.0` while the client is actually on `1.0`, and
conclude the customer config was not applied. The next step is "fix" the wrong line. Also `ECF` has no
`timeout_s` accessor at all, so the only way to read the effective timeout is this one — and it is
wrong.

**Concrete edit:**

```python
# http.py:118-128
self._timeout_s = options.timeout_s
self._client = client or httpx2.Client(timeout=self._timeout_s)
...
@property
def timeout_s(self) -> float:
    """The per-request timeout actually handed to ``httpx2.Client``."""
    return self._timeout_s
```

and either wire `ResilienceOptions.timeout_s` into a tenacity `stop_after_delay`, or delete it from
`resilience.py:42` and `architecture.md §5.5` (the spec's §3.3 lists tenacity for retry only, so
deleting is honest). Do not leave a knob that turns nothing.

**Verify:** the three-line snippet above must print `3.0`, `3.0`, `1.0`.

---

### F-READ-10 — `voidENCF`'s docstring names a key component the key does not use first

- **Severity:** MEDIUM
- **Where:** `packages/typescript/src/client.ts:861-863` vs `:221-227`
- **Verified by reading**

```ts
// client.ts:861-863
  /**
   * Submit a signed range-voiding request (ANECF). Idempotent like
   * submissions, keyed on `RNC + RangoNCF + SHA-256(signed XML)`.
   */
  voidENCF(...)
```

```ts
// client.ts:221-227 — what buildIdempotencyKey actually does
    // ECF/ACECF carry `eNCF`; ANECF carries the first `SecuenciaeNCFDesde`.
    // `RangoNCF` stays as a fallback for hand-built documents.
    const ncf =
      extractElementText(signedXml, 'eNCF') ??
      extractElementText(signedXml, 'SecuenciaeNCFDesde') ??
      extractElementText(signedXml, 'RangoNCF') ??
      'unknown-ncf';
```

`RangoNCF` is the **third** fallback, not the key's middle segment. The docstring was written for a
previous revision of `buildIdempotencyKey`.

**What a maintainer will get wrong:** a maintainer debugging a duplicate-void gets a false model of
the key: they will look at whether `RangoNCF` is present in the ANECF, find it is not (the schema
carries `SecuenciaeNCFDesde`), and conclude the key falls through to `'unknown-ncf'` — i.e. that
*every* ANECF shares a key. That is a plausible and alarming conclusion, and it is wrong. The
`architecture.md §9.1:1043` text ("`eNCF` … `fileName` `{RNC}{eNCF}.xml` is the fallback") also
describes a `fileName` fallback that `buildIdempotencyKey` does not implement.

**Concrete edit:**

```ts
// client.ts:861-863
  /**
   * Submit a signed range-voiding request (ANECF). Idempotent like submissions,
   * keyed on `RNC + SecuenciaeNCFDesde + SHA-256(signed XML)` — see
   * {@link buildIdempotencyKey}, whose `RangoNCF` branch is only a fallback for
   * hand-built documents.
   */
```

and align `architecture.md §9.1:1041-1045` with the three-branch `??` chain in both packages
(`client.py:233-238` is identical to TypeScript, so only the prose changes).

**Verify:** `grep -n "keyed on" packages/typescript/src/client.ts` — all four docstrings must name the
same element that `buildIdempotencyKey` prefers first for that document type.

---

### F-READ-11 — `validateXMLCertificate` returns certificate fields in incompatible formats

- **Severity:** MEDIUM
- **Where:** `packages/typescript/src/signing.ts:164-171`; `packages/python/src/py_dgii_ecf/signing.py:221-228`
- **Verified by running** on `examples/fixtures/test.xml`:

```
ts: {"isValid":true,
     "subject":"C=DO\nO=dgii-ecf test fixtures\nCN=dgii-ecf-fixture",
     "issuer":"C=DO\nO=dgii-ecf test fixtures\nCN=dgii-ecf-fixture",
     "validFrom":"Jan  1 00:00:00 2024 GMT","validTo":"Jan  1 00:00:00 2035 GMT"}
py: XmlCertificateValidation(is_valid=True,
     subject='CN=dgii-ecf-fixture,O=dgii-ecf test fixtures,C=DO',
     issuer='CN=dgii-ecf-fixture,O=dgii-ecf test fixtures,C=DO',
     valid_from='2024-01-01T00:00:00+00:00', valid_to='2035-01-01T00:00:00+00:00')
```

Four fields, one name each, two meanings each. `subject` differs in both separator (newline vs comma)
and attribute order (C-first vs CN-first). `validFrom` is OpenSSL's `asctime`-ish format in TypeScript
and ISO-8601 in Python. `CertificateInfo` from `P12Reader` has the same problem one layer up: TS joins
`shortName=value` with `", "` (`certificate.ts:102-107`), Python uses `rfc4514_string()`
(`certificate.py:166-167`) — for the same certificate, `"CN=dgii-ecf-fixture, O=…, C=DO"` vs
`"CN=dgii-ecf-fixture,O=…,C=DO"`.

**What a maintainer will get wrong:** they will write a certificate-expiry alert that parses
`validTo`, port it, and get a `ValueError` in Python (or silently mis-parse in TS). Or they will
compare `subject` against a pinned expected DN to detect a rotated certificate; the check passes in
one language and fails in the other, and the failure looks like a rotation.

**Concrete edit — one format, both packages.** ISO-8601 is the safe choice for `validFrom`/`validTo`
(TS: `new Date(certificate.validFrom).toISOString()`, `signing.ts:168-169`) and RFC 4514 for
`subject`/`issuer` (TS: `new crypto.X509Certificate(der).subject` already emits
newline-separated OpenSSL form — convert with `split('\n').reverse().join(',')`, or document the TS
form and make Python emit it). Then say so in `architecture.md §4.8`/§5.8:

```ts
// signing.ts:164-171
      validFrom: new Date(certificate.validFrom).toISOString(),  // ISO-8601, matches Python
      validTo: new Date(certificate.validTo).toISOString(),
```

**Verify:** a shared fixture assertion in `typescript/test/signing.test.ts` and
`python/tests/test_signing.py` pinning the exact strings, so the formats cannot drift again.

---

### F-READ-12 — `SchemaViolation.path` is an element name in TypeScript and an XPath in Python

- **Severity:** MEDIUM
- **Where:** `packages/typescript/src/validation.ts:84-108,175-187`; `packages/python/src/py_dgii_ecf/validation.py:122-134`
- **Verified by reading**

```ts
// validation.ts:84 — path is captured from `xmllint`'s "element <name>: <msg>" line
const VIOLATION_LINE = /^.*?:(\d+):\s*element\s+([^:]+):\s*(.*)$/;
...
violations.push({ path: (match[2] ?? '').trim(), message: ... });
```

```python
# validation.py:122-127 — path is lxml's full document path
SchemaViolation(path=entry.path or "", message=entry.message)
```

So for the same invalid document, `violation.path` is `"eNCF"` in TypeScript and
`"/ECF/Encabezado/IdDoc/eNCF"` in Python. And the formatter disagrees about what to do with an empty
path: `validation.ts:180-184` emits `message` alone when `path` is `''`; `validation.py:132` emits
`": message"` with a leading colon.

**What a maintainer will get wrong:** they will build a "which field is wrong" UI or a metrics label
from `violation.path`. On the TS side it is a stable low-cardinality label (`eNCF`, `MontoTotal`); on
the Python side it is a high-cardinality XPath. The same dashboard then has two different shapes for
the same metric, and the Python one looks like new elements keep appearing.

**Concrete edit — make Python produce the element name**, matching the documented field:

```python
# validation.py:124
SchemaViolation(
    # `xmllint` reports the element name; match it so the field means one thing
    # in both packages (`architecture.md §4.10`).
    path=(entry.path or "").rsplit("/", 1)[-1],
    message=entry.message,
)
```

and drop the unconditional `f"{v.path}: "` prefix when `path` is empty, mirroring `validation.ts:181`:

```python
# validation.py:132
    shown = "; ".join(
        f"{v.path}: {v.message}" if v.path else v.message for v in violations[:5]
    )
```

Then state the field's meaning once in `architecture.md` next to `SchemaViolation`.

**Verify:** run both against one deliberately-invalid fixutre and diff the `SchemaViolation` list;
`grep -n 'path' packages/python/tests/test_validation.py` will show whether an existing test pins the
XPath form (if it does, that test encodes the drift).

---

### F-READ-13 — The idempotency store is public and pluggable, but the two packages persist incompatible values

- **Severity:** MEDIUM
- **Where:** `packages/typescript/src/client.ts:137-146,251-260`; `packages/python/src/py_dgii_ecf/client.py:63-67,241-292`; contract at `architecture.md §9.2-§9.3`
- **Verified by reading**

Three disagreements inside one interface that `architecture.md §9.2:1052` tells callers to implement
against ("callers can inject Redis/Postgres backends"):

| Concern            | TypeScript                                                    | Python                                                       |
| ------------------ | ------------------------------------------------------------- | ------------------------------------------------------------ |
| value type         | `set<T>(key, value: T)` — any `T` (`http.ts:13-17`)            | `set(key, value: JsonObject)` — a dict only (`http.py:27`)     |
| pending marker     | `{ pending: true }` (`client.ts:141`)                          | `{"__pending__": True}` (`client.py:63`)                      |
| cached payload     | the parsed/normalized result (`client.ts:255`)                 | the **raw** decoded body, re-parsed on every hit (`client.py:261,285`) |

`architecture.md §9.3:1063` says `store.set(key, pending)` with `pending` in quotes as if it were the
string `"pending"` — it is neither package's shape.

**What a maintainer will get wrong:** the scenario §9.2 exists for. A shop running both SDKs against
one Redis (plausible: it is the documented reason to inject a store) writes `{"__pending__": true}`
from Python; the TypeScript reader's `isPendingSubmission` (`client.ts:143-146`) looks for
`.pending === true`, finds nothing, and returns `ok(cached)` — the pending marker is invisible, so TS
treats a dict as a cached *response* and hands the caller a `{"__pending__":true}` typed as
`InvoiceResponse`. Worse in the other direction: Python's `_parse_one(model, cached)` on a TS-written
`InvoiceResponse` object works by luck, but on a TS-written `{pending:true}` returns
`Err(VALIDATION)` with `message` "field 'codigo' must be an integer" — an error that names a field
instead of the real condition.

**Concrete edit:** make the marker a documented, shared, opaque constant and let the store hold any
value:

```ts
// reconciliation.ts — next to PENDING_SUBMISSION_MESSAGE
/**
 * Wire form of the pending marker. Persisted through `IdempotencyStore`, so it is a
 * cross-package contract: Python writes the identical object
 * (`py_dgii_ecf/reconciliation.py`). Do not change one side alone.
 */
export const PENDING_SUBMISSION_MARKER = { pending: true } as const;
```

```python
# reconciliation.py — mirror
#: Wire form of the pending marker. Persisted through ``IdempotencyStore``, so it is a
#: cross-package contract: TypeScript writes the identical object. Change both or neither.
PENDING_SUBMISSION_MARKER: Final[JsonObject] = {"pending": True}
```

and widen the Python protocol to `def set(self, key: str, value: JsonValue) -> None`. Add the row to
`§14.1` either way.

**Verify:** a cross-package test is not feasible in one process; assert the literal instead —
`assert PENDING_SUBMISSION_MARKER == {"pending": True}` in both suites, plus
`expect(PENDING_SUBMISSION_MARKER).toEqual({pending: true})`.

---

### F-READ-14 — `architecture.md` declares `Transformer`'s converters `static` and returning bare values; they are instance methods returning `Result`

- **Severity:** MEDIUM
- **Where:** `project-docs/architecture.md:813-821` (§5.9) and §4.9:428-436; `transformer.ts:97-150`; `transformer.py:73-113`
- **Verified by reading**

```ts
// architecture.md:817-821
class Transformer {
  static json2xml(json: unknown, opts?: { compact?: boolean }): string;
  static xml2json(xml: string, opts?: { compact?: boolean }): unknown;
}
```

```ts
// transformer.ts:98, 134 — instance methods, Result-returning, no `opts`
  json2xml(dataObject: object, round = false): Result<string, DgiiError> {
  xml2json<T>(xml: string): Result<T, DgiiError> {
```

Same for §5.9's `@staticmethod` block (`architecture.md:816-820`) against
`transformer.py:76,100`. Every call site in the tree constructs an instance
(`utils.ts:178-179`, `utils.py:141`) — so the docs' `Transformer.json2xml(x)` is uncallable as
written.

**What a maintainer will get wrong:** they copy the documented signature into a test or an example,
get `TS2576: Property 'json2xml' does not exist on type 'typeof Transformer'`, and then discover the
`Result` wrapper by debugging — but the more expensive mistake is trusting the documented return type
`string`. Code written against `json2xml(...)` returning a `string` will use the Result object as a
string and silently serialize `"[object Object]"` into a fiscal document. The `opts?: { compact?:
boolean }` parameter does not exist either, so a maintainer trying to disable compact mode has nowhere
to go — compact is hardcoded (`transformer.ts:112`, and structural in `transformer.py:158-176`).

**Concrete edit:** replace both blocks with the real signatures, and note that compact is not
optional:

```ts
// architecture.md §4.9
class Transformer {
  json2xml(dataObject: object, round?: boolean): Result<string, DgiiError>;
  xml2json<T>(xml: string): Result<T, DgiiError>;
}
// Instance methods, not static. Compact mode only (`xml-js` `compact: true`); there is no
// non-compact mode to opt into.
```

```python
# architecture.md §5.9
class Transformer:
    def json_to_xml(self, data: dict[str, object], *, round_monetary: bool = False) -> DgiiResult[str]: ...
    def xml_to_json(self, xml: str) -> DgiiResult[dict[str, object]]: ...
```

**Verify:** `bun -e 'import {Transformer} from "./src/transformer.ts"; console.log(typeof Transformer.json2xml)'`
→ `undefined` (the doc form does not exist).

---

### F-READ-15 — Two architecture sections disagree about who owns the idempotency key, and both are wrong about Python

- **Severity:** MEDIUM
- **Where:** `project-docs/architecture.md:366-368` (§4.6) vs `:1047` (§9.1); `client.ts:215`; `client.py:223`
- **Verified by reading**

§4.6: "The idempotency key is derived by the client (`ECF#buildIdempotencyKey`), not by
`HttpClient`". §9.1: "Implemented by `HttpClient.buildIdempotencyKey` / `build_idempotency_key`."
Reality: `private buildIdempotencyKey` on `ECF` (`client.ts:215`) and `_build_idempotency_key` on
`ECF` (`client.py:223`). `HttpClient` has no such method in either package — a reader who greps
`build_idempotency_key` in `http.py` finds nothing.

Also in §9.4 step 1 (`architecture.md:1086-1087`):

```text
rnc  = extractElementText(signedXml, 'RNCEmisor') ?? 'RncEmisor'
encf = extractElementText(signedXml, 'eNCF')      ?? 'SecuenciaeNCFDesde'
```

Read as written, `?? 'RncEmisor'` is a *literal string fallback*: every document without
`<RNCEmisor>` would key on the four characters `RncEmisor`, and `?? 'SecuenciaeNCFDesde'` likewise.
The code falls back to `extractElementText(signedXml, 'RncEmisor')` — a second **read**
(`client.ts:441-443`, `client.py:509-511`). The contract step is not merely imprecise; followed
literally it produces a key that collides across emitters.

**What a maintainer will get wrong:** the §9.4 form is the canonical written statement of the
reconcile algorithm — the section `§9.4:1077-1079` says froze the contract. Anyone implementing
reconcile in a third language from that pseudocode builds a colliding key. And the §4.6/§9.1
contradiction sends them to the wrong module to change it.

**Concrete edit:**

```markdown
<!-- architecture.md:1047 -->
Implemented **privately on the client** (`ECF#buildIdempotencyKey` /
`ECF._build_idempotency_key`), not on `HttpClient` — §4.6 is correct and this line was not.
```

```text
<!-- architecture.md:1086-1087 -->
rnc  = extractElementText(signedXml, 'RNCEmisor') ?? extractElementText(signedXml, 'RncEmisor')
encf = extractElementText(signedXml, 'eNCF')      ?? extractElementText(signedXml, 'SecuenciaeNCFDesde')
       -- no literal fallback: a missing RNC/eNCF is Err(VALIDATION), see below
```

**Verify:** `grep -rn "build_idempotency_key\|buildIdempotencyKey" packages/*/src` — five hits, all on
`ECF`/`client`.

---

### F-READ-16 — A non-object submission response is `Ok` in TypeScript and `Err` in Python; the register does not say so

- **Severity:** MEDIUM
- **Where:** `packages/typescript/src/client.ts:251-260`; `packages/python/src/py_dgii_ecf/client.py:241-262`
- **Verified by reading**

TypeScript's `submitIdempotent` stores and returns whatever the transport produced:

```ts
// client.ts:253-259
      const result = await send();
      if (result.isOk()) {
        await this.idempotency.set(key, result.value);   // stores anything
      } else {
        await this.idempotency.delete(key);
      }
      return result;                                      // Ok(<bare string>) reaches the caller
```

Python refuses it and keeps the marker:

```python
# client.py:250-259 — `_cache_submission`
        if not isinstance(data, dict):
            return Err(
                DgiiError(
                    "Unexpected DGII response payload; reconcile via a status "
                    "lookup before retrying",
                    code=DgiiErrorCode.VALIDATION,
```

So for a DGII body that is a bare string, HTML page or `null`, TS answers `Ok(<that>)` typed as
`InvoiceResponse` and Python answers `Err(VALIDATION)`. `§14.1`'s "Model echo (RES-1)" row covers
malformed *fields*; it does not cover a non-object *body*, and the Ok/Err difference is the one a
caller branches on.

Note also that Python's message here ("…; reconcile via a status lookup before retrying") is
**better than** TypeScript's behaviour, which is to hand the caller an object they cannot use — so this
is a place where the fix should move TypeScript, not Python.

**What a maintainer will get wrong:** they will write a TS submission wrapper with no shape check
(because `Ok` means success), port it, and find Python returns `Err` for a DGII 200 with an HTML body
— i.e. behind a WAF/captive portal, the two SDKs disagree about whether the document was accepted.
They will also believe the marker was cleared, because TS clears it on `Err` and Python keeps it
(`client.py:261` sets the raw dict, and `_cache_submission` deliberately does not delete).

**Concrete edit:** give TypeScript the same guard, using the message Python already owns
(`client.ts:85` `UNEXPECTED_PAYLOAD_MESSAGE` is defined for exactly this):

```ts
// client.ts:238-261 — inside submitIdempotent, after `send()` resolves
      const result = await send();
      if (result.isErr()) {
        await this.idempotency.delete(key);
        return result;
      }
      if (!isRecord(result.value)) {
        // The document was accepted (2xx) but we cannot cache or describe the answer.
        // Keep the marker: re-submitting risks a duplicate (Python: _cache_submission).
        return err(
          new DgiiError(
            'Unexpected DGII response payload; reconcile via a status lookup before retrying',
            { code: 'VALIDATION', data: result.value },
          ),
        );
      }
      await this.idempotency.set(key, result.value);
      return result;
```

and add the row to `§14.1`.

**Verify:** a mocked transport returning `"<html>blocked</html>"` with status 200 must be `Err`
with code `VALIDATION` in both suites.

---

### F-READ-17 — `__all__` is a hand-kept allowlist that has already drifted in both directions

- **Severity:** MEDIUM
- **Where:** `packages/python/src/py_dgii_ecf/__init__.py:95-174` vs `packages/typescript/src/index.ts:1-14`
- **Verified by running** (`hasattr(py_dgii_ecf, name)`):

```
SUMMARY_ACCEPTED            → False   (TS: exported, types.ts:92)
UNAVAILABLE_SCHEMAS         → False   (TS: exported, validation.ts:43)
SCHEMA_DIR                  → False   (TS: exported, validation.ts:21)
check_b2b_applicability     → False   (TS: exported via reception.ts:166)   ← F-READ-03
is_ok / is_err              → False   (defined, result.py:19)
```

and in the other direction Python exports names TypeScript never will (`ResponseShapeError`,
`TrackStatus`, `DEFAULT_IDEMPOTENCY_TTL_S` is not exported while TS's `DEFAULT_IDEMPOTENCY_TTL_MS` is
private — an accidental symmetry). `roundHalfUpToCents` is **public** in TypeScript
(`transformer.ts:34`, reachable through `export *`) and private in Python (`_round_monetary`,
`transformer.py:32`), so a caller who must pre-round a money value before building a document can do
it in one SDK only.

Because `index.ts` is `export *`, TypeScript cannot drift. Python can, and `__all__` gives no hint
that it is supposed to mirror anything — no comment, no test.

**What a maintainer will get wrong:** they will add to `reception.py` / `validation.py` / `types.py`,
and the function will be silently unreachable from `py_dgii_ecf`. The TS reader who cross-checks will
believe the Python surface is complete because `§5.13:933-938` says "Re-exports the full public surface
(mirror of TS `index.ts`)".

**Concrete edit:** the surface test from D-4, plus a header on the allowlist:

```python
# __init__.py:95
# Public surface. Mirrors `packages/typescript/src/index.ts`, which cannot drift because
# it is `export *`. This list CAN drift, so `tests/test_public_surface.py` asserts every
# name documented in `architecture.md §5.13` is importable from here.
__all__ = [
```

and either export `roundHalfUpToCents` in Python (`round_half_up_to_cents`, un-privatised) or
un-export it in TypeScript — a money helper should not be public in one package and private in the
other.

**Verify:** the test in D-4; `uv run python -c "import py_dgii_ecf as m; print(sorted(set(m.__all__) - set(dir(m))))"`
must print `[]` (it does today — the allowlist is internally consistent, which is why the drift is
invisible).

---

### F-READ-18 — `types.py`'s docstring claims 1:1 mirroring that six documented differences contradict

- **Severity:** MEDIUM
- **Where:** `packages/python/src/py_dgii_ecf/types.py:4-5`
- **Verified by reading**

```python
# types.py:3-8
# callers get autocomplete and type checking. The shapes mirror the TypeScript
# SDK 1:1, and so does the classification of a wire body: the fields that decide
```

Six differences, all deliberate and all documented elsewhere in `architecture.md §5.2`:

| Field                                  | `types.ts`                          | `types.py`                    |
| -------------------------------------- | ----------------------------------- | ----------------------------- |
| `InvoiceSummaryResponse.encf`          | `string` required (`:101`)          | `str \| None = None` (`:421`) |
| `InvoiceSummaryResponse.secuenciaUtilizada` | `boolean` required (`:102`)   | `bool \| None = None` (`:422`) |
| `CommercialApprovalResponse.codigo`    | `'1' \| '2'` (`:124`)               | `str` (`:494`)                |
| `CommercialApprovalResponse.estado`    | two-literal union (`:125`)          | `str` (`:495`)                |
| `ServiceDirectoryResponse.urlAceptacion` | `string` required (`:109`)        | `str = ""` (`:445`)           |
| `Mensaje.codigo`                       | `number \| string`, required (`:7`) | `int \| str = 0` (`:44`)      |

Each is defensible (§5.2 explains the tolerance policy). The sentence "mirror … 1:1" is what is
wrong: it is the first thing a reader sees, and it tells them they do not need the table 540 lines
below. `architecture.md §5.2` then lists a *different* set of differences than the code has — e.g. it
says `TrackingStatusResponse.estado ⇒ ""` is "tolerated", which matches `types.py:286-287`, but it
never mentions `CommercialApprovalResponse.codigo` being widened from a two-literal union to `str`.

**What a maintainer will get wrong:** they will port a consumer written against `types.ts` — e.g.
`switch (r.codigo) { case '1': … }` with exhaustiveness — and in Python get a `str` that mypy will not
narrow, or `r.encf.toUpperCase()` on `None`.

**Concrete edit:**

```python
# types.py:1-12
"""Typed response models, enums and parsers for the DGII e-CF API.

Every client method returns one of these models instead of a plain ``dict``, so
callers get autocomplete and type checking.

**Not a 1:1 mirror of ``types.ts``.** TypeScript declares types and trusts the
payload; Python parses into models, so optionality and widening differ where DGII's
wire format is loose — see ``architecture.md §5.2`` for the table. The classifiers
(``estado`` on the status reads, ``trackId`` on a listing entry,
``secuenciaUtilizada``) are read exactly as DGII typed them; a field that only
corroborates is tolerated or dropped. When a *classifying* field is missing or
malformed this module raises :class:`ResponseShapeError`.

The ``enum``/``Literal``-shaped unions in ``types.ts`` (``CommercialApprovalResponse.codigo``,
``.estado``, ``ServiceAvailability``) are plain ``str`` here, because mypy cannot
narrow a value that arrives at runtime.
"""
```

**Verify:** the table above; after the edit, `grep -n "1:1" packages/python/src` must return nothing.

---

### F-READ-19 — Python's `DgiiError` has no structured form, so `code` is unreachable from any log line

- **Severity:** MEDIUM
- **Where:** `packages/python/src/py_dgii_ecf/errors.py:157-195` vs `packages/typescript/src/errors.ts:197-246`
- **Verified by running:** `str(DgiiError("boom", code=VALIDATION, status=422, resource="…"))` → `'boom'`;
  `hasattr(e, "to_json")` → `False`; `dataclasses.is_dataclass(e)` → `False`.

```ts
// errors.ts:233-245 — TS has a structured projection
  toJSON(): Record<string, unknown> {
    return { name, message, code, status, statusText, resource, method, mensajes, data };
  }
```

```python
# errors.py:194-195 — Python has only this
    def __str__(self) -> str:
        return self.message
```

`logging.error("send failed: %s", err)` therefore emits `"send failed: boom"` in Python and
`"send failed: {…code:'HTTP',status:502,…}"` in TypeScript (via `JSON.stringify(err)`). The CLI makes
this concrete: `cli.py:47,64,71,92,111,115` all do `typer.echo(f"error: {result.unwrap_err()}")`, so
every CLI failure prints the message with **no code, no status, and no DGII `mensajes`** — and
`code` is the field `architecture.md §7:985-987` says exists "for callers that classify their own
failures".

**What a maintainer will get wrong:** they will instrument the submission path for `AUTH` vs `HTTP`
and find the Python logs cannot answer the question, then either add ad-hoc `err.code` formatting at
every call site (the drift this field exists to prevent) or, worse, parse the message text — which
`AGENTS.md:68-69` and `§14.1 F-126-7` explicitly say is not stable across packages.

**Concrete edit:**

```python
# errors.py:194-196 — after __str__
    def to_dict(self) -> dict[str, object]:
        """Structured projection for logs and JSON output.

        Mirrors TypeScript's ``DgiiError.toJSON`` so a log line carries the same
        fields in both packages, and so ``code`` — the only stable discriminator —
        is never lost to ``str(err)``.
        """
        return {
            "name": type(self).__name__,
            "message": self.message,
            "code": str(self.code),
            "status": self.status,
            "status_text": self.status_text,
            "resource": self.resource,
            "method": self.method,
            "mensajes": [dataclasses.asdict(m) for m in (self.mensajes or ())],
            "data": self.data,
        }
```

and make the CLI use it: `typer.echo(f"error [{err.code}]: {err}", err=True)`.

**Verify:** `uv run python -c "from py_dgii_ecf import DgiiError, DgiiErrorCode; print(DgiiError('x', code=DgiiErrorCode.AUTH, status=401).to_dict())"`.

---

### F-READ-20 — `_as_str` silently coerces a number into text, so a Python model can carry a value TypeScript never sees

- **Severity:** NIT
- **Where:** `packages/python/src/py_dgii_ecf/types.py:76-83`
- **Verified by reading**

```python
def _as_str(value: object, key: str) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, bool):
        raise _type_error(key, "a string", value)
    if isinstance(value, (int, float)):
        return str(value)      # 1234.50 becomes "1234.5" — a float, formatted
    raise _type_error(key, "a string", value)
```

`_as_str` is used for `rnc`, `encf`, `fechaRecepcion`, `rncEmisor`, `ncfElectronico`,
`codigoSeguridad` (`types.py:291-298, 363-388`). The `float` branch means a JSON number arriving in a
fiscal identifier becomes its shortest repr — `1234.50` → `"1234.5"`, and for a large integer id,
`1e21`-style reprs appear past 2^53. `_as_str_strict` (`types.py:90-99`) exists for exactly this
reason, and its docstring says so ("a coerced number would put the payload in a branch the TypeScript
SDK never takes") — but the identifier fields use the coercing reader.

**What a maintainer will get wrong:** they will assume `_as_str` and `_as_str_strict` differ only in
strictness, not in *output*: `_as_str` can return a string that no string ever appeared on the wire.
`codigoSeguridad` is compared and emitted into a QR URL (`utils.py:41`), so a coerced value propagates
into a fiscal artefact.

**Concrete edit:** drop the numeric branch from `_as_str` and keep coercion only where a numeric field
is genuinely numeric and already handled (`_as_int`, `_as_float`):

```python
def _as_str(value: object, key: str) -> str:
    """Read a string, tolerating DGII's habit of encoding numbers as JSON numbers.

    Only for identifiers DGII itself types inconsistently. Never use it for a value
    that classifies a payload — see ``_as_str_strict``.
    """
```

and add one line to `architecture.md §5.2`'s tolerance table naming which reader each field uses. If
coercion is load-bearing against real DGII traffic, keep it and *say so* in the docstring instead of
leaving the two readers looking interchangeable.

**Verify:** `uv run python -c "from py_dgii_ecf.types import InquiryStatusResponse as R; print(repr(R.from_dict({'codigo':1,'estado':'x','codigoSeguridad':1234.50}).codigo_seguridad))"`
→ `'1234.5'`.

---

### F-READ-21 — Unregistered: the fallback error message differs in whitespace between packages

- **Severity:** NIT
- **Where:** `packages/typescript/src/errors.ts:184-188`; `packages/python/src/py_dgii_ecf/errors.py:134-139`
- **Verified by running:** the same payload `{mensajes: [{codigo: 1}]}` produces

```
ts: "{\"mensajes\":[{\"codigo\":1}]}"
py: '{"mensajes": [{"codigo": 1}]}'
```

`JSON.stringify` writes no spaces; `json.dumps` defaults to `", "` / `": "`. `architecture.md §7:978-983`
claims every Appendix A.8 shape "collapse[s] to a single `message`", and `§4.11:578-594` and `§14.1:1398` scope the
identical-message requirement to "the non-object and absent-body cases" — neither mentions that an
object the SDK *did* read but could not classify serializes differently.

**What a maintainer will get wrong:** a test or an alert that asserts on the exact `message` for an
unrecognised DGII payload passes in one package and fails in the other. In this repo's culture
(`AGENTS.md` is emphatic that message text is a contract) that is a day lost to re-reading §14.

**Concrete edit:** one of —

```python
# errors.py:135
        # Compact separators to match JSON.stringify (packages/typescript/src/errors.ts:185):
        # the fallback message is part of the parity contract.
        serialized = json.dumps(data, separators=(",", ":"))
```

or add the row to `§14.1`. Prefer the former: message text is already load-bearing.

**Verify:** the two snippets above, diffed byte-for-byte.

---

### Rejected as taste (recorded so they are not re-raised)

- `_as_optional_or_none`'s name and the nine-reader family are verbose — but every one has a docstring
  stating the rule, and the verbosity is the tolerance policy. Not flagged.
- `HttpClient` method names differing (`get`/`request`/`postMultipart` vs `get`/`request`/
  `post_multipart`) — consistent camelCase↔snake_case. Not flagged.
- `client.ts` at 879 lines — it is one class with 18 public methods, each 5-25 lines, and the
  reconcile method carries the best comment in the repo (`client.ts:421-437`). Long, not god-like.
  Not flagged.
- `compareDecimal` differing on `"1.2.3"` (TS takes `aFrac = '2'`, Python `a_frac = '2.3'`) — reachable
  only if a caller bypasses the `DECIMAL_PATTERN` guard, and both call sites guard
  (`reception.ts:135,211`; `reception.py:111,172`). Not flagged; noted here in case the helper is ever
  exported for a new caller.
- `ReconciliationResult`'s Python docstring uses C1–C6 labels (`reconciliation.py:32-36`) that appear
  nowhere else — self-contained, and it duplicates `§9.4`'s table usefully. Not flagged.

## Onboarding walkthrough

A new maintainer's first hour, following `AGENTS.md` and the contract, reproduced against the real
tree. Every step below was executed.

1. **"Everything is pinned by `mise.toml`" (`AGENTS.md:16`).** True. `mise install && mise run
   bootstrap` resolves: `bootstrap` depends on `bootstrap-tools`, `bootstrap-typescript`,
   `bootstrap-python`, `hooks-install` (`mise.toml:15-17`), all defined. No mismatch found between the
   six commands `AGENTS.md:20-25` promises and `mise.toml`; the `mise run` set referenced across all
   `.md` files is a subset of the defined task set (checked mechanically).
2. **"There is no root `package.json`, so root-level prettier runs the TypeScript package's binary"
   (`AGENTS.md:16-17`).** True — `ls package.json` fails; `mise.toml:65` uses
   `packages/typescript/node_modules/.bin/prettier`. Consistent.
3. **"The XMLDSig gate runs separately and is the only check that catches canonicalization
   regressions" (`AGENTS.md:27-30`).** True, and both gates exist: `mise.toml:86` for TypeScript,
   `packages/python/scripts/verify_signing.py` for Python, wired into the two CI workflows
   (`.github/workflows/typescript.yml:60`, `python.yml:52`). Good — this is the repo at its best.
4. **Focused runs (`AGENTS.md:35-38`).** `packages/typescript/test/signing.test.ts` and
   `packages/python/tests/test_signing.py` both exist; `-k digest` will match, since `test_signing.py`
   has digest tests. Fine.
5. **First real task: "add a field to a response model."** The maintainer opens `types.ts` (166 lines),
   adds `montoDescuento: string`, then opens `types.py` (588 lines) — and must discover on their own
   that the field also needs a line in the relevant `from_dict`, and must choose among nine readers
   whose names differ by one word. **This is where the hour is lost** (D-1). Nothing in either file
   warns them. Estimated cost without the docstring banner: 20-40 minutes, plus a silent `None` if they
   guess wrong.
6. **Second task: "expose a helper that reception.py already has."** They add it, and the Python
   top-level import fails, because `__all__` is a hand-kept allowlist (`F-READ-17`) whose drift is
   invisible from the file. Meanwhile `index.ts` is `export *`, so the TypeScript half of the task is
   one line. Estimated cost: 15 minutes, plus a decision they should not have to make (export it, and
   silently diverge from `§5.13:933-938`'s list, or leave it unexported, and silently diverge from reality).
7. **Third task: "warn when a certificate is near expiry."** `validateXMLCertificate` returns
   `validTo`, which parses as ISO-8601 in Python and as `"Jan  1 00:00:00 2035 GMT"` in TypeScript.
   The maintainer writes one parser, ships it, and the other package breaks (`F-READ-11`). Estimated
   cost: half a day, mostly spent concluding that the divergence is real.
8. **Fourth task: "tune retries."** Three places state the attempt count and two of them disagree
   (`resilience.ts:17`, `architecture.md §4.5`, `architecture.md §14.1`). The maintainer picks the one
   nearest the code — the wrong one (`F-READ-01`). Estimated cost: one production incident's worth of
   confusion during a DGII outage, because the retry count is what makes an outage look like a hang.

**Where the errors are actionable, and where they are dead ends.** This matters because it is the
difference between a maintainer who fixes the right thing and one who guesses.

| Failure path                       | TypeScript                                                                                                  | Python                                                                                     | Verdict |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------- |
| E32 below RD$250,000               | `"An E32 below RD$250,000 must be sent as an RFCE summary; convert it with convertECF32ToRFCE first"` (`reception.ts:143-145`) | `"An E32 below RD$250,000 must be sent as an RFCE summary; convert it with convert_ecf32_to_rfce first"` (`reception.py:117-118`) | **Both excellent.** Names the constraint, the threshold, and the exact remedy, in the package's own spelling. This is the standard every other message should meet. |
| E32 below RD$250,000 to a buyer host | `"…cannot be delivered directly to a buyer host; send the RFCE summary to DGII instead"` (`reception.ts:219`) | same (`reception.py:177-178`)                                                              | **Both excellent.**                                                 |
| Unknown document root              | `Unsupported document root "ARECF"; expected "ECF" or "RFCE"` (`reception.ts:111`)                          | same (`reception.py:91-92`)                                                                | Good — echoes the input.                                            |
| Missing `TipoeCF`                  | `"TipoeCF is missing from the document"` (`reception.ts:118`)                                                | same (`reception.py:98`)                                                                   | Good; no remedy, but the remedy is obvious.                         |
| Pending idempotency marker         | `"A submission with this key is already pending; call reconcileSubmission() before retrying"` (`reconciliation.ts:8-9`) | `"…call reconcile_submission() before retrying"` (`reconciliation.py:14-17`)               | **Both excellent** — and the one place the naming difference is *correct*, since each names its own method. |
| `xmllint` missing                  | `xmllint was not found ("xmllint"). Install libxml2-utils or set DGII_XMLLINT_BIN; schema validation cannot run without it` (`validation.ts:150`) | n/a                                                                                        | **Best message in the repo.** Names the missing thing, two remedies, and the consequence. |
| Schema unavailable                 | `Schema unavailable for ECF 31: the published schema references IndicadorServicioTodoIncluidoType, which does not resolve` (`validation.ts:130-135`) | same reason text (`validation.py:39-52`)                                                   | **Both excellent.**                                                 |
| Production-only endpoint           | `"getSummaryInvoiceInquiry is only available in the production environment (eCF); current environment is eCF"` (`client.ts:780-783`) | same (`client.py:140-144`)                                                                 | Good, but note the `Environment`/`eCF` doubling when already in prod is unreachable so harmless. |
| **Unclassifiable query payload**   | `"Unexpected DGII response payload"` + `resource` (`client.ts:96-102`)                                       | `"Unexpected DGII response payload"`, **no `resource`** (`client.py:86-93`)                 | **TypeScript actionable, Python a dead end.** The caller cannot tell which of three reads failed (`F-READ-07`). |
| **Python submission error, any kind** | `DgiiError` with `resource`/`method`/`baseURL`/`status`/`code` (all set, `http.ts:228-236`)                 | message + `code` + `status`; `resource`/`method`/`base_url` always `None` (`http.py:172-181`) | **TypeScript actionable, Python partial.** For a multipart POST that failed, the Python caller cannot say which endpoint. |
| **Python CLI, any error**          | n/a                                                                                                          | `error: {message}` only — `cli.py:47,64,71,92,111,115`                                      | **Dead end.** No code, no status, no `mensajes` (`F-READ-19`). |
| **Python `Signature` construction** | constructor cannot fail (`signing.ts:71-74`)                                                                | raises `ValueError`/`OSError` out of a Result-shaped API (`signing.py:62-88`)                 | **Exception where a Result was promised** (`F-READ-08`). |
| **Python `convert_ecf32_to_rfce` key** | typed object, wrong key is a compile error                                                               | `dict[str,str]`, wrong key is `KeyError` at runtime (`F-READ-06`)                            | **Dead end.** |

Pattern: the messages *inside the domain* are consistently excellent — they name the constraint, the
value, and the remedy. The messages at the **boundaries** (transport, CLI, construction) are where the
Python package loses the information. That is one systemic fix, not fourteen local ones: thread
`resource`/`method` through `_parse`, add `DgiiError.to_dict`, and make `Signature` total. Three edits
remove nine of the eleven "dead end" rows.

## Coverage

**Read in full** (every line): `types.ts`, `errors.ts`, `client.ts`, `http.ts`, `resilience.ts`,
`reception.ts`, `reconciliation.ts`, `signing.ts`, `certificate.ts`, `environment.ts`, `validation.ts`,
`xml.ts`, `result.ts`, `transformer.ts`, `utils.ts` (all 16 TypeScript files); `__init__.py`,
`types.py`, `errors.py`, `client.py`, `http.py`, `resilience.py`, `reception.py`, `reconciliation.py`,
`signing.py`, `certificate.py`, `environment.py`, `validation.py`, `_xml.py`, `_json.py`, `result.py`,
`transformer.py`, `utils.py`, `cli.py` (all 18 Python files); `AGENTS.md`, `CONTRIBUTING.md`,
`project-docs/architecture.md` (all 1 410 lines), `project-specs/dgii-ecf-setup.md` §4.3–§5.3,
`mise.toml`, `packages/typescript/package.json`, `packages/python/pyproject.toml`,
`.github/workflows/{typescript,python}.yml` (signing steps only).

**Verified by running** (10 checks, all against the working tree, nothing written to it):

1. `createResiliencePolicies({maxRetries:3})` attempts `4`; `{maxRetries:1}` attempts `2` → `F-READ-01`.
2. `sign_xml(xml,"SemillaModel")` ≡ `sign_xml(xml,"TotallyWrongElement")` byte-for-byte; `root_name`
   absent from the method body → `F-READ-02`.
3. `hasattr(py_dgii_ecf,"check_b2b_applicability")` → `False`; `SUMMARY_ACCEPTED`,
   `UNAVAILABLE_SCHEMAS`, `SCHEMA_DIR`, `is_ok`, `InquiryStatus`, `TrackStatusEnum` → all `False`;
   `TrackStatus`, `Signature.from_p12`, `Signature.try_from_p12` → `True` → `F-READ-03`, `F-READ-17`,
   `F-READ-18`.
4. `InquiryStatusResponse.from_dict({... "montoTotal":"1234.565"})` → `float 1234.565` → `F-READ-04`.
5. `generateFcQRCodeURL(…,1234.50,…)` → `montototal=1234.5`; `1234.00` → `1234`; e-CF helper with
   `"1234.50"` → `montototal=1234.50` → `F-READ-05`.
6. `HttpClient(timeout_s=3.0).timeout_s` → `15.0`; with `resilience=ResilienceOptions(timeout_s=99.0)`
   → `99.0`; `ECF(timeout_s=1.0)._http.timeout_s` → `15.0` → `F-READ-09`.
7. `validateXMLCertificate` vs `validate_xml_certificate` on `examples/fixtures/test.xml` → four
   incompatible strings → `F-READ-11`.
8. `validateXMLCertificate`/`extract_dgii_error_message` on the same payload → different message
   serialization → `F-READ-21`.
9. `str(DgiiError(...))` → message only; no `to_dict`/`to_json`; not a dataclass → `F-READ-19`.
10. `convert_ecf32_to_rfce` on the unsigned fixture → `Err(SIGNING)`, confirming the return statement
    at `utils.py:244` is the only evidence available for the key (`F-READ-06`, marked *by reading*).

**Checked mechanically, no discrepancy:** every `mise run …` in every `.md` is a defined task
(8 tasks referenced, all present); every `bun run …` in `CONTRIBUTING.md` is a `package.json` script
(4 of 4); `mise.toml` task graph has no dangling `depends`; `Endpoint`/`SenderReceiverEndpoint`/
`StatusEndpoint` values are byte-identical across packages (12+4+3 values compared); all ten
`DgiiErrorCode` values identical.

**Not covered / deliberately out of scope:** the signing byte-fidelity itself (that is the XMLDSig
gate's job, and the `p1`/`p2` boards'); `_sign_element`'s C14N correctness; the Python transformer's
`xml-js` compact fidelity against real documents (the `examples` fixtures are unsigned, and building a
signed ECF-32 to exercise `convert_ecf32_to_rfce` end to end needs a generated certificate, which I did
not do because the finding does not depend on it); the `examples/` directories; the `docs/` mirror; and
whether `httpx2` behaves as the `F-126-1` analysis claims.

## Needs follow-up

1. **Decide `F-READ-04` first, before anything else.** Both packages are wrong in the same direction,
   so the fix touches models on both sides and may change a public field type. If `number`/`float` is
   the intended answer, then `AGENTS.md:50-52` and `architecture.md §2.3, §4.2, §5.2` must be rewritten
   in the same commit and the "rounding drift corrupts the signed digest" rationale needs an answer,
   because nothing in the tree rebuts it. If `string`/`Decimal` is the answer, that is a `0.8.0`
   breaking change in Python. **This blocks a coherent answer to `F-READ-05`.**
2. **`F-READ-02` needs an owner on the signing side.** Removing the inert parameter is a Python public
   API break; honouring it changes digest bytes for non-root references and therefore needs the
   libxmlsec1 gate plus a new C14N-sensitive fixture. Do not "fix" it without
   `mise run verify-signing-typescript` and `uv run --with xmlsec python scripts/verify_signing.py`.
3. **`F-READ-16` is the one I would fix today.** TypeScript returning `Ok(<non-object>)` on the
   submission path is the only finding here that can produce a *wrong answer about a fiscal document*,
   and the fix is ten lines in `client.ts:238-261` reusing a message that already exists.
4. **The register is the systemic issue (`F-READ-07`).** Once `F-READ-04` is decided, the other twelve
   divergences should land as `§14.1` rows in one commit, not as twelve doc patches. The
   `D-4` surface test is the cheap half and can ship independently.
5. **`F-READ-18` needs product input:** widening `CommercialApprovalResponse.codigo`/`.estado` from
   literal unions to `str` is not obviously intentional, and if it *is* intentional it is the one model
   difference a caller is most likely to trip over (a `switch` on `codigo`).
6. **Cross-package message-format parity needs a single source.** `F-READ-11` (certificate formats) and
   `F-READ-21` (fallback serialization) are two instances of the same gap: the `message`/value *text* of
   a shared field is only pinned by prose. A shared fixture list of expected strings, asserted in both
   suites, would retire the class.

## Outcome
Outcome: done — report written; 21 findings (7 HIGH, 10 MEDIUM, 4 NIT/recorded), all cited by `file:line` and marked verified-by-running (10 runtime checks) or verified-by-reading.
Details: The headline is that five blockers are each a documented promise the code does not keep (`sign_xml`'s inert `root_name`, `maxRetries` 4-vs-3, `check_b2b_applicability` unexported, money as float, `security_code` vs `securityCode`), so a maintainer who reads the docs learns the wrong thing. No `mise.toml` or `package.json` command mismatch exists; the parity table, the vocabulary table and the "actionable errors" comparison are the reusable parts.
report: /home/deuriib/projects/dgii-ecf/project-tasks/review-board/reports/p8-readability.md — readability review: verdict, 18-row parity map with 4 named drifts, public-surface vocabulary, doc-vs-code drift table, 21 findings, onboarding walkthrough, coverage
