import { describe, expect, it } from 'vitest';
import { extractElementText } from '../src/xml.js';

describe('extractElementText', () => {
  it('extracts a plain element', () => {
    expect(
      extractElementText('<ECF><eNCF>E310000000001</eNCF></ECF>', 'eNCF'),
    ).toBe('E310000000001');
  });

  it('extracts a namespace-prefixed element', () => {
    const xml =
      '<ECF xmlns:dgii="https://dgii.gov.do/eCF">' +
      '<dgii:eNCF>E310000000001</dgii:eNCF></ECF>';
    expect(extractElementText(xml, 'eNCF')).toBe('E310000000001');
  });

  it('extracts an attributed element', () => {
    const xml = '<ECF><eNCF version="1.0" tipo="31">E310000000001</eNCF></ECF>';
    expect(extractElementText(xml, 'eNCF')).toBe('E310000000001');
  });

  it('extracts a prefixed and attributed element', () => {
    const xml =
      '<ECF xmlns:dgii="https://dgii.gov.do/eCF">' +
      '<dgii:eNCF xmlns:dgii="https://dgii.gov.do/eCF" tipo="31">E310000000001</dgii:eNCF>' +
      '</ECF>';
    expect(extractElementText(xml, 'eNCF')).toBe('E310000000001');
  });

  it('extracts an element declared under a default namespace', () => {
    const xml = '<eNCF xmlns="https://dgii.gov.do/eCF">E310000000001</eNCF>';
    expect(extractElementText(xml, 'eNCF')).toBe('E310000000001');
  });

  it('tolerates an attribute value containing ">"', () => {
    const xml = '<ECF><eNCF nota="a > b">E310000000001</eNCF></ECF>';
    expect(extractElementText(xml, 'eNCF')).toBe('E310000000001');
  });

  it('trims surrounding whitespace and newlines', () => {
    const xml = '<ECF><eNCF>\n  E310000000001 \n</eNCF></ECF>';
    expect(extractElementText(xml, 'eNCF')).toBe('E310000000001');
  });

  it('does not match a longer element name', () => {
    const xml = '<ECF><eNCFExtra>E310000000001</eNCFExtra></ECF>';
    expect(extractElementText(xml, 'eNCF')).toBeUndefined();
  });

  it('returns undefined for a missing element', () => {
    expect(extractElementText('<ECF></ECF>', 'eNCF')).toBeUndefined();
  });

  it('returns undefined for a blank or self-closing element', () => {
    expect(
      extractElementText('<ECF><eNCF></eNCF></ECF>', 'eNCF'),
    ).toBeUndefined();
    expect(extractElementText('<ECF><eNCF/></ECF>', 'eNCF')).toBeUndefined();
  });

  it('reuses the compiled pattern across calls', () => {
    const xml = '<ECF><eNCF>E1</eNCF><RNCEmisor>130862346</RNCEmisor></ECF>';
    expect(extractElementText(xml, 'eNCF')).toBe('E1');
    expect(extractElementText(xml, 'RNCEmisor')).toBe('130862346');
  });
});
