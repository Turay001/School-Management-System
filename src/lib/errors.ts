/**
 * Application error taxonomy.
 *
 * Two audiences, two shapes:
 *  - `AppError.safeMessage`  -> shown to the administrator
 *  - `cause` / stack        -> developer logs only
 *
 * Raw errors from the database or any driver are NEVER returned to a client.
 * They are wrapped here and the technical detail is logged with a correlation
 * id that the administrator can quote.
 *
 * Note: an earlier version of this file carried a parallel Google Sheets
 * taxonomy (SheetsError, SheetsErrorKind, SHEETS_MESSAGES, six SHEETS_* codes).
 * Sheets was removed from the data path in Phase 1 and nothing referenced any of
 * it, so it was dead code describing a subsystem that no longer exists. Deleted
 * rather than left to rot: an error taxonomy is exactly the kind of file that
 * gets trusted as current without being read.
 */

export type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_FORBIDDEN'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PRECONDITION_FAILED'
  | 'RATE_LIMITED'
  | 'CONFIG_ERROR'
  | 'INTERNAL';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly safeMessage: string;
  readonly details?: unknown;
  readonly correlationId?: string;

  constructor(params: {
    code: ErrorCode;
    status: number;
    safeMessage: string;
    details?: unknown;
    correlationId?: string;
    cause?: unknown;
  }) {
    super(params.safeMessage, { cause: params.cause });
    this.name = 'AppError';
    this.code = params.code;
    this.status = params.status;
    this.safeMessage = params.safeMessage;
    this.details = params.details;
    this.correlationId = params.correlationId;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.safeMessage,
        details: this.details,
        correlationId: this.correlationId,
      },
    };
  }
}

/** 401 - not signed in, or session expired. */
export class UnauthenticatedError extends AppError {
  constructor(message = 'Please sign in to continue.') {
    super({ code: 'AUTH_REQUIRED', status: 401, safeMessage: message });
    this.name = 'UnauthenticatedError';
  }
}

/** 403 - signed in but lacking the required permission. */
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super({ code: 'AUTH_FORBIDDEN', status: 403, safeMessage: message });
    this.name = 'ForbiddenError';
  }
}

/** 404 */
export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    super({
      code: 'NOT_FOUND',
      status: 404,
      safeMessage: id
        ? `${entity} ${id} could not be found. It may have been removed.`
        : `${entity} could not be found.`,
    });
    this.name = 'NotFoundError';
  }
}

/** 409 - uniqueness, duplicate period, illegal state transition. */
export class ConflictError extends AppError {
  constructor(safeMessage: string, details?: unknown) {
    super({ code: 'CONFLICT', status: 409, safeMessage, details });
    this.name = 'ConflictError';
  }
}

/** 422 - business rule violated, e.g. approving an uncalculated payroll. */
export class PreconditionError extends AppError {
  constructor(safeMessage: string, details?: unknown) {
    super({ code: 'PRECONDITION_FAILED', status: 422, safeMessage, details });
    this.name = 'PreconditionError';
  }
}

/** 400 - input validation failed. `details` is a field-keyed map for forms. */
export class ValidationError extends AppError {
  constructor(safeMessage: string, details?: unknown) {
    super({ code: 'VALIDATION_FAILED', status: 400, safeMessage, details });
    this.name = 'ValidationError';
  }
}

/** 429 */
export class RateLimitError extends AppError {
  constructor(retryAfterSeconds: number) {
    super({
      code: 'RATE_LIMITED',
      status: 429,
      safeMessage: 'Too many requests. Please wait a moment and try again.',
      details: { retryAfterSeconds },
    });
    this.name = 'RateLimitError';
  }
}

/** 500 - unexpected. Safe message is deliberately vague. */
export class InternalError extends AppError {
  constructor(correlationId: string, cause?: unknown) {
    super({
      code: 'INTERNAL',
      status: 500,
      safeMessage:
        'Something went wrong while processing your request. The problem has been recorded. Please try again, and quote the reference below if it keeps happening.',
      correlationId,
      cause,
    });
    this.name = 'InternalError';
  }
}

/** Narrow an unknown thrown value to AppError, or wrap it as internal. */
export function toAppError(err: unknown, correlationId: string): AppError {
  if (err instanceof AppError) return err;
  return new InternalError(correlationId, err);
}
