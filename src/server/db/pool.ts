import 'server-only';

import { Pool, types, type PoolClient, type QueryResultRow } from 'pg';

/**
 * bigint (OID 20) is the type used for every monetary amount.
 *
 * node-postgres returns bigint columns as STRINGS by default, because
 * JavaScript numbers cannot represent the full 64-bit range. For this
 * application that default is actively dangerous: a salary would arrive as
 * the string "450000", and `"450000" + 50000` would concatenate into
 * "45000050000" instead of adding.
 *
 * All SAMJONA amounts sit far inside Number.MAX_SAFE_INTEGER, so parsing to
 * a number is safe. The guard throws rather than silently losing precision
 * if that assumption is ever violated.
 */
types.setTypeParser(20, (value: string): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(
      `bigint value ${value} exceeds JavaScript's safe integer range. ` +
        'Monetary amounts must fit within Number.MAX_SAFE_INTEGER ' +
        '(9,007,199,254,740,991). Check for a data-entry error.',
    );
  }
  return parsed;
});

/**
 * PostgreSQL connection pool.
 *
 * SERVER ONLY. `server-only` makes any import from a client component a build
 * error, so the database password can never reach the browser bundle.
 *
 * CONNECTING TO SUPABASE
 * ----------------------
 * Use the TRANSACTION pooler (port 6543), not the session pooler (5432) and
 * not the IPv6 direct connection. Vercel functions are serverless: each
 * invocation may open its own connection, and the direct/pgbouncer session
 * modes exhaust the connection limit quickly. Port 6543 is
 * transaction-mode, which is exactly what `withTransaction` needs because
 * every unit of work is wrapped in BEGIN/COMMIT.
 *
 * In .env.local, take the "Connection string" from Supabase Dashboard ->
 * Connect, and swap the host to db.<ref>.supabase.co:6543.
 */

let pool: Pool | null = null;
let servicePool: Pool | null = null;

function build(connectionString: string, applicationName: string): Pool {
  const created = new Pool({
    connectionString,
    // Vercel serverless: keep this small. Each concurrent function invocation
    // may hold one connection, and Supabase's pooler has a hard ceiling.
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Fail fast rather than queueing forever behind an exhausted pool.
    statement_timeout: Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? 15_000),
    application_name: applicationName,
  });

  // A pool-level error (e.g. an idle server closing the connection) must not
  // crash the process.
  created.on('error', (err) => {
    console.error('[db] idle client error', { app: applicationName, message: err.message });
  });

  return created;
}

/**
 * The application pool. Connects as `samjona_login`, which is a member of
 * `samjona_app` and is fully subject to RLS. This is what every request uses.
 */
export function getPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and set it to your ' +
        'Supabase transaction-pooler connection string (port 6543). See docs/deployment.md',
    );
  }

  pool = build(connectionString, 'samjona-sms');
  return pool;
}

/**
 * The payroll service pool. A SEPARATE pool, deliberately, connecting as
 * `samjona_service_login`.
 *
 * WHY A SECOND POOL RATHER THAN A ROLE SWITCH ON THE FIRST
 * ------------------------------------------------------
 * The obvious alternative is to make `samjona_login` a member of
 * `samjona_service` and have it `set local role samjona_service` when it needs
 * to. That was rejected on security grounds: it would put the ability to
 * escalate to a BYPASSRLS role inside the hands of the role that serves every
 * request. A SQL injection in any ordinary route handler would then be able to
 * `set role samjona_service` and read or write anything, and the RLS policies
 * that do the actual protecting in this system would be one injection away from
 * being decorative.
 *
 * Separate credentials mean the escalation is not reachable from the web tier
 * at all: only a module that reads `SERVICE_DATABASE_URL` can open this pool,
 * and that variable is server-only and absent from the client bundle.
 *
 * Note that this pool does not itself hold BYPASSRLS - `rolbypassrls` is not
 * inherited through role membership, which is exactly why this exists. The
 * escalation is an explicit `set local role samjona_service` in
 * `withServiceContext`, per transaction.
 */
export function getServicePool(): Pool {
  if (servicePool) return servicePool;

  const connectionString = process.env.SERVICE_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'SERVICE_DATABASE_URL is not set. It is required for payroll generation, which is ' +
        'deliberately not writable by the application role. See docs/deployment.md',
    );
  }

  // Smaller than the application pool: only payroll generation uses it, and it
  // holds a connection for the whole of a potentially long run.
  servicePool = build(connectionString, 'samjona-sms-payroll');
  return servicePool;
}

export type Queryable = Pick<PoolClient, 'query'>;

/** Run a single read-only query outside any explicit transaction. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params as never[]);
  return result.rows;
}

/** Run a single query inside a transaction. */
export async function queryIn<T extends QueryResultRow = QueryResultRow>(
  tx: Queryable,
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await tx.query<T>(text, params as never[]);
  return result.rows;
}

/** Convenience: first row or null. */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  tx: Queryable,
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await queryIn<T>(tx, text, params);
  return rows[0] ?? null;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
  if (servicePool) {
    await servicePool.end();
    servicePool = null;
  }
}

/** Test hook. */
export function resetPoolForTests(): void {
  pool = null;
  servicePool = null;
}
