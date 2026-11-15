import { describe, expect, it } from 'vitest';
import {
  createResiliencePolicies,
  isRetryableError,
} from '../src/resilience.js';
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

describe('retry budget', () => {
  it('counts maxRetries as attempts including the first, like Python', async () => {
    // `maxRetries: 3` sent 4 times because cockatiel counts retries while the
    // public option (and Python's `stop_after_attempt`) counts attempts.
    const policies = createResiliencePolicies({
      maxRetries: 3,
      retryInitialDelayMs: 1,
    });
    let attempts = 0;
    await policies.policy
      .execute(async () => {
        attempts += 1;
        throw new DgiiError('upstream unavailable', { status: 503 });
      })
      .catch(() => undefined);

    expect(attempts).toBe(3);
  });

  it('sends exactly once when maxRetries is 1', async () => {
    const policies = createResiliencePolicies({
      maxRetries: 1,
      retryInitialDelayMs: 1,
    });
    let attempts = 0;
    await policies.policy
      .execute(async () => {
        attempts += 1;
        throw new DgiiError('upstream unavailable', { status: 503 });
      })
      .catch(() => undefined);

    expect(attempts).toBe(1);
  });
});
