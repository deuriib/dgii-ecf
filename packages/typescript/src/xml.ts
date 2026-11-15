/**
 * Tolerant element-text extraction for signed DGII XML.
 *
 * The SDK never owns the XML it inspects: DGII responses, .NET-produced
 * signatures, and third-party generators all wrap the same element in a
 * namespace prefix and add attributes to it. A literal `<tag>` match misses
 * those variants and silently degrades the caller to a fallback — which on the
 * idempotency path means a duplicate fiscal submission.
 *
 * The scan is hand-rolled and single-pass on purpose. The obvious regex
 * (`<prefix?tag ATTRS>(.*?)</prefix?tag>`) nests a repetition inside a
 * repetition, so a document with a matching open tag and no close tag made the
 * engine backtrack quadratically: 35 KiB took ~9 s and 120 KiB took ~120 s on
 * `sendElectronicDocument`, which is a denial of service on the caller's own
 * input. Every loop below advances an index, so the cost is O(len(xml)).
 */

const NAME_CHAR = /[A-Za-z0-9_.:-]/;

const isSpace = (ch: string | undefined): boolean =>
  ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n';

/** Read an optionally prefixed XML name starting at `start`. */
const readQualifiedName = (
  xml: string,
  start: number,
): { readonly name: string; readonly end: number } => {
  let index = start;
  while (index < xml.length && NAME_CHAR.test(xml[index] as string)) {
    index += 1;
  }
  return { name: xml.slice(start, index), end: index };
};

/** Local part of a qualified name: `ns:eNCF` → `eNCF`. */
const localName = (qualified: string): string => {
  const colon = qualified.lastIndexOf(':');
  return colon === -1 ? qualified : qualified.slice(colon + 1);
};

/**
 * Index just past the `>` that closes an open tag, honouring quoted attribute
 * values (`nota="a > b"`), or `undefined` when the tag is unterminated.
 *
 * Returns `-1` for a self-closing tag so the caller can report the element as
 * absent instead of pairing it with a later element's closing tag.
 */
const skipAttributes = (xml: string, start: number): number | undefined => {
  let index = start;
  while (index < xml.length) {
    const ch = xml[index] as string;
    if (ch === '"' || ch === "'") {
      const close = xml.indexOf(ch, index + 1);
      if (close === -1) {
        return undefined;
      }
      index = close + 1;
      continue;
    }
    if (ch === '>') {
      return xml[index - 1] === '/' ? -1 : index + 1;
    }
    if (ch === '<') {
      return undefined;
    }
    index += 1;
  }
  return undefined;
};

/** Index of the `</tag …>` that closes the element opening before `from`. */
const findClosingTag = (
  xml: string,
  from: number,
  tag: string,
): number | undefined => {
  let index = from;
  for (;;) {
    const open = xml.indexOf('</', index);
    if (open === -1) {
      return undefined;
    }
    const { name, end } = readQualifiedName(xml, open + 2);
    if (localName(name) === tag) {
      let after = end;
      while (after < xml.length && isSpace(xml[after])) {
        after += 1;
      }
      if (xml[after] === '>') {
        return open;
      }
    }
    index = open + 2;
  }
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
  let from = 0;
  for (;;) {
    const open = xml.indexOf('<', from);
    if (open === -1) {
      return undefined;
    }
    const marker = xml[open + 1];
    if (marker === undefined) {
      return undefined;
    }
    // Declarations, comments, CDATA and closing tags are never an open tag.
    if (marker === '?' || marker === '!' || marker === '/') {
      from = open + 1;
      continue;
    }
    const { name, end } = readQualifiedName(xml, open + 1);
    if (name === '') {
      from = open + 1;
      continue;
    }
    if (localName(name) !== tag) {
      from = end;
      continue;
    }
    const contentStart = skipAttributes(xml, end);
    if (contentStart === undefined) {
      from = end;
      continue;
    }
    if (contentStart === -1) {
      return undefined; // `<tag/>`: the element carries no text.
    }
    const contentEnd = findClosingTag(xml, contentStart, tag);
    if (contentEnd === undefined) {
      return undefined;
    }
    const text = xml.slice(contentStart, contentEnd).trim();
    return text === '' ? undefined : text;
  }
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
