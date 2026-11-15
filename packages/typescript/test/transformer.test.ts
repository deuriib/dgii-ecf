import { describe, expect, it } from 'vitest';
import { Transformer } from '../src/transformer.js';
import type { EcfInvoice } from '../src/ecf.js';

interface RoundTrip {
  ECF: {
    Encabezado: { Version: { _text: string }; MontoTotal: { _text: string } };
  };
}

describe('Transformer', () => {
  it('serializes compact JSON to XML with an XML declaration', () => {
    const transformer = new Transformer();
    const result = transformer.json2xml({
      ECF: { Encabezado: { Version: { _text: '1.0' } } },
    });
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toContain('<?xml');
    expect(result.value).toContain('<Version>1.0</Version>');
  });

  it.each([
    ['2.675', '2.68'],
    // ROUND_HALF_EVEN would give 2.66 here; DGII expects half-up.
    ['2.665', '2.67'],
    ['1.005', '1.01'],
    ['0.005', '0.01'],
    ['1.004', '1.00'],
    ['100.5', '100.50'],
    ['9.999', '10.00'],
    ['-2.675', '-2.68'],
    ['1234.567', '1234.57'],
  ])('rounds %s to %s with ROUND_HALF_UP', (raw, expected) => {
    const result = new Transformer().json2xml(
      { ECF: { Encabezado: { MontoTotal: { _text: raw } } } },
      true,
    );
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toContain(`<MontoTotal>${expected}</MontoTotal>`);
  });

  it('never rounds Version or non-monetary text', () => {
    const result = new Transformer().json2xml(
      {
        ECF: {
          Encabezado: {
            Version: { _text: '1.0' },
            RNCEmisor: { _text: '130862346' },
          },
        },
      },
      true,
    );
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toContain('<Version>1.0</Version>');
    expect(result.value).toContain('<RNCEmisor>130862346</RNCEmisor>');
  });

  it('round-trips XML back to compact JSON', () => {
    const transformer = new Transformer();
    const parsed = transformer.xml2json<RoundTrip>(
      '<?xml version="1.0" encoding="utf-8"?><ECF><Encabezado><Version>1.0</Version><MontoTotal>100.50</MontoTotal></Encabezado></ECF>',
    );
    expect(parsed.isOk()).toBe(true);
    if (parsed.isErr()) return;
    expect(parsed.value.ECF.Encabezado.Version._text).toBe('1.0');
    expect(parsed.value.ECF.Encabezado.MontoTotal._text).toBe('100.50');
  });
});

describe('Transformer empty-tag pruning', () => {
  const build = (payload: unknown): string => {
    const result = new Transformer().json2xml(payload as object);
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return '';
    return result.value;
  };

  it.each([
    ['empty string', ''],
    ['null', null],
    ['undefined', undefined],
    ['empty array', []],
    ['empty object', {}],
  ])('omits an element with an %s value', (_label, empty) => {
    const xml = build({
      ECF: { Encabezado: { Version: '1.0', MontoExento: empty } },
    });

    expect(xml).not.toContain('MontoExento');
    expect(xml).not.toContain('<MontoExento/>');
    expect(xml).not.toContain('<MontoExento></MontoExento>');
  });

  it('omits an element whose only content is an empty _text', () => {
    const xml = build({
      ECF: { Encabezado: { Version: '1.0', MontoExento: { _text: '' } } },
    });

    expect(xml).not.toContain('MontoExento');
    expect(xml).toContain('<Version>1.0</Version>');
  });

  it('keeps an element that only carries attributes', () => {
    const xml = build({
      ECF: {
        Signature: {
          _attributes: { xmlns: 'http://www.w3.org/2000/09/xmldsig#' },
        },
      },
    });

    expect(xml).toContain('<Signature xmlns=');
  });

  it('keeps a zero value', () => {
    const xml = build({ ECF: { Totales: { MontoExento: 0 } } });

    expect(xml).toContain('<MontoExento>0</MontoExento>');
  });

  it('drops empty items from a repeated element', () => {
    const xml = build({
      ECF: { DetallesItems: { Item: ['', { NombreItem: 'A' }] } },
    });

    expect(xml).not.toContain('<Item/>');
    expect(xml).toContain('<NombreItem>A</NombreItem>');
  });
});

