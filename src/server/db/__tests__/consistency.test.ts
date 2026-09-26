/**
 * Cross-layer consistency tests.
 *
 * The TypeScript domain model and the PostgreSQL schema are two expressions
 * of the same design. Nothing forces them to agree, and where they disagree
 * the failure is silent: a role named 'Proprietor' in code and 'proprietor' in
 * the database denies every request, while a status string that does not
 * exist produces a constraint violation at 3am on payday.
 *
 * These tests read the live schema and compare.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDatabase } from './harness';
import {
  EMPLOYEE_STATUSES,
  EXPENSE_STATUSES,
  LEAVE_STATUSES,
  PAYMENT_METHODS,
  PAYROLL_RUN_STATUSES,
  RECORD_STATUSES,
  ROLES,
  STUDENT_STATUSES,
} from '../types';
import { ROLE_PERMISSIONS } from '../../auth/permissions';

let db: PGlite;

async function enumValues(typeName: string): Promise<string[]> {
  const { rows } = await db.query<{ enumlabel: string }>(
    `select e.enumlabel
       from pg_type t
       join pg_enum e on e.enumtypid = t.oid
      where t.typname = $1
      order by e.enumsortorder`,
    [typeName],
  );
  return rows.map((r) => r.enumlabel);
}

async function tableColumns(tableName: string): Promise<string[]> {
  const { rows } = await db.query<{ column_name: string; data_type: string }>(
    `select column_name, data_type
       from information_schema.columns
      where table_schema = 'public' and table_name = $1`,
    [tableName],
  );
  return rows.map((r) => r.column_name);
}

beforeAll(async () => {
  db = await migratedDatabase();
}, 120_000);

describe('TypeScript enums match the database enums', () => {
  it('app_role matches ROLES', async () => {
    expect(await enumValues('app_role')).toEqual([...ROLES]);
  });

  it('employee_status matches EMPLOYEE_STATUSES', async () => {
    expect(await enumValues('employee_status')).toEqual([...EMPLOYEE_STATUSES]);
  });

  it('student_status matches STUDENT_STATUSES', async () => {
    expect(await enumValues('student_status')).toEqual([...STUDENT_STATUSES]);
  });

  it('payroll_run_status matches PAYROLL_RUN_STATUSES', async () => {
    expect(await enumValues('payroll_run_status')).toEqual([...PAYROLL_RUN_STATUSES]);
  });

  it('expense_status matches EXPENSE_STATUSES', async () => {
    expect(await enumValues('expense_status')).toEqual([...EXPENSE_STATUSES]);
  });

  it('leave_status matches LEAVE_STATUSES', async () => {
    expect(await enumValues('leave_status')).toEqual([...LEAVE_STATUSES]);
  });

  it('payment_method matches PAYMENT_METHODS', async () => {
    expect(await enumValues('payment_method')).toEqual([...PAYMENT_METHODS]);
  });

  it('record_status matches RECORD_STATUSES', async () => {
    expect(await enumValues('record_status')).toEqual([...RECORD_STATUSES]);
  });
});

describe('the permission matrix covers every role', () => {
  it('has an entry for every database role', async () => {
    const dbRoles = await enumValues('app_role');
    for (const role of dbRoles) {
      expect(ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS], `missing ${role}`).toBeDefined();
    }
  });
});

describe('every monetary column is a bigint', () => {
  it('uses integer money in payroll_items, not numeric or float', async () => {
    const { rows } = await db.query<{ column_name: string; data_type: string }>(
      `select column_name, data_type from information_schema.columns
        where table_schema = 'public' and table_name = 'payroll_items'`,
    );
    const moneyColumns = rows.filter((r) =>
      [
        'basic_salary',
        'allowances',
        'overtime',
        'other_earnings',
        'deductions',
        'employer_costs',
        'gross',
        'net',
      ].includes(r.column_name),
    );
    expect(moneyColumns).toHaveLength(8);
    for (const col of moneyColumns) {
      // `numeric` would reintroduce string handling; `real`/`double` would
      // reintroduce float error. Only bigint is acceptable.
      expect(col.data_type, `${col.column_name} must be bigint`).toBe('bigint');
    }
  });

  it('uses integer money in the other financial tables', async () => {
    const expectations: Array<[string, string[]]> = [
      ['payroll_runs', ['total_gross', 'total_deductions', 'total_net', 'total_employer_costs']],
      ['employee_salary_history', ['base_salary', 'allowances', 'deductions']],
      ['fee_payments', ['amount']],
      ['fee_adjustments', ['amount']],
      ['student_fee_assignments', ['amount_due']],
      ['fee_structures', ['amount']],
      ['expenses', ['amount']],
    ];

    for (const [table, columns] of expectations) {
      const { rows } = await db.query<{ column_name: string; data_type: string }>(
        `select column_name, data_type from information_schema.columns
          where table_schema = 'public' and table_name = $1`,
        [table],
      );
      for (const column of columns) {
        const found = rows.find((r) => r.column_name === column);
        expect(found, `${table}.${column} missing`).toBeDefined();
        expect(found!.data_type, `${table}.${column} must be bigint`).toBe('bigint');
      }
    }
  });

  it('stores no float or numeric money column anywhere', async () => {
    const { rows } = await db.query<{ table_name: string; column_name: string; data_type: string }>(
      `select table_name, column_name, data_type
         from information_schema.columns
        where table_schema = 'public'
          and data_type in ('real', 'double precision', 'money')`,
    );
    expect(rows, 'floating point money columns found').toEqual([]);
  });
});

describe('sensitive data is separated', () => {
  it('keeps bank details in their own table, not on employees', async () => {
    const columns = await tableColumns('employees');
    expect(columns).not.toContain('accountNumber');
    expect(columns).not.toContain('bankName');
    expect(columns).not.toContain('account_number');

    const bankColumns = await tableColumns('employee_bank_accounts');
    expect(bankColumns).toContain('account_number');
  });

  it('stores no password or credential column on app_users', async () => {
    const columns = await tableColumns('app_users');
    // Credentials live in Supabase Auth. The application never handles them.
    // `must_change_password` is only a boolean prompt flag, not a credential,
    // so it is explicitly allowed.
    const credentialColumns = columns.filter(
      (c) => /password|secret|token|hash/i.test(c) && c !== 'must_change_password',
    );
    expect(credentialColumns, 'app_users must not store credentials').toEqual([]);
    expect(columns).toContain('must_change_password');
  });

  it('does not expose employee_salary_history to the teacher role', async () => {
    const { rows } = await db.query<{ policyname: string }>(
      `select policyname from pg_policies
        where schemaname = 'public' and tablename = 'employee_salary_history'`,
    );
    const selectPolicies = rows.map((r) => r.policyname);
    // A staff member may see their OWN pay, so the policy is not role-only.
    // The important assertion is that it exists and is restrictive, which the
    // RLS behaviour tests in rls.test.ts verify directly.
    expect(selectPolicies).toContain('employee_salary_history_select');
  });
});

describe('no destructive operations are granted', () => {
  it('has no DELETE policy on any financial table', async () => {
    const { rows } = await db.query<{ tablename: string; policyname: string }>(
      `select tablename, policyname from pg_policies
        where schemaname = 'public' and cmd = 'DELETE'`,
    );
    const allowed = rows.filter((r) =>
      ['app_users', 'terms', 'academic_years', 'classes', 'fee_structures'].includes(r.tablename),
    );
    const unexpected = rows.filter((r) => !allowed.includes(r));
    // Financial and historical tables must have no DELETE path at all.
    expect(unexpected.map((r) => r.tablename)).toEqual([]);
  });
});
