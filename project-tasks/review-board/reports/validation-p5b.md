# Validation p5b — security cohort

Validator: security cohort validator. Repo: `/home/deuriib/projects/dgii-ecf` (working tree, uncommitted).
Mode: READ-ONLY on the repo. Every probe ran from `/tmp/p5b/` against local stub servers and an
ephemeral, self-generated `.p12`. No traffic to DGII hosts. No repo file was modified.

Probes executed: 3 (one per item; items 2 and 3 ran both packages inside a single probe).
Tooling: `esbuild` (from `packages/typescript/node_modules`) bundling the TS sources into `/tmp`,
Node v26.13.0, and `packages/python/.venv/bin/python` with `PYTHONPATH`-style insert of
`packages/python/src`.

| # | Finding | Verdict |
|---|---|---|
| 1 | Redirect replay refused (F-APPSEC-02 / F-SEC-05) | **PASS** |
| 2 | Quadratic regex gone (F-APPSEC-03) | **PASS** (one behavioural nit: comment/CDATA bodies) |
| 3 | No key material or token in reprs (F-SECRET-01/02/03) | **PASS** (display-layer only) |

---

## 1. Redirect replay is refused (F-APPSEC-02 / F-SEC-05) — PASS

Code under test: `packages/typescript/src/http.ts` — `redirect: 'manual'` on the `fetchImpl` call
(line 319) plus an explicit 3xx branch in `parseResponse` (lines 226-245) that returns a `DgiiError`
with `code: 'HTTP'` and `retryable: false` **before** `readBody` is touched.

Probe (`/tmp/p5b/probe1.ts`, bundled to `/tmp/p5b/probe1.mjs`): two `node:http` servers on
`127.0.0.1`; the origin answers `307` with `Location: http://127.0.0.1:<attacker>/capture`, the
second server counts every request it receives. The client uses the **real global `fetch`** (not a
fake) so the `redirect` option itself is exercised, with a `POST` carrying a signed-document body and
a `Bearer` token, `maxRetries: 3`.

```bash
cd packages/typescript && ./node_modules/.bin/esbuild /tmp/p5b/probe1.ts \
  --bundle --platform=node --format=esm --target=node22 --outfile=/tmp/p5b/probe1.mjs \
  --log-level=warning && node /tmp/p5b/probe1.mjs
```

Observed:

```json
{
  "isErr": true,
  "code": "HTTP",
  "status": 307,
  "retryable": false,
  "message": "DGII responded with a redirect (307); refusing to replay the request to another host",
  "originHits": 1,
  "attackerHits": 0,
  "attackerPaths": []
}
```

* SDK returned an **error** — yes (`isErr: true`, `code: 'HTTP'`).
* Second port received **zero** requests — yes (`attackerHits: 0`, empty path log). Neither the signed
  document nor the `Authorization` header crossed the origin boundary.
* Not retryable — yes (`retryable: false`), and the origin saw exactly **one** request, so the
  retry policy did not re-send a redirect-needing POST either.

### Python (`httpx2`) side

`packages/python/src/py_dgii_ecf/http.py` never sets `follow_redirects` (grep for
`redirect`/`follow_redirects` in `src/` returns nothing relevant), and the library default is already
refusal:

```
$ .venv/bin/python -c "import inspect, httpx2; print(httpx2.__version__); \
  print(inspect.signature(httpx2.Client.__init__).parameters['follow_redirects'])"
2.16.0
follow_redirects: 'bool' = False
```

So Python **already refused** redirects before this change — no replay was ever possible there. It is
covered by `tests/test_http.py::test_does_not_follow_redirects`, which asserts `is_err()`,
`status == 307` and `client.follow_redirects is False`.

