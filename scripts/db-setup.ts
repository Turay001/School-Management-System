/**
 * SAMJONA SMS - database role provisioning and verification.
 *
 *   npm run db:setup
 *
 * This is a thin command-line wrapper. All of the SQL lives in
 * src/server/db/roles.ts, where it is covered by tests that run against a real
 * Postgres engine (PGlite). Keeping the SQL here instead would mean the one
 * piece of code that creates credentials is the one piece with no tests.
 *
 * WHY ROLE CREATION IS NOT A MIGRATION
 * -----------------------------------
 * A migration containing `create role some_user login password 'secret'` puts a
 * working credential into version control. It is then copied into every clone,
 * every CI cache and every backup of the repository, and rotating it means
 * editing a file that has already been applied. Migrations 001 and 014 create
 * only NOLOGIN group roles; the LOGIN roles are created here from environment
 * variables.
 *
 * Safe to re-run: creates the role if absent, rotates the password if present,
 * and re-grants membership either way.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It does not apply migrations. That is `supabase db push`, which owns the
 * `supabase_migrations.schema_migrations` history table. Two tools writing the
 * same history would desynchronise it, and a migration recorded as applied but
 * never actually run is worse than one still marked pending. This script only
 * reports which migrations the target database is missing.
 *
 * REQUIRED ENVIRONMENT
 * --------------------
 *   ADMIN_DATABASE_URL              Privileged connection. Supabase: the
 *                                   `postgres` user with the database
 *                                   password. Used here and by the CLI only.
 *   SAMJONA_LOGIN_PASSWORD          Password for the application role.
 *   SAMJONA_SERVICE_LOGIN_PASSWORD  Password for the payroll role. Optional.
 *   DATABASE_URL                    Optional. Only used to sanity-check what
 *                                   the running application will connect as.
 *
 * WHAT IT VERIFIES THAT NOTHING ELSE DOES
 * ---------------------------------------
 * Two probes exist because a suite of refusals cannot detect a closed door
 * that should be open:
 *
 *   - The application role must be REFUSED on payroll_items, bank account
 *     numbers, and approved payroll runs.
 *   - The service role must be PERMITTED to write a payroll period.
 *
 * The second is the newer of the two. The schema was fully compliant while
 * payroll generation could not write anything at all, because the code that
 * claimed to escalate to the service role only set a GUC. No policy was missing
 * and no grant was missing, so every catalog check passed and the defect was
 * invisible until something actually attempted the write.
 */

import { Client } from 'pg';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  APP_GROUP_ROLE,
  APP_LOGIN_ROLE,
  COUNT_BANK_ACCOUNTS,
  DELETE_EMPLOYEES_PROBE,
  INSERT_PAYROLL_ITEM_PROBE,
  READ_BANK_ACCOUNTS_PROBE,
  SERVICE_GROUP_ROLE,
  SERVICE_LOGIN_ROLE,
  SERVICE_PAYROLL_WRITE_PROBE,
  checkRoleSecurity,
  checkTableSecurity,
  probeAsAppRole,
  probeAsServiceRole,
  upsertLoginRole,
  type Queryable,
} from '../src/server/db/roles';

// ---------------------------------------------------------------------------
// Minimal .env loader
// ---------------------------------------------------------------------------
// Hand-rolled rather than a dependency. Node's `--env-file` is unavailable
// before 22.9 and package.json declares support from Node 20.9. Values already
// present in the real environment always win, so
// `ADMIN_DATABASE_URL=... npm run db:setup` still works.
//
// Load order is `.env.setup`, `.env.local`, `.env`, and the first value found
// wins. `.env.setup` is listed first on purpose: it holds the PRIVILEGED
// connection string, and Next.js reads `.env.local` into the running server
// process. Keeping the superuser credential in a file that only this script
// opens means the deployed application never has it in memory at all.
//
// Both files are gitignored. See .gitignore.