describe('Transformer static invocation', () => {
  it('converts JSON object to XML via static Transformer.json2xml', () => {
    const result = Transformer.json2xml({
      ECF: { Encabezado: { Version: { _text: '1.0' } } },
    });
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toContain('<Version>1.0</Version>');
  });

  it('converts XML to JSON via static Transformer.xml2json', () => {
    const result = Transformer.xml2json<RoundTrip>(
      '<?xml version="1.0" encoding="utf-8"?><ECF><Encabezado><Version>1.0</Version><MontoTotal>100.50</MontoTotal></Encabezado></ECF>',
    );
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.ECF.Encabezado.Version._text).toBe('1.0');
    expect(result.value.ECF.Encabezado.MontoTotal._text).toBe('100.50');
  });
});

describe('Transformer parity aliases', () => {
  const payload = { ECF: { Encabezado: { Version: { _text: '1.0' } } } };
  const xml =
    '<?xml version="1.0" encoding="utf-8"?><ECF><Encabezado><Version>1.0</Version><MontoTotal>100.50</MontoTotal></Encabezado></ECF>';

  it('provides static aliases identical to json2xml and xml2json', () => {
    expect(Transformer.json_to_xml).toBe(Transformer.json2xml);
    expect(Transformer.jsonToXml).toBe(Transformer.json2xml);
    expect(Transformer.xml_to_json).toBe(Transformer.xml2json);
    expect(Transformer.xmlToJson).toBe(Transformer.xml2json);

    const res1 = Transformer.json_to_xml(payload);
    const res2 = Transformer.jsonToXml(payload);
    expect(res1.isOk()).toBe(true);
    expect(res2.isOk()).toBe(true);
    if (res1.isErr() || res2.isErr()) return;
    expect(res1.value).toContain('<Version>1.0</Version>');
    expect(res2.value).toContain('<Version>1.0</Version>');

    const parsed1 = Transformer.xml_to_json<RoundTrip>(xml);
    const parsed2 = Transformer.xmlToJson<RoundTrip>(xml);
    expect(parsed1.isOk()).toBe(true);
    expect(parsed2.isOk()).toBe(true);
  });

  it('provides instance aliases identical to json2xml and xml2json', () => {
    const transformer = new Transformer();
    expect(transformer.json_to_xml).toBe(transformer.json2xml);
    expect(transformer.jsonToXml).toBe(transformer.json2xml);
    expect(transformer.xml_to_json).toBe(transformer.xml2json);
    expect(transformer.xmlToJson).toBe(transformer.xml2json);

    const res1 = transformer.json_to_xml(payload);
    const res2 = transformer.jsonToXml(payload);
    expect(res1.isOk()).toBe(true);
    expect(res2.isOk()).toBe(true);
    if (res1.isErr() || res2.isErr()) return;
    expect(res1.value).toContain('<Version>1.0</Version>');
    expect(res2.value).toContain('<Version>1.0</Version>');

    const parsed1 = transformer.xml_to_json<RoundTrip>(xml);
    const parsed2 = transformer.xmlToJson<RoundTrip>(xml);
    expect(parsed1.isOk()).toBe(true);
    expect(parsed2.isOk()).toBe(true);
  });
});

describe('Transformer raw JSON string input', () => {
  it('serializes a valid raw JSON string to XML', () => {
    const raw = JSON.stringify({
      ECF: { Encabezado: { Version: { _text: '1.0' } } },
    });
    const result = Transformer.json2xml(raw);
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toContain('<?xml');
    expect(result.value).toContain('<Version>1.0</Version>');
  });

  it('rounds monetary values when converting a raw JSON string', () => {
    const raw = JSON.stringify({
      ECF: {
        Encabezado: {
          Version: { _text: '1.0' },
          MontoTotal: { _text: '2.675' },
        },
      },
    });
    const result = Transformer.json2xml(raw, true);
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toContain('<Version>1.0</Version>');
    expect(result.value).toContain('<MontoTotal>2.68</MontoTotal>');
  });

  it('works with instance methods when given a raw JSON string', () => {
    const raw = '{"ECF":{"Encabezado":{"Version":{"_text":"1.0"}}}}';
    const result = new Transformer().json2xml(raw);
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toContain('<Version>1.0</Version>');
  });
});

