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
repetida devuelve la respuesta en caché en lugar de emitir dos veces. El mismo
flujo cubre e-CF, resumen (RFCE), aprobación comercial (ACECF) y anulación de
rango (ANECF); la anulación usa `RangoNCF` en lugar de `eNCF`.

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

## Vida útil del almacén en memoria

El `InMemoryIdempotencyStore` por defecto expira las entradas a las 24 horas y
las barre cuando el mapa pasa de 1.000 entradas, de modo que un proceso de
larga duración no crece sin límite. Ambos valores son configurables:

=== "TypeScript"

    ```ts
    const store = new InMemoryIdempotencyStore({ ttlMs: 60 * 60 * 1000 });
    ```

=== "Python"

    ```python
    from py_dgii_ecf import InMemoryIdempotencyStore

    store = InMemoryIdempotencyStore(ttl_s=3600)
    ```

Sigue siendo local al proceso: usa Redis o Postgres cuando más de una
instancia pueda enviar el mismo documento.

## Reconciliar un envío pendiente

Un envío escribe un marcador **pendiente** antes de transmitir. Si el proceso
muere a mitad de camino, el marcador queda y el siguiente intento con el mismo
documento devuelve `IDEMPOTENCY` en lugar de reenviar. Ese es el default seguro:
un reenvío nunca debe duplicar un comprobante fiscal.

`reconcileSubmission` / `reconcile_submission` resuelve ese estado preguntándole
a la DGII qué sabe del e-NCF:

=== "TypeScript"

    ```ts
    const outcome = await ecf.reconcileSubmission(signedXml);
    if (outcome.isOk()) {
      if (outcome.value.delivered) {
        // La DGII ya tiene el documento — no reintentar.
      } else if (outcome.value.cleared) {
        // La DGII no tiene registro; el marcador se limpió y reintentar es seguro.
      }
    }
    ```

=== "Python"

    ```python
    outcome = ecf.reconcile_submission(signed_xml)
    if outcome.is_ok():
        result = outcome.unwrap()
        if result.delivered:
            ...  # la DGII ya lo tiene — no reintentar
        elif result.cleared:
            ...  # sin registro; reintentar es seguro
    ```

El marcador se limpia **solo** cuando la DGII responde `No encontrado`. Si la
DGII tiene registro, el marcador se mantiene — es el candado que impide un
segundo envío — y `delivered` te dice que pares.

`canReuseSequence` / `can_reuse_sequence` responde la pregunta siguiente ante un
rechazo: si la secuencia del e-NCF puede volver a usarse. La DGII pone
`secuenciaUtilizada: false` cuando el rechazo deja la secuencia reutilizable
(certificado o firma inválida, XML inválido, firmante no delegado, e-NCF no
autorizado o vencido, emisor no electrónico, RNC inexistente o inactivo). Un
flag ausente se trata como **no** reutilizable.
