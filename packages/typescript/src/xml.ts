/**
 * Tolerant element-text extraction for signed DGII XML.
 *
 * The SDK never owns the XML it inspects: DGII responses, .NET-produced
 * signatures, and third-party generators all wrap the same element in a
 * namespace prefix and add attributes to it. A literal `<tag>` match misses
 * those variants and silently degrades the caller to a fallback — which on the
 * idempotency path means a duplicate fiscal submission.
 */

const PATTERN_CACHE = new Map<string, RegExp>();

/**
 * Attribute spans may contain `>` inside quotes (`nota="a > b"`), so both
 * quoted forms get their own alternative instead of a blanket `[^>]*`.
 */
const ATTRIBUTE_SPAN = `(?:[^>"']|"[^"]*"|'[^']*')*`;

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const elementPattern = (tag: string): RegExp => {
  const cached = PATTERN_CACHE.get(tag);
  if (cached !== undefined) {
    return cached;
  }
  const name = escapeRegExp(tag);
  const prefix = '(?:[\\w.-]+:)?';
  const pattern = new RegExp(
    `<${prefix}${name}${ATTRIBUTE_SPAN}>([\\s\\S]*?)<\\/${prefix}${name}\\s*>`,
  );
  PATTERN_CACHE.set(tag, pattern);
  return pattern;
};

/**
 * Text content of the first `<tag>` element, tolerating a namespace prefix
 * (`ns:eNCF`) and attributes (`<eNCF version="1.0">`).
 *
 * Returns `undefined` when the element is absent, self-closing, or blank, so
 * callers fall back deliberately instead of building a key out of an empty
 * segment. Matching is case-sensitive, as XML element names are.
 */
export const extractElementText = (
  xml: string,
  tag: string,
): string | undefined => {
  const match = elementPattern(tag).exec(xml);
  const text = match?.[1]?.trim();
  return text === undefined || text === '' ? undefined : text;
};

const ROOT_PATTERN = /<\s*(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)[\s/>]/;

/**
 * Local name of the document's root element, ignoring the XML declaration and
 * any leading comments. Returns `undefined` when no element is present.
 *
 * DGII routing depends on the root: `<ECF>` goes to the general reception and
 * `<RFCE>` to the consumption-summary reception.
 */
export const extractRootElementName = (xml: string): string | undefined => {
  const stripped = xml
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trimStart();
  return ROOT_PATTERN.exec(stripped)?.[1];
};
