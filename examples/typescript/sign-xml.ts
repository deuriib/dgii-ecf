import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  P12Reader,
  Signature,
  validateXMLCertificate,
} from '../../packages/typescript/src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const xmlPath = process.argv[2] ?? resolve(here, '..', 'fixtures', 'invoice-31.xml');
const p12Path = process.argv[3] ?? resolve(here, '..', 'output', 'test.p12');
const password = process.argv[4] ?? 'test';

const credentials = new P12Reader(password).getKeyFromFile(p12Path);
if (credentials.isErr()) {
  console.error('error:', credentials.error);
  process.exit(1);
}

const { key, cert } = credentials.value;
if (!key || !cert) {
  console.error('error: certificate is missing a key or certificate');
  process.exit(1);
}

const signed = new Signature(key, cert).signXml(readFileSync(xmlPath, 'utf8'));
if (signed.isErr()) {
  console.error('error:', signed.error);
  process.exit(1);
}

const outputDir = resolve(here, '..', 'output');
mkdirSync(outputDir, { recursive: true });
const output = resolve(outputDir, `${basename(xmlPath, '.xml')}.signed.xml`);
writeFileSync(output, signed.value);

const validation = validateXMLCertificate(signed.value);
console.log(`Signed -> ${output}`);
console.log(`Certificate valid: ${validation.isValid} (${validation.subject})`);
