import { createHash } from 'node:crypto';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { ECF } from '../src/client.js';
import { Endpoint, Environment, buildUrl } from '../src/environment.js';
import {
  InMemoryIdempotencyStore,
  type IdempotencyStore,
} from '../src/http.js';
import {
  PENDING_SUBMISSION_MESSAGE,
  canReuseSequence,
} from '../src/reconciliation.js';
import type {
  InquiryInvoiceSummary,
  InquiryStatusResponse,
  TrackingStatusResponse,
} from '../src/types.js';

const credentials = { key: 'unused-key', cert: 'unused-cert' };

/** A signed general e-CF, the only root element that publishes a reuse flag. */
const ECF_XML =
  '<ECF><Encabezado><RNCEmisor>130862346</RNCEmisor>' +
  '<IdDoc><eNCF>E310000000001</eNCF></IdDoc></Encabezado></ECF>';

/** A signed RFCE summary: same reconcile entry point, different root and id. */
const RFCE_XML =
  '<RFCE><Encabezado><RNCEmisor>130862346</RNCEmisor>' +
  '<IdDoc><SecuenciaeNCFDesde>E320000000001</SecuenciaeNCFDesde></IdDoc>' +
  '</Encabezado></RFCE>';

const ECF_ENCF = 'E310000000001';
const RFCE_ENCF = 'E320000000001';

/**
 * Any root element, so a test can prove the reuse gate keys on `ECF` alone —
 * DGII publishes `secuenciaUtilizada` on no other e-CF.
 */
const xmlWithRoot = (root: string, idElement: string, encf: string): string =>
  `<${root}><Encabezado><RNCEmisor>130862346</RNCEmisor>` +
  `<IdDoc><${idElement}>${encf}</${idElement}></IdDoc></Encabezado></${root}>`;

/** The idempotency key reconcile recomputes: RNC + e-NCF + SHA-256(signed XML). */
const keyFor = (xml: string, encf: string): string =>
  `130862346:${encf}:${createHash('sha256').update(xml, 'utf8').digest('hex')}`;

const ECF_KEY = keyFor(ECF_XML, ECF_ENCF);
const RFCE_KEY = keyFor(RFCE_XML, RFCE_ENCF);

/** Request URLs, including the query parameter names DGII expects. */
const inquiryStatusUrl = (encf: string): string =>
  `${buildUrl(Environment.Dev, Endpoint.InquiryStatus)}` +
  `?rncEmisor=130862346&ncfElectronico=${encf}`;

const trackStatusesUrl = (encf: string): string =>
  `${buildUrl(Environment.Dev, Endpoint.AllTrackingEcf)}` +
  `?rncEmisor=130862346&encf=${encf}`;

const statusTrackIdUrl = (trackId: string): string =>
  `${buildUrl(Environment.Dev, Endpoint.TrackResultStatus)}?trackId=${trackId}`;

/** DGII's documented `consultaestado` states (TEC-02, "Consulta de estado e-CF"). */
const INQUIRY_CODES = {
  'No encontrado': 0,
  Aceptado: 1,
  Rechazado: 2,
} as const;

type InquiryEstado = keyof typeof INQUIRY_CODES;

/**
 * `consultaestado` as DGII actually answers it: the eleven published elements
 * and **no** `secuenciaUtilizada` (TEC-02, pp. 26-29). Putting the flag here is
 * the defect #126 fixes, so no fixture in this file may carry it.
 */
const inquiryPayload = (estado: InquiryEstado): Record<string, unknown> => ({
  codigo: INQUIRY_CODES[estado],
  estado,
  rncEmisor: '130862346',
  ncfElectronico: ECF_ENCF,
  montoTotal: 1180,
  totalITBIS: 180,
  fechaEmision: '01-01-2026 10:00:00',
  fechaFirma: '01-01-2026 10:00:00',
  rncComprador: '101010101',
  codigoSeguridad: 'a1b2c3',
  idExtranjero: '',
});

/** One `consultatrackids` entry as DGII publishes it (`{trackId, estado, fechaRecepcion}`). */
const trackEntry = (
  over: Record<string, unknown> = {},
): Record<string, unknown> => ({
  trackId: 'track-1',
  estado: 'Rechazado',
  fechaRecepcion: '01-01-2026 10:05:00',
  ...over,
});

/** `consultaresultado` as DGII publishes it, flag included (TEC-02, pp. 23-25). */
const trackResult = (
  over: Record<string, unknown> = {},
): Record<string, unknown> => ({
  trackId: 'track-1',
  codigo: 2,
  estado: 'Rechazado',
  rnc: '130862346',
  encf: ECF_ENCF,
  secuenciaUtilizada: false,
  fechaRecepcion: '01-01-2026 10:05:00',
  ...over,
});

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** A `200` whose body is empty — the answer the SDK must never read as "no record". */
const emptyResponse = (): Response => new Response(null, { status: 200 });

type Routes = Record<string, () => Response>;

interface Scenario {
  ecf: ECF;
  /** Every URL the client requested, in order. */
  urls: string[];
  store: IdempotencyStore;
}

