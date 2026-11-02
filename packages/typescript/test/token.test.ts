import { describe, expect, it } from 'vitest';
import forge from 'node-forge';
import { ECF } from '../src/client.js';
import { Environment } from '../src/environment.js';

interface SelfSigned {
  key: string;
  cert: string;
}

const createSelfSigned = (): SelfSigned => {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 60 * 60 * 1000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const attrs = [{ name: 'commonName', value: 'dgii-ecf-test' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    key: forge.pki.privateKeyToPem(keys.privateKey),
    cert: forge.pki.certificateToPem(cert),
  };
};

const SEED =
  '<?xml version="1.0" encoding="utf-8"?><SemillaModel>' +
  '<valor>0000000-0000-0000-0000-000000000000</valor>' +
  '<fecha>2026-01-01T00:00:00Z</fecha></SemillaModel>';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const seedResponse = (): Response =>
  new Response(SEED, { headers: { 'content-type': 'text/xml' } });

const trackingPayload = {
  trackId: 't1',
  codigo: 1,
  estado: 'Aceptado',
  rnc: '130862346',
  encf: 'E310000000001',
  secuenciaUtilizada: true,
  fechaRecepcion: '01-01-2026 10:00:00',
};

const HOUR_MS = 60 * 60 * 1000;

describe('token lifecycle', () => {
  it('refreshes the token before it expires', async () => {
    let now = 1_000_000_000_000;
    let validations = 0;
    const fetchImpl = (async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes('/Semilla')) return seedResponse();
      if (target.includes('ValidarSemilla')) {
        validations += 1;
        return jsonResponse({
          token: `tok-${validations}`,
          expira: new Date(now + HOUR_MS).toISOString(),
          expedido: new Date(now).toISOString(),
        });
      }
      return jsonResponse(trackingPayload);
    }) as unknown as typeof fetch;

    const ecf = new ECF(createSelfSigned(), Environment.Dev, {
      fetchImpl,
      now: () => now,
    });

    const auth = await ecf.authenticate();
    expect(auth.isOk()).toBe(true);
    expect(validations).toBe(1);

    // Inside the 5-minute refresh window.
    now += HOUR_MS - 60_000;
    const status = await ecf.statusTrackId('t1');

    expect(status.isOk()).toBe(true);
    expect(validations).toBe(2);
  });

  it('does not refresh while the token is fresh', async () => {
    let now = 1_000_000_000_000;
    let validations = 0;
    const fetchImpl = (async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes('/Semilla')) return seedResponse();
      if (target.includes('ValidarSemilla')) {
        validations += 1;
        return jsonResponse({
          token: `tok-${validations}`,
          expira: new Date(now + HOUR_MS).toISOString(),
          expedido: new Date(now).toISOString(),
        });
      }
      return jsonResponse(trackingPayload);
    }) as unknown as typeof fetch;

    const ecf = new ECF(createSelfSigned(), Environment.Dev, {
      fetchImpl,
      now: () => now,
    });

    await ecf.authenticate();
    now += 30 * 60 * 1000;
    await ecf.statusTrackId('t1');

    expect(validations).toBe(1);
  });

  it('re-authenticates once on 401 and replays the request', async () => {
    let validations = 0;
    let statusCalls = 0;
    const fetchImpl = (async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes('/Semilla')) return seedResponse();
      if (target.includes('ValidarSemilla')) {
        validations += 1;
        return jsonResponse({
          token: `tok-${validations}`,
          expira: new Date(Date.now() + HOUR_MS).toISOString(),
          expedido: new Date().toISOString(),
        });
      }
      statusCalls += 1;
      if (statusCalls === 1) {
        return jsonResponse({ message: 'Token expired' }, 401);
      }
      return jsonResponse(trackingPayload);
    }) as unknown as typeof fetch;

    const ecf = new ECF(createSelfSigned(), Environment.Dev, { fetchImpl });
    await ecf.authenticate();

    const result = await ecf.statusTrackId('t1');

    expect(result.isOk()).toBe(true);
    expect(validations).toBe(2);
    expect(statusCalls).toBe(2);
  });

  it('coalesces concurrent refreshes into one authentication', async () => {
    let now = 1_000_000_000_000;
    let validations = 0;
    const fetchImpl = (async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes('/Semilla')) return seedResponse();
      if (target.includes('ValidarSemilla')) {
        validations += 1;
        return jsonResponse({
          token: `tok-${validations}`,
          expira: new Date(now + HOUR_MS).toISOString(),
          expedido: new Date(now).toISOString(),
        });
      }
      return jsonResponse(trackingPayload);
    }) as unknown as typeof fetch;

    const ecf = new ECF(createSelfSigned(), Environment.Dev, {
      fetchImpl,
      now: () => now,
    });

    await ecf.authenticate();
    now += HOUR_MS;

    await Promise.all([
      ecf.statusTrackId('a'),
      ecf.statusTrackId('b'),
      ecf.statusTrackId('c'),
    ]);

    expect(validations).toBe(2);
  });

  it('never refreshes proactively for a pre-supplied token', async () => {
    let validations = 0;
    const fetchImpl = (async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes('/Semilla')) return seedResponse();
      if (target.includes('ValidarSemilla')) {
        validations += 1;
        return jsonResponse({ token: 'tok', expira: '', expedido: '' });
      }
      return jsonResponse(trackingPayload);
    }) as unknown as typeof fetch;

    const ecf = new ECF(createSelfSigned(), Environment.Dev, {
      token: 'pre-supplied',
      fetchImpl,
      now: () => 2_000_000_000_000,
    });

    await ecf.statusTrackId('t1');

    expect(validations).toBe(0);
  });
});
