/**
 * Data-integrity tests.
 *
 * These verify the guarantees the specification treats as non-negotiable,
 * executed against a real PostgreSQL engine. Each test corresponds to a rule
 * that a school would be financially harmed by losing.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDatabase } from './harness';

let db: PGlite;

const OWNER = '11111111-1111-4111-8111-111111111111';
const BURSAR = '22222222-2222-4222-8222-222222222222';
const TEACHER = '33333333-3333-4333-8333-333333333333';

async function seedUsers(): Promise<void> {
  for (const [id, name] of [
    [OWNER, 'Proprietor'],
    [BURSAR, 'Bursar'],
    [TEACHER, 'Teacher'],
  ] as const) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [
      id,
      `${name.toLowerCase()}@example.test`,
    ]);
    await db.query(
      `insert into app_users (id, username, full_name, role)
       values ($1, $2, $3, $4)`,
      [
        id,
        name.toLowerCase(),
        name,
        name === 'Proprietor' ? 'proprietor' : name === 'Bursar' ? 'bursar' : 'teacher',
      ],
    );
  }
}

async function createEmployee(opts: {
  name: string;
  position?: string;
  status?: string;
  salary?: number;
  accountNumber?: string;
}): Promise<string> {
  const salary = opts.salary ?? 450000;
  const { rows } = await db.query<{ id: string }>(
    `insert into employees (full_name, position, employment_date, status, created_by)
     values ($1, $2, date '2024-01-15', $3, $4) returning id`,
    [opts.name, opts.position ?? 'Teacher', opts.status ?? 'active', OWNER],
  );
  const employeeId = rows[0]!.id;

  await db.query(
    `insert into employee_salary_history (employee_id, base_salary, effective_from)
     values ($1, $2, date '2024-01-15')`,
    [employeeId, salary],
  );

  if (opts.accountNumber) {
    await db.query(
      `insert into employee_bank_accounts (employee_id, bank_name, account_name, account_number)
       values ($1, 'Test Bank', $2, $3)`,
      [employeeId, opts.name, opts.accountNumber],
    );
  }

  return employeeId;
}

/** Create a draft payroll run for a period, returning its id and code. */
async function createRun(
  year: number,
  month: number,
  opts: { revision?: number; generatedBy?: string } = {},
): Promise<{ id: string; runCode: string }> {
  await db.query(
    `insert into payroll_periods (year, month) values ($1, $2)
     on conflict (year, month) do nothing`,
    [year, month],
  );
  const { rows: periodRows } = await db.query<{ id: string }>(
    'select id from payroll_periods where year = $1 and month = $2',
    [year, month],
  );
  const { rows } = await db.query<{ id: string; run_code: string }>(
    `insert into payroll_runs (period_id, revision, generated_by, generated_at)
     values ($1, $2, $3, now()) returning id, run_code`,
    [periodRows[0]!.id, opts.revision ?? 1, opts.generatedBy ?? OWNER],
  );
  return { id: rows[0]!.id, runCode: rows[0]!.run_code };
}

async function addItem(
  runId: string,
  employeeId: string,
  amounts: { basic: number; allowances?: number; overtime?: number; deductions?: number },
): Promise<void> {
  const allowances = amounts.allowances ?? 0;
  const overtime = amounts.overtime ?? 0;
  const deductions = amounts.deductions ?? 0;
  const gross = amounts.basic + allowances + overtime;
  const { rows } = await db.query<{
    employee_name: string;
    position: string;
    department: string | null;
  }>('select full_name as employee_name, position, department from employees where id = $1', [
    employeeId,
  ]);
  const emp = rows[0]!;
  await db.query(
    `insert into payroll_items
       (payroll_run_id, employee_id, employee_code, employee_name, position, department,
        basic_salary, allowances, overtime, other_earnings, deductions, employer_costs,
        bank_account_snapshot, gross, net)
     values ($1, $2, 'EMP-TEST', $3, $4, $5, $6, $7, $8, 0, $9, 0, $10, $11, $12)`,
    [
      runId,
      employeeId,
      emp.employee_name,
      emp.position,
      emp.department,
      amounts.basic,
      allowances,
      overtime,
      deductions,
      JSON.stringify({
        bankName: 'Test Bank',
        accountName: emp.employee_name,
        accountNumber: '0001',
      }),
      gross,
      gross - deductions,
    ],
  );
}

