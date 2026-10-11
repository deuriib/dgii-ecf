import { Schema } from 'effect';

/**
 * Structured DGII error vocabulary.
 *
 * This module is the single source of truth for classifying SDK failures.
 * `DgiiApiError` (the class thrown through the Promise API) derives its
 * `_tag` from here, and consumers can switch on `_tag` or use the exported
 * type guards instead of inspecting raw axios errors.
 *
 * In the Effect migration (PR-4+) this union becomes the typed error channel
 * of every `Effect<A, DgiiError, R>` program; the Schema runtime value is
 * already in place for `Schema.decodeUnknown` at response boundaries.
 */

/**
 * DGII-specific error codes extracted from API responses.
 */
export const DgiiErrorCode = Schema.Literals([
  'DUPLICATE_NCF',
  'INVALID_CERTIFICATE',
  'AUTH_EXPIRED',
  'INVALID_XML',
  'SERVICE_UNAVAILABLE',
  'RATE_LIMITED',
  'UNKNOWN',
]);
export type DgiiErrorCode = typeof DgiiErrorCode.Type;

/**
 * HTTP status codes that map to specific DGII error categories.
 */
export const HttpErrorCategory = Schema.Literals([
  400, // Bad Request — invalid payload/XML
  401, // Unauthorized — auth expired or invalid
  403, // Forbidden — certificate not authorized
  422, // Unprocessable Entity — validation failed
  429, // Too Many Requests — rate limited
  500, // Internal Server Error — DGII internal
  502, // Bad Gateway — upstream failure
  503, // Service Unavailable — maintenance
  504, // Gateway Timeout
]);
export type HttpErrorCategory = typeof HttpErrorCategory.Type;

/**
 * Tagged union for all SDK failures. Every variant carries structured
 * context for observability and retry logic.
 */
export const DgiiError = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal('AuthError'),
    message: Schema.String,
    status: Schema.optional(Schema.Number),
    code: Schema.optional(DgiiErrorCode),
    resource: Schema.optional(Schema.String),
    method: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    _tag: Schema.Literal('NetworkError'),
    message: Schema.String,
    status: Schema.optional(Schema.Number),
    statusText: Schema.optional(Schema.String),
    code: Schema.optional(Schema.String), // axios code: ECONNREFUSED, ETIMEDOUT, ...
    resource: Schema.optional(Schema.String),
    method: Schema.optional(Schema.String),
    baseURL: Schema.optional(Schema.String),
    cause: Schema.optional(Schema.Unknown), // original Error
  }),
  Schema.Struct({
    _tag: Schema.Literal('ValidationError'),
    message: Schema.String,
    field: Schema.optional(Schema.String),
    expected: Schema.optional(Schema.String),
    received: Schema.optional(Schema.Unknown),
    status: Schema.optional(Schema.Number),
    resource: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    _tag: Schema.Literal('TimeoutError'),
    message: Schema.String,
    elapsed: Schema.optional(Schema.Number), // milliseconds
    timeout: Schema.optional(Schema.Number), // configured timeout
    resource: Schema.optional(Schema.String),
    method: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    _tag: Schema.Literal('SerializationError'),
    message: Schema.String,
    payload: Schema.optional(Schema.Unknown),
    resource: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    _tag: Schema.Literal('UnknownError'),
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
    resource: Schema.optional(Schema.String),
    method: Schema.optional(Schema.String),
  }),
]);
export type DgiiError = typeof DgiiError.Type;

/**
 * Shape accepted by the classifier. This is deliberately structural: the
 * classifier must work on `DgiiApiError` instances, raw axios errors and
 * thrown payloads without importing any of them (keeps the dependency
 * direction one-way: consumers -> this module).
 */
export interface DgiiErrorShape {
  _tag?: string;
  message?: string;
  status?: number;
  statusText?: string;
  code?: string | null;
  resource?: string;
  method?: string;
  baseURL?: string;
  elapsed?: number;
  timeout?: number;
  field?: string;
  expected?: string;
  received?: unknown;
  payload?: unknown;
  cause?: unknown;
}

