# DGII Expert Consult — buyerHost credential and money representation

Rules from DGII's side on (1) which credential authenticates a B2B delivery, (2) what the SDK must do,
(3) whether money-as-float touches signed bytes. No DGII traffic sent; evidence is code +
`project-docs/dgii-ground-truth.md` + the vendored XSDs.
## Ruling in three lines

1. A POST to `{buyerHost}/fe/recepcion/api/ecf` is authenticated by the **receiver's own** token,
   minted at the receiver's `fe/autenticacion/api/validacioncertificado`. The trust is carried by the
   XMLDSig over the e-CF; DGII's platform token never belongs in that request.
2. The SDK stores **one** token for **all** destinations (`client.ts:423`, `client.py:379`), so it can
   send DGII's bearer token to a caller-supplied host and a buyer's token to DGII. **HIGH.**
3. Money-as-float never reaches the signed bytes — response models and the FC QR URL only.
   **Keep MEDIUM**: presentation/data-fidelity defect, not a digest defect.

## Q1 — buyerHost

### Q1.1 Which credential? The receiver's own. Not DGII's.

- `dgii-ground-truth.md:248-250`: *"B2B flow: **optional auth against `urlOpcional`** (semilla →
  validacioncertificado → bearer token), then POST the e-CF to `urlRecepcion/fe/recepcion/api/ecf`…"*
- `dgii-ground-truth.md:232-240`: `urlOpcional` / `urlRecepcion` / `urlAceptacion` come from the
  **directory response for the buyer** — the buyer's servers, not DGII's.
- `dgii-ground-truth.md:55-58`: the four paths are listed under *"B2B (Sender↔Receiver) paths on the
  buyer's `urlOpcional` / `urlRecepcion` / `urlAceptacion`"*.

Two credential universes, two issuers, not interchangeable: **DGII's token** is issued by DGII's
`semilla` + `validacioncertificado` on the DGII base URL and accepted only by `ecf.dgii.gov.do`; the
**receiver's token** is issued by that receiver's own auth service and accepted only by that receiver.
The seed is still signed with the **sender's** certificate (`client.ts:407-413`, `client.py:368-370`),
so what the receiver verifies is *the sender's certificate*, per receiver — a transport gate, not a
DGII credential. Both SDKs already build the buyer seed/validate URLs from `buyerHost` correctly
(`client.ts:584-610`, `client.py:353-374`); the defect is only where the result is **stored**.

### Q1.2 Confirmed defect

`authenticate(buyerHost?)` ends with `this.http.setToken(token.value.token)` (`client.ts:423`) /
`self._http.set_token(issued.token)` (`client.py:379`) — the **same** `HttpClient` that all DGII calls
use (`client.ts:199,230`; `http.py:135-137`). One token slot, one `tokenExpiresAt` /
`_token_expires_at`. `sendElectronicDocument` posts to `buyerHost` through that same client
(`client.ts:655-663`) with no per-request credential. Therefore:

1. `authenticate()` then `sendElectronicDocument(xml, file, buyerHost)` → **DGII's bearer token is
   sent to a third party's host**, in `Authorization`, at a URL the caller supplied.
2. `authenticate(buyerHost)` then any DGII call → DGII receives a token it never issued → 401, which
   also triggers `ensureToken` re-authentication: the client thrashes between universes.
3. Two buyers in one instance: buyer B's token goes to buyer A; the last buyer's `expira` even
   overwrites the DGII refresh schedule.
4. `buyerHost` is caller-supplied, normalised only for trailing slash and case (`client.ts:180-183`),
   so the leak is reachable from ordinary user input.

This is not hardening — it is a **domain modelling error**: two non-interchangeable credentials from
two issuers collapsed into one field. The signature already carries the trust; the token gates one hop
for exactly one receiver.

### Q1.3 Ranking — DGII-correct, not merely defensive

1. **(b) Never send the DGII token to a caller-supplied host — per-destination token/client.**
   DGII-correct because the token is *issued by the receiver* and is meaningless anywhere else; one
   slot cannot represent that. Key by destination origin — `destinationScope` (`client.ts:180-183`)
   already exists for the idempotency key and is the right key shape.
2. **(a) Require `https:`** — necessary but insufficient as *the* answer: an https host is still an
   arbitrary third party. A **precondition** of (b), not a substitute.
