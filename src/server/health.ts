import 'server-only';

import { validateConfig } from './env';
import { query } from './db/pool';

/**
 * Deployment health probe.
 *
 * WHY THIS EXISTS
 * ---------------
 * The single hardest deployment failure to diagnose is a missing or wrong
 * `DATABASE_URL`, because the symptom the administrator sees is generic -- the
 * application says it cannot reach the school database, and offers nothing to
 * distinguish "the variable was never set" from "the host is unreachable" from
 * "the password is wrong". Deciding between those needs access to the
 * deployment's environment, which the person fixing it may not have.
 *
 * So this answers the question from outside, with no sign-in: it reports
 * whether the configuration is complete and whether one real query against the
 * real database succeeds.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * This endpoint is unauthenticated, which makes it the one screen in the
 * application that anyone on the internet can read. Every design choice below
 * follows from that:
 *
 *  - NO CONNECTION STRING, HOST, OR ROLE NAME. The connected role is reported
 *    only as the boolean `unprivilegedRole`. "Is the app connected as something
 *    that bypasses RLS?" is the question an operator needs answered; the
 *    answer to "which role is it?" is reconnaissance, and publishing it would
 *    erode the same posture that keeps the password out of the client bundle.
 *  - NO ROW DATA AND NO COUNTS. See the probe query below for why reading rows
 *    would not even work as a check.
 *  - NO DRIVER ERROR MESSAGES. `pg` puts the host, the role and sometimes the
 *    authentication detail in `error.message`. The message is logged with a
 *    correlation id and never returned. What comes back is a `HealthFailure`
 *    drawn from a closed set.
 *  - THE SERVICE POOL IS NEVER OPENED. `SERVICE_DATABASE_URL` points at a
 *    BYPASSRLS-capable credential. Opening that pool from an endpoint anyone
 *    can request would make a remote, unauthenticated trigger for the most
 *    powerful database credential in the system. Its presence is reported as a
 *    boolean; it is never used.
 */

/** A closed set of reasons. Deliberately not the driver's own error text. */
export type HealthFailure =
  | 'not_configured'
  | 'unreachable'
  | 'authentication_failed'
  | 'connection_exhausted'
  | 'timed_out'
  | 'schema_missing'
  | 'unexpected';

export type DatabaseCheck = {
  ok: boolean;
  /** Round-trip time of the probe query, or null if it never completed. */
  latencyMs: number | null;
  failure: HealthFailure | null;
  /** Whether the SAMJONA schema is present in the database we reached. */
  schemaPresent: boolean | null;
  /**
   * Whether the connected role is a plain, RLS-subject role. `true` here means
   * the application is connected to something that bypasses its own row-level
   * security, which is a finding, not a pass.
   */
  unprivilegedRole: boolean | null;
};

export type HealthReport = {
  status: 'ok' | 'error';
  checkedAt: string;
  /**
   * Returned to the caller so a failure in the server log can be found. Same
   * contract as `AppError.toJSON`: an opaque id, safe to publish, useless to an
   * attacker because it resolves to nothing outside the log.
   */
  correlationId: string;
  checks: {
    /** Findings from `validateConfig`, which is otherwise called by nothing. */
    config: { ok: boolean; problems: string[] };
    database: DatabaseCheck;
    /** Whether SERVICE_DATABASE_URL is present. It is never used. */
    payrollConfigured: boolean;
  };
};

/**
 * The probe. One round trip, three facts.
 *
 * `to_regclass` rather than a `select count(*)` from a SAMJONA table, and that
 * choice was measured rather than preferred. Both were run against the live
 * database as the application role:
 *
 *   select count(*) from students        -> 0 rows, no error
 *
 * Because RLS is in force, a bare read with no application context returns
 * zero rows rather than failing. So a row-reading probe cannot distinguish
 * "RLS is working correctly" from "this connection can see nothing at all" --
 * the two answers are identical, and the probe would report success in both
 * cases. `to_regclass` reads the catalog instead of the data, so it is not
 * subject to RLS, and it answers the question actually being asked: is this the
 * right database, and has it been migrated.
 *
 * `rolsuper or rolbypassrls` is read from `pg_roles`, which is world-readable.
 * A deployment whose DATABASE_URL accidentally points at a superuser is working
 * perfectly and is also completely unprotected, and nothing else in the system
 * would report it.
 */
