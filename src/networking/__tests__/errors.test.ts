import { describe, expect, it } from 'vitest';
import {
  classifyDgiiError,
  isAuthError,
  isDgiiError,
  isRetryable,
  isValidationError,
  toDgiiError,
} from '../errors';
import type { DgiiError } from '../errors';
import { DgiiApiError } from '../DgiiApiError';

describe('isDgiiError', () => {
  it('accepts tagged values produced by the module', () => {
    expect(isDgiiError(classifyDgiiError({ status: 401 }))).toBe(true);
  });

  it('rejects untagged values', () => {
    expect(isDgiiError({})).toBe(false);
    expect(isDgiiError(null)).toBe(false);
    expect(isDgiiError(undefined)).toBe(false);
  });
});

describe('classifyDgiiError', () => {
  it('classifies 401 as AuthError', () => {
    const error = classifyDgiiError({ status: 401, message: 'nope' });
    expect(error._tag).toBe('AuthError');
  });

  it('classifies DGII auth codes as AuthError', () => {
    const error = classifyDgiiError({
      code: 'AUTH_EXPIRED',
      message: 'expired',
    });
    expect(error._tag).toBe('AuthError');
  });

  it('classifies transport aborts as TimeoutError', () => {
    const error = classifyDgiiError({
      code: 'ECONNABORTED',
      message: 'timeout of 5000ms exceeded',
    });
    expect(error._tag).toBe('TimeoutError');
  });

  it('classifies 400 as ValidationError', () => {
    const error = classifyDgiiError({ status: 400, message: 'bad xml' });
    expect(error._tag).toBe('ValidationError');
  });

  it('classifies 503 as NetworkError', () => {
    const error = classifyDgiiError({ status: 503, message: 'down' });
    expect(error._tag).toBe('NetworkError');
    if (error._tag === 'NetworkError') {
      expect(error.status).toBe(503);
    }
  });

  it('classifies ECONNREFUSED as NetworkError', () => {
    const error = classifyDgiiError({
      code: 'ECONNREFUSED',
      message: 'refused',
    });
    expect(error._tag).toBe('NetworkError');
  });

  it('preserves an explicit tag', () => {
    const error = classifyDgiiError({
      _tag: 'SerializationError',
      message: 'cannot sign',
    });
    expect(error._tag).toBe('SerializationError');
  });

  it('falls back to UnknownError', () => {
    const error = classifyDgiiError({ message: 'weird' });
    expect(error._tag).toBe('UnknownError');
  });
});

describe('toDgiiError', () => {
  it('returns tagged errors unchanged', () => {
    const tagged: DgiiError = {
      _tag: 'AuthError',
      message: 'expired',
      status: 401,
    };
    expect(toDgiiError(tagged)).toBe(tagged);
  });

  it('classifies thrown Error instances as UnknownError', () => {
    const error = toDgiiError(new Error('boom'));
    expect(error._tag).toBe('UnknownError');
    expect(error.message).toBe('boom');
  });

  it('classifies non-object payloads as UnknownError', () => {
    const error = toDgiiError('plain string');
    expect(error._tag).toBe('UnknownError');
    expect(error.message).toBe('Unknown DGII error');
  });
});

describe('guards on thrown DgiiApiError', () => {
  it('marks a 401 as an auth error', () => {
    const thrown = new DgiiApiError('unauthorized', { status: 401 });
    expect(thrown._tag).toBe('AuthError');
    expect(isAuthError(toDgiiError(thrown))).toBe(true);
    expect(isRetryable(toDgiiError(thrown))).toBe(false);
  });

  it('marks a 503 as retryable', () => {
    const thrown = new DgiiApiError('down', { status: 503 });
    expect(thrown._tag).toBe('NetworkError');
    expect(isRetryable(toDgiiError(thrown))).toBe(true);
    expect(isAuthError(toDgiiError(thrown))).toBe(false);
  });

  it('marks a 400 as a validation error', () => {
    const thrown = new DgiiApiError('bad xml', { status: 400 });
    expect(thrown._tag).toBe('ValidationError');
    expect(isValidationError(toDgiiError(thrown))).toBe(true);
    expect(isRetryable(toDgiiError(thrown))).toBe(false);
  });
});