3. **(d) Other, worth doing: derive the host from DGII's directory**, not from the caller
   (`urlRecepcion` for the buyer's RNC, `dgii-ground-truth.md:232-240`) — the only DGII-sanctioned
   source of a receiver address.
4. **(c) Host allowlist — reject.** Not DGII-correct: the authoritative list is the directory, it is
   dynamic, receivers onboard without asking us, and no DGII document requires it. Breaks onboarding,
   fixes nothing (b) does not. Opt-in only.

Non-negotiable alongside (b): **never follow redirects on the buyer hop** (already true —
`redirect: 'manual'`; `httpx2` defaults to no redirects), or the token and signed document are replayed
elsewhere.

## Q2 — money

### Q2.1 Does a float reach the bytes DGII validates and digests? No.

- `packages/typescript/schemas/e-cf-32.xsd:140,162` — `TotalITBIS` and `MontoTotal` are
  `Decimal18D1or2ValidationTypeMayorIgualCero`, an `xs:decimal` restriction (`fractionDigits 2` +
  digit pattern). The wire form is a decimal *lexical* string; DGII validates the pattern, then digests
  the canonicalized bytes. A float anywhere before that point is what corrupts a digest — it does not
  happen:
- `transformer.ts` forward-transforms the caller's JSON **strings**; `utils.ts:232` copies
  `MontoTotal` **out of the source XML** in `convertECF32ToRFCE`; `generateEcfQRCodeURL` already takes
  `montototal: string` (`utils.ts:42`). All three are string-based and correct.

The float survives in exactly two places:

1. **Response models** — `montoTotal?: number` (`types.ts:59-60`), `monto_total: float | None`
   (`types.py:361`). DGII's *answer*, already accepted; we signed the string.
2. **`generateFcQRCodeURL(montototal: number)`** (`utils.ts:27`) → `String(montototal)`
   (`utils.ts:34`) into the query string. Two bugs: `String(1e21) === "1e+21"`, and `0.1 + 0.2` class
   drift — a **wrong amount printed in the consumer's QR**. For FC the buyer reads that total when
   scanning: a fiscal discrepancy between the printed representation and the signed document, despite
   a valid signature.

### Q2.2 Grade: MEDIUM — kept

- Not HIGH: the failure mode is not a broken digest or a rejected document. No float reaches
  `MontoTotal`/`TotalITBIS` in the signed XML; the signature stays valid.
- Not LOW: a caller comparing DGII's float `montoTotal` against their own `Decimal` gets spurious
  reconciliation mismatches, and the FC QR can print a total that is not the signed total — both
  audit-visible fiscal numbers.
- HIGH the day a float enters the forward transform, a totals recomputation, or `convertECF32ToRFCE`.
  Guard with a test asserting the copied `MontoTotal` is byte-identical.

### Q2.3 Breaking or additive?

- **`generateFcQRCodeURL`**: additive now — accept `string | number`, deprecate `number`, reject
  non-finite, emit through decimal formatting instead of `String()`. Mirrors `utils.ts:42`.
- **Response models**: no wire change, no send-path change → *behaviourally* additive, but it **narrows
  a public type** (`number` → `string`; `float` → `Decimal`, the package's money convention). A **typed
  breaking change** → next major, both packages, never a silent minor.

### Q2.4 Verdict on both grades

- **Money: keep MEDIUM (F-DGII-06)**, scoped in the finding as *response models + FC QR URL only; no
  exposure on the signed/digested path*. Unqualified "money is float" reads HIGH and would be wrong.
- **Token/destination: HIGH — new finding.** Two harms, one root cause: a bearer credential handed to
  an arbitrary caller-supplied host, plus cross-contaminated auth across two issuers' token universes.
  Not CRITICAL only because the token is short-lived and environment-scoped (lifetime **unsourced**) and
  the leak needs a `buyerHost` argument; the code path itself is ordinary usage, not misuse.

## What the evidence does not settle

- Ground truth calls the receiver auth **"optional"** (`dgii-ground-truth.md:248`) but does not say
  whether a receiver that omits `urlOpcional` accepts an unauthenticated POST, nor whether a receiver
  enforcing auth also accepts a DGII platform token. **Unsourced.** Settle it with DGII's B2B
  interoperability section of the e-CF technical spec, DGII's certification team, or one receiver's
  sandbox. The SDK must not assume either way.
- Buyer-issued token lifetime/scope, and whether `urlOpcional` tokens are per-receiver. **Unsourced.**
- Whether directory `urlRecepcion` is guaranteed `https:`. **Unsourced** — hence https-only is a
  precondition for (b), not a substitute.

## What I would tell the maintainer to do

Both packages, one commit (AGENTS.md: behaviour lands in both):

1. **Split credentials per destination (fixes HIGH).** Replace the single slot with a map keyed by
   destination origin (`destinationScope`, `client.ts:180-183`). `authenticate()` writes the DGII
   entry; `authenticate(buyerHost)` writes that origin's. Refresh state per entry too.
2. **Never attach a token not minted for that origin.** In `postMultipart`/`post`, an absolute-URL
   origin with no token of its own gets **no** `Authorization` header (receiver auth is optional), never
   DGII's. Fail closed; no fallback.
3. **Reject non-`https:` buyer origins** before authenticating or transmitting, checked once at
   normalisation (`client.ts:180-183` + Python equivalent). Keep `redirect: 'manual'` and test it on the
   buyer hop specifically.
4. **Tests that prove it** (`test/`, `tests/`): DGII token then `sendElectronicDocument(..., host)` →
   `Authorization` absent; `authenticate(host)` then a DGII call → DGII token used; two buyers → tokens
   isolated; `http://host` → refused, no request made.
5. **Additive money fix now:** `generateFcQRCodeURL` accepts `string | number`, formats via decimal
   string, rejects non-finite; add the byte-identity test for `MontoTotal` through `convertECF32ToRFCE`
   (`utils.ts:232`).
6. **Typed breaking money fix next major, both packages:** `montoTotal: string`,
   `monto_total: Decimal | None`. Do **not** bundle it with the credential fix — that one is urgent.
7. **Keep the MEDIUM/HIGH split in the finding text** so triage neither inflates money nor defers the
   credential item.
