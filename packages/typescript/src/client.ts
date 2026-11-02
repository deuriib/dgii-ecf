import { createHash } from 'node:crypto';
import { err, ok, type Result } from './result.js';
import { DgiiError } from './errors.js';
import {
  BaseUrl,
  Endpoint,
  Environment,
  SenderReceiverEndpoint,
  buildSenderReceiverUrl,
  buildUrl,
} from './environment.js';
import {
  HttpClient,
  InMemoryIdempotencyStore,
  type IdempotencyStore,
} from './http.js';
import type { ResilienceOptions } from './resilience.js';
import { resolveReceptionRoute } from './reception.js';
import { Signature } from './signing.js';
import { extractElementText } from './xml.js';
import type { P12ReaderData } from './certificate.js';
import type {
  AuthToken,
  CommercialApprovalResponse,
  InquiryInvoiceSummary,
  InquiryStatusResponse,
  InvoiceResponse,
  InvoiceSummaryResponse,
  ServiceDirectoryResponse,
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
}

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

  constructor(
    credentials: P12ReaderData,
    environment: Environment = Environment.Dev,
    options: EcfOptions = {},
  ) {
    this.credentials = credentials;
    this.environment = environment;
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
    });
  }

  private buildIdempotencyKey(signedXml: string): string {
    const rnc = extractElementText(signedXml, 'RNCEmisor') ?? 'unknown-rnc';
    // ACECF carries `eNCF`; ANECF uses `RangoNCF`. Fall back to the hash if
    // neither is present, so the key is still unique per document.
    const ncf =
      extractElementText(signedXml, 'eNCF') ??
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
          new DgiiError(
            'A submission with this key is already pending; reconcile via a status lookup before retrying',
            { code: 'IDEMPOTENCY' },
          ),
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
    return ok(token.value);
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
      });
    }
    const url = buildUrl(this.environment, Endpoint.Seed);
    return this.http.get<string>(url, undefined, {
      absoluteUrl: true,
      resource: Endpoint.Seed,
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

  statusTrackId(
    trackId: string,
  ): Promise<Result<TrackingStatusResponse, DgiiError>> {
    const url = buildUrl(this.environment, Endpoint.TrackResultStatus);
    return this.http.get<TrackingStatusResponse>(
      url,
      { trackId },
      { absoluteUrl: true, resource: Endpoint.TrackResultStatus },
    );
  }

  inquiryStatus(
    rncEmisor: string,
    ncfElectronico: string,
    rncComprador?: string,
    codigoSeguridad?: string,
  ): Promise<Result<InquiryStatusResponse, DgiiError>> {
    const url = buildUrl(this.environment, Endpoint.InquiryStatus);
    return this.http.get<InquiryStatusResponse>(
      url,
      { rncEmisor, ncfElectronico, rncComprador, codigoSeguridad },
      { absoluteUrl: true, resource: Endpoint.InquiryStatus },
    );
  }

  trackStatuses(
    rncEmisor: string,
    encf: string,
  ): Promise<Result<SummaryTrackingStatusResponse[], DgiiError>> {
    const url = buildUrl(this.environment, Endpoint.AllTrackingEcf);
    return this.http.get<SummaryTrackingStatusResponse[]>(
      url,
      { rncEmisor, encf },
      { absoluteUrl: true, resource: Endpoint.AllTrackingEcf },
    );
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
  ): Promise<Result<CommercialApprovalResponse, DgiiError>> {
    const key = this.buildIdempotencyKey(signedXml);
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
