# Resilience & idempotency

Every external call is protected by retry, a circuit breaker and a timeout.

## Retry policy

Only **transient** failures are retried:

- network errors and timeouts
- HTTP `408`, `429`, `5xx`

A rejected e-CF (e.g. `400`, `401`) is **never** blindly re-sent.

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
returns the cached response instead of double-issuing.

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
