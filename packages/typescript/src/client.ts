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
  AMBIGUOUS_SUBMISSION_MESSAGE,
  PENDING_SUBMISSION_MESSAGE,
  canReuseSequence,
  type ReconciliationResult,
} from './reconciliation.js';
import { Signature } from './signing.js';
import { formatViolations, validateDocument } from './validation.js';
import { extractElementText, extractRootElementName } from './xml.js';
import {
  SDK_VERSION,
  documentIdentity,
  emitEvent,
  newCorrelationId,
  utcTimestamp,
  type DocumentIdentity,
  type EcfEvent,
} from './telemetry.js';
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
  /** Optional telemetry callback; never awaited and exceptions are swallowed. */
  onEvent?: (event: EcfEvent) => void;
}

/**
 * Message used when a decoded DGII body cannot be read as the model it should
 * be. Reused verbatim from the Python package so both SDKs report the same
 * `VALIDATION` failure for a non-object or absent body.
 */
const UNEXPECTED_PAYLOAD_MESSAGE = 'Unexpected DGII response payload';

/**
 * Message used when a submission's 2xx body cannot be read as a model. Reused
 * verbatim from the Python package, and deliberately distinct from
 * {@link UNEXPECTED_PAYLOAD_MESSAGE}: DGII already has the document, so the
 * instruction is to reconcile — never to retry blind.
 */
const UNEXPECTED_SUBMISSION_MESSAGE =
  'Unexpected DGII response payload; reconcile via a status lookup before retrying';

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

const DECIMAL_AMOUNT_RE = /^-?\d+(?:\.\d+)?$/;

const normalizeOptionalAmount = (value: unknown): string | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return DECIMAL_AMOUNT_RE.test(trimmed) ? trimmed : undefined;
  }
  return undefined;
};

const normalizeInquiryStatus = (
  payload: InquiryStatusResponse,
): InquiryStatusResponse => {
  const raw = payload as unknown as Record<string, unknown>;
  const montoTotal = normalizeOptionalAmount(raw.montoTotal);
  const totalITBIS = normalizeOptionalAmount(raw.totalITBIS);
  const next: Record<string, unknown> = { ...raw };
  if (montoTotal !== undefined) {
    next.montoTotal = montoTotal;
  } else {
    delete next.montoTotal;
  }
  if (totalITBIS !== undefined) {
    next.totalITBIS = totalITBIS;
  } else {
    delete next.totalITBIS;
  }
  return next as unknown as InquiryStatusResponse;
};

const validateBuyerHost = (buyerHost: string): Result<void, DgiiError> => {
  const trimmed = buyerHost.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return err(
      new DgiiError(`Invalid buyerHost URL: "${buyerHost}"`, {
        code: 'VALIDATION',
      }),
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return err(
      new DgiiError(`Invalid buyerHost URL: "${buyerHost}"`, {
        code: 'VALIDATION',
      }),
    );
  }
  if (parsed.protocol !== 'https:') {
    return err(
      new DgiiError('buyerHost must use https:', { code: 'VALIDATION' }),
    );
  }
  if (!parsed.hostname) {
    return err(
      new DgiiError('buyerHost must include a hostname', {
        code: 'VALIDATION',
      }),
    );
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return err(
      new DgiiError('buyerHost must not include embedded credentials', {
        code: 'VALIDATION',
      }),
    );
  }
  return ok(undefined);
};

interface PendingSubmission {
  readonly __pending__: true;
}

/**
 * The pending marker written before a submission is transmitted.
 *
 * The wire shape is shared verbatim with the Python package
 * (`{"__pending__": True}`): the store is pluggable and may be shared by both
 * SDKs, so a marker written by one must be recognised by the other instead of
 * being read back as a delivered payload.
 */
const PENDING_SUBMISSION: PendingSubmission = { __pending__: true };

/**
 * Accepts the current marker and the legacy `{pending: true}` shape this
 * package wrote before the two packages were aligned, so an in-flight marker
 * from an older deployment is still honoured rather than replayed as a
 * delivered result.
 */
const isPendingSubmission = (value: unknown): value is PendingSubmission =>
  typeof value === 'object' &&
  value !== null &&
  ((value as { __pending__?: unknown }).__pending__ === true ||
    (value as { pending?: unknown }).pending === true);

const sha256Hex = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

/**
 * Destination scope for an idempotency key: the buyer host, normalized the same
 * way the request URL is built, or `undefined` for DGII itself.
 */