function loadEnvFiles(): void {
  for (const name of ['.env.setup', '.env.local', '.env']) {
    const path = join(process.cwd(), name);
    if (!existsSync(path)) continue;

    for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line === '' || line.startsWith('#')) continue;

      const eq = line.indexOf('=');
      if (eq === -1) continue;

      const key = line.slice(0, eq).trim();
      if (key === '' || process.env[key] !== undefined) continue;

      let value = line.slice(eq + 1).trim();
      // Strip a trailing comment only for unquoted values, so a `#` inside a
      // quoted password survives.
      if (!/^["']/.test(value)) {
        const hash = value.indexOf(' #');
        if (hash !== -1) value = value.slice(0, hash).trim();
      }
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  }
}

loadEnvFiles();

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const GREEN = '\u001b[32m';
const RED = '\u001b[31m';
const YELLOW = '\u001b[33m';
const DIM = '\u001b[2m';
const BOLD = '\u001b[1m';
const RESET = '\u001b[0m';

const ok = (msg: string) => console.log(`  ${GREEN}ok${RESET}    ${msg}`);
const bad = (msg: string) => console.log(`  ${RED}FAIL${RESET}  ${msg}`);
const warn = (msg: string) => console.log(`  ${YELLOW}warn${RESET}  ${msg}`);
const note = (msg: string) => console.log(`  ${DIM}..${RESET}    ${msg}`);
const head = (msg: string) => console.log(`\n${BOLD}${msg}${RESET}`);

