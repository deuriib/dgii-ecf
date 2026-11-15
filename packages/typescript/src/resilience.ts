import {
  ConsecutiveBreaker,
  ExponentialBackoff,
  TimeoutStrategy,
  bulkhead,
  circuitBreaker,
  handleWhen,
  isBulkheadRejectedError,
  isTaskCancelledError,
  retry,
  timeout,
  wrap,
  type IPolicy,
} from 'cockatiel';
import { DgiiError } from './errors.js';

export interface ResilienceOptions {
  /**
   * Maximum number of attempts **including the first**. Default 3 (i.e. up to
   * 2 retries). Same meaning as `max_retries` in the Python package: the value
   * is a send budget, not a retry budget.
   */
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
  if (isTaskCancelledError(error)) {
    return true;
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
      message.includes('timed out') ||
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
  /**
   * Composed policy without retry: `circuitBreaker → timeout → bulkhead`.
   *
   * Used for the non-idempotent submissions. Retrying a POST whose outcome is
   * unknown is how a single call put three copies of one e-NCF into DGII's
   * hands: the retry cannot tell "rejected" from "accepted, answer lost", and
   * DGII does not de-duplicate by e-NCF.
   */
  readonly policyWithoutRetry: IPolicy;
}

/** Build the composed resilience policy used by the HTTP client. */
export const createResiliencePolicies = (
  options: ResilienceOptions = {},
): ResiliencePolicies => {
  const opts = { ...defaultResilienceOptions, ...options };

  const retryPolicy = retry(handleWhen(isRetryableError), {
    // cockatiel counts *retries*, the public option counts *attempts*, so the
    // budget is converted here instead of leaking the off-by-one to callers
    // (`maxAttempts: 3` sent 4 times, while Python's `stop_after_attempt(3)`
    // sent 3).
    maxAttempts: Math.max(0, opts.maxRetries - 1),
    backoff: new ExponentialBackoff({ initialDelay: opts.retryInitialDelayMs }),
  });

  // Local capacity rejections must not open the circuit breaker, and placing
  // the breaker outside retry counts logical operations rather than individual
  // retry attempts.
  const breakerPolicy = circuitBreaker(
    handleWhen((err) => !isBulkheadRejectedError(err)),
    {
      halfOpenAfter: opts.halfOpenAfterMs,
      breaker: new ConsecutiveBreaker(opts.breakerThreshold),
    },
  );

  const timeoutPolicy = timeout(opts.timeoutMs, TimeoutStrategy.Aggressive);
  const bulkheadPolicy = bulkhead(opts.bulkheadLimit, opts.bulkheadQueue);

  // Bulkhead sits outside timeout so queue wait is never charged to the
  // per-attempt network timeout.
  const policy = wrap(
    breakerPolicy,
    retryPolicy,
    bulkheadPolicy,
    timeoutPolicy,
  );

  const policyWithoutRetry = wrap(breakerPolicy, bulkheadPolicy, timeoutPolicy);

  return {
    policyWithoutRetry,
    retry: retryPolicy,
    circuitBreaker: breakerPolicy,
    timeout: timeoutPolicy,
    bulkhead: bulkheadPolicy,
    policy,
  };
};
