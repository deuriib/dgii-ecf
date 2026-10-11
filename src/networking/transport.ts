import { Effect, Layer } from 'effect';
import { env } from '../env';
import {
  FetchHttpClient,
  HttpBody,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from 'effect/http';
import type { HttpClientError } from 'effect/http';
import { classifyDgiiError, isDgiiError, type DgiiError } from './errors';
import { DgiiApiError, extractDgiiErrorMessage } from './DgiiApiError';

/**
 * Default timeout applied to every DGII request. DGII services occasionally
 * stall under load; a bounded client fails closed with a typed `TimeoutError`
 * instead of hanging the caller. PR-4 scope: closes CRITICAL-2 (no axios
/**
 * Default timeout applied to every DGII request. DGII services occasionally
 * hang, so the timeout is set to 30s (CRITICAL-2).
 */
export const DGII_REQUEST_TIMEOUT_MS = env.DGII_REQUEST_TIMEOUT_MS;

/**
 * Narrowing guard for Effect `HttpClientError` values. `Data.TaggedError`
 * instances carry `_tag: "HttpClientError"`; the `reason` field holds the
 * specific failure the mapper switches on.
 */
const isTransportFailure = (
  value: unknown
): value is HttpClientError.HttpClientError =>
  typeof value === 'object' &&
  value !== null &&
  '_tag' in value &&
  value._tag === 'HttpClientError';
/**
 * Convert anything the Effect transport raises into the typed error channel.
 * Precedence: already-typed errors pass through; `DgiiApiError` instances
 * keep their classifier-derived tag; Effect `HttpClientError`s map by reason;
 * anything else normalizes structurally.
 */
export const toTransportError = (err: unknown): DgiiError => {
  if (isDgiiError(err)) {
    return err;
  }

  if (err instanceof DgiiApiError) {
    return classifyDgiiError({
      _tag: err._tag,
      message: err.message,
      status: err.status,
      statusText: err.statusText,
      code: err.code,
      resource: err.resource,
      method: err.method,
      baseURL: err.baseURL,
      cause: err,
    });
  }

  if (isTransportFailure(err)) {
    return fromHttpClientError(err);
  }

  // Fetch rejections (aborts, DNS, refused connections) arrive as DOMException
  // or TypeError, never as HttpClientError — map them by name/message.
  if (err instanceof DOMException || err instanceof TypeError) {
    return classifyDgiiError({
      message: err.message || 'DGII network request failed',
      code: err.name,
      cause: err,
    });
  }

  if (typeof err === 'object' && err !== null) {
    return classifyDgiiError({
      message: err instanceof Error ? err.message : undefined,
      cause: err,
    });
  }

  return {
    _tag: 'UnknownError',
    message: 'Unknown DGII transport error',
    cause: err,
  };
};

/**
 * Map an Effect `HttpClientError` to the typed domain. A `StatusCodeError`
 * carries the real DGII response, so its description goes through the same
 * message extraction as the legacy axios path; transport failures keep the
 * request method and URL for observability.
 */
const fromHttpClientError = (
  err: HttpClientError.HttpClientError
): DgiiError => {
  const reason = err.reason;
  switch (reason._tag) {
    case 'StatusCodeError':
      return classifyDgiiError({
        message: `DGII request failed with status code ${reason.response.status}`,
        status: reason.response.status,
        resource: reason.request.url,
        method: reason.request.method,
        cause: err,
      });
    case 'TransportError': {
      const cause = reason.cause;
      const code =
        cause instanceof DOMException
          ? cause.name
          : cause instanceof TypeError
          ? 'FETCH_FAILED'
          : undefined;
      return {
        _tag: 'NetworkError',
        message: reason.description || err.message,
        ...(code !== undefined && { code }),
        resource: reason.methodAndUrl,
        method: reason.request.method,
        cause: cause ?? err,
      };
    }
    case 'EmptyBodyError':
      return classifyDgiiError({
        message: reason.description || 'DGII returned an empty body',
        status: reason.response.status,
        resource: reason.request.url,
        method: reason.request.method,
        cause: err,
      });
    case 'DecodeError':
    case 'EncodeError':
      return {
        _tag: 'SerializationError',
        message: reason.description || err.message,
        ...(reason.request.url !== undefined && {
          resource: reason.request.url,
        }),
      };
    default:
      return classifyDgiiError({
        message: err.message,
        resource: reason.request.url,
        method: reason.request.method,
        cause: err,
      });
  }
};

/**
 * Wrap an Effect program with the DGII timeout. A timeout surfaces as a
 * typed `TimeoutError` in the error channel instead of an opaque defect.
 */
export const withTimeout = <A, E, R>(
  self: Effect.Effect<A, E, R>,
  timeoutMs: number = DGII_REQUEST_TIMEOUT_MS
): Effect.Effect<A, E | DgiiError, R> =>
  self.pipe(
    Effect.timeoutOrElse({
      duration: timeoutMs,
      orElse: () =>
        Effect.fail({
          _tag: 'TimeoutError',
          message: `DGII request timed out after ${timeoutMs}ms`,
          timeout: timeoutMs,
        } satisfies DgiiError),
    })
  );

/**
 * Execute an Effect program against the fetch-backed client with the DGII
 * timeout applied. This is the boundary helper the Promise-preserving
 * facade uses while the public API stays `await`-shaped through PR-5.
 */
export const runDgiiRequest = <A>(
  self: Effect.Effect<
    A,
    DgiiError | HttpClientError.HttpClientError,
    HttpClient.HttpClient
  >,
  timeoutMs: number = DGII_REQUEST_TIMEOUT_MS
): Promise<A> => withFetch(undefined)(self, timeoutMs);

/**
 * Bind an explicit fetch implementation. Production callers omit `fetchImpl`
 * and get the platform default; tests inject a stub through the `Fetch`
 * context reference instead of racing `globalThis.fetch` mutation.
 */
export const withFetch =
  (fetchImpl?: typeof globalThis.fetch) =>
  <A>(
    self: Effect.Effect<
      A,
      DgiiError | HttpClientError.HttpClientError,
      HttpClient.HttpClient
    >,
    timeoutMs: number = DGII_REQUEST_TIMEOUT_MS
  ): Promise<A> => {
    const layer =
      fetchImpl === undefined
        ? FetchHttpClient.layer
        : FetchHttpClient.layer.pipe(
            Layer.provideMerge(Layer.succeed(FetchHttpClient.Fetch, fetchImpl))
          );
    return Effect.runPromise(
      withTimeout(self, timeoutMs).pipe(
        Effect.mapError(toTransportError),
        Effect.provide(layer)
      )
    );
  };

/**
 * Read an Effect response body as decoded JSON. Non-JSON bodies fail with a
 * typed `SerializationError` instead of a `SyntaxError`.
 */
export const readJsonBody = (
  response: HttpClientResponse.HttpClientResponse
): Effect.Effect<unknown, DgiiError, never> =>
  Effect.mapError(
    response.json,
    (err): DgiiError => ({
      _tag: 'SerializationError',
      message:
        err instanceof Error ? err.message : 'DGII response is not valid JSON',
    })
  );

/**
 * Build a GET request against the DGII client with optional query params.
 */
export const getRequest = (
  url: string,
  params?: Record<string, string | number | undefined>
): HttpClientRequest.HttpClientRequest =>
  params === undefined
    ? HttpClientRequest.get(url)
    : HttpClientRequest.get(url).pipe(HttpClientRequest.setUrlParams(params));

/**
 * Build a multipart XML upload request. DGII requires a valid multipart
 * body; `Content-Length` is derived from the serialized buffer (HIGH-3 fix:
 * no async length helpers, no stream-length probes).
 */
export const xmlUploadRequest = (
  url: string,
  xml: string,
  fileName: string
): HttpClientRequest.HttpClientRequest => {
  const boundary = `----DgiiEcfBoundary${Date.now().toString(36)}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="xml"; filename="${fileName}"\r\nContent-Type: application/xml\r\n\r\n`,
      'utf8'
    ),
    Buffer.from(xml, 'utf8'),
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
  ]);

  return HttpClientRequest.post(url).pipe(
    HttpClientRequest.setHeaders({
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      Accept: 'application/json',
      'Content-Length': String(body.length),
    }),
    HttpClientRequest.setBody(HttpBody.uint8Array(body))
  );
};

