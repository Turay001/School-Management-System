/**
 * Health-probe tests.
 *
 * WHAT IS ACTUALLY BEING PINNED
 * =============================
 * The classifications are the easy half. The assertions that matter are the
 * ones about what this endpoint is allowed to say, because it is the only
 * unauthenticated endpoint in the application and the only one an outside
 * party can read.
 *
 * Three claims are load-bearing, and each has a test below:
 *
 *  1. A connection that works but bypasses RLS is NOT a pass. A deployment
 *     pointed at a superuser serves every request correctly and protects
 *     nothing. Returning "healthy" there would be the most damaging answer this
 *     endpoint could give, so the probe reports failure instead.
 *
 *  2. Nothing secret is reachable through the response. Not the connection
 *     string, not the host, not the role name, not the driver's error message
 *     -- `pg` puts the host, the role and sometimes the password in
 *     `error.message`, so a single interpolated message is enough to publish
 *     the database address to the internet. `leak` asserts on the serialized
 *     response rather than on individual fields, because the leak that matters
 *     is the one nobody thought to check.
 *
 *  3. The BYPASSRLS-capable credential is never used. An unauthenticated
 *     endpoint that opened the service pool would be a remote trigger for the
 *     most powerful database credential in the system.
 *
 * The probe query itself was measured against the live database rather than
 * preferred: `select count(*) from students` as the application role returns
 * zero rows and no error, because RLS is in force and there is no application
 * context. A row-reading health probe therefore cannot tell "RLS is working"
 * from "this connection sees nothing", because both are the same observation.
 * `to_regclass` reads the catalog and is not subject to RLS.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the two collaborators. `runHealthCheck` is a pure function of these two,
// so the probe can be exercised without a database, which is the point: the
// assertions are about the report's shape and contents, not about Postgres.
// ---------------------------------------------------------------------------

const query = vi.fn();
const validateConfig = vi.fn<() => string[]>();

vi.mock('@/server/db/pool', () => ({ query: (...args: unknown[]) => query(...args) }));
vi.mock('@/server/env', () => ({ validateConfig: () => validateConfig() }));

const { classifyFailure, runHealthCheck } = await import('../health');

/** A `pg`-shaped failure. The message deliberately contains sensitive text. */
function driverError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

const SECRET_PASSWORD = 'hunter2-not-a-real-password';
const SECRET_HOST = 'db.abcdefghijklmnop.supabase.co';

/** A probe row for a healthy, correctly-configured deployment. */
function healthyRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    current_role: 'samjona_login',
    schema_present: true,
    privileged_role: false,
    ...overrides,
  };
}

const ENV_KEYS = [
  'DATABASE_URL',
  'SERVICE_DATABASE_URL',
  'AUTH_SECRET',
  'SUPABASE_PROJECT_REF',
  'NEXTAUTH_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];

  // A correctly configured environment, so each test opts out of what it is
  // testing rather than inheriting a broken one from the developer's shell.
  // `validateConfig` is mocked, so NODE_ENV is never consulted here; it is also
  // typed read-only by Next's own declarations.
  process.env.DATABASE_URL =
    `postgresql://samjona_login:${SECRET_PASSWORD}@${SECRET_HOST}:6543/postgres`;
  process.env.SERVICE_DATABASE_URL =
    `postgresql://samjona_service_login:${SECRET_PASSWORD}@${SECRET_HOST}:6543/postgres`;
  process.env.AUTH_SECRET = 'a'.repeat(44);
  process.env.SUPABASE_PROJECT_REF = 'abcdefghijklmnop';

  validateConfig.mockReturnValue([]);
  query.mockResolvedValue([healthyRow()]);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
  query.mockReset();
  validateConfig.mockReset();
  vi.restoreAllMocks();
});