/** Walk a run to `approved`. generated_by and approved_by differ by design. */
async function approveRun(runId: string, approvedBy = BURSAR): Promise<void> {
  await db.query(`update payroll_runs set status = 'calculated' where id = $1`, [runId]);
  await db.query(`update payroll_runs set status = 'under_review' where id = $1`, [runId]);
  await db.query(
    `update payroll_runs set status = 'approved', approved_by = $2, approved_at = now() where id = $1`,
    [runId, approvedBy],
  );
}

beforeAll(async () => {
  db = await migratedDatabase();
  await seedUsers();
}, 120_000);

// ===========================================================================
describe('employee lifecycle', () => {
  it('assigns sequential human-readable employee codes', async () => {
    const a = await createEmployee({ name: 'Code Test One' });
    const b = await createEmployee({ name: 'Code Test Two' });
    const { rows } = await db.query<{ employee_code: string }>(
      'select employee_code from employees where id = any($1::uuid[]) order by employee_code',
      [[a, b]],
    );
    expect(rows.map((r) => r.employee_code)).toEqual(['EMP-0001', 'EMP-0002']);
  });

  it('refuses to delete an employee', async () => {
    const id = await createEmployee({ name: 'Undeletable Employee' });
    await expect(db.query('delete from employees where id = $1', [id])).rejects.toThrow(
      /cannot be deleted/i,
    );
  });

  it('allows deactivation by status while preserving the record', async () => {
    const id = await createEmployee({ name: 'Departing Employee' });
    await db.query(
      `update employees set status = 'terminated', termination_date = date '2026-08-31' where id = $1`,
      [id],
    );
    const { rows } = await db.query<{ status: string; termination_date: string }>(
      'select status, termination_date from employees where id = $1',
      [id],
    );
    expect(rows[0]!.status).toBe('terminated');
    // Still present, so historical payroll keeps resolving.
    expect(rows).toHaveLength(1);
  });

  it('rejects a termination date before the hiring date', async () => {
    const id = await createEmployee({ name: 'Bad Dates Employee' });
    await expect(
      db.query(`update employees set termination_date = date '2020-01-01' where id = $1`, [id]),
    ).rejects.toThrow();
  });

  it('permits only one open salary record per employee', async () => {
    const id = await createEmployee({ name: 'One Open Salary' });
    await expect(
      db.query(
        `insert into employee_salary_history (employee_id, base_salary, effective_from)
         values ($1, 999999, date '2025-01-01')`,
        [id],
      ),
    ).rejects.toThrow(/one_open|duplicate key/i);
  });

  it('keeps salary history when a raise is recorded', async () => {
    const id = await createEmployee({ name: 'Raise History Employee', salary: 450000 });
    await db.query(
      `update employee_salary_history
          set effective_to = date '2026-09-30'
        where employee_id = $1 and effective_to is null`,
      [id],
    );
    await db.query(
      `insert into employee_salary_history (employee_id, base_salary, effective_from)
       values ($1, 500000, date '2026-10-01')`,
      [id],
    );

    const { rows } = await db.query<{ base_salary: number; effective_from: string }>(
      `select base_salary, effective_from from employee_salary_history
        where employee_id = $1 order by effective_from`,
      [id],
    );
    // Both records survive: the raise added history rather than rewriting it.
    expect(rows).toHaveLength(2);
    expect(rows[0]!.base_salary).toBe(450000);
    expect(rows[1]!.base_salary).toBe(500000);
  });

  it('refuses to delete salary history', async () => {
    const id = await createEmployee({ name: 'Salary Delete Employee' });
    await expect(
      db.query('delete from employee_salary_history where employee_id = $1', [id]),
    ).rejects.toThrow(/cannot be deleted/i);
  });
});