Do both now agree? Functionally **yes**: neither package replays a 3xx, both surface it as
`code = HTTP` and non-retryable (`is_retryable_status(307)` is `False`, since the retry set is
network/408/429/5xx). The wording differs: TypeScript emits the explicit redirect-refusal message,
Python falls through to the generic `DGII request failed with status 307`. That is a message-level
asymmetry only, matching the documented parity scope (no shared code): an operator reading a Python
log sees "failed with status 307" instead of "refusing to replay". Not a security gap — worth a
one-line docstring/parity note at most.

---

## 2. Quadratic regex is gone (F-APPSEC-03) — PASS

Code under test: `packages/typescript/src/xml.ts::extractElementText` (hand-rolled scan from line 105)
and `packages/python/src/py_dgii_ecf/_xml.py::extract_element_text` (from line 83). Both walk
`indexOf('<')` / `str.find('<')`, skip `? ! /` markers, read the qualified name, skip attributes, and
attempt a single closing-tag search that returns absent on failure — no `[\s\S]*?` backtracking.

Probe (`/tmp/p5b/probe2.ts` + `/tmp/p5b/probe2.py`), one command each:

```bash
cd packages/typescript && ./node_modules/.bin/esbuild /tmp/p5b/probe2.ts --bundle --platform=node \
  --format=esm --target=node22 --outfile=/tmp/p5b/probe2.mjs --log-level=warning && node /tmp/p5b/probe2.mjs
cd packages/python && .venv/bin/python /tmp/p5b/probe2.py
```

Pathological documents: (a) one matching open tag with **no** close tag and 120 KiB / 1 MiB of filler;
(b) thousands of matching open tags, none closed.

```
########## TYPESCRIPT ##########
== pathological (expect undefined, sub-linear-ish time) ==
unclosed matching tag                          size=  120KiB time=    0.64ms value=undefined
many matching open tags                        size=  103KiB time=    0.28ms value=undefined
unclosed matching tag                          size= 1024KiB time=    1.08ms value=undefined
many matching open tags                        size=  878KiB time=    2.57ms value=undefined
########## PYTHON ##########
== pathological (expect None, sub-linear-ish time) ==
unclosed matching tag                          size=  120KiB time=    0.14ms value=None
many matching open tags                        size=  102KiB time=    0.10ms value=None
unclosed matching tag                          size= 1024KiB time=    0.98ms value=None
many matching open tags                        size=  877KiB time=    1.17ms value=None
```

Measured: **0.64 ms → 1.08 ms** for an 8.5× larger unclosed payload (TS); **0.14 ms → 0.98 ms**
(Python). The 8-9× input growth costs ~1.7× (TS) / ~7× (Python, still sub-millisecond) — linear, not
quadratic. A 1 MiB unclosed element returns absent in ~1 ms, so the DoS-by-crafted-document path is
closed. Both packages return `undefined` / `None` as required.

Tolerant cases, both packages identical:

```
plain                                          -> "E310000000001"
namespace prefix                               -> "E310000000002"
default ns decl                                -> "E310000000003"
> inside quoted attribute                      -> "E310000000004"
single-quoted attr with >                      -> "E310000000005"
attr with /> inside quotes                     -> "E310000000006"
decl + comment before                          -> "no"        <-- see nit
blank element                                  -> undefined / None
self-closing                                   -> undefined / None
attr named eNCF -> undefined / None
```

Required assertions all hold: namespace prefix resolved by local name, `>` (and even `/>`) inside a
quoted attribute does not terminate the tag, self-closing yields absent, blank yields absent, and an
*attribute* named `eNCF` is not mistaken for the element.

Nit observed while testing (not one of the required cases): the scan skips the comment/CDATA *opener*
(`<!--`, `<![CDATA[`) but not the body, so a comment body containing the tag wins over the real
element — `<?xml?><!-- <eNCF>no</eNCF> --><ECF><eNCF>REAL</eNCF></ECF>` returns `"no"` in **both**
packages (identical behaviour, so parity is intact). `extractRootElementName` strips comments
explicitly, so routing is unaffected; the exposure is limited to idempotency-key derivation
(`RNC:eNCF:hash`) on a caller-supplied document that carries a commented-out element. See residual risk.

