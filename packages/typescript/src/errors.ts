import type { Mensaje } from './types.js';

export type DgiiErrorCode =
  | 'INVALID_XML'
  | 'CERTIFICATE'
  | 'SIGNING'
  | 'HTTP'
  | 'AUTH'
  | 'TIMEOUT'
  | 'CIRCUIT_OPEN'
  | 'IDEMPOTENCY'
  | 'VALIDATION'
  | 'UNKNOWN';

const RETRYABLE_STATUSES = new Set<number>([408, 429, 500, 502, 503, 504]);

export const isRetryableStatus = (status: number | undefined): boolean =>
  status !== undefined && RETRYABLE_STATUSES.has(status);

export interface DgiiErrorOptions {
  code?: DgiiErrorCode;
  status?: number;
  statusText?: string;
  resource?: string;
  method?: string;
  baseURL?: string;
  data?: unknown;
  mensajes?: Mensaje[];
  retryable?: boolean;
  cause?: unknown;
}

const MAX_RAW = 1000;

const truncate = (value: string): string =>
  value.length > MAX_RAW ? `${value.slice(0, MAX_RAW)}…` : value;

const collapseWhitespace = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const looksLikeHtml = (value: string): boolean =>
  /^\s*<(?:!doctype|html|body|head)\b/i.test(value);

const stripHtml = (value: string): string =>
  collapseWhitespace(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );

const readMensajes = (value: unknown): Mensaje[] | undefined => {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const out: Mensaje[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) {
      out.push({ valor: item.trim(), codigo: 0 });
    } else if (isObject(item) && typeof item.valor === 'string') {
      const codigo = item.codigo;
      out.push({
        valor: item.valor,
        codigo:
          typeof codigo === 'number' || typeof codigo === 'string' ? codigo : 0,
      });
    }
  }
  return out.length ? out : undefined;
};

const MESSAGE_KEYS = [
  'mensaje',
  'Mensaje',
  'message',
  'Message',
  'error',
  'Error',
  'errorMessage',
  'error_description',
  'detail',
  'Detail',
  'title',
  'Title',
  'descripcion',
  'Descripcion',
];

/**
 * Reduce DGII's inconsistent error payloads (bare string, `{ mensajes }`,
 * ASP.NET ProblemDetails/ModelState, or an HTML page) to a single message.
 */
export const extractDgiiErrorMessage = (
  data: unknown,
  seen: WeakSet<object> = new WeakSet<object>(),
): string | undefined => {
  if (data === undefined || data === null) {
    return undefined;
  }

  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (!trimmed) {
      return undefined;
    }
    if (/^[[{"]/.test(trimmed)) {
      try {
        return extractDgiiErrorMessage(JSON.parse(trimmed), seen);
      } catch {
        // Not JSON after all — fall through to raw text.
      }
    }
    if (looksLikeHtml(trimmed)) {
      const text = stripHtml(trimmed);
      return text ? truncate(text) : undefined;
    }
    return truncate(collapseWhitespace(trimmed));
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return String(data);
  }

  if (data instanceof Error) {
    return data.message || undefined;
  }

  if (Array.isArray(data)) {
    if (seen.has(data)) {
      return undefined;
    }
    seen.add(data);
    const parts = data
      .map((item) => extractDgiiErrorMessage(item, seen))
      .filter((item): item is string => Boolean(item));
    return parts.length ? truncate(parts.join(' | ')) : undefined;
  }

  if (isObject(data)) {
    if (seen.has(data)) {
      return undefined;
    }
    seen.add(data);

    const mensajes = readMensajes(data.mensajes ?? data.Mensajes);
    if (mensajes) {
      return truncate(mensajes.map((mensaje) => mensaje.valor).join(' | '));
    }

    for (const key of MESSAGE_KEYS) {
      const value = data[key];
      if (typeof value === 'string' && value.trim()) {
        return truncate(collapseWhitespace(value));
      }
      if (key === 'error' && (isObject(value) || Array.isArray(value))) {
        const nested = extractDgiiErrorMessage(value, seen);
        if (nested) {
          return nested;
        }
      }
    }

    const errors = data.errors ?? data.Errors;
    if (isObject(errors)) {
      const parts = Object.entries(errors)
        .map(([field, value]) => {
          const nested = extractDgiiErrorMessage(value, seen);
          return nested ? `${field}: ${nested}` : undefined;
        })
        .filter((item): item is string => Boolean(item));
      if (parts.length) {
        return truncate(parts.join(' | '));
      }
    } else if (errors) {
      const nested = extractDgiiErrorMessage(errors, seen);
      if (nested) {
        return nested;
      }
    }

    try {
      const serialized = JSON.stringify(data);
      if (serialized && serialized !== '{}') {
        return truncate(serialized);
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
};

export class DgiiError extends Error {
  readonly code: DgiiErrorCode;
  readonly status?: number;
  readonly statusText?: string;
  readonly resource?: string;
  readonly method?: string;
  readonly baseURL?: string;
  readonly data?: unknown;
  readonly mensajes?: Mensaje[];
  readonly retryable: boolean;

  constructor(message: string, options: DgiiErrorOptions = {}) {
    super(message);
    this.name = 'DgiiError';
    Object.setPrototypeOf(this, DgiiError.prototype);

    this.code = options.code ?? 'UNKNOWN';
    this.status = options.status;
    this.statusText = options.statusText;
    this.resource = options.resource;
    this.method = options.method;
    this.baseURL = options.baseURL;
    this.data = options.data;
    this.mensajes = options.mensajes;
    this.retryable = options.retryable ?? isRetryableStatus(options.status);

    if (options.cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: options.cause,
        enumerable: false,
        writable: true,
        configurable: true,
      });
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      status: this.status,
      statusText: this.statusText,
      resource: this.resource,
      method: this.method,
      mensajes: this.mensajes,
      data: this.data,
    };
  }
}

export interface DgiiErrorContext {
  code?: DgiiErrorCode;
  status?: number;
  statusText?: string;
  resource?: string;
  method?: string;
  baseURL?: string;
  fallbackMessage?: string;
}

/** Normalize any thrown value into a {@link DgiiError}. */
export const toDgiiError = (
  err: unknown,
  context: DgiiErrorContext = {},
): DgiiError => {
  if (err instanceof DgiiError) {
    return err;
  }

  if (err instanceof Error) {
    return new DgiiError(
      err.message || context.fallbackMessage || 'DGII request failed',
      {
        ...context,
        cause: err,
      },
    );
  }

  const message =
    extractDgiiErrorMessage(err) ||
    context.fallbackMessage ||
    'DGII request failed';
  const status =
    isObject(err) && typeof err.status === 'number'
      ? err.status
      : context.status;

  return new DgiiError(message, {
    ...context,
    status,
    data: err,
    mensajes: isObject(err)
      ? readMensajes(err.mensajes ?? err.Mensajes)
      : undefined,
    cause: err,
  });
};
