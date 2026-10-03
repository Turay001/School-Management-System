/**
 * `validateConfig` tests.
 *
 * This function had no test file at all until the direct-host check was added,
 * and that is not an accident worth repeating: it is the function whose entire
 * job is to catch a deployment that is misconfigured, and it had been shipping
 * untested while the one deployment it exists to protect went live with a
 * connection string that every one of its other checks accepted.
 *
 * WHAT THE MISSING CHECK COST
 * ---------------------------
 * `DATABASE_URL` was pointed at `db.<ref>.supabase.co` on port 6543 with the
 * correct role and the correct password. Every pre-existing check passed it:
 *
 *   - present?                    yes
 *   - port 6543?                  yes
 *   - not a `postgres.` service?  yes
 *   - authenticates as samjona_login? yes
 *
 * It was still unusable from the deployment, because that host publishes no A
 * record. Vercel's runtime log read `getaddrinfo ENOTFOUND`, and it worked on
 * the developer machine purely because Cloudflare WARP supplies an IPv6 address
 * locally. So the function reported a healthy configuration for a deployment
 * that could not reach its database, and reported it with `ok: true`.
 *
 * These tests exist so that a check cannot be added here without also pinning
 * the case that motivated it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { validateConfig } from '../env';

/**
 * The database pool is mocked because one test below calls the health endpoint,
 * and `runHealthCheck` opens a real connection. Without this the suite dialled
 * Supabase: it took over three seconds, reported `SASL authentication failed`
 * from a live server, and would have started failing on any machine with a
 * different network. A unit test that reaches the internet is not a unit test.
 */
const query = vi.fn().mockRejectedValue(Object.assign(new Error('offline'), { code: 'ENOTFOUND' }));

vi.mock('@/server/db/pool', () => ({ query: (...args: unknown[]) => query(...args) }));

const REF = 'qvocnsykkhpvldiebcbe';

/** A connection string with every part specified, so each test varies one. */
function conn(options: {
  user?: string;
  password?: string;
  host?: string;
  port?: number;
}): string {
  const {
    user = 'samjona_login',
    password = 'a'.repeat(32),
    host = `aws-0-eu-west-1.pooler.supabase.com`,
    port = 6543,
  } = options;
  return `postgresql://${user}:${password}@${host}:${port}/postgres`;
}

/** A fully correct environment: no findings expected. */
function configureCleanEnv(overrides: Record<string, string | undefined> = {}) {
  vi.stubEnv('DATABASE_URL', conn({}));
  vi.stubEnv('SERVICE_DATABASE_URL', conn({ user: 'samjona_service_login' }));
  vi.stubEnv('AUTH_SECRET', 'a'.repeat(44));
  vi.stubEnv('SUPABASE_PROJECT_REF', REF);
  vi.stubEnv('NEXTAUTH_URL', 'https://school.example.org');
  for (const [k, v] of Object.entries(overrides)) vi.stubEnv(k, v);
}

/** Does any finding mention this fragment? */
function mentions(problems: string[], fragment: string): boolean {
  return problems.some((p) => p.includes(fragment));
}

