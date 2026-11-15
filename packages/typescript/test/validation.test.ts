import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ECF } from '../src/client.js';
import { Environment } from '../src/environment.js';
import {
  isSchemaUnavailableError,
  SCHEMA_DIR,
  validateDocument,
} from '../src/validation.js';

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
  write(
    'realFormat',
    `echo "-:1: Schemas validity error : Element 'IdDoc': This element is not expected. Expected is ( Version )." >&2;` +
      ` echo "-:1: Schemas validity error : Element 'ECF': Missing child element(s). Expected is ( DetallesItems )." >&2;` +
      ` echo "- fails to validate" >&2; exit 3`,
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

  it('parses real xmllint --schema stderr without line prefixes', () => {
    const result = validateDocument(INVALID_ECF_32, {
      bin: join(binDir, 'realFormat'),
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toEqual([
      {
        path: '/IdDoc',
        message:
          "Element 'IdDoc': This element is not expected. Expected is ( Version ).",
      },
      {
        path: '/ECF',
        message:
          "Element 'ECF': Missing child element(s). Expected is ( DetallesItems ).",
      },
    ]);
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

describe('isSchemaUnavailableError', () => {
  it('identifies the published-but-broken DGII schemas (E31, RFCE, ACECF)', () => {
    const docs = [
      '<ECF><Encabezado><IdDoc><TipoeCF>31</TipoeCF></IdDoc></Encabezado></ECF>',
      '<RFCE><Encabezado/></RFCE>',
      '<ACECF><DetalleAprobacionComercial/></ACECF>',
    ];
    for (const xml of docs) {
      const result = validateDocument(xml, { bin: join(binDir, 'valid') });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(isSchemaUnavailableError(result.error)).toBe(true);
      }
    }
  });

  it('returns false for unknown roots, unknown types, and missing xmllint', () => {
    const unknownRoot = validateDocument('<Invoice/>', {
      bin: join(binDir, 'valid'),
    });
    expect(unknownRoot.isErr()).toBe(true);
    if (unknownRoot.isErr()) {
      expect(isSchemaUnavailableError(unknownRoot.error)).toBe(false);
    }

    const unknownType = validateDocument(
      '<ECF><Encabezado><IdDoc><TipoeCF>99</TipoeCF></IdDoc></Encabezado></ECF>',
      { bin: join(binDir, 'valid') },
    );
    expect(unknownType.isErr()).toBe(true);
    if (unknownType.isErr()) {
      expect(isSchemaUnavailableError(unknownType.error)).toBe(false);
    }

    const missingBin = validateDocument(VALID_SEED, {
      bin: join(binDir, 'does-not-exist'),
    });
    expect(missingBin.isErr()).toBe(true);
    if (missingBin.isErr()) {
      expect(isSchemaUnavailableError(missingBin.error)).toBe(false);
    }
  });
});

const realXmllint = process.env['DGII_XMLLINT_BIN'] ?? 'xmllint';
const describeReal =
  spawnSync(realXmllint, ['--version']).status === 0 ? describe : describe.skip;

describeReal('validateDocument against the real xmllint binary', () => {
  it('reports the element path for a schema violation', () => {
    const result = validateDocument(INVALID_ECF_32, { bin: realXmllint });
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.length).toBeGreaterThan(0);
    expect(result.value[0]?.path).not.toBe('');
    expect(result.value[0]?.message).not.toMatch(/^-\d*:/);
  });

  it('produces the same violation paths as the Python SDK for invoice-32.xml', () => {
    const xml = readFileSync('../../examples/fixtures/invoice-32.xml', 'utf8');
    const result = validateDocument(xml, { bin: realXmllint });
    if (result.isErr()) throw new Error(result.error.message);
    expect(result.value.map((v) => v.path)).toEqual(['/ECF']);
  });
});