const KNOWN_TAGS: Record<string, true> = {
  AuthError: true,
  NetworkError: true,
  ValidationError: true,
  TimeoutError: true,
  SerializationError: true,
  UnknownError: true,
};

const AUTH_CODES: Record<string, true> = {
  AUTH_EXPIRED: true,
  INVALID_CERTIFICATE: true,
};

const TRANSPORT_CODES: Record<string, true> = {
  ECONNREFUSED: true,
  ENOTFOUND: true,
  ENETUNREACH: true,
  EAI_AGAIN: true,
  ETIMEDOUT: true,
};

const RETRYABLE_STATUSES: Record<number, true> = {
  429: true,
  502: true,
  503: true,
  504: true,
};

/**
 * Narrowing guard for the tagged union. Only trusts `_tag` values produced
 * by this module, so an unrelated object carrying a `_tag` property is not
 * mistaken for a structured SDK error.
 */
export const isDgiiError = (value: unknown): value is DgiiError =>
  typeof value === 'object' &&
  value !== null &&
  '_tag' in value &&
  typeof value._tag === 'string' &&
  value._tag in KNOWN_TAGS;

/**
 * Classify a structural error shape into the most specific typed variant.
 * Precedence: explicit tag > timeout markers > auth markers > HTTP status >
 * transport codes > unknown.
 */
export const classifyDgiiError = (shape: DgiiErrorShape): DgiiError => {
  const message = shape.message || 'DGII request failed';

  if ((shape._tag ?? '') in KNOWN_TAGS) {
    switch (shape._tag) {
      case 'AuthError':
        return {
          _tag: 'AuthError',
          message,
          ...(shape.status !== undefined && { status: shape.status }),
          ...(shape.code != null && {
            code: shape.code as DgiiErrorCode,
          }),
          ...(shape.resource !== undefined && { resource: shape.resource }),
          ...(shape.method !== undefined && { method: shape.method }),
        };
      case 'TimeoutError':
        return {
          _tag: 'TimeoutError',
          message,
          ...(shape.elapsed !== undefined && { elapsed: shape.elapsed }),
          ...(shape.timeout !== undefined && { timeout: shape.timeout }),
          ...(shape.resource !== undefined && { resource: shape.resource }),
          ...(shape.method !== undefined && { method: shape.method }),
        };
      case 'ValidationError':
        return {
          _tag: 'ValidationError',
          message,
          ...(shape.field !== undefined && { field: shape.field }),
          ...(shape.expected !== undefined && { expected: shape.expected }),
          ...(shape.received !== undefined && { received: shape.received }),
          ...(shape.status !== undefined && { status: shape.status }),
          ...(shape.resource !== undefined && { resource: shape.resource }),
        };
      case 'SerializationError':
        return {
          _tag: 'SerializationError',
          message,
          ...(shape.payload !== undefined && { payload: shape.payload }),
          ...(shape.resource !== undefined && { resource: shape.resource }),
        };
      case 'UnknownError':
        return {
          _tag: 'UnknownError',
          message,
          ...(shape.cause !== undefined && { cause: shape.cause }),
          ...(shape.resource !== undefined && { resource: shape.resource }),
          ...(shape.method !== undefined && { method: shape.method }),
        };
      case 'NetworkError':
        return buildNetworkError(shape);
    }
  }

  // Client abort via axios timeout surfaces as ECONNABORTED.
  if (shape.code === 'ECONNABORTED') {
    return {
      _tag: 'TimeoutError',
      message,
      elapsed: shape.elapsed,
      timeout: shape.timeout,
      ...(shape.resource !== undefined && { resource: shape.resource }),
      ...(shape.method !== undefined && { method: shape.method }),
    };
  }

  if (
    shape.status === 401 ||
    (shape.code != null && shape.code in AUTH_CODES)
  ) {
    return {
      _tag: 'AuthError',
      message,
      status: shape.status,
      ...(shape.code != null && {
        code: shape.code as DgiiErrorCode,
      }),
      ...(shape.resource !== undefined && { resource: shape.resource }),
      ...(shape.method !== undefined && { method: shape.method }),
    };
  }

  if (shape.status === 400 || shape.status === 422) {
    return {
      _tag: 'ValidationError',
      message,
      status: shape.status,
      ...(shape.resource !== undefined && { resource: shape.resource }),
    };
  }

  if (
    (shape.code != null && shape.code in TRANSPORT_CODES) ||
    (shape.status !== undefined && shape.status in RETRYABLE_STATUSES)
  ) {
    return buildNetworkError(shape);
  }

  if (shape.status !== undefined && shape.status >= 500) {
    return buildNetworkError(shape);
  }

  return {
    _tag: 'UnknownError',
    message,
    ...(shape.cause !== undefined && { cause: shape.cause }),
    ...(shape.resource !== undefined && { resource: shape.resource }),
    ...(shape.method !== undefined && { method: shape.method }),
    ...(shape.status !== undefined && { status: shape.status }),
  };
};