beforeEach(() => {
  configureCleanEnv();
  // NODE_ENV gates the NEXTAUTH_URL finding, and is typed read-only by Next's
  // own declarations, so it goes through stubEnv rather than assignment.
  vi.stubEnv('NODE_ENV', 'test');
  query.mockRejectedValue(Object.assign(new Error('offline'), { code: 'ENOTFOUND' }));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ===========================================================================
describe('a correct configuration', () => {
  it('produces no findings at all', () => {
    // The baseline every other test in this file departs from. If this fails,
    // every finding assertion below is suspect.
    expect(validateConfig()).toEqual([]);
  });

  it('is the baseline for the direct-host case too, once the host is a pooler', () => {
    expect(mentions(validateConfig(), 'direct host')).toBe(false);
  });
});

// ===========================================================================
describe('DATABASE_URL presence and shape', () => {
  it('reports it missing', () => {
    vi.stubEnv('DATABASE_URL', undefined);
    const problems = validateConfig();

    expect(mentions(problems, 'DATABASE_URL is not set')).toBe(true);
  });

  it('reports it unparseable', () => {
    vi.stubEnv('DATABASE_URL', 'not-a-connection-string');

    expect(mentions(validateConfig(), 'not a parseable PostgreSQL connection string')).toBe(true);
  });

  it('reports port 5432 as not the transaction pooler', () => {
    vi.stubEnv('DATABASE_URL', conn({ port: 5432 }));

    expect(mentions(validateConfig(), 'transaction pooler (port 6543)')).toBe(true);
  });

  it('accepts port 6543', () => {
    expect(mentions(validateConfig(), 'transaction pooler (port 6543)')).toBe(false);
  });

  it('reports a service-role connection', () => {
    vi.stubEnv('DATABASE_URL', conn({ user: `postgres.${REF}` }));

    expect(mentions(validateConfig(), 'service-role connection')).toBe(true);
  });

  it('reports the wrong role', () => {
    vi.stubEnv('DATABASE_URL', conn({ user: 'somebody_else' }));

    expect(mentions(validateConfig(), 'not samjona_login')).toBe(true);
  });

  it('accepts samjona_login, including a percent-encoded password', () => {
    // A password with reserved characters arrives percent-encoded, and
    // readRole decodes it. A password like this must not be mistaken for a
    // different role.
    vi.stubEnv(
      'DATABASE_URL',
      `postgresql://samjona_login:p%40ss%3Aword@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`,
    );

    expect(mentions(validateConfig(), 'not samjona_login')).toBe(false);
  });
});

// ===========================================================================
describe('the direct-host finding', () => {
  it('fires on the exact string that shipped and broke the deployment', () => {
    // Verbatim shape of the real DATABASE_URL: right role, right password,
    // port 6543, and unreachable from Vercel. Every other check passes it.
    vi.stubEnv('DATABASE_URL', conn({ host: `db.${REF}.supabase.co`, port: 6543 }));

    const problems = validateConfig();

    expect(mentions(problems, 'direct host')).toBe(true);
    // And nothing else objects to it, which is the whole point.
    expect(mentions(problems, 'not samjona_login')).toBe(false);
    expect(mentions(problems, 'transaction pooler (port 6543)')).toBe(false);
  });

  it('fires on port 5432 as well, since the host is the problem either way', () => {
    vi.stubEnv('DATABASE_URL', conn({ host: `db.${REF}.supabase.co`, port: 5432 }));

    expect(mentions(validateConfig(), 'direct host')).toBe(true);
  });

  it('names the actual cause, because "use the pooler" is not obvious', () => {
    vi.stubEnv('DATABASE_URL', conn({ host: `db.${REF}.supabase.co` }));
    const [finding] = validateConfig().filter((p) => p.includes('direct host'));

    // Someone reading this at 2am needs to know it is DNS, not credentials.
    expect(finding).toContain('ENOTFOUND');
    expect(finding).toContain('IPv6');
    expect(finding).toContain('pooler.supabase.com');
    // And needs to know why their own machine disagrees with production.
    expect(finding).toContain('WARP');
  });

  it('does not fire for a pooler host', () => {
    vi.stubEnv('DATABASE_URL', conn({ host: 'aws-0-eu-central-1.pooler.supabase.com' }));

    expect(mentions(validateConfig(), 'direct host')).toBe(false);
  });

  it('does not fire for a non-Supabase host', () => {
    vi.stubEnv('DATABASE_URL', conn({ host: 'localhost' }));

    expect(validateConfig()).toEqual([]);
  });

  it('does not fire for a host that merely contains "supabase"', () => {
    // The check matches a shape, not a substring. A self-hosted instance on a
    // domain that happens to mention Supabase is somebody else's problem.
    vi.stubEnv('DATABASE_URL', conn({ host: 'db.internal.supabase-mirror.example.org' }));

    expect(mentions(validateConfig(), 'direct host')).toBe(false);
  });

  it('does not fire for a two-label ref, which is not the direct-host shape', () => {
    vi.stubEnv('DATABASE_URL', conn({ host: 'db.ref.with.dots.supabase.co' }));

    expect(mentions(validateConfig(), 'direct host')).toBe(false);
  });

  it('is case-insensitive, because a hostname is', () => {
    vi.stubEnv('DATABASE_URL', conn({ host: `DB.${REF}.Supabase.CO` }));

    expect(mentions(validateConfig(), 'direct host')).toBe(true);
  });

  it('does not fire when DATABASE_URL is absent, since there is no host to judge', () => {
    vi.stubEnv('DATABASE_URL', undefined);

    expect(mentions(validateConfig(), 'direct host')).toBe(false);
  });

  it('is reported by the health endpoint as a config problem, not a db failure', async () => {
    // The two checks answer different questions and must not be conflated: this
    // one is decidable from the environment, the other needs a connection that
    // is precisely what is missing.
    const { runHealthCheck } = await import('../health');
    vi.stubEnv('DATABASE_URL', conn({ host: `db.${REF}.supabase.co` }));
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', undefined);

    const report = await runHealthCheck();

    expect(report.checks.config.ok).toBe(false);
    expect(mentions(report.checks.config.problems, 'direct host')).toBe(true);
  });
});

// ===========================================================================
describe('SERVICE_DATABASE_URL', () => {
  it('reports it missing, because payroll cannot run without it', () => {
    vi.stubEnv('SERVICE_DATABASE_URL', undefined);

    expect(mentions(validateConfig(), 'SERVICE_DATABASE_URL is not set')).toBe(true);
  });

  it('reports the wrong port', () => {
    vi.stubEnv('SERVICE_DATABASE_URL', conn({ user: 'samjona_service_login', port: 5432 }));

    expect(mentions(validateConfig(), 'SERVICE_DATABASE_URL does not appear')).toBe(true);
  });

  it('accepts it on 6543', () => {
    expect(mentions(validateConfig(), 'SERVICE_DATABASE_URL')).toBe(false);
  });
});

// ===========================================================================
describe('credentials that should not be present', () => {
  it('reports SUPABASE_SERVICE_ROLE_KEY as an unused credential', () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'eyJhbGciOiJIUzI1NiJ9.payload.signature');

    const problems = validateConfig();

    expect(mentions(problems, 'SUPABASE_SERVICE_ROLE_KEY')).toBe(true);
    // It must say the credential is unused, or an operator will assume it is
    // load-bearing and keep it.
    expect(mentions(problems, 'no code reads it')).toBe(true);
  });
});

