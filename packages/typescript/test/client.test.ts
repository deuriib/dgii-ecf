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

  it('exposes the singular mensaje acknowledgement', async () => {
    const fetchImpl = mockFetch(async () =>
      jsonResponse({ trackId: 't1', error: '', mensaje: 'Recibido' }),
    );

    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
    });
    const result = await ecf.sendElectronicDocument(
      signedEcf('130862346', 'E310000000002'),
      'f.xml',
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.mensaje).toBe('Recibido');
  });

  it('dispatches sendDocument to the endpoint the document belongs to', async () => {
    const urls: string[] = [];
    const fetchImpl = mockFetch(async (url) => {
      urls.push(url);
      return jsonResponse({ trackId: 't1' });
    });
    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
    });

    const general = await ecf.sendDocument(
      '<ECF><Encabezado><IdDoc><TipoeCF>31</TipoeCF></IdDoc>' +
        '<Totales><MontoTotal>1000.00</MontoTotal></Totales></Encabezado></ECF>',
      'f.xml',
    );
    expect(general.isOk()).toBe(true);

    const summary = await ecf.sendDocument(
      '<RFCE><Encabezado><IdDoc><TipoeCF>32</TipoeCF></IdDoc></Encabezado></RFCE>',
      'f.xml',
    );
    expect(summary.isOk()).toBe(true);

    expect(urls[0]).toContain('/TesteCF/recepcion/api/FacturasElectronicas');
    expect(urls[1]).toContain('/TesteCF/recepcionfc/api/recepcion/ecf');
  });

  it('rejects a misrouted E32 before any HTTP call', async () => {
    let calls = 0;
    const fetchImpl = mockFetch(async () => {
      calls += 1;
      return jsonResponse({});
    });
    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
    });

    const result = await ecf.sendDocument(
      '<ECF><Encabezado><IdDoc><TipoeCF>32</TipoeCF></IdDoc>' +
        '<Totales><MontoTotal>100.00</MontoTotal></Totales></Encabezado></ECF>',
      'f.xml',
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(calls).toBe(0);
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

  describe('commercial approval and void idempotency', () => {
    const approvalXml = (rnc: string, encf: string): string =>
      `<ACECF><DetalleAprobacionComercial><RNCEmisor>${rnc}</RNCEmisor>` +
      `<eNCF>${encf}</eNCF></DetalleAprobacionComercial></ACECF>`;

    const voidXml = (rnc: string, range: string): string =>
      `<ANECF><Encabezado><RNCEmisor>${rnc}</RNCEmisor></Encabezado>` +
      `<DetalleAnulacion><RangoNCF>${range}</RangoNCF></DetalleAnulacion></ANECF>`;

    const approvalPayload = {
      codigo: '1',
      estado: 'Aprobación comercial aprobada',
      mensaje: [],
    };
    const voidPayload = {
      rnc: '130862346',
      codigo: '0',
      nombre: 'Accepted',
      mensajes: [],
    };

    it('is idempotent for repeated commercial approvals', async () => {
      let calls = 0;
      const fetchImpl = mockFetch(async () => {
        calls += 1;
        return jsonResponse(approvalPayload);
      });
      const ecf = new ECF(credentials, Environment.Dev, {
        token: 'tok',
        fetchImpl,
      });
      const xml = approvalXml('130862346', 'E310000000001');

      const first = await ecf.sendCommercialApproval(xml, 'acecf.xml');
      const second = await ecf.sendCommercialApproval(xml, 'acecf.xml');

      expect(first.isOk()).toBe(true);
      expect(second.isOk()).toBe(true);
      expect(calls).toBe(1);
    });

    it('exposes the documented rejection vocabulary', async () => {
      const fetchImpl = mockFetch(async () =>
        jsonResponse({
          codigo: '2',
          estado: 'Aprobación comercial rechazada',
          mensaje: ['No encontrada'],
        }),
      );
      const ecf = new ECF(credentials, Environment.Dev, {
        token: 'tok',
        fetchImpl,
      });

      const result = await ecf.sendCommercialApproval(
        approvalXml('130862346', 'E310000000009'),
        'acecf.xml',
      );

      expect(result.isOk()).toBe(true);
      if (result.isErr()) return;
      expect(result.value.codigo).toBe('2');
      expect(result.value.estado).toBe('Aprobación comercial rechazada');
    });

    it('is idempotent for repeated void requests', async () => {
      let calls = 0;
      const fetchImpl = mockFetch(async () => {
        calls += 1;
        return jsonResponse(voidPayload);
      });
      const ecf = new ECF(credentials, Environment.Dev, {
        token: 'tok',
        fetchImpl,
      });
      const xml = voidXml('130862346', 'E310000000010');

      const first = await ecf.voidENCF(xml, 'anecf.xml');
      const second = await ecf.voidENCF(xml, 'anecf.xml');

      expect(first.isOk()).toBe(true);
      expect(second.isOk()).toBe(true);
      expect(calls).toBe(1);
    });

    it('keys the void flow on RangoNCF when eNCF is absent', async () => {
      const store = new InMemoryIdempotencyStore();
      const xml = voidXml('130862346', 'E310000000010');
      const digest = createHash('sha256').update(xml, 'utf8').digest('hex');
      const fetchImpl = mockFetch(async () => jsonResponse(voidPayload));
      const ecf = new ECF(credentials, Environment.Dev, {
        token: 'tok',
        fetchImpl,
        idempotencyStore: store,
      });

      const result = await ecf.voidENCF(xml, 'anecf.xml');

      expect(result.isOk()).toBe(true);
      expect(await store.get(`130862346:E310000000010:${digest}`)).toEqual(
        voidPayload,
      );
    });

    it('keys the void flow on the ANECF schema elements', async () => {
      const store = new InMemoryIdempotencyStore();
      const xml =
        '<ANECF><Encabezado><Version>1.0</Version>' +
        '<RncEmisor>130862346</RncEmisor>' +
        '<CantidadeNCFAnulados>10</CantidadeNCFAnulados>' +
        '<FechaHoraAnulacioneNCF>01-01-2026 10:00:00</FechaHoraAnulacioneNCF>' +
        '</Encabezado><DetalleAnulacion><Anulacion><NoLinea>1</NoLinea>' +
        '<TipoeCF>31</TipoeCF><TablaRangoSecuenciasAnuladaseNCF>' +
        '<Secuencias><SecuenciaeNCFDesde>E310000000010</SecuenciaeNCFDesde>' +
        '<SecuenciaeNCFHasta>E310000000019</SecuenciaeNCFHasta>' +
        '</Secuencias></TablaRangoSecuenciasAnuladaseNCF>' +
        '</Anulacion></DetalleAnulacion></ANECF>';
      const digest = createHash('sha256').update(xml, 'utf8').digest('hex');
      const fetchImpl = mockFetch(async () => jsonResponse(voidPayload));
      const ecf = new ECF(credentials, Environment.Dev, {
        token: 'tok',
        fetchImpl,
        idempotencyStore: store,
      });

      const result = await ecf.voidENCF(xml, 'anecf.xml');

      expect(result.isOk()).toBe(true);
      expect(await store.get(`130862346:E310000000010:${digest}`)).toEqual(
        voidPayload,
      );
    });

    it('refuses a commercial approval that is already pending', async () => {
      const store = new InMemoryIdempotencyStore();
      const xml = approvalXml('130862346', 'E310000000002');
      const key = `130862346:E310000000002:${createHash('sha256').update(xml, 'utf8').digest('hex')}`;
      await store.set(key, { pending: true });
      let calls = 0;
      const fetchImpl = mockFetch(async () => {
        calls += 1;
        return jsonResponse(approvalPayload);
      });
      const ecf = new ECF(credentials, Environment.Dev, {
        token: 'tok',
        fetchImpl,
        idempotencyStore: store,
      });

      const result = await ecf.sendCommercialApproval(xml, 'acecf.xml');

      expect(result.isErr()).toBe(true);
      if (result.isOk()) return;
      expect(result.error.code).toBe('IDEMPOTENCY');
      expect(calls).toBe(0);
    });

    it('clears the pending marker when a void fails', async () => {
      const store = new InMemoryIdempotencyStore();
      const xml = voidXml('130862346', 'E310000000011');
      const key = `130862346:E310000000011:${createHash('sha256').update(xml, 'utf8').digest('hex')}`;
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

      const first = await ecf.voidENCF(xml, 'anecf.xml');

      expect(first.isErr()).toBe(true);
      expect(await store.get(key)).toBeUndefined();
    });

    it('separates documents that share RNC and eNCF but differ in content', async () => {
      let calls = 0;
      const fetchImpl = mockFetch(async () => {
        calls += 1;
        return jsonResponse(approvalPayload);
      });
      const ecf = new ECF(credentials, Environment.Dev, {
        token: 'tok',
        fetchImpl,
      });

      await ecf.sendCommercialApproval(
        approvalXml('130862346', 'E310000000003'),
        'a.xml',
      );
      await ecf.sendCommercialApproval(
        `${approvalXml('130862346', 'E310000000003')}\n<!-- revised -->`,
        'b.xml',
      );

      expect(calls).toBe(2);
    });
  });
});