/**
 * Route the mocked `fetch` by URL prefix and record the request order, so a
 * test can assert the calls DGII actually receives — the wire, not the code
 * path. An unrouted URL answers `404`, which surfaces as a failure instead of
 * silently succeeding.
 */
const scenario = (routes: Routes): Scenario => {
  const urls: string[] = [];
  const fetchImpl = ((url: string | URL | Request) => {
    const target = String(url);
    urls.push(target);
    const prefix = Object.keys(routes).find((key) => target.startsWith(key));
    const route = prefix === undefined ? undefined : routes[prefix];
    return Promise.resolve(
      route === undefined ? jsonResponse({ error: 'unrouted' }, 404) : route(),
    );
  }) as unknown as typeof fetch;
  const store = new InMemoryIdempotencyStore();
  const ecf = new ECF(credentials, Environment.Dev, {
    token: 'tok',
    idempotencyStore: store,
    fetchImpl,
    // A 5xx answer is retried; one attempt keeps that case fast. The retry
    // predicate itself is out of scope for #126.
    resilience: { maxRetries: 1, retryInitialDelayMs: 1 },
  });
  return { ecf, urls, store };
};

/** The marker shape `submitIdempotent` writes before transmitting. */
const PENDING_MARKER = { pending: true } as const;

const seedMarker = (store: IdempotencyStore, key: string): Promise<void> =>
  store.set(key, PENDING_MARKER);

const markerOf = (store: IdempotencyStore, key: string): Promise<unknown> =>
  store.get(key);

const firstPath = (url: string): string => url.split('?')[0];

/**
 * The HTTP layer casts the decoded body, so a wire payload can reach the
 * predicate without the fields its type declares. Tests keep the payload
 * exactly as DGII sends it and cast once, here.
 */
const asTrackResponse = (
  payload: Record<string, unknown>,
): TrackingStatusResponse => payload as unknown as TrackingStatusResponse;

describe('canReuseSequence', () => {
  it('accepts only responses that publish the flag, at compile time', () => {
    // P2: passing the `consultaestado` response is the defect #126 fixes, so it
    // must not typecheck — and neither must a bare `{secuenciaUtilizada}`.
    expectTypeOf(canReuseSequence)
      .parameter(0)
      .toEqualTypeOf<TrackingStatusResponse | InquiryInvoiceSummary>();

    const inquiryResponse = {
      codigo: 2,
      estado: 'Rechazado',
    } as InquiryStatusResponse;
    // @ts-expect-error — `consultaestado` carries no flag, so reconcile must
    // never hand its response to this predicate (the exact #126 defect).
    expect(canReuseSequence(inquiryResponse)).toBe(false);
  });

  it('is true only when DGII says the rejection left the sequence reusable', () => {
    expect(canReuseSequence(asTrackResponse(trackResult()))).toBe(true);
  });

  it('is false when the flag says the sequence is consumed', () => {
    expect(
      canReuseSequence(
        asTrackResponse(trackResult({ secuenciaUtilizada: true })),
      ),
    ).toBe(false);
  });

  it('is false for a non-rejection, even with the flag present', () => {
    expect(
      canReuseSequence(
        asTrackResponse(trackResult({ estado: 'Aceptado', codigo: 1 })),
      ),
    ).toBe(false);
  });

  it('treats an absent or null flag as not reusable', () => {
    const withoutFlag = trackResult();
    delete withoutFlag.secuenciaUtilizada;
    expect(canReuseSequence(asTrackResponse(withoutFlag))).toBe(false);
    expect(
      canReuseSequence(
        asTrackResponse(trackResult({ secuenciaUtilizada: null })),
      ),
    ).toBe(false);
  });

  it('answers false instead of throwing when estado is absent', () => {
    // T-K: the decoded body is an unchecked cast, so `{secuenciaUtilizada:false}`
    // alone reaches the predicate. It must not raise a TypeError.
    expect(
      canReuseSequence(asTrackResponse({ secuenciaUtilizada: false })),
    ).toBe(false);
  });

  it('answers false instead of throwing when estado is not a string', () => {
    // R17a/R17b: the cast is unchecked, so a corrupt or foreign body can carry
    // a number or an object where the type declares `TrackStatusEnum`. The
    // predicate is total — a value, never a TypeError out of reconcile.
    expect(canReuseSequence(asTrackResponse(trackResult({ estado: 42 })))).toBe(
      false,
    );
    expect(canReuseSequence(asTrackResponse(trackResult({ estado: {} })))).toBe(
      false,
    );
  });

  it('answers false for a flag that is not the literal boolean false', () => {
    // R10j/R17c: `true` requires DGII's own evidence, so a coerced-looking
    // `"false"`/`0` is no evidence. TypeScript reads the wire this way and the
    // C-1 ruling keeps it that way; the test locks the answer.
    expect(
      canReuseSequence(
        asTrackResponse(trackResult({ secuenciaUtilizada: 'false' })),
      ),
    ).toBe(false);
    expect(
      canReuseSequence(asTrackResponse(trackResult({ secuenciaUtilizada: 0 }))),
    ).toBe(false);
  });

  it('tolerates a padded rejection state', () => {
    expect(
      canReuseSequence(asTrackResponse(trackResult({ estado: ' Rechazado ' }))),
    ).toBe(true);
  });

  it('applies the same rule to an RFCE summary inquiry', () => {
    const summary: InquiryInvoiceSummary = {
      rnc: '130862346',
      encf: RFCE_ENCF,
      secuenciaUtilizada: false,
      codigo: 2,
      estado: 'Rechazado',
    };
    expect(canReuseSequence(summary)).toBe(true);
    expect(canReuseSequence({ ...summary, secuenciaUtilizada: true })).toBe(
      false,
    );
  });
});