const PROBE_SQL = `
  select
    current_user                                              as current_role,
    to_regclass('public.students') is not null                as schema_present,
    coalesce(
      (select rolsuper or rolbypassrls
         from pg_roles
        where rolname = current_user),
      true
    )                                                         as privileged_role
`;

/**
 * Map a driver error onto the closed set. Only the code is consulted; the
 * message is never read, because the message is the part that leaks.
 */
export function classifyFailure(err: unknown): HealthFailure {
  if (!process.env.DATABASE_URL) return 'not_configured';

  const code = (err as { code?: string } | null | undefined)?.code;
  switch (code) {
    // Wrong password, or a role that may not log in at all.
    case '28P01':
    case '28000':
    case '28003':
    case '28001':
      return 'authentication_failed';
    // The pooler refusing more sessions. Not the same as "the host is down":
    // this one clears on its own, and it recurs under load.
    case '53300':
      return 'connection_exhausted';
    case 'ETIMEDOUT':
    case '57014':
      return 'timed_out';
    // We reached a database and it has no SAMJONA schema. Almost always the
    // wrong project, which is exactly what this endpoint exists to catch.
    case '42P01':
    case '3F000':
      return 'schema_missing';
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
    case 'ECONNREFUSED':
    case 'ECONNRESET':
    case 'EPIPE':
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
    case 'EHOSTDOWN':
    case '57P01':
    case '57P02':
    case '57P03':
      return 'unreachable';
    default:
      return 'unexpected';
  }
}

/**
 * Run every check and build the report.
 *
 * TOTAL BY CONTRACT: this never throws and never rejects. A health endpoint
 * that throws cannot report ill-health, which defeats its only purpose, so the
 * database failure is captured as data rather than propagated. The one thing
 * that could still escape is a bug in this function, and `unknown` below is
 * reported rather than rethrown for the same reason.
 */
export async function runHealthCheck(now: Date = new Date()): Promise<HealthReport> {
  const problems = validateConfig();
  const correlationId = crypto.randomUUID();

  let database: DatabaseCheck;
  try {
    const startedAt = Date.now();
    const rows = await query<{
      current_role: string;
      schema_present: boolean;
      privileged_role: boolean;
    }>(PROBE_SQL);
    const latencyMs = Date.now() - startedAt;

    const row = rows[0];
    if (!row) {
      // The query succeeded and returned nothing, which should be impossible.
      // Reported as a failure rather than treated as a pass.
      database = {
        ok: false,
        latencyMs,
        failure: 'unexpected',
        schemaPresent: null,
        unprivilegedRole: null,
      };
    } else if (!row.schema_present) {
      database = {
        ok: false,
        latencyMs,
        failure: 'schema_missing',
        schemaPresent: false,
        unprivilegedRole: !row.privileged_role,
      };
    } else {
      database = {
        // A privileged connection is NOT a pass. The query worked, but the
        // deployment is not in the state it is supposed to be in, and calling
        // that healthy would be the most dangerous answer this endpoint could
        // give.
        ok: !row.privileged_role,
        latencyMs,
        failure: row.privileged_role ? 'unexpected' : null,
        schemaPresent: true,
        unprivilegedRole: !row.privileged_role,
      };
    }
  } catch (err) {
    database = {
      ok: false,
      latencyMs: null,
      failure: classifyFailure(err),
      schemaPresent: null,
      unprivilegedRole: null,
    };
    // The detail that must not be returned goes to the log, keyed by the same
    // correlation id the caller is given.
    console.error('[health] database probe failed', {
      correlationId,
      code: (err as { code?: string } | null)?.code,
      message: (err as Error | null)?.message,
    });
  }

  return {
    status: problems.length === 0 && database.ok ? 'ok' : 'error',
    checkedAt: now.toISOString(),
    correlationId,
    checks: {
      config: { ok: problems.length === 0, problems },
      database,
      payrollConfigured: Boolean(process.env.SERVICE_DATABASE_URL),
    },
  };
}