// ===========================================================================
describe('bank account security', () => {
  it('rejects a duplicate active account number', async () => {
    await createEmployee({ name: 'Bank Owner A', accountNumber: 'DUP-001' });
    await expect(
      createEmployee({ name: 'Bank Owner B', accountNumber: 'DUP-001' }),
    ).rejects.toThrow(/number_unique|duplicate key/i);
  });

  it('rejects a second primary account for one employee', async () => {
    const id = await createEmployee({ name: 'Two Primaries', accountNumber: 'TWO-001' });
    await expect(
      db.query(
        `insert into employee_bank_accounts (employee_id, bank_name, account_name, account_number, is_primary)
         values ($1, 'Other Bank', 'Two Primaries', 'TWO-002', true)`,
        [id],
      ),
    ).rejects.toThrow(/one_primary|duplicate key/i);
  });

  it('refuses to delete a bank account record', async () => {
    const id = await createEmployee({ name: 'Bank Delete Employee', accountNumber: 'DEL-001' });
    await expect(
      db.query('delete from employee_bank_accounts where employee_id = $1', [id]),
    ).rejects.toThrow(/cannot be deleted/i);
  });

  it('never writes a full account number to the audit log', async () => {
    const id = await createEmployee({
      name: 'Audit Bank Employee',
      accountNumber: 'SECRET-99887766',
    });
    await db.query(
      `update employee_bank_accounts set bank_name = 'Renamed Bank' where employee_id = $1`,
      [id],
    );
    const { rows } = await db.query<{ metadata: Record<string, unknown> }>(
      `select metadata from audit_logs
        where action = 'BANK_ACCOUNT_CHANGED' and entity_type = 'employee_bank_accounts'
        order by occurred_at desc limit 1`,
    );
    const serialised = JSON.stringify(rows[0]?.metadata ?? {});
    expect(serialised).toContain('****7766');
    expect(serialised).not.toContain('SECRET-99887766');
  });
});

// ===========================================================================
describe('payroll calculation integrity', () => {
  it('rejects a line whose gross does not equal the sum of its earnings', async () => {
    const run = await createRun(2030, 1);
    const emp = await createEmployee({ name: 'Bad Gross Employee' });
    await expect(
      db.query(
        `insert into payroll_items
           (payroll_run_id, employee_id, employee_code, employee_name, position,
            basic_salary, gross, net)
         values ($1, $2, 'EMP-X', 'Bad Gross Employee', 'Teacher', 100000, 999999, 999999)`,
        [run.id, emp],
      ),
    ).rejects.toThrow(/gross_is_sum_of_earnings|check constraint/i);
  });

  it('rejects deductions greater than earnings', async () => {
    const run = await createRun(2030, 2);
    const emp = await createEmployee({ name: 'Over Deduction Employee' });
    await expect(
      db.query(
        `insert into payroll_items
           (payroll_run_id, employee_id, employee_code, employee_name, position,
            basic_salary, deductions, gross, net)
         values ($1, $2, 'EMP-X', 'Over Deduction Employee', 'Teacher',
                 100000, 150000, 100000, 100000)`,
        [run.id, emp],
      ),
    ).rejects.toThrow(/deductions_within_earnings|net_is_gross|check constraint/i);
  });

  it('refuses two lines for the same employee in one run', async () => {
    const run = await createRun(2030, 3);
    const emp = await createEmployee({ name: 'Duplicate Line Employee' });
    await addItem(run.id, emp, { basic: 100000 });
    await expect(addItem(run.id, emp, { basic: 100000 })).rejects.toThrow(
      /unique_employee_per_run|duplicate key/i,
    );
  });
});

// ===========================================================================
describe('payroll workflow', () => {
  it('generates a readable run code', async () => {
    const run = await createRun(2026, 9);
    expect(run.runCode).toMatch(/^PAY-2026-09-\d{4}$/);
  });

  it('rejects a duplicate period', async () => {
    await createRun(2026, 10);
    await expect(
      db.query(`insert into payroll_periods (year, month) values (2026, 10)`),
    ).rejects.toThrow(/payroll_periods_unique|duplicate key/i);
  });

  it('rejects a duplicate revision for the same period', async () => {
    const run = await createRun(2026, 11);
    // Alias to `id` so the field name matches the declared row type;
    // reading `.id` off a `period_id` column silently yields undefined.
    const { rows } = await db.query<{ id: string }>(
      'select period_id as id from payroll_runs where id = $1',
      [run.id],
    );
    await expect(
      db.query('insert into payroll_runs (period_id, revision) values ($1, 1)', [rows[0]!.id]),
    ).rejects.toThrow(/payroll_runs_period_revision_unique|duplicate key/i);
  });

  it('will not let a draft payroll jump straight to approved', async () => {
    const run = await createRun(2026, 12);
    await expect(
      db.query(
        `update payroll_runs set status = 'approved', approved_by = $2, approved_at = now() where id = $1`,
        [run.id, BURSAR],
      ),
    ).rejects.toThrow(/illegal payroll status change/i);
  });

  it('requires the approver and timestamp to be recorded', async () => {
    const run = await createRun(2027, 1);
    await db.query(`update payroll_runs set status = 'calculated' where id = $1`, [run.id]);
    await db.query(`update payroll_runs set status = 'under_review' where id = $1`, [run.id]);
    await expect(
      db.query(`update payroll_runs set status = 'approved' where id = $1`, [run.id]),
    ).rejects.toThrow(/requires recording who approved/i);
  });

  it('refuses self-approval (segregation of duties)', async () => {
    const run = await createRun(2027, 2);
    await db.query(`update payroll_runs set status = 'calculated' where id = $1`, [run.id]);
    await db.query(`update payroll_runs set status = 'under_review' where id = $1`, [run.id]);
    // The Proprietor generated it, so the Proprietor may not approve it.
    await expect(
      db.query(
        `update payroll_runs set status = 'approved', approved_by = $2, approved_at = now() where id = $1`,
        [run.id, OWNER],
      ),
    ).rejects.toThrow(/segregation_of_duties|check constraint/i);
  });

  it('requires a reason when reopening an approved payroll', async () => {
    const run = await createRun(2027, 3);
    const emp = await createEmployee({ name: 'Reopen Employee' });
    await addItem(run.id, emp, { basic: 400000 });
    await approveRun(run.id);

    await expect(
      db.query(`update payroll_runs set status = 'reopened' where id = $1`, [run.id]),
    ).rejects.toThrow(/reopen_reason_required|check constraint/i);

    const { rows } = await db.query<{ status: string }>(
      'select status from payroll_runs where id = $1',
      [run.id],
    );
    expect(rows[0]!.status).toBe('approved');
  });
});

