import { describe, expect, it } from 'vitest';
import { ECF } from '../src/client.js';
import { Environment, StatusEnvironment } from '../src/environment.js';

const credentials = { key: 'unused-key', cert: 'unused-cert' };

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const SERVICE_STATUS = [
  { servicio: 'Autenticación', estatus: 'Disponible', ambiente: 'Produccion' },
  {
    servicio: 'Recepción FC',
    estatus: 'No Disponible',
    ambiente: 'Produccion',
  },
];

const MAINTENANCE = {
  ventanaMantenimientos: [
    {
      ambiente: 'Produccion',
      horaInicio: '1:00 PM',
      horaFin: '4:00 PM',
      dias: ['06-08-2020', '20-08-2020'],
    },
  ],
};

interface Captured {
  url: string;
  headers: Record<string, string>;
}

const capture = (
  body: unknown,
): { fetchImpl: typeof fetch; calls: Captured[] } => {
  const calls: Captured[] = [];
  const fetchImpl = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    calls.push({
      url: String(url),
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    return jsonResponse(body);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
};

describe('status service', () => {
  it('lists every service with the API key header', async () => {
    const { fetchImpl, calls } = capture(SERVICE_STATUS);
    const ecf = new ECF(credentials, Environment.Dev, {
      fetchImpl,
      statusApiKey: 'test-key',
    });

    const result = await ecf.getServiceStatus();

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toHaveLength(2);
    expect(result.value[0]?.servicio).toBe('Autenticación');
    expect(result.value[1]?.estatus).toBe('No Disponible');

    expect(calls[0]?.url).toBe(
      'https://statusecf.dgii.gov.do/api/estatusservicios/obtenerestatus',
    );
    expect(calls[0]?.headers.Authorization).toBe('Apikey test-key');
  });

  it('normalizes a single-object payload into a list', async () => {
    const { fetchImpl } = capture(SERVICE_STATUS[0]);
    const ecf = new ECF(credentials, Environment.Dev, { fetchImpl });

    const result = await ecf.getServiceStatus();

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.servicio).toBe('Autenticación');
  });

  it('does not send a bearer token to the status host', async () => {
    const { fetchImpl, calls } = capture(SERVICE_STATUS);
    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'dgii-token',
      fetchImpl,
    });

    await ecf.getServiceStatus();

    expect(calls[0]?.headers.Authorization).toBeUndefined();
  });

  it('unwraps the maintenance window container', async () => {
    const { fetchImpl, calls } = capture(MAINTENANCE);
    const ecf = new ECF(credentials, Environment.Dev, { fetchImpl });

    const result = await ecf.getMaintenanceWindows();

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.horaInicio).toBe('1:00 PM');
    expect(result.value[0]?.dias).toEqual(['06-08-2020', '20-08-2020']);
    expect(calls[0]?.url).toBe(
      'https://statusecf.dgii.gov.do/api/estatusservicios/obtenerventanasmantenimiento',
    );
  });

  it('accepts a bare array of maintenance windows', async () => {
    const { fetchImpl } = capture(MAINTENANCE.ventanaMantenimientos);
    const ecf = new ECF(credentials, Environment.Dev, { fetchImpl });

    const result = await ecf.getMaintenanceWindows();

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toHaveLength(1);
  });

  it('checks availability with the numeric environment code', async () => {
    const { fetchImpl, calls } = capture({ estado: 'Disponible' });
    const ecf = new ECF(credentials, Environment.Dev, { fetchImpl });

    const result = await ecf.checkServiceAvailability(
      StatusEnvironment.Production,
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.estado).toBe('Disponible');
    expect(calls[0]?.url).toContain(
      '/api/estatusservicios/verificarestado?ambiente=2',
    );
  });
});
