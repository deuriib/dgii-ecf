import { createHash } from 'node:crypto';
import { err, ok, type Result } from './result.js';
import { DgiiError } from './errors.js';
import {
  BaseUrl,
  Endpoint,
  Environment,
  SenderReceiverEndpoint,
  StatusEndpoint,
  StatusEnvironment,
  buildSenderReceiverUrl,
  buildStatusUrl,
  buildUrl,
} from './environment.js';
import {
  HttpClient,
  InMemoryIdempotencyStore,
  type IdempotencyStore,
} from './http.js';
import type { ResilienceOptions } from './resilience.js';
import { checkB2BApplicability, resolveReceptionRoute } from './reception.js';
import {
  PENDING_SUBMISSION_MESSAGE,
  canReuseSequence,
  type ReconciliationResult,
} from './reconciliation.js';
import { Signature } from './signing.js';
import { formatViolations, validateDocument } from './validation.js';
import { extractElementText, extractRootElementName } from './xml.js';
import type { P12ReaderData } from './certificate.js';
import type {
  AuthToken,
  B2BCommercialApprovalResponse,
  CommercialApprovalResponse,
  InquiryInvoiceSummary,
  InquiryStatusResponse,
  InvoiceResponse,
  InvoiceSummaryResponse,
  MaintenanceWindow,
  ServiceAvailabilityResponse,
  ServiceDirectoryResponse,
  ServiceStatusEntry,
  SummaryTrackingStatusResponse,
  TrackingStatusResponse,
  VoidNCFResponse,
} from './types.js';

export interface EcfOptions {
  /** Pre-existing bearer token (skips the authentication round-trip). */
  token?: string;
  /** Pluggable idempotency store; defaults to an in-memory store. */
  idempotencyStore?: IdempotencyStore;
  resilience?: ResilienceOptions;
  timeoutMs?: number;
  /** Injectable fetch (useful for tests). */
  fetchImpl?: typeof fetch;
  /**
   * Refresh the token when its remaining lifetime falls below this window.
   * Defaults to 5 minutes.
   */
  tokenRefreshSkewMs?: number;
  /** Injectable clock (epoch milliseconds); useful for tests. */
  now?: () => number;
  /** API key for the `statusecf` service (`Authorization: Apikey …`). */
  statusApiKey?: string;
  /**
   * Reject a direct buyer-host delivery for the e-CF types DGII excludes
   * (E32 below RD$250,000, E41, E43, E45, E46, E47). Defaults to `true`.
   */
  enforceB2BRules?: boolean;
  /**
   * Validate a general e-CF against its bundled XML Schema before sending.
   * Requires `xmllint` (or `DGII_XMLLINT_BIN`). Defaults to `false`.
   */
  validateBeforeSend?: boolean;
  /** `xmllint` binary used by `validateBeforeSend`. */
  xmllintBin?: string;
}

/**
 * Message used when a decoded DGII body cannot be read as the model it should
 * be. Reused verbatim from the Python package so both SDKs report the same
 * `VALIDATION` failure for a non-object or absent body.
 */
const UNEXPECTED_PAYLOAD_MESSAGE = 'Unexpected DGII response payload';

/** A JSON object, as opposed to an array, a scalar, `null` or `undefined`. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A payload the SDK cannot read is never evidence, so it fails as
 * `VALIDATION` — the same code and message the Python package produces — and
 * names the read it came from.
 */
const unexpectedPayload = (resource: Endpoint, data: unknown): DgiiError =>
  new DgiiError(UNEXPECTED_PAYLOAD_MESSAGE, {
    code: 'VALIDATION',
    resource,
    method: 'GET',
    data,
  });

/**
 * A `consultatrackids` entry the method can classify: an object whose `estado`
 * is a string. Everything else is unclassifiable, not "no record".
 */
const isSummaryTrackingEntry = (
  value: unknown,
): value is SummaryTrackingStatusResponse =>
  isRecord(value) && typeof value.estado === 'string';

/**
 * The body of `consultaresultado` as the SDK reads it: it only has to be a JSON
 * object. The fields it publishes are classified downstream by
 * {@link canReuseSequence}, which is total, so this read adds no field rule of
 * its own — but a body that is not an object at all is not a track result, and
 * `statusTrackId` is the layer that owns parsing, so it is where that is
 * decided.
 */
const isTrackingStatusResponse = (
  value: unknown,
): value is TrackingStatusResponse => isRecord(value);

