# DGII Expert Ruling — buyerHost credential and money representation

Rafael (DGII e-CF domain owner). No traffic to DGII hosts. Evidence is repo + `project-docs/dgii-ground-truth.md`;
unsourceable claims are marked **UNSOURCED** — I invent no DGII rule.

## Ruling in three lines

1. **Q1 — HIGH stands, and it is worse than "token egress": the token is also *wrong*.** The credential that
   authorizes `{urlRecepcion}/fe/recepcion/api/ecf` is the **receiver's own** token, minted from that receiver's
   `fe/autenticacion/api/validacioncertificado` (`dgii-ground-truth.md:246-249`); DGII's bearer is scoped to DGII's
   `{host}/{env}/…` services (`:37-38`, `:101-102`). The SDK sends DGII's token there *and* keeps both in one slot.
2. **Q2 — MEDIUM, not HIGH.** SDK-owned money never touches binary floating point; but a *caller's* JSON `number` is
   forwarded verbatim by `json2xml(..., round = false)` and reaches signed bytes as `"3.3000000000000003"`, which
   DGII's XSD rejects (`e-cf-32.xsd:1457-1459`). Loud, never silent.
3. **Do not ship a merely defensive `buyerHost` policy.** Dropping the header is safe and half-right; the
   DGII-correct fix is per-origin tokens, because B2B defines a second, separate credential universe.

## Q1 — buyerHost

### The credential question

Two credential universes, currently conflated:

- **DGII token** — `<semilla>` → `<validarsemilla>` on DGII's hosts, then `Authorization: Bearer {token}` "on every
  later call" to those services (`dgii-ground-truth.md:37-38`, `:101-102`); its authority is the DGII service path
  `{host}/{env}/…` (`:31-51`).
- **Receiver token** — B2B runs its own `fe/autenticacion/api/semilla` → `fe/autenticacion/api/validacioncertificado`
  against the **buyer's `urlOpcional`** ("authentication service, session protection", `:246`), then POSTs the e-CF to
  `urlRecepcion/fe/recepcion/api/ecf` (`:248-249`). Those `fe/…` paths carry no `/env` segment and belong to the
  receiver (`architecture.md:146`; `dgii-ground-truth.md:53-58`).

So **the credential for a receiver's reception endpoint is the receiver's token, not DGII's**: DGII's bearer is a
secret that buys nothing on a third-party origin.

**Signature instead, auth optional?** Both, answering different questions. The signature proves *who issued the
document* (hence the seed is signed as `SemillaModel`, `client.ts:414-420` / `client.py:367-371`); it does not prove
*the sender's right to open a session* — the existence of `fe/autenticacion` shows the receiver does not treat it as a
session credential. Auth being **optional** (`:248`), open reception falls back to the signature: receiver policy
either way, never DGII's token.

### Ranking (DGII-correct first)

1. **Per-origin token store (recommended — DGII-correct).** One token per normalized origin: DGII one key, each
   `buyerHost` another. `authenticate(buyerHost)` writes the buyer key; each request attaches only its own origin's
   token. Preserves the documented optional-auth flow, kills the leak by construction, and survives a caller
   alternating DGII and buyer hosts — the exact sequence the current code breaks.
2. **Strip the header on `buyerHost` requests, and document it.** `omitAuth`/`omit_auth` already exists
   (`http.ts:200-208`, `http.py:147-152`) and is already used for the status host (`client.ts:491`, `client.py:750`):
   the fix is a call-site flag. Cost: a receiver that *requires* session auth returns 401, so docs must say "obtain
   the peer token via `authenticate(buyerHost)` yourself". Correct by subtraction, not by design.
3. **Reject non-`https` / non-public hosts** (`p5b-appsec.md:591-592`) — orthogonal, required either way.
4. **Status quo.** Not an option: after `authenticate(buyerHost)` a buyer POST carries DGII's token *while* the
   buyer's sits where DGII's next request reads it — two failures from one line.

**(1) is DGII-correct.** (2) is the defensive subset, acceptable only as a same-week stopgap with a documented "the
SDK does not forge B2B sessions" contract.

### The token-slot defect, verified

