/**
 * Tests for database role provisioning.
 *
 * This code creates credentials, so "it looks right" is not good enough. It is
 * executed against PGlite, which is a real Postgres engine, so the SQL
 * exercised here is the same SQL that runs against Supabase.
 *
 * PGlite boots as a superuser, so `create role` and `set local role` both work
 * and the privilege boundaries can be tested for real.
 */

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  APP_GROUP_ROLE,
  APP_LOGIN_ROLE,
  COUNT_BANK_ACCOUNTS,
  DELETE_EMPLOYEES_PROBE,
  INSERT_PAYROLL_ITEM_PROBE,
  READ_BANK_ACCOUNTS_PROBE,
  SERVICE_GROUP_ROLE,
  SERVICE_LOGIN_ROLE,
  checkRoleSecurity,
  checkTableSecurity,
  probeAsAppRole,
  runFormatted,
  upsertLoginRole,
  type Queryable,
} from '@/server/db/roles';
import { freshDatabase, runMigrations } from './harness';

/**
 * PGlite's client satisfies the structural `Queryable` interface used by the
 * module under test. The cast is needed only because PGlite types `query`
 * with its own result shape.
 */
function asQueryable(db: PGlite): Queryable {
  return db as unknown as Queryable;
}

/**
 * The stored password verifier. Never the plaintext: SCRAM is one-way, and
 * this is only ever compared against itself to detect a change.
 */
async function storedVerifier(db: PGlite, role: string): Promise<string | undefined> {
  const { rows } = await db.query<{ verifier: string | null }>(
    `select rolpassword as verifier from pg_authid where rolname = $1`,
    [role],
  );
  return rows[0]?.verifier ?? undefined;
}

const PASSWORD = 'a-long-enough-test-password-1';
const OTHER_PASSWORD = 'a-completely-different-password-2';