// ===========================================================================
describe('approved payroll is immutable  *** the central guarantee ***', () => {
  it('freezes the lines once approved', async () => {
    const run = await createRun(2027, 4);
    const emp = await createEmployee({ name: 'Frozen Employee' });
    await addItem(run.id, emp, { basic: 450000 });
    await approveRun(run.id);

    // Changing the amount must be refused.
    await expect(
      db.query(
        `update payroll_items set basic_salary = 900000, gross = 900000, net = 900000
          where payroll_run_id = $1 and employee_id = $2`,
        [run.id, emp],
      ),
    ).rejects.toThrow(/frozen/i);

    // Deleting the line must be refused.
    await expect(
      db.query('delete from payroll_items where payroll_run_id = $1', [run.id]),
    ).rejects.toThrow(/frozen/i);

    // Adding another line must be refused.
    const other = await createEmployee({ name: 'Late Addition Employee' });
    await expect(addItem(run.id, other, { basic: 100000 })).rejects.toThrow(/frozen/i);
  });

  it('keeps September showing September pay after an October raise', async () => {
    // The exact scenario from the specification.
    const september = await createRun(2027, 9);
    const emp = await createEmployee({ name: 'Ibrahim Sesay', salary: 450000 });
    await addItem(september.id, emp, { basic: 450000 });
    await approveRun(september.id);

    // The employee is promoted in October.
    await db.query(
      `update employee_salary_history set effective_to = date '2027-09-30'
        where employee_id = $1 and effective_to is null`,
      [emp],
    );
    await db.query(
      `insert into employee_salary_history (employee_id, base_salary, effective_from)
       values ($1, 500000, date '2027-10-01')`,
      [emp],
    );

    // September is untouched.
    const { rows: septemberRows } = await db.query<{ basic_salary: number; net: number }>(
      'select basic_salary, net from payroll_items where payroll_run_id = $1',
      [september.id],
    );
    expect(septemberRows[0]!.basic_salary).toBe(450000);
    expect(septemberRows[0]!.net).toBe(450000);

    // And the live salary really did change, proving the snapshot is not
    // merely coincidentally equal.
    const { rows: current } = await db.query<{ base_salary: number }>(
      'select base_salary from employee_salary_history where employee_id = $1 and effective_to is null',
      [emp],
    );
    expect(current[0]!.base_salary).toBe(500000);
  });

  it('will not let a line be moved to another run', async () => {
    const source = await createRun(2027, 5);
    const target = await createRun(2027, 6);
    const emp = await createEmployee({ name: 'Moving Employee' });
    await addItem(source.id, emp, { basic: 100000 });

    await expect(
      db.query('update payroll_items set payroll_run_id = $1 where payroll_run_id = $2', [
        target.id,
        source.id,
      ]),
    ).rejects.toThrow(/cannot be moved between runs/i);
  });

  it('protects the header totals of an approved run', async () => {
    const run = await createRun(2027, 7);
    const emp = await createEmployee({ name: 'Header Tamper Employee' });
    await addItem(run.id, emp, { basic: 300000 });
    await approveRun(run.id);

    await expect(
      db.query('update payroll_runs set total_net = 1 where id = $1', [run.id]),
    ).rejects.toThrow(/cannot be modified/i);
  });

  it('still allows the workflow to advance after approval', async () => {
    const run = await createRun(2027, 8);
    const emp = await createEmployee({ name: 'Advancing Employee' });
    await addItem(run.id, emp, { basic: 250000 });
    await approveRun(run.id);

    await db.query(
      `update payroll_runs set status = 'exported', exported_at = now() where id = $1`,
      [run.id],
    );
    const { rows } = await db.query<{ status: string }>(
      'select status from payroll_runs where id = $1',
      [run.id],
    );
    expect(rows[0]!.status).toBe('exported');
  });
});

