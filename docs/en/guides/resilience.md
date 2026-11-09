# Resilience & idempotency

Every external call is protected by retry, a circuit breaker and a timeout.

!!! note "Link verification"

    Official links on this page were verified on 2026-11-09. DGII republishes
    files in place, so re-check a document before relying on a section
    reference. See [Official DGII references](../reference/dgii-official.md).

## Retry policy

Only **transient** failures are retried:

- network errors and timeouts
- HTTP `408`, `429`, `5xx`

A rejected e-CF (e.g. `400`, `401`) is **never** blindly re-sent.

When a transmission fails and you fall back to contingency, this governs it:
**Official source:** [Informe Técnico Comprobante Fiscal Electrónico](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Informe%20T%C3%A9cnico%20e-CF%20v1.0.pdf) — §19: contingency operation, the clocks it sets for transmitting what was generated offline, and the identifiers that mark a replacement receipt (v1.0; site-updated 2026-10-16) · [Instructivo de Contingencia de Facturación Electrónica](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Instructivo%20de%20Contingencia%20de%20FE.pdf) — the operational manual for working in contingency (site-updated 2026-10-15).

| Option              | Default                |
| ------------------- | ---------------------- |
| Max attempts        | 3                      |
| Breaker threshold   | 5 consecutive failures |
| Half-open after     | 30 s                   |
| Per-attempt timeout | 15 s                   |

=== "TypeScript"

    ```ts
    const ecf = new ECF(credentials, Environment.Prod, {
      resilience: { maxRetries: 3, breakerThreshold: 5, timeoutMs: 15_000 },
    });
    ```

=== "Python"

    ```python
    from py_dgii_ecf import ECF, ResilienceOptions

    ecf = ECF(credentials, resilience=ResilienceOptions(max_retries=3))
    ```

## Idempotency

Submissions are keyed by `RNC + eNCF + SHA-256(signed XML)`. A repeated call
returns the cached response instead of double-issuing. The same flow covers
e-CF, summary (RFCE), commercial approval (ACECF) and range voiding (ANECF);
the void flow uses `RangoNCF` in place of `eNCF`.

Provide a persistent store (Redis/Postgres) in production:

=== "TypeScript"

    ```ts
    const ecf = new ECF(credentials, Environment.Prod, {
      idempotencyStore: myRedisStore, // { get, set, delete }
    });
    ```

=== "Python"

    ```python
    ecf = ECF(credentials, idempotency_store=my_redis_store)
    ```

!!! info "Persist before transmit"
Store the signed XML, its hash and the idempotency key before the network
call, so an interrupted send can be reconciled instead of re-issued.

**Official source:** [Estándares de Comportamiento Esperado en la Integración con el Sistema](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Estandares%20de%20Comportamiento%20Esperado%20en%20la%20Integracion.pdf) — §5.2–5.3: sign and store the e-CF locally with its timestamp before transmitting it, and verify the first documents before draining the queue (site-updated 2026-11-06). The keying scheme is the SDK's design.

## In-memory store lifetime

The default `InMemoryIdempotencyStore` expires entries after 24 hours and
sweeps them once the map passes 1,000 entries, so a long-running process cannot
grow without bound. Both are configurable:

=== "TypeScript"

    ```ts
    const store = new InMemoryIdempotencyStore({ ttlMs: 60 * 60 * 1000 });
    ```

=== "Python"

    ```python
    from py_dgii_ecf import InMemoryIdempotencyStore

    store = InMemoryIdempotencyStore(ttl_s=3600)
    ```

It is still process-local: use Redis or Postgres when more than one instance
can submit the same document.

## Reconciling a pending submission

A submission writes a **pending** marker before transmitting. If the process
dies mid-flight, the marker stays and the next attempt with the same document
returns `IDEMPOTENCY` instead of re-sending. That is the safe default: a
retried send must never double-issue a fiscal document.

`reconcileSubmission` / `reconcile_submission` resolves that state by asking
DGII what it knows about the e-NCF:

=== "TypeScript"

    ```ts
    const outcome = await ecf.reconcileSubmission(signedXml);
    if (outcome.isOk()) {
      if (outcome.value.delivered) {
        // DGII already has the document — do not retry.
      } else if (outcome.value.cleared) {
        // DGII has no record; the marker was cleared and a retry is safe.
      }
    }
    ```

=== "Python"

    ```python
    outcome = ecf.reconcile_submission(signed_xml)
    if outcome.is_ok():
        result = outcome.unwrap()
        if result.delivered:
            ...  # DGII already has it — do not retry
        elif result.cleared:
            ...  # no record; retry is safe
    ```

The marker is cleared **only** when DGII reports `No encontrado`. When DGII has
a record the marker stays in place — it is the lock that prevents a second
submission — and `delivered` tells you to stop.

`canReuseSequence` / `can_reuse_sequence` answers the follow-up question for a
rejection: whether the e-NCF may be used again. DGII sets
`secuenciaUtilizada: false` for a rejection that leaves the sequence reusable
(invalid certificate or signature, invalid XML, non-delegated signer,
unauthorized or expired e-NCF, non-electronic issuer, unknown or inactive RNC).
An absent flag is treated as **not** reusable.

**Official source:** [Descripción Técnica Servicios DGII](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Descripcion%20Tecnica%20Servicios%20DGII.pdf) — _Consulta de trackId e-CF_ (the `No encontrado` state), _Consulta de resultado e-CF_ and _Consulta de Resumen (RFCE)_ (the `secuenciaUtilizada` flag, keyed by `trackId` or by RNC + e-NCF + security code) (site-updated 2026-05-29).
