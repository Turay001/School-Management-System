/**
 * RLS enforcement tests.
 *
 * Migration 012 could be syntactically perfect and still permit everything
 * if the policies were wrong, or if the application connected as the table
 * owner. These tests connect AS the application role and assert on what it
 * can actually see.
 *
 * This is the difference between "RLS is enabled" and "RLS works".
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDatabase } from './harness';

let db: PGlite;

const PROPRIETOR = 'aaaaaaaa-1111-4111-8111-aaaaaaaa1111';
const TEACHER = 'aaaaaaaa-2222-4222-8222-aaaaaaaa2222';
const CLASS_TEACHER_EMP = 'bbbbbbbb-1111-4111-8111-bbbbbbbb1111';
const OTHER_TEACHER_EMP = 'bbbbbbbb-2222-4222-8222-bbbbbbbb2222';
const STUDENT_A = 'cccccccc-1111-4111-8111-cccccccc1111';
const STUDENT_B = 'cccccccc-2222-4222-8222-cccccccc2222';

/**
 * Count rows visible to the APPLICATION role, with the given app context.
 *
 * `set local role samjona_app` is essential. Without it the session is still
 * a superuser, and a superuser bypasses RLS even when FORCE ROW LEVEL
 * SECURITY is enabled - so the test would pass for the wrong reason while
 * proving nothing.
 */
async function visibleCount(sql: string, role: string, userId: string | null): Promise<number> {
  await db.exec('begin');
  try {
    await db.exec('set local role samjona_app');
    await db.exec('set local app.user_role = ' + quote(role));
    if (userId) {
      await db.exec('set local app.user_id = ' + quote(userId));
    }
    const { rows } = await db.query<{ count: string }>(sql);
    await db.exec('commit');
    return Number(rows[0]?.count ?? 0);
  } catch (err) {
    await db.exec('rollback');
    throw err;
  }
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

beforeAll(async () => {
  db = await migratedDatabase();

  for (const [id, name, role] of [
    [PROPRIETOR, 'Proprietor', 'proprietor'],
    [TEACHER, 'Teacher User', 'teacher'],
  ] as const) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [
      id,
      `${name}@example.test`,
    ]);
    await db.query('insert into app_users (id, username, full_name, role) values ($1,$2,$3,$4)', [
      id,
      name.toLowerCase().replace(/\s+/g, '_'),
      name,
      role,
    ]);
  }

  // Two employees, one of whom teaches a class.
  for (const [id, name] of [
    [CLASS_TEACHER_EMP, 'Class Teacher'],
    [OTHER_TEACHER_EMP, 'Other Teacher'],
  ] as const) {
    await db.query(
      `insert into employees (full_name, position, employment_date, status) values ($1, 'Teacher', date '2024-01-01', 'active')`,
      [name],
    );
    // The ids were supplied above, so align the employee row to them.
    await db.query('update employees set id = $1 where full_name = $2', [id, name]);
  }

  await db.query('update app_users set employee_id = $1 where id = $2', [
    CLASS_TEACHER_EMP,
    TEACHER,
  ]);

  const { rows: yearRows } = await db.query<{ id: string }>(
    'select id from academic_years where is_current limit 1',
  );
  const yearId = yearRows[0]!.id;
  const { rows: classRows } = await db.query<{ id: string }>(
    `insert into classes (name, academic_year_id, teacher_id) values ('JHS 1', $1, $2) returning id`,
    [yearId, CLASS_TEACHER_EMP],
  );

  for (const [id, name, classId] of [
    [STUDENT_A, 'Student In My Class', classRows[0]!.id],
    [STUDENT_B, 'Student In Other Class', null],
  ] as const) {
    await db.query(
      `insert into students (id, full_name, admission_date, class_id) values ($1, $2, date '2026-09-01', $3)`,
      [id, name, classId],
    );
  }
}, 120_000);

