# Validation P2b — Testing dimension (mutation spot-check)

**Scope:** three named mutations, run in copies under `/tmp`. Nothing else audited.
**Real tree:** read-only. `git status --short` before and after: 32 modified + 6 untracked, no stashes;
`packages/python/.venv` editable path restored to `/home/deuriib/projects/dgii-ecf/packages/python/src`
after mutation 1 (a `uv run` inside the copy had repointed it while the `.venv` was symlinked).

**Summary: 3/3 named mutations killed, plus a voluntary fourth (single-flight lock) killed. No test in
this set passes either way.**

| # | Mutation | Target test | Mutant result | Killed? |
|---|----------|-------------|---------------|---------|
| 1 | `retry: false` / `retry=False` dropped from the invoice submission | TS `does not retry a submission on 5xx; the caller retries safely` | `calls` = **3**, expected 1 | ✅ |
| 1 | same, Python side | PY `test_does_not_retry_a_submission_on_5xx` | `assert 3 == 1` | ✅ |
| 2 | `submitIdempotent` caches any 2xx body (no `isRecord` branch) | `submission integrity > does not treat a 2xx with an unreadable body as a delivered submission` | first call returned `ok`, expected `VALIDATION` err | ✅ |
| 3 | `SEND_INVOICE` drift, `Endpoint` | `scripts/check_parity.py` | exit **1**, named the endpoint | ✅ |
| 3b | `SEND_INVOICE` drift, `SenderReceiverEndpoint` | `scripts/check_parity.py` | exit **1**, named the endpoint | ✅ |
| — | restore after 3/3b | `scripts/check_parity.py` | `parity: OK (15 checks)`, exit **0** | baseline |
| 4 (extra) | per-key submission lock removed (`_lock_for` → no-op) | PY `test_concurrent_submissions_of_one_document_transmit_once` | `assert 2 == 1` (two transmissions) | ✅ |

Baseline first, so the kills are attributable: every named test is green on the unmutated tree
(`vitest -t` and `pytest -k` on the real tree: 1 passed / 1 passed / 2 passed).

## Mutation 1 — submissions retry again (fiscal-integrity guard)

Copy `/tmp/mut-1`; dropped `retry: false` from the `postMultipart` options in
`sendElectronicDocument` (`packages/typescript/src/client.ts:662`) and `retry=False` from the matching
`post_multipart` lambda (`packages/python/src/py_dgii_ecf/client.py:470`).

```
FAIL test/client.test.ts > ECF client > does not retry a submission on 5xx; the caller retries safely
AssertionError: expected 3 to be 1      (test/client.test.ts:169, calls=3)
```

```
FAILED tests/test_client.py::test_does_not_retry_a_submission_on_5xx
E       assert 3 == 1                    (tests/test_client.py:125)
```

Three transmissions from one call, both languages — exactly the regression the docstring describes.
The kernel of the assertion (`calls === 1`) is what fails, not a collateral expectation, so the guard
is on the behaviour and not on a side effect. Both tests are genuine regression guards.

## Mutation 2 — unreadable 2xx must not be cached as delivered

Copy `/tmp/mut-2`; removed the `isRecord(result.value)` branch from `submitIdempotent`, so any 2xx
value is written to the store as a delivered submission.

```
FAIL test/client.test.ts > submission integrity > does not treat a 2xx with an unreadable body as a delivered submission
AssertionError: expected false to be true   (test/client.test.ts:775 — first.isErr() was false)
```

Genuine guard. The test has two independent assertions and the mutant is caught by the first
(`VALIDATION` instead of `ok`); the marker half (`second.error.code === 'IDEMPOTENCY'`, `sends === 1`)
was not exercised by this mutant but is load-bearing by construction — clearing the marker would make
the second call re-transmit and fail `sends === 1`.

Note for parity: Python carries the equivalent test
(`tests/test_client.py:979`, `test_unreadable_2xx_body_keeps_the_marker_and_does_not_resend`), which
this pass did not mutate.