/**
 * The body of `consultaestado` as the SDK reads it: an object whose `estado` is
 * a string. `estado` is the field that decides existence, so it is the only one
 * with a rule — `codigo` and the fiscal fields are published but read by no
 * decision. An object without a classifiable state is not evidence of absence,
 * so it fails the read instead of reaching a caller as delivered or cleared.
 */
const isInquiryStatusResponse = (
  value: unknown,
): value is InquiryStatusResponse =>
  isRecord(value) && typeof value.estado === 'string';

interface PendingSubmission {
  readonly pending: true;
}

const PENDING_SUBMISSION: PendingSubmission = { pending: true };

const isPendingSubmission = (value: unknown): value is PendingSubmission =>
  typeof value === 'object' &&
  value !== null &&
  (value as { pending?: unknown }).pending === true;

const sha256Hex = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

/** Parse DGII's ISO-8601 `expira` into epoch milliseconds. */
const parseExpiry = (value: string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

/**
 * DGII e-CF client. Every method returns a `Result` — no thrown domain errors.
 */
export class ECF {
  private readonly environment: Environment;
  private readonly http: HttpClient;
  private readonly idempotency: IdempotencyStore;
  private readonly credentials: P12ReaderData;
  private readonly inFlight = new Map<
    string,
    Promise<Result<unknown, DgiiError>>
  >();
  private readonly tokenRefreshSkewMs: number;
  private readonly now: () => number;
  private readonly statusApiKey: string | undefined;
  private readonly enforceB2BRules: boolean;
  private readonly validateBeforeSend: boolean;
  private readonly xmllintBin: string | undefined;
  private tokenExpiresAt: number | undefined;
  private refreshPromise: Promise<Result<AuthToken, DgiiError>> | undefined;

  constructor(
    credentials: P12ReaderData,
    environment: Environment = Environment.Dev,
    options: EcfOptions = {},
  ) {
    this.credentials = credentials;
    this.environment = environment;
    this.tokenRefreshSkewMs = options.tokenRefreshSkewMs ?? 5 * 60 * 1000;
    this.now = options.now ?? Date.now;
    this.statusApiKey = options.statusApiKey;
    this.enforceB2BRules = options.enforceB2BRules ?? true;
    this.validateBeforeSend = options.validateBeforeSend ?? false;
    this.xmllintBin = options.xmllintBin;
    this.idempotency =
      options.idempotencyStore ?? new InMemoryIdempotencyStore();
    this.http = new HttpClient({
      baseUrl: BaseUrl.ECF,
      ...(options.token !== undefined ? { token: options.token } : {}),
      ...(options.resilience !== undefined
        ? { resilience: options.resilience }
        : {}),
      ...(options.timeoutMs !== undefined
        ? { timeoutMs: options.timeoutMs }
        : {}),
      ...(options.fetchImpl !== undefined
        ? { fetchImpl: options.fetchImpl }
        : {}),
      beforeRequest: async () => {
        await this.ensureToken();
      },
      onUnauthorized: () => this.reauthenticate(),
    });
  }

  private buildIdempotencyKey(signedXml: string): string {
    // ECF/ACECF use `RNCEmisor`; the ANECF schema spells it `RncEmisor`.
    const rnc =
      extractElementText(signedXml, 'RNCEmisor') ??
      extractElementText(signedXml, 'RncEmisor') ??
      'unknown-rnc';
    // ECF/ACECF carry `eNCF`; ANECF carries the first `SecuenciaeNCFDesde`.
    // `RangoNCF` stays as a fallback for hand-built documents.
    const ncf =
      extractElementText(signedXml, 'eNCF') ??
      extractElementText(signedXml, 'SecuenciaeNCFDesde') ??
      extractElementText(signedXml, 'RangoNCF') ??
      'unknown-ncf';
    return `${rnc}:${ncf}:${sha256Hex(signedXml)}`;
  }

  /**
   * Run a submission through the persist-before-transmit idempotency flow.
   *
   * The pending marker is written first so an interrupted send can be
   * reconciled instead of re-issued; a successful response replaces it, and
   * a failure clears it so the caller can retry.
   */
  private async submitIdempotent<T>(
    key: string,
    send: () => Promise<Result<T, DgiiError>>,
  ): Promise<Result<T, DgiiError>> {
    const cached = await this.idempotency.get<T | PendingSubmission>(key);
    if (cached !== undefined) {
      if (isPendingSubmission(cached)) {
        return err(
          new DgiiError(PENDING_SUBMISSION_MESSAGE, { code: 'IDEMPOTENCY' }),
        );
      }
      return ok(cached);
    }
    return this.singleFlight(key, async () => {
      await this.idempotency.set(key, PENDING_SUBMISSION);
      const result = await send();
      if (result.isOk()) {
        await this.idempotency.set(key, result.value);
      } else {
        await this.idempotency.delete(key);
      }
      return result;
    });
  }

  private async singleFlight<T>(
    key: string,
    task: () => Promise<Result<T, DgiiError>>,
  ): Promise<Result<T, DgiiError>> {
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing as Promise<Result<T, DgiiError>>;
    }
    const promise = task();
    this.inFlight.set(key, promise as Promise<Result<unknown, DgiiError>>);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(key);
    }
  }

  /**
   * Refresh the token when it is missing or about to expire.
   *
   * A pre-supplied `token` has no known expiry, so it is never refreshed
   * proactively — only a 401 triggers a re-authentication for it.
   */
  private async ensureToken(): Promise<Result<void, DgiiError>> {
    if (this.tokenExpiresAt === undefined) {
      return ok(undefined);
    }
    if (this.now() < this.tokenExpiresAt - this.tokenRefreshSkewMs) {
      return ok(undefined);
    }
    const refreshed = await this.refreshToken();
    return refreshed.isOk() ? ok(undefined) : err(refreshed.error);
  }

  /** Authenticate, coalescing concurrent refreshes into a single round-trip. */
  private refreshToken(): Promise<Result<AuthToken, DgiiError>> {
    if (this.refreshPromise !== undefined) {
      return this.refreshPromise;
    }
    const promise = this.authenticate().finally(() => {
      this.refreshPromise = undefined;
    });
    this.refreshPromise = promise;
    return promise;
  }

  /** Drop the rejected token and authenticate once. Returns `true` on success. */
  private async reauthenticate(): Promise<boolean> {
    this.http.clearToken();
    this.tokenExpiresAt = undefined;
    const refreshed = await this.refreshToken();
    return refreshed.isOk();
  }

  /** Authenticate against DGII (or a buyer host) and store the bearer token. */
  async authenticate(
    buyerHost?: string,
  ): Promise<Result<AuthToken, DgiiError>> {
    const seed = await this.getSeed(buyerHost);
    if (seed.isErr()) {
      return err(seed.error);
    }
    if (
      typeof this.credentials.key !== 'string' ||
      typeof this.credentials.cert !== 'string'
    ) {
      return err(
        new DgiiError(
          'A private key and certificate PEM are required to authenticate',
          { code: 'CERTIFICATE' },
        ),
      );
    }

    const signed = new Signature(
      this.credentials.key,
      this.credentials.cert,
    ).signXml(seed.value, 'SemillaModel');
    if (signed.isErr()) {
      return err(signed.error);
    }

    const token = await this.getAuthToken(signed.value, buyerHost);
    if (token.isErr()) {
      return err(token.error);
    }
    this.http.setToken(token.value.token);
    this.tokenExpiresAt = parseExpiry(token.value.expira);
    return ok(token.value);
  }

  /**
   * Query the operational status of every DGII service.
   *
   * The status host takes an API key instead of a bearer token, so this call
   * neither needs `authenticate()` nor triggers a token refresh.
   */
  async getServiceStatus(): Promise<Result<ServiceStatusEntry[], DgiiError>> {
    const result = await this.statusRequest<
      ServiceStatusEntry[] | ServiceStatusEntry
    >(StatusEndpoint.Services);
    if (result.isErr()) {
      return err(result.error);
    }
    const data = result.value;
    if (data === undefined || data === null) {
      return ok([]);
    }
    return ok(Array.isArray(data) ? data : [data]);
  }

  /** Scheduled maintenance windows, one entry per environment. */
  async getMaintenanceWindows(): Promise<
    Result<MaintenanceWindow[], DgiiError>
  > {
    const result = await this.statusRequest<
      { ventanaMantenimientos?: MaintenanceWindow[] } | MaintenanceWindow[]
    >(StatusEndpoint.MaintenanceWindows);
    if (result.isErr()) {
      return err(result.error);
    }
    const data = result.value;
    if (Array.isArray(data)) {
      return ok(data);
    }
    return ok(data?.ventanaMantenimientos ?? []);
  }

  /** Whether an environment is currently inside a maintenance window. */
  checkServiceAvailability(
    ambiente: StatusEnvironment,
  ): Promise<Result<ServiceAvailabilityResponse, DgiiError>> {
    return this.statusRequest<ServiceAvailabilityResponse>(
      StatusEndpoint.Check,
      { ambiente },
    );
  }

  private statusRequest<T>(
    endpoint: StatusEndpoint,
    query?: Record<string, string | number | undefined>,
  ): Promise<Result<T, DgiiError>> {
    const headers: Record<string, string> =
      this.statusApiKey === undefined
        ? {}
        : { Authorization: `Apikey ${this.statusApiKey}` };
    return this.http.request<T>({
      method: 'GET',
      path: buildStatusUrl(endpoint),
      absoluteUrl: true,
      resource: `status:${endpoint}`,
      headers,
      ...(query !== undefined ? { query } : {}),
      skipAuthHooks: true,
      omitAuth: true,
    });
  }

  /**
   * Resolve what happened to a submission whose idempotency marker is pending.
   *
   * Queries DGII by e-NCF. When DGII has no record of the document the marker
   * is cleared, because re-submitting cannot double-issue. When DGII does have
   * a record the marker stays in place — it is the lock that prevents a second
   * submission of a document that already exists — and `delivered` tells the
   * caller to stop retrying.
   *
   * `delivered` and `cleared` come from `inquiryStatus` (`consultaestado`),
   * which is the only source that decides them. The sequence-reuse flag is
   * published on the track services instead, so a rejection of a general e-CF
   * pays two further reads — `trackStatuses` (`consultatrackids`) and
   * `statusTrackId` (`consultaresultado`) — and only that path does. A flag
   * read that fails is returned as `Err` with the marker untouched: a `false`
   * there would be indistinguishable from DGII answering "not reusable".
   */
  async reconcileSubmission(
    signedXml: string,
  ): Promise<Result<ReconciliationResult, DgiiError>> {
    const rnc =
      extractElementText(signedXml, 'RNCEmisor') ??
      extractElementText(signedXml, 'RncEmisor');
    const encf =
      extractElementText(signedXml, 'eNCF') ??
      extractElementText(signedXml, 'SecuenciaeNCFDesde');
    if (rnc === undefined || encf === undefined) {
      return err(
        new DgiiError('The document has no emitter RNC or e-NCF to reconcile', {
          code: 'VALIDATION',
        }),
      );
    }
    // `consultaresultado` covers documents sent through the general e-CF
    // reception only, so no other root element has a reuse flag to read.
    const isGeneralEcf = extractRootElementName(signedXml) === 'ECF';

    const inquiry = await this.inquiryStatus(rnc, encf);
    if (inquiry.isErr()) {
      return err(inquiry.error);
    }

    // `inquiryStatus` already refused a body it cannot classify, so this is
    // DGII's answer — and absence is one of the answers it can give.
    const value = inquiry.value;

    // Raw equality, untrimmed: trimming here would let a padded `No encontrado`
    // delete the lock. Trimming lives in the `Rechazado` gate below, where the
    // only consequence is one more read that must still agree.
    const delivered = value.estado !== 'No encontrado';
    const cleared = !delivered;

    let canReuse = false;
    if (isGeneralEcf && delivered && value.estado.trim() === 'Rechazado') {
      const tracks = await this.trackStatuses(rnc, encf);
      if (tracks.isErr()) {
        return err(tracks.error);
      }
      // A listing entry saying `No encontrado` cannot un-deliver a document
      // DGII already reported on, so it only means "no track to ask about".
      const usable = tracks.value.filter(
        (entry) => entry.estado !== 'No encontrado',
      );
      // Several tracks mean the same e-NCF reached DGII more than once, and
      // DGII says nothing about aggregating their flags: decline to claim.
      const trackId = usable.length === 1 ? usable[0].trackId : undefined;
      if (typeof trackId === 'string' && trackId.length > 0) {
        const status = await this.statusTrackId(trackId);
        if (status.isErr()) {
          return err(status.error);
        }
        canReuse = canReuseSequence(status.value);
      }
    }

    if (cleared) {
      await this.idempotency.delete(this.buildIdempotencyKey(signedXml));
    }
    return ok({
      inquiry: value,
      delivered,
      canReuseSequence: canReuse,
      cleared,
    });
  }

  private getSeed(buyerHost?: string): Promise<Result<string, DgiiError>> {
    if (buyerHost) {
      const url = buildSenderReceiverUrl(
        buyerHost,
        SenderReceiverEndpoint.Seed,
      );
      return this.http.get<string>(url, undefined, {
        absoluteUrl: true,
        resource: SenderReceiverEndpoint.Seed,
        skipAuthHooks: true,
      });
    }
    const url = buildUrl(this.environment, Endpoint.Seed);
    return this.http.get<string>(url, undefined, {
      absoluteUrl: true,
      resource: Endpoint.Seed,
      skipAuthHooks: true,
    });
  }

  private getAuthToken(
    signedSeed: string,
    buyerHost?: string,
  ): Promise<Result<AuthToken, DgiiError>> {
    const url = buyerHost
      ? buildSenderReceiverUrl(buyerHost, SenderReceiverEndpoint.ValidateSeed)
      : buildUrl(this.environment, Endpoint.ValidateSeed);
    return this.http.postMultipart<AuthToken>(url, 'signed.xml', signedSeed, {
      absoluteUrl: true,
      resource: Endpoint.ValidateSeed,
      skipAuthHooks: true,
    });
  }

  /**
   * Submit a signed e-CF. Idempotent on `RNC + eNCF + SHA-256(signed XML)`:
   * a repeated call returns the cached response instead of double-issuing.
   */
  async sendElectronicDocument(
    signedXml: string,
    fileName: string,
    buyerHost?: string,
  ): Promise<Result<InvoiceResponse, DgiiError>> {
    if (buyerHost !== undefined && this.enforceB2BRules) {
      const applicable = checkB2BApplicability(signedXml);
      if (applicable.isErr()) {
        return err(applicable.error);
      }
    }
    if (this.validateBeforeSend) {
      const validation = validateDocument(
        signedXml,
        this.xmllintBin !== undefined ? { bin: this.xmllintBin } : {},
      );
      if (validation.isErr()) {
        return err(validation.error);
      }
      if (validation.value.length > 0) {
        return err(
          new DgiiError(
            `Document does not match the DGII XML Schema: ${formatViolations(validation.value)}`,
            { code: 'VALIDATION', data: validation.value },
          ),
        );
      }
    }
    const key = this.buildIdempotencyKey(signedXml);
    return this.submitIdempotent(key, () => {
      const url = buyerHost
        ? buildSenderReceiverUrl(buyerHost, SenderReceiverEndpoint.SendInvoice)
        : buildUrl(this.environment, Endpoint.SendInvoice);
      return this.http.postMultipart<InvoiceResponse>(
        url,
        fileName,
        signedXml,
        { absoluteUrl: true, resource: Endpoint.SendInvoice },
      );
    });
  }

  /** Submit a signed summary invoice (RFCE). Idempotent like submissions. */
  async sendSummary(
    signedXml: string,
    fileName: string,
  ): Promise<Result<InvoiceSummaryResponse, DgiiError>> {
    const key = this.buildIdempotencyKey(signedXml);
    return this.submitIdempotent(key, () =>
      this.http.postMultipart<InvoiceSummaryResponse>(
        buildUrl(this.environment, Endpoint.SendSummary, BaseUrl.CF),
        fileName,
        signedXml,
        { absoluteUrl: true, resource: Endpoint.SendSummary },
      ),
    );
  }

  /**
   * Submit a signed document to the endpoint its own content belongs to.
   *
   * Reads the root element, `TipoeCF` and `MontoTotal` from the signed XML and
   * dispatches to {@link sendSummary} for an RFCE or to
   * {@link sendElectronicDocument} for an ECF. An E32 below RD$250,000 is
   * rejected because DGII only accepts the summary form for those.
   */
  async sendDocument(
    signedXml: string,
    fileName: string,
    buyerHost?: string,
  ): Promise<Result<InvoiceResponse | InvoiceSummaryResponse, DgiiError>> {
    const route = resolveReceptionRoute(signedXml);
    if (route.isErr()) {
      return err(route.error);
    }
    if (route.value.kind === 'summary') {
      if (buyerHost !== undefined) {
        return err(
          new DgiiError(
            'An RFCE summary cannot be delivered directly to a buyer host',
            { code: 'VALIDATION' },
          ),
        );
      }
      return this.sendSummary(signedXml, fileName);
    }
    return this.sendElectronicDocument(signedXml, fileName, buyerHost);
  }

  /**
   * DGII's per-track result (`consultaresultado`) — the read that publishes the
   * sequence-reuse flag.
   *
   * This is the layer that owns parsing, so this is where the shape rule lives:
   * a body that is not a JSON object — an empty body, `null`, an array, a bare
   * scalar — is a `VALIDATION` failure, never an `Ok` carrying something no
   * caller can read. `estado` and `secuenciaUtilizada` are not validated here:
   * {@link canReuseSequence} classifies them and answers `false` for anything
   * DGII does not spell out.
   */
  async statusTrackId(
    trackId: string,
  ): Promise<Result<TrackingStatusResponse, DgiiError>> {
    const url = buildUrl(this.environment, Endpoint.TrackResultStatus);
    const result = await this.http.get<unknown>(
      url,
      { trackId },
      { absoluteUrl: true, resource: Endpoint.TrackResultStatus },
    );
    if (result.isErr()) {
      return err(result.error);
    }
    const payload = result.value;
    if (!isTrackingStatusResponse(payload)) {
      return err(unexpectedPayload(Endpoint.TrackResultStatus, payload));
    }
    return ok(payload);
  }

  /**
   * DGII's existence read (`consultaestado`) — the only source that decides
   * whether a document is delivered and whether the pending marker may clear.
   *
   * This is the layer that owns parsing, so the shape rule lives here: a body
   * that is not a JSON object, or an object whose `estado` is not a string, is
   * a `VALIDATION` failure. A body the SDK cannot classify is not evidence —
   * not even evidence of absence — so it never reaches a caller as an `Ok` that
   * would read as `No encontrado`. `codigo` and the fiscal fields are not
   * validated: no decision on this path reads them.
   */
  async inquiryStatus(
    rncEmisor: string,
    ncfElectronico: string,
    rncComprador?: string,
    codigoSeguridad?: string,
  ): Promise<Result<InquiryStatusResponse, DgiiError>> {
    const url = buildUrl(this.environment, Endpoint.InquiryStatus);
    const result = await this.http.get<unknown>(
      url,
      { rncEmisor, ncfElectronico, rncComprador, codigoSeguridad },
      { absoluteUrl: true, resource: Endpoint.InquiryStatus },
    );
    if (result.isErr()) {
      return err(result.error);
    }
    const payload = result.value;
    if (!isInquiryStatusResponse(payload)) {
      return err(unexpectedPayload(Endpoint.InquiryStatus, payload));
    }
    return ok(payload);
  }

  /**
   * Every tracking entry DGII associates with an e-NCF (`consultatrackids`).
   *
   * DGII's text calls this a listing while its sample is a single object, so
   * both shapes are accepted and an explicit empty array is a valid answer (no
   * track to ask about). A body the method cannot read — an empty body, `null`,
   * or an entry without a string `estado` — is a `VALIDATION` failure: "no
   * answer" must never reach a caller as "no records".
   */
  async trackStatuses(
    rncEmisor: string,
    encf: string,
  ): Promise<Result<SummaryTrackingStatusResponse[], DgiiError>> {
    const url = buildUrl(this.environment, Endpoint.AllTrackingEcf);
    const result = await this.http.get<unknown>(
      url,
      { rncEmisor, encf },
      { absoluteUrl: true, resource: Endpoint.AllTrackingEcf },
    );
    if (result.isErr()) {
      return err(result.error);
    }
    const payload = result.value;
    if (!isRecord(payload) && !Array.isArray(payload)) {
      return err(unexpectedPayload(Endpoint.AllTrackingEcf, payload));
    }
    const entries: SummaryTrackingStatusResponse[] = [];
    for (const entry of Array.isArray(payload) ? payload : [payload]) {
      if (!isSummaryTrackingEntry(entry)) {
        return err(unexpectedPayload(Endpoint.AllTrackingEcf, payload));
      }
      entries.push(entry);
    }
    return ok(entries);
  }

  /** Normalizes DGII's inconsistent (array | single object) directory payload. */
  async getCustomerDirectory(
    rnc: string,
  ): Promise<Result<ServiceDirectoryResponse[] | undefined, DgiiError>> {
    const url = buildUrl(this.environment, Endpoint.Directory);
    const result = await this.http.get<
      ServiceDirectoryResponse[] | ServiceDirectoryResponse
    >(url, { rnc }, { absoluteUrl: true, resource: Endpoint.Directory });
    if (result.isErr()) {
      return err(result.error);
    }
    const data = result.value;
    if (data === undefined || data === null) {
      return ok(undefined);
    }
    return ok(Array.isArray(data) ? data : [data]);
  }

  /** General directory listing — every receiver that publishes service URLs. */
  async getDirectoryListing(): Promise<
    Result<ServiceDirectoryResponse[], DgiiError>
  > {
    const url = buildUrl(this.environment, Endpoint.DirectoryList);
    const result = await this.http.get<
      ServiceDirectoryResponse[] | ServiceDirectoryResponse
    >(url, undefined, {
      absoluteUrl: true,
      resource: Endpoint.DirectoryList,
    });
    if (result.isErr()) {
      return err(result.error);
    }
    const data = result.value;
    if (data === undefined || data === null) {
      return ok([]);
    }
    return ok(Array.isArray(data) ? data : [data]);
  }

  /** RFCE inquiry — DGII production only. */
  async getSummaryInvoiceInquiry(
    rnc: string,
    encf: string,
    codSeguridad: string,
  ): Promise<Result<InquiryInvoiceSummary, DgiiError>> {
    if (this.environment !== Environment.Prod) {
      return err(
        new DgiiError(
          `getSummaryInvoiceInquiry is only available in the production environment (eCF); current environment is ${this.environment}`,
          { code: 'VALIDATION' },
        ),
      );
    }
    const url = buildUrl(
      this.environment,
      Endpoint.InquiryInvoiceSummary,
      BaseUrl.CF,
    );
    return this.http.get<InquiryInvoiceSummary>(
      url,
      { rnc_emisor: rnc, encf, cod_seguridad_eCF: codSeguridad },
      { absoluteUrl: true, resource: Endpoint.InquiryInvoiceSummary },
    );
  }

  /**
   * Submit a signed commercial approval (ACECF). Idempotent like submissions,
   * keyed on `RNC + eNCF + SHA-256(signed XML)`.
   */
  sendCommercialApproval(
    signedXml: string,
    fileName: string,
  ): Promise<Result<CommercialApprovalResponse, DgiiError>>;
  sendCommercialApproval(
    signedXml: string,
    fileName: string,
    buyerHost: string,
  ): Promise<Result<B2BCommercialApprovalResponse, DgiiError>>;
  sendCommercialApproval(
    signedXml: string,
    fileName: string,
    buyerHost?: string,
  ): Promise<
    Result<
      CommercialApprovalResponse | B2BCommercialApprovalResponse,
      DgiiError
    >
  > {
    const key = this.buildIdempotencyKey(signedXml);
    if (buyerHost !== undefined) {
      return this.submitIdempotent<B2BCommercialApprovalResponse>(
        key,
        async () => {
          const url = buildSenderReceiverUrl(
            buyerHost,
            SenderReceiverEndpoint.CommercialApproval,
          );
          const result = await this.http.postMultipart<unknown>(
            url,
            fileName,
            signedXml,
            {
              absoluteUrl: true,
              resource: SenderReceiverEndpoint.CommercialApproval,
            },
          );
          if (result.isErr()) {
            // DGII documents HTTP 400 as "unsatisfactory", i.e. the peer
            // received the ACECF and rejected it — a business outcome, not a
            // transport failure.
            return result.error.status === 400
              ? ok({ status: 400, accepted: false })
              : err(result.error);
          }
          return ok({ status: 200, accepted: true });
        },
      );
    }
    return this.submitIdempotent(key, () =>
      this.http.postMultipart<CommercialApprovalResponse>(
        buildUrl(this.environment, Endpoint.CommercialApproval),
        fileName,
        signedXml,
        { absoluteUrl: true, resource: Endpoint.CommercialApproval },
      ),
    );
  }

  /**
   * Submit a signed range-voiding request (ANECF). Idempotent like
   * submissions, keyed on `RNC + RangoNCF + SHA-256(signed XML)`.
   */
  voidENCF(
    signedXml: string,
    fileName: string,
  ): Promise<Result<VoidNCFResponse, DgiiError>> {
    const key = this.buildIdempotencyKey(signedXml);
    return this.submitIdempotent(key, () =>
      this.http.postMultipart<VoidNCFResponse>(
        buildUrl(this.environment, Endpoint.Void),
        fileName,
        signedXml,
        { absoluteUrl: true, resource: Endpoint.Void },
      ),
    );
  }
}
