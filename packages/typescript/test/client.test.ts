import { createHash } from 'node:crypto';
import forge from 'node-forge';
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

  it('names the multipart part xml with the caller filename', async () => {
    let captured: RequestInit | undefined;
    const fetchImpl = mockFetch(async (_url, init) => {
      captured = init;
      return jsonResponse({ trackId: 't1' });
    });

    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
    });
    const result = await ecf.sendElectronicDocument(
      signedEcf('130862346', 'E310000000003'),
      'f.xml',
    );

    expect(result.isOk()).toBe(true);
    const form = captured?.body;
    expect(form).toBeInstanceOf(FormData);
    if (!(form instanceof FormData)) return;
    const part = form.get('xml');
    expect(part).toBeInstanceOf(File);
    if (!(part instanceof File)) return;
    expect(part.name).toBe('f.xml');
    expect(part.type).toBe('application/xml');

    const headers = captured?.headers as Record<string, string> | undefined;
    expect(headers?.Accept).toBe('application/json');
    expect(headers?.['Content-Length']).toBeUndefined();
    expect(headers?.['content-length']).toBeUndefined();
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

  it('does not retry a submission on 5xx; the caller retries safely', async () => {
    // A submission is non-idempotent on DGII's side: it does not de-duplicate by
    // e-NCF, so an in-SDK retry cannot distinguish "rejected" from "accepted,
    // answer lost". One call used to put three copies of the same e-NCF into
    // DGII's hands. A definitive status clears the marker, so the retry belongs
    // to the caller, who can make it deliberately.
    let calls = 0;
    const fetchImpl = mockFetch(async () => {
      calls += 1;
      return new Response('boom', { status: 503 });
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

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.status).toBe(503);
    expect(calls).toBe(1);
  });

  it('still retries a query on 5xx, where a retry is safe', async () => {
    let calls = 0;
    const fetchImpl = mockFetch(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response('boom', { status: 503 });
      }
      return jsonResponse({ estado: 'Aceptado', secuenciaUtilizada: true });
    });

    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
      resilience: { maxRetries: 3, retryInitialDelayMs: 1 },
    });
    const result = await ecf.statusTrackId('TRACK-1');

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

/**
 * Regression tests for the fiscal-integrity paths. Each one pins a behaviour
 * where a wrong answer issues a duplicate e-CF or a duplicate tax document.
 */
