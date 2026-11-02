import { P12Reader } from '../../packages/typescript/src/index.ts';

const p12Path = process.env.DGII_P12_PATH;
const password = process.env.DGII_P12_PASSWORD;
if (!p12Path || !password) {
  console.error('Set DGII_P12_PATH and DGII_P12_PASSWORD.');
  process.exit(1);
}

const info = new P12Reader(password).getCertificateInfo(p12Path);
if (info.isErr()) {
  console.error('error:', info.error);
  process.exit(1);
}

const certificate = info.value;
console.log('subject:', certificate.subject);
console.log('issuer:', certificate.issuer);
console.log('valid from:', certificate.validFrom);
console.log('valid to:', certificate.validTo);
console.log('serial:', certificate.serialNumber);