describe('directory listing', () => {
  const entry = {
    nombre: 'RECEPTOR SRL',
    rnc: '131880657',
    urlRecepcion: 'https://receptor.example/fe/recepcion',
    urlAceptacion: 'https://receptor.example/fe/aprobacion',
    urlOpcional: 'https://receptor.example/fe/autenticacion',
  };

  it('lists every published receiver', async () => {
    let capturedUrl = '';
    const fetchImpl = mockFetch(async (url) => {
      capturedUrl = url;
      return jsonResponse([entry, { ...entry, rnc: '101000001' }]);
    });
    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
    });

    const result = await ecf.getDirectoryListing();

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toHaveLength(2);
    expect(result.value[0]?.urlRecepcion).toBe(
      'https://receptor.example/fe/recepcion',
    );
    expect(capturedUrl).toContain(
      '/TesteCF/consultadirectorio/api/consultas/listado',
    );
  });

  it('normalizes a single-object payload', async () => {
    const fetchImpl = mockFetch(async () => jsonResponse(entry));
    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
    });

    const result = await ecf.getDirectoryListing();

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toHaveLength(1);
  });
});

describe('B2B applicability', () => {
  const e41 =
    '<ECF><Encabezado><IdDoc><TipoeCF>41</TipoeCF></IdDoc>' +
    '<Totales><MontoTotal>100.00</MontoTotal></Totales></Encabezado></ECF>';

  it('rejects an excluded type before any HTTP call', async () => {
    let calls = 0;
    const fetchImpl = mockFetch(async () => {
      calls += 1;
      return jsonResponse({ trackId: 't1' });
    });
    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
    });

    const result = await ecf.sendElectronicDocument(
      e41,
      'f.xml',
      'https://buyer.example',
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(calls).toBe(0);
  });

  it('sends it when enforcement is disabled', async () => {
    let calls = 0;
    const fetchImpl = mockFetch(async () => {
      calls += 1;
      return jsonResponse({ trackId: 't1' });
    });
    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
      enforceB2BRules: false,
    });

    const result = await ecf.sendElectronicDocument(
      e41,
      'f.xml',
      'https://buyer.example',
    );

    expect(result.isOk()).toBe(true);
    expect(calls).toBe(1);
  });
});

