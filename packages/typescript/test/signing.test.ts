import { describe, expect, it } from 'vitest';
import forge from 'node-forge';
import { Signature, validateXMLCertificate } from '../src/signing.js';

interface SelfSigned {
  privateKey: string;
  certificate: string;
}

const createSelfSigned = (): SelfSigned => {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 60 * 60 * 1000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const attrs = [{ name: 'commonName', value: 'dgii-ecf-test' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    privateKey: forge.pki.privateKeyToPem(keys.privateKey),
    certificate: forge.pki.certificateToPem(cert),
  };
};

const ECF_XML =
  '<?xml version="1.0" encoding="utf-8"?><ECF><Encabezado><Version>1.0</Version></Encabezado></ECF>';

describe('Signature', () => {
  it('produces a DGII-compatible signature (rsa-sha256 + inclusive c14n)', () => {
    const { privateKey, certificate } = createSelfSigned();
    const result = new Signature(privateKey, certificate).signXml(ECF_XML);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;

    const signed = result.value;
    expect(signed).toContain('<Signature');
    expect(signed).toContain(
      'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    );
    expect(signed).toContain('http://www.w3.org/TR/2001/REC-xml-c14n-20010315');
    expect(signed).toContain(
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
    );
    expect(signed).toContain('<DigestValue>');
    expect(signed).toContain('<SignatureValue>');
    expect(signed).toContain('<X509Certificate>');
  });

  it('auto-detects the root element', () => {
    const { privateKey, certificate } = createSelfSigned();
    const seed =
      '<?xml version="1.0" encoding="utf-8"?><SemillaModel><x>1</x></SemillaModel>';
    const result = new Signature(privateKey, certificate).signXml(seed);
    expect(result.isOk()).toBe(true);
  });

  it('rejects invalid XML with a typed error', () => {
    const { privateKey, certificate } = createSelfSigned();
    const result = new Signature(privateKey, certificate).signXml(
      '<ECF><broken>',
    );
    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('SIGNING');
  });
});

describe('validateXMLCertificate', () => {
  it('validates the embedded certificate', () => {
    const { privateKey, certificate } = createSelfSigned();
    const result = new Signature(privateKey, certificate).signXml(ECF_XML);
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;

    const validation = validateXMLCertificate(result.value);
    expect(validation.isValid).toBe(true);
    expect(validation.subject).toContain('dgii-ecf-test');
  });

  it('fails when no certificate is present', () => {
    const validation = validateXMLCertificate('<ECF></ECF>');
    expect(validation.isValid).toBe(false);
  });
});
