import { describe, expect, it } from 'vitest';
import {
  convertECF32ToRFCE,
  generateEcfQRCodeURL,
  generateFcQRCodeURL,
  getCodeSixDigitfromSignature,
  getCurrentFormattedDate,
  getCurrentFormattedDateTime,
  getXmlFromBodyResponse,
} from '../src/utils.js';
import { Environment } from '../src/environment.js';

describe('getCodeSixDigitfromSignature', () => {
  it('returns the first six characters of SignatureValue', () => {
    const xml =
      '<ECF><Signature><SignatureValue>abcdef123456</SignatureValue></Signature></ECF>';
    const result = getCodeSixDigitfromSignature(xml);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBe('abcdef');
  });

  it('fails when SignatureValue is missing', () => {
    expect(getCodeSixDigitfromSignature('<ECF></ECF>').isErr()).toBe(true);
  });
});

describe('QR code URLs', () => {
  it('builds an FC QR URL', () => {
    const url = generateFcQRCodeURL(
      '130862346',
      'E310000000001',
      1180,
      'abc123',
      Environment.Dev,
    );
    expect(url).toContain('https://fc.dgii.gov.do/testecf/consultatimbrefc');
    expect(url).toContain('rncemisor=130862346');
    expect(url).toContain('codigoseguridad=abc123');
  });

  it('omits RncComprador for E43 and E47', () => {
    const url = generateEcfQRCodeURL(
      '130862346',
      '999999999',
      'E430000000001',
      '100.00',
      '01-01-2026',
      '01-01-2026 10:00:00',
      'abcdef',
      Environment.Prod,
    );
    expect(url).not.toContain('RncComprador=');
  });

  it('includes RncComprador for E31', () => {
    const url = generateEcfQRCodeURL(
      '130862346',
      '123456789',
      'E310000000001',
      '100.00',
      '01-01-2026',
      '01-01-2026 10:00:00',
      'abcdef',
      Environment.Prod,
    );
    expect(url).toContain('RncComprador=123456789');
  });
});

describe('date formatting', () => {
  it('formats the date and time in Santo Domingo', () => {
    expect(getCurrentFormattedDateTime()).toMatch(
      /^\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}$/,
    );
    expect(getCurrentFormattedDate()).toMatch(/^\d{2}-\d{2}-\d{4}$/);
  });
});

describe('getXmlFromBodyResponse', () => {
  it('extracts the XML payload from a body', () => {
    const body = 'prefix <?xml version="1.0"?><ACECF><x>1</x></ACECF> suffix';
    expect(getXmlFromBodyResponse(body)).toContain('<ACECF>');
  });
});

describe('convertECF32ToRFCE', () => {
  it('builds an RFCE document and returns the security code', () => {
    const ecf32 =
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<ECF><Encabezado><Version>1.0</Version>' +
      '<IdDoc><TipoeCF>32</TipoeCF><eNCF>E320000000001</eNCF></IdDoc>' +
      '<Emisor><RNCEmisor>130862346</RNCEmisor><RazonSocialEmisor>Test</RazonSocialEmisor><FechaEmision>01-01-2026</FechaEmision></Emisor>' +
      '<Totales><MontoTotal>100.00</MontoTotal></Totales>' +
      '</Encabezado><SignatureValue>abcdef123456</SignatureValue></ECF>';

    const result = convertECF32ToRFCE(ecf32);
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.securityCode).toBe('abcdef');
    expect(result.value.xml).toContain('<RFCE>');
    expect(result.value.xml).toContain(
      '<CodigoSeguridadeCF>abcdef</CodigoSeguridadeCF>',
    );
    expect(result.value.xml).not.toContain('<Comprador></Comprador>');
  });
});
