import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ECF } from '../src/client.js';
import { Environment } from '../src/environment.js';
import { InMemoryIdempotencyStore } from '../src/http.js';

const credentials = { key: 'unused-key', cert: 'unused-cert' };

const signedEcf = (rnc: string, encf: string): string =>
  `<ECF><Encabezado><RNCEmisor>${rnc}</RNCEmisor><IdDoc><eNCF>${encf}</eNCF></IdDoc></Encabezado></ECF>`;

type FetchHandler = (url: string, init?: RequestInit) => Promise<Response>;

const mockFetch = (handler: FetchHandler): typeof fetch =>
  ((url: string | URL | Request, init?: RequestInit) =>
    handler(String(url), init)) as unknown as typeof fetch;

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('ECF client', () => {
  it('sends the bearer token and posts a multipart file part', async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    const fetchImpl = mockFetch(async (url, init) => {
      captured = { url, init };
      return jsonResponse({ trackId: 't1' });
    });

    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
    });
    const result = await ecf.sendElectronicDocument(
      signedEcf('130862346', 'E310000000001'),
      '130862346E310000000001.xml',
    );

    expect(result.isOk()).toBe(true);
    expect(captured?.url).toContain(
      '/TesteCF/recepcion/api/FacturasElectronicas',
    );
    expect(captured?.init?.method).toBe('POST');
    expect(
      (captured?.init?.headers as Record<string, string>).Authorization,
    ).toBe('Bearer tok');
    expect(captured?.init?.body).toBeInstanceOf(FormData);
  });

  it('does not retry a 4xx rejection', async () => {
    let calls = 0;
    const fetchImpl = mockFetch(async () => {
      calls += 1;
      return jsonResponse({ mensajes: [{ valor: 'invalid', codigo: 1 }] }, 400);
    });

    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
    });
    const result = await ecf.sendElectronicDocument(
      signedEcf('1', 'E1'),
      'f.xml',
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.message).toContain('invalid');
    expect(calls).toBe(1);
  });

  it('retries a 5xx then succeeds', async () => {
    let calls = 0;
    const fetchImpl = mockFetch(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response('boom', { status: 503 });
      }
      return jsonResponse({ trackId: 't2' });
    });

    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
      resilience: { maxRetries: 3, retryInitialDelayMs: 1 },
    });
    const result = await ecf.sendElectronicDocument(
      signedEcf('2', 'E2'),
      'f.xml',
    );

    expect(result.isOk()).toBe(true);
    expect(calls).toBe(2);
  });

  it('is idempotent for repeated submissions of the same document', async () => {
    let calls = 0;
    const fetchImpl = mockFetch(async () => {
      calls += 1;
      return jsonResponse({ trackId: 't3' });
    });

    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
    });
    const xml = signedEcf('3', 'E3');

    const first = await ecf.sendElectronicDocument(xml, 'f.xml');
    const second = await ecf.sendElectronicDocument(xml, 'f.xml');

    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    expect(calls).toBe(1);
  });

  it('derives the idempotency key from prefixed and attributed elements', async () => {
    const store = new InMemoryIdempotencyStore();
    const xml =
      '<ECF xmlns:dgii="https://dgii.gov.do/eCF"><Encabezado>' +
      '<RNCEmisor version="1.0">130862346</RNCEmisor>' +
      '<IdDoc><dgii:eNCF tipo="31">E310000000001</dgii:eNCF></IdDoc>' +
      '</Encabezado></ECF>';
    const digest = createHash('sha256').update(xml, 'utf8').digest('hex');
    const fetchImpl = mockFetch(async () => jsonResponse({ trackId: 't4' }));

    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
      idempotencyStore: store,
    });
    const result = await ecf.sendElectronicDocument(xml, 'f.xml');

    expect(result.isOk()).toBe(true);
    expect(await store.get(`130862346:E310000000001:${digest}`)).toEqual({
      trackId: 't4',
    });
    expect(
      await store.get(`unknown-rnc:unknown-encf:${digest}`),
    ).toBeUndefined();
  });

  it('normalizes a single-object customer directory into an array', async () => {
    const fetchImpl = mockFetch(async () =>
      jsonResponse({
        nombre: 'Buyer',
        rnc: '130862346',
        urlRecepcion: 'https://buyer/recepcion',
        urlAceptacion: 'https://buyer/aceptacion',
        urlOpcional: '',
      }),
    );

    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
    });
    const result = await ecf.getCustomerDirectory('130862346');

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(Array.isArray(result.value)).toBe(true);
    expect(result.value).toHaveLength(1);
  });

  it('refuses to resend a submission that is already pending', async () => {
    const store = new InMemoryIdempotencyStore();
    const xml = signedEcf('4', 'E4');
    const key = `4:E4:${createHash('sha256').update(xml, 'utf8').digest('hex')}`;
    await store.set(key, { pending: true });

    let calls = 0;
    const fetchImpl = mockFetch(async () => {
      calls += 1;
      return jsonResponse({ trackId: 'x' });
    });

    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
      idempotencyStore: store,
    });
    const result = await ecf.sendElectronicDocument(xml, 'f.xml');

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('IDEMPOTENCY');
    expect(calls).toBe(0);
  });

  it('clears the pending marker when a submission fails', async () => {
    const store = new InMemoryIdempotencyStore();
    const xml = signedEcf('5', 'E5');
    const key = `5:E5:${createHash('sha256').update(xml, 'utf8').digest('hex')}`;

    let calls = 0;
    const fetchImpl = mockFetch(async () => {
      calls += 1;
      return jsonResponse({ mensajes: [{ valor: 'bad', codigo: 1 }] }, 400);
    });

    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
      idempotencyStore: store,
    });

    const first = await ecf.sendElectronicDocument(xml, 'f.xml');
    expect(first.isErr()).toBe(true);
    expect(await store.get(key)).toBeUndefined();

    // A retry after failure re-sends instead of returning a pending error.
    await ecf.sendElectronicDocument(xml, 'f.xml');
    expect(calls).toBe(2);
  });

  it('rejects the summary inquiry outside production', async () => {
    let calls = 0;
    const fetchImpl = mockFetch(async () => {
      calls += 1;
      return jsonResponse({
        rnc: '130862346',
        encf: 'E320000000001',
        secuenciaUtilizada: true,
        codigo: 1,
        estado: 'Aceptado',
      });
    });

    for (const environment of [Environment.Dev, Environment.Cert]) {
      const ecf = new ECF(credentials, environment, {
        token: 'tok',
        fetchImpl,
      });
      const result = await ecf.getSummaryInvoiceInquiry(
        '130862346',
        'E320000000001',
        'abc123',
      );

      expect(result.isErr()).toBe(true);
      if (result.isOk()) continue;
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.message).toContain('production');
    }

    expect(calls).toBe(0);
  });

  it('allows the summary inquiry in production', async () => {
    const fetchImpl = mockFetch(async () =>
      jsonResponse({
        rnc: '130862346',
        encf: 'E320000000001',
        secuenciaUtilizada: true,
        codigo: 1,
        estado: 'Aceptado',
      }),
    );

    const ecf = new ECF(credentials, Environment.Prod, {
      token: 'tok',
      fetchImpl,
    });
    const result = await ecf.getSummaryInvoiceInquiry(
      '130862346',
      'E320000000001',
      'abc123',
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.encf).toBe('E320000000001');
  });
});
