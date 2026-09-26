import 'server-only';

import type { PoolClient } from 'pg';
import { correlationId as newCorrelationId } from '../db/ids';
import type { SessionUser } from '../auth/permissions';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  InternalError,
  PreconditionError,
  ValidationError,
} from '../../lib/errors';
import { getPool, type Queryable } from './pool';

/**
 * Transaction wrapper and RLS context.
 *
 * EVERY unit of work goes through one of these three functions. There is no
 * "just run a query" path for writes, because a query outside a transaction
 * cannot carry `SET LOCAL` context, and without context the RLS policies
 * evaluate to NULL and every row is invisible. That fails closed, which is
 * safe, but it makes the bug hard to diagnose - so the API makes the safe
 * path the only path.
 *
 * The three contexts:
 *
 *   withUserContext   - an authenticated person. RLS applies normally. This
 *                       is what ~99% of requests use.
 *   withServiceContext- the BYPASSRLS service role, for payroll generation
 *                       only. Cannot alter approved payroll: the immutability
 *                       triggers apply to every role including this one.
 *   withSystemContext - no role set. Used for health checks and startup
 *                       configuration reads.
 */

export interface TransactionOptions {
  /** Abort after this many milliseconds. Guards against a stuck lock. */
  timeoutMs?: number;
  /** Correlation id, attached to the audit trail and server logs. */
  correlationId?: string;
  /** Reuse an existing client, e.g. to nest inside another transaction. */
  existingClient?: PoolClient;
}

const DEFAULT_TX_TIMEOUT_MS = 20_000;

export async function withTransaction<T>(
  options: TransactionOptions,
  fn: (tx: Queryable, ctx: { correlationId: string }) => Promise<T>,
): Promise<T> {
  const correlationId = options.correlationId ?? newCorrelationId();

  // Nested call: reuse the outer transaction so the whole thing commits or
  // rolls back together. PostgreSQL has no real nested transactions.
  if (options.existingClient) {
    return fn(options.existingClient, { correlationId });
  }

  const client = await getPool().connect();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TX_TIMEOUT_MS;
  let released = false;

  try {
    await client.query('begin');
    // Bound the whole transaction, including lock waits.
    await client.query(`set local statement_timeout = ${intLiteral(timeoutMs)}`);
    // Make the correlation id visible to triggers and log_message calls.
    await client.query('select set_config($1, $2, true)', ['app.correlation_id', correlationId]);

    const result = await fn(client, { correlationId });
    await client.query('commit');
    return result;
  } catch (err) {
    try {
      await client.query('rollback');
    } catch (rollbackErr) {
      // A failed rollback means the connection is unusable. Destroy it rather
      // than returning a poisoned client to the pool, and do not fall through
      // to the normal release.
      console.error('[db] rollback failed; destroying connection', {
        correlationId,
        message: (rollbackErr as Error).message,
      });
      client.release(rollbackErr as Error);
      released = true;
    }
    throw mapDbError(err, correlationId);
  } finally {
    if (!released) {
      client.release();
    }
  }
}

/**
 * Run as an authenticated user. RLS policies read `app.user_id` and
 * `app.user_role` from here.
 */
export async function withUserContext<T>(
  user: SessionUser,
  fn: (tx: Queryable, ctx: { correlationId: string }) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  return withTransaction(options, async (tx, ctx) => {
    // SET LOCAL, not SET: the context must vanish when the transaction ends,
    // so a pooled connection can never leak one user's identity to the next.
    await tx.query('select set_config($1, $2, true)', ['app.user_id', user.id]);
    await tx.query('select set_config($1, $2, true)', ['app.user_role', user.role]);
    return fn(tx, ctx);
  });
}

/**
 * Run with the BYPASSRLS service role. RESERVED FOR PAYROLL GENERATION.
 *
 * Before using this, confirm the operation genuinely cannot be expressed as
 * a user-context operation. It exists because payroll_runs and payroll_items
 * intentionally have no INSERT/UPDATE policy, so a request handler can never
 * write them no matter what it passes to a permission check.
 */
export async function withServiceContext<T>(
  fn: (tx: Queryable, ctx: { correlationId: string }) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  return withTransaction(options, async (tx, ctx) => {
    await tx.query('select set_config($1, $2, true)', ['app.service_context', 'payroll']);
    return fn(tx, ctx);
  });
}

