import type { Result } from 'neverthrow';
import type { DgiiError } from './errors.js';

export type { Result } from 'neverthrow';

export {
  Ok,
  Err,
  ok,
  err,
  okAsync,
  errAsync,
  fromThrowable,
  fromPromise,
  fromSafePromise,
  ResultAsync,
} from 'neverthrow';

/** A {@link Result} whose failure channel is always {@link DgiiError}. */
export type DgiiResult<T> = Result<T, DgiiError>;
