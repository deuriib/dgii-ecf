# Resiliencia e idempotencia

Cada llamada externa está protegida por reintentos, un circuit breaker y un
timeout.

!!! note "Verificación de enlaces"

    Los enlaces oficiales de esta página se verificaron el 2026-11-09. La DGII
    republica los archivos en la misma ubicación, así que vuelve a comprobar el
    documento antes de confiar en una referencia a una sección. Ver
    [Referencias oficiales de la DGII](../reference/dgii-official.md).

## Política de reintentos

Solo se reintentan las fallas **transitorias**:

- errores de red y timeouts
- HTTP `408`, `429`, `5xx`

Un e-CF rechazado (por ejemplo `400`, `401`) **nunca** se reenvía a ciegas.

Cuando una transmisión falla y recurres a contingencia, esto es lo que la rige:
**Fuente oficial:** [Informe Técnico Comprobante Fiscal Electrónico](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Informe%20T%C3%A9cnico%20e-CF%20v1.0.pdf) — §19: operación en contingencia, los plazos que fija para transmitir lo generado sin conexión y los identificadores que marcan un comprobante de reemplazo (v1.0; actualizado en el sitio 2026-10-16) · [Instructivo de Contingencia de Facturación Electrónica](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Instructivo%20de%20Contingencia%20de%20FE.pdf) — el manual operativo para trabajar en contingencia (actualizado en el sitio 2026-10-15).

| Opción                 | Valor por defecto     |
| ---------------------- | --------------------- |
| Intentos máximos       | 3 (4 en TypeScript)   |
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

**Fuente oficial:** [Estándares de Comportamiento Esperado en la Integración con el Sistema](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Estandares%20de%20Comportamiento%20Esperado%20en%20la%20Integracion.pdf) — §5.2–5.3: firmar y guardar el e-CF localmente con su marca de tiempo antes de transmitirlo, y verificar los primeros documentos antes de vaciar la cola (actualizado en el sitio 2026-11-06). El esquema de claves es diseño del SDK.

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
    } else {
      // No se pudo preguntar a la DGII: el marcador sigue intacto — reintenta la
      // conciliación más tarde, nunca el envío.
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
    else:
        ...  # no se pudo preguntar: el marcador sigue intacto — reintenta la conciliación, no el envío
    ```

El marcador se limpia **solo** cuando la DGII responde `No encontrado`. Si la
DGII tiene registro, el marcador se mantiene — es el candado que impide un
segundo envío — y `delivered` te dice que pares.

`canReuseSequence` / `can_reuse_sequence` responde la pregunta siguiente ante un
rechazo: si la secuencia del e-NCF puede volver a usarse. La DGII publica
`secuenciaUtilizada` en la consulta de **resultado por track**, no en la de
existencia, así que la bandera se alcanza por los track ids — y solo un e-CF
general rechazado paga esas dos lecturas: `consultaestado`, luego
`consultatrackids` y luego `consultaresultado` cuando hay exactamente un track
utilizable. Cualquier otro desenlace termina en la primera lectura.

`true` exige los dos hechos de parte de la DGII: `secuenciaUtilizada: false` **y**
`estado: Rechazado`. Todo lo demás — sin registro, un veredicto que no es un
rechazo, varios tracks, una entrada sin `trackId`, una bandera ausente o que no
es booleana — responde `false`. Un campo malformado que no clasifica (`codigo`,
`fechaRecepcion`, `mensajes`) tampoco falla la lectura: esos campos no deciden
nada. Ese es el default conservador, y se mantiene: una bandera ausente se trata
como **no** reutilizable.

`canReuseSequence: false` no significa que la DGII consumió la secuencia;
significa que el SDK no obtuvo una respuesta positiva de reutilización. Una
bandera que **no se pudo leer** tampoco es un `false`: la llamada devuelve `Err`
con el marcador pendiente intacto, así que reintenta la conciliación más tarde
en lugar de reenviar. Y `canReuseSequence: true` siempre llega con
`cleared: false`: vuelve a firmar el mismo e-NCF como documento nuevo, no
reenvíes el que la DGII rechazó.

Un documento rechazado cuesta entonces hasta tres lecturas y puede tardar
minutos: dimensiona el lease de la cola por encima de ≈5 min (TypeScript) /
≈3¾ min (Python), no contra la llamada única que era antes. Un `5xx` o un fallo
de transporte difiere entre los dos SDKs solo en la contabilidad — Python reporta
`HTTP` tras 3 intentos por lectura, TypeScript `HTTP`/`UNKNOWN` tras 4.

**Fuente oficial:** [Descripción Técnica Servicios DGII](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Descripcion%20Tecnica%20Servicios%20DGII.pdf) — _Consulta de estado e-CF_ (el estado `No encontrado`), _Consulta de resultado e-CF_ y _Consulta de Resumen (RFCE)_ (la bandera `secuenciaUtilizada`, indexada por `trackId` o por RNC + e-NCF + código de seguridad) (actualizado en el sitio 2026-05-29).