const destinationScope = (buyerHost: string | undefined): string | undefined =>
  buyerHost === undefined
    ? undefined
    : buyerHost.replace(/\/+$/, '').toLowerCase();

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
  private readonly onEvent: ((event: EcfEvent) => void) | undefined;
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
    this.onEvent = options.onEvent;
    this.idempotency =
      options.idempotencyStore ?? new InMemoryIdempotencyStore();
    this.http = new HttpClient({
      baseUrl: BaseUrl.ECF,
      environment: this.environment,
      ...(this.onEvent !== undefined ? { onEvent: this.onEvent } : {}),
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

  /**
   * Idempotency key for a submission.
   *
   * `RNC + eNCF + SHA-256(signed XML)` for DGII, and the same key suffixed with
   * the destination host for a direct buyer-host delivery. The destination
   * scope is load-bearing: without it, delivering the same document to a buyer
   * after DGII accepted it was answered from the DGII entry in the cache and
   * never transmitted, so the buyer never received its copy.
   *
   * DGII keys keep the documented three-part shape, which leaves markers
   * written by an earlier version readable.
   */
  private buildIdempotencyKey(signedXml: string, destination?: string): string {
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
    const scope = destination === undefined ? '' : `@${destination}`;
    return `${rnc}:${ncf}:${sha256Hex(signedXml)}${scope}`;
  }

  /**
   * Run a submission through the persist-before-transmit idempotency flow.
   *
   * The pending marker is written first so an interrupted send can be
   * reconciled instead of re-issued; a successful response replaces it, and
   * a failure clears it so the caller can retry.
   *
   * A 2xx whose body is not a JSON object is **not** success: DGII accepted the
   * document, but the SDK has nothing readable to give the caller, so the
   * marker is kept and a `VALIDATION` failure is returned with the instruction
   * to reconcile. Overwriting the marker with `undefined` used to drop the
   * lock, and the next identical call re-transmitted the same e-NCF.
   */
  private emitIdempotency(
    state: 'miss' | 'hit' | 'pending' | 'joined',
    meta: {
      correlationId: string;
      operation: string;
      resource: string;
      identity: DocumentIdentity;
    },
  ): void {
    emitEvent(this.onEvent, {
      type: 'idempotency',
      correlationId: meta.correlationId,
      operation: meta.operation,
      resource: meta.resource,
      environment: this.environment,
      ...(meta.identity.rnc !== undefined ? { rnc: meta.identity.rnc } : {}),
      ...(meta.identity.encf !== undefined ? { encf: meta.identity.encf } : {}),
      documentHash: meta.identity.documentHash,
      idempotency: state,
      timestamp: utcTimestamp(),
      sdkVersion: SDK_VERSION,
    });
  }

  private async submitIdempotent<T>(
    key: string,
    send: (
      correlationId: string,
      identity: DocumentIdentity,
    ) => Promise<Result<T, DgiiError>>,
    meta: { operation: string; resource: string; signedXml: string },
  ): Promise<Result<T, DgiiError>> {
    const correlationId = newCorrelationId();
    const identity = documentIdentity(meta.signedXml);
    const eventMeta = {
      correlationId,
      operation: meta.operation,
      resource: meta.resource,
      identity,
    };

    const cached = await this.idempotency.get<T | PendingSubmission>(key);
    if (cached !== undefined) {
      if (isPendingSubmission(cached)) {
        this.emitIdempotency('pending', eventMeta);
        return err(
          new DgiiError(PENDING_SUBMISSION_MESSAGE, { code: 'IDEMPOTENCY' }),
        );
      }
      this.emitIdempotency('hit', eventMeta);
      return ok(cached);
    }
    this.emitIdempotency('miss', eventMeta);
    return this.singleFlight(key, async () => {
      await this.idempotency.set(key, PENDING_SUBMISSION);
      const result = await send(correlationId, identity);
      if (result.isErr()) {
        // No HTTP status means the request may still have reached DGII with the
        // answer lost. Clearing the marker would license the caller to re-send
        // a document DGII may already hold, so it is kept and the caller is
        // told to reconcile instead.
        if (result.error.status === undefined) {
          return err(
            new DgiiError(AMBIGUOUS_SUBMISSION_MESSAGE, {
              code: 'IDEMPOTENCY',
              data: result.error.data,
              cause: result.error,
            }),
          );
        }
        await this.idempotency.delete(key);
        return result;
      }
      if (!isRecord(result.value)) {
        return err(
          new DgiiError(UNEXPECTED_SUBMISSION_MESSAGE, {
            code: 'VALIDATION',
            data: result.value,
          }),
        );
      }
      await this.idempotency.set(key, result.value);
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
    if (buyerHost !== undefined) {
      const valid = validateBuyerHost(buyerHost);
      if (valid.isErr()) {
        return err(valid.error);
      }
    }
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
    if (buyerHost !== undefined) {
      this.http.setTokenForOrigin(buyerHost, token.value.token);
    } else {
      this.http.setToken(token.value.token);
      this.tokenExpiresAt = parseExpiry(token.value.expira);
    }
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
    buyerHost?: string,
  ): Promise<Result<ReconciliationResult, DgiiError>> {
    if (buyerHost !== undefined) {
      const valid = validateBuyerHost(buyerHost);
      if (valid.isErr()) {
        return err(valid.error);
      }
    }
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
      await this.idempotency.delete(
        this.buildIdempotencyKey(signedXml, destinationScope(buyerHost)),
      );
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
    if (buyerHost !== undefined) {
      const valid = validateBuyerHost(buyerHost);
      if (valid.isErr()) {
        return err(valid.error);
      }
      if (this.enforceB2BRules) {
        const applicable = checkB2BApplicability(signedXml);
        if (applicable.isErr()) {
          return err(applicable.error);
        }
      }
    }
    if (this.validateBeforeSend) {
      const validation = validateDocument(
        signedXml,
        this.xmllintBin !== undefined ? { bin: this.xmllintBin } : {},
      );
      if (validation.isErr()) {
        const isSchemaUnavailable =
          validation.error.code === 'VALIDATION' &&
          validation.error.message.startsWith('Schema unavailable');
        if (!isSchemaUnavailable) {
          return err(validation.error);
        }
      } else if (validation.value.length > 0) {
        return err(
          new DgiiError(
            `Document does not match the DGII XML Schema: ${formatViolations(validation.value)}`,
            { code: 'VALIDATION', data: validation.value },
          ),
        );
      }
    }
    const key = this.buildIdempotencyKey(
      signedXml,
      destinationScope(buyerHost),
    );
    return this.submitIdempotent(
      key,
      (correlationId, identity) => {
        const url = buyerHost
          ? buildSenderReceiverUrl(
              buyerHost,
              SenderReceiverEndpoint.SendInvoice,
            )
          : buildUrl(this.environment, Endpoint.SendInvoice);
        return this.http.postMultipart<InvoiceResponse>(
          url,
          fileName,
          signedXml,
          {
            absoluteUrl: true,
            resource: Endpoint.SendInvoice,
            retry: false,
            telemetry: {
              correlationId,
              operation: 'sendElectronicDocument',
              environment: this.environment,
              ...identity,
            },
          },
        );
      },
      {
        operation: 'sendElectronicDocument',
        resource: Endpoint.SendInvoice,
        signedXml,
      },
    );
  }

  /** Submit a signed summary invoice (RFCE). Idempotent like submissions. */
  async sendSummary(
    signedXml: string,
    fileName: string,
  ): Promise<Result<InvoiceSummaryResponse, DgiiError>> {
    const key = this.buildIdempotencyKey(signedXml);
    return this.submitIdempotent(
      key,
      (correlationId, identity) =>
        this.http.postMultipart<InvoiceSummaryResponse>(
          buildUrl(this.environment, Endpoint.SendSummary, BaseUrl.CF),
          fileName,
          signedXml,
          {
            absoluteUrl: true,
            resource: Endpoint.SendSummary,
            retry: false,
            telemetry: {
              correlationId,
              operation: 'sendSummary',
              environment: this.environment,
              ...identity,
            },
          },
        ),
      {
        operation: 'sendSummary',
        resource: Endpoint.SendSummary,
        signedXml,
      },
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
    if (buyerHost !== undefined) {
      const valid = validateBuyerHost(buyerHost);
      if (valid.isErr()) {
        return err(valid.error);
      }
    }
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
    return ok(normalizeInquiryStatus(payload));
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
    if (buyerHost !== undefined) {
      const valid = validateBuyerHost(buyerHost);
      if (valid.isErr()) {
        return Promise.resolve(err(valid.error));
      }
    }
    const key = this.buildIdempotencyKey(
      signedXml,
      destinationScope(buyerHost),
    );
    if (buyerHost !== undefined) {
      return this.submitIdempotent<B2BCommercialApprovalResponse>(
        key,
        async (correlationId, identity) => {
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
              retry: false,
              telemetry: {
                correlationId,
                operation: 'sendCommercialApproval',
                environment: this.environment,
                ...identity,
              },
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
        {
          operation: 'sendCommercialApproval',
          resource: SenderReceiverEndpoint.CommercialApproval,
          signedXml,
        },
      );
    }
    return this.submitIdempotent(
      key,
      (correlationId, identity) =>
        this.http.postMultipart<CommercialApprovalResponse>(
          buildUrl(this.environment, Endpoint.CommercialApproval),
          fileName,
          signedXml,
          {
            absoluteUrl: true,
            resource: Endpoint.CommercialApproval,
            retry: false,
            telemetry: {
              correlationId,
              operation: 'sendCommercialApproval',
              environment: this.environment,
              ...identity,
            },
          },
        ),
      {
        operation: 'sendCommercialApproval',
        resource: Endpoint.CommercialApproval,
        signedXml,
      },
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
    return this.submitIdempotent(
      key,
      (correlationId, identity) =>
        this.http.postMultipart<VoidNCFResponse>(
          buildUrl(this.environment, Endpoint.Void),
          fileName,
          signedXml,
          {
            absoluteUrl: true,
            resource: Endpoint.Void,
            retry: false,
            telemetry: {
              correlationId,
              operation: 'voidENCF',
              environment: this.environment,
              ...identity,
            },
          },
        ),
      {
        operation: 'voidENCF',
        resource: Endpoint.Void,
        signedXml,
      },
    );
  }
}
