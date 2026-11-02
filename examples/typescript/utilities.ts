import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Environment,
  generateEcfQRCodeURL,
  generateFcQRCodeURL,
  getCodeSixDigitfromSignature,
  getCurrentFormattedDate,
  getCurrentFormattedDateTime,
  getXmlFromBodyResponse,
  validateXMLCertificate,
} from '../../packages/typescript/src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const sample = readFileSync(
  resolve(here, '..', 'fixtures', 'test.xml'),
  'utf8',
);

const security = getCodeSixDigitfromSignature(sample);
console.log('security code:', security.isOk() ? security.value : '<none>');

const validation = validateXMLCertificate(sample);
console.log('certificate valid:', validation.isValid);
console.log('certificate subject:', validation.subject);

console.log(
  'FC QR:',
  generateFcQRCodeURL(
    '130862346',
    'E310000000001',
    1180,
    'abc123',
    Environment.Dev,
  ),
);
console.log(
  'e-CF QR:',
  generateEcfQRCodeURL(
    '130862346',
    '40102368',
    'E310000000001',
    '1180.00',
    '01-01-2026',
    '01-01-2026 10:00:00',
    'abc123',
    Environment.Prod,
  ),
);

console.log('now:', getCurrentFormattedDateTime());
console.log('today:', getCurrentFormattedDate());

const body = 'prefix <?xml version="1.0"?><ACECF><x>1</x></ACECF> suffix';
console.log('extracted XML:', getXmlFromBodyResponse(body));