/**
 * Attach the bearer token to a request. Per-instance, never global —
 * PR-4 scope: closes CRITICAL-1 (cross-tenant leakage via the axios
 * default-header singleton).
 */
export const withBearerToken = (
  request: HttpClientRequest.HttpClientRequest,
  token: string
): HttpClientRequest.HttpClientRequest =>
  request.pipe(HttpClientRequest.bearerToken(token));

/**
 * Fail with a typed error when the response is not a 2xx. The rejection
 * carries the real DGII description: the body is read (best-effort, falls
 * back to the status line) and normalized through the same message
 * extraction as the legacy axios path.
 */
export const requireOkStatus = (
  response: HttpClientResponse.HttpClientResponse,
  request: HttpClientRequest.HttpClientRequest
): Effect.Effect<HttpClientResponse.HttpClientResponse, DgiiError, never> => {
  if (response.status >= 200 && response.status < 300) {
    return Effect.succeed(response);
  }
  return Effect.flatMap(
    Effect.catch(response.text, () => Effect.succeed(undefined)),
    (
      raw
    ): Effect.Effect<
      HttpClientResponse.HttpClientResponse,
      DgiiError,
      never
    > => {
      const message =
        (raw !== undefined && extractDgiiErrorMessage(raw)) ||
        `DGII request failed with status code ${response.status}`;
      return Effect.fail(
        classifyDgiiError({
          message,
          status: response.status,
          resource: request.url,
          method: request.method,
        })
      );
    }
  );
};
