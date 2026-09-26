/**
 * Policy precision and function hardening tests (migration 016).
 *
 * The point of migration 016 was to remove an ACCIDENTAL grant without changing
 * any real behaviour. That is exactly the kind of change that looks safe and is
 * not, so these tests assert both halves:
 *
 *   - the accidental grant is gone (no `for all` policy remains)
 *   - every permission that was actually intended still works
 *
 * Testing only the first would pass even if the split had quietly revoked all
 * writes. Testing only the second would have passed before the migration, which
 * is the whole problem.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDatabase } from './harness';

let db: PGlite;

const PROPRIETOR = 'aaaa1111-1111-4111-8111-aaaaaaaaaaaa';
const TEACHER = 'aaaa2222-2222-4222-8222-aaaaaaaaaaaa';
let CLASS_ID = '';

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function run(
  sql: string,
  role: string,
  userId: string,
  params: unknown[] = [],
): Promise<{ ok: true; rows: unknown[] } | { ok: false; code: string }> {
  await db.exec('begin');
  try {
    await db.exec('set local role samjona_app');
    await db.exec(`set local app.user_role = ${quote(role)}`);
    await db.exec(`set local app.user_id = ${quote(userId)}`);
    const { rows } = await db.query(sql, params);
    await db.exec('commit');
    return { ok: true, rows };
  } catch (err) {
    await db.exec('rollback');
    return { ok: false, code: (err as { code?: string }).code ?? 'unknown' };
  }
}

beforeAll(async () => {
  db = await migratedDatabase();

  for (const [id, name, role] of [
    [PROPRIETOR, 'Proprietor', 'proprietor'],
    [TEACHER, 'Teacher', 'teacher'],
  ] as const) {
    await db.query('insert into auth.users (id, email) values ($1,$2)', [
      id,
      `${name}@example.test`,
    ]);
    await db.query('insert into app_users (id, username, full_name, role) values ($1,$2,$3,$4)', [
      id,
      name.toLowerCase(),
      name,
      role,
    ]);
  }

  const { rows: yearRows } = await db.query<{ id: string }>(
    'select id from academic_years where is_current limit 1',
  );
  const { rows } = await db.query<{ id: string }>(
    `insert into classes (class_code, name, academic_year_id)
     values ('CLS-016', 'Policy Test Class', $1) returning id`,
    [yearRows[0]!.id],
  );
  CLASS_ID = rows[0]!.id;
});

describe('no policy implicitly grants read through a write policy', () => {
  it('leaves no FOR ALL policy in the public schema', async () => {
    const { rows } = await db.query<{ tablename: string; policyname: string }>(`
      select tablename, policyname
      from pg_policies
      where schemaname = 'public' and cmd = 'ALL'
    `);

    expect(
      rows.map((r) => `${r.tablename}.${r.policyname}`),
      'FOR ALL also covers SELECT, which silently widens who can read',
    ).toEqual([]);
  });

  it('grants no table a read path except through an explicit SELECT policy', async () => {
    // Belt and braces: even if a FOR ALL policy reappeared, this fails too,
    // because it reasons about commands per table rather than policy text.
    const { rows } = await db.query<{ tablename: string }>(`
      select distinct tablename
      from pg_policies
      where schemaname = 'public' and cmd = 'ALL'
    `);
    expect(rows).toEqual([]);
  });

  it('leaves every granted table with a SELECT policy', async () => {
    // Regression guard. An earlier draft of migration 016 split `for all` into
    // INSERT and UPDATE without carrying the read access across, which left
    // `student_fee_assignments` with no SELECT policy at all. Nothing errored;
    // v_student_fee_balances just quietly returned nothing to the bursar.
    //
    // The symptom was found by a test elsewhere, not by a failure here, which
    // is why it is asserted directly.
    const { rows } = await db.query<{ tablename: string }>(`
      select t.tablename
      from pg_tables t
      where t.schemaname = 'public'
        and not exists (
          select 1 from pg_policies p
          where p.schemaname = 'public' and p.tablename = t.tablename and p.cmd = 'SELECT'
        )
      order by t.tablename
    `);

    expect(
      rows.map((r) => r.tablename),
      'a table with no SELECT policy is unreadable, which looks like empty data rather than an error',
    ).toEqual([]);
  });

  it('keeps student fee assignments readable by the bursar', async () => {
    // The specific table that regressed, asserted against the policy itself,
    // because a SELECT policy can exist and still be written for the wrong
    // roles. The end-to-end version of this check lives in views.test.ts, which
    // reads v_student_fee_balances as a bursar.
    const { rows } = await db.query<{ qual: string }>(`
      select qual
      from pg_policies
      where schemaname = 'public'
        and tablename = 'student_fee_assignments'
        and cmd = 'SELECT'
    `);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.qual).toContain("'bursar'::app_role");
  });
});

describe('intended permissions survived the split', () => {
  it('still lets a teacher read classes', async () => {
    const result = await run('select class_code from classes', 'teacher', TEACHER);
    expect(result.ok).toBe(true);
    expect((result as { rows: unknown[] }).rows.length).toBeGreaterThan(0);
  });

  it('still lets a proprietor insert a class', async () => {
    const result = await run(
      `insert into classes (class_code, name, academic_year_id)
       select 'CLS-016-INS', 'Inserted', academic_year_id from classes where id = $1`,
      'proprietor',
      PROPRIETOR,
      [CLASS_ID],
    );
    expect(result.ok).toBe(true);
  });

  it('still refuses a teacher inserting a class', async () => {
    const result = await run(
      `insert into classes (class_code, name, academic_year_id)
       select 'CLS-016-TEA', 'Nope', academic_year_id from classes where id = $1`,
      'teacher',
      TEACHER,
      [CLASS_ID],
    );
    expect(result.ok).toBe(false);
    expect((result as { code: string }).code).toBe('42501');
  });

  it('still refuses a teacher updating a class', async () => {
    // Subtle and worth stating: an UPDATE blocked by a USING clause does NOT
    // raise. The row is simply not visible, so the statement matches nothing
    // and reports "UPDATE 0". Only a WITH CHECK violation errors.
    //
    // So the denial has to be asserted on rows returned, not on an exception.
    // Asserting `rejects.toThrow()` here would pass even if the policy were
    // wide open, because a permitted update also succeeds.
    const result = await run(
      `update classes set name = 'Renamed By Teacher' where id = $1 returning id`,
      'teacher',
      TEACHER,
      [CLASS_ID],
    );

    expect(result.ok).toBe(true);
    expect((result as { rows: unknown[] }).rows).toEqual([]);

    // And the row is genuinely untouched, confirmed as the proprietor who can
    // read it.
    const check = await run(`select name from classes where id = $1`, 'proprietor', PROPRIETOR, [
      CLASS_ID,
    ]);
    expect((check as { rows: Array<{ name: string }> }).rows[0]!.name).toBe('Policy Test Class');
  });

  it('still lets a proprietor update a class', async () => {
    const result = await run(
      `update classes set name = 'Renamed' where id = $1 returning id`,
      'proprietor',
      PROPRIETOR,
      [CLASS_ID],
    );
    expect(result.ok).toBe(true);
    expect((result as { rows: unknown[] }).rows).toHaveLength(1);
  });

  it('grants no DELETE on any table, before or after', async () => {
    const { rows } = await db.query<{ table_name: string }>(`
      select table_name
      from information_schema.role_table_grants
      where grantee = 'samjona_app' and privilege_type = 'DELETE'
    `);
    expect(rows).toEqual([]);
  });
});

describe('functions this project owns pin their search_path', () => {
  it('leaves no app_* function with a mutable search_path', async () => {
    const { rows } = await db.query<{ proname: string; search_path: string | null }>(`
      select p.proname,
             (select c from unnest(coalesce(p.proconfig, '{}')) c
               where c like 'search_path=%') as search_path
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and left(p.proname, 4) = 'app_'
    `);

    expect(rows.length).toBeGreaterThan(0);
    const unpinned = rows.filter((r) => r.search_path === null).map((r) => r.proname);
    expect(
      unpinned,
      'a SECURITY INVOKER function may be promoted to SECURITY DEFINER later, ' +
        'at which point a mutable search_path becomes a real escalation path',
    ).toEqual([]);
  });

  it('lists pg_temp last so a temp object cannot shadow a real one', async () => {
    const { rows } = await db.query<{ proname: string; search_path: string | null }>(`
      select p.proname,
             (select c from unnest(coalesce(p.proconfig, '{}')) c
               where c like 'search_path=%') as search_path
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and left(p.proname, 4) = 'app_'
    `);

    for (const r of rows) {
      expect(r.search_path, r.proname).toBe('search_path=public, pg_temp');
    }
  });

  it('leaves no SECURITY DEFINER function in public without a search_path', async () => {
    // The version of this check that actually matters, independent of which
    // functions exist: the exploitable case must be empty.
    const { rows } = await db.query<{ proname: string }>(`
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef
        and not exists (
          select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'
        )
    `);
    expect(rows.map((r) => r.proname)).toEqual([]);
  });
});
