import './src/env';
import { vi } from 'vitest';

/**
 * Default fetch stub. Effect's `FetchHttpClient` calls `globalThis.fetch`,
 * so tests must control it: without this stub a missed mock reaches the
 * real network (see the DGII-body leak in the propagation suite). Each test
 * overrides via `mockResolvedValueOnce`; `restoreAllMocks` in `afterEach`
 * reinstates this throwing default.
 *
 * Env loading goes through the validated `src/env` module (env-core)
 * instead of calling dotenv directly: the schema fails closed on malformed
 * values before any test runs.
 */
vi.stubGlobal(
  'fetch',
  vi.fn(() => Promise.reject(new Error('fetch is not mocked in this test')))
);
