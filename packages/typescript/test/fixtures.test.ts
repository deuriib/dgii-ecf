import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

const fixture = (name: string): string =>
  readFileSync(resolve(here, '../../../examples/fixtures', name), 'utf8');

describe('example fixtures', () => {
  it('ACECF carries every field DGII returns', () => {
    const xml = fixture('acecf.xml');

    for (const tag of [
      'DetalleAprobacionComercial',
      'Version',
      'RNCEmisor',
      'eNCF',
      'FechaEmision',
      'MontoTotal',
      'RNCComprador',
      'Estado',
      'FechaHoraAprobacionComercial',
    ]) {
      expect(xml).toContain(`<${tag}>`);
    }
  });

  it('ANECF follows the v1.0 schema', () => {
    const xml = fixture('anecf.xml');

    for (const tag of [
      'Encabezado',
      'RncEmisor',
      'CantidadeNCFAnulados',
      'FechaHoraAnulacioneNCF',
      'DetalleAnulacion',
      'Anulacion',
      'NoLinea',
      'TipoeCF',
      'TablaRangoSecuenciasAnuladaseNCF',
      'Secuencias',
      'SecuenciaeNCFDesde',
      'SecuenciaeNCFHasta',
    ]) {
      expect(xml).toContain(`<${tag}>`);
    }
  });

  it('ANECF does not use the elements the schema does not define', () => {
    const xml = fixture('anecf.xml');

    expect(xml).not.toContain('<RangoNCF>');
    expect(xml).not.toContain('<CantidadNCF>');
  });
});
