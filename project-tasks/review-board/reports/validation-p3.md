# Reliability Fix Validation

Validator pass on the fixes for the reliability findings in `p3-reliability.md`. Read-only: no
repository file was modified. Every probe below lives under `/tmp/val/`, imports the working-tree
source, and talks only to a loopback stub — **no traffic was ever sent to a DGII host**.

Baseline of the tree under validation: `git status` shows 21 modified files plus untracked
`project-tasks/`, `scripts/check_parity.py`; both suites green (evidence in
[Commands run](#commands-run)).

Status: **IN PROGRESS** — findings are filled as evidence lands.

## Verdict

_TBD_

## Per-finding results

| ID | Claim | Verdict | Evidence |
|----|-------|---------|----------|
| F-REL-01 | Ambiguous failures keep the marker | TBD | TBD |
| F-REL-02 | Key includes destination host | TBD | TBD |
| F-REL-03 | Concurrent callers transmit once | TBD | TBD |
| F-REL-04 | Marker shapes interoperate | TBD | TBD |
| F-REL-05 | Unparseable 2xx fails as VALIDATION | TBD | TBD |
| F-REL-08 | Attempt budget is 3 in both | TBD | TBD |

### F-REL-01 — Ambiguous transmit failures keep the marker — **PASS**

Code under test: `packages/typescript/src/client.ts:304-330` (`submitIdempotent`: `result.error.status
=== undefined` → `AMBIGUOUS_SUBMISSION_MESSAGE`, no `delete`; otherwise `delete`) and
`packages/python/src/py_dgii_ecf/client.py:311-352` (same rule via `error.status is None`).
Messages in `packages/typescript/src/reconciliation.ts:12-21` and
`packages/python/src/py_dgii_ecf/reconciliation.py:19-28`.

**TypeScript** — real loopback socket; the stub reads the whole multipart body (so the document *did*
reach the destination) and then either answers 800 ms late (`hang`, per-attempt timeout 150 ms) or
destroys the socket after reading the body (`reset`):

```
$ cd packages/typescript && bun run /tmp/val/ts/probes.ts ambiguous
[hang]  first:  Err(code=IDEMPOTENCY status=undefined msg="The submission outcome is unknown: it may have reached DGII; the pending marker was kept —")
[hang]  bodies received by stub: 1
[hang]  store[key] after first: {"__pending__":true}
[hang]  second: Err(code=IDEMPOTENCY ... msg="A submission with this key is already pending; call reconcileSubmission() before retrying")
[hang]  bodies received after second: 1
[hang]  store[key] after second: {"__pending__":true}
[reset] first:  Err(code=IDEMPOTENCY status=undefined msg="The submission outcome is unknown: ...")
[reset] bodies received by stub: 3
[reset] store[key] after first: {"__pending__":true}
[reset] second: Err(code=IDEMPOTENCY ... "already pending")
[reset] bodies received after second: 3
```

**Python** — same stub, `timeout_s=0.15`, three ambiguous transport shapes:

```
$ cd packages/python && uv run --frozen python /tmp/val/py/probes.py ambiguous
[hang]       first: Err(code=IDEMPOTENCY status=None msg='The submission outcome is unknown: ...') | bodies=3
             store after first: {'__pending__': True}
             second: Err(code=IDEMPOTENCY ... 'already pending') | bodies after second: 3
             store after second: {'__pending__': True}
[disconnect] first: Err(code=IDEMPOTENCY status=None msg='...') | bodies=3 | store: {'__pending__': True}
             second: Err(... 'already pending') | bodies: 3
[truncate]   first: Err(code=IDEMPOTENCY status=None msg='...') | bodies=3 | store: {'__pending__': True}
             second: Err(... 'already pending') | bodies: 3
```

The stated criterion holds in both packages: a failure with **no HTTP status** keeps the pending
marker, the first call reports the ambiguous message, and a second identical call transmits nothing
and returns the "already pending" error. The mirror rule also holds — see the 503 probe in
[F-REL-08](#f-rel-08--attempt-budget-is-3-sends-in-both-packages--pass), where a status-carrying
failure deletes the marker and the retry does transmit.

**Residual risk (carried into [Residual risk](#residual-risk)):** the *number of copies inside the
first call* is unchanged. A reset/timeout is still retried inside the HTTP policy, so one caller
invocation delivered **3 copies** to the stub in Python (`max_retries=3`) and **3** in TypeScript on
a socket reset. The marker stops the *next* call, not the retries inside this one.

### F-REL-02 — The idempotency key includes the destination — **PASS**

Code under test: `packages/typescript/src/client.ts:180-186` (`destinationScope`) + `247-276`
(`buildIdempotencyKey(signedXml, destination?)`), call sites `650-653` (`sendElectronicDocument`),
`901-904` (`sendCommercialApproval`), `572` (`reconcileSubmission`); Python
`packages/python/src/py_dgii_ecf/client.py:75-77` (`_destination_scope`) + `241-271`, call sites
`467-468`, `620-623`, `767`.

**TypeScript:**

```
$ cd packages/typescript && bun run /tmp/val/ts/probes.ts destination
buyerA: Ok({"trackId":"T1","error":"","mensaje":"Recibido"})
buyerB: Ok({"trackId":"T1","error":"","mensaje":"Recibido"})
dgii:   Ok({"trackId":"T1","error":"","mensaje":"Recibido"})
transmissions: 3
buyerA (uppercase + trailing slash) reuses cache: Ok({...})
transmissions after uppercase replay: 3
ambiguous buyer delivery: Err(code=IDEMPOTENCY ... "outcome is unknown")
scoped marker written: {"__pending__":true}
reconcileSubmission(signedXml, buyerHost): Ok({...,"delivered":false,"cleared":true})
after reconcile: scoped marker / DGII marker: undefined / {"__pending__":true}
```

**Python:**

```
$ cd packages/python && uv run --frozen python /tmp/val/py/probes.py destination
buyerA: Ok(InvoiceResponse(track_id='T1', ...)) | buyerB: Ok(...) | dgii: Ok(...)
transmissions: 3
buyerA uppercase+slash reuses cache: Ok(...) | transmissions after uppercase replay: 3
store keys:
  '130862346:E310000000100:1073…b627'
  '130862346:E310000000100:1073…b627@https://buyer-a.example'
  '130862346:E310000000100:1073…b627@https://buyer-b.example'
ambiguous buyer delivery: Err(code=IDEMPOTENCY status=None ...)
scoped marker written: {'__pending__': True}
reconcile_submission(signed_xml, buyer_host): Ok(... cleared=True)
after reconcile: scoped marker / DGII marker: None / {'__pending__': True}
```

Three destinations of one signed document now produce **three transmissions and three distinct
store keys** (TS and PY byte-identical key shapes), a fourth call to an already-served destination is
still a cache hit (0 extra transmissions), the legacy unscoped `rnc:encf:sha` key is preserved for
DGII, and `reconcileSubmission(signedXml, buyerHost)` deletes **only** the scoped marker while the
DGII marker for the same document survives. Calling it without `buyerHost` deletes only the DGII
marker. Both packages agree on normalization (`rstrip('/').toLowerCase()`).

Nit, not a failure: the scope is the lowercased **full URL** (`@https://buyer-a.example`), not the
bare host the docstring names ("suffixed with the destination host"). It is applied identically at
send and reconcile in both packages, so it is self-consistent; a caller that passes
`https://buyer-a.example` to `send` and `https://buyer-a.example/` to `reconcileSubmission` still
matches. A caller that mixes scheme spellings (`http://` vs `https://`) for what it believes is one
destination gets two keys — which errs toward an extra transmission, not a lost one.

### F-REL-03

_TBD_

### F-REL-04

_TBD_

### F-REL-05

_TBD_

### F-REL-08

_TBD_

## Regressions or new failure paths

_TBD_

## Residual risk

_TBD_

## Commands run

_TBD_