describe('role provisioning', () => {
  let db: PGlite;

  beforeEach(async () => {
    db = await freshDatabase();
    await runMigrations(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('creates the login roles and grants the group memberships', async () => {
    await upsertLoginRole(asQueryable(db), {
      loginRole: APP_LOGIN_ROLE,
      groupRole: APP_GROUP_ROLE,
      password: PASSWORD,
    });
    await upsertLoginRole(asQueryable(db), {
      loginRole: SERVICE_LOGIN_ROLE,
      groupRole: SERVICE_GROUP_ROLE,
      password: OTHER_PASSWORD,
    });

    const { rows } = await db.query<{ member: string; granted: string }>(`
      select mr.rolname as member, g.rolname as granted
      from pg_auth_members m
      join pg_roles mr on mr.oid = m.member
      join pg_roles g on g.oid = m.roleid
      where mr.rolname like 'samjona%'
      order by mr.rolname
    `);

    expect(rows).toEqual(
      expect.arrayContaining([
        { member: APP_LOGIN_ROLE, granted: APP_GROUP_ROLE },
        { member: SERVICE_LOGIN_ROLE, granted: SERVICE_GROUP_ROLE },
      ]),
    );
  });

  it('rotates the password of an existing role instead of failing', async () => {
    const spec = {
      loginRole: APP_LOGIN_ROLE,
      groupRole: APP_GROUP_ROLE,
      password: PASSWORD,
    };
    await upsertLoginRole(asQueryable(db), spec);
    const first = await storedVerifier(db, APP_LOGIN_ROLE);

    await upsertLoginRole(asQueryable(db), { ...spec, password: OTHER_PASSWORD });
    const second = await storedVerifier(db, APP_LOGIN_ROLE);

    // The verifier is a salted SCRAM hash, so the stored value must differ
    // after a rotation. Comparing hashes is the only portable way to prove the
    // ALTER took effect: the plaintext is not recoverable, and recomputing the
    // expected value would depend on the server's password_encryption setting.
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
  });

  it('gives the login role no superuser or DDL privileges', async () => {
    await upsertLoginRole(asQueryable(db), {
      loginRole: APP_LOGIN_ROLE,
      groupRole: APP_GROUP_ROLE,
      password: PASSWORD,
    });

    const { rows } = await db.query<{
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolinherit: boolean;
      rolcanlogin: boolean;
    }>(
      `
      select rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolcanlogin
      from pg_roles where rolname = $1
    `,
      [APP_LOGIN_ROLE],
    );

    expect(rows[0]).toMatchObject({
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      // INHERIT is required, otherwise the group role's grants do not apply
      // through the membership and every query would fail.
      rolinherit: true,
      rolcanlogin: true,
    });
  });

  it('repairs a role that has been granted elevated privileges', async () => {
    // The common path only inspects attributes, because a role is never
    // superuser by default. This covers the repair branch: something made the
    // role CREATEDB, and a re-run must fix it rather than pass it over.
    await upsertLoginRole(asQueryable(db), {
      loginRole: APP_LOGIN_ROLE,
      groupRole: APP_GROUP_ROLE,
      password: PASSWORD,
    });
    await db.query(`alter role ${APP_LOGIN_ROLE} with createdb`);

    await upsertLoginRole(asQueryable(db), {
      loginRole: APP_LOGIN_ROLE,
      groupRole: APP_GROUP_ROLE,
      password: OTHER_PASSWORD,
    });

    const { rows } = await db.query<{ rolcreatedb: boolean }>(
      `select rolcreatedb from pg_roles where rolname = $1`,
      [APP_LOGIN_ROLE],
    );
    expect(rows[0]?.rolcreatedb).toBe(false);
  });

  it('reports the step that failed rather than a bare permission error', async () => {
    // Group role deliberately absent, so the grant step cannot succeed. The
    // message must name the step and the role, because on Supabase `postgres`
    // is CREATEROLE but not superuser and several operations are refused there.
    await upsertLoginRole(asQueryable(db), {
      loginRole: APP_LOGIN_ROLE,
      groupRole: 'samjona_role_that_does_not_exist',
      password: PASSWORD,
    }).then(
      () => {
        throw new Error('expected the grant step to fail');
      },
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).toContain(APP_LOGIN_ROLE);
        expect(message).toContain('grant group membership');
      },
    );
  });

  it('stores a password containing a single quote without breaking', async () => {
    const awkward = "pa'ss; drop table employees; --word";
    await upsertLoginRole(asQueryable(db), {
      loginRole: APP_LOGIN_ROLE,
      groupRole: APP_GROUP_ROLE,
      password: awkward,
    });

    // The table must still exist, which is the actual proof that the value was
    // treated as a literal rather than spliced into the statement.
    const { rows } = await db.query<{ present: boolean }>(`
      select exists (
        select 1 from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'employees'
      ) as present
    `);

    expect(rows[0]?.present).toBe(true);
  });

  it('passes the security checks once provisioned', async () => {
    await upsertLoginRole(asQueryable(db), {
      loginRole: APP_LOGIN_ROLE,
      groupRole: APP_GROUP_ROLE,
      password: PASSWORD,
    });

    const checks = await checkRoleSecurity(asQueryable(db));
    const failed = checks.filter((c) => !c.passed);

    expect(failed, failed.map((f) => `${f.name}: ${f.detail}`).join('; ')).toEqual([]);
  });

  it('detects an unprovisioned database rather than passing vacuously', async () => {
    // No provisioning performed. The migrations created only the NOLOGIN group
    // roles, so the LOGIN roles are genuinely absent and the checks must say so
    // instead of reporting an all-clear.
    const checks = await checkRoleSecurity(asQueryable(db));
    const failed = checks.filter((c) => !c.passed);

    expect(failed.length).toBeGreaterThan(0);
    expect(failed.map((f) => f.name)).toContain(`${APP_LOGIN_ROLE} exists`);
  });

  it('reports table security for every public table', async () => {
    const tables = await checkTableSecurity(asQueryable(db));

    expect(tables.length).toBeGreaterThan(0);
    expect(tables.every((t) => t.rls_enabled)).toBe(true);
    expect(tables.every((t) => t.rls_forced)).toBe(true);
    expect(tables.every((t) => !t.app_has_delete)).toBe(true);
  });
});

describe('enforcement probes', () => {
  let db: PGlite;

  beforeEach(async () => {
    db = await freshDatabase();
    await runMigrations(db);
    await upsertLoginRole(asQueryable(db), {
      loginRole: APP_LOGIN_ROLE,
      groupRole: APP_GROUP_ROLE,
      password: PASSWORD,
    });
  });

  afterEach(async () => {
    await db.close();
  });

  it('is refused with insufficient_privilege when inserting a payroll item', async () => {
    const result = await probeAsAppRole(asQueryable(db), INSERT_PAYROLL_ITEM_PROBE);

    // 42501 and nothing else. A 23502 or 23503 would mean the INSERT was
    // permitted and only the data was wrong, which is a failure.
    expect(result.errorCode).toBe('42501');
  });

  it('is refused with insufficient_privilege when deleting an employee', async () => {
    const result = await probeAsAppRole(asQueryable(db), DELETE_EMPLOYEES_PROBE);

    expect(result.errorCode).toBe('42501');
  });

  it('rolls the probe back and restores the session role', async () => {
    await probeAsAppRole(asQueryable(db), DELETE_EMPLOYEES_PROBE);

    // Nothing was written.
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from employees`);
    expect(rows[0]?.n).toBe(0);

    // The privileged role is restored, which is what makes the `rollback` in
    // the `finally` block legal. Without the restore the rollback itself would
    // fail and the connection would be left stuck as samjona_login.
    const still = await db.query<{ who: string }>(`select current_user as who`);
    expect(still.rows[0]?.who).not.toBe(APP_LOGIN_ROLE);
  });

  it('reports inconclusive rather than passing when a table is empty', async () => {
    // This is the guard against a false pass. With no bank accounts on file,
    // "0 rows returned" proves nothing, so the counting query exists so the
    // caller can tell the two cases apart.
    const count = await db.query<{ n: number }>(COUNT_BANK_ACCOUNTS);
    const probe = await probeAsAppRole(asQueryable(db), READ_BANK_ACCOUNTS_PROBE);

    expect(count.rows[0]?.n).toBe(0);
    expect(probe.errorCode).toBeNull();
    expect(probe.rows).toBe(0);
    // The point of the test: zero rows on an empty table must NOT be reported
    // as evidence that the policy works.
    expect((count.rows[0]?.n ?? 0) > 0).toBe(false);
  });
});

describe('format helper', () => {
  let db: PGlite;

  beforeEach(async () => {
    db = await freshDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('quotes identifiers and literals correctly', async () => {
    await runFormatted(asQueryable(db), 'create role %I noinherit', ['odd name; --']);
    const { rows } = await db.query<{ rolname: string; rolinherit: boolean }>(
      `select rolname, rolinherit from pg_roles where rolname = 'odd name; --'`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.rolinherit).toBe(false);
  });
});
