import { createHash, randomBytes } from 'node:crypto';
import { extractElementText } from './xml.js';

export const SDK_VERSION = '0.6.1';

export type EcfEventType =
  | 'transmission.started'
  | 'transmission.succeeded'
  | 'transmission.failed'
  | 'attempt'
  | 'idempotency'
  | 'reconcile.completed'
  | 'breaker.changed'
  | 'token.changed'
  | 'certificate.checked';

export interface EcfEvent {
  readonly type: EcfEventType;
  readonly correlationId: string;
  readonly documentHash?: string;
  readonly operation: string;
  readonly resource?: string;
  readonly environment?: string;
  readonly rnc?: string;
  readonly encf?: string;
  readonly attempt?: number;
  readonly maxAttempts?: number;
  readonly durationMs?: number;
  readonly httpStatus?: number;
  readonly errorCode?: string;
  readonly retryable?: boolean;
  readonly idempotency?: 'miss' | 'hit' | 'pending' | 'joined';
  readonly breakerState?: 'closed' | 'open' | 'half_open';
  readonly breakerSince?: number;
  readonly expiresAt?: string;
  readonly timestamp: string;
  readonly sdkVersion: string;
}

export interface DocumentIdentity {
  readonly rnc?: string;
  readonly encf?: string;
  readonly documentHash: string;
}

/**
 * Extract the emitter RNC, e-NCF and SHA-256 document hash from signed XML.
 *
 * Only the emitter RNC is ever extracted; buyer RNCs are never surfaced.
 */
export const documentIdentity = (signedXml: string): DocumentIdentity => {
  const rnc =
    extractElementText(signedXml, 'RNCEmisor') ??
    extractElementText(signedXml, 'RncEmisor');
  const encf =
    extractElementText(signedXml, 'eNCF') ??
    extractElementText(signedXml, 'SecuenciaeNCFDesde') ??
    extractElementText(signedXml, 'RangoNCF');
  const documentHash = createHash('sha256')
    .update(signedXml, 'utf8')
    .digest('hex');
  return {
    ...(rnc !== undefined ? { rnc } : {}),
    ...(encf !== undefined ? { encf } : {}),
    documentHash,
  };
};

export const newCorrelationId = (): string => randomBytes(16).toString('hex');

export const utcTimestamp = (): string => new Date().toISOString();

/**
 * Invoke an optional telemetry callback synchronously, swallowing any error.
 */
export const emitEvent = (
  onEvent: ((event: EcfEvent) => void) | undefined,
  event: EcfEvent,
): void => {
  if (onEvent === undefined) {
    return;
  }
  try {
    onEvent(event);
  } catch {
    // Telemetry must never disrupt SDK control flow.
  }
};