One bearer token, one `HttpClient`, shared by DGII and any `buyerHost`: `client.ts:230-246` builds `this.http` once
(`baseUrl: BaseUrl.ECF`, DGII-only `beforeRequest: ensureToken` / `onUnauthorized: reauthenticate`);
`client.ts:392-425` `authenticate(buyerHost?)` runs the buyer's seed + `validacioncertificado` (`:595-614`) and stores
it via `this.http.setToken(...)` (`:423`) with expiry from the buyer's `expira` (`:424`) — Python identical
(`client.py:353-381`, `:379`); and `sendElectronicDocument(..., buyerHost)` posts with no `omitAuth`
(`client.ts:655-663`, `client.py:467-471`), so `http.ts:300` attaches `Authorization: Bearer <slot>` whatever the slot
holds.

Implication: **one token slot serving two credential universes.** Authentication is a property of the *origin being
called*, not of the client. `authenticate(buyerHost)` therefore has a side effect on the DGII session, and a DGII
`authenticate()` silently invalidates a live B2B session — a domain-model defect, not only a security finding, and the
reason option (2) alone cannot be the answer.

## Q2 — money

**No SDK-owned money in float; yes a float can reach signed bytes through caller JSON.**

- **No SDK arithmetic in float.** `MontoTotal` is *copied out of the source document* in E32→RFCE (`utils.ts:232`);
  routing and B2B gating read it from the signed XML as a string and compare with `compareDecimal`
  (`reception.ts:127-137`, `:203-213`); `generateEcfQRCodeURL` already takes `montototal: string` (`utils.ts:42`). No
  `montoTotal`/`totalITBIS` reference exists in `src` outside `types.ts`, none in Python outside `types.py`. The
  invariant that protects the digest is intact.
- **Yes through caller JSON.** `json2xml(dataObject: object, round = false)` (`transformer.ts:98`) applies no numeric
  guard and the `roundHalfUpToCents` text hook (`transformer.ts:117-123`) is off by default. Measured: `1.1 * 3` →
  `"3.3000000000000003"`, `4.35 * 100` → `"434.99999999999994"`, `String(1e21)` → `"1e+21"`. That text violates
  `xs:decimal`'s `fractionDigits=2` / `totalDigits=18` on `Decimal18D1or2ValidationTypeMayorIgualCero`
  (`e-cf-32.xsd:1455-1461`; used by `TotalITBIS` at `:140`, `MontoTotal` at `:162`).
- **Consequence:** signature valid, document schema-invalid, DGII rejects it — *loud*. `validateBeforeSend` defaults
  to `false` (`client.ts:224`), so the caller learns it from DGII, not the SDK.
- **The float that survives** — `InquiryStatusResponse.montoTotal`/`totalITBIS` (`types.ts:59-60`, `types.py:350-351`)
  and Py `_as_float` (`types.py:184-195`) — is response-side: a reconciliation read where double precision carries
  ~1e-16 relative error, never a cent. The FC QR (`utils.ts:24-35`) is not signed but printed, so `String(1180)` →
  `"1180"` instead of `"1180.00"` is a customer-verification defect (whether `consultatimbrefc` normalizes the
  parameter is **UNSOURCED**), not a fiscal-document one. Note the contract drift: `architecture.md:448-453` and
  `:836` already declare `monto: string`; TS drifted to `number` (`utils.ts:27`), Python widened to
  `int | float | str` (`utils.py:31`).

### Severity: MEDIUM (my grade stands); additive vs breaking

No path lets a wrong amount be **accepted**: either the SDK forwards the caller's own text (their bug, surfaced by the
XSD) or the value never enters a document. HIGH would need a silent fiscal error on an accepted receipt.

- QR helpers accept `string | number` (TS) / keep `int | float | str` + `Decimal(str(...))` (PY): **additive**,
  restores the documented `monto: string`.
- Narrow QR helpers to `string` only, or type the response amounts as `string`: **breaking** — major, or
  deprecate-then-narrow.
- Add `montoTotalDecimal`/`totalITBISDecimal` companions beside the floats: **additive** — ship now, retire the floats
  at the next major.
- Guard the money leaves in `json2xml`/`json_to_xml`: **additive** if it only refuses the lossy case; document it.

## Where I disagree with the other reviewers

- **`p8-readability` (F-READ-04 / F-READ-05, HIGH, "blocker").** The invariant ("money is never floating point",
  `AGENTS.md`) **holds on the digest path** — verified: the send path never builds money from a number. HIGH should
  mean a rejected or wrong receipt is reachable; it is not. "Silently drops trailing zeros" is real but cosmetic on a
  printed QR. Downgrade both to MEDIUM.
