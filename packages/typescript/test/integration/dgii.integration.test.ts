/**
 * Live DGII integration tests, skipped unless the `DGII_*` variables are set.
 *
 * Required: `DGII_P12_PATH`, `DGII_P12_PASSWORD`, `DGII_RNC`.
 * Submitting also needs an authorised, unused sequence: `DGII_ENCF` for an
 * e-CF and `DGII_RFCE_ENCF` for a summary — DGII rejects a repeated one.
 *
 * Sandboxed to TesteCF/CerteCF; `DGII_ENVIRONMENT=eCF` is rejected instead of
 * silently running against production.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { P12Reader } from '../../src/certificate.js';
import { ECF } from '../../src/client.js';
import { Environment } from '../../src/environment.js';
import { Signature } from '../../src/signing.js';
import type { AuthToken } from '../../src/types.js';

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
);
const REQUIRED_VARIABLES = [
  'DGII_P12_PATH',
  'DGII_P12_PASSWORD',
  'DGII_RNC',
] as const;

const missingVariables = REQUIRED_VARIABLES.filter(
  (name) => !process.env[name],
);
const describeIntegration =
  missingVariables.length === 0 ? describe : describe.skip;

const resolveEnvironment = (): Environment => {
  const raw = process.env['DGII_ENVIRONMENT'] ?? Environment.Cert;
  switch (raw) {
    case Environment.Dev:
      return Environment.Dev;
    case Environment.Cert:
      return Environment.Cert;
    case Environment.Prod:
      throw new Error(
        'DGII_ENVIRONMENT=eCF points at production. The integration suite is sandboxed to TesteCF/CerteCF.',
      );
    default:
      throw new Error(
        `DGII_ENVIRONMENT=${raw} is not one of: ${Environment.Dev}, ${Environment.Cert}`,
      );
  }
};

const loadFixture = (fileName: string, encf: string | undefined): string => {
  const xml = readFileSync(
    join(REPO_ROOT, 'examples', 'fixtures', fileName),
    'utf8',
  );
  if (encf === undefined) {
    return xml;
  }
  const replaced = xml.replace(/<eNCF>[^<]*<\/eNCF>/, `<eNCF>${encf}</eNCF>`);
  if (replaced === xml) {
    throw new Error(`expected an <eNCF> in ${fileName}`);
  }
  return replaced;
};

describeIntegration('DGII integration', () => {
  let client: ECF | undefined;
  let signer: Signature | undefined;
  let token: AuthToken | undefined;

  const requireClient = (): ECF => {
    if (client === undefined) {
      throw new Error('client was not initialised');
    }
    return client;
  };

  const requireSigner = (): Signature => {
    if (signer === undefined) {
      throw new Error('signer was not initialised');
    }
    return signer;
  };

  const ensureAuthenticated = async (): Promise<AuthToken> => {
    if (token === undefined) {
      const result = await requireClient().authenticate();
      if (result.isErr()) {
        throw new Error(`DGII authentication failed: ${result.error.message}`);
      }
      token = result.value;
    }
    return token;
  };

  beforeAll(() => {
    const p12Path = process.env['DGII_P12_PATH'];
    const password = process.env['DGII_P12_PASSWORD'];
    if (p12Path === undefined || password === undefined) {
      throw new Error('DGII_P12_PATH and DGII_P12_PASSWORD are required');
    }
    const credentials = new P12Reader(password).getKeyFromFile(p12Path);
    if (credentials.isErr()) {
      throw new Error(
        `cannot load DGII_P12_PATH: ${credentials.error.message}`,
      );
    }
    const { key, cert } = credentials.value;
    if (key === undefined || cert === undefined) {
      throw new Error('PKCS#12 must contain a private key and certificate');
    }
    signer = new Signature(key, cert);
    client = new ECF(credentials.value, resolveEnvironment(), {
      timeoutMs: 60_000,
    });
  });

  it('authenticates against the configured environment', async () => {
    const auth = await ensureAuthenticated();

    expect(auth.token.length).toBeGreaterThan(0);
    expect(resolveEnvironment()).not.toBe(Environment.Prod);
  });

  const ecf = process.env['DGII_ENCF'];
  const submit = it.skipIf(ecf === undefined);

  submit('submits an e-CF and reads its status', async () => {
    await ensureAuthenticated();
    const encf = process.env['DGII_ENCF'];
    if (encf === undefined) {
      throw new Error('DGII_ENCF is required to submit an e-CF');
    }

    const signed = requireSigner().signXml(loadFixture('invoice-31.xml', encf));
    if (signed.isErr()) {
      throw new Error(`signing failed: ${signed.error.message}`);
    }

    const submission = await requireClient().sendElectronicDocument(
      signed.value,
      `${encf}.xml`,
    );
    expect(submission.isOk()).toBe(true);
    if (submission.isErr()) {
      throw new Error(`submission failed: ${submission.error.message}`);
    }
    const trackId = submission.value.trackId;
    if (trackId === undefined || trackId.length === 0) {
      throw new Error('DGII accepted the document without a track id');
    }

    const status = await requireClient().statusTrackId(trackId);
    expect(status.isOk()).toBe(true);
    if (status.isErr()) {
      throw new Error(`status lookup failed: ${status.error.message}`);
    }
    expect(status.value.encf).toBe(encf);
  });

  const rfce = process.env['DGII_RFCE_ENCF'];
  const submitSummary = it.skipIf(rfce === undefined);

  submitSummary('submits a summary (RFCE)', async () => {
    await ensureAuthenticated();
    const encf = process.env['DGII_RFCE_ENCF'];
    if (encf === undefined) {
      throw new Error('DGII_RFCE_ENCF is required to submit a summary');
    }

    const signed = requireSigner().signXml(loadFixture('invoice-32.xml', encf));
    if (signed.isErr()) {
      throw new Error(`signing failed: ${signed.error.message}`);
    }

    const submission = await requireClient().sendSummary(
      signed.value,
      `${encf}.xml`,
    );
    expect(submission.isOk()).toBe(true);
    if (submission.isErr()) {
      throw new Error(`summary submission failed: ${submission.error.message}`);
    }
    expect(submission.value.encf).toBe(encf);
  });
});
