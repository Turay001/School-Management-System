/**
 * Error taxonomy tests.
 *
 * The property that matters here is not the status codes, it is the boundary:
 * `safeMessage` is what a school administrator sees, and `cause` plus the stack
 * are for developer logs. A raw driver or database error must never cross that
 * boundary, because the raw text can contain connection strings, SQL fragments
 * and row data.
 *
 * So the tests below check that separation directly rather than asserting the
 * shape of each subclass.
 */

import { describe, expect, it } from 'vitest';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  PreconditionError,
  RateLimitError,
  UnauthenticatedError,
  ValidationError,
  toAppError,
} from './errors';

describe('what a client is shown', () => {
  it('serialises only the safe fields', () => {
    const err = new ValidationError('That date is outside the current term.', {
      date: 'not a date',
    });

    expect(err.toJSON()).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'That date is outside the current term.',
        details: { date: 'not a date' },
        correlationId: undefined,
      },
    });
  });

  it('never carries a cause or a stack into the response', () => {
    const secret =
      'connect ECONNREFUSED 10.0.0.5:5432 password=hunter2 SELECT * FROM employee_salary_history';
    const err = toAppError(new Error(secret), 'ref-123');

    const serialised = JSON.stringify(err.toJSON());

    expect(serialised).not.toContain('hunter2');
    expect(serialised).not.toContain('employee_salary_history');
    expect(serialised).not.toContain('10.0.0.5');
    expect(serialised).not.toContain('stack');
  });

  it('keeps the cause reachable for the log, not for the response', () => {
    const cause = new Error('connection refused');
    const err = toAppError(cause, 'ref-123');

    // Reachable programmatically, which is the point of retaining it.
    expect((err as { cause?: unknown }).cause).toBe(cause);
    // Absent from anything serialised.
    expect(JSON.stringify(err.toJSON())).not.toContain('connection refused');
  });
});

describe('wrapping an unknown failure', () => {
  it('passes an existing AppError through unchanged', () => {
    const original = new NotFoundError('Payroll run', 'PR-2026-01');
    const wrapped = toAppError(original, 'ref-999');

    // Identity, not just equality: re-wrapping would discard the specific code
    // and replace a precise 404 with a vague 500.
    expect(wrapped).toBe(original);
    expect(wrapped.code).toBe('NOT_FOUND');
    expect(wrapped.status).toBe(404);
  });

  it.each([
    ['a string', 'boom'],
    ['a number', 500],
    ['null', null],
    ['undefined', undefined],
    ['a bare object', { code: '23505' }],
  ])('wraps %s rather than rethrowing it', (_label, thrown) => {
    const err = toAppError(thrown, 'ref-456');

    expect(err).toBeInstanceOf(InternalError);
    expect(err.code).toBe('INTERNAL');
    expect(err.status).toBe(500);
  });

  it('carries the correlation id alongside the message, not inside it', () => {
    // The message is a fixed string, so it can never accidentally interpolate
    // something sensitive. The reference travels as a separate field, which the
    // administrator can quote and a developer can search the logs for.
    const err = toAppError(new Error('x'), 'ref-abc-123');

    expect(err.correlationId).toBe('ref-abc-123');
    expect(err.safeMessage).not.toContain('ref-abc-123');
    expect(err.safeMessage).toContain('quote the reference below');
    expect(err.toJSON().error.correlationId).toBe('ref-abc-123');
  });

  it('does not echo the thrown value in the message shown to a user', () => {
    const err = toAppError(new Error('password=hunter2'), 'ref-1');
    expect(err.safeMessage).not.toContain('hunter2');
  });
});

describe('status codes', () => {
  it.each([
    ['not signed in', () => new UnauthenticatedError(), 401, 'AUTH_REQUIRED'],
    ['no permission', () => new ForbiddenError(), 403, 'AUTH_FORBIDDEN'],
    ['missing row', () => new NotFoundError('Student'), 404, 'NOT_FOUND'],
    ['duplicate or illegal transition', () => new ConflictError('taken'), 409, 'CONFLICT'],
    ['business rule violated', () => new PreconditionError('not calculated'), 422, 'PRECONDITION_FAILED'],
    ['bad input', () => new ValidationError('bad'), 400, 'VALIDATION_FAILED'],
    ['too many requests', () => new RateLimitError(30), 429, 'RATE_LIMITED'],
    ['unexpected', () => new InternalError('ref-9'), 500, 'INTERNAL'],
  ])('%s maps to the right status', (_label, build, status, code) => {
    const err = build() as AppError;
    expect(err.status).toBe(status);
    expect(err.code).toBe(code);
  });

  it('names the specific subclass, so a log can be grouped by it', () => {
    expect(new ForbiddenError().name).toBe('ForbiddenError');
    expect(new ConflictError('x').name).toBe('ConflictError');
    expect(toAppError(new Error('x'), 'r').name).toBe('InternalError');
  });
});

describe('messages that quote a row identifier', () => {
  it('includes the id when one is given', () => {
    expect(new NotFoundError('Payroll run', 'PR-2026-01').safeMessage).toContain('PR-2026-01');
  });

  it('stays readable without one', () => {
    expect(new NotFoundError('Payroll run').safeMessage).toBe('Payroll run could not be found.');
  });
});

describe('rate limiting', () => {
  it('tells the client how long to wait', () => {
    // Without this the UI has to guess, and a guessed retry turns a 429 into a
    // heavier load on a system that is already struggling.
    const err = new RateLimitError(45);
    expect(err.details).toEqual({ retryAfterSeconds: 45 });
  });
});
