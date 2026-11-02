# Resiliencia e idempotencia

Cada llamada externa está protegida por reintentos, un circuit breaker y un
timeout.

## Política de reintentos

Solo se reintentan las fallas **transitorias**:

- errores de red y timeouts
- HTTP `408`, `429`, `5xx`

Un e-CF rechazado (por ejemplo `400`, `401`) **nunca** se reenvía a ciegas.

| Opción                 | Valor por defecto     |
| ---------------------- | --------------------- |
| Intentos máximos       | 3                     |
| Umbral del breaker     | 5 fallas consecutivas |
| Semiabierto después de | 30 s                  |
| Timeout por intento    | 15 s                  |

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

## Idempotencia

Los envíos se identifican por `RNC + eNCF + SHA-256(signed XML)`. Una llamada
repetida devuelve la respuesta en caché en lugar de emitir dos veces.

Usa un almacén persistente (Redis/Postgres) en producción:

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

!!! info "Persiste antes de transmitir"
Guarda el XML firmado, su hash y la clave de idempotencia antes de la
llamada de red, para que un envío interrumpido se pueda conciliar en lugar
de reemitirse.
