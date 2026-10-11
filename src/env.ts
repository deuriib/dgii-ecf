import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

/**
 * Validated runtime environment for the SDK.
 *
 * Replaces bare `dotenv.config()` + `process.env` reads with a schema that
 * fails closed at import time: a missing or malformed value throws before
 * any request runs, instead of surfacing as an obscure runtime failure.
 *
 * Server-only values (certificates, secrets) live under `server`;
 * client-safe publishable values live under `clientPrefix` + `client`.
 * `runtimeEnv` is wired explicitly so bundlers cannot accidentally inline
 * secrets through `process.env` shape inference.
 */
export const env = createEnv({
  server: {
    /** DGII request timeout in milliseconds (CRITICAL-2 fix: was unbounded). */
    DGII_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    /** RNC used by the cert-gated integration suites (fiscal identifier). */
    RNC_EMISOR: z.string().optional(),
    /** P12 test certificate name for the cert-gated suites. */
    CERTIFICATE_NAME: z.string().optional(),
    /** Password for the P12 test certificate. */
    CERTIFICATE_TEST_PASSWORD: z.string().optional(),
  },
  clientPrefix: 'DGII_PUBLIC_',
  client: {},
  runtimeEnv: {
    DGII_REQUEST_TIMEOUT_MS: process.env.DGII_REQUEST_TIMEOUT_MS,
    RNC_EMISOR: process.env.RNC_EMISOR,
    CERTIFICATE_NAME: process.env.CERTIFICATE_NAME,
    CERTIFICATE_TEST_PASSWORD: process.env.CERTIFICATE_TEST_PASSWORD,
  },
  emptyStringAsUndefined: true,
});
