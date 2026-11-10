import type {
  InquiryInvoiceSummary,
  InquiryStatusResponse,
  TrackingStatusResponse,
} from './types.js';

/** Message returned when a submission with the same key is already in flight. */
export const PENDING_SUBMISSION_MESSAGE =
  'A submission with this key is already pending; call reconcileSubmission() before retrying';

/** Outcome of reconciling a pending submission against DGII. */
export interface ReconciliationResult {
  /** DGII's answer for the e-NCF. */
  inquiry: InquiryStatusResponse;
  /** `true` when DGII already has a record of the document. */
  delivered: boolean;
  /**
   * `true` only when DGII positively said the sequence may be reused — see
   * {@link canReuseSequence}.
   *
   * `false` means _the SDK did not obtain a positive reusable answer_, not that
   * DGII consumed the sequence: the root element is not a general e-CF, DGII
   * holds no record, the verdict is not `Rechazado`, the listing yielded other
   * than exactly one followable track, or the per-track flag did not say
   * reusable. A flag read that could not be completed is an `Err`, never a
   * `false`.
   */
  canReuseSequence: boolean;
  /** `true` when the pending marker was cleared and a retry is safe. */
  cleared: boolean;
}

/**
 * Whether DGII says the sequence behind a rejected e-NCF may be reused.
 *
 * DGII publishes `secuenciaUtilizada` on the track-result consult
 * (`consultaresultado`) and on an RFCE summary inquiry (`consultarfce`), never
 * on `consultaestado` — that response carries no such element, which is why
 * this takes a {@link TrackingStatusResponse} or an {@link InquiryInvoiceSummary}
 * and rejects an {@link InquiryStatusResponse} at compile time.
 *
 * `true` requires both facts DGII states for a reusable rejection:
 * `secuenciaUtilizada === false` (the sequence may be reused) **and**
 * `estado === 'Rechazado'` (DGII scopes the flag itself to a rejection).
 *
 * Reuse target follows the service: a `TrackingStatusResponse` is the general
 * e-CF track result, so it licenses another general e-CF; an
 * `InquiryInvoiceSummary` is an RFCE summary, so it licenses another _Resumen
 * de Factura de Consumo_, never another general e-CF.
 *
 * Total by design: it returns a value for every input the models admit and
 * never throws. A flag other than the literal `false` — absent, `null`, or a
 * coerced-looking `"false"`/`0` — answers `false`, because `true` requires
 * DGII's own evidence. An `estado` that is absent, `null` or **not a string**
 * also answers `false` instead of throwing: the body arrives as an unchecked
 * cast, so a number or an object can reach this function, and a thrown
 * `TypeError` is not the same observable behaviour as a returned `false`.
 * `estado` is compared after trimming only, against DGII's own spelling
 * `Rechazado`; there is no case folding, and `No encontrado` is never compared
 * here (that is the existence rule, and it stays raw).
 */
export const canReuseSequence = (
  response: TrackingStatusResponse | InquiryInvoiceSummary,
): boolean => {
  // Widened on purpose: the decoded body is an unchecked cast, so `estado` can
  // be absent — or carry any JSON type — at runtime even though the response
  // type declares a string.
  const estado: unknown = response.estado;
  return (
    response.secuenciaUtilizada === false &&
    (typeof estado === 'string' ? estado.trim() : '') === 'Rechazado'
  );
};
