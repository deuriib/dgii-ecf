import {
  ECF,
  Environment,
  P12Reader,
} from '../../packages/typescript/src/index.ts';

const p12Path = process.env.DGII_P12_PATH;
const password = process.env.DGII_P12_PASSWORD;
const trackId = process.argv[2] ?? process.env.DGII_TRACK_ID;
if (!p12Path || !password || !trackId) {
  console.error('Set DGII_P12_PATH, DGII_P12_PASSWORD and pass a track id.');
  process.exit(1);
}

const environment = (process.env.DGII_ENVIRONMENT ?? 'TesteCF') as Environment;

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

const result = await ecf.statusTrackId(trackId);
if (result.isErr()) {
  console.error('error:', result.error);
  process.exit(1);
}
console.log(JSON.stringify(result.value, null, 2));
