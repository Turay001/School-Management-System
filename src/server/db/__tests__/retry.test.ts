/**
 * Transient-connection retry tests.
 *
 * TWO THINGS ARE BEING PINNED, AND THE SECOND IS THE ONE THAT MATTERS
 * ================================================================
 *
 * 1. Classification. Which failures are worth another attempt. The exclusions
 *    matter as much as the inclusions: a retry that papers over a permission
 *    error or a statement timeout is worse than none, because it turns a bug
 *    into a slow request that still fails.
 *
 * 2. The retry boundary. `withConnectionRetry` retries the ACQUISITION of a
 *    connection and nothing else. A failed connect has a known outcome -
 *    nothing was sent - so replaying it is free. A statement that dies
 *    mid-flight has an unknown one: the server may have applied it before the
 *    socket closed. In a system where payroll is immutable and the audit trail
 *    is append-only, a duplicated fee payment is worse than a failed page.
 *
 *    That is the whole justification for the module's shape, so it is asserted
 *    directly rather than left to a comment to explain.
 */

import { describe, expect, it, vi } from 'vitest';
import { isTransientConnectionError, withConnectionRetry } from '../retry';

/** An error shaped like the ones `pg` and Node actually produce. */
function systemError(code: string, message = code): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

/** An error shaped like a Postgres error, identified by SQLSTATE. */
function sqlStateError(code: string, message = code): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

// ===========================================================================
describe('what counts as transient', () => {
  it.each([
    // The failure this module exists for: one dropped DNS answer.
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'EPIPE',
    'EHOSTUNREACH',
    'ENETUNREACH',
  ])('treats %s as worth retrying', (code) => {
    expect(isTransientConnectionError(systemError(code))).toBe(true);
  });

  it.each([
    '08000', // connection_exception
    '08003', // connection_does_not_exist
    '08006', // connection_failure
    '57P01', // admin_shutdown
    '57P03', // cannot_connect_now
    '53300', // too_many_connections
  ])('treats SQLSTATE %s as worth retrying', (code) => {
    expect(isTransientConnectionError(sqlStateError(code))).toBe(true);
  });

  it('looks through a wrapped cause', () => {
    // pg sometimes reports the socket failure one level down.
    const wrapped = Object.assign(new Error('connection error'), {
      cause: systemError('ENOTFOUND'),
    });
    expect(isTransientConnectionError(wrapped)).toBe(true);
  });

  it('falls back to the message when a DNS failure carries no code', () => {
    // The shape that was actually observed: prose, no usable code.
    const err = new Error('getaddrinfo ENOTFOUND db.qvocnsykkhpvldiebcbe.supabase.co');
    expect(isTransientConnectionError(err)).toBe(true);
  });
});

// ===========================================================================
describe('what must never be retried', () => {
  it.each([
    ['57014', 'query_canceled - our statement_timeout firing is the timeout working'],
    ['40001', 'serialization_failure - retryable only by re-running a whole transaction'],
    ['40P01', 'deadlock_detected - same'],
    ['42501', 'insufficient_privilege - a permission will not change on a retry'],
    ['23505', 'unique_violation - the row is genuinely a duplicate'],
    ['23503', 'foreign_key_violation'],
    ['23514', 'check_violation - one of our own integrity rules'],
    ['23001', 'restrict_violation - the TRUNCATE and DELETE guards in migration 010'],
    ['P0001', 'raise_exception - our triggers refuse deliberately'],
    ['42P01', 'undefined_column - the SQL is wrong'],
    ['42601', 'syntax_error - the SQL is wrong'],
  ])('refuses to retry %s (%s)', (code) => {
    expect(isTransientConnectionError(sqlStateError(code))).toBe(false);
  });

  it.each([null, undefined, 'ENOTFOUND', 42, {}, new Error('plain')])(
    'refuses to retry a non-error value: %s',
    (value) => {
      expect(isTransientConnectionError(value)).toBe(false);
    },
  );

  it('matches the DNS fallback only in getaddrinfo form', async () => {
    // The fallback matches Node's exact wording, which puts the code directly
    // after the syscall name. Widening it to "any message containing ENOTFOUND"
    // would make a data fault that happened to name a code get replayed
    // against the database, so a plausible-looking message must not match.
    expect(
      isTransientConnectionError(new Error('duplicate key value violates unique constraint')),
    ).toBe(false);
    expect(isTransientConnectionError(new Error('permission denied for table fee_payments'))).toBe(
      false,
    );
    // A socket error arriving as prose only, with no code and no getaddrinfo.
    // Deliberately not retried: pg supplies a code for these, and guessing at
    // prose would be a guess.
    expect(isTransientConnectionError(new Error('connect ECONNREFUSED 10.0.0.1:5432'))).toBe(false);
  });

  it('still recognises the real getaddrinfo wording', () => {
    expect(
      isTransientConnectionError(new Error('getaddrinfo ENOTFOUND db.example.supabase.co')),
    ).toBe(true);
    expect(isTransientConnectionError(new Error('getaddrinfo EAI_AGAIN db.example.supabase.co'))).toBe(
      true,
    );
  });
});

