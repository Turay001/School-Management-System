/**
 * Environment variable access, with validation.
 *
 * SECURITY: the `server-only` import makes any attempt to use this from a
 * client component a BUILD ERROR rather than a silent credential leak into
 * the browser bundle. This is the primary defence against shipping the
 * database password to the client.
 */

import 'server-only';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        'Copy .env.example to .env.local and fill it in. See docs/deployment.md',
    );
  }
  return value.trim();
}

export const serverEnv = {
  /** Supabase transaction-pooler connection string. Port 6543. */
  get DATABASE_URL() {
    return required('DATABASE_URL');
  },
  get DATABASE_POOL_MAX() {
    return process.env.DATABASE_POOL_MAX;
  },

  /**
   * Connection string for `samjona_service_login`, used ONLY by payroll
   * generation via `withServiceContext`.
   *
   * Separate from DATABASE_URL on purpose. The application role is deliberately
   * NOT a member of the BYPASSRLS service role, so an SQL injection in any
   * request handler cannot `set role samjona_service` and make every RLS policy
   * in the schema decorative. The escalation is reachable only by code that can
   * read this variable, which is server-only.
   *
   * Optional at startup, because a deployment that has not yet been configured
   * for payroll should still boot and still serve staff and students. It is
   * required the moment payroll generation is attempted, and `getServicePool`
   * throws with that message rather than silently falling back to the
   * application pool, which would fail with a confusing 42501 much later.
   *
   * Must never reach a client component. See docs/security.md.
   */
  get SERVICE_DATABASE_URL() {
    return process.env.SERVICE_DATABASE_URL?.trim() || undefined;
  },

  /**
   * The BYPASSRLS Supabase service-role key.
   *
   * NOT USED by any code in this repository. It is a PostgREST/Auth key and
   * this application talks to PostgreSQL directly with `pg`, so it has no use
   * here. It is listed so that an operator who finds it in the dashboard knows
   * it is not needed, rather than wiring it in and creating a second, far
   * broader path to the database than the one that is actually designed.
   *
   * If it is ever set, `validateConfig` reports it as a finding.
   */
  get SUPABASE_SERVICE_ROLE_KEY() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined;
  },

  /** Supabase project reference, e.g. abcdefghijklmnop. */
  get SUPABASE_PROJECT_REF() {
    return process.env.SUPABASE_PROJECT_REF?.trim() || undefined;
  },

  get NEXT_PUBLIC_SUPABASE_URL() {
    return process.env.NEXT_PUBLIC_SUPABASE_URL;
  },
  get NEXT_PUBLIC_SUPABASE_ANON_KEY() {
    return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  },

  get AUTH_SECRET() {
    return required('AUTH_SECRET');
  },
  get NEXTAUTH_URL() {
    return process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  },

  get CURRENCY_CODE() {
    return process.env.CURRENCY_CODE;
  },
  get CURRENCY_MINOR_UNITS() {
    return process.env.CURRENCY_MINOR_UNITS;
  },
  get PAYROLL_ELIGIBLE_EMPLOYEE_STATUSES() {
    return process.env.PAYROLL_ELIGIBLE_EMPLOYEE_STATUSES;
  },
  get REQUIRE_SEPARATE_PAYROLL_APPROVER() {
    return process.env.REQUIRE_SEPARATE_PAYROLL_APPROVER;
  },
  get LOGIN_RATE_LIMIT_ATTEMPTS() {
    return process.env.LOGIN_RATE_LIMIT_ATTEMPTS;
  },
  get LOGIN_RATE_LIMIT_WINDOW_MS() {
    return process.env.LOGIN_RATE_LIMIT_WINDOW_MS;
  },
  get ENABLE_ATTENDANCE_MODULE() {
    return process.env.ENABLE_ATTENDANCE_MODULE;
  },
  get ENABLE_LEAVE_MODULE() {
    return process.env.ENABLE_LEAVE_MODULE;
  },
};

/**
 * Read the role (user) out of a PostgreSQL connection string.
 * Returns null when the string cannot be parsed, so the caller can say so
 * rather than silently treating an unparseable URL as a valid one.
 */
/**
 * Supabase's connection POOLER host, as opposed to its direct host.
 *
 * `*.pooler.supabase.com` fronts Supavisor, which multiplexes every project in
 * a region onto one address.
 */
function isSupabasePoolerHost(host: string | null): boolean {
  return host !== null && host.endsWith('.pooler.supabase.com');
}

