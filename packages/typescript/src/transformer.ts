import convert from 'xml-js';
import { err, ok, type Result } from './result.js';
import { DgiiError } from './errors.js';

/**
 * Converts between the DGII XML documents and the "compact" JSON shape used by
 * `xml-js` (a dict key is an element, an array is a repeated element, and
 * `_attributes` / `_text` carry attributes and text).
 */
export class Transformer {
  json2xml(dataObject: object, round = false): Result<string, DgiiError> {
    try {
      const data: Record<string, unknown> = {
        _declaration: { _attributes: { version: '1.0', encoding: 'utf-8' } },
        ...dataObject,
      };

      const xml = convert.js2xml(data as convert.ElementCompact, {
        compact: true,
        ignoreComment: true,
        spaces: 2,
        fullTagEmptyElement: true,
        textFn: (value: string, label: string) => {
          const omits = ['version'];
          if (
            /^\d+\.\d+$/.test(value) &&
            round &&
            !omits.includes(label.toLowerCase())
          ) {
            return parseFloat(value).toFixed(2);
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
