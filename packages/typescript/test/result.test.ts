import { describe, expect, it } from 'vitest';
import { err, ok } from '../src/result.js';
import { DgiiError } from '../src/errors.js';

describe('result helpers', () => {
  it('wraps a success value', () => {
    const result = ok(42);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe(42);
  });

  it('wraps a failure value', () => {
    const result = err(new DgiiError('boom', { code: 'HTTP', status: 500 }));
    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('HTTP');
    expect(result.error.retryable).toBe(true);
  });

  it('maps values and errors', () => {
    expect(
      ok(2)
        .map((n) => n * 2)
        ._unsafeUnwrap(),
    ).toBe(4);
    const failed = err(new DgiiError('x')).mapErr((e) => e.code);
    expect(failed._unsafeUnwrapErr()).toBe('UNKNOWN');
  });
});