/**
 * Read the role (user) out of a PostgreSQL connection string.
 * Returns null when the string cannot be parsed, so the caller can say so
 * rather than silently treating an unparseable URL as a valid one.
 *
 * THE POOLER EXCEPTION, WHICH IS THE WHOLE REASON THIS IS NOT A ONE-LINER
 * ---------------------------------------------------------------------
 * On the direct host the username IS the role. Through Supavisor it is not:
 * the pooler multiplexes every project in a region onto one address, so it
 * routes on `<role>.<project-ref>` and the project ref has to be in the
 * username for the connection to land on the right database at all.
 *
 * Comparing that whole string against `samjona_login` reports a healthy,
 * correctly-configured pooler connection as the wrong role. That is the
 * textbook failure of a check that fires on correct input: the operator reads
 * "authenticates as samjona_login.qvocnsykkhpvldiebcbe, not samjona_login",
 * concludes the configuration is wrong, and changes something that was right.
 *
 * So the tenant suffix is stripped before comparing. The split is on the first
 * dot, which is ambiguous for a role whose own name contains a dot -- an
 * acknowledged limitation, accepted because Supavisor defines this format and
 * because the alternative (a false alarm on every pooler connection) is worse
 * than the narrow case.
 */
function readRole(connectionString: string): string | null {
  try {
    const url = new URL(connectionString);
    const username = decodeURIComponent(url.username);
    if (isSupabasePoolerHost(url.hostname.toLowerCase())) {
      const separator = username.indexOf('.');
      return separator === -1 ? username : username.slice(0, separator);
    }
    return username;
  } catch {
    return null;
  }
}

/**
 * Read the host out of a PostgreSQL connection string, or null if unparseable.
 */