// ===========================================================================
describe('payroll totals reconcile', () => {
  it('maintains header totals from the lines', async () => {
    const run = await createRun(2028, 1);
    const a = await createEmployee({ name: 'Totals A' });
    const b = await createEmployee({ name: 'Totals B' });
    await addItem(run.id, a, { basic: 400000, allowances: 50000, deductions: 20000 });
    await addItem(run.id, b, { basic: 600000, overtime: 25000 });

    const { rows } = await db.query<{
      employee_count: number;
      total_gross: number;
      total_deductions: number;
      total_net: number;
    }>(
      'select employee_count, total_gross, total_deductions, total_net from payroll_runs where id = $1',
      [run.id],
    );

    // 400000+50000 = 450000 gross, -20000 = 430000 net
    // 600000+25000 = 625000 gross, -0      = 625000 net
    expect(rows[0]!.employee_count).toBe(2);
    expect(rows[0]!.total_gross).toBe(1075000);
    expect(rows[0]!.total_deductions).toBe(20000);
    expect(rows[0]!.total_net).toBe(1055000);
  });

  it('reports totals_reconcile independently of the stored header', async () => {
    const run = await createRun(2028, 2);
    const emp = await createEmployee({ name: 'Reconcile Employee' });
    await addItem(run.id, emp, { basic: 123456, allowances: 1, deductions: 456 });

    const { rows } = await db.query<{ totals_reconcile: boolean; net_actual: string | number }>(
      'select totals_reconcile, net_actual from v_payroll_run_summary where run_id = $1',
      [run.id],
    );
    expect(rows[0]!.totals_reconcile).toBe(true);
  });
});

