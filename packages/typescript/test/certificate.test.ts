import { describe, expect, it } from 'vitest';
import forge from 'node-forge';
import { P12Reader } from '../src/certificate.js';

interface P12Material {
  privateKey: forge.pki.rsa.PrivateKey;
  certificate: forge.pki.Certificate;
}

const CN = 'dgii-ecf-p12-test';

const createMaterial = (): P12Material => {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = '01';
  certificate.validity.notBefore = new Date(Date.now() - 60 * 60 * 1000);
  certificate.validity.notAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const attributes = [{ name: 'commonName', value: CN }];
  certificate.setSubject(attributes);
  certificate.setIssuer(attributes);
  certificate.sign(keys.privateKey, forge.md.sha256.create());
  return { privateKey: keys.privateKey, certificate };
};

/** Options accepted by node-forge's PKCS#12 encoder. */
type P12Options = Parameters<typeof forge.pkcs12.toPkcs12Asn1>[3];

const toBase64P12 = (
  material: P12Material,
  password: string | null,
  options: P12Options = {},
): string => {
  const asn1 = forge.pkcs12.toPkcs12Asn1(
    material.privateKey,
    [material.certificate],
    password,
    { algorithm: '3des', ...options },
  );
  return forge.util.encode64(forge.asn1.toDer(asn1).getBytes());
};

const material = createMaterial();
// DGII bundles ship an encrypted (shrouded) key bag.
const shroudedP12 = toBase64P12(material, 'secret');
// Unencrypted bundles use a plain keyBag instead, which had no fallback.
const plainKeyBagP12 = toBase64P12(material, null, { useMac: false });

describe('P12Reader', () => {
  it('reads a shrouded key bag (normal DGII bundle)', () => {
    const result = new P12Reader('secret').getKeyFromStringBase64(shroudedP12);
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.key).toContain('PRIVATE KEY');
    expect(result.value.cert).toContain('CERTIFICATE');
    expect(result.value.publicKey).toContain('PUBLIC KEY');
  });

  it('reads a plain key bag (unencrypted bundle)', () => {
    const result = new P12Reader('').getKeyFromStringBase64(plainKeyBagP12);
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.key).toContain('PRIVATE KEY');
    expect(result.value.cert).toContain('CERTIFICATE');
  });

  it('rejects a wrong passphrase with a CERTIFICATE error', () => {
    const result = new P12Reader('wrong').getKeyFromStringBase64(shroudedP12);
    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('CERTIFICATE');
  });

  it('rejects malformed input with a CERTIFICATE error', () => {
    const result = new P12Reader('secret').getKeyFromStringBase64(
      forge.util.encode64('not a p12'),
    );
    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('CERTIFICATE');
  });

  it('reads certificate metadata', () => {
    const result = new P12Reader('secret').getCertificateInfoFromBase64(
      shroudedP12,
    );
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.subject).toContain(CN);
    expect(result.value.validTo.getTime()).toBeGreaterThan(Date.now());
  });
});
