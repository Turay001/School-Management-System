/**
 * Database role provisioning and security verification.
 *
 * WHY THIS IS NOT A MIGRATION
 * ---------------------------
 * A migration containing `create role some_user login password 'secret'` puts a
 * working credential into version control. That password is then copied into
 * every clone, every CI cache, and every backup of the repository, and
 * rotating it means editing a file that has already been applied. Migrations
 * 001 and 014 therefore create only NOLOGIN group roles; the LOGIN roles that
 * actually carry passwords are created by this module, from values supplied at
 * run time and never written to a file.
 *
 * The operations here are idempotent: creating a missing role, rotating the
 * password of an existing one, and re-granting membership all converge on the
 * intended state.
 *
 * Every statement is built with Postgres `format()` from bound parameters.
 * Nothing is concatenated into SQL text, so a password containing a quote
 * cannot break the statement or inject SQL.
 *
 * NOTE: no `import 'server-only'` here, unlike `pool.ts` and `transaction.ts`.
 * This module is deliberately imported by `scripts/db-setup.ts`, which runs
 * under plain Node via tsx, where the `server-only` marker package throws at
 * import time. It also holds no connection string and no secret, so it has
 * nothing to keep out of a client bundle.
 */

/**
 * The subset of a Postgres client these functions need.
 *
 * Declared structurally so the same code runs against `pg.Client` in the setup
 * script and against PGlite in the test suite. PGlite is a real Postgres
 * engine, so the SQL exercised here is the same SQL that will run in
 * production.
 */
export interface Queryable {
  query<R = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>;
}

/** The group role application requests run as. Subject to RLS. */
export const APP_GROUP_ROLE = 'samjona_app';
/** The group role payroll generation runs as. Has BYPASSRLS. */
export const SERVICE_GROUP_ROLE = 'samjona_service';
/** LOGIN role the application connects as. Password supplied at run time. */
export const APP_LOGIN_ROLE = 'samjona_login';
/** LOGIN role payroll generation connects as. Password supplied at run time. */
export const SERVICE_LOGIN_ROLE = 'samjona_service_login';

/**
 * Build a statement with `format()`, then execute it.
 *
 * `format()` is invoked in a SELECT rather than inside a `DO` block on
 * purpose. A DO block's body is compiled separately, and whether outer query
 * parameters are visible inside it varies between server versions. A plain
 * SELECT has no such ambiguity.
 */
export async function runFormatted(
  db: Queryable,
  template: string,
  values: string[],
): Promise<void> {
  const { rows } = await db.query<{ stmt: string }>(
    `select format($1, variadic $2::text[]) as stmt`,
    [template, values],
  );
  const stmt = rows[0]?.stmt;
  if (!stmt) throw new Error('format() produced no statement');
  await db.query(stmt);
}

export interface LoginRoleSpec {
  /** LOGIN role to create or rotate. */
  loginRole: string;
  /** NOLOGIN group role it must be a member of. */
  groupRole: string;
  /** Password, supplied at run time. Never persisted. */
  password: string;
}

/**
 * Create the login role if absent, otherwise rotate its password, and ensure it
 * is a member of the group role.
 *
 * Membership is re-granted on every run so that an accidentally revoked grant
 * is repaired without anyone having to remember the SQL.
 */
