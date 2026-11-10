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
| Max attempts        | 3 (4 in TypeScript)    |
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
    } else {
      // Could not ask DGII: the marker is intact — retry the reconcile later,
      // never the send.
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
    else:
        ...  # could not ask DGII: the marker is intact — retry the reconcile, not the send
    ```

The marker is cleared **only** when DGII reports `No encontrado`. When DGII has
a record the marker stays in place — it is the lock that prevents a second
submission — and `delivered` tells you to stop.

`canReuseSequence` / `can_reuse_sequence` answers the follow-up question after a
rejection: whether the e-NCF may be used again. DGII publishes
`secuenciaUtilizada` on the **track-result** consult, not on the existence one, so
the flag is reached through the track ids — and only a rejected general e-CF pays
for those two reads: `consultaestado`, then `consultatrackids`, then
`consultaresultado` when exactly one usable track is listed. Every other outcome
stops after the first read.

`true` needs both facts from DGII: `secuenciaUtilizada: false` **and**
`estado: Rechazado`. Anything else — no record, a verdict that is not a rejection,
several tracks, an entry without a `trackId`, an absent or non-boolean flag —
answers `false`. A malformed non-classifying field (`codigo`, `fechaRecepcion`,
`mensajes`) never fails the read either: those fields decide nothing. That is the
conservative default, and it still holds: an absent flag is treated as **not**
reusable.

`canReuseSequence: false` does not mean DGII consumed the sequence; it means the
SDK did not obtain a positive reusable answer. A flag that **could not be read**
is not a `false` either — the call returns `Err` with the pending marker intact,
so retry the reconcile later rather than re-sending. And `canReuseSequence: true`
always arrives with `cleared: false`: re-sign the same e-NCF as a new document,
do not re-send the one DGII rejected.

A rejected document therefore costs up to three reads and can run for minutes:
size the queue lease above ≈5 min (TypeScript) / ≈3¾ min (Python), not against the
single call it used to be. A `5xx` or a transport failure differs between the two
SDKs only in bookkeeping — Python reports `HTTP` after 3 attempts per read,
TypeScript `HTTP`/`UNKNOWN` after 4.

**Official source:** [Descripción Técnica Servicios DGII](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Descripcion%20Tecnica%20Servicios%20DGII.pdf) — _Consulta de estado e-CF_ (the `No encontrado` state), _Consulta de resultado e-CF_ and _Consulta de Resumen (RFCE)_ (the `secuenciaUtilizada` flag, keyed by `trackId` or by RNC + e-NCF + security code) (site-updated 2026-05-29).