- **`p3-reliability` (F-REL-15, MEDIUM).** Same grade, wrong reason: it stops at the response model and misses the
  caller-JSON path (`transformer.ts:98`), the only route by which a float reaches signed bytes.
- **`p5-security` (F-SEC-02, MEDIUM) vs `p5b-appsec` (F-APPSEC-01, HIGH).** `p5b-appsec` is right and I side with HIGH,
  for a reason neither states: the token is not merely leaked, it is **the wrong credential** — the request fails at
  the receiver even where it would be honoured, and `authenticate(buyerHost)` corrupts the DGII session via the shared
  slot (`client.ts:423`, `client.py:379`). Both frame it as "unvalidated input"; from DGII's side it is a
  *credential-scoping* defect that `https`-only validation would not fix.
- **`final-gate.md:368-369`** treats money purely as "a version decision". True of the response models; the `json2xml`
  guard is patch-level hardening that costs nothing. Do not bundle the cheap half with the breaking half.

## What the evidence does not settle

1. **Whether a receiver *requires* the session token** on `fe/recepcion/api/ecf`, or accepts a POST authenticated by
   XMLDSig alone. `dgii-ground-truth.md:248` says "optional auth" without saying whose policy that is. Needs DGII's
   B2B integration document (Sender↔Receiver / `Documento Técnico B2B`).
2. **Whether DGII's token is tolerated at a receiver.** Ground truth shows two separate `autenticacion` families
   (`:37-38` vs `:56`) and never claims cross-honouring. Treat as **not allowed**; confirm by written DGII guidance or
   the B2B spec — never by probing a DGII host.
3. **Whether `consultatimbrefc?montototal=` normalizes `1180` vs `1180.00`** — no line in ground truth defines the
   parameter's precision; needs the timbre/QR section of the DGII spec.
4. **Whether `urlOpcional` may sit on a different host than `urlRecepcion`** (`dgii-ground-truth.md:232-246` lists three
   independent fields). If yes, "per-origin" must key on the `urlOpcional` origin, not on `buyerHost`.
5. **Runtime `fractionDigits` enforcement in DGII's validator** beyond the published XSD — I rely on the XSD
   (`e-cf-32.xsd:1455-1461`), the only authority in the repo.

## Ordered actions for the maintainer

1. **Decide in writing: per-origin tokens (option 1) + `buyerHost` restricted to `https` public hosts.** Gate: the
   decision in `project-docs/architecture.md`, same commit as the code (`p5b-appsec.md:650`).
2. **Stop the leak first — one flag, both packages:** `omitAuth`/`omit_auth` on the `buyerHost` sends
   (`client.ts:655-663`, `client.py:467-471`), status host untouched. Gate: test asserting **no `Authorization` header**
   leaves toward a non-DGII origin, idempotency `@<host>` behaviour unchanged.
3. **Then the per-origin store**, so `authenticate(buyerHost)` never writes the DGII slot. Gate: DGII send → buyer send
   → DGII send, each carrying its own token, in **both** suites, plus `mise run ci` for each.
4. **Harden `buyerHost`:** `https`-only, reject non-public hosts, keep refusing 3xx (already done). Gate: the table at
   `p5b-appsec.md:591-592` flips from ❌ to `Err('VALIDATION')` with no socket opened.
5. **Add the `json2xml`/`json_to_xml` money guard** (reject or `Decimal(str(v))` a non-`str` money leaf) — patch level,
   no version bump. Gate: `MontoTotal: 1.1 * 3` fails `VALIDATION` before signing in both packages, and a `round=true`
   document still validates against `e-cf-32.xsd`.
6. **Widen the QR helpers to `string`** (additive) and align them with `architecture.md:448-453` / `:836`. Gate:
   `'1180.00'` and `1180` both render `montototal=1180.00`; TS↔PY parity test.
7. **Add the `…Decimal` companions**, floats retired at the next major, then re-run the XMLDSig gate for items 5-7
   (`mise run verify-signing-typescript`; `uv run --with xmlsec python scripts/verify_signing.py`). Gate: response-model
   parity test in both packages; no hand-edited changelog or version.

Items 2 and 4 ship this week; item 1 gates 3; items 5-7 are independent of Q1 and must not wait for it.
