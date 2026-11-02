import type { InquiryStatusResponse } from './types.js';

/** Message returned when a submission with the same key is already in flight. */
export const PENDING_SUBMISSION_MESSAGE =
  'A submission with this key is already pending; call reconcileSubmission() before retrying';

/** Outcome of reconciling a pending submission against DGII. */
export interface ReconciliationResult {
  /** DGII's answer for the e-NCF. */
  inquiry: InquiryStatusResponse;
  /** `true` when DGII already has a record of the document. */
  delivered: boolean;
  /** `true` when the e-NCF sequence may be reused. */
  canReuseSequence: boolean;
  /** `true` when the pending marker was cleared and a retry is safe. */
  cleared: boolean;
}

/**
 * Whether a rejected e-NCF sequence may be reused.
 *
 * DGII sets `secuenciaUtilizada` to `true` when the sequence is consumed and
 * `false` when the rejection leaves it reusable: invalid certificate or
 * signature, invalid XML, non-delegated signer, unauthorized or expired e-NCF,
 * non-electronic issuer, unknown or inactive RNC.
 *
 * An absent flag is treated as "not reusable" — the conservative answer.
 */
export const canReuseSequence = (response: {
  secuenciaUtilizada?: boolean | null;
}): boolean => response.secuenciaUtilizada === false;
