import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  ECF,
  Endpoint,
  Environment,
  HttpClient,
  documentIdentity,
  type DgiiErrorCode,
  type EcfEvent,
} from '../src/index.js';

const credentials = { key: 'unused-key', cert: 'unused-cert' };

const signedEcf = (rnc: string, encf: string): string =>
  `<ECF><Encabezado><RNCEmisor>${rnc}</RNCEmisor><IdDoc><eNCF>${encf}</eNCF></IdDoc></Encabezado></ECF>`;

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const mockFetch = (
  handler: (url: string, init?: RequestInit) => Promise<Response>,
): typeof fetch =>
  ((url: string | URL | Request, init?: RequestInit) =>
    handler(String(url), init)) as unknown as typeof fetch;

describe('Resilience & Observability (TS)', () => {
  it('F-RES-01: sick buyer host opens buyer breaker while healthy DGII host still succeeds', async () => {
    let buyerHits = 0;
    let dgiiHits = 0;
    const fetchImpl = mockFetch(async (url) => {
      if (url.startsWith('https://buyer.example.test')) {
        buyerHits += 1;
        return jsonResponse({ message: 'unavailable' }, 503);
      }
      dgiiHits += 1;
      return jsonResponse({ trackId: 'dgii-ok' });
    });

    const events: EcfEvent[] = [];
    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
      enforceB2BRules: false,
      resilience: {
        maxRetries: 1,
        breakerThreshold: 5,
        halfOpenAfterMs: 30_000,
      },
      onEvent: (e) => events.push(e),
    });

    for (let i = 0; i < 5; i += 1) {
      const res = await ecf.sendElectronicDocument(
        signedEcf('130862346', `E31000000000${i}`),
        `doc-${i}.xml`,
        'https://buyer.example.test',
      );
      expect(res.isErr()).toBe(true);
    }
    expect(buyerHits).toBe(5);

    const sixth = await ecf.sendElectronicDocument(
      signedEcf('130862346', 'E310000000009'),
      'doc-9.xml',
      'https://buyer.example.test',
    );
    expect(sixth.isErr()).toBe(true);
    if (sixth.isErr()) {
      expect(sixth.error.code).toBe('IDEMPOTENCY');
      expect((sixth.error.cause as { code?: string } | undefined)?.code).toBe(
        'CIRCUIT_OPEN',
      );
    }
    expect(buyerHits).toBe(5);
    expect(
      events.some(
        (e) => e.type === 'breaker.changed' && e.breakerState === 'open',
      ),
    ).toBe(true);

    const dgiiRes = await ecf.sendElectronicDocument(
      signedEcf('130862346', 'E310000000010'),
      'doc-10.xml',
    );
    expect(dgiiRes.isOk()).toBe(true);
    expect(dgiiHits).toBe(1);
  });

  it('F-RES-02 / F-RES-07: bulkhead saturation rejects with CIRCUIT_OPEN and does not trip breaker', async () => {
    let releaseFirst!: () => void;
    const firstEntered = new Promise<void>((resolveReady) => {
      const original = resolveReady;
      void original;
    });
    let notifyEntered!: () => void;
    const entered = new Promise<void>((r) => {
      notifyEntered = r;
    });
    void firstEntered;

    let calls = 0;
    const fetchImpl = mockFetch(async () => {
      calls += 1;
      if (calls === 1) {
        notifyEntered();
        await new Promise<void>((r) => {
          releaseFirst = r;
        });
      }
      return jsonResponse({ ok: true });
    });

    const http = new HttpClient({
      baseUrl: 'https://ecf.dgii.gov.do',
      fetchImpl,
      resilience: {
        maxRetries: 1,
        breakerThreshold: 2,
        bulkheadLimit: 1,
        bulkheadQueue: 0,
        timeoutMs: 5000,
      },
    });

    const p1 = http.get('/a', undefined, { resource: 'RES_A' });
    await entered;

    const p2 = await http.get('/b', undefined, { resource: 'RES_B' });
    expect(p2.isErr()).toBe(true);
    if (p2.isErr()) {
      expect(p2.error.code).toBe('CIRCUIT_OPEN');
      expect(p2.error.retryable).toBe(true);
    }

    const p3 = await http.get('/c', undefined, { resource: 'RES_C' });
    expect(p3.isErr()).toBe(true);

    releaseFirst();
    const r1 = await p1;
    expect(r1.isOk()).toBe(true);

    const after = await http.get('/d', undefined, { resource: 'RES_D' });
    expect(after.isOk()).toBe(true);
  });

  it('F-RES-04: timeout retries and surfaces code === TIMEOUT and retryable === true', async () => {
    let attempts = 0;
    const fetchImpl = mockFetch(async (_url, init) => {
      attempts += 1;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const http = new HttpClient({
      baseUrl: 'https://ecf.dgii.gov.do',
      fetchImpl,
      resilience: {
        maxRetries: 2,
        timeoutMs: 25,
        retryInitialDelayMs: 5,
      },
    });

    const res = await http.get('/slow', undefined, { resource: 'SLOW_OP' });
    expect(attempts).toBe(2);
    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.code).toBe('TIMEOUT');
      expect(res.error.retryable).toBe(true);
    }
  });

  it('F-OBS-01 / F-OBS-02: emits transmission.started -> succeeded silently and swallows throwing callbacks', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write');
    const stderrSpy = vi.spyOn(process.stderr, 'write');

    const events: EcfEvent[] = [];
    const fetchImpl = mockFetch(async () => jsonResponse({ trackId: 't1' }));

    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
      onEvent: (event) => events.push(event),
    });

    const xml = signedEcf('130862346', 'E310000000001');
    const first = await ecf.sendElectronicDocument(xml, 'doc.xml');
    expect(first.isOk()).toBe(true);

    const second = await ecf.sendElectronicDocument(xml, 'doc.xml');
    expect(second.isOk()).toBe(true);

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();

    const types = events.map((e) => e.type);
    expect(types).toEqual([
      'idempotency',
      'transmission.started',
      'transmission.succeeded',
      'idempotency',
    ]);
    expect(events[0]?.idempotency).toBe('miss');
    expect(events[3]?.idempotency).toBe('hit');
    expect(events[1]?.resource).toBe(Endpoint.SendInvoice);
    expect(events[1]?.rnc).toBe('130862346');
    expect(events[1]?.encf).toBe('E310000000001');
    expect(events[1]?.documentHash).toBe(documentIdentity(xml).documentHash);

    const throwingEcf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
      onEvent: () => {
        throw new Error('boom from telemetry sink');
      },
    });
    const okRes = await throwingEcf.sendElectronicDocument(xml, 'doc.xml');
    expect(okRes.isOk()).toBe(true);

    const errFetch = mockFetch(async () =>
      jsonResponse({ message: 'bad' }, 400),
    );
    const throwingErrEcf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl: errFetch,
      onEvent: () => {
        throw new Error('boom on err');
      },
    });
    const errRes = await throwingErrEcf.statusTrackId('t1');
    expect(errRes.isErr()).toBe(true);
  });

  it('F-DGII-03: validateBeforeSend does not block when schema is unavailable (E31)', async () => {
    let sent = 0;
    const fetchImpl = mockFetch(async () => {
      sent += 1;
      return jsonResponse({ trackId: 't-e31' });
    });

    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
      validateBeforeSend: true,
    });

    const e31Xml =
      '<ECF><Encabezado><TipoeCF>31</TipoeCF><RNCEmisor>130862346</RNCEmisor>' +
      '<IdDoc><eNCF>E310000000001</eNCF></IdDoc></Encabezado></ECF>';

    const res = await ecf.sendElectronicDocument(e31Xml, 'e31.xml');
    expect(res.isOk()).toBe(true);
    expect(sent).toBe(1);
  });

  it('telemetry-vocabulary.json matches TS event types and error codes', () => {
    const vocabPath = resolve(
      __dirname,
      '../../../examples/fixtures/telemetry-vocabulary.json',
    );
    const vocab = JSON.parse(readFileSync(vocabPath, 'utf8')) as {
      eventTypes: string[];
      errorCodes: DgiiErrorCode[];
    };

    expect(vocab.eventTypes).toContain('transmission.started');
    expect(vocab.eventTypes).toContain('transmission.succeeded');
    expect(vocab.eventTypes).toContain('transmission.failed');
    expect(vocab.eventTypes).toContain('idempotency');
    expect(vocab.eventTypes).toContain('breaker.changed');
    expect(vocab.errorCodes).toContain('CIRCUIT_OPEN');
    expect(vocab.errorCodes).toContain('TIMEOUT');
  });
});