export async function upsertLoginRole(db: Queryable, spec: LoginRoleSpec): Promise<void> {
  const { loginRole, groupRole, password } = spec;

  const existing = await db.query<{ present: boolean }>(
    `select exists (select 1 from pg_roles where rolname = $1) as present`,
    [loginRole],
  );

  const template =
    existing.rows[0]?.present === true
      ? 'alter role %I with login inherit password %L'
      : 'create role %I with login inherit password %L';

  // Each step is named. A bare "permission denied" from a multi-statement
  // sequence is not actionable, and on Supabase the `postgres` role is NOT a
  // superuser, so some statements genuinely fail there.
  const steps: Array<{ label: string; template: string; values: string[] }> = [
    {
      label: existing.rows[0]?.present === true ? 'set the password of' : 'create',
      template,
      values: [loginRole, password],
    },
    {
      label: 'grant group membership for',
      template: 'grant %I to %I',
      values: [groupRole, loginRole],
    },
  ];

  for (const step of steps) {
    try {
      await runFormatted(db, step.template, step.values);
    } catch (err) {
      throw new Error(
        `could not ${step.label} role "${loginRole}" [${describeCode(err)}]\n` +
          `        ${err instanceof Error ? err.message : String(err)}\n` +
          `        On Supabase the \`postgres\` role is NOT a superuser, so some operations are\n` +
          `        refused. If this is "permission denied to alter role", run the same\n` +
          `        statement in the dashboard SQL editor, which executes with fuller rights.`,
      );
    }
  }

  // Read the attributes back rather than trying to set them.
  //
  // A role is NOSUPERUSER, NOCREATEDB and NOCREATEROLE unless something made
  // it otherwise, so re-asserting those on every run is wasted work. It is also
  // not always possible: since PostgreSQL 16 a role holding CREATEROLE cannot
  // change any role's SUPERUSER attribute at all, and Supabase's `postgres` is
  // CREATEROLE but not superuser. Attempting `alter role ... nosuperuser`
  // therefore fails on a perfectly healthy setup.
  //
  // So: inspect, and only attempt a repair when something is actually wrong.
  const attributes = await db.query<{
    rolsuper: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
  }>(`select rolsuper, rolcreatedb, rolcreaterole from pg_roles where rolname = $1`, [loginRole]);

  const attrs = attributes.rows[0];
  if (attrs?.rolsuper || attrs?.rolcreatedb || attrs?.rolcreaterole) {
    try {
      await runFormatted(db, 'alter role %I with nosuperuser nocreatedb nocreaterole', [loginRole]);
    } catch (err) {
      throw new Error(
        `role "${loginRole}" has excessive privileges ` +
          `(superuser=${attrs.rolsuper} createdb=${attrs.rolcreatedb} ` +
          `createrole=${attrs.rolcreaterole}) and they could not be revoked ` +
          `[${describeCode(err)}].\n` +
          `        Revoking SUPERUSER requires a superuser, so this must be done in the\n` +
          `        Supabase dashboard SQL editor:\n` +
          `          alter role ${loginRole} with nosuperuser nocreatedb nocreaterole;`,
      );
    }
  }
}

