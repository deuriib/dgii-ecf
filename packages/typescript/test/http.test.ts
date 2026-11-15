import { describe, expect, it } from 'vitest';
import { HttpClient, InMemoryIdempotencyStore } from '../src/http.js';

const TTL_MS = 1_000;
const SWEEP_THRESHOLD = 1_000;

interface FakeClock {
  readonly now: () => number;
  readonly advance: (ms: number) => void;
}

const fakeClock = (startMs = 0): FakeClock => {
  let current = startMs;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
};

const makeStore = (clock: FakeClock): InMemoryIdempotencyStore =>
  new InMemoryIdempotencyStore({ ttlMs: TTL_MS, now: clock.now });

describe('InMemoryIdempotencyStore', () => {
  it('returns a value while it is still fresh', async () => {
    const clock = fakeClock();
    const store = makeStore(clock);
    await store.set('key', { accepted: true });

    clock.advance(TTL_MS - 1);

    await expect(store.get('key')).resolves.toEqual({ accepted: true });
  });

  it('drops a value once the TTL elapses', async () => {
    const clock = fakeClock();
    const store = makeStore(clock);
    await store.set('key', { accepted: true });

    clock.advance(TTL_MS);

    await expect(store.get('key')).resolves.toBeUndefined();
    expect(store.size).toBe(0);
  });

  it('restarts the TTL when the key is written again', async () => {
    const clock = fakeClock();
    const store = makeStore(clock);
    await store.set('key', { attempt: 1 });

    clock.advance(TTL_MS - 1);
    await store.set('key', { attempt: 2 });
    clock.advance(TTL_MS - 1);

    await expect(store.get('key')).resolves.toEqual({ attempt: 2 });
  });

  it('removes a key on delete', async () => {
    const clock = fakeClock();
    const store = makeStore(clock);
    await store.set('key', { accepted: true });

    await store.delete('key');

    await expect(store.get('key')).resolves.toBeUndefined();
    expect(store.size).toBe(0);
  });

  it('reports only live entries in size', async () => {
    const clock = fakeClock();
    const store = makeStore(clock);
    await store.set('fresh', { accepted: true });
    await store.set('stale', { accepted: true });

    clock.advance(TTL_MS - 1);
    await store.set('fresh', { accepted: true });
    clock.advance(1);

    expect(store.size).toBe(1);
  });

  it('sweeps expired entries once the map passes the threshold', async () => {
    const clock = fakeClock();
    const store = makeStore(clock);
    for (let index = 0; index <= SWEEP_THRESHOLD; index += 1) {
      await store.set(`key-${index}`, { index });
    }

    clock.advance(TTL_MS);
    await store.set('fresh', { accepted: true });

    expect(store.size).toBe(1);
    await expect(store.get('fresh')).resolves.toEqual({ accepted: true });
  });

  it('rejects a non-positive ttl', () => {
    expect(() => new InMemoryIdempotencyStore({ ttlMs: 0 })).toThrow(
      RangeError,
    );
    expect(() => new InMemoryIdempotencyStore({ ttlMs: -1 })).toThrow(
      RangeError,
    );
  });
});

describe('HttpClient redirects', () => {
  const requested: Array<RequestInit | undefined> = [];

  const redirectingFetch = (status: number): typeof fetch =>
    ((_url: string | URL | Request, init?: RequestInit) => {
      requested.push(init);
      return Promise.resolve(
        new Response('', {
          status,
          headers: { location: 'https://attacker.example/collect' },
        }),
      );
    }) as unknown as typeof fetch;

  it.each([301, 302, 303, 307, 308])(
    'refuses a %i instead of replaying the signed document',
    async (status) => {
      const client = new HttpClient({
        baseUrl: 'https://ecf.dgii.gov.do',
        token: 'tok',
        fetchImpl: redirectingFetch(status),
      });

      const result = await client.postMultipart(
        'https://ecf.dgii.gov.do/eCF/recepcion/api/FacturasElectronicas',
        'f.xml',
        '<ECF/>',
        { absoluteUrl: true },
      );

      expect(result.isErr()).toBe(true);
      if (result.isOk()) return;
      expect(result.error.status).toBe(status);
      expect(result.error.message).toContain('redirect');
      expect(result.error.retryable).toBe(false);
      // `fetch` never gets the chance to follow.
      expect(requested[0]?.redirect).toBe('manual');
    },
  );
});