describe('reconcileSubmission', () => {
  it('[T-A] fails with VALIDATION and keeps the marker when consultaestado returns an empty body', async () => {
    const { ecf, store } = scenario({
      [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: emptyResponse,
    });
    await seedMarker(store, ECF_KEY);

    const result = await ecf.reconcileSubmission(ECF_XML);

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.message).toBe('Unexpected DGII response payload');
    expect(result.error.resource).toBe(Endpoint.InquiryStatus);
    expect(await markerOf(store, ECF_KEY)).toEqual(PENDING_MARKER);
  });

  it('[T-B] fails with VALIDATION and keeps the marker when consultaestado returns a null body', async () => {
    const { ecf, store } = scenario({
      [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
        jsonResponse(null),
    });
    await seedMarker(store, ECF_KEY);

    const result = await ecf.reconcileSubmission(ECF_XML);

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(await markerOf(store, ECF_KEY)).toEqual(PENDING_MARKER);
  });

  it('[T-C] fails with VALIDATION when the inquiry has no estado, without throwing', async () => {
    const { ecf, store } = scenario({
      [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
        jsonResponse({ codigo: 2, rncEmisor: '130862346' }),
    });
    await seedMarker(store, ECF_KEY);

    const result = await ecf.reconcileSubmission(ECF_XML);

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(await markerOf(store, ECF_KEY)).toEqual(PENDING_MARKER);
  });

  it('[T-D] clears the marker when DGII has no record of the document', async () => {
    const { ecf, urls, store } = scenario({
      [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
        jsonResponse(inquiryPayload('No encontrado')),
    });
    await seedMarker(store, ECF_KEY);

    const result = await ecf.reconcileSubmission(ECF_XML);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.delivered).toBe(false);
    expect(result.value.cleared).toBe(true);
    expect(result.value.canReuseSequence).toBe(false);
    expect(await markerOf(store, ECF_KEY)).toBeUndefined();
    expect(urls).toEqual([inquiryStatusUrl(ECF_ENCF)]);
  });

  it('[T-E] fails with VALIDATION on the track service when consultatrackids returns an empty body', async () => {
    const { ecf, urls, store } = scenario({
      [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
        jsonResponse(inquiryPayload('Rechazado')),
      [buildUrl(Environment.Dev, Endpoint.AllTrackingEcf)]: emptyResponse,
    });
    await seedMarker(store, ECF_KEY);

    const result = await ecf.reconcileSubmission(ECF_XML);

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.message).toBe('Unexpected DGII response payload');
    expect(result.error.resource).toBe(Endpoint.AllTrackingEcf);
    expect(await markerOf(store, ECF_KEY)).toEqual(PENDING_MARKER);
    expect(urls).toEqual([
      inquiryStatusUrl(ECF_ENCF),
      trackStatusesUrl(ECF_ENCF),
    ]);
  });

  it('[T-F] reports no reuse and keeps the marker when the listing is empty', async () => {
    const { ecf, urls, store } = scenario({
      [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
        jsonResponse(inquiryPayload('Rechazado')),
      [buildUrl(Environment.Dev, Endpoint.AllTrackingEcf)]: () =>
        jsonResponse([]),
    });
    await seedMarker(store, ECF_KEY);

    const result = await ecf.reconcileSubmission(ECF_XML);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.delivered).toBe(true);
    expect(result.value.cleared).toBe(false);
    expect(result.value.canReuseSequence).toBe(false);
    expect(await markerOf(store, ECF_KEY)).toEqual(PENDING_MARKER);
    expect(urls).toEqual([
      inquiryStatusUrl(ECF_ENCF),
      trackStatusesUrl(ECF_ENCF),
    ]);
  });

  it('[T-G] never lets a "No encontrado" track clear the marker', async () => {
    const { ecf, urls, store } = scenario({
      [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
        jsonResponse(inquiryPayload('Rechazado')),
      [buildUrl(Environment.Dev, Endpoint.AllTrackingEcf)]: () =>
        jsonResponse([trackEntry({ estado: 'No encontrado' })]),
    });
    await seedMarker(store, ECF_KEY);

    const result = await ecf.reconcileSubmission(ECF_XML);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.delivered).toBe(true);
    expect(result.value.cleared).toBe(false);
    expect(result.value.canReuseSequence).toBe(false);
    expect(await markerOf(store, ECF_KEY)).toEqual(PENDING_MARKER);
    expect(urls).toEqual([
      inquiryStatusUrl(ECF_ENCF),
      trackStatusesUrl(ECF_ENCF),
    ]);
  });

  it('[T-H] fails on a 503 from consultaresultado and keeps the marker', async () => {
    const { ecf, urls, store } = scenario({
      [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
        jsonResponse(inquiryPayload('Rechazado')),
      [buildUrl(Environment.Dev, Endpoint.AllTrackingEcf)]: () =>
        jsonResponse([trackEntry()]),
      [buildUrl(Environment.Dev, Endpoint.TrackResultStatus)]: () =>
        jsonResponse({ mensajes: [{ valor: 'unavailable', codigo: 1 }] }, 503),
    });
    await seedMarker(store, ECF_KEY);

    const result = await ecf.reconcileSubmission(ECF_XML);

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('HTTP');
    expect(result.error.status).toBe(503);
    expect(result.error.resource).toBe(Endpoint.TrackResultStatus);
    expect(await markerOf(store, ECF_KEY)).toEqual(PENDING_MARKER);
    expect(firstPath(urls[urls.length - 1] ?? '')).toBe(
      buildUrl(Environment.Dev, Endpoint.TrackResultStatus),
    );
  });

  it('[T-I] reports a reusable sequence and keeps the marker on a rejection', async () => {
    const { ecf, urls, store } = scenario({
      [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
        jsonResponse(inquiryPayload('Rechazado')),
      [buildUrl(Environment.Dev, Endpoint.AllTrackingEcf)]: () =>
        jsonResponse([trackEntry()]),
      [buildUrl(Environment.Dev, Endpoint.TrackResultStatus)]: () =>
        jsonResponse(trackResult()),
    });
    await seedMarker(store, ECF_KEY);

    const result = await ecf.reconcileSubmission(ECF_XML);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.delivered).toBe(true);
    expect(result.value.canReuseSequence).toBe(true);
    expect(result.value.cleared).toBe(false);
    expect(await markerOf(store, ECF_KEY)).toEqual(PENDING_MARKER);
    // The order is the contract: existence first, then the gated flag chain.
    expect(urls).toEqual([
      inquiryStatusUrl(ECF_ENCF),
      trackStatusesUrl(ECF_ENCF),
      statusTrackIdUrl('track-1'),
    ]);
  });

  it('[T-J] reports no reuse when the track result carries no flag', async () => {
    const { ecf, store } = scenario({
      [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
        jsonResponse(inquiryPayload('Rechazado')),
      [buildUrl(Environment.Dev, Endpoint.AllTrackingEcf)]: () =>
        jsonResponse([trackEntry()]),
      [buildUrl(Environment.Dev, Endpoint.TrackResultStatus)]: () =>
        jsonResponse(trackResult({ secuenciaUtilizada: undefined })),
    });
    await seedMarker(store, ECF_KEY);

    const result = await ecf.reconcileSubmission(ECF_XML);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.canReuseSequence).toBe(false);
    expect(await markerOf(store, ECF_KEY)).toEqual(PENDING_MARKER);
  });

  it('[T-K] reports no reuse when the track result carries no estado, without throwing', async () => {
    const { ecf, store } = scenario({
      [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
        jsonResponse(inquiryPayload('Rechazado')),
      [buildUrl(Environment.Dev, Endpoint.AllTrackingEcf)]: () =>
        jsonResponse([trackEntry()]),
      [buildUrl(Environment.Dev, Endpoint.TrackResultStatus)]: () =>
        jsonResponse({ secuenciaUtilizada: false }),
    });
    await seedMarker(store, ECF_KEY);

    const result = await ecf.reconcileSubmission(ECF_XML);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.canReuseSequence).toBe(false);
    expect(await markerOf(store, ECF_KEY)).toEqual(PENDING_MARKER);
  });

  // R17a/R17b: the flag chain is complete — DGII answered — and only the
  // verdict is unreadable, so the answer is `false`, not an `Err` and never a
  // thrown `TypeError`. `estado: 42` is a body DGII does not produce; the SDK
  // must still answer.
  for (const [row, estado] of [
    ['R17a', 42],
    ['R17b', {}],
  ] as const) {
    it(`[${row}] reports no reuse, not a TypeError, when the track result estado is not a string`, async () => {
      const { ecf, urls, store } = scenario({
        [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
          jsonResponse(inquiryPayload('Rechazado')),
        [buildUrl(Environment.Dev, Endpoint.AllTrackingEcf)]: () =>
          jsonResponse([trackEntry()]),
        [buildUrl(Environment.Dev, Endpoint.TrackResultStatus)]: () =>
          jsonResponse(trackResult({ estado })),
      });
      await seedMarker(store, ECF_KEY);

      const result = await ecf.reconcileSubmission(ECF_XML);

      expect(result.isOk()).toBe(true);
      if (result.isErr()) return;
      expect(result.value.delivered).toBe(true);
      expect(result.value.canReuseSequence).toBe(false);
      expect(result.value.cleared).toBe(false);
      expect(urls).toEqual([
        inquiryStatusUrl(ECF_ENCF),
        trackStatusesUrl(ECF_ENCF),
        statusTrackIdUrl('track-1'),
      ]);
      expect(await markerOf(store, ECF_KEY)).toEqual(PENDING_MARKER);
    });
  }

  it('[T-L] stops after the inquiry for an accepted document', async () => {
    const { ecf, urls, store } = scenario({
      [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
        jsonResponse(inquiryPayload('Aceptado')),
    });
    await seedMarker(store, ECF_KEY);

    const result = await ecf.reconcileSubmission(ECF_XML);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.delivered).toBe(true);
    expect(result.value.canReuseSequence).toBe(false);
    expect(result.value.cleared).toBe(false);
    expect(urls).toEqual([inquiryStatusUrl(ECF_ENCF)]);
    expect(await markerOf(store, ECF_KEY)).toEqual(PENDING_MARKER);
  });

  it('[T-M] stops after the inquiry when DGII has no record', async () => {
    const { ecf, urls, store } = scenario({
      [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
        jsonResponse(inquiryPayload('No encontrado')),
    });
    await seedMarker(store, ECF_KEY);

    const result = await ecf.reconcileSubmission(ECF_XML);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.cleared).toBe(true);
    expect(urls).toEqual([inquiryStatusUrl(ECF_ENCF)]);
    expect(await markerOf(store, ECF_KEY)).toBeUndefined();
  });

  it('[T-N] stops after the inquiry for an RFCE rejection, which publishes no flag', async () => {
    const { ecf, urls, store } = scenario({
      [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
        jsonResponse(inquiryPayload('Rechazado')),
    });
    await seedMarker(store, RFCE_KEY);

    const result = await ecf.reconcileSubmission(RFCE_XML);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.delivered).toBe(true);
    expect(result.value.canReuseSequence).toBe(false);
    expect(urls).toEqual([inquiryStatusUrl(RFCE_ENCF)]);
    expect(await markerOf(store, RFCE_KEY)).toEqual(PENDING_MARKER);
  });

  it('[T-O] declines to claim reuse when several tracks exist', async () => {
    const { ecf, urls, store } = scenario({
      [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
        jsonResponse(inquiryPayload('Rechazado')),
      [buildUrl(Environment.Dev, Endpoint.AllTrackingEcf)]: () =>
        jsonResponse([
          trackEntry({ trackId: 'track-1' }),
          trackEntry({ trackId: 'track-2' }),
        ]),
    });
    await seedMarker(store, ECF_KEY);

    const result = await ecf.reconcileSubmission(ECF_XML);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.canReuseSequence).toBe(false);
    expect(urls).toEqual([
      inquiryStatusUrl(ECF_ENCF),
      trackStatusesUrl(ECF_ENCF),
    ]);
    expect(await markerOf(store, ECF_KEY)).toEqual(PENDING_MARKER);
  });

  it('[T-P] declines to claim reuse when the only track has no trackId', async () => {
    const { ecf, urls, store } = scenario({
      [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
        jsonResponse(inquiryPayload('Rechazado')),
      [buildUrl(Environment.Dev, Endpoint.AllTrackingEcf)]: () =>
        jsonResponse([
          { estado: 'Rechazado', fechaRecepcion: '01-01-2026 10:05:00' },
        ]),
    });
    await seedMarker(store, ECF_KEY);

    const result = await ecf.reconcileSubmission(ECF_XML);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.canReuseSequence).toBe(false);
    expect(urls).toEqual([
      inquiryStatusUrl(ECF_ENCF),
      trackStatusesUrl(ECF_ENCF),
    ]);
    expect(await markerOf(store, ECF_KEY)).toEqual(PENDING_MARKER);
  });

  it("accepts DGII's single-object listing shape for one track", async () => {
    const { ecf, urls, store } = scenario({
      [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
        jsonResponse(inquiryPayload('Rechazado')),
      [buildUrl(Environment.Dev, Endpoint.AllTrackingEcf)]: () =>
        jsonResponse(trackEntry()),
      [buildUrl(Environment.Dev, Endpoint.TrackResultStatus)]: () =>
        jsonResponse(trackResult()),
    });
    await seedMarker(store, ECF_KEY);

    const result = await ecf.reconcileSubmission(ECF_XML);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.canReuseSequence).toBe(true);
    expect(urls).toEqual([
      inquiryStatusUrl(ECF_ENCF),
      trackStatusesUrl(ECF_ENCF),
      statusTrackIdUrl('track-1'),
    ]);
  });

  it('fails with VALIDATION when the track result body is empty', async () => {
    const { ecf, store } = scenario({
      [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
        jsonResponse(inquiryPayload('Rechazado')),
      [buildUrl(Environment.Dev, Endpoint.AllTrackingEcf)]: () =>
        jsonResponse([trackEntry()]),
      [buildUrl(Environment.Dev, Endpoint.TrackResultStatus)]: emptyResponse,
    });
    await seedMarker(store, ECF_KEY);

    const result = await ecf.reconcileSubmission(ECF_XML);

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.resource).toBe(Endpoint.TrackResultStatus);
    expect(await markerOf(store, ECF_KEY)).toEqual(PENDING_MARKER);
  });

  it('rejects a document without an emitter RNC or e-NCF', async () => {
    const { ecf, urls } = scenario({});

    const result = await ecf.reconcileSubmission('<ECF><Encabezado/></ECF>');

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(urls).toEqual([]);
  });

  it('points the pending error at the helper', async () => {
    const { ecf, store } = scenario({});
    await seedMarker(store, ECF_KEY);

    const result = await ecf.sendElectronicDocument(ECF_XML, 'f.xml');

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('IDEMPOTENCY');
    expect(result.error.message).toBe(PENDING_SUBMISSION_MESSAGE);
    expect(result.error.message).toContain('reconcileSubmission');
  });

  // The parity-matrix cells TypeScript already answers correctly and that no
  // test asserted (review §6.3, holes C-2, C-5, C-6, C-7). Each one is a wire
  // body DGII can produce; the assertion is on the answer *and* the traffic.
  describe('payload classification (matrix R10j–R17c)', () => {
    it('[R13d] accepts an inquiry body that omits codigo', async () => {
      // C-2: DGII's own published example carries `codigo`, but nothing on this
      // path reads it, so its absence cannot fail the existence read.
      const { ecf, urls, store } = scenario({
        [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
          jsonResponse({ estado: 'Aceptado' }),
      });
      await seedMarker(store, ECF_KEY);

      const result = await ecf.reconcileSubmission(ECF_XML);

      expect(result.isOk()).toBe(true);
      if (result.isErr()) return;
      expect(result.value.delivered).toBe(true);
      expect(result.value.canReuseSequence).toBe(false);
      expect(urls).toEqual([inquiryStatusUrl(ECF_ENCF)]);
      expect(await markerOf(store, ECF_KEY)).toEqual(PENDING_MARKER);
    });

    it('[R13l] accepts an inquiry body whose codigo is not a number', async () => {
      // R13l: no decision reads `codigo` on the existence read, so a body with
      // an unreadable one is still an answer — `estado` is the only field this
      // read classifies.
      const { ecf, urls, store } = scenario({
        [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
          jsonResponse({ ...inquiryPayload('Aceptado'), codigo: 'abc' }),
      });
      await seedMarker(store, ECF_KEY);

      const result = await ecf.reconcileSubmission(ECF_XML);

      expect(result.isOk()).toBe(true);
      if (result.isErr()) return;
      expect(result.value.delivered).toBe(true);
      expect(result.value.canReuseSequence).toBe(false);
      expect(result.value.cleared).toBe(false);
      expect(urls).toEqual([inquiryStatusUrl(ECF_ENCF)]);
      expect(await markerOf(store, ECF_KEY)).toEqual(PENDING_MARKER);
    });

    // C-5: `consultaresultado` publishes the flag for the general e-CF only, so
    // every other root element must stop at the inquiry.
    for (const [row, root, idElement, encf] of [
      ['R12b', 'ACECF', 'eNCF', 'E310000000002'],
      ['R12c', 'ANECF', 'SecuenciaeNCFDesde', 'E310000000003'],
      ['R12d', 'FOO', 'eNCF', 'E310000000004'],
    ] as const) {
      it(`[${row}] stops after the inquiry for a ${root} rejection`, async () => {
        const xml = xmlWithRoot(root, idElement, encf);
        const { ecf, urls, store } = scenario({
          [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
            jsonResponse(inquiryPayload('Rechazado')),
        });
        await seedMarker(store, keyFor(xml, encf));

        const result = await ecf.reconcileSubmission(xml);

        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;
        expect(result.value.delivered).toBe(true);
        expect(result.value.canReuseSequence).toBe(false);
        expect(result.value.cleared).toBe(false);
        expect(urls).toEqual([inquiryStatusUrl(encf)]);
        expect(await markerOf(store, keyFor(xml, encf))).toEqual(
          PENDING_MARKER,
        );
      });
    }

    it('[R13e] fails with VALIDATION when the inquiry estado is numeric', async () => {
      // C-6: a state that is not a string is unclassifiable, so it is neither a
      // delivery nor an absence — and it never reaches the gate.
      const { ecf, urls, store } = scenario({
        [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
          jsonResponse({ ...inquiryPayload('Rechazado'), estado: 1 }),
      });
      await seedMarker(store, ECF_KEY);

      const result = await ecf.reconcileSubmission(ECF_XML);

      expect(result.isErr()).toBe(true);
      if (result.isOk()) return;
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.message).toBe('Unexpected DGII response payload');
      expect(result.error.resource).toBe(Endpoint.InquiryStatus);
      expect(urls).toEqual([inquiryStatusUrl(ECF_ENCF)]);
      expect(await markerOf(store, ECF_KEY)).toEqual(PENDING_MARKER);
    });

    it('[R14a] fails with VALIDATION when a listing entry estado is numeric', async () => {
      // C-6: an entry the method cannot classify must not be followed — the
      // difference is a missing `consultaresultado` request, not just text.
      const { ecf, urls, store } = scenario({
        [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
          jsonResponse(inquiryPayload('Rechazado')),
        [buildUrl(Environment.Dev, Endpoint.AllTrackingEcf)]: () =>
          jsonResponse([trackEntry({ estado: 1 })]),
      });
      await seedMarker(store, ECF_KEY);

      const result = await ecf.reconcileSubmission(ECF_XML);

      expect(result.isErr()).toBe(true);
      if (result.isOk()) return;
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.resource).toBe(Endpoint.AllTrackingEcf);
      expect(urls).toEqual([
        inquiryStatusUrl(ECF_ENCF),
        trackStatusesUrl(ECF_ENCF),
      ]);
      expect(await markerOf(store, ECF_KEY)).toEqual(PENDING_MARKER);
    });

    it('[R13f] keeps the marker when DGII answers a padded No encontrado', async () => {
      // C-7: the clearing rule is raw equality on DGII's spelling, so padding
      // reads as a delivery. Deleting the lock here would be unrecoverable.
      const { ecf, urls, store } = scenario({
        [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
          jsonResponse({
            ...inquiryPayload('No encontrado'),
            estado: ' No encontrado ',
          }),
      });
      await seedMarker(store, ECF_KEY);

      const result = await ecf.reconcileSubmission(ECF_XML);

      expect(result.isOk()).toBe(true);
      if (result.isErr()) return;
      expect(result.value.delivered).toBe(true);
      expect(result.value.cleared).toBe(false);
      expect(urls).toEqual([inquiryStatusUrl(ECF_ENCF)]);
      expect(await markerOf(store, ECF_KEY)).toEqual(PENDING_MARKER);
    });

    it('[R13g] enters the reuse gate on a padded Rechazado', async () => {
      // C-7: padding is tolerated only where the cost is one more read that
      // must still agree (`statusTrackId`), never where it clears the lock.
      const { ecf, urls, store } = scenario({
        [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
          jsonResponse({
            ...inquiryPayload('Rechazado'),
            estado: ' Rechazado ',
          }),
        [buildUrl(Environment.Dev, Endpoint.AllTrackingEcf)]: () =>
          jsonResponse([trackEntry()]),
        [buildUrl(Environment.Dev, Endpoint.TrackResultStatus)]: () =>
          jsonResponse(trackResult()),
      });
      await seedMarker(store, ECF_KEY);

      const result = await ecf.reconcileSubmission(ECF_XML);

      expect(result.isOk()).toBe(true);
      if (result.isErr()) return;
      expect(result.value.canReuseSequence).toBe(true);
      expect(urls).toEqual([
        inquiryStatusUrl(ECF_ENCF),
        trackStatusesUrl(ECF_ENCF),
        statusTrackIdUrl('track-1'),
      ]);
      expect(await markerOf(store, ECF_KEY)).toEqual(PENDING_MARKER);
    });

    // C-1/R10j/R17c: only DGII's literal `false` is evidence. A body that merely
    // looks false (`"false"`, `0`) answers `false`, which is the answer the
    // Python side must converge on (§6 rule 1 of C-1).
    for (const [row, flag] of [
      ['R10j', 'false'],
      ['R17c', 0],
    ] as const) {
      it(`[${row}] reports no reuse when the flag is ${JSON.stringify(flag)} rather than the literal false`, async () => {
        const { ecf, urls, store } = scenario({
          [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
            jsonResponse(inquiryPayload('Rechazado')),
          [buildUrl(Environment.Dev, Endpoint.AllTrackingEcf)]: () =>
            jsonResponse([trackEntry()]),
          [buildUrl(Environment.Dev, Endpoint.TrackResultStatus)]: () =>
            jsonResponse(trackResult({ secuenciaUtilizada: flag })),
        });
        await seedMarker(store, ECF_KEY);

        const result = await ecf.reconcileSubmission(ECF_XML);

        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;
        expect(result.value.canReuseSequence).toBe(false);
        expect(urls).toEqual([
          inquiryStatusUrl(ECF_ENCF),
          trackStatusesUrl(ECF_ENCF),
          statusTrackIdUrl('track-1'),
        ]);
        expect(await markerOf(store, ECF_KEY)).toEqual(PENDING_MARKER);
      });
    }

    // R17h/R20b: `codigo` and `fechaRecepcion` are published on the track
    // result but no decision reads them, so a malformed one cannot fail the
    // read that carries the flag. The answer stays `Ok` and still reports the
    // reuse DGII spelled out (`Rechazado` + `secuenciaUtilizada: false`).
    for (const [row, over] of [
      ['R17h', { codigo: 'x' }],
      ['R20b', { fechaRecepcion: {} }],
    ] as const) {
      it(`[${row}] still reports reuse when a non-classifying result field is malformed`, async () => {
        const { ecf, urls, store } = scenario({
          [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
            jsonResponse(inquiryPayload('Rechazado')),
          [buildUrl(Environment.Dev, Endpoint.AllTrackingEcf)]: () =>
            jsonResponse([trackEntry()]),
          [buildUrl(Environment.Dev, Endpoint.TrackResultStatus)]: () =>
            jsonResponse(trackResult(over)),
        });
        await seedMarker(store, ECF_KEY);

        const result = await ecf.reconcileSubmission(ECF_XML);

        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;
        expect(result.value.delivered).toBe(true);
        expect(result.value.canReuseSequence).toBe(true);
        expect(result.value.cleared).toBe(false);
        expect(urls).toEqual([
          inquiryStatusUrl(ECF_ENCF),
          trackStatusesUrl(ECF_ENCF),
          statusTrackIdUrl('track-1'),
        ]);
        expect(await markerOf(store, ECF_KEY)).toEqual(PENDING_MARKER);
      });
    }
  });
});

describe('statusTrackId', () => {
  it('returns the track result exactly as DGII published it', async () => {
    const { ecf, urls } = scenario({
      [buildUrl(Environment.Dev, Endpoint.TrackResultStatus)]: () =>
        jsonResponse(trackResult()),
    });

    const result = await ecf.statusTrackId('track-1');

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.estado).toBe('Rechazado');
    expect(result.value.secuenciaUtilizada).toBe(false);
    expect(urls).toEqual([statusTrackIdUrl('track-1')]);
  });

  // D-7: the method owns parsing, so a body that is not a JSON object fails
  // here instead of reaching a caller as an `Ok` it cannot read.
  for (const [label, body] of [
    ['a bare string', 'nope'],
    ['null', null],
    ['an array', []],
  ] as const) {
    it(`fails with VALIDATION when the body is ${label}`, async () => {
      const { ecf } = scenario({
        [buildUrl(Environment.Dev, Endpoint.TrackResultStatus)]: () =>
          jsonResponse(body),
      });

      const result = await ecf.statusTrackId('track-1');

      expect(result.isErr()).toBe(true);
      if (result.isOk()) return;
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.message).toBe('Unexpected DGII response payload');
      expect(result.error.resource).toBe(Endpoint.TrackResultStatus);
    });
  }

  it('fails with VALIDATION when the body is empty', async () => {
    const { ecf } = scenario({
      [buildUrl(Environment.Dev, Endpoint.TrackResultStatus)]: emptyResponse,
    });

    const result = await ecf.statusTrackId('track-1');

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.resource).toBe(Endpoint.TrackResultStatus);
  });
});

describe('inquiryStatus', () => {
  // R-2, the same rule D-7 established for `statusTrackId`: the method owns
  // parsing, so it validates its own payload instead of relying on the one
  // reconcile call site to do it. A body it cannot classify fails here.
  it('returns the inquiry exactly as DGII published it', async () => {
    const { ecf, urls } = scenario({
      [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
        jsonResponse({ ...inquiryPayload('Aceptado'), codigo: 'abc' }),
    });

    const result = await ecf.inquiryStatus('130862346', ECF_ENCF);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.estado).toBe('Aceptado');
    expect(result.value.rncEmisor).toBe('130862346');
    expect(urls).toEqual([inquiryStatusUrl(ECF_ENCF)]);
  });

  for (const [label, body] of [
    ['a bare string', 'nope'],
    ['null', null],
    ['an array', []],
    ['an object without estado', { codigo: 2, rncEmisor: '130862346' }],
  ] as const) {
    it(`fails with VALIDATION when the body is ${label}`, async () => {
      const { ecf } = scenario({
        [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: () =>
          jsonResponse(body),
      });

      const result = await ecf.inquiryStatus('130862346', ECF_ENCF);

      expect(result.isErr()).toBe(true);
      if (result.isOk()) return;
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.message).toBe('Unexpected DGII response payload');
      expect(result.error.resource).toBe(Endpoint.InquiryStatus);
    });
  }

  it('fails with VALIDATION when the body is empty', async () => {
    const { ecf } = scenario({
      [buildUrl(Environment.Dev, Endpoint.InquiryStatus)]: emptyResponse,
    });

    const result = await ecf.inquiryStatus('130862346', ECF_ENCF);

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.resource).toBe(Endpoint.InquiryStatus);
  });
});

describe('trackStatuses', () => {
  it('normalizes a single object into a one-entry listing', async () => {
    const { ecf, urls } = scenario({
      [buildUrl(Environment.Dev, Endpoint.AllTrackingEcf)]: () =>
        jsonResponse(trackEntry()),
    });

    const result = await ecf.trackStatuses('130862346', ECF_ENCF);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.trackId).toBe('track-1');
    expect(urls).toEqual([trackStatusesUrl(ECF_ENCF)]);
  });

  it('keeps an explicit empty array as "no track", not an error', async () => {
    const { ecf } = scenario({
      [buildUrl(Environment.Dev, Endpoint.AllTrackingEcf)]: () =>
        jsonResponse([]),
    });

    const result = await ecf.trackStatuses('130862346', ECF_ENCF);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toEqual([]);
  });

  it('fails with VALIDATION when the body is empty instead of returning nothing', async () => {
    const { ecf } = scenario({
      [buildUrl(Environment.Dev, Endpoint.AllTrackingEcf)]: emptyResponse,
    });

    const result = await ecf.trackStatuses('130862346', ECF_ENCF);

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.message).toBe('Unexpected DGII response payload');
    expect(result.error.resource).toBe(Endpoint.AllTrackingEcf);
  });

  it('fails with VALIDATION when an entry has no string estado', async () => {
    const { ecf } = scenario({
      [buildUrl(Environment.Dev, Endpoint.AllTrackingEcf)]: () =>
        jsonResponse([trackEntry(), { trackId: 'track-2' }]),
    });

    const result = await ecf.trackStatuses('130862346', ECF_ENCF);

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.resource).toBe(Endpoint.AllTrackingEcf);
  });
});
