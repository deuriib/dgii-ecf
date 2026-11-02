import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ECF,
  Environment,
  P12Reader,
  Signature,
} from '../../packages/typescript/src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));

const p12Path = process.env.DGII_P12_PATH;
const password = process.env.DGII_P12_PASSWORD;
const rnc = process.env.DGII_RNC;
if (!p12Path || !password || !rnc) {
  console.error('Set DGII_P12_PATH, DGII_P12_PASSWORD and DGII_RNC.');
  process.exit(1);
}

const environment = (process.env.DGII_ENVIRONMENT ?? 'TesteCF') as Environment;
const xmlPath = process.argv[2] ?? resolve(here, '..', 'fixtures', 'invoice-31.xml');

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

const ecf = new ECF(credentials.value, environment);
const auth = await ecf.authenticate();
if (auth.isErr()) {
  console.error('auth error:', auth.error);
  process.exit(1);
}

const encf = 'E310000000001';
const response = await ecf.sendElectronicDocument(
  signed.value,
  `${rnc}${encf}.xml`,
);
if (response.isErr()) {
  console.error('send error:', response.error);
  process.exit(1);
}
console.log(response.value);