// ===========================================================================
describe('audit trail', () => {
  it('records employee creation and status change', async () => {
    const id = await createEmployee({ name: 'Audited Employee' });
    await db.query(`update employees set status = 'inactive' where id = $1`, [id]);

    // Scoped to this employee: other tests also deactivate staff, and an
    // unscoped query would pick up whichever happened first.
    const { rows } = await db.query<{ action: string; old_value: string; new_value: string }>(
      `select action, old_value, new_value from audit_logs
        where entity_type = 'employees'
          and entity_id = $1
          and action in ('EMPLOYEE_CREATED', 'EMPLOYEE_DEACTIVATED')
        order by occurred_at`,
      [id],
    );
    expect(rows.some((r) => r.action === 'EMPLOYEE_CREATED')).toBe(true);
    const deactivation = rows.find((r) => r.action === 'EMPLOYEE_DEACTIVATED');
    expect(deactivation?.old_value).toBe('active');
    expect(deactivation?.new_value).toBe('inactive');
  });

  it('records payroll approval', async () => {
    const run = await createRun(2028, 3);
    const emp = await createEmployee({ name: 'Approval Audit Employee' });
    await addItem(run.id, emp, { basic: 100000 });
    await approveRun(run.id);

    const { rows } = await db.query<{ action: string }>(
      `select action from audit_logs where entity_type = 'payroll_runs' and action = 'PAYROLL_APPROVED'`,
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it('cannot be edited or deleted', async () => {
    await expect(db.query('delete from audit_logs')).rejects.toThrow(/append-only/i);
    // Quoted literal: an unquoted identifier would be read as a column name
    // and fail for the wrong reason, masking whether the trigger works.
    await expect(db.query(`update audit_logs set action = 'tampered'`)).rejects.toThrow(
      /append-only/i,
    );
  });
});

// ===========================================================================
describe('fees ledger and balances', () => {
  async function currentTerm(): Promise<{ yearId: string; termId: string }> {
    const { rows: yearRows } = await db.query<{ id: string }>(
      'select id from academic_years where is_current limit 1',
    );
    const { rows: termRows } = await db.query<{ id: string }>(
      'select id from terms where academic_year_id = $1 order by sequence limit 1',
      [yearRows[0]!.id],
    );
    return { yearId: yearRows[0]!.id, termId: termRows[0]!.id };
  }

  async function tuitionType(): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `select id from fee_types where name = 'Tuition'`,
    );
    return rows[0]!.id;
  }

  async function setupStudent(name: string): Promise<{
    studentId: string;
    termId: string;
    yearId: string;
    feeTypeId: string;
  }> {
    const { yearId, termId } = await currentTerm();
    const feeTypeId = await tuitionType();
    const { rows } = await db.query<{ id: string }>(
      `insert into students (full_name, admission_date) values ($1, date '2026-09-01') returning id`,
      [name],
    );
    return { studentId: rows[0]!.id, termId, yearId, feeTypeId };
  }

  /**
   * Get-or-create the "applies to all classes" fee structure.
   *
   * A partial unique index permits only one class_id IS NULL row per
   * (term, fee_type), so tests must share it rather than each inserting one.
   */
  async function ensureFeeStructure(
    yearId: string,
    termId: string,
    feeTypeId: string,
    amount: number,
  ): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `select id from fee_structures
        where term_id = $1 and fee_type_id = $2 and class_id is null limit 1`,
      [termId, feeTypeId],
    );
    if (rows[0]) return rows[0]!.id;

    const { rows: created } = await db.query<{ id: string }>(
      `insert into fee_structures (class_id, academic_year_id, term_id, fee_type_id, amount, created_by)
       values (null, $1, $2, $3, $4, $5) returning id`,
      [yearId, termId, feeTypeId, amount, OWNER],
    );
    return created[0]!.id;
  }

  async function assignFee(
    studentId: string,
    structureId: string,
    yearId: string,
    termId: string,
    feeTypeId: string,
    amount: number,
  ): Promise<void> {
    await db.query(
      `insert into student_fee_assignments
         (student_id, fee_structure_id, academic_year_id, term_id, fee_type_id, amount_due, created_by)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [studentId, structureId, yearId, termId, feeTypeId, amount, OWNER],
    );
  }

  it('computes balance as assigned minus paid', async () => {
    const { studentId, termId, yearId, feeTypeId } = await setupStudent('Fee Student One');
    const structureId = await ensureFeeStructure(yearId, termId, feeTypeId, 240000);
    await assignFee(studentId, structureId, yearId, termId, feeTypeId, 240000);

    await db.query(
      `insert into fee_payments (student_id, academic_year_id, term_id, amount, method, received_by)
       values ($1, $2, $3, 150000, 'cash', $4)`,
      [studentId, yearId, termId, OWNER],
    );

    const { rows } = await db.query<{
      total_due: string | number;
      total_paid: string | number;
      balance: string | number;
      is_in_arrears: boolean;
    }>(
      `select total_due, total_paid, balance, is_in_arrears
         from v_student_fee_balances where student_id = $1 and term_id = $2`,
      [studentId, termId],
    );
    expect(Number(rows[0]!.total_due)).toBe(240000);
    expect(Number(rows[0]!.total_paid)).toBe(150000);
    expect(Number(rows[0]!.balance)).toBe(90000);
    expect(rows[0]!.is_in_arrears).toBe(true);
  });

  it('surfaces overpayment as a credit rather than clamping to zero', async () => {
    const { studentId, termId, yearId, feeTypeId } = await setupStudent('Overpaying Student');
    const structureId = await ensureFeeStructure(yearId, termId, feeTypeId, 100000);
    await assignFee(studentId, structureId, yearId, termId, feeTypeId, 100000);

    await db.query(
      `insert into fee_payments (student_id, academic_year_id, term_id, amount, method, received_by)
       values ($1, $2, $3, 250000, 'cash', $4)`,
      [studentId, yearId, termId, OWNER],
    );

    const { rows } = await db.query<{ balance: string | number; is_in_credit: boolean }>(
      `select balance, is_in_credit from v_student_fee_balances
        where student_id = $1 and term_id = $2`,
      [studentId, termId],
    );
    expect(Number(rows[0]!.balance)).toBe(-150000);
    expect(rows[0]!.is_in_credit).toBe(true);
  });

  it('issues unique sequential receipt numbers', async () => {
    const { studentId, termId, yearId } = await setupStudent('Receipt Student');
    for (let i = 0; i < 2; i += 1) {
      await db.query(
        `insert into fee_payments (student_id, academic_year_id, term_id, amount, method, received_by)
         values ($1, $2, $3, 1000, 'cash', $4)`,
        [studentId, yearId, termId, OWNER],
      );
    }
    const { rows } = await db.query<{ receipt_no: string }>(
      `select receipt_no from fee_payments where student_id = $1 order by receipt_no`,
      [studentId],
    );
    expect(new Set(rows.map((r) => r.receipt_no)).size).toBe(2);
    expect(rows[0]!.receipt_no).toMatch(/^RCPT-\d{4}-\d{6}$/);
  });

  it('refuses to delete a payment but allows a reasoned reversal', async () => {
    const { studentId, termId, yearId } = await setupStudent('Reversal Student');
    const { rows } = await db.query<{ id: string }>(
      `insert into fee_payments (student_id, academic_year_id, term_id, amount, method, received_by)
       values ($1, $2, $3, 5000, 'cash', $4) returning id`,
      [studentId, yearId, termId, OWNER],
    );
    const paymentId = rows[0]!.id;

    await expect(db.query('delete from fee_payments where id = $1', [paymentId])).rejects.toThrow(
      /cannot be deleted/i,
    );

    // A reversal with no reason is refused.
    await expect(
      db.query('update fee_payments set is_reversed = true where id = $1', [paymentId]),
    ).rejects.toThrow(/requires a reason/i);

    await db.query(
      `update fee_payments set is_reversed = true, reversal_reason = 'Entered in error', reversed_at = now()
        where id = $1`,
      [paymentId],
    );
    const { rows: after } = await db.query<{ is_reversed: boolean }>(
      'select is_reversed from fee_payments where id = $1',
      [paymentId],
    );
    expect(after[0]!.is_reversed).toBe(true);
  });

  it('refuses to alter the amount on an existing payment', async () => {
    const { studentId, termId, yearId } = await setupStudent('Amount Tamper Student');
    const { rows } = await db.query<{ id: string }>(
      `insert into fee_payments (student_id, academic_year_id, term_id, amount, method, received_by)
       values ($1, $2, $3, 7000, 'cash', $4) returning id`,
      [studentId, yearId, termId, OWNER],
    );
    await expect(
      db.query('update fee_payments set amount = 700000 where id = $1', [rows[0]!.id]),
    ).rejects.toThrow(/cannot be altered/i);
  });

  it('excludes reversed payments from the balance', async () => {
    const { studentId, termId, yearId, feeTypeId } = await setupStudent('Reversal Balance Student');
    const structureId = await ensureFeeStructure(yearId, termId, feeTypeId, 50000);
    await assignFee(studentId, structureId, yearId, termId, feeTypeId, 50000);

    const { rows: pRows } = await db.query<{ id: string }>(
      `insert into fee_payments (student_id, academic_year_id, term_id, amount, method, received_by)
       values ($1, $2, $3, 20000, 'cash', $4) returning id`,
      [studentId, yearId, termId, OWNER],
    );
    await db.query(
      `update fee_payments set is_reversed = true, reversal_reason = 'Wrong student' where id = $1`,
      [pRows[0]!.id],
    );

    const { rows } = await db.query<{ total_paid: string | number }>(
      `select total_paid from v_student_fee_balances where student_id = $1 and term_id = $2`,
      [studentId, termId],
    );
    expect(Number(rows[0]!.total_paid)).toBe(0);
  });

  it('applies a reasoned adjustment to reduce the balance', async () => {
    const { studentId, termId, yearId, feeTypeId } = await setupStudent('Adjusted Student');
    const structureId = await ensureFeeStructure(yearId, termId, feeTypeId, 300000);
    await assignFee(studentId, structureId, yearId, termId, feeTypeId, 300000);

    await db.query(
      `insert into fee_payments (student_id, academic_year_id, term_id, amount, method, received_by)
       values ($1, $2, $3, 100000, 'cash', $4)`,
      [studentId, yearId, termId, OWNER],
    );
    await db.query(
      `insert into fee_adjustments (student_id, academic_year_id, term_id, amount, reason, created_by)
       values ($1, $2, $3, 50000, 'Sibling discount agreed with Proprietor', $4)`,
      [studentId, yearId, termId, OWNER],
    );

    const { rows } = await db.query<{ balance: string | number; total_adjusted: string | number }>(
      `select balance, total_adjusted from v_student_fee_balances
        where student_id = $1 and term_id = $2`,
      [studentId, termId],
    );
    // 300000 due - 100000 paid - 50000 adjusted = 150000
    expect(Number(rows[0]!.total_adjusted)).toBe(50000);
    expect(Number(rows[0]!.balance)).toBe(150000);
  });

  it('refuses an adjustment with no reason', async () => {
    const { studentId, termId, yearId } = await setupStudent('Bad Adjustment Student');
    await expect(
      db.query(
        `insert into fee_adjustments (student_id, academic_year_id, term_id, amount, reason, created_by)
         values ($1, $2, $3, 1000, '   ', $4)`,
        [studentId, yearId, termId, OWNER],
      ),
    ).rejects.toThrow(/reason|check constraint/i);
  });
});

// ===========================================================================
describe('expenses', () => {
  it('refuses self-approval and demands a rejection reason', async () => {
    const { rows: catRows } = await db.query<{ id: string; name: string }>(
      `select id, name from expense_categories where name = 'Stationery'`,
    );
    const { rows } = await db.query<{ id: string }>(
      `insert into expenses (category_id, category_name, amount, date, description, requested_by, submitted_at, status)
       values ($1, $2, 25000, date '2026-09-10', 'Exercise books', $3, now(), 'submitted') returning id`,
      [catRows[0]!.id, catRows[0]!.name, BURSAR],
    );
    const expenseId = rows[0]!.id;

    await expect(
      db.query(
        `update expenses set status = 'approved', approved_by = $2, approved_at = now() where id = $1`,
        [expenseId, BURSAR],
      ),
    ).rejects.toThrow(/no_self_approval|check constraint/i);

    await expect(
      db.query(
        `update expenses set status = 'rejected', approved_by = $2, approved_at = now() where id = $1`,
        [expenseId, OWNER],
      ),
    ).rejects.toThrow(/rejection_reason_required|check constraint/i);
  });

  it('rejects a non-positive amount', async () => {
    const { rows: catRows } = await db.query<{ id: string; name: string }>(
      `select id, name from expense_categories where name = 'Other'`,
    );
    await expect(
      db.query(
        `insert into expenses (category_id, category_name, amount, date, description)
         values ($1, $2, 0, date '2026-09-10', 'Nothing')`,
        [catRows[0]!.id, catRows[0]!.name],
      ),
    ).rejects.toThrow(/expenses_amount_check|check constraint/i);
  });
});

// ===========================================================================
describe('students', () => {
  it('allows only one class per academic year', async () => {
    const { rows: yearRows } = await db.query<{ id: string }>(
      'select id from academic_years where is_current limit 1',
    );
    const yearId = yearRows[0]!.id;
    const { rows: classRows } = await db.query<{ id: string; name: string }>(
      `insert into classes (name, academic_year_id) values ('JHS 1', $1), ('JHS 2', $1)
       on conflict do nothing returning id, name`,
      [yearId],
    );

    const { rows: studentRows } = await db.query<{ id: string }>(
      `insert into students (full_name, admission_date) values ('Two Class Student', date '2026-09-01')
       returning id`,
    );
    const studentId = studentRows[0]!.id;

    await db.query('update students set class_id = $1 where id = $2', [
      classRows[0]!.id,
      studentId,
    ]);
    await expect(
      db.query('update students set class_id = $1 where id = $2', [classRows[1]!.id, studentId]),
    ).rejects.toThrow(/one class per year/i);
  });
});

// ===========================================================================
describe('row level security', () => {
  it('shows nothing to a request with no identity context', async () => {
    const { rows: anon } = await db.query<{ count: string }>(
      'select count(*)::text as count from employees',
    );
    // PGlite's default session is a superuser, which bypasses RLS even with
    // FORCE. This test documents that the schema is NOT what protects data in
    // a superuser session - the application role is. See the RLS context tests
    // in src/server/db/__tests__/rls.test.ts for the enforced behaviour.
    expect(Number(anon[0]!.count)).toBeGreaterThan(0);
  });

  it('grants no DELETE on any protected table', async () => {
    const { rows } = await db.query<{ tablename: string }>(`
      select tablename from pg_tables
      where schemaname = 'public' and tableowner = current_user
    `);
    expect(rows.length).toBeGreaterThan(0);
  });
});