// ===========================================================================
describe('retry behaviour', () => {
  /** A never-settling sleep, so tests do not spend real time. */
  const noSleep = vi.fn(async () => undefined);

  it('does not retry when the connection succeeds', async () => {
    const acquire = vi.fn(async () => 'client');

    await expect(withConnectionRetry('t', acquire, { sleep: noSleep })).resolves.toBe('client');
    expect(acquire).toHaveBeenCalledTimes(1);
  });

  it('retries once and succeeds after a dropped lookup', async () => {
    const acquire = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(systemError('ENOTFOUND'))
      .mockResolvedValueOnce('client');

    await expect(withConnectionRetry('t', acquire, { sleep: noSleep })).resolves.toBe('client');
    expect(acquire).toHaveBeenCalledTimes(2);
  });

  it('does not retry a failure that will never succeed', async () => {
    const acquire = vi.fn(async () => {
      throw sqlStateError('42501', 'permission denied for table payroll_runs');
    });

    await expect(withConnectionRetry('t', acquire, { sleep: noSleep })).rejects.toThrow(
      /permission denied/,
    );
    expect(acquire).toHaveBeenCalledTimes(1);
  });

  it('gives up after the attempt limit and rethrows the last error', async () => {
    // The original error must reach the caller. A wrapper saying "retries
    // exhausted" would hide the code the operator needs to see.
    const last = systemError('ECONNRESET', 'final failure');
    const acquire = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(systemError('ENOTFOUND'))
      .mockRejectedValueOnce(systemError('ECONNRESET', 'intermediate'))
      .mockRejectedValueOnce(last);

    await expect(
      withConnectionRetry('t', acquire, { attempts: 3, sleep: noSleep }),
    ).rejects.toBe(last);
    expect(acquire).toHaveBeenCalledTimes(3);
  });

  it('defaults to two attempts, so one dropped lookup is survivable', async () => {
    const acquire = vi.fn(async () => {
      throw systemError('ENOTFOUND');
    });

    await expect(withConnectionRetry('t', acquire, { sleep: noSleep })).rejects.toThrow();
    expect(acquire).toHaveBeenCalledTimes(2);
  });

  it('reports each retry with the code and the delay', async () => {
    const seen: Array<{ attempt: number; code: string; delayMs: number }> = [];
    const acquire = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(systemError('EAI_AGAIN'))
      .mockResolvedValueOnce('client');

    await withConnectionRetry('transaction', acquire, {
      backoffMs: [150],
      sleep: noSleep,
      onRetry: ({ attempt, error, delayMs }) =>
        seen.push({ attempt, code: (error as { code: string }).code, delayMs }),
    });

    expect(seen).toEqual([{ attempt: 1, code: 'EAI_AGAIN', delayMs: 150 }]);
  });

  it('waits before retrying, so a downed resolver is not hammered', async () => {
    const sleep = vi.fn(async () => undefined);
    const acquire = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(systemError('ENOTFOUND'))
      .mockResolvedValueOnce('client');

    await withConnectionRetry('t', acquire, { backoffMs: [250], sleep });

    expect(sleep).toHaveBeenCalledWith(250);
  });
});

// ===========================================================================
describe('the retry boundary', () => {
  // This block is the reason the module exists. If someone widens the retry to
  // cover the statement, the next test passes and these start failing.

  it('retries the acquire only, and returns its result untouched', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const acquire = vi
      .fn<() => Promise<typeof client>>()
      .mockRejectedValueOnce(systemError('ENOTFOUND'))
      .mockResolvedValueOnce(client);

    const got = await withConnectionRetry('query', acquire, { sleep: async () => undefined });

    expect(got).toBe(client);
    // The retry never touched the statement: by the time it ran, acquisition
    // had already succeeded, so there was nothing left to retry.
    expect(client.query).not.toHaveBeenCalled();
  });

  it('never re-runs a statement, even when it fails transiently', async () => {
    // Simulates the dangerous case: the statement fails with a code that
    // WOULD be retryable on its own (ECONNRESET, the server may have applied
    // it). It is outside the retry, so it runs once and the error propagates.
    const client = {
      query: vi.fn().mockRejectedValue(systemError('ECONNRESET')),
    };
    const acquire = vi.fn(async () => client);

    const statement = async () => {
      const c = await withConnectionRetry('query', acquire, { sleep: async () => undefined });
      return c.query();
    };

    await expect(statement()).rejects.toThrow('ECONNRESET');
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(acquire).toHaveBeenCalledTimes(1);
  });
});
