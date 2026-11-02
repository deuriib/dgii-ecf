import { describe, expect, it } from 'vitest';
import { isRetryableError } from '../src/resilience.js';
import { DgiiError } from '../src/errors.js';

describe('isRetryableError', () => {
  it('retries transient HTTP statuses', () => {
    expect(isRetryableError(new DgiiError('x', { status: 503 }))).toBe(true);
    expect(isRetryableError(new DgiiError('x', { status: 429 }))).toBe(true);
    expect(isRetryableError(new DgiiError('x', { status: 408 }))).toBe(true);
  });

  it('does not retry client errors', () => {
    expect(isRetryableError(new DgiiError('x', { status: 400 }))).toBe(false);
    expect(isRetryableError(new DgiiError('x', { status: 401 }))).toBe(false);
    expect(isRetryableError(new DgiiError('x', { status: 404 }))).toBe(false);
  });

  it('retries network errors', () => {
    expect(isRetryableError(new TypeError('fetch failed'))).toBe(true);
    expect(isRetryableError(new Error('request timeout'))).toBe(true);
  });

  it('does not retry unknown errors', () => {
    expect(isRetryableError(new Error('business rule'))).toBe(false);
    expect(isRetryableError('nope')).toBe(false);
  });
});