describe('Transformer error handling', () => {
  it('returns INVALID_XML error on malformed JSON string syntax', () => {
    const result = Transformer.json2xml('{invalid: json');
    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('INVALID_XML');
    expect(result.error.message).toContain('Error converting JSON to XML:');
    expect(result.error.cause).toBeDefined();
  });

  it.each([
    ['primitive number', '123'],
    ['primitive boolean', 'true'],
    ['primitive string', '"hello world"'],
    ['null literal', 'null'],
    ['array root', '[1, 2, 3]'],
    ['array of objects', '[{"a": 1}]'],
  ])('returns INVALID_XML error when root is %s', (_label, input) => {
    const result = Transformer.json2xml(input);
    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('INVALID_XML');
    expect(result.error.message).toBe(
      'Error converting JSON to XML: Expected an object as root',
    );
  });

  it('returns INVALID_XML error when passed non-object at runtime', () => {
    const nullResult = Transformer.json2xml(null as unknown as object);
    expect(nullResult.isErr()).toBe(true);
    if (nullResult.isOk()) return;
    expect(nullResult.error.code).toBe('INVALID_XML');
    expect(nullResult.error.message).toBe(
      'Error converting JSON to XML: Expected an object as root',
    );

    const arrayResult = Transformer.json2xml([] as unknown as object);
    expect(arrayResult.isErr()).toBe(true);
    if (arrayResult.isOk()) return;
    expect(arrayResult.error.code).toBe('INVALID_XML');
    expect(arrayResult.error.message).toBe(
      'Error converting JSON to XML: Expected an object as root',
    );
  });

  it('returns INVALID_XML error when xml2json encounters invalid XML', () => {
    const result = Transformer.xml2json('<<invalid>>');
    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('INVALID_XML');
    expect(result.error.message).toContain('Error converting XML to JSON:');
  });

  it('serializes a strongly-typed EcfInvoice object', () => {
    const invoice: EcfInvoice = {
      ECF: {
        Encabezado: {
          Version: '1.0',
          IdDoc: {
            TipoeCF: '31',
            eNCF: 'E310000000001',
            TipoIngresos: '01',
            TipoPago: '1',
            TablaFormasPago: {
              FormaDePago: {
                FormaPago: '1',
                MontoPago: '1180.00',
              },
            },
          },
          Emisor: {
            RNCEmisor: '130862346',
            RazonSocialEmisor: 'Example SRL',
            DireccionEmisor: 'Av. Example 123',
            FechaEmision: '01-01-2026',
          },
          Comprador: {
            RNCComprador: '40102368',
            RazonSocialComprador: 'Buyer SA',
          },
          Totales: {
            MontoGravadoTotal: '1000.00',
            TotalITBIS: '180.00',
            MontoTotal: '1180.00',
          },
        },
        DetallesItems: {
          Item: [
            {
              NumeroLinea: 1,
              IndicadorFacturacion: 1,
              NombreItem: 'Consulting services',
              IndicadorBienoServicio: 2,
              CantidadItem: '1.00',
              PrecioUnitarioItem: '1000.00',
              MontoItem: '1000.00',
            },
          ],
        },
      },
    };

    const result = Transformer.json2xml(invoice);
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toContain('<TipoeCF>31</TipoeCF>');
    expect(result.value).toContain('<eNCF>E310000000001</eNCF>');
    expect(result.value).toContain('<RNCEmisor>130862346</RNCEmisor>');
    expect(result.value).toContain(
      '<NombreItem>Consulting services</NombreItem>',
    );

    const parsed = Transformer.xml2json(result.value);
    expect(parsed.isOk()).toBe(true);
    if (parsed.isErr()) return;
    const rnc = parsed.value.ECF.Encabezado.Emisor.RNCEmisor;
    const rncText = typeof rnc === 'object' && rnc !== null ? rnc._text : rnc;
    expect(rncText).toBe('130862346');
  });
});
