import {
  isBrokenCircuitError,
  isBulkheadRejectedError,
  isIsolatedCircuitError,
  isTaskCancelledError,
} from 'cockatiel';
import { BaseUrl } from './environment.js';
import { err, ok, type Result } from './result.js';
import {
  DgiiError,
  extractDgiiErrorMessage,
  extractMensajes,
  toDgiiError,
} from './errors.js';
import {
  createResiliencePolicies,
  defaultResilienceOptions,
  type ResilienceOptions,
  type ResiliencePolicies,
} from './resilience.js';
import {
  SDK_VERSION,
  emitEvent,
  newCorrelationId,
  utcTimestamp,
  type EcfEvent,
} from './telemetry.js';

/**
 * Pluggable idempotency store. Provide a Redis/Postgres-backed implementation
 * in production so a retried or duplicated submission never double-issues.
 */
export interface IdempotencyStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Default lifetime of a cached submission: 24 hours. */
const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
/** Sweep expired entries once the map grows past this many live slots. */
const IDEMPOTENCY_SWEEP_THRESHOLD = 1_000;

export interface InMemoryIdempotencyStoreOptions {
  /** How long a cached entry stays valid. Defaults to 24 hours. */
  readonly ttlMs?: number;
  /** Clock used for expiry, injectable for tests. Defaults to `Date.now`. */
  readonly now?: () => number;
}

interface IdempotencyEntry {
  readonly value: unknown;
  readonly expiresAt: number;
}

/**
 * Process-local default. Fine for single-instance usage and tests.
 *
 * Entries expire after `ttlMs` so a long-running process cannot grow without
 * bound; reads drop expired entries and the map is swept once it passes
 * `IDEMPOTENCY_SWEEP_THRESHOLD`. For more than one instance, back the store
 * with Redis or Postgres.
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<string, IdempotencyEntry>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: InMemoryIdempotencyStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_IDEMPOTENCY_TTL_MS;
    if (!Number.isFinite(this.ttlMs) || this.ttlMs <= 0) {
      throw new RangeError('ttlMs must be a positive finite number');
    }
    this.now = options.now ?? Date.now;
  }

  /** Number of live entries; expired ones are swept first. */
  get size(): number {
    this.sweepExpired();
    return this.entries.size;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return undefined;
    }
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    if (this.entries.size > IDEMPOTENCY_SWEEP_THRESHOLD) {
      this.sweepExpired();
    }
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  private sweepExpired(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }
}

export interface TelemetryContext {
  readonly correlationId?: string;
  readonly operation?: string;
  readonly environment?: string;
  readonly rnc?: string;
  readonly encf?: string;
  readonly documentHash?: string;
}

export interface HttpClientOptions {
  baseUrl: string;
  token?: string;
  resilience?: ResilienceOptions;
  policies?: ResiliencePolicies;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Optional telemetry callback; never awaited and exceptions are swallowed. */
  onEvent?: (event: EcfEvent) => void;
  /** Optional environment label included on emitted telemetry events. */
  environment?: string;
  /** Runs before every authenticated request; may refresh credentials. */
  beforeRequest?: () => Promise<void>;
  /** Runs on a 401; return `true` to replay the request once. */
  onUnauthorized?: () => Promise<boolean>;
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  /** Absolute URL when `absoluteUrl` is true, otherwise a path appended to baseUrl. */
  path: string;
  absoluteUrl?: boolean;
  headers?: Record<string, string>;
  body?: BodyInit;
  query?: Record<string, string | number | undefined>;
  resource?: string;
  /** Skip the auth hooks (used by the authentication round-trip itself). */
  skipAuthHooks?: boolean;
  /** Do not attach the bearer token (used by the status service). */
  omitAuth?: boolean;
  /**
   * Whether the retry policy wraps this request. Default `true`.
   *
   * Set `false` for the non-idempotent submissions: a retry of a POST whose
   * outcome is unknown re-sends a fiscal document DGII may already hold.
   */
  retry?: boolean;
  /** Optional telemetry metadata attached to transmission events. */
  telemetry?: TelemetryContext;
}

interface RequestContext {
  method: string;
  resource: string;
  baseURL: string;
}