describe('submission integrity', () => {
  const idempotencyKey = (rnc: string, encf: string, xml: string): string =>
    `${rnc}:${encf}:${createHash('sha256').update(xml, 'utf8').digest('hex')}`;

  it('does not treat a 2xx with an unreadable body as a delivered submission', async () => {
    let sends = 0;
    const fetchImpl = mockFetch(async () => {
      sends += 1;
      return new Response('', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
    });
    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
    });
    const xml = signedEcf('130862346', 'E310000000010');

    const first = await ecf.sendElectronicDocument(xml, 'f.xml');
    expect(first.isErr()).toBe(true);
    if (first.isOk()) return;
    expect(first.error.code).toBe('VALIDATION');
    expect(first.error.message).toContain('reconcile');

    // The marker must survive: a second call is a reconcile, not a re-send.
    const second = await ecf.sendElectronicDocument(xml, 'f.xml');
    expect(second.isErr()).toBe(true);
    if (second.isOk()) return;
    expect(second.error.code).toBe('IDEMPOTENCY');
    expect(sends).toBe(1);
  });

  it('scopes the idempotency key to the destination', async () => {
    const urls: string[] = [];
    const fetchImpl = mockFetch(async (url) => {
      urls.push(url);
      return jsonResponse({ trackId: 't1' });
    });
    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
      enforceB2BRules: false,
    });
    const xml = signedEcf('130862346', 'E310000000011');

    const toDgii = await ecf.sendElectronicDocument(xml, 'f.xml');
    const toBuyer = await ecf.sendElectronicDocument(
      xml,
      'f.xml',
      'https://buyer.example',
    );

    expect(toDgii.isOk()).toBe(true);
    expect(toBuyer.isOk()).toBe(true);
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain('buyer.example/fe/recepcion/api/ecf');

    // A repeat DGII submit must be answered from the DGII cache, not the
    // buyer's: the buyer submit must not clobber the DGII-scoped key.
    const repeatDgii = await ecf.sendElectronicDocument(xml, 'f.xml');
    expect(repeatDgii.isOk()).toBe(true);
    expect(urls).toHaveLength(2);

    // The key shape is the contract, not just the transmission count.
    const { InMemoryIdempotencyStore: Store } = await import('../src/http.js');
    const store = new Store();
    const capturing = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl: mockFetch(async () => jsonResponse({ trackId: 't1' })),
      idempotencyStore: store,
      enforceB2BRules: false,
    });
    await capturing.sendElectronicDocument(xml, 'f.xml');
    await capturing.sendElectronicDocument(
      xml,
      'f.xml',
      'https://Buyer.Example/',
    );
    const stored = [
      ...(store as unknown as { entries: Map<string, unknown> }).entries.keys(),
    ];
    expect(stored).toHaveLength(2);
    expect(stored.some((key) => key.endsWith('@https://buyer.example'))).toBe(
      true,
    );
  });

  it('honours a legacy `{pending: true}` marker instead of replaying it as delivered', async () => {
    let sends = 0;
    const store = new InMemoryIdempotencyStore();
    const xml = signedEcf('130862346', 'E310000000012');
    await store.set(idempotencyKey('130862346', 'E310000000012', xml), {
      pending: true,
    });
    const fetchImpl = mockFetch(async () => {
      sends += 1;
      return jsonResponse({ trackId: 't1' });
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
    expect(sends).toBe(0);
  });

  it('keeps the marker when the transmit outcome is unknown', async () => {
    let sends = 0;
    const store = new InMemoryIdempotencyStore();
    const fetchImpl = mockFetch(async () => {
      sends += 1;
      throw new TypeError('fetch failed');
    });
    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
      idempotencyStore: store,
      resilience: { maxRetries: 1, retryInitialDelayMs: 1 },
    });
    const xml = signedEcf('130862346', 'E310000000013');

    const first = await ecf.sendElectronicDocument(xml, 'f.xml');
    expect(first.isErr()).toBe(true);
    if (first.isOk()) return;
    expect(first.error.code).toBe('IDEMPOTENCY');
    expect(first.error.message).toContain('outcome is unknown');

    // The write side is pinned: the store holds the shared marker shape and the
    // key survives the ambiguous failure so a caller can reconcile.
    const keys = [
      ...(store as unknown as { entries: Map<string, unknown> }).entries.keys(),
    ];
    expect(keys).toEqual([idempotencyKey('130862346', 'E310000000013', xml)]);
    await expect(store.get(keys[0] as string)).resolves.toEqual({
      __pending__: true,
    });

    const second = await ecf.sendElectronicDocument(xml, 'f.xml');
    expect(second.isErr()).toBe(true);
    if (second.isOk()) return;
    expect(second.error.message).toContain('already pending');
    expect(sends).toBe(1);
  });

  it('writes the shared `__pending__` marker shape before transmitting', async () => {
    const store = new InMemoryIdempotencyStore();
    const keys: string[] = [];
    let marker: unknown;
    const fetchImpl = mockFetch(async () => {
      // Read the store while the request is in flight: this is the marker both
      // packages must agree on, and the one a re-read in Python must recognise.
      keys.push(
        ...(
          store as unknown as { entries: Map<string, unknown> }
        ).entries.keys(),
      );
      marker = await store.get(keys[0] as string);
      return jsonResponse({ trackId: 't1' });
    });
    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      fetchImpl,
      idempotencyStore: store,
    });

    await ecf.sendElectronicDocument(
      signedEcf('130862346', 'E310000000015'),
      'f.xml',
    );

    expect(marker).toEqual({ __pending__: true });
    expect(keys[0]).not.toContain('@');
  });

  it('releases a destination-scoped marker only for that destination', async () => {
    const xml = signedEcf('130862346', 'E310000000014');
    const store = new InMemoryIdempotencyStore();
    await store.set(
      `${idempotencyKey('130862346', 'E310000000014', xml)}@https://buyer.example`,
      { trackId: 't1' },
    );
    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'tok',
      idempotencyStore: store,
      fetchImpl: mockFetch(async () => jsonResponse({ trackId: 't1' })),
    });

    // A DGII submission of the same document is a separate obligation.
    const toDgii = await ecf.sendElectronicDocument(xml, 'f.xml');
    expect(toDgii.isOk()).toBe(true);
    // ... and the buyer entry is still there for the buyer host.
    await expect(
      store.get(
        `${idempotencyKey('130862346', 'E310000000014', xml)}@https://buyer.example`,
      ),
    ).resolves.toEqual({ trackId: 't1' });
  });
});

