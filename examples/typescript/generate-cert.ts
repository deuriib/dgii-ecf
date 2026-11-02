import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import forge from 'node-forge';

const here = dirname(fileURLToPath(import.meta.url));
const output = process.argv[2] ?? resolve(here, '..', 'output', 'test.p12');
const password = process.argv[3] ?? 'test';

const keys = forge.pki.rsa.generateKeyPair(2048);
const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = '01';
cert.validity.notBefore = new Date(Date.now() - 60 * 60 * 1000);
cert.validity.notAfter = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const attrs = [{ name: 'commonName', value: 'dgii-ecf-example' }];
cert.setSubject(attrs);
cert.setIssuer(attrs);
cert.sign(keys.privateKey, forge.md.sha256.create());

const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password);
const der = forge.asn1.toDer(asn1).getBytes();

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, Buffer.from(der, 'binary'));
console.log(`Wrote ${output} (password: ${password})`);