let failureCount = 0;
function fail(message: string): void {
  failureCount += 1;
  bad(message);
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Values that appear in .env.example and must never reach a real database. */
function looksLikePlaceholder(value: string): boolean {
  const upper = value.toUpperCase();
  return (
    value.trim() === '' ||
    upper.includes('CHANGE_ME') ||
    upper.includes('CHANGEME') ||
    upper.includes('YOUR-PASSWORD') ||
    upper.includes('YOUR_PASSWORD') ||
    upper.includes('<PASSWORD>') ||
    upper.includes('REPLACE-WITH') ||
    upper.includes('REPLACEME') ||
    upper.includes('XXXX') ||
    upper.includes('[YOUR-')
  );
}

/**
 * A database password weak enough to guess is a worse failure than a script
 * that refuses to run, because nobody notices until much later.
 */
function passwordProblem(label: string, password: string | undefined): string | null {
  if (!password) return `${label} is not set.`;
  if (looksLikePlaceholder(password)) {
    return `${label} is still a placeholder. Replace it in .env.local.`;
  }
  if (password.length < 16) {
    return (
      `${label} is only ${password.length} characters; use at least 16. Generate one with:\n` +
      `        node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`
    );
  }
  if (password === process.env.ADMIN_DATABASE_URL?.trim()) {
    return `${label} is the whole connection string, not a password.`;
  }
  return null;
}

interface Config {
  adminUrl: string;
  appUrl: string | undefined;
  appPassword: string;
  servicePassword: string | undefined;
}

function readConfig(): Config | null {
  const adminUrl = process.env.ADMIN_DATABASE_URL?.trim();
  const appUrl = process.env.DATABASE_URL?.trim();
  const appPassword = process.env.SAMJONA_LOGIN_PASSWORD?.trim();
  const servicePassword = process.env.SAMJONA_SERVICE_LOGIN_PASSWORD?.trim();

  const problems: string[] = [];

  if (!adminUrl) {
    problems.push(
      'ADMIN_DATABASE_URL is not set.\n' +
        '        This is the PRIVILEGED connection, needed because creating roles and\n' +
        '        applying RLS require privileges the application role does not have. On\n' +
        '        Supabase it is the `postgres` user with the password from Project\n' +
        '        Settings > Database. The running application never uses it.',
    );
  } else if (looksLikePlaceholder(adminUrl)) {
    problems.push('ADMIN_DATABASE_URL still contains a placeholder value.');
  }

  const appProblem = passwordProblem('SAMJONA_LOGIN_PASSWORD', appPassword);
  if (appProblem) problems.push(appProblem);

  const serviceProblem = passwordProblem('SAMJONA_SERVICE_LOGIN_PASSWORD', servicePassword);
  if (serviceProblem) problems.push(serviceProblem);

  if (problems.length > 0) {
    console.log(`\n${BOLD}Configuration is not usable:${RESET}\n`);
    for (const problem of problems) console.log(`  ${RED}*${RESET}    ${problem}`);
    console.log(
      `\n  Add the missing values to ${BOLD}.env.local${RESET} (see .env.example).\n` +
        `  This script never writes credentials to a file or to version control.\n`,
    );
    return null;
  }

  if (!servicePassword) {
    warn(`${SERVICE_LOGIN_ROLE} not configured; skipping it.`);
    warn('Payroll generation cannot write payroll tables without it. Set the');
    warn('password and re-run before going live. See docs/payroll-workflow.md.');
  }

  return { adminUrl: adminUrl!, appUrl, appPassword: appPassword!, servicePassword };
}

/**
 * Check SERVICE_DATABASE_URL against the credentials in .env.setup, and say
 * something actionable if they disagree.
 *
 * These two are the same login role reached by two different routes, and they
 * can drift: a password rotated in the database but not in `.env.setup` leaves
 * the application unable to generate payroll while every setup check still
 * passes, because setup authenticates with the environment password rather than
 * the one in the URL.
 */
function checkServiceUrl(setupPassword: string | undefined): void {
  const serviceUrl = process.env.SERVICE_DATABASE_URL?.trim();
  if (!serviceUrl) {
    warn('SERVICE_DATABASE_URL is not set. Payroll generation will fail at runtime.');
    warn('It must be the same transaction-pooler URL as DATABASE_URL, with the user');
    warn('changed to ' + SERVICE_LOGIN_ROLE + '. See .env.example.');
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(serviceUrl);
  } catch {
    fail('SERVICE_DATABASE_URL is not a valid URL.');
    return;
  }

  const user = decodeURIComponent(parsed.username);
  if (user === SERVICE_LOGIN_ROLE) {
    ok(`SERVICE_DATABASE_URL connects as ${SERVICE_LOGIN_ROLE}`);
  } else {
    fail(
      `SERVICE_DATABASE_URL connects as "${user}", but payroll generation assumes ` +
        `${SERVICE_LOGIN_ROLE}. withServiceContext issues \`set local role ` +
        `${SERVICE_GROUP_ROLE}\`, which only that role is a member of.`,
    );
  }

  // The app role must not be the one holding the service credential, or the
  // separate pool is decorative and the separation is gone.
  if (user === APP_LOGIN_ROLE) {
    fail(
      `SERVICE_DATABASE_URL authenticates as ${APP_LOGIN_ROLE}, which is a member of ` +
        `${APP_GROUP_ROLE} and NOT of ${SERVICE_GROUP_ROLE}. Payroll would be blocked ` +
        'by RLS, and the two pools would be identical.',
    );
  }
  if (user === 'postgres' || user.startsWith('postgres.')) {
    fail(
      'SERVICE_DATABASE_URL connects as the table owner, which bypasses RLS as a side ' +
        'effect of ownership rather than by design. Use ' +
        SERVICE_LOGIN_ROLE +
        '.',
    );
  }

  if (!parsed.port) {
    warn(
      'SERVICE_DATABASE_URL has no explicit port, so it defaults to 5432. Payroll holds a ' +
        'connection for the length of a run; use the transaction pooler on 6543.',
    );
  } else if (parsed.port !== '6543') {
    warn(
      `SERVICE_DATABASE_URL uses port ${parsed.port}. The transaction pooler (6543) is ` +
        'recommended, as for DATABASE_URL.',
    );
  }

  if (setupPassword && parsed.password && parsed.password !== setupPassword) {
    warn(
      'the password in SERVICE_DATABASE_URL differs from SAMJONA_SERVICE_LOGIN_PASSWORD. One ' +
        'of them is stale; db:setup rotates the password on every run, so re-copy the URL ' +
        'from .env.setup after running it.',
    );
  }
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

async function verifyTableSecurity(db: Queryable): Promise<void> {
  head('Row Level Security');

  const tables = await checkTableSecurity(db);
  if (tables.length === 0) {
    fail(
      'no tables found in the public schema. Have the migrations been applied?\n' +
        '        Run: npm run db:migrate',
    );
    return;
  }

  const notEnabled = tables.filter((t) => !t.rls_enabled);
  const notForced = tables.filter((t) => t.rls_enabled && !t.rls_forced);
  const withDelete = tables.filter((t) => t.app_has_delete);

  if (notEnabled.length === 0) ok(`RLS enabled on all ${tables.length} tables`);
  else
    fail(
      `RLS not enabled on: ${notEnabled.map((t) => t.table_name).join(', ')}\n` +
        '        An unprotected table is fully readable by any authenticated request.',
    );

  if (notForced.length === 0) ok(`FORCE RLS set on all ${tables.length} tables`);
  else
    fail(
      `RLS enabled but not FORCED on: ${notForced.map((t) => t.table_name).join(', ')}\n` +
        '        Without FORCE, the table owner bypasses the policies.',
    );

  if (withDelete.length === 0) ok('application role has no DELETE on any table');
  else
    fail(
      `application role can DELETE from: ${withDelete.map((t) => t.table_name).join(', ')}\n` +
        '        Nothing financial may be removable. Revoke it and fix migration 012.',
    );
}

async function verifyRoles(db: Queryable): Promise<void> {
  head('Role attributes and membership');

  const checks = await checkRoleSecurity(db);
  for (const check of checks) {
    if (check.passed) ok(check.name);
    else fail(`${check.name} — ${check.detail}`);
  }
}

/**
 * The catalogue can list a policy that does not behave as intended. Only an
 * attempted statement settles it.
 */
/**
 * Prove payroll is actually WRITABLE, over a real connection, as the service role.
 *
 * A dedicated connection is required, and the admin connection cannot be reused.
 * `postgres` on Supabase holds CREATEROLE but is not a superuser, and `SET ROLE`
 * needs MEMBERSHIP rather than CREATEROLE, so escalating from the admin
 * connection fails with "permission denied to set role samjona_service" however
 * correct the configuration is. That is a misleading way to report a real
 * problem, and it is what the first version of this probe did.
 *
 * Connecting as `samjona_service_login` is also the only version that tests the
 * real path: it exercises the password, the membership grant and the BYPASSRLS
 * attribute together, exactly as `withServiceContext` does. A probe that skipped
 * the login role could report success while payroll generation still failed.
 */
async function verifyServiceCanWritePayroll(config: Config): Promise<void> {
  if (!config.servicePassword) {
    note(
      `cannot write payroll as the service role - SKIPPED, ${SERVICE_LOGIN_ROLE} not provisioned`,
    );
    return;
  }

  const base = config.appUrl ?? config.adminUrl;
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    note('cannot write payroll as the service role - SKIPPED, no usable connection URL');
    return;
  }
  url.username = SERVICE_LOGIN_ROLE;
  url.password = config.servicePassword;

  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();
  } catch (err) {
    fail(
      `could not connect as ${SERVICE_LOGIN_ROLE}: ${describe(err)}\n` +
        '        Payroll generation will fail. Re-run npm run db:setup to rotate the password,\n' +
        '        then update SERVICE_DATABASE_URL to match.',
    );
    return;
  }

  try {
    const payroll = await probeAsServiceRole(
      client as unknown as Queryable,
      SERVICE_PAYROLL_WRITE_PROBE,
    );
    if (payroll.errorCode === null) {
      ok(`service role CAN write payroll_periods (as ${SERVICE_GROUP_ROLE})`);
    } else {
      fail(
        `service role CANNOT write payroll_periods - ${payroll.errorCode}: ` +
          `${payroll.errorMessage ?? 'no message'}\n` +
          '        Payroll generation is broken. Check that the group role has BYPASSRLS and\n' +
          `        that ${SERVICE_GROUP_ROLE} holds INSERT on payroll_periods, and that\n` +
          '        withServiceContext issues `set local role` rather than only a GUC.',
      );
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function verifyEnforcement(db: Queryable, config: Config): Promise<void> {
  head('Enforcement probes (each rolled back)');

  // Missing GRANT -> 42501. A missing POLICY -> zero rows, not an error. The
  // two need different expectations, and conflating them produces false passes.
  const writes: Array<{ label: string; sql: string }> = [
    { label: `cannot INSERT into payroll_items`, sql: INSERT_PAYROLL_ITEM_PROBE },
    { label: `cannot DELETE from employees`, sql: DELETE_EMPLOYEES_PROBE },
  ];

  for (const probe of writes) {
    const result = await probeAsAppRole(db, probe.sql);
    if (result.errorCode === '42501') {
      ok(`application role ${probe.label} — denied (42501)`);
    } else if (result.errorCode === null) {
      fail(`application role ${probe.label} — the statement was PERMITTED`);
    } else {
      fail(
        `application role ${probe.label} — failed with ${result.errorCode}, meaning the\n` +
          `        statement reached the data layer. The guard is missing, not merely strict.`,
      );
    }
  }

  const { rows } = await db.query<{ n: number }>(COUNT_BANK_ACCOUNTS);
  const bankAccounts = rows[0]?.n ?? 0;

  if (bankAccounts === 0) {
    note('cannot read bank account numbers — INCONCLUSIVE, no bank accounts on file');
    note('(an empty table cannot demonstrate that a policy works)');
  } else {
    const result = await probeAsAppRole(db, READ_BANK_ACCOUNTS_PROBE);
    if (result.errorCode !== null)
      ok(`cannot read bank account numbers — denied (${result.errorCode})`);
    else if (result.rows === 0)
      ok(`cannot read bank account numbers — 0 of ${bankAccounts} visible`);
    else fail(`application role LEAKED ${result.rows} of ${bankAccounts} bank account rows`);
  }

  // Payroll must be writable, and only through the service role.
  //
  // This is the positive counterpart to the refusal probes above. Without it
  // the setup was entirely green on a database where payroll generation could
  // not write anything at all: no policy was missing, no grant was missing, and
  // the only thing wrong was that `withServiceContext` set a GUC instead of
  // assuming the service role. A suite of refusals cannot detect a path that is
  // closed when it should be open.
  await verifyServiceCanWritePayroll(config);

  // The approved-run guard is only meaningful with an approved run to change.
  const approved = await db.query<{ n: number }>(
    `select count(*)::int as n from payroll_runs where status = 'approved'`,
  );
  if ((approved.rows[0]?.n ?? 0) === 0) {
    note('cannot move an approved payroll run — INCONCLUSIVE, none exists to test');
    note('(covered by src/server/db/__tests__/integrity.test.ts)');
    return;
  }

  await db.query('begin');
  try {
    await db.query(`set local role ${APP_LOGIN_ROLE}`);
    const result = await db.query(
      `update payroll_runs set status = 'draft' where status = 'approved'`,
    );
    if ((result.rowCount ?? 0) === 0) ok('cannot move an approved payroll run — 0 rows updated');
    else fail(`application role UPDATED ${result.rowCount} approved payroll run(s)`);
  } catch (err) {
    ok(`cannot move an approved payroll run — denied (${describeCode(err)})`);
  } finally {
    await db.query('reset role').catch(() => undefined);
    await db.query('rollback').catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Migration status
// ---------------------------------------------------------------------------

function localMigrationVersions(): string[] {
  const dir = join(process.cwd(), 'supabase', 'migrations');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => f.split('_')[0]!)
    .sort();
}

async function reportMigrations(client: Client): Promise<void> {
  head('Migration status');

  const local = localMigrationVersions();
  if (local.length === 0) {
    warn('no migrations found in supabase/migrations');
    return;
  }

  let applied: Set<string>;
  try {
    const { rows } = await client.query<{ version: string }>(
      `select version from supabase_migrations.schema_migrations`,
    );
    applied = new Set(rows.map((r) => r.version));
    note(`${applied.size} migration(s) recorded by the Supabase CLI`);
  } catch {
    warn(
      'supabase_migrations.schema_migrations is not readable. The database may\n' +
        '        not have been migrated yet, or migrations were applied through the\n' +
        '        SQL editor, which does not record history.',
    );
    return;
  }

  const pending = local.filter((v) => !applied.has(v));
  if (pending.length === 0) {
    ok(`all ${local.length} local migrations are applied`);
    return;
  }

  warn(`${pending.length} migration(s) not applied: ${pending.join(', ')}`);
  console.log(
    `\n  Apply them with:  ${BOLD}npm run db:migrate${RESET}   (runs \`supabase db push\`)\n` +
      `  Requires the Supabase CLI. Without it, run the files in order in the\n` +
      `  dashboard SQL editor, and record them by hand afterwards.\n`,
  );
}

// ---------------------------------------------------------------------------
// Application connectivity
// ---------------------------------------------------------------------------

async function verifyAppConnection(config: Config): Promise<void> {
  head('Application connection');

  if (!config.appUrl) {
    warn('DATABASE_URL is not set; skipping the application connection test.');
    warn('The app cannot reach the database until it is configured.');
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(config.appUrl);
  } catch {
    fail('DATABASE_URL is not a valid URL.');
    return;
  }

  if (parsed.port === '6543') {
    ok('DATABASE_URL uses port 6543 (transaction pooler)');
  } else if (parsed.port === '5432') {
    warn(
      'DATABASE_URL uses port 5432, the direct/session connection. That is fine for\n' +
        '        scripts and the CLI, but Vercel serverless functions will exhaust the\n' +
        '        connection limit within minutes. Use 6543 in production.',
    );
  } else if (parsed.port === '') {
    warn('DATABASE_URL has no explicit port, so it defaults to 5432 rather than 6543.');
  }

  const user = decodeURIComponent(parsed.username);
  if (user === 'postgres' || user.startsWith('postgres.')) {
    fail(
      `DATABASE_URL connects as "${user}", which owns the tables and therefore BYPASSES\n` +
        '        Row Level Security. Every policy would be inert while appearing to work.\n' +
        `        Use ${APP_LOGIN_ROLE}.`,
    );
  } else if (user === APP_LOGIN_ROLE) {
    ok(`DATABASE_URL connects as ${APP_LOGIN_ROLE} (RLS applies)`);
  } else {
    warn(
      `DATABASE_URL connects as "${user}". Confirm this is a non-owner role, or every\n` +
        '        RLS policy in the database is bypassed.',
    );
  }

  // Use the password from the environment rather than the one embedded in the
  // URL, so a stale URL password cannot mask a problem.
  const live = new URL(config.appUrl);
  live.username = APP_LOGIN_ROLE;
  live.password = config.appPassword;

  const client = new Client({
    connectionString: live.toString(),
    connectionTimeoutMillis: 10_000,
  });

  try {
    await client.connect();
    const { rows } = await client.query<{ who: string }>(`select current_user as who`);
    await client.end();
    if (rows[0]?.who === APP_LOGIN_ROLE) ok(`authenticated to the database as ${APP_LOGIN_ROLE}`);
    else fail(`expected current_user ${APP_LOGIN_ROLE}, got ${rows[0]?.who}`);
  } catch (err) {
    try {
      await client.end();
    } catch {
      /* already closed */
    }
    fail(`could not connect as ${APP_LOGIN_ROLE}: ${describe(err)}`);
    console.log(
      `\n  Check that the password matches SAMJONA_LOGIN_PASSWORD, and that the host\n` +
        `  and port are reachable from this machine.\n`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function describeCode(err: unknown): string {
  return (err as { code?: string }).code ?? 'no code';
}

async function main(): Promise<number> {
  console.log(`\n${BOLD}SAMJONA SMS - database setup${RESET}`);

  const config = readConfig();
  if (!config) return 1;

  const client = new Client({
    connectionString: config.adminUrl,
    connectionTimeoutMillis: 15_000,
  });

  try {
    await client.connect();
  } catch (err) {
    fail(`could not connect with ADMIN_DATABASE_URL: ${describe(err)}`);
    console.log(
      `\n  This connection must be made as a superuser, because creating roles and\n` +
        `  applying RLS require privileges the application role does not have. On\n` +
        `  Supabase, use the \`postgres\` user with the database password from\n` +
        `  Project Settings > Database.\n`,
    );
    return 1;
  }

  // Supabase's `postgres` role is deliberately NOT a superuser: it holds
  // CREATEROLE and the ownership needed to manage its own project, which is
  // enough to create roles and apply migrations, but not enough to alter the
  // SUPERUSER attribute of any role. Warning about that generically would be
  // noise, since it is the normal state and provisioning works within it.
  const { rows: who } = await client.query<{
    who: string;
    is_super: boolean;
    can_create_role: boolean;
  }>(
    `select r.rolname                                as who,
            r.rolsuper                               as is_super,
            r.rolcreaterole                          as can_create_role
     from pg_roles r where r.rolname = current_user`,
  );
  const me = who[0];
  note(`connected as ${me?.who} (superuser=${me?.is_super}, createrole=${me?.can_create_role})`);

  if (!me?.can_create_role && !me?.is_super) {
    warn(
      'this role can neither create roles nor is a superuser, so provisioning will fail.\n' +
        '        On Supabase use the `postgres` user from Project Settings > Database.',
    );
  }

  const db: Queryable = client as unknown as Queryable;

  checkServiceUrl(config.servicePassword);

  head('Login roles');
  try {
    await upsertLoginRole(db, {
      loginRole: APP_LOGIN_ROLE,
      groupRole: APP_GROUP_ROLE,
      password: config.appPassword,
    });
    ok(`${APP_LOGIN_ROLE} created or password rotated (member of ${APP_GROUP_ROLE})`);
  } catch (err) {
    fail(`could not provision ${APP_LOGIN_ROLE}: ${describe(err)}`);
  }

  if (config.servicePassword) {
    try {
      await upsertLoginRole(db, {
        loginRole: SERVICE_LOGIN_ROLE,
        groupRole: SERVICE_GROUP_ROLE,
        password: config.servicePassword,
      });
      ok(`${SERVICE_LOGIN_ROLE} created or password rotated (member of ${SERVICE_GROUP_ROLE})`);
    } catch (err) {
      fail(`could not provision ${SERVICE_LOGIN_ROLE}: ${describe(err)}`);
    }
  }

  // Sequential, not concurrent. Every check below shares one connection, and
  // verifyEnforcement opens a transaction and switches role, so overlapping
  // these would corrupt each other's session state.
  await verifyTableSecurity(db);
  await verifyRoles(db);
  await verifyEnforcement(db, config);
  await reportMigrations(client);
  await client.end().catch(() => undefined);

  await verifyAppConnection(config);

  console.log('');
  if (failureCount > 0) {
    console.log(`${RED}${BOLD}${failureCount} problem(s) need attention.${RESET}`);
    console.log(
      '  This database holds the financial record of the school. A failed check here\n' +
        '  is not cosmetic.\n',
    );
    return 1;
  }

  console.log(`${GREEN}${BOLD}All checks passed.${RESET}`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(`\n${RED}Unexpected failure:${RESET}`, err);
    process.exit(1);
  });
