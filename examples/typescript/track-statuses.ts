import { ECF, Environment, P12Reader } from '../../packages/typescript/src/index.ts';

const p12Path = process.env.DGII_P12_PATH;
const password = process.env.DGII_P12_PASSWORD;
const rnc = process.env.DGII_RNC;
if (!p12Path || !password || !rnc) {
  console.error('Set DGII_P12_PATH, DGII_P12_PASSWORD and DGII_RNC.');
  process.exit(1);
}

const environment = (process.env.DGII_ENVIRONMENT ?? 'TesteCF') as Environment;
const encf = process.argv[2] ?? 'E310000000001';

const credentials = new P12Reader(password).getKeyFromFile(p12Path);
if (credentials.isErr()) {
  console.error('error:', credentials.error);
  process.exit(1);
}

const ecf = new ECF(credentials.value, environment);
const auth = await ecf.authenticate();
if (auth.isErr()) {
  console.error('auth error:', auth.error);
  process.exit(1);
}

const result = await ecf.trackStatuses(rnc, encf);
if (result.isErr()) {
  console.error('error:', result.error);
  process.exit(1);
}
console.log(JSON.stringify(result.value, null, 2));