// ===========================================================================
describe('classifying a failure', () => {
  it.each([
    ['28P01', 'authentication_failed'],
    ['28000', 'authentication_failed'],
    ['28003', 'authentication_failed'],
    ['53300', 'connection_exhausted'],
    ['ETIMEDOUT', 'timed_out'],
    ['57014', 'timed_out'],
    ['42P01', 'schema_missing'],
    ['3F000', 'schema_missing'],
    ['ENOTFOUND', 'unreachable'],
    ['EAI_AGAIN', 'unreachable'],
    ['ECONNREFUSED', 'unreachable'],
    ['ECONNRESET', 'unreachable'],
    ['EHOSTUNREACH', 'unreachable'],
    ['57P01', 'unreachable'],
    ['57P03', 'unreachable'],
  ])('maps %s to %s', (code, expected) => {
    expect(classifyFailure(driverError(code, 'x'))).toBe(expected);
  });

  it('reports not_configured when DATABASE_URL is absent, whatever the error was', () => {
    delete process.env.DATABASE_URL;
    // The driver's own code is ignored on purpose: with no connection string
    // configured, "which failure occurred" is not a question worth answering.
    expect(classifyFailure(driverError('ENOTFOUND', 'x'))).toBe('not_configured');
  });

  it('falls back to unexpected for an unrecognised code', () => {
    expect(classifyFailure(driverError('ZZ999', 'x'))).toBe('unexpected');
  });

  it('survives being handed something that is not an error', () => {
    expect(classifyFailure(undefined)).toBe('unexpected');
    expect(classifyFailure(null)).toBe('unexpected');
  });
});

// ===========================================================================
describe('a healthy deployment', () => {
  it('reports ok, with the schema found and the role unprivileged', async () => {
    const report = await runHealthCheck();

    expect(report.status).toBe('ok');
    expect(report.checks.config.problems).toEqual([]);
    expect(report.checks.database.ok).toBe(true);
    expect(report.checks.database.schemaPresent).toBe(true);
    expect(report.checks.database.unprivilegedRole).toBe(true);
    expect(report.checks.database.failure).toBeNull();
  });

  it('reports the payroll credential as present without ever using it', async () => {
    const report = await runHealthCheck();

    expect(report.checks.payrollConfigured).toBe(true);
    // One query, and it is the application pool. The service pool is never
    // reached: opening a BYPASSRLS-capable connection from an endpoint anyone
    // can request would make it remotely triggerable.
    expect(query).toHaveBeenCalledTimes(1);
    const sql = String(query.mock.calls[0]![0]);
    expect(sql).not.toMatch(/service/i);
  });

  it('reads the catalog rather than a table, so RLS cannot mask the answer', async () => {
    await runHealthCheck();
    const sql = String(query.mock.calls[0]![0]);

    // A `select count(*)` from a SAMJONA table returns zero rows under RLS with
    // no application context, which is indistinguishable from having no access.
    expect(sql).not.toMatch(/from\s+students/i);
    expect(sql).toMatch(/to_regclass/);
    expect(sql).toMatch(/rolbypassrls/);
  });
});

// ===========================================================================
describe('a deployment connected as something that bypasses RLS', () => {
  it('is NOT reported as healthy', async () => {
    // Every request succeeds and no policy is enforced. Working perfectly and
    // protecting nothing.
    query.mockResolvedValue([
      healthyRow({ current_role: 'postgres', privileged_role: true }),
    ]);

    const report = await runHealthCheck();

    expect(report.status).toBe('error');
    expect(report.checks.database.ok).toBe(false);
    expect(report.checks.database.unprivilegedRole).toBe(false);
    // Still connected, so this is not a connectivity failure.
    expect(report.checks.database.schemaPresent).toBe(true);
  });

  it('names the role it connected as only in the server log', async () => {
    query.mockResolvedValue([
      healthyRow({ current_role: 'postgres', privileged_role: true }),
    ]);

    const report = await runHealthCheck();

    // The boolean answers the operator's question. The role name is
    // reconnaissance and is not published.
    expect(JSON.stringify(report)).not.toContain('postgres');
  });
});