const buildNetworkError = (shape: DgiiErrorShape): DgiiError => ({
  _tag: 'NetworkError',
  message: shape.message || 'DGII request failed',
  ...(shape.status !== undefined && { status: shape.status }),
  ...(shape.statusText !== undefined && { statusText: shape.statusText }),
  ...(shape.code != null && { code: shape.code }),
  ...(shape.resource !== undefined && { resource: shape.resource }),
  ...(shape.method !== undefined && { method: shape.method }),
  ...(shape.baseURL !== undefined && { baseURL: shape.baseURL }),
  ...(shape.cause !== undefined && { cause: shape.cause }),
});

/**
 * Normalize anything thrown (axios error, `Error`, `DgiiApiError`, DGII
 * payload, ...) into the typed union. Uses structural classification so the
 * dependency graph stays acyclic.
 */
export const toDgiiError = (err: unknown): DgiiError => {
  if (isDgiiError(err)) {
    return err;
  }

  // Read the `Error` identity before object narrowing collapses the type.
  const isError = err instanceof Error;

  if (typeof err === 'object' && err !== null) {
    const shape = err as DgiiErrorShape;
    return classifyDgiiError({
      _tag: shape._tag,
      message: shape.message ?? (isError ? err.message : undefined),
      status: shape.status,
      statusText: shape.statusText,
      code: shape.code,
      resource: shape.resource,
      method: shape.method,
      baseURL: shape.baseURL,
      field: shape.field,
      expected: shape.expected,
      received: shape.received,
      cause: shape.cause ?? (isError ? err : undefined),
    });
  }

  return {
    _tag: 'UnknownError',
    message: 'Unknown DGII error',
    cause: err,
  };
};

/**
 * Type guard for retryable failures: transient transport codes and the DGII
 * statuses that reward a retry with backoff.
 */
export const isRetryable = (error: DgiiError): boolean =>
  error._tag === 'TimeoutError' ||
  (error._tag === 'NetworkError' &&
    ((error.code !== undefined && error.code in TRANSPORT_CODES) ||
      (error.status !== undefined && error.status in RETRYABLE_STATUSES)));

/**
 * Type guard for authentication failures that require re-auth.
 */
export const isAuthError = (error: DgiiError): boolean =>
  error._tag === 'AuthError' ||
  (error._tag === 'NetworkError' && error.status === 401);

/**
 * Type guard for validation failures (client-side bugs or rejected payloads;
 * retrying will not help).
 */
export const isValidationError = (error: DgiiError): boolean =>
  error._tag === 'ValidationError' ||
  (error._tag === 'NetworkError' && error.status === 400);