function describeCode(err: unknown): string {
  return (err as { code?: string }).code ?? 'no code';
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export interface RoleCheck {
  name: string;
  passed: boolean;
  detail: string;
}

interface RoleRow {
  rolname: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
  rolcanlogin: boolean;
  rolinherit: boolean;
}

/**
 * Confirm the two LOGIN roles exist, are members of the right group, and carry
 * no privileges that would defeat Row Level Security.
 */
export async function checkRoleSecurity(db: Queryable): Promise<RoleCheck[]> {
  const checks: RoleCheck[] = [];

  const { rows: roles } = await db.query<RoleRow>(
    `
    select rolname, rolsuper, rolbypassrls, rolcanlogin, rolinherit
    from pg_roles
    where rolname in ($1, $2, $3, $4)
    order by rolname
  `,
    [APP_GROUP_ROLE, APP_LOGIN_ROLE, SERVICE_GROUP_ROLE, SERVICE_LOGIN_ROLE],
  );

  const byName = new Map(roles.map((r) => [r.rolname, r]));

  // The two group roles are NOLOGIN by design: nothing may connect as them.
  // The two login roles must be able to connect, and must INHERIT, or the
  // privileges granted to their group role never take effect.
  const expectations: Array<{ name: string; mustLogIn: boolean }> = [
    { name: APP_GROUP_ROLE, mustLogIn: false },
    { name: APP_LOGIN_ROLE, mustLogIn: true },
  ];

  for (const { name, mustLogIn } of expectations) {
    const role = byName.get(name);
    if (!role) {
      checks.push({
        name: `${name} exists`,
        passed: false,
        detail: 'role not found; the migrations may not have been applied',
      });
      continue;
    }

    if (role.rolsuper) {
      checks.push({
        name: `${name} is not a superuser`,
        passed: false,
        detail: 'rolsuper = true, which would bypass every restriction',
      });
    }
    if (role.rolbypassrls) {
      checks.push({
        name: `${name} does not bypass RLS`,
        passed: false,
        detail: 'rolbypassrls = true',
      });
    }

    if (mustLogIn) {
      if (!role.rolcanlogin) {
        checks.push({
          name: `${name} can log in`,
          passed: false,
          detail: 'rolcanlogin = false',
        });
      }
      if (!role.rolinherit) {
        checks.push({
          name: `${name} inherits group privileges`,
          passed: false,
          detail: 'rolinherit = false, so the group role grants do not apply',
        });
      }
    } else if (role.rolcanlogin) {
      checks.push({
        name: `${name} cannot log in`,
        passed: false,
        detail: 'rolcanlogin = true; only a member LOGIN role should be reachable',
      });
    }
  }

  // The inverse check. Payroll generation genuinely needs BYPASSRLS, because
  // migration 012 gives application roles no INSERT policy on payroll tables.
  // If this silently became false, payroll generation would start failing at
  // runtime rather than at deployment.
  const service = byName.get(SERVICE_GROUP_ROLE);
  if (!service) {
    checks.push({
      name: `${SERVICE_GROUP_ROLE} exists`,
      passed: false,
      detail: 'role not found; migration 014 has not been applied',
    });
  } else if (!service.rolbypassrls) {
    checks.push({
      name: `${SERVICE_GROUP_ROLE} bypasses RLS`,
      passed: false,
      detail: 'rolbypassrls = false, so payroll generation will fail on insert',
    });
  } else {
    checks.push({
      name: `${SERVICE_GROUP_ROLE} bypasses RLS`,
      passed: true,
      detail: 'required for payroll generation',
    });
  }

  const { rows: memberships } = await db.query<{ member: string; granted: string }>(`
    select mr.rolname as member, g.rolname as granted
    from pg_auth_members m
    join pg_roles mr on mr.oid = m.member
    join pg_roles g on g.oid = m.roleid
    where mr.rolname like 'samjona%'
    order by mr.rolname, g.rolname
  `);

  for (const [login, group] of [
    [APP_LOGIN_ROLE, APP_GROUP_ROLE],
    [SERVICE_LOGIN_ROLE, SERVICE_GROUP_ROLE],
  ] as const) {
    if (!byName.get(login)) continue; // already reported as missing
    const member = memberships.some((m) => m.member === login && m.granted === group);
    checks.push({
      name: `${login} is a member of ${group}`,
      passed: member,
      detail: member ? 'granted' : 'membership missing',
    });
  }

  return checks;
}

export interface TablePolicyCheck {
  table_name: string;
  rls_enabled: boolean;
  rls_forced: boolean;
  app_has_delete: boolean;
}

/** Row Level Security state and DELETE privilege for every public table. */
export async function checkTableSecurity(db: Queryable): Promise<TablePolicyCheck[]> {
  const { rows } = await db.query<TablePolicyCheck>(
    `
    select c.relname                                            as table_name,
           c.relrowsecurity                                     as rls_enabled,
           c.relforcerowsecurity                               as rls_forced,
           has_table_privilege($1, c.oid, 'DELETE')             as app_has_delete
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  `,
    [APP_GROUP_ROLE],
  );

  return rows;
}

export interface ProbeResult {
  /** Rows the statement actually returned, or 0 if it errored. */
  rows: number;
  /** Postgres error code, or null when the statement succeeded. */
  errorCode: string | null;
  errorMessage: string | null;
}

/**
 * Run one statement as the application role, inside a transaction that is
 * always rolled back, and report what happened.
 *
 * This is the difference between reading a policy out of the catalogue and
 * knowing it applies. `pg_policies` can list a policy that does not behave the
 * way the author expected; only an attempted statement settles it.
 */
export async function probeAsAppRole(db: Queryable, sql: string): Promise<ProbeResult> {
  await db.query('begin');
  try {
    await db.query(`set local role ${APP_LOGIN_ROLE}`);
    const result = await db.query(sql);
    return { rows: result.rows.length, errorCode: null, errorMessage: null };
  } catch (err) {
    const error = err as { code?: string; message?: string };
    return {
      rows: 0,
      errorCode: error.code ?? null,
      errorMessage: error.message ?? String(err),
    };
  } finally {
    // `reset role` is attempted separately because it cannot run while the
    // restricted role is active and RLS is in force.
    await db.query('reset role').catch(() => undefined);
    await db.query('rollback').catch(() => undefined);
  }
}

/**
 * A statement that must be refused with insufficient_privilege.
 *
 * `insert into payroll_items default values` is the probe for payroll writes:
 * if the INSERT were genuinely permitted it would fail with a NOT NULL (23502)
 * or foreign key (23503) violation instead, so a pass cannot be produced by
 * unrelated data problems.
 */
export const INSERT_PAYROLL_ITEM_PROBE = 'insert into payroll_items default values';

/** A statement that must be refused; nothing financial is ever removable. */
export const DELETE_EMPLOYEES_PROBE = 'delete from employees';

/** A statement that must return nothing when no user context is set. */
export const READ_BANK_ACCOUNTS_PROBE = 'select account_number from employee_bank_accounts';

/** Counterpart to the above, for proving an empty table was not a false pass. */
export const COUNT_BANK_ACCOUNTS = 'select count(*)::int as n from employee_bank_accounts';
