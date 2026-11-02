import {
  ConsecutiveBreaker,
  ExponentialBackoff,
  TimeoutStrategy,
  bulkhead,
  circuitBreaker,
  handleAll,
  handleWhen,
  retry,
  timeout,
  wrap,
  type IPolicy,
} from 'cockatiel';
import { DgiiError } from './errors.js';

export interface ResilienceOptions {
  /** Maximum number of attempts (including the first). Default 3. */
  maxRetries?: number;
  /** Consecutive failures before the circuit opens. Default 5. */
  breakerThreshold?: number;
  /** Milliseconds the circuit stays open before half-opening. Default 30s. */
  halfOpenAfterMs?: number;
  /** Per-attempt timeout in milliseconds. Default 15s. */
  timeoutMs?: number;
  /** Initial retry backoff delay in milliseconds. Default 100. */
  retryInitialDelayMs?: number;
  /** Maximum concurrent in-flight requests. Default 20. */
  bulkheadLimit?: number;
  /** Maximum queued requests while the bulkhead is saturated. Default 40. */
  bulkheadQueue?: number;
}

export const defaultResilienceOptions: Required<ResilienceOptions> = {
  maxRetries: 3,
  breakerThreshold: 5,
  halfOpenAfterMs: 30_000,
  timeoutMs: 15_000,
  retryInitialDelayMs: 100,
  bulkheadLimit: 20,
  bulkheadQueue: 40,
};

/**
 * Only transient failures are retried: network errors, timeouts, 408, 429 and
 * 5xx. A rejected e-CF (4xx) must never be blindly re-sent.
 */
export const isRetryableError = (error: unknown): boolean => {
  if (error instanceof DgiiError) {
    return error.retryable;
  }
  if (error instanceof Error) {
    const name = error.name.toLowerCase();
    const message = error.message.toLowerCase();
    return (
      name === 'typeerror' ||
      name === 'aborterror' ||
      name === 'fetcherror' ||
      name === 'timeouterror' ||
      name.includes('cancel') ||
      message.includes('timeout') ||
      message.includes('aborted') ||
      message.includes('network')
    );
  }
  return false;
};

export interface ResiliencePolicies {
  readonly retry: IPolicy;
  readonly circuitBreaker: IPolicy;
  readonly timeout: IPolicy;
  readonly bulkhead: IPolicy;
  /** Composed policy: `retry → circuitBreaker → timeout → bulkhead`. */
  readonly policy: IPolicy;
}

/** Build the composed resilience policy used by the HTTP client. */
export const createResiliencePolicies = (
  options: ResilienceOptions = {},
): ResiliencePolicies => {
  const opts = { ...defaultResilienceOptions, ...options };

  const retryPolicy = retry(handleWhen(isRetryableError), {
    maxAttempts: opts.maxRetries,
    backoff: new ExponentialBackoff({ initialDelay: opts.retryInitialDelayMs }),
  });

  const breakerPolicy = circuitBreaker(handleAll, {
    halfOpenAfter: opts.halfOpenAfterMs,
    breaker: new ConsecutiveBreaker(opts.breakerThreshold),
  });

  const timeoutPolicy = timeout(opts.timeoutMs, TimeoutStrategy.Aggressive);
  const bulkheadPolicy = bulkhead(opts.bulkheadLimit, opts.bulkheadQueue);

  const policy = wrap(
    retryPolicy,
    breakerPolicy,
    timeoutPolicy,
    bulkheadPolicy,
  );

  return {
    retry: retryPolicy,
    circuitBreaker: breakerPolicy,
    timeout: timeoutPolicy,
    bulkhead: bulkheadPolicy,
    policy,
  };
};