// ===========================================================================
describe('row level security is enforced, not merely enabled', () => {
  it('sees no employees at all with no identity context', async () => {
    const count = await visibleCount(
      'select count(*)::text as count from employees',
      'teacher',
      null,
    );
    // Fail closed: without app.user_id, app_current_employee_id() is NULL and
    // `id = NULL` is not true, so a teacher sees nobody - not everybody.
    expect(count).toBe(0);
  });

  it('lets the Proprietor see all employees', async () => {
    const count = await visibleCount(
      'select count(*)::text as count from employees',
      'proprietor',
      PROPRIETOR,
    );
    expect(count).toBe(2);
  });

  it('lets a teacher see only themselves', async () => {
    const count = await visibleCount(
      'select count(*)::text as count from employees',
      'teacher',
      TEACHER,
    );
    expect(count).toBe(1);
  });

  it('hides bank account details from roles without the permission', async () => {
    // Give one employee a bank account so a permitted role has something to see.
    const { rows } = await db.query<{ id: string }>(
      `insert into employees (full_name, position, employment_date, status)
       values ('Bank Holder', 'Teacher', date '2024-01-01', 'active') returning id`,
    );
    await db.query(
      `insert into employee_bank_accounts (employee_id, bank_name, account_name, account_number)
       values ($1, 'Test Bank', 'Bank Holder', 'RLS-0001')`,
      [rows[0]!.id],
    );

    // The Principal can see the staff list but must NOT see bank details.
    // This is the whole reason bank data lives in its own table.
    expect(
      await visibleCount(
        'select count(*)::text as count from employee_bank_accounts',
        'principal',
        PROPRIETOR,
      ),
    ).toBe(0);
    expect(
      await visibleCount(
        'select count(*)::text as count from employee_bank_accounts',
        'teacher',
        TEACHER,
      ),
    ).toBe(0);
    // ...while the roles that prepare a payment can.
    expect(
      await visibleCount(
        'select count(*)::text as count from employee_bank_accounts',
        'proprietor',
        PROPRIETOR,
      ),
    ).toBe(1);
    expect(
      await visibleCount(
        'select count(*)::text as count from employee_bank_accounts',
        'bursar',
        PROPRIETOR,
      ),
    ).toBe(1);
  });

  it('lets only the Proprietor and Bursar update bank account details', async () => {
    // Give the update an employer to act on so a permitted role has a real row.
    const { rows } = await db.query<{ id: string }>(
      `insert into employees (full_name, position, employment_date, status)
       values ('Updatable Bank Holder', 'Teacher', date '2024-01-01', 'active') returning id`,
    );
    const employeeId = rows[0]!.id;
    await db.query(
      `insert into employee_bank_accounts (employee_id, bank_name, account_name, account_number)
       values ($1, 'Test Bank', 'Updatable Bank Holder', 'UPD-0001')`,
      [employeeId],
    );

    const updateAs = async (role: string, userId: string): Promise<number> => {
      await db.exec('begin');
      try {
        await db.exec('set local role samjona_app');
        await db.exec(`set local app.user_role = '${role}'`);
        await db.exec(`set local app.user_id = ${quote(userId)}`);
        const { rows: updated } = await db.query(
          `update employee_bank_accounts set bank_name = 'Renamed Bank' where employee_id = $1 returning id`,
          [employeeId],
        );
        await db.exec('commit');
        return updated.length;
      } catch (err) {
        await db.exec('rollback');
        throw err;
      }
    };

    // The two roles that prepare a payment may change bank details.
    await expect(updateAs('proprietor', PROPRIETOR)).resolves.toBe(1);
    await expect(updateAs('bursar', PROPRIETOR)).resolves.toBe(1);

    // Everyone else - including admin, who edits other staff data - cannot
    // even see the row to change it: the policy's USING clause filters the
    // UPDATE to nothing, so it affects zero rows. This is the narrowest write
    // surface in the system after payroll itself, and it fails closed rather
    // than raising, so a denied role learns nothing about the record.
    for (const role of ['admin', 'principal', 'teacher'] as const) {
      expect(await updateAs(role, PROPRIETOR)).toBe(0);
    }
  });

  it('limits a teacher to students in their own class', async () => {
    const count = await visibleCount(
      'select count(*)::text as count from students',
      'teacher',
      TEACHER,
    );
    // One student is in the class this teacher is assigned to.
    expect(count).toBe(1);
  });

  it('refuses a teacher any attempt to insert a payroll line', async () => {
    await db.exec('begin');
    await db.exec(`set local role samjona_app`);
    await db.exec(`set local app.user_role = 'teacher'`);
    await db.exec(`set local app.user_id = ${quote(TEACHER)}`);
    // Assert on the RLS message specifically. A generic failure could just be
    // a foreign key violation, which would mean the test proved nothing.
    await expect(
      db.query(
        `insert into payroll_items
           (payroll_run_id, employee_id, employee_code, employee_name, position, basic_salary, gross, net)
         values (gen_random_uuid(), gen_random_uuid(), 'EMP-X', 'X', 'X', 1, 1, 1)`,
      ),
    ).rejects.toThrow(/row-level security/i);
    await db.exec('rollback');
  });

  it('refuses any application role to delete an employee', async () => {
    for (const role of ['proprietor', 'bursar', 'admin']) {
      await db.exec('begin');
      await db.exec(`set local role samjona_app`);
      await db.exec(`set local app.user_role = '${role}'`);
      await expect(
        db.query(`delete from employees where employee_code = 'EMP-0001'`),
      ).rejects.toThrow(/permission denied|row-level security/i);
      await db.exec('rollback');
    }
  });

  it('refuses a teacher to read the audit trail', async () => {
    const count = await visibleCount(
      'select count(*)::text as count from audit_logs',
      'teacher',
      TEACHER,
    );
    expect(count).toBe(0);
  });
});