// ===========================================================================
describe('failure modes', () => {
  it('reports the wrong database as schema_missing', async () => {
    // Reached a real Postgres, just not the school one.
    query.mockResolvedValue([healthyRow({ schema_present: false })]);

    const report = await runHealthCheck();

    expect(report.status).toBe('error');
    expect(report.checks.database.failure).toBe('schema_missing');
    expect(report.checks.database.schemaPresent).toBe(false);
  });

  it('reports not_configured when the deployment has no DATABASE_URL', async () => {
    delete process.env.DATABASE_URL;
    validateConfig.mockReturnValue(['DATABASE_URL is not set.']);
    query.mockRejectedValue(driverError('ENOTFOUND', `getaddrinfo ENOTFOUND ${SECRET_HOST}`));

    const report = await runHealthCheck();

    expect(report.status).toBe('error');
    expect(report.checks.database.failure).toBe('not_configured');
    expect(report.checks.config.ok).toBe(false);
  });

  it('never throws, however the query fails', async () => {
    query.mockRejectedValue(driverError('ECONNREFUSED', 'connection refused'));

    // A health endpoint that throws cannot report ill-health, which defeats its
    // only purpose. The failure is data, not an exception.
    await expect(runHealthCheck()).resolves.toBeDefined();
  });

  it('treats an empty result set as a failure rather than a pass', async () => {
    query.mockResolvedValue([]);

    const report = await runHealthCheck();

    expect(report.status).toBe('error');
    expect(report.checks.database.ok).toBe(false);
    expect(report.checks.database.failure).toBe('unexpected');
  });

  it('surfaces configuration findings, which nothing else calls', async () => {
    validateConfig.mockReturnValue([
      'AUTH_SECRET is shorter than 32 characters.',
      'SERVICE_DATABASE_URL is not set.',
    ]);

    const report = await runHealthCheck();

    // validateConfig documents that nothing invokes it. This is the caller.
    expect(report.checks.config.ok).toBe(false);
    expect(report.checks.config.problems).toHaveLength(2);
    expect(report.status).toBe('error');
  });

  it('carries a correlation id so a log line can be found', async () => {
    query.mockRejectedValue(driverError('ECONNREFUSED', 'connection refused'));

    const report = await runHealthCheck();

    expect(report.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(console.error).toHaveBeenCalledWith(
      '[health] database probe failed',
      expect.objectContaining({ correlationId: report.correlationId }),
    );
  });

  it('gives every report its own correlation id', async () => {
    const a = await runHealthCheck();
    const b = await runHealthCheck();
    expect(a.correlationId).not.toBe(b.correlationId);
  });
});

// ===========================================================================
describe('what the response is allowed to contain', () => {
  /** The serialized response, which is what an attacker actually reads. */
  async function leak(failure: () => Promise<unknown>): Promise<string> {
    const report = await failure();
    return JSON.stringify(report);
  }

  it('publishes neither the password nor the host on a connection failure', async () => {
    // The realistic worst case: `pg` puts all of this in one message.
    query.mockRejectedValue(
      driverError(
        '28P01',
        `password authentication failed for user "samjona_login" ` +
          `host=${SECRET_HOST} dbname=postgres password=${SECRET_PASSWORD}`,
      ),
    );

    const body = await leak(() => runHealthCheck());

    expect(body).not.toContain(SECRET_PASSWORD);
    expect(body).not.toContain(SECRET_HOST);
    expect(body).not.toContain('samjona_login');
    expect(body).not.toContain('6543');
  });

  it('publishes no role name on the success path either', async () => {
    const body = await leak(() => runHealthCheck());

    expect(body).not.toContain('samjona_login');
    expect(body).not.toContain('samjona_service');
  });

  it('publishes nothing from the connection string', async () => {
    const body = await leak(() => runHealthCheck());

    expect(body).not.toContain('postgresql://');
    expect(body).not.toContain('supabase.co');
    expect(body).not.toContain('SUPABASE_PROJECT_REF'.toLowerCase());
  });

  it('logs the sensitive detail instead of returning it', async () => {
    query.mockRejectedValue(
      driverError('28P01', `password authentication failed ... ${SECRET_HOST}`),
    );

    const report = await runHealthCheck();

    // The operator's correlation id leads to a log line that has the host and
    // the driver code. The response has neither.
    expect(JSON.stringify(report)).not.toContain(SECRET_HOST);
    expect(console.error).toHaveBeenCalledWith(
      '[health] database probe failed',
      expect.objectContaining({
        correlationId: report.correlationId,
        message: expect.stringContaining(SECRET_HOST),
      }),
    );
  });
});