---

## 3. No key material or token in reprs (F-SECRET-01/02/03) — PASS

Code under test: `packages/typescript/src/certificate.ts` (`readonly #passphrase`, with the docstring
stating why `private` was insufficient), `packages/python/src/py_dgii_ecf/certificate.py`
(`P12ReaderData.__repr__` redacts `key`), `packages/python/src/py_dgii_ecf/types.py`
(`AuthToken.__repr__` redacts `token`).

Fixture: a throwaway RSA-2048 key + self-signed cert serialized to PKCS#12 with passphrase
`P5b-Ephemeral-Pass-9f3a7c`, generated by `/tmp/p5b/gen_p12.py` into `/tmp/p5b/ephemeral.p12`
(2574 bytes, `chmod 600`). Nothing was written inside the repo.

```bash
.venv/bin/python /tmp/p5b/gen_p12.py /tmp/p5b/ephemeral.p12
cd packages/typescript && ./node_modules/.bin/esbuild /tmp/p5b/probe3.ts --bundle --platform=node \
  --format=cjs --target=node22 --outfile=/tmp/p5b/probe3.cjs --log-level=warning && node /tmp/p5b/probe3.cjs
cd packages/python && .venv/bin/python /tmp/p5b/probe3.py
```

### TypeScript — passphrase unreachable from the instance

```
== functional: the passphrase is really used by the reader ==
loaded.isOk()      = true
key starts with    = "<PEM-RSA-PRIVATE-KEY>"
cert starts with   = "-----BEGIN CERTIFICATE-----"
publicKey present  = true
clean P12ReaderData leaked passphrase?

== introspection surfaces ==
Object.keys                 = []
Object.getOwnPropertyNames  = []
Reflect.ownKeys             = []
clean JSON.stringify(reader)
clean JSON.stringify([reader])
clean JSON.stringify({...reader})
clean util.inspect(reader)
clean util.inspect(showHidden, depth:Inf)
clean String(reader)
clean `${reader}` template

== error paths (wrong passphrase) ==
wrong.isErr()               = true
code                        = CERTIFICATE
message                     = "Unable to parse .p12: PKCS#12 MAC could not be verified. Invalid password?"
cause present               = true
clean util.inspect(error)
clean JSON.stringify(error)
clean String(error.stack)
clean error.cause.inspect
```

The reader decrypts the bundle (so the passphrase is genuinely wired through), yet exposes **no own
property at all** — `#passphrase` is invisible to `Object.keys`, `getOwnPropertyNames` and
`Reflect.ownKeys`, hence to `JSON.stringify`, spread and `util.inspect` (including
`showHidden: true, getters: true, depth: Infinity`). The failure path is clean too: forge's message
is generic, and the non-enumerable `cause` (`Object.defineProperty`, `errors.ts:224`) keeps
`JSON.stringify(error)` from walking it.

### Python — reprs of `P12ReaderData` and `AuthToken` redact

```
== functional: the passphrase is really used ==
loaded.is_ok()  = True
key prefix      = '<PEM-PRIVATE-KEY>'
cert prefix     = '-----BEGIN CERTIFICATE-----'
public_key set  = True

== P12ReaderData display surfaces ==
clean repr(data) / str(data) / f-string(data) / repr([data]) / repr({'credentials': data})
clean pprint.pformat(data) / pprint.pformat([data]) / '%s' % (data,) / repr(replace(data))
fields still hold the real key: True

== AuthToken display surfaces ==
clean repr(token) / str(token) / f-string(token) / repr([token]) / pprint.pformat(token)
clean format(token) / repr({'auth': token})
token.token still real: True
token.expira still real: True

== reader instance itself ==
clean repr(reader) / f-string(reader)
vars(reader) keys: ['_passphrase']
```