/** No role set. Use only for connectivity checks and startup reads. */
export async function withSystemContext<T>(
  fn: (tx: Queryable, ctx: { correlationId: string }) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  return withTransaction(options, fn);
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------
//
// PostgreSQL error codes are mapped to the application's error taxonomy so an
// administrator sees an actionable message instead of "23505".

interface PgError {
  code?: string;
  message?: string;
  detail?: string;
  constraint?: string;
  severity?: string;
}

/**
 * Map a PostgreSQL error to the application's error taxonomy.
 *
 * RETURNS the error rather than throwing it, so callers write
 * `throw mapDbError(...)`. That keeps control flow obvious and avoids relying
 * on TypeScript's never-returning-call analysis.
 *
 * PostgreSQL codes are translated so an administrator sees an actionable
 * message instead of "23505".
 */
export function mapDbError(err: unknown, correlationId: string): AppError {
  if (err instanceof AppError) return err;

  const pg = err as PgError;
  const code = pg.code ?? '';
  const constraint = pg.constraint ?? '';
  const message = pg.message ?? '';

  switch (code) {
    case '23505': {
      // unique_violation
      return new ConflictError(describeUniqueViolation(constraint), {
        constraint,
        correlationId,
      });
    }
    case '23503': {
      // foreign_key_violation
      return new ValidationError(
        'This record refers to something that does not exist, or is still in use. ' +
          'Check the related record and try again.',
        { constraint, correlationId },
      );
    }
    case '23514': {
      // check_violation - our financial arithmetic and lifecycle rules
      return new PreconditionError(describeCheckViolation(constraint), {
        constraint,
        correlationId,
      });
    }
    case '42501': {
      // insufficient_privilege
      return new ForbiddenError(
        'Your role does not allow this action. Ask the Proprietor if you need access.',
      );
    }
    case 'P0001': {
      // raise_exception - our own trigger guards. These messages were written
      // deliberately to be read by an administrator, so they pass through.
      return new PreconditionError(message, { correlationId });
    }
    case '57014': {
      // query_canceled - statement timeout
      return new PreconditionError(
        'This operation took too long and was stopped to keep the system responsive. ' +
          'Try again, or narrow the date range if you are running a report.',
        { correlationId },
      );
    }
    case '53300':
    case '08006':
    case '08003': {
      // too_many_connections / connection failure
      return new AppError({
        code: 'INTERNAL',
        status: 503,
        safeMessage:
          'The system cannot reach the school database right now. Please try again in a moment.',
        correlationId,
        cause: err,
      });
    }
    default:
      break;
  }

  // Anything unmapped: log the technical detail, return a safe message.
  console.error('[db] unmapped error', {
    correlationId,
    code,
    constraint,
    message,
    detail: pg.detail,
  });
  return new InternalError(correlationId, err);
}

function describeUniqueViolation(constraint: string): string {
  if (constraint.includes('employee_code')) return 'That employee code is already in use.';
  if (constraint.includes('student_code')) return 'That student code is already in use.';
  if (constraint.includes('username')) return 'That username is already taken. Choose another.';
  if (constraint.includes('receipt_no')) return 'That receipt number already exists.';
  if (constraint.includes('number_unique'))
    return 'This bank account number is already assigned to another employee. Two people cannot be paid into the same account.';
  if (constraint.includes('one_open'))
    return 'This employee already has a current salary record. Close the existing one before adding another.';
  if (constraint.includes('one_primary'))
    return 'This employee already has an active primary bank account. Deactivate it first.';
  if (constraint.includes('one_current')) return 'Another academic year is already marked as current.';
  if (constraint.includes('period_revision'))
    return 'A payroll run already exists for this month at this revision. Reopen the existing run instead of creating another.';
  if (constraint.includes('unique_employee_per_run'))
    return 'This employee already has a line in this payroll run.';
  if (constraint.includes('payroll_periods_unique'))
    return 'A payroll period already exists for that month.';
  if (constraint.includes('duplicate key')) return 'That record already exists.';
  return 'That value must be unique, and it is already in use.';
}

function describeCheckViolation(constraint: string): string {
  if (constraint.includes('gross_is_sum_of_earnings'))
    return 'The payroll figures do not add up: gross must equal basic salary plus allowances, overtime and other earnings.';
  if (constraint.includes('net_is_gross_less_deductions'))
    return 'The payroll figures do not add up: net pay must equal gross pay minus deductions.';
  if (constraint.includes('deductions_within_earnings'))
    return 'Deductions are greater than the earnings for this employee, which is not possible.';
  if (constraint.includes('segregation_of_duties'))
    return 'You generated this payroll, so someone else must approve it.';
  if (constraint.includes('approval_recorded'))
    return 'The approval must record who approved it and when.';
  if (constraint.includes('reopen_reason_required'))
    return 'Reopening a payroll requires a reason.';
  if (constraint.includes('rejection_reason_required'))
    return 'Rejecting this record requires a reason.';
  if (constraint.includes('one class per year'))
    return 'This student is already assigned to a class in that academic year.';
  if (constraint.includes('waiver_reason'))
    return 'A waived fee must state the reason.';
  if (constraint.includes('dates_valid') || constraint.includes('after_hiring') || constraint.includes('admission_after_birth'))
    return 'One of the dates is not valid. Check that the end date is not before the start date.';
  return 'The record failed a validation rule. Please review the values and try again.';
}

function intLiteral(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid statement timeout: ${value}`);
  }
  return String(Math.trunc(value));
}