function readHost(connectionString: string): string | null {
  try {
    return new URL(connectionString).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Supabase's DIRECT host, as opposed to its pooler.
 *
 * `db.<ref>.supabase.co` is the host for a direct connection to the database.
 * `*.pooler.supabase.com` is the host for the connection pooler. They are not
 * interchangeable, and the difference is not visible from the port alone.
 *
 * WHY THIS NEEDS A CHECK AT ALL
 * -----------------------------
 * Supabase projects provisioned recently are IPv6-only on the direct host. That
 * host publishes an AAAA record and NO A record, so a deployment platform
 * without IPv6 egress cannot resolve it at all: DNS fails with ENOTFOUND before
 * a TCP connection is ever attempted, and the error names the host rather than
 * anything about configuration.
 *
 * The consequence is that this string can be completely correct -- right role,
 * right password, right database, right port -- and still fail everywhere except
 * on a developer machine. A developer machine is the one place it works, because
 * a local IPv6 tunnel (Cloudflare WARP, a VPN, an IPv6-capable ISP) supplies the
 * address the direct host is missing. That makes it close to invisible in
 * development and absolute in production, which is the worst ratio of debugging
 * effort to cause there is.
 *
 * The transaction pooler exists for exactly this: it publishes IPv4 addresses,
 * so a platform without IPv6 can reach it. That is why the pooler is not merely
 * a connection-count optimisation here, which is how the port-6543 check
 * describes it.
 *
 * Matched against the direct-host shape rather than "anything supabase.com", so
 * a pooler host, a self-hosted PostgreSQL, or a local socket is not flagged.
 */
function isSupabaseDirectHost(host: string | null): boolean {
  return host !== null && /^db\.[^.]+\.supabase\.co$/.test(host);
}

/**
 * Validate the runtime configuration.
 * Returns human-readable problems rather than throwing, so a caller can
 * display them all at once.
 *
 * SCOPE: everything here is decidable from the environment alone. It does not
 * connect to the database, so it cannot assert anything about role membership
 * or RLS attributes -- see the comment on the DATABASE_URL role check for where
 * that assertion actually lives.
 *
 * CALLED BY: `/api/health`, via `runHealthCheck` in src/server/health.ts.
 * That is the only caller. It was written with none for long enough that the
 * findings here were never displayed anywhere: a deployment missing
 * DATABASE_URL or AUTH_SECRET behaved identically to one that was configured
 * correctly, and the difference was only visible by reading the dashboard. The
 * health endpoint reports them, which is also why the role-escalation assertion
 * above still points at `npm run db:verify-writes` rather than at itself: a
 * string cannot decide whether a role can reach samjona_service, so this
 * function deliberately does not try.
 */
export function validateConfig(): string[] {
  const problems: string[] = [];

  const url = process.env.DATABASE_URL;
  if (!url) {
    problems.push('DATABASE_URL is not set. The school database is not configured.');
  } else if (url.includes(':5432') || url.includes(':6543') === false) {
    if (!url.includes(':6543')) {
      problems.push(
        'DATABASE_URL does not appear to use the transaction pooler (port 6543). ' +
          'Vercel serverless functions will exhaust the connection limit on port 5432.',
      );
    }
  }
  if (url && url.includes('postgres.')) {
    problems.push(
      'DATABASE_URL looks like a service-role connection. Application requests must use ' +
        'samjona_login so that RLS applies. Only payroll generation may use the service role.',
    );
  }

  // Reachability from the deploy host. This sits with the other DATABASE_URL
  // findings but is a different class of problem: the others are about a string
  // being wrong, and this is about a string being entirely correct and still
  // unusable where it matters. See isSupabaseDirectHost for why that is so easy
  // to miss.
  if (url && isSupabaseDirectHost(readHost(url))) {
    problems.push(
      'DATABASE_URL points at the Supabase direct host (db.<ref>.supabase.co) rather than the ' +
        'connection pooler. Newer Supabase projects are IPv6-only on that host: it publishes no A ' +
        'record, so a deployment platform without IPv6 egress cannot resolve it and fails with ' +
        'ENOTFOUND before any connection is attempted. It will usually work on a developer ' +
        'machine, because a local IPv6 tunnel (Cloudflare WARP, a VPN) supplies the missing ' +
        'address, which is what makes it hard to see. Use the transaction pooler host ' +
        '(<region>.pooler.supabase.com:6543) instead, and keep samjona_login as the role. ' +
        'Check GET /api/health from the deployment, not only from your machine.',
    );
  }

  // The role is read out of the connection string, not searched for inside it.
  //
  // The previous check was `url.includes('samjona_login')`, which is true for
  // exactly the connection string docs/deployment.md mandates -- so a correctly
  // configured deployment always reported a finding, and the one configuration
  // that actually matters (a login role that can also reach samjona_service)
  // reported nothing. The check had to be inverted, because a URL is the wrong
  // place to ask the question: whether a role can escalate to BYPASSRLS is a
  // catalog fact (pg_roles, pg_auth_members), not a property of a string.
  //
  // So: assert the role name here, and leave the escalation assertion to the
  // check that can actually make it -- `npm run db:verify-writes`, which queries
  // pg_has_role(oid, 'samjona_service', 'MEMBER') against the live catalog.
  const appRole = url ? readRole(url) : null;
  if (url && appRole === null) {
    problems.push(
      'DATABASE_URL is not a parseable PostgreSQL connection string, so the role it ' +
        'authenticates as cannot be confirmed. Expected postgresql://<user>@<host>:6543/<db>',
    );
  } else if (appRole !== null && appRole !== 'samjona_login') {
    problems.push(
      `DATABASE_URL authenticates as "${appRole}", not samjona_login. samjona_login is a ` +
        'plain member of samjona_app and is fully subject to RLS. Connecting as any other ' +
        'role either bypasses the policies or breaks them outright.',
    );
  }

  // Payroll is not deployable without it, so say so plainly rather than
  // letting the first payroll run fail with a 42501 that looks like a policy bug.
  if (!process.env.SERVICE_DATABASE_URL) {
    problems.push(
      'SERVICE_DATABASE_URL is not set. Payroll generation will fail: payroll_runs and ' +
        'payroll_items have no INSERT policy for the application role by design, and the ' +
        'service pool is the only sanctioned way to write them. Everything else works ' +
        'without it. See docs/deployment.md',
    );
  } else if (!process.env.SERVICE_DATABASE_URL.includes(':6543')) {
    problems.push(
      'SERVICE_DATABASE_URL does not appear to use the transaction pooler (port 6543). ' +
        'Payroll generation holds a connection for the length of a run and will exhaust the ' +
        'direct-connection limit.',
    );
  }

  // A Supabase service-role key is a PostgREST/Auth credential. This application
  // talks to PostgreSQL directly, so it has no use here and its presence means
  // an unnecessary, very broad credential is sitting in the environment.
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    problems.push(
      'SUPABASE_SERVICE_ROLE_KEY is set but no code reads it. This application connects to ' +
        'PostgreSQL with `pg` and does not use PostgREST, so the key is an unused credential ' +
        'with more access than anything in this system needs. Remove it.',
    );
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    problems.push('AUTH_SECRET is not set. Sessions cannot be secured.');
  } else if (secret.length < 32) {
    problems.push(
      'AUTH_SECRET is shorter than 32 characters. Generate one with: openssl rand -base64 32',
    );
  }

  if (process.env.NODE_ENV === 'production' && !process.env.NEXTAUTH_URL) {
    problems.push('NEXTAUTH_URL is not set. Authentication callbacks will fail in production.');
  }

  return problems;
}
