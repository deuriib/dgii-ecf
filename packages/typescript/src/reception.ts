import { Endpoint } from './environment.js';
import { DgiiError } from './errors.js';
import { err, ok, type Result } from './result.js';
import { extractElementText, extractRootElementName } from './xml.js';

/** Every e-CF type code defined by DGII. */
export const ECF_TYPE_CODES = [
  '31',
  '32',
  '33',
  '34',
  '41',
  '43',
  '44',
  '45',
  '46',
  '47',
] as const;

export type EcfTypeCode = (typeof ECF_TYPE_CODES)[number];

/**
 * Consumption invoices (E32) at or above this amount go to the general
 * reception endpoint; below it they must be sent as an RFCE summary.
 */
export const CONSUMPTION_SUMMARY_THRESHOLD = '250000';

/** The consumption-invoice type code. */
const CONSUMPTION_TYPE: EcfTypeCode = '32';

export interface GeneralReceptionRoute {
  readonly kind: 'general';
  readonly endpoint: Endpoint.SendInvoice;
}

export interface SummaryReceptionRoute {
  readonly kind: 'summary';
  readonly endpoint: Endpoint.SendSummary;
}

export type ReceptionRoute = GeneralReceptionRoute | SummaryReceptionRoute;

const GENERAL: GeneralReceptionRoute = {
  kind: 'general',
  endpoint: Endpoint.SendInvoice,
};

const SUMMARY: SummaryReceptionRoute = {
  kind: 'summary',
  endpoint: Endpoint.SendSummary,
};

export const isEcfTypeCode = (value: string): value is EcfTypeCode =>
  (ECF_TYPE_CODES as readonly string[]).includes(value);

const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

/**
 * Compare two non-negative decimal strings without going through `number`, so
 * a money amount never picks up binary floating-point error.
 *
 * Returns a negative number when `a < b`, zero when equal, positive otherwise.
 */
export const compareDecimal = (a: string, b: string): number => {
  const [aInt = '', aFrac = ''] = a.split('.');
  const [bInt = '', bFrac = ''] = b.split('.');
  const aWhole = aInt.replace(/^0+(?=\d)/, '');
  const bWhole = bInt.replace(/^0+(?=\d)/, '');

  if (aWhole.length !== bWhole.length) {
    return aWhole.length - bWhole.length;
  }
  if (aWhole !== bWhole) {
    return aWhole < bWhole ? -1 : 1;
  }

  const width = Math.max(aFrac.length, bFrac.length);
  const aPadded = aFrac.padEnd(width, '0');
  const bPadded = bFrac.padEnd(width, '0');
  if (aPadded === bPadded) {
    return 0;
  }
  return aPadded < bPadded ? -1 : 1;
};

const validationError = (message: string): DgiiError =>
  new DgiiError(message, { code: 'VALIDATION' });

/**
 * Decide which DGII reception endpoint a signed document belongs to.
 *
 * - `<RFCE>` → the consumption-summary reception (`recepcionfc`).
 * - `<ECF>` with any type other than E32 → the general reception.
 * - `<ECF>` type E32 at or above RD$250,000 → the general reception.
 * - `<ECF>` type E32 below RD$250,000 → rejected: DGII only accepts the
 *   summary form for those, so the caller must run `convertECF32ToRFCE` first.
 *
 * The decision reads `TipoeCF` and `MontoTotal` from the signed document, so it
 * cannot drift from what is actually being transmitted.
 */
export const resolveReceptionRoute = (
  signedXml: string,
): Result<ReceptionRoute, DgiiError> => {
  const root = extractRootElementName(signedXml);
  if (root === 'RFCE') {
    return ok(SUMMARY);
  }
  if (root !== 'ECF') {
    return err(
      validationError(
        `Unsupported document root "${root ?? 'unknown'}"; expected "ECF" or "RFCE"`,
      ),
    );
  }

  const tipo = extractElementText(signedXml, 'TipoeCF');
  if (tipo === undefined) {
    return err(validationError('TipoeCF is missing from the document'));
  }
  if (!isEcfTypeCode(tipo)) {
    return err(validationError(`Unknown TipoeCF "${tipo}"`));
  }
  if (tipo !== CONSUMPTION_TYPE) {
    return ok(GENERAL);
  }

  const total = extractElementText(signedXml, 'MontoTotal');
  if (total === undefined) {
    return err(
      validationError(
        'MontoTotal is required to route an E32 consumption invoice',
      ),
    );
  }
  if (!DECIMAL_PATTERN.test(total)) {
    return err(
      validationError(`MontoTotal "${total}" is not a decimal amount`),
    );
  }

  return compareDecimal(total, CONSUMPTION_SUMMARY_THRESHOLD) < 0
    ? err(
        validationError(
          'An E32 below RD$250,000 must be sent as an RFCE summary; convert it with convertECF32ToRFCE first',
        ),
      )
    : ok(GENERAL);
};

/** Type codes DGII excludes from the direct Emisor↔Receptor flow. */
const B2B_EXCLUDED_TYPES: readonly EcfTypeCode[] = [
  '41',
  '43',
  '45',
  '46',
  '47',
];

/**
 * Whether a signed document may be delivered directly to a buyer host.
 *
 * DGII excludes E32 below RD$250,000 (only the RFCE summary applies) plus
 * E41, E43, E45, E46 and E47. E31, E33, E34, E44 and an E32 at or above the
 * threshold can go peer-to-peer.
 */
export const checkB2BApplicability = (
  signedXml: string,
): Result<void, DgiiError> => {
  const root = extractRootElementName(signedXml);
  if (root === 'RFCE') {
    return err(
      validationError(
        'An RFCE summary cannot be delivered directly to a buyer host',
      ),
    );
  }
  if (root !== 'ECF') {
    return err(
      validationError(
        `Unsupported document root "${root ?? 'unknown'}"; expected "ECF"`,
      ),
    );
  }

  const tipo = extractElementText(signedXml, 'TipoeCF');
  if (tipo === undefined) {
    return err(validationError('TipoeCF is missing from the document'));
  }
  if (!isEcfTypeCode(tipo)) {
    return err(validationError(`Unknown TipoeCF "${tipo}"`));
  }
  if (B2B_EXCLUDED_TYPES.includes(tipo)) {
    return err(
      validationError(
        `An e-CF of type ${tipo} cannot be delivered directly to a buyer host`,
      ),
    );
  }
  if (tipo !== CONSUMPTION_TYPE) {
    return ok(undefined);
  }

  const total = extractElementText(signedXml, 'MontoTotal');
  if (total === undefined) {
    return err(
      validationError(
        'MontoTotal is required to check B2B applicability of an E32',
      ),
    );
  }
  if (!DECIMAL_PATTERN.test(total)) {
    return err(
      validationError(`MontoTotal "${total}" is not a decimal amount`),
    );
  }
  if (compareDecimal(total, CONSUMPTION_SUMMARY_THRESHOLD) < 0) {
    return err(
      validationError(
        'An E32 below RD$250,000 cannot be delivered directly to a buyer host; send the RFCE summary to DGII instead',
      ),
    );
  }
  return ok(undefined);
};
