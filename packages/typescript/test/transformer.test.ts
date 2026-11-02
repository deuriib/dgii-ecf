import { describe, expect, it } from 'vitest';
import { Transformer } from '../src/transformer.js';

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
