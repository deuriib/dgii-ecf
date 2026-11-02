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

  it('rounds monetary values to 2 decimals when requested', () => {
    const transformer = new Transformer();
    const result = transformer.json2xml(
      {
        ECF: {
          Encabezado: {
            Version: { _text: '1.0' },
            MontoTotal: { _text: '100.5' },
          },
        },
      },
      true,
    );
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toContain('<Version>1.0</Version>');
    expect(result.value).toContain('<MontoTotal>100.50</MontoTotal>');
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
