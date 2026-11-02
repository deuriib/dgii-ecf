import convert from 'xml-js';
import { err, ok, type Result } from './result.js';
import { DgiiError } from './errors.js';

const MONETARY_RE = /^(-?)(\d+)\.(\d+)$/;

/** Increment a string of decimal digits ("267" -> "268", "999" -> "1000"). */
const incrementDigits = (digits: string): string => {
  const chars = digits.split('');
  let index = chars.length - 1;
  while (index >= 0) {
    const current = chars[index];
    if (current === '9') {
      chars[index] = '0';
      index -= 1;
      continue;
    }
    chars[index] = String(Number(current) + 1);
    return chars.join('');
  }
  return `1${chars.join('')}`;
};

/**
 * Round a decimal string to 2 places with ROUND_HALF_UP semantics.
 *
 * `Number.prototype.toFixed` cannot be used: `(2.675).toFixed(2)` is `'2.67'`
 * because the literal is not representable in binary floating point. DGII
 * expects the decimal, half-up result (`'2.68'`) — the same contract as the
 * Python SDK's `Decimal.quantize(..., rounding=ROUND_HALF_UP)`.
 *
 * Values that are not plain decimals (e.g. `1.0e3`) are returned unchanged.
 */
export const roundHalfUpToCents = (value: string): string => {
  const match = MONETARY_RE.exec(value);
  if (!match) {
    return value;
  }
  const sign = match[1] === '-' ? '-' : '';
  const integerPart = (match[2] ?? '0').replace(/^0+(?=\d)/, '');
  const fractionPart = `${match[3] ?? ''}000`;
  const cents = `${integerPart}${fractionPart.slice(0, 2)}`;
  const rounded = fractionPart[2] >= '5' ? incrementDigits(cents) : cents;
  const padded = rounded.padStart(3, '0');
  return `${sign}${padded.slice(0, -2)}.${padded.slice(-2)}`;
};

const isEmptyObject = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value as Record<string, unknown>).length === 0;

/**
 * Drop empty leaves and the containers they leave behind.
 *
 * DGII forbids empty tags: any element without a value must be omitted
 * entirely instead of being serialized as `<Tag/>` or `<Tag></Tag>`. An object
 * that only carries `_attributes` is *not* empty — it still renders an element.
 */
export const pruneEmptyValues = (input: unknown): unknown => {
  if (input === null || input === undefined || input === '') {
    return undefined;
  }
  if (Array.isArray(input)) {
    const filtered = input
      .map(pruneEmptyValues)
      .filter(
        (item) =>
          item !== null &&
          item !== undefined &&
          item !== '' &&
          !isEmptyObject(item),
      );
    return filtered.length ? filtered : undefined;
  }
  if (typeof input === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      input as Record<string, unknown>,
    )) {
      const cleaned = pruneEmptyValues(value);
      if (cleaned !== undefined && cleaned !== '' && !isEmptyObject(cleaned)) {
        output[key] = cleaned;
      }
    }
    return Object.keys(output).length ? output : undefined;
  }
  return input;
};

/**
 * Converts between the DGII XML documents and the "compact" JSON shape used by
 * `xml-js` (a dict key is an element, an array is a repeated element, and
 * `_attributes` / `_text` carry attributes and text).
 */
export class Transformer {
  json2xml(dataObject: object, round = false): Result<string, DgiiError> {
    try {
      const pruned = pruneEmptyValues(dataObject);
      const data: Record<string, unknown> = {
        _declaration: { _attributes: { version: '1.0', encoding: 'utf-8' } },
        ...(pruned !== null &&
        pruned !== undefined &&
        typeof pruned === 'object' &&
        !Array.isArray(pruned)
          ? (pruned as Record<string, unknown>)
          : {}),
      };

      const xml = convert.js2xml(data as convert.ElementCompact, {
        compact: true,
        ignoreComment: true,
        spaces: 2,
        textFn: (value: string, label: string) => {
          if (round && label.toLowerCase() !== 'version') {
            return roundHalfUpToCents(value);
          }
          return value;
        },
      });

      return ok(xml);
    } catch (error) {
      return err(
        new DgiiError(
          `Error converting JSON to XML: ${error instanceof Error ? error.message : String(error)}`,
          { code: 'INVALID_XML', cause: error },
        ),
      );
    }
  }

  xml2json<T>(xml: string): Result<T, DgiiError> {
    try {
      const json = convert.xml2js(xml, {
        compact: true,
        ignoreComment: true,
        nativeType: false,
      });
      return ok(json as T);
    } catch (error) {
      return err(
        new DgiiError(
          `Error converting XML to JSON: ${error instanceof Error ? error.message : String(error)}`,
          { code: 'INVALID_XML', cause: error },
        ),
      );
    }
  }
}
