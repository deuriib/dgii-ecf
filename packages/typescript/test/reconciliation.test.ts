import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ECF } from '../src/client.js';
import { Environment } from '../src/environment.js';
import { InMemoryIdempotencyStore } from '../src/http.js';
import {
  PENDING_SUBMISSION_MESSAGE,
  canReuseSequence,
} from '../src/reconciliation.js';

const credentials = { key: 'unused-key', cert: 'unused-cert' };

const XML =
  '<ECF><Encabezado><RNCEmisor>130862346</RNCEmisor>' +
  '<IdDoc><eNCF>E310000000001</eNCF></IdDoc></Encabezado></ECF>';

const KEY = `130862346:E310000000001:${createHash('sha256')
  .update(XML, 'utf8')
  .digest('hex')}`;

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const mockFetch = (handler: (url: string) => Response) =>
  ((url: string | URL | Request) =>
    Promise.resolve(handler(String(url)))) as unknown as typeof fetch;

describe('canReuseSequence', () => {
  it('reuses only when DGII says the sequence is free', () => {
    expect(canReuseSequence({ secuenciaUtilizada: false })).toBe(true);
    expect(canReuseSequence({ secuenciaUtilizada: true })).toBe(false);
    expect(canReuseSequence({})).toBe(false);
    expect(canReuseSequence({ secuenciaUtilizada: null })).toBe(false);
  });
});

describe('reconcileSubmission', () => {
  it('clears the marker when DGII has no record of the document', async () => {
    const store = new InMemoryIdempotencyStore();
    await store.set(KEY, { pending: true });
    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      idempotencyStore: store,
      fetchImpl: mockFetch(() =>
        jsonResponse({ codigo: 0, estado: 'No encontrado' }),
      ),
    });

    const result = await ecf.reconcileSubmission(XML);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.delivered).toBe(false);
    expect(result.value.cleared).toBe(true);
    expect(await store.get(KEY)).toBeUndefined();
  });

  it('keeps the marker when DGII already has the document', async () => {
    const store = new InMemoryIdempotencyStore();
    await store.set(KEY, { pending: true });
    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      idempotencyStore: store,
      fetchImpl: mockFetch(() =>
        jsonResponse({
          codigo: 1,
          estado: 'Aceptado',
          secuenciaUtilizada: true,
        }),
      ),
    });

    const result = await ecf.reconcileSubmission(XML);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.delivered).toBe(true);
    expect(result.value.cleared).toBe(false);
    expect(result.value.canReuseSequence).toBe(false);
    expect(await store.get(KEY)).toEqual({ pending: true });
  });

  it('reports a reusable sequence on a rejection', async () => {
    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl: mockFetch(() =>
        jsonResponse({
          codigo: 2,
          estado: 'Rechazado',
          secuenciaUtilizada: false,
        }),
      ),
    });

    const result = await ecf.reconcileSubmission(XML);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.delivered).toBe(true);
    expect(result.value.canReuseSequence).toBe(true);
    expect(result.value.cleared).toBe(false);
  });

  it('rejects a document without an emitter RNC or e-NCF', async () => {
    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl: mockFetch(() => jsonResponse({})),
    });

    const result = await ecf.reconcileSubmission('<ECF><Encabezado/></ECF>');

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('VALIDATION');
  });

  it('points the pending error at the helper', async () => {
    const store = new InMemoryIdempotencyStore();
    await store.set(KEY, { pending: true });
    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      idempotencyStore: store,
      fetchImpl: mockFetch(() => jsonResponse({})),
    });

    const result = await ecf.sendElectronicDocument(XML, 'f.xml');

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('IDEMPOTENCY');
    expect(result.error.message).toBe(PENDING_SUBMISSION_MESSAGE);
    expect(result.error.message).toContain('reconcileSubmission');
  });
});