`repr`, `str`, f-string, `%`-format, `format()`, `pprint` (of the object, a list and a dict) and
`dataclasses.replace` all render `key=<redacted>` / `token=<redacted>`; no `PRIVATE KEY` header and no
token string appears anywhere. Both objects still hold the real values — `data.key` contains
`<PEM-PRIVATE-KEY>`, `token.token == TOKEN`, `token.expira` unchanged — so redaction is
display-only and did not corrupt data used for signing.

Scope note (see residual risk): `dataclasses.asdict(data)` still yields the PEM key, and the Python
reader keeps `_passphrase` as an ordinary attribute reachable via `vars(reader)` / `reader._passphrase`
— the TypeScript side has **zero** reflection surface for it. Neither is a `repr` leak, which is what
F-SECRET asked for.

---

## Verdict

**ACCEPTED WITH RESIDUALS**

All three findings are closed as specified: a 3xx is refused with no replay and no retry (attacker
port received zero requests), `extractElementText` / `extract_element_text` are linear (1 MiB
pathological input in ~1 ms) and still tolerant of namespace prefixes, `>`-in-attribute and
self-closing elements, and no passphrase, private key or bearer token is reachable from any repr,
stringification, JSON or inspect surface of the objects that carry them. The residuals below are
documented behaviour limits, not regressions.

## Residual risk

1. **Comment/CDATA bodies are still scanned as markup (low).** `<?xml?><!-- <eNCF>decoy</eNCF> --><ECF><eNCF>REAL</eNCF></ECF>`
   resolves to `decoy` in both packages. Routing is safe (`extractRootElementName` strips comments),
   but the idempotency key is `RNC:eNCF:SHA-256(signedXml)`, so a caller-supplied document whose
   commented-out element carries a different e-NCF would produce a **different key** for the same
   signed bytes. Exploitability requires the caller to assemble a document from untrusted parts
   (a pasted/commented-out element); the net effect is at worst a second transmission of one document —
   the failure mode idempotency exists to prevent — not cross-document leakage or replay to another host.
   Cheap hardening if desired: strip `<!--...-->` and `<![CDATA[...]]>` bodies before the scan, in both
   packages in the same commit.
2. **Redaction is display-layer only.** `dataclasses.asdict()` on `P12ReaderData` and
   `vars(reader)['_passphrase']` / `reader._passphrase` on the Python side hand back the private key and
   the keystore passphrase to anyone with the object. TypeScript is strictly better here (`#passphrase`
   is unreachable). Anyone who writes a custom logger that serializes attributes instead of using
   `repr` re-opens F-SECRET-01. Nothing in the SDK does this today.
3. **Buyer-host idempotency scope — no new exposure.** The `@<host>` suffix is derived only from the
   caller's own `buyerHost` option (never from a response header or `Location`), normalized identically
   in both packages (`destinationScope` = strip trailing slashes + lowercase; `_destination_scope` =
   `rstrip('/').lower()`). It adds a cache-key dimension, not a credential or an attacker-controlled
   channel: the key still requires `RNC + eNCF + SHA-256(signedXml)`, and a caller who changes their own
   destination is the legitimate owner of that separation. `InMemoryIdempotencyStore` bounds growth with
   a TTL plus a sweep, so a varying host cannot inflate memory without bound.
4. **Ambiguous-error `cause` chain — no new exposure.** `cause` is defined non-enumerable, so
   `JSON.stringify(error)` never walks it (verified), and what it carries is the underlying transport
   error — no request headers, therefore no `Authorization: Bearer`. It remains reachable by direct
   property access and by `util.inspect(..., { showHidden: true })`, so a bespoke deep-dumping logger
   could print socket/URL detail; that is information disclosure of internal topology at worst, and the
   probe confirmed the passphrase and token never appear in it.
5. **Message-level parity gap (cosmetic).** Python reports a 3xx as `DGII request failed with status 307`
   with no redirect-specific wording, while TypeScript says it is refusing to replay. Both are
   `code = HTTP`, `retryable = false`, body unread.