// ===========================================================================
describe('immutability holds for the privileged service role too', () => {
  it('still refuses to alter an approved payroll line under BYPASSRLS', async () => {
    // Proves the financial guarantee does not rest on RLS. Even a role that
    // bypasses every policy is stopped by the trigger.
    const { rows: empRows } = await db.query<{ id: string }>(
      `insert into employees (full_name, position, employment_date, status)
       values ('Service Role Employee', 'Teacher', date '2024-01-01', 'active') returning id`,
    );
    const employeeId = empRows[0]!.id;

    const { rows: yearRows } = await db.query<{ id: string }>(
      'select id from academic_years where is_current limit 1',
    );
    const { rows: periodRows } = await db.query<{ id: string }>(
      `insert into payroll_periods (year, month) values (2031, 1) returning id`,
    );
    void yearRows;
    const { rows: runRows } = await db.query<{ id: string }>(
      `insert into payroll_runs (period_id, revision) values ($1, 1) returning id`,
      [periodRows[0]!.id],
    );
    const runId = runRows[0]!.id;

    await db.query(
      `insert into payroll_items
         (payroll_run_id, employee_id, employee_code, employee_name, position,
          basic_salary, gross, net)
       values ($1, $2, 'EMP-SVC', 'Service Role Employee', 'Teacher', 100000, 100000, 100000)`,
      [runId, employeeId],
    );

    // Walk the workflow to approved, as the service role.
    await db.query(`update payroll_runs set status = 'calculated' where id = $1`, [runId]);
    await db.query(`update payroll_runs set status = 'under_review' where id = $1`, [runId]);
    await db.query(
      `update payroll_runs set status = 'approved', approved_by = $2, approved_at = now() where id = $1`,
      [runId, PROPRIETOR],
    );

    // Now act as the BYPASSRLS service role and try to change the amount.
    await db.exec('set role samjona_service');
    try {
      await expect(
        db.query(
          `update payroll_items set basic_salary = 999999, gross = 999999, net = 999999
            where payroll_run_id = $1`,
          [runId],
        ),
      ).rejects.toThrow(/frozen/i);
    } finally {
      await db.exec('reset role');
    }
  });
});