## Mutation 3 — parity gate catches one-sided drift

Copy `/tmp/mut-3`. Changed `Endpoint.SEND_INVOICE` in `packages/python/src/py_dgii_ecf/environment.py`:

```
parity: 1 failure(s) across 15 checks
  - Endpoint: 'sendinvoice' is 'recepcion/api/FacturasElectronicas' in TypeScript and 'recepcion/api/FacturasElectronics' in Python
EXIT=1
```

Bare single-character drift (`...Electronicas` → `...Electronics`), caught and named. Restored:
`parity: OK (15 checks)`, `EXIT=0`. The second table (`SenderReceiverEndpoint.SEND_INVOICE`,
`fe/recepcion/api/ecf`) was mutated too and also fails by name (`...ecf` vs `...ecf-drift`), so the
gate is not keyed to one table. Genuine guard: it fails on the mutation and returns 0 on restore, and
the failure message names the endpoint, which is what makes it actionable rather than just red.

## Do these tests flake on a slow CI runner?

**No, not in the direction that matters (false red).**

- `RacingStore._barrier.wait(timeout=0.5)` is not a race margin on the passing path. With the per-key
  lock in place only **one** thread ever reaches `get()`, so the barrier can never fill and always
  breaks after the full 0.5 s; `BrokenBarrierError` is suppressed and the value read *before* the wait
  is returned. The 0.5 s is a ceiling on how long a blocked caller may wait, and it is paid
  deterministically — the pass path does not depend on scheduling at all.
- The slow-runner exposure is the opposite direction: with the lock removed, both threads must reach
  `get()` within 0.5 s of each other. They are released from a `threading.Barrier(2)` and do only key
  construction (SHA-256 over a small XML) before the store read — measured in microseconds against a
  500 ms window. If a pathologically slow runner missed the rendezvous the mutant would **survive**
  (false green), never fail a correct implementation. That is a detection weakness, not a flake.
- The handler's `time.sleep(0.02)` runs inside the lock, so it only lengthens the passing test by
  20 ms; it cannot reorder anything.
- Linearity bounds (`elapsed < 1.5`): measured directly — Python `extract_element_text` on the hostile
  8192-tag payload takes **0.0002 s**, the TS test runs in single-digit ms. Three to four orders of
  magnitude of headroom, so a runner ~5000× slower would still pass. Absolute-time bounds are a
  smell in principle, but at this margin the assert cannot misfire; the trade-off is only that a
  slower-but-still-linear implementation would also pass.

## Verdict

**ACCEPTED** — all three named mutations were killed by the named tests, plus a fourth (the
single-flight lock) killed by the concurrency test. The unmutated tree is green for every test used,
so no kill is attributable to a pre-existing failure. The two fiscal-integrity guards (no in-SDK
submission retry, no delivered-marker on an unreadable 2xx) fail precisely on the assertion that
encodes the invariant, in both languages, and the parity gate both fails and clears correctly.

## Remaining test gaps

- The concurrency guard's rendezvous has a 0.5 s window; on a runner slow enough to miss it the
  *mutant* survives silently. Widening to the lock's own timeout, or asserting a monotonic
  transmit counter with a longer barrier, would remove the theoretical false green.
- The Python twin of mutation 2 (`test_unreadable_2xx_body_keeps_the_marker_and_does_not_resend`) was
  not mutated in this pass, so its parity with the TypeScript guard is asserted, not proven.
- No test pins that a **definitive 4xx** clears the marker *and* that a subsequent identical call
  re-transmits; mutation 1 only proves the 5xx path keeps `calls == 1`.
- The parity gate covers literal tables and numbers only — a one-sided change to `submitIdempotent`
  control flow (mutation 2, applied to Python alone) would not be caught by any mechanical check.
- The linearity bound is absolute (1.5 s) rather than scaled to payload size, so it certifies "not
  quadratic" only for this one input shape.
