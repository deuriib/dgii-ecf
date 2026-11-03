import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ECF } from '../src/client.js';
import { Environment } from '../src/environment.js';
import { SCHEMA_DIR, validateDocument } from '../src/validation.js';

const credentials = { key: 'unused-key', cert: 'unused-cert' };

const VALID_SEED =
  '<SemillaModel><valor>abc</valor>' +
  '<fecha>2026-01-01T00:00:00</fecha><Signature/></SemillaModel>';

const INVALID_ECF_32 =
  '<ECF><Encabezado><IdDoc><TipoeCF>32</TipoeCF></IdDoc></Encabezado></ECF>';

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const mockFetch = (handler: () => Response) =>
  ((_url: string | URL | Request) =>
    Promise.resolve(handler())) as unknown as typeof fetch;

/**
 * `xmllint` is not installed in every environment, so the plumbing is exercised
 * with stand-in binaries. The schemas themselves are compiled by the Python
 * suite, which uses lxml.
 */
const script = (body: string): string =>
  `#!/bin/sh\ncat > /dev/null\n${body}\n`;

let binDir = '';

beforeAll(() => {
  binDir = mkdtempSync(join(tmpdir(), 'dgii-xmllint-'));
  const write = (name: string, body: string): string => {
    const path = join(binDir, name);
    writeFileSync(path, script(body));
    chmodSync(path, 0o755);
    return path;
  };
  write('valid', 'echo "- validates" >&2; exit 0');
  write(
    'invalid',
    `echo "/tmp/x.xml:7: element FechaLimitePago: Schemas validity error : Element 'FechaLimitePago': bad date" >&2;` +
      ` echo "/tmp/x.xml fails to validate" >&2; exit 3`,
  );
});

describe('bundled schemas', () => {
  it('ships every schema next to the bundle', () => {
    expect(existsSync(SCHEMA_DIR)).toBe(true);
    const files = readdirSync(SCHEMA_DIR).filter((file) =>
      file.endsWith('.xsd'),
    );
    expect(files).toHaveLength(12);
  });
});

describe('validateDocument', () => {
  it('returns no violations when xmllint reports the document valid', () => {
    const result = validateDocument(VALID_SEED, { bin: join(binDir, 'valid') });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toEqual([]);
  });

  it('parses the element and reason from xmllint stderr', () => {
    const result = validateDocument(INVALID_ECF_32, {
      bin: join(binDir, 'invalid'),
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.path).toBe('FechaLimitePago');
    expect(result.value[0]?.message).toContain('bad date');
  });

  it('fails loudly when xmllint is missing', () => {
    const result = validateDocument(VALID_SEED, {
      bin: join(binDir, 'does-not-exist'),
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.message).toContain('xmllint was not found');
  });

  it('reports a published-but-broken schema as unavailable', () => {
    const result = validateDocument(
      '<ECF><Encabezado><IdDoc><TipoeCF>31</TipoeCF></IdDoc></Encabezado></ECF>',
      { bin: join(binDir, 'valid') },
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.message).toContain('Schema unavailable');
    expect(result.error.message).toContain('ECF 31');
  });

  it('rejects a document with no recognisable root', () => {
    const result = validateDocument('<Invoice/>', {
      bin: join(binDir, 'valid'),
    });

    expect(result.isErr()).toBe(true);
  });
});

describe('validateBeforeSend', () => {
  it('blocks an invalid document without calling HTTP', async () => {
    let calls = 0;
    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl: mockFetch(() => {
        calls += 1;
        return jsonResponse({ trackId: 't1' });
      }),
      validateBeforeSend: true,
      xmllintBin: join(binDir, 'invalid'),
    });

    const result = await ecf.sendElectronicDocument(INVALID_ECF_32, 'f.xml');

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.message).toContain('DGII XML Schema');
    expect(calls).toBe(0);
  });

  it('is off by default', async () => {
    let calls = 0;
    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl: mockFetch(() => {
        calls += 1;
        return jsonResponse({ trackId: 't1' });
      }),
    });

    const result = await ecf.sendElectronicDocument(INVALID_ECF_32, 'f.xml');

    expect(result.isOk()).toBe(true);
    expect(calls).toBe(1);
  });
});