describe('B2B commercial approval', () => {
  const buyer = 'https://buyer.example';
  const acecf =
    '<ACECF><DetalleAprobacionComercial><RNCEmisor>130862346</RNCEmisor>' +
    '<eNCF>E310000000001</eNCF></DetalleAprobacionComercial></ACECF>';

  it('posts the ACECF to the buyer host and reports 200', async () => {
    let capturedUrl = '';
    const fetchImpl = mockFetch(async (url) => {
      capturedUrl = url;
      return jsonResponse({ received: true });
    });
    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
    });

    const result = await ecf.sendCommercialApproval(acecf, 'a.xml', buyer);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toEqual({ status: 200, accepted: true });
    expect(capturedUrl).toBe(
      'https://buyer.example/fe/aprobacioncomercial/api/ecf',
    );
  });

  it('reports a 400 as an unsatisfactory outcome, not a failure', async () => {
    const fetchImpl = mockFetch(
      async () => new Response('unsatisfactory', { status: 400 }),
    );
    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
    });

    const result = await ecf.sendCommercialApproval(acecf, 'a.xml', buyer);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toEqual({ status: 400, accepted: false });
  });

  it('surfaces a 5xx as an error', async () => {
    const fetchImpl = mockFetch(
      async () => new Response('boom', { status: 503 }),
    );
    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
      resilience: { maxRetries: 1 },
    });

    const result = await ecf.sendCommercialApproval(acecf, 'a.xml', buyer);

    expect(result.isErr()).toBe(true);
  });

  it('is idempotent for repeated B2B approvals', async () => {
    let calls = 0;
    const fetchImpl = mockFetch(async () => {
      calls += 1;
      return jsonResponse({ received: true });
    });
    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
    });

    await ecf.sendCommercialApproval(acecf, 'a.xml', buyer);
    await ecf.sendCommercialApproval(acecf, 'a.xml', buyer);

    expect(calls).toBe(1);
  });
});
