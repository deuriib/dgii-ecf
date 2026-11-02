import { describe, expect, it } from 'vitest';
import { Endpoint } from '../src/environment.js';
import {
  CONSUMPTION_SUMMARY_THRESHOLD,
  compareDecimal,
  isEcfTypeCode,
  resolveReceptionRoute,
} from '../src/reception.js';
import { extractRootElementName } from '../src/xml.js';

const ecf = (tipo: string, total?: string): string =>
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<ECF xmlns="http://dgii.gov.do/ecf"><Encabezado><IdDoc>' +
  `<TipoeCF>${tipo}</TipoeCF>` +
  '</IdDoc>' +
  (total === undefined
    ? ''
    : `<Totales><MontoTotal>${total}</MontoTotal></Totales>`) +
  '</Encabezado></ECF>';

const rfce = (): string =>
  '<?xml version="1.0" encoding="utf-8"?><RFCE><Encabezado>' +
  '<IdDoc><TipoeCF>32</TipoeCF></IdDoc></Encabezado></RFCE>';

describe('extractRootElementName', () => {
  it('skips the XML declaration and leading comments', () => {
    const xml =
      '<?xml version="1.0" encoding="utf-8"?>\n<!-- generated -->\n<ECF>' +
      '<Encabezado/></ECF>';
    expect(extractRootElementName(xml)).toBe('ECF');
  });

  it('returns the local name for a namespaced root', () => {
    expect(extractRootElementName('<ds:Signature></ds:Signature>')).toBe(
      'Signature',
    );
  });

  it('returns undefined when there is no element', () => {
    expect(extractRootElementName('not xml at all')).toBeUndefined();
  });
});

describe('compareDecimal', () => {
  it('compares without floating point', () => {
    expect(compareDecimal('249999.99', '250000')).toBeLessThan(0);
    expect(compareDecimal('250000', '250000.00')).toBe(0);
    expect(compareDecimal('250000.01', '250000')).toBeGreaterThan(0);
    expect(compareDecimal('999999999999.99', '250000')).toBeGreaterThan(0);
    expect(compareDecimal('0250000', '250000')).toBe(0);
  });
});

describe('isEcfTypeCode', () => {
  it('accepts the ten documented codes and nothing else', () => {
    for (const code of [
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
    ]) {
      expect(isEcfTypeCode(code)).toBe(true);
    }
    expect(isEcfTypeCode('30')).toBe(false);
    expect(isEcfTypeCode('E31')).toBe(false);
  });
});

describe('resolveReceptionRoute', () => {
  it('routes an RFCE to the consumption summary endpoint', () => {
    const route = resolveReceptionRoute(rfce());
    expect(route.isOk()).toBe(true);
    if (route.isErr()) return;
    expect(route.value.kind).toBe('summary');
    expect(route.value.endpoint).toBe(Endpoint.SendSummary);
  });

  it('routes a non-consumption e-CF to the general endpoint', () => {
    const route = resolveReceptionRoute(ecf('31', '1000.00'));
    expect(route.isOk()).toBe(true);
    if (route.isErr()) return;
    expect(route.value.kind).toBe('general');
    expect(route.value.endpoint).toBe(Endpoint.SendInvoice);
  });

  it('routes an E32 at the threshold to the general endpoint', () => {
    const route = resolveReceptionRoute(
      ecf('32', CONSUMPTION_SUMMARY_THRESHOLD),
    );
    expect(route.isOk()).toBe(true);
    if (route.isErr()) return;
    expect(route.value.kind).toBe('general');
  });

  it('routes an E32 above the threshold to the general endpoint', () => {
    const route = resolveReceptionRoute(ecf('32', '250000.01'));
    expect(route.isOk()).toBe(true);
    if (route.isErr()) return;
    expect(route.value.kind).toBe('general');
  });

  it('rejects an E32 below the threshold instead of misrouting it', () => {
    const route = resolveReceptionRoute(ecf('32', '249999.99'));
    expect(route.isErr()).toBe(true);
    if (route.isOk()) return;
    expect(route.error.code).toBe('VALIDATION');
    expect(route.error.message).toContain('RFCE summary');
  });

  it('rejects an unknown root', () => {
    const route = resolveReceptionRoute('<Invoice><x/></Invoice>');
    expect(route.isErr()).toBe(true);
    if (route.isOk()) return;
    expect(route.error.code).toBe('VALIDATION');
  });

  it('rejects an unknown TipoeCF', () => {
    const route = resolveReceptionRoute(ecf('30', '100'));
    expect(route.isErr()).toBe(true);
    if (route.isOk()) return;
    expect(route.error.message).toContain('Unknown TipoeCF');
  });

  it('rejects an E32 without MontoTotal', () => {
    const route = resolveReceptionRoute(ecf('32'));
    expect(route.isErr()).toBe(true);
    if (route.isOk()) return;
    expect(route.error.message).toContain('MontoTotal');
  });

  it('rejects a non-decimal MontoTotal', () => {
    const route = resolveReceptionRoute(ecf('32', '250,000'));
    expect(route.isErr()).toBe(true);
    if (route.isOk()) return;
    expect(route.error.message).toContain('decimal');
  });
});