describe('buyerHost HTTPS validation and per-origin token isolation', () => {
  it('rejects non-HTTPS or credential-bearing buyerHost URLs with VALIDATION and 0 network calls', async () => {
    let calls = 0;
    const fetchImpl = mockFetch(async () => {
      calls += 1;
      return jsonResponse({ trackId: 't1' });
    });
    const store = new InMemoryIdempotencyStore();
    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'dgii-tok',
      fetchImpl,
      idempotencyStore: store,
      enforceB2BRules: false,
    });
    const xml = signedEcf('130862346', 'E310000000090');

    for (const invalidHost of [
      'http://buyer.example.com',
      'ftp://buyer.example.com',
      'https://',
      'https://buyer.example.com:notaport',
      'https://user:pass@buyer.example.com',
      'https://user@buyer.example.com',
      'not-a-url',
    ]) {
      const sendRes = await ecf.sendElectronicDocument(
        xml,
        'f.xml',
        invalidHost,
      );
      expect(sendRes.isErr()).toBe(true);
      if (sendRes.isErr()) {
        expect(sendRes.error.code).toBe('VALIDATION');
      }

      const sendDocRes = await ecf.sendDocument(xml, 'f.xml', invalidHost);
      expect(sendDocRes.isErr()).toBe(true);
      if (sendDocRes.isErr()) {
        expect(sendDocRes.error.code).toBe('VALIDATION');
      }

      const authRes = await ecf.authenticate(invalidHost);
      expect(authRes.isErr()).toBe(true);
      if (authRes.isErr()) {
        expect(authRes.error.code).toBe('VALIDATION');
      }

      const approvalRes = await ecf.sendCommercialApproval(
        xml,
        'a.xml',
        invalidHost,
      );
      expect(approvalRes.isErr()).toBe(true);
      if (approvalRes.isErr()) {
        expect(approvalRes.error.code).toBe('VALIDATION');
      }

      const reconcileRes = await ecf.reconcileSubmission(xml, invalidHost);
      expect(reconcileRes.isErr()).toBe(true);
      if (reconcileRes.isErr()) {
        expect(reconcileRes.error.code).toBe('VALIDATION');
      }
    }

    expect(calls).toBe(0);
    expect(store.size).toBe(0);
  });

  it('never sends the DGII bearer token to a buyerHost and preserves DGII token on BaseUrl.CF', async () => {
    const capturedHeaders: Record<string, string | undefined> = {};
    const fetchImpl = mockFetch(async (url, init) => {
      const headers = init?.headers as Record<string, string> | undefined;
      capturedHeaders[url] = headers?.Authorization;
      if (url.includes('recepcionfc')) {
        return jsonResponse({
          codigo: 1,
          estado: 'Aceptado',
          encf: 'E320000000001',
          secuenciaUtilizada: true,
        });
      }
      return jsonResponse({ trackId: 't1' });
    });

    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'dgii-secret-token',
      fetchImpl,
      enforceB2BRules: false,
    });

    const toBuyer = await ecf.sendElectronicDocument(
      signedEcf('130862346', 'E310000000091'),
      'f.xml',
      'https://buyer.example.com',
    );
    expect(toBuyer.isOk()).toBe(true);
    expect(
      capturedHeaders['https://buyer.example.com/fe/recepcion/api/ecf'],
    ).toBeUndefined();

    const toDgii = await ecf.sendElectronicDocument(
      signedEcf('130862346', 'E310000000092'),
      'f.xml',
    );
    expect(toDgii.isOk()).toBe(true);
    expect(
      capturedHeaders[
        'https://ecf.dgii.gov.do/TesteCF/recepcion/api/FacturasElectronicas'
      ],
    ).toBe('Bearer dgii-secret-token');

    const toSummary = await ecf.sendSummary(
      '<RFCE><Encabezado><RNCEmisor>130862346</RNCEmisor><IdDoc><eNCF>E320000000001</eNCF></IdDoc></Encabezado></RFCE>',
      'rfce.xml',
    );
    expect(toSummary.isOk()).toBe(true);
    expect(
      capturedHeaders[
        'https://fc.dgii.gov.do/TesteCF/recepcionfc/api/recepcion/ecf'
      ],
    ).toBe('Bearer dgii-secret-token');
  });

  it('does not trigger DGII token refresh when a buyerHost returns 401', async () => {
    const urls: string[] = [];
    const fetchImpl = mockFetch(async (url) => {
      urls.push(url);
      if (url.startsWith('https://buyer.example.com')) {
        return jsonResponse({ message: 'unauthorized' }, 401);
      }
      return jsonResponse({ trackId: 't-dgii' });
    });

    const ecf = new ECF(credentials, Environment.Dev, {
      token: 'dgii-valid-token',
      fetchImpl,
      enforceB2BRules: false,
    });

    const buyerRes = await ecf.sendElectronicDocument(
      signedEcf('130862346', 'E310000000095'),
      'f.xml',
      'https://buyer.example.com',
    );
    expect(buyerRes.isErr()).toBe(true);
    expect(urls).toEqual(['https://buyer.example.com/fe/recepcion/api/ecf']);
  });

  it('stores buyerHost tokens per origin without clobbering the DGII token', async () => {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date(Date.now() - 60_000);
    cert.validity.notAfter = new Date(Date.now() + 3_600_000);
    const attrs = [{ name: 'commonName', value: 'dgii-ecf-test' }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    const realCreds = {
      key: forge.pki.privateKeyToPem(keys.privateKey),
      cert: forge.pki.certificateToPem(cert),
    };

    const authHeadersByUrl: Record<string, string | undefined> = {};
    const fetchImpl = mockFetch(async (url, init) => {
      const headers = init?.headers as Record<string, string> | undefined;
      authHeadersByUrl[url] = headers?.Authorization;
      if (url.endsWith('/semilla')) {
        return new Response(
          '<?xml version="1.0" encoding="utf-8"?><SemillaModel><valor>seed</valor></SemillaModel>',
          { status: 200, headers: { 'content-type': 'application/xml' } },
        );
      }
      if (
        url.includes('validarsemilla') ||
        url.includes('validacioncertificado')
      ) {
        const isBuyer = url.startsWith('https://buyer.example.com');
        return jsonResponse({
          token: isBuyer ? 'buyer-token-xyz' : 'dgii-token-abc',
          expira: '2099-01-01T00:00:00Z',
          expedido: '2026-01-01T00:00:00Z',
        });
      }
      return jsonResponse({ trackId: 't-ok' });
    });

    const ecf = new ECF(realCreds, Environment.Dev, {
      token: 'dgii-initial-token',
      fetchImpl,
      enforceB2BRules: false,
    });

    const buyerAuth = await ecf.authenticate('https://buyer.example.com');
    expect(buyerAuth.isOk()).toBe(true);

    await ecf.sendElectronicDocument(
      signedEcf('130862346', 'E310000000093'),
      'f.xml',
      'https://buyer.example.com',
    );
    await ecf.sendElectronicDocument(
      signedEcf('130862346', 'E310000000094'),
      'f.xml',
    );

    expect(
      authHeadersByUrl['https://buyer.example.com/fe/recepcion/api/ecf'],
    ).toBe('Bearer buyer-token-xyz');
    expect(
      authHeadersByUrl[
        'https://ecf.dgii.gov.do/TesteCF/recepcion/api/FacturasElectronicas'
      ],
    ).toBe('Bearer dgii-initial-token');
  });
});
