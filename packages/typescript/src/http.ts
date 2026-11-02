import { err, ok, type Result } from './result.js';
import { DgiiError, extractDgiiErrorMessage, toDgiiError } from './errors.js';
import {
  createResiliencePolicies,
  type ResilienceOptions,
  type ResiliencePolicies,
} from './resilience.js';

/**
 * Pluggable idempotency store. Provide a Redis/Postgres-backed implementation
 * in production so a retried or duplicated submission never double-issues.
 */
export interface IdempotencyStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Process-local default. Fine for single-instance usage and tests. */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export interface HttpClientOptions {
  baseUrl: string;
  token?: string;
  resilience?: ResilienceOptions;
  policies?: ResiliencePolicies;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
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
}

interface RequestContext {
  method: string;
  resource: string;
  baseURL: string;
}

/** Thin HTTP client over the native `fetch`, wrapped in resilience policies. */
export class HttpClient {
  private token?: string;
  private readonly policies: ResiliencePolicies;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.token = options.token;
    this.policies =
      options.policies ??
      createResiliencePolicies({
        ...options.resilience,
        ...(options.timeoutMs !== undefined
          ? { timeoutMs: options.timeoutMs }
          : {}),
      });
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  setToken(token: string): void {
    this.token = token;
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

  private authHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
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
    });

    // Throw retryable failures so the retry/breaker policies can act on them;
    // non-retryable client errors are returned as a typed failure.
    if (error.retryable) {
      throw error;
    }
    return err(error);
  }

  async request<T>(options: RequestOptions): Promise<Result<T, DgiiError>> {
    const url = this.buildUrl(options.path, options.absoluteUrl, options.query);
    const method = options.method ?? 'GET';
    const headers = this.authHeaders(options.headers);
    const ctx: RequestContext = {
      method,
      resource: options.resource ?? options.path,
      baseURL: this.baseUrl,
    };

    try {
      return await this.policies.policy.execute(async ({ signal }) => {
        const response = await this.fetchImpl(url, {
          method,
          headers,
          body: options.body,
          signal,
        });
        return this.parseResponse<T>(response, ctx);
      });
    } catch (error) {
      return err(toDgiiError(error, ctx));
    }
  }

  get<T>(
    path: string,
    query?: RequestOptions['query'],
    opts?: { absoluteUrl?: boolean; resource?: string },
  ): Promise<Result<T, DgiiError>> {
    return this.request<T>({
      method: 'GET',
      path,
      query,
      absoluteUrl: opts?.absoluteUrl,
      resource: opts?.resource,
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
    opts?: { absoluteUrl?: boolean; resource?: string },
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
    });
  }
}