// ===========================================================================
describe('AUTH_SECRET', () => {
  it('reports it missing', () => {
    vi.stubEnv('AUTH_SECRET', undefined);

    expect(mentions(validateConfig(), 'AUTH_SECRET is not set')).toBe(true);
  });

  it('reports it too short, and says how to generate one', () => {
    vi.stubEnv('AUTH_SECRET', 'a'.repeat(31));

    const problems = validateConfig();

    expect(mentions(problems, 'shorter than 32 characters')).toBe(true);
    expect(mentions(problems, 'openssl rand')).toBe(true);
  });

  it('accepts exactly 32 characters', () => {
    vi.stubEnv('AUTH_SECRET', 'a'.repeat(32));

    expect(mentions(validateConfig(), 'AUTH_SECRET')).toBe(false);
  });
});

// ===========================================================================
describe('NEXTAUTH_URL', () => {
  it('is reported in production, because sitemap and robots publish it', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXTAUTH_URL', undefined);

    expect(mentions(validateConfig(), 'NEXTAUTH_URL is not set')).toBe(true);
  });

  it('is not reported outside production', () => {
    // A developer running `next dev` without it is fine; the routes fall back to
    // the request host.
    vi.stubEnv('NEXTAUTH_URL', undefined);

    expect(mentions(validateConfig(), 'NEXTAUTH_URL')).toBe(false);
  });

  it('is accepted in production when set', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(mentions(validateConfig(), 'NEXTAUTH_URL')).toBe(false);
  });
});

// ===========================================================================
describe('what it deliberately does not claim', () => {
  it('never asserts anything about BYPASSRLS reachability from the string', () => {
    // The role-escalation assertion is a catalog fact (pg_roles,
    // pg_auth_members), not a property of a URL. An earlier version of this
    // function searched the string for "samjona_login", which is true of every
    // correctly configured deployment -- so it fired on the right answer and
    // stayed silent on the one that mattered. That assertion lives in
    // `npm run db:verify-writes`, and this function must not pretend otherwise.
    const problems = validateConfig();

    expect(mentions(problems, 'BYPASSRLS')).toBe(false);
    expect(mentions(problems, 'samjona_service')).toBe(false);
  });

  it('does not require SERVICE_DATABASE_URL to be a service-role string', () => {
    // It reports presence and port. Whether the credential it points at is
    // correctly scoped is not decidable from the environment.
    expect(mentions(validateConfig(), 'service-role connection')).toBe(false);
  });
});
