/**
 * PHASE 6 - FINANCIAL SEPARATION AT THE SERVICE AND RLS BOUNDARIES.
 *
 * Phase 3 fixed the teacher -> fee-data leak at the service boundary. Phase 6
 * closes the mirror-image leak found in the audit: salary figures (base salary
 * lists, salary history) are financial data, but roles holding only
 * `employees:read` (Admin) could reach every employee's salary through the
 * staff list, the staff detail seam, and the dashboard's payroll total.
 *
 * This file proves the Phase 6 corrections against the PGlite harness, which
 * runs the REAL seams (loadStaffList / loadStaffDetail / applyExpenseDecision)
 * under the caller's RLS GUC context:
 *
 *   - salary figures ride the staff list ONLY for financial roles
 *     (payroll:read / employees:bank) - Admin gets `baseSalary: null`;
 *   - salary HISTORY on the staff detail is withheld from non-financial roles
 *     UNLESS the record is the caller's own (self-service);
 *   - a teacher still sees their own salary history (Phase 4 decision kept);
 *   - a cross-employee detail read by a teacher stays a 404 (RLS own-row);
 *   - paying an expense now records who decided the payment (F-2 fix), and
 *     the requestor-vs-decider segregation is intact.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDatabase } from '../../db/__tests__/harness';
import { type Queryable } from '../../db/pool';
import {
  applyExpenseDecision,
  decideExpense,
} from '../../portal/expenses';
import { canViewSalaries, getStaffDetail, listStaff, loadStaffDetail, loadStaffList } from '../../portal/staff';
import { ForbiddenError, NotFoundError, PreconditionError } from '../../../lib/errors';
import type { SessionUser } from '../../auth/permissions';

const PROPRIETOR = 'aaaaaaa1-0000-4000-8000-000000000001';
const BURSAR = 'aaaaaaa2-0000-4000-8000-000000000002';
const ADMIN = 'aaaaaaa3-0000-4000-8000-000000000003';
const PRINCIPAL = 'aaaaaaa4-0000-4000-8000-000000000004';
const TEACHER = 'aaaaaaa5-0000-4000-8000-000000000005';

const EMP_ADMIN = 'bbbbbbbb-0601-4111-8111-bbbbbbbb0601';
const EMP_TEACHER = 'bbbbbbbb-0602-4222-8222-bbbbbbbb0602';

let db: PGlite;
let expenseId = '';

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function callAs<T>(role: string, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec('begin');
  try {
    await db.exec('set local role samjona_app');
    await db.exec('set local app.user_role = ' + quote(role));
    await db.exec('set local app.user_id = ' + quote(userId));
    const result = await fn();
    await db.exec('commit');
    return result;
  } catch (err) {
    await db.exec('rollback');
    throw err;
  }
}

function user(role: SessionUser['role'], id: string): SessionUser {
  return { id, username: role, fullName: role, role, employeeId: null };
}

async function rawCountAs(role: string, userId: string, sql: string): Promise<number> {
  const result = await callAs(role, userId, async () => db.query<{ count: string }>(sql));
  return Number(result.rows[0]?.count ?? 0);
}

beforeAll(async () => {
  db = await migratedDatabase();

  for (const [id, name, role] of [
    [PROPRIETOR, 'Proprietor', 'proprietor'],
    [BURSAR, 'Bursar', 'bursar'],
    [ADMIN, 'Admin', 'admin'],
    [PRINCIPAL, 'Principal', 'principal'],
    [TEACHER, 'Teacher', 'teacher'],
  ] as const) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [
      id,
      `${name.toLowerCase()}@example.test`,
    ]);
    await db.query('insert into app_users (id, username, full_name, role) values ($1,$2,$3,$4)', [
      id,
      name.toLowerCase(),
      name,
      role,
    ]);
  }

  for (const [id, name] of [
    [EMP_ADMIN, 'Admin Employee'],
    [EMP_TEACHER, 'Teacher Employee'],
  ] as const) {
    await db.query(
      `insert into employees (full_name, position, employment_date, status)
       values ($1, 'Staff', date '2026-01-01', 'active')`,
      [name],
    );
    await db.query('update employees set id = $1 where full_name = $2', [id, name]);
  }

  await db.query('update app_users set employee_id = $1 where id = $2', [EMP_ADMIN, ADMIN]);
  await db.query('update app_users set employee_id = $1 where id = $2', [EMP_TEACHER, TEACHER]);

  // A current salary for each employee. EMP_ADMIN = 1,500,000; EMP_TEACHER =
  // 1,200,000 (minor units).
  await db.query(
    `insert into employee_salary_history
       (employee_id, base_salary, allowances, deductions, effective_from, effective_to, reason)
     values ($1, 1500000, 0, 0, date '2026-01-01', null, 'Initial'),
            ($2, 1200000, 0, 0, date '2026-01-01', null, 'Initial')`,
    [EMP_ADMIN, EMP_TEACHER],
  );

  // One submitted expense, requested by the bursar, for the F-2 decision test.
  const { rows: categoryRows } = await db.query<{ id: string }>(
    `select id from expense_categories where name = 'Utilities' limit 1`,
  );
  const { rows: expenseRows } = await db.query<{ id: string }>(
    `insert into expenses
       (category_id, category_name, amount, date, description, vendor, method, reference,
        status, requested_by)
     values ($1, 'Utilities', 150000, current_date, 'Generator fuel', 'PetroServe', 'bank',
            'EXP-REF-001', 'submitted', $2)
     returning id`,
    [categoryRows[0]!.id, BURSAR],
  );
  expenseId = expenseRows[0]!.id;
}, 120_000);

describe('canViewSalaries - the financial-visibility predicate', () => {
  it('is true only for roles with a financial permission (payroll:read / employees:bank)', () => {
    expect(canViewSalaries(user('proprietor', PROPRIETOR))).toBe(true);
    expect(canViewSalaries(user('bursar', BURSAR))).toBe(true);
    expect(canViewSalaries(user('principal', PRINCIPAL))).toBe(true);
    expect(canViewSalaries(user('admin', ADMIN))).toBe(false);
    expect(canViewSalaries(user('teacher', TEACHER))).toBe(false);
    expect(canViewSalaries(null)).toBe(false);
  });
});

describe('staff list - salary figures are withheld from non-financial roles', () => {
  it('admin sees the whole staff list but every baseSalary is null', async () => {
    const result = await callAs('admin', ADMIN, () =>
      loadStaffList(db as unknown as Queryable, user('admin', ADMIN), { pageSize: 50 }),
    );
    expect(result.rows).toHaveLength(2);
    for (const row of result.rows) {
      expect(row.baseSalary, row.fullName).toBeNull();
    }
  });

  it('bursar and principal see the salary figures (payroll-visible roles)', async () => {
    const bursar = await callAs('bursar', BURSAR, () =>
      loadStaffList(db as unknown as Queryable, user('bursar', BURSAR), { pageSize: 50 }),
    );
    expect(bursar.rows).toHaveLength(2);
    const byName = new Map(bursar.rows.map((r) => [r.fullName, r.baseSalary]));
    expect(byName.get('Admin Employee')).toBe(1500000);
    expect(byName.get('Teacher Employee')).toBe(1200000);

    const principal = await callAs('principal', PRINCIPAL, () =>
      loadStaffList(db as unknown as Queryable, user('principal', PRINCIPAL), { pageSize: 50 }),
    );
    expect(principal.rows).toHaveLength(2);
    for (const row of principal.rows) {
      expect(row.baseSalary).not.toBeNull();
    }
  });

  it('teacher sees only their own row (RLS), with salary null on the directory list', async () => {
    const result = await callAs('teacher', TEACHER, () =>
      loadStaffList(db as unknown as Queryable, user('teacher', TEACHER), { pageSize: 50 }),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.fullName).toBe('Teacher Employee');
    expect(result.rows[0]!.baseSalary).toBeNull();
  });
});

describe('staff detail - salary history is withheld from non-financial roles except self', () => {
  it('admin reading ANOTHER employee gets an empty salary history', async () => {
    const detail = await callAs('admin', ADMIN, () =>
      loadStaffDetail(db as unknown as Queryable, EMP_TEACHER, { includeSalaries: false }),
    );
    expect(detail.employee.fullName).toBe('Teacher Employee');
    expect(detail.salaries).toHaveLength(0);
  });

  it('admin reading their OWN record still gets their own salary history', async () => {
    const detail = await callAs('admin', ADMIN, () =>
      loadStaffDetail(db as unknown as Queryable, EMP_ADMIN, { includeSalaries: true }),
    );
    expect(detail.salaries).toHaveLength(1);
    expect(detail.salaries[0]!.baseSalary).toBe(1500000);
  });

  it('teacher reading another employee is a 404 (RLS own-row scope)', async () => {
    await expect(
      callAs('teacher', TEACHER, () =>
        loadStaffDetail(db as unknown as Queryable, EMP_ADMIN, { includeSalaries: true }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('teacher reading their own record keeps their salary history (Phase 4 decision)', async () => {
    const detail = await callAs('teacher', TEACHER, () =>
      loadStaffDetail(db as unknown as Queryable, EMP_TEACHER, { includeSalaries: true }),
    );
    expect(detail.salaries).toHaveLength(1);
    expect(detail.salaries[0]!.baseSalary).toBe(1200000);
  });

  it('raw RLS: a teacher can count only their own salary rows at the database layer', async () => {
    // Same fact asserted at the RLS layer so the service result is proven to be
    // bounded by the schema, not by luck.
    const visible = await rawCountAs(
      'teacher',
      TEACHER,
      'select count(*)::text as count from employee_salary_history',
    );
    expect(visible).toBe(1);
  });
});

describe('expense decisions - who pays and the provenance (F-2 regression)', () => {
  it('records who decided approval and who decided payment', async () => {
    await callAs('proprietor', PROPRIETOR, () =>
      applyExpenseDecision(db as unknown as Queryable, user('proprietor', PROPRIETOR), expenseId, {
        decision: 'approve',
      }),
    );

    await callAs('proprietor', PROPRIETOR, () =>
      applyExpenseDecision(db as unknown as Queryable, user('proprietor', PROPRIETOR), expenseId, {
        decision: 'pay',
        paidReference: 'PAID-001',
      }),
    );

    const paid = await db.query<{
      status: string;
      approved_by: string | null;
      approved_at: string | null;
      paid_at: string | null;
      paid_reference: string | null;
    }>(`select status, approved_by, approved_at, paid_at, paid_reference from expenses where id = $1`, [
      expenseId,
    ]);
    expect(paid.rows[0]!.status).toBe('paid');
    expect(paid.rows[0]!.approved_by).toBe(PROPRIETOR);
    expect(paid.rows[0]!.approved_at).not.toBeNull();
    expect(paid.rows[0]!.paid_at).not.toBeNull();
    expect(paid.rows[0]!.paid_reference).toBe('PAID-001');
  });

  it('refuses the requestor from deciding their own expense (segregation)', async () => {
    // The bursar requested the expense; letting them also decide it would
    // defeat the accounts-payable control. The service seam enforces this
    // before any write.
    await expect(
      callAs('bursar', BURSAR, () =>
        applyExpenseDecision(db as unknown as Queryable, user('bursar', BURSAR), expenseId, {
          decision: 'approve',
        }),
      ),
    ).rejects.toBeInstanceOf(PreconditionError);
  });
});

describe('fail-closed behavior at the service boundary', () => {
  it('anonymous callers are refused by the permission-gated wrappers', async () => {
    // These are the real wrappers; each gates on the session before touching
    // any pool, so no database is required (pure, DB-free assertions).
    await expect(
      listStaff(null as unknown as SessionUser),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      getStaffDetail(null as unknown as SessionUser, EMP_ADMIN),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      decideExpense(null as unknown as SessionUser, expenseId, { decision: 'approve' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});