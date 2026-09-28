/**
 * Verifies that every migration applies cleanly to a real PostgreSQL engine.
 *
 * This is the first test that must pass. If migrations do not apply, nothing
 * else is meaningful.
 */

import { describe, expect, it } from 'vitest';
import { migrationFiles, runMigrations, freshDatabase } from './harness';

describe('database migrations', () => {
  it('applies every migration in order without error', async () => {
    const db = await freshDatabase();
    const results = await runMigrations(db);

    const failures = results.filter((r) => !r.ok);
    if (failures.length > 0) {
      const detail = failures.map((f) => `  ${f.file}: ${f.error}`).join('\n');
      throw new Error(`Migrations failed:\n${detail}`);
    }

    expect(results.length).toBe(migrationFiles().length);
    expect(failures).toHaveLength(0);
  });

  it('creates every table the application depends on', async () => {
    const db = await freshDatabase();
    await runMigrations(db);

    const { rows } = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    const tables = rows.map((r) => r.table_name);

    const expected = [
      'app_users',
      'employees',
      'employee_salary_history',
      'employee_bank_accounts',
      'academic_years',
      'terms',
      'classes',
      'students',
      'guardians',
      'fee_types',
      'fee_structures',
      'student_fee_assignments',
      'fee_payments',
      'fee_adjustments',
      'payroll_periods',
      'payroll_runs',
      'payroll_items',
      'bank_export_templates',
      'expense_categories',
      'expenses',
      'leave_types',
      'leave_requests',
      'audit_logs',
      'settings',
    ];

    for (const table of expected) {
      expect(tables, `missing table ${table}`).toContain(table);
    }
  });

  it('creates the computed views the reports rely on', async () => {
    const db = await freshDatabase();
    await runMigrations(db);

    const { rows } = await db.query<{ table_name: string }>(
      `select table_name from information_schema.views where table_schema = 'public'`,
    );
    const views = rows.map((r) => r.table_name);

    for (const view of [
      'v_student_fee_balances',
      'v_payroll_run_summary',
      'v_employee_current_salary',
      'v_monthly_financial_summary',
      'v_class_fee_outstanding',
    ]) {
      expect(views, `missing view ${view}`).toContain(view);
    }
  });

  it('enables row level security on every table', async () => {
    const db = await freshDatabase();
    await runMigrations(db);

    const { rows } = await db.query<{ tablename: string; rowsecurity: boolean }>(
      `select tablename, rowsecurity from pg_tables where schemaname = 'public'`,
    );

    const unprotected = rows.filter((r) => !r.rowsecurity).map((r) => r.tablename);
    // A table without RLS is readable by any role that has a grant, which
    // would quietly defeat every policy in migration 012.
    expect(unprotected, 'tables missing RLS').toEqual([]);
  });

  it('enables FORCE ROW LEVEL SECURITY so the owner is also subject to policy', async () => {
    const db = await freshDatabase();
    await runMigrations(db);

    // relforcerowsecurity lives on pg_class; pg_tables does not expose it.
    const { rows } = await db.query<{ relname: string; forced: boolean }>(`
      select c.relname, c.relforcerowsecurity as forced
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    `);

    const notForced = rows.filter((r) => !r.forced).map((r) => r.relname);
    // Without FORCE, connecting as the table owner bypasses all policies.
    expect(notForced, 'tables without FORCE RLS').toEqual([]);
  });

  it('grants no DELETE privilege to the application role', async () => {
    const db = await freshDatabase();
    await runMigrations(db);

    const { rows } = await db.query<{ table_name: string; has_delete: boolean }>(`
      select c.relname as table_name,
             has_table_privilege('samjona_app', c.oid, 'DELETE') as has_delete
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    `);

    const withDelete = rows.filter((r) => r.has_delete).map((r) => r.table_name);
    expect(withDelete, 'application role must not be able to DELETE').toEqual([]);
  });

  it('does not give the application role BYPASSRLS', async () => {
    const db = await freshDatabase();
    await runMigrations(db);

    const { rows } = await db.query<{ rolname: string; rolbypassrls: boolean }>(
      `select rolname, rolbypassrls from pg_roles where rolname in ('samjona_app', 'samjona_login')`,
    );

    // Guard against the query silently matching nothing, which would make the
    // assertion below vacuously true. A renamed or dropped role must fail here.
    expect(rows.map((r) => r.rolname)).toContain('samjona_app');

    for (const role of rows) {
      expect(role.rolbypassrls, `${role.rolname} bypasses RLS`).toBe(false);
    }
  });

  it('does not put a login role or a password in version control', async () => {
    const db = await freshDatabase();
    await runMigrations(db);

    // LOGIN roles carry credentials, so they are created by `npm run db:setup`
    // from environment variables. Shipping one inside a migration file would
    // commit a working password to Git. See 001 and 014.
    const { rows } = await db.query<{ rolname: string }>(
      `select rolname from pg_roles where rolcanlogin and rolname like 'samjona%'`,
    );

    expect(
      rows.map((r) => r.rolname),
      'no samjona LOGIN role may be created by a migration',
    ).toEqual([]);
  });

  it('grants the service role the BYPASSRLS attribute', async () => {
    const db = await freshDatabase();
    await runMigrations(db);

    // The inverse check: payroll generation genuinely needs to bypass RLS,
    // because 012 intentionally gives application roles no INSERT policy on
    // payroll tables. If this ever silently became false, payroll generation
    // would start failing at runtime with a permission error.
    const { rows } = await db.query<{ rolname: string; rolbypassrls: boolean }>(
      `select rolname, rolbypassrls from pg_roles where rolname = 'samjona_service'`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.rolbypassrls, 'payroll generation role must bypass RLS').toBe(true);
  });

  it('lets the service role read bank export templates', async () => {
    const db = await freshDatabase();
    await runMigrations(db);

    // Live-only bug (never visible in unit tests because the portal layer
    // cannot run against PGlite): exportPayrollRun reads the active
    // bank_export_templates row inside withServiceContext, but migration 014
    // did not grant samjona_service SELECT on that table. BYPASSRLS skips
    // RLS policies but NOT table-level privileges, so the export failed with
    // 42501 - surfaced to the Proprietor as a confusing 403 even though the
    // payroll:export permission check had passed.
    await db.exec('set role samjona_service');
    const { rows } = await db.query<{ n: string }>(
      'select count(*) as n from bank_export_templates',
    );

    expect(rows, 'service role must be able to read bank export templates').toHaveLength(1);
  });
});
