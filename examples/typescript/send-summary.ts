import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ECF,
  Environment,
  P12Reader,
  Signature,
  convertECF32ToRFCE,
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
const xmlPath =
  process.argv[2] ?? resolve(here, '..', 'fixtures', 'invoice-32.xml');

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

const signer = new Signature(key, cert);
const signedEcf = signer.signXml(readFileSync(xmlPath, 'utf8'), 'ECF');
if (signedEcf.isErr()) {
  console.error('error:', signedEcf.error);
  process.exit(1);
}

const converted = convertECF32ToRFCE(signedEcf.value);
if (converted.isErr()) {
  console.error('error:', converted.error);
  process.exit(1);
}

const signedRfce = signer.signXml(converted.value.xml, 'RFCE');
if (signedRfce.isErr()) {
  console.error('error:', signedRfce.error);
  process.exit(1);
}

const ecf = new ECF(credentials.value, environment);
const auth = await ecf.authenticate();
if (auth.isErr()) {
  console.error('auth error:', auth.error);
  process.exit(1);
}

const encf = 'E320000000001';
const response = await ecf.sendSummary(signedRfce.value, `${rnc}${encf}.xml`);
if (response.isErr()) {
  console.error('send error:', response.error);
  process.exit(1);
}
console.log(response.value);