const parseRetryAfterMs = (header: string | null): number | undefined => {
  if (!header) {
    return undefined;
  }
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10) * 1000;
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return undefined;
};

/** Thin HTTP client over the native `fetch`, wrapped in per-origin resilience policies. */
export class HttpClient {
  private token?: string;
  private readonly tokensByOrigin = new Map<string, string>();
  private readonly policiesByOrigin = new Map<string, ResiliencePolicies>();
  private readonly resilienceOptions: ResilienceOptions;
  private readonly halfOpenAfterMs: number;
  private readonly breakerOpenedAt = new Map<string, number>();
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly onEvent: ((event: EcfEvent) => void) | undefined;
  private readonly environment: string | undefined;
  private readonly beforeRequest: (() => Promise<void>) | undefined;
  private readonly onUnauthorized: (() => Promise<boolean>) | undefined;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.token = options.token;
    this.onEvent = options.onEvent;
    this.environment = options.environment;
    this.beforeRequest = options.beforeRequest;
    this.onUnauthorized = options.onUnauthorized;
    this.resilienceOptions = {
      ...options.resilience,
      ...(options.timeoutMs !== undefined
        ? { timeoutMs: options.timeoutMs }
        : {}),
    };
    this.halfOpenAfterMs =
      this.resilienceOptions.halfOpenAfterMs ??
      defaultResilienceOptions.halfOpenAfterMs;
    if (options.policies) {
      this.policiesByOrigin.set(this.originKey(this.baseUrl), options.policies);
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private originKey(url: string): string {
    try {
      return new URL(url).origin;
    } catch {
      return this.baseUrl;
    }
  }

  private isDgiiOrigin(origin: string): boolean {
    return (
      origin === this.originKey(this.baseUrl) ||
      origin === BaseUrl.ECF ||
      origin === BaseUrl.CF
    );
  }

  private getPoliciesForOrigin(origin: string): ResiliencePolicies {
    let policies = this.policiesByOrigin.get(origin);
    if (!policies) {
      policies = createResiliencePolicies(this.resilienceOptions);
      const cb = policies.circuitBreaker as {
        onBreak?: (cb: () => void) => void;
        onHalfOpen?: (cb: () => void) => void;
        onReset?: (cb: () => void) => void;
      };
      cb.onBreak?.(() => {
        const now = Date.now();
        this.breakerOpenedAt.set(origin, now);
        emitEvent(this.onEvent, {
          type: 'breaker.changed',
          correlationId: newCorrelationId(),
          operation: 'circuitBreaker',
          resource: origin,
          ...(this.environment !== undefined
            ? { environment: this.environment }
            : {}),
          breakerState: 'open',
          breakerSince: now,
          timestamp: utcTimestamp(),
          sdkVersion: SDK_VERSION,
        });
      });
      cb.onHalfOpen?.(() => {
        emitEvent(this.onEvent, {
          type: 'breaker.changed',
          correlationId: newCorrelationId(),
          operation: 'circuitBreaker',
          resource: origin,
          ...(this.environment !== undefined
            ? { environment: this.environment }
            : {}),
          breakerState: 'half_open',
          breakerSince: Date.now(),
          timestamp: utcTimestamp(),
          sdkVersion: SDK_VERSION,
        });
      });
      cb.onReset?.(() => {
        this.breakerOpenedAt.delete(origin);
        emitEvent(this.onEvent, {
          type: 'breaker.changed',
          correlationId: newCorrelationId(),
          operation: 'circuitBreaker',
          resource: origin,
          ...(this.environment !== undefined
            ? { environment: this.environment }
            : {}),
          breakerState: 'closed',
          breakerSince: Date.now(),
          timestamp: utcTimestamp(),
          sdkVersion: SDK_VERSION,
        });
      });
      this.policiesByOrigin.set(origin, policies);
    }
    return policies;
  }

  setToken(token: string): void {
    this.token = token;
  }

  setTokenForOrigin(origin: string, token: string): void {
    this.tokensByOrigin.set(this.originKey(origin), token);
  }

  getToken(): string | undefined {
    return this.token;
  }

  clearToken(): void {
    this.token = undefined;
  }

  private buildUrl(
    path: string,
    absoluteUrl: boolean | undefined,
    query: RequestOptions['query'],
  ): string {
    let url = absoluteUrl
      ? path
      : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;

    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== '') {
          params.set(key, String(value));
        }
      }
      const qs = params.toString();
      if (qs) {
        url += (url.includes('?') ? '&' : '?') + qs;
      }
    }
    return url;
  }

  private authHeaders(
    origin: string,
    extra?: Record<string, string>,
    omitAuth = false,
  ): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (!omitAuth) {
      const token = this.isDgiiOrigin(origin)
        ? this.token
        : this.tokensByOrigin.get(origin);
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }
    return { ...headers, ...extra };
  }

  private async readBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') ?? '';
    try {
      if (contentType.includes('json')) {
        return await response.json();
      }
      const text = await response.text();
      return text.length ? text : undefined;
    } catch {
      return undefined;
    }
  }

  private async parseResponse<T>(
    response: Response,
    ctx: RequestContext,
  ): Promise<Result<T, DgiiError>> {
    // A redirect is never followed. `fetch` defaults to follow, which would
    // replay a signed fiscal document — and the `Authorization` header — to
    // whatever host the response names. `redirect: 'manual'` surfaces the 3xx
    // instead, and it is rejected here without reading the body.
    if (response.status >= 300 && response.status < 400) {
      return err(
        new DgiiError(
          `DGII responded with a redirect (${response.status}); refusing to replay the request to another host`,
          {
            code: 'HTTP',
            status: response.status,
            statusText: response.statusText,
            resource: ctx.resource,
            method: ctx.method,
            baseURL: ctx.baseURL,
            retryable: false,
          },
        ),
      );
    }

    const data = await this.readBody(response);

    if (response.ok) {
      return ok(data as T);
    }

    const message =
      extractDgiiErrorMessage(data) ??
      `DGII request failed with status ${response.status}`;
    const error = new DgiiError(message, {
      code: response.status === 401 ? 'AUTH' : 'HTTP',
      status: response.status,
      statusText: response.statusText,
      resource: ctx.resource,
      method: ctx.method,
      baseURL: ctx.baseURL,
      data,
      mensajes: extractMensajes(data),
      retryAfter: parseRetryAfterMs(response.headers.get('retry-after')),
    });

    // Throw retryable failures so the retry/breaker policies can act on them;
    // non-retryable client errors are returned as a typed failure.
    if (error.retryable) {
      throw error;
    }
    return err(error);
  }

  async request<T>(options: RequestOptions): Promise<Result<T, DgiiError>> {
    const correlationId =
      options.telemetry?.correlationId ?? newCorrelationId();
    const resource = options.resource ?? options.path;
    const operation = options.telemetry?.operation ?? resource;
    const environment = options.telemetry?.environment ?? this.environment;
    const startedAt = performance.now();

    const baseTelemetry = {
      correlationId,
      operation,
      resource,
      ...(environment !== undefined ? { environment } : {}),
      ...(options.telemetry?.rnc !== undefined
        ? { rnc: options.telemetry.rnc }
        : {}),
      ...(options.telemetry?.encf !== undefined
        ? { encf: options.telemetry.encf }
        : {}),
      ...(options.telemetry?.documentHash !== undefined
        ? { documentHash: options.telemetry.documentHash }
        : {}),
      sdkVersion: SDK_VERSION,
    };

    emitEvent(this.onEvent, {
      ...baseTelemetry,
      type: 'transmission.started',
      timestamp: utcTimestamp(),
    });

    const targetUrl = this.buildUrl(
      options.path,
      options.absoluteUrl,
      options.query,
    );
    const isBaseOrigin = this.isDgiiOrigin(this.originKey(targetUrl));

    if (!options.skipAuthHooks && isBaseOrigin) {
      await this.beforeRequest?.();
    }

    let finalResult = await this.execute<T>(options);

    if (
      !options.skipAuthHooks &&
      isBaseOrigin &&
      finalResult.isErr() &&
      finalResult.error.status === 401 &&
      this.onUnauthorized !== undefined
    ) {
      const replayed = await this.onUnauthorized();
      if (replayed) {
        finalResult = await this.execute<T>(options);
      }
    }

    const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
    if (finalResult.isOk()) {
      emitEvent(this.onEvent, {
        ...baseTelemetry,
        type: 'transmission.succeeded',
        durationMs,
        httpStatus: 200,
        timestamp: utcTimestamp(),
      });
    } else {
      emitEvent(this.onEvent, {
        ...baseTelemetry,
        type: 'transmission.failed',
        durationMs,
        ...(finalResult.error.status !== undefined
          ? { httpStatus: finalResult.error.status }
          : {}),
        errorCode: finalResult.error.code,
        retryable: finalResult.error.retryable,
        timestamp: utcTimestamp(),
      });
    }
    return finalResult;
  }

  private async execute<T>(
    options: RequestOptions,
  ): Promise<Result<T, DgiiError>> {
    const url = this.buildUrl(options.path, options.absoluteUrl, options.query);
    const origin = this.originKey(url);
    const method = options.method ?? 'GET';
    const headers = this.authHeaders(origin, options.headers, options.omitAuth);
    const ctx: RequestContext = {
      method,
      resource: options.resource ?? options.path,
      baseURL: origin,
    };

    const policies = this.getPoliciesForOrigin(origin);
    const policy =
      options.retry === false ? policies.policyWithoutRetry : policies.policy;

    try {
      return await policy.execute(async ({ signal }) => {
        const response = await this.fetchImpl(url, {
          method,
          headers,
          body: options.body,
          signal,
          redirect: 'manual',
        });
        return this.parseResponse<T>(response, ctx);
      });
    } catch (error) {
      if (
        isBrokenCircuitError(error) ||
        isIsolatedCircuitError(error) ||
        isBulkheadRejectedError(error)
      ) {
        const openedAt = this.breakerOpenedAt.get(origin);
        const retryAfter =
          openedAt !== undefined
            ? Math.max(0, openedAt + this.halfOpenAfterMs - Date.now())
            : undefined;
        return err(
          new DgiiError(error.message, {
            code: 'CIRCUIT_OPEN',
            retryable: true,
            retryAfter,
            resource: ctx.resource,
            method: ctx.method,
            baseURL: ctx.baseURL,
            cause: error,
          }),
        );
      }
      if (
        isTaskCancelledError(error) ||
        (error instanceof Error &&
          (error.name === 'TimeoutError' ||
            error.name === 'AbortError' ||
            (error as { isTaskCancelledError?: unknown })
              .isTaskCancelledError === true ||
            error.message.toLowerCase().includes('timed out')))
      ) {
        return err(
          new DgiiError(
            error instanceof Error ? error.message : 'DGII request timed out',
            {
              code: 'TIMEOUT',
              retryable: true,
              resource: ctx.resource,
              method: ctx.method,
              baseURL: ctx.baseURL,
              cause: error,
            },
          ),
        );
      }
      return err(toDgiiError(error, ctx));
    }
  }

  get<T>(
    path: string,
    query?: RequestOptions['query'],
    opts?: {
      absoluteUrl?: boolean;
      resource?: string;
      skipAuthHooks?: boolean;
      telemetry?: TelemetryContext;
    },
  ): Promise<Result<T, DgiiError>> {
    return this.request<T>({
      method: 'GET',
      path,
      query,
      absoluteUrl: opts?.absoluteUrl,
      resource: opts?.resource,
      skipAuthHooks: opts?.skipAuthHooks,
      telemetry: opts?.telemetry,
    });
  }

  /**
   * POST a signed XML as a multipart `xml` file part. The runtime computes
   * `Content-Length` from the Blob — never set it manually.
   */
  postMultipart<T>(
    path: string,
    fileName: string,
    xml: string,
    opts?: {
      absoluteUrl?: boolean;
      resource?: string;
      skipAuthHooks?: boolean;
      retry?: boolean;
      telemetry?: TelemetryContext;
    },
  ): Promise<Result<T, DgiiError>> {
    const form = new FormData();
    form.append('xml', new Blob([xml], { type: 'application/xml' }), fileName);
    return this.request<T>({
      method: 'POST',
      path,
      body: form,
      headers: { Accept: 'application/json' },
      absoluteUrl: opts?.absoluteUrl,
      resource: opts?.resource,
      skipAuthHooks: opts?.skipAuthHooks,
      retry: opts?.retry,
      telemetry: opts?.telemetry,
    });
  }
}
