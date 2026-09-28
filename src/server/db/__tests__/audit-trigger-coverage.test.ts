/**
 * AUDIT TRIGGER COVERAGE FOR LEAVE, EXPENSES, STUDENTS AND SALARY HISTORY
 * =======================================================================
 *
 * Phase 6 findings F-4, F-5, F-6 and F-12: four tables carrying financial or
 * personal decisions had no audit trigger, so a change to a leave decision, an
 * expense status, a student's class or a salary record left no trace. Migration
 * 022 adds them, following the payroll pattern from 010/017/020.
 *
 * WHAT THESE TESTS ACTUALLY PROVE
 * -------------------------------
 * Every write below is executed as the APPLICATION role (`set local role
 * samjona_app` plus the GUC context), not as the table owner. That is the whole
 * point: `audit_logs` has no INSERT policy for application roles, so an audit
 * function that were SECURITY INVOKER would make these writes fail with 42501
 * rather than record anything. A passing test therefore proves BOTH that the
 * audit row was written AND that the write path works for a real request.
 *
 * It then proves the four properties an audit trail must have:
 *   1. correct actor attribution (the GUC identity, not "system"),
 *   2. a timestamp,
 *   3. the operation that happened (INSERT vs each status change),
 *   4. before/after values where the audit architecture records them.
 *
 * And the two properties that make the trail worth having:
 *   5. a user cannot FORGE an audit row,
 *   6. a user cannot ALTER or DELETE one.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDatabase } from './harness';

let db: PGlite;

const PROPRIETOR = 'aaaaaaaa-0220-4111-8111-aaaaaaaa0220';
const ADMIN = 'aaaaaaaa-0221-4222-8222-aaaaaaaa0221';
const BURSAR = 'aaaaaaaa-0222-4333-8333-aaaaaaaa0222';
const TEACHER = 'aaaaaaaa-0223-4444-8444-aaaaaaaa0223';

const EMP_TEACHER = 'bbbbbbbb-0220-4111-8111-bbbbbbbb0220';
const EMP_ADMIN = 'bbbbbbbb-0221-4222-8222-bbbbbbbb0221';
const EMP_BURSAR = 'bbbbbbbb-0222-4333-8333-bbbbbbbb0222';

let yearId = '';
let leaveType = '';
let expenseCategory = '';
let classA = '';
let classB = '';

function q(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Execute a write as the application role, inside a committed transaction, and
 * return the rows it produced.
 *
 * `returning id` is how most of these tests learn which row they just created,
 * so this is the primitive; `writeAs` below is the count-only convenience.
 */
async function queryAs<T>(
  role: string,
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<{ rowCount: number; rows: T[] }> {
  await db.exec('begin');
  try {
    await db.exec('set local role samjona_app');
    await db.exec('set local app.user_role = ' + q(role));
    await db.exec('set local app.user_id = ' + q(userId));
    const result = await db.query<T>(sql, params);
    await db.exec('commit');
    return { rowCount: result.rowCount ?? 0, rows: result.rows };
  } catch (err) {
    await db.exec('rollback');
    throw err;
  }
}

/** Execute a write as the application role; return how many rows it changed. */
async function writeAs(
  role: string,
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<number> {
  const { rowCount } = await queryAs(role, userId, sql, params);
  return rowCount;
}

interface AuditRow {
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_id: string | null;
  actor_name: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  metadata: Record<string, unknown>;
  occurred: boolean;
}

async function auditFor(entityType: string, entityId: string): Promise<AuditRow[]> {
  const { rows } = await db.query<{
    action: string;
    entity_type: string;
    entity_id: string | null;
    actor_id: string | null;
    actor_name: string;
    field: string | null;
    old_value: string | null;
    new_value: string | null;
    metadata: Record<string, unknown>;
    occurred_at: string;
  }>(
    `select action, entity_type, entity_id, actor_id::text as actor_id, actor_name,
            field, old_value, new_value, metadata, occurred_at
       from audit_logs
      where entity_type = $1 and entity_id = $2
      order by occurred_at, id`,
    [entityType, entityId],
  );
  return rows.map((r) => ({
    action: r.action,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    actor_id: r.actor_id,
    actor_name: r.actor_name,
    field: r.field,
    old_value: r.old_value,
    new_value: r.new_value,
    metadata: r.metadata,
    occurred: Boolean(r.occurred_at),
  }));
}

/**
 * Mark where the audit trail currently stands for an entity, so a test can
 * assert on the rows a write APPENDED rather than on every row that exists.
 *
 * This indirection is not cosmetic. `audit_logs` is append-only by design - the
 * table refuses UPDATE and DELETE for every application role - so these tests
 * cannot clean up after themselves and must not try to. The fixture inserts run
 * as the table owner and fire the same trigger, leaving one attributed row
 * behind; `auditSince` treats that as the baseline rather than as noise to be
 * deleted. It also happens to be the stronger assertion: it proves the audited
 * write appended, which is the property an append-only trail is for.
 */
async function markAudit(entityType: string, entityId: string): Promise<number> {
  return (await auditFor(entityType, entityId)).length;
}

/** Total rows in the trail, read as the owner, for before/after comparisons. */
async function countAuditRows(): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    'select count(*)::text as n from audit_logs',
  );
  return Number(rows[0]!.n);
}

async function newPendingLeave(): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into leave_requests (employee_id, leave_type, start_date, end_date, days_count, reason)
     values ($1, $2, date '2027-04-01', date '2027-04-02', 2, 'Audit fixture')
     returning id`,
    [EMP_TEACHER, leaveType],
  );
  return rows[0]!.id;
}

async function newExpense(): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into expenses (category_id, category_name, amount, date, description, requested_by)
     values ($1, 'Stationery', 25000, date '2027-04-02', 'Audit fixture expense', $2)
     returning id`,
    [expenseCategory, ADMIN],
  );
  return rows[0]!.id;
}

async function newStudent(fullName: string, classId: string | null): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into students (full_name, admission_date, class_id, status)
     values ($1, date '2027-01-10', $2, 'active') returning id`,
    [fullName, classId],
  );
  return rows[0]!.id;
}

beforeAll(async () => {
  db = await migratedDatabase();

  for (const [id, name, role, emp] of [
    [PROPRIETOR, 'Own', 'proprietor', null],
    [ADMIN, 'Admi', 'admin', EMP_ADMIN],
    [BURSAR, 'Bursa', 'bursar', EMP_BURSAR],
    [TEACHER, 'Teach', 'teacher', EMP_TEACHER],
  ] as const) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [
      id,
      `${name.toLowerCase()}@audit.test`,
    ]);
    await db.query('insert into app_users (id, username, full_name, role) values ($1,$2,$3,$4)', [
      id,
      name.toLowerCase(),
      name,
      role,
    ]);
    if (emp) {
      await db.query(
        `insert into employees (full_name, position, employment_date, status)
         values ($1, 'Staff', date '2026-01-01', 'active')`,
        [`${name} Employee`],
      );
      const { rows } = await db.query<{ id: string }>(
        'select id from employees where full_name = $1',
        [`${name} Employee`],
      );
      await db.query('update employees set id = $1 where full_name = $2', [emp, `${name} Employee`]);
      await db.query('update app_users set employee_id = $1 where id = $2', [emp, id]);
      expect(rows).toHaveLength(1);
    }
  }

  const { rows: yearRows } = await db.query<{ id: string }>(
    'select id from academic_years where is_current limit 1',
  );
  yearId = yearRows[0]!.id;

  const { rows: ltRows } = await db.query<{ name: string }>(
    `select name from leave_types where status = 'active' order by name limit 1`,
  );
  leaveType = ltRows[0]!.name;

  const { rows: catRows } = await db.query<{ id: string }>(
    `select id from expense_categories where status = 'active' order by name limit 1`,
  );
  expenseCategory = catRows[0]!.id;

  const { rows: classRows } = await db.query<{ id: string }>(
    `insert into classes (name, academic_year_id, teacher_id) values ($1, $2, $3) returning id`,
    ['Audit Class A', yearId, EMP_TEACHER],
  );
  classA = classRows[0]!.id;

  // Class B deliberately lives in a DIFFERENT academic year. A student may hold
  // only one class per academic year - enforced by a schema guard - so a class
  // "move" is only a legal change when it crosses a year boundary. Testing the
  // move within one year would be testing a refusal, not the audit trigger.
  const { rows: year2Rows } = await db.query<{ id: string }>(
    `insert into academic_years (name, start_date, end_date, is_current)
     values ('2025/26', date '2025-09-01', date '2026-07-31', false)
     returning id`,
  );
  const { rows: classBRows } = await db.query<{ id: string }>(
    `insert into classes (name, academic_year_id) values ($1, $2) returning id`,
    ['Audit Class B', year2Rows[0]!.id],
  );
  classB = classBRows[0]!.id;
}, 120_000);

// ---------------------------------------------------------------------------
// F-4: leave_requests
// ---------------------------------------------------------------------------
describe('F-4: leave_requests writes an audit row', () => {
  it('records the request with the acting user, a timestamp, and the request detail', async () => {
    // The INSERT *is* the auditable event, and it is executed as the APPLICATION
    // ROLE rather than as the table owner. That is the point: `audit_logs` has no
    // INSERT policy for application roles, so if `app_audit_leave_requests` were
    // SECURITY INVOKER this statement would fail with 42501 instead of recording
    // anything. A pass proves the row was written AND the path works for a real
    // request.
    const { rowCount, rows } = await queryAs<{ id: string }>(
      'teacher',
      TEACHER,
      `insert into leave_requests (employee_id, leave_type, start_date, end_date, days_count, reason)
       values ($1, $2, date '2027-04-01', date '2027-04-02', 2, 'Audit fixture')
       returning id`,
      [EMP_TEACHER, leaveType],
    );
    expect(rowCount).toBe(1);
    const leaveId = rows[0]!.id;

    const audit = await auditFor('leave_requests', leaveId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'LEAVE_REQUESTED',
      entity_type: 'leave_requests',
      entity_id: leaveId,
    });
    // The request detail travels in metadata, because an INSERT has no
    // single `field` to report a before/after pair for.
    expect(audit[0]!.metadata).toMatchObject({
      employee_id: EMP_TEACHER,
      leave_type: leaveType,
      days_count: 2,
    });
    expect(audit[0]!.actor_id, 'the requester is named, not "system"').toBe(TEACHER);
    expect(audit[0]!.actor_name).toBe('Teach');
    expect(audit[0]!.occurred).toBe(true);
  });

  it('records an approval with the approver and the decision note', async () => {
    const id = await newPendingLeave();
    const since = await markAudit('leave_requests', id);

    await writeAs(
      'admin',
      ADMIN,
      `update leave_requests
          set status = 'approved', approved_by = $1::uuid, approved_at = now(),
              decision_note = 'Cover arranged'
        where id = $2::uuid`,
      [ADMIN, id],
    );

    const rows = (await auditFor('leave_requests', id)).slice(since);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe('LEAVE_APPROVED');
    expect(rows[0]!.old_value).toBe('pending');
    expect(rows[0]!.new_value).toBe('approved');
    expect(rows[0]!.actor_id).toBe(ADMIN);
    expect(rows[0]!.metadata).toMatchObject({ approved_by: ADMIN, decision_note: 'Cover arranged' });
  });

  it('records a rejection as its own action', async () => {
    const id = await newPendingLeave();
    const since = await markAudit('leave_requests', id);

    await writeAs(
      'admin',
      ADMIN,
      `update leave_requests
          set status = 'rejected', approved_by = $1::uuid, approved_at = now(),
              decision_note = 'Exams that week'
        where id = $2::uuid`,
      [ADMIN, id],
    );

    const rows = (await auditFor('leave_requests', id)).slice(since);
    expect(rows.map((r) => r.action)).toEqual(['LEAVE_REJECTED']);
  });
});

// ---------------------------------------------------------------------------
// F-5: expenses
// ---------------------------------------------------------------------------
describe('F-5: expenses writes an audit row', () => {
  it('records each workflow step with before/after status', async () => {
    const id = await newExpense();
    const since = await markAudit('expenses', id);

    // draft -> submitted
    await writeAs('admin', ADMIN, `update expenses set status = 'submitted' where id = $1::uuid`, [id]);
    // submitted -> approved (the CHECK requires the approver and the time)
    await writeAs(
      'admin',
      ADMIN,
      `update expenses
          set status = 'approved', approved_by = $1::uuid, approved_at = now()
        where id = $2::uuid`,
      [BURSAR, id],
    );

    const rows = (await auditFor('expenses', id)).slice(since);
    expect(rows.map((r) => r.action)).toEqual(['EXPENSE_SUBMITTED', 'EXPENSE_APPROVED']);
    expect(rows[0]).toMatchObject({ old_value: 'draft', new_value: 'submitted' });
    expect(rows[1]).toMatchObject({ old_value: 'submitted', new_value: 'approved' });
    // The APPROVER is the subject of the row, and the actor is recorded too.
    expect(rows[1]!.metadata).toMatchObject({ approved_by: BURSAR });
  });

  it('records a payment, which is the step that moves money', async () => {
    const id = await newExpense();
    const since = await markAudit('expenses', id);

    await writeAs(
      'bursar',
      BURSAR,
      `update expenses
          set status = 'approved', approved_by = $1::uuid, approved_at = now()
        where id = $2::uuid`,
      [PROPRIETOR, id],
    );
    await writeAs(
      'bursar',
      BURSAR,
      `update expenses set status = 'paid', paid_at = now(), paid_reference = 'RCPT-1' where id = $1::uuid`,
      [id],
    );

    const rows = (await auditFor('expenses', id)).slice(since);
    expect(rows.map((r) => r.action)).toEqual(['EXPENSE_APPROVED', 'EXPENSE_PAID']);
    expect(rows[1]).toMatchObject({ old_value: 'approved', new_value: 'paid' });
  });

  it('records an amount change, not just a status change', async () => {
    const id = await newExpense();
    const since = await markAudit('expenses', id);

    await writeAs('admin', ADMIN, `update expenses set amount = 31000 where id = $1::uuid`, [id]);

    const rows = (await auditFor('expenses', id)).slice(since);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'EXPENSE_AMOUNT_CHANGED',
      field: 'amount',
      old_value: '25000',
      new_value: '31000',
    });
  });
});

// ---------------------------------------------------------------------------
// F-6: students
// ---------------------------------------------------------------------------
describe('F-6: students writes an audit row', () => {
  it('records a class move with the old and new class', async () => {
    const id = await newStudent('Audit Student', classA);
    const since = await markAudit('students', id);

    await writeAs('admin', ADMIN, `update students set class_id = $1::uuid where id = $2::uuid`, [
      classB,
      id,
    ]);

    const rows = (await auditFor('students', id)).slice(since);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe('STUDENT_CLASS_CHANGED');
    expect(rows[0]!.old_value).toBe(classA);
    expect(rows[0]!.new_value).toBe(classB);
    expect(rows[0]!.actor_id).toBe(ADMIN);
    expect(rows[0]!.occurred).toBe(true);
  });

  it('records a status change when a student leaves', async () => {
    const id = await newStudent('Audit Student Two', classA);
    const since = await markAudit('students', id);

    await writeAs('admin', ADMIN, `update students set status = 'withdrawn' where id = $1::uuid`, [id]);

    const rows = (await auditFor('students', id)).slice(since);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'STUDENT_STATUS_CHANGED',
      field: 'status',
      old_value: 'active',
      new_value: 'withdrawn',
    });
  });
});

// ---------------------------------------------------------------------------
// F-12: employee_salary_history
// ---------------------------------------------------------------------------
describe('F-12: employee_salary_history writes an audit row', () => {
  it('records the CREATION of a salary record, which previously left no trace', async () => {
    const since = await markAudit('employee_salary_history', EMP_BURSAR);

    const affected = await writeAs(
      'bursar',
      BURSAR,
      `insert into employee_salary_history
         (employee_id, base_salary, allowances, deductions, effective_from, reason, created_by)
       values ($1, 900000, 0, 0, date '2027-01-01', 'Annual review', $2)`,
      // Two different id spaces: employee_id keys `employees`, created_by keys
      // `app_users`. Passing the employee id for both violates the created_by FK.
      [EMP_BURSAR, BURSAR],
    );
    expect(affected).toBe(1);

    const rows = (await auditFor('employee_salary_history', EMP_BURSAR)).slice(since);
    expect(rows.map((r) => r.action)).toEqual(['SALARY_CREATED']);
    expect(rows[0]!.actor_id).toBe(BURSAR);
    expect(rows[0]!.occurred).toBe(true);
    expect(rows[0]!.metadata).toMatchObject({ base_salary: 900000 });
  });

  it('records a base_salary change, and only for the roles allowed to make one', async () => {
    const since = await markAudit('employee_salary_history', EMP_BURSAR);

    // Admin may read staff but holds no salary-update grant: the UPDATE policy
    // admits proprietor and bursar only, so this is filtered to zero rows and
    // raises nothing. Asserted on the row count, not on an exception.
    const asAdmin = await writeAs(
      'admin',
      ADMIN,
      `update employee_salary_history set base_salary = 940000 where employee_id = $1::uuid`,
      [EMP_BURSAR],
    );
    expect(asAdmin, 'RLS filters the row out; it does not raise').toBe(0);
    expect((await auditFor('employee_salary_history', EMP_BURSAR)).slice(since)).toHaveLength(0);

    // The bursar may, and the pre-existing protection trigger records the change
    // with both values - so 022's INSERT trigger covers creation without
    // duplicating what this one already did for amounts.
    const asBursar = await writeAs(
      'bursar',
      BURSAR,
      `update employee_salary_history set base_salary = 950000 where employee_id = $1::uuid`,
      [EMP_BURSAR],
    );
    expect(asBursar).toBe(1);

    const rows = (await auditFor('employee_salary_history', EMP_BURSAR)).slice(since);
    expect(rows.map((r) => r.action)).toEqual(['SALARY_CHANGED']);
    expect(rows[0]!.field).toBe('base_salary');
    expect(rows[0]!.old_value).toBe('900000');
    expect(rows[0]!.new_value).toBe('950000');
    expect(rows[0]!.actor_id).toBe(BURSAR);
  });
});

// ---------------------------------------------------------------------------
// The two properties that make a trail worth having
// ---------------------------------------------------------------------------
describe('the audit trail itself cannot be forged or altered by an application role', () => {
  it('refuses a direct INSERT into audit_logs from the application role', async () => {
    let code: string | undefined;
    try {
      await writeAs(
        'admin',
        ADMIN,
        `insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id)
         values ($1::uuid, 'Forged', 'PAYROLL_APPROVED', 'payroll_runs', 'made-up')`,
        [ADMIN],
      );
    } catch (err) {
      code = (err as { code?: string }).code;
    }
    expect(code).toBe('42501');

    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from audit_logs where actor_name = 'Forged'`,
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it('refuses UPDATE of an audit row from the application role', async () => {
    // Deliberately asserted on the EFFECT, not on a thrown error. A statement
    // whose rows are filtered out by a policy's USING clause does not raise: the
    // row is simply invisible, so the statement reports UPDATE 0. Asserting that
    // it "rejects" would pass even with the table wide open, which is the exact
    // failure mode this repository records for RLS denials. What must hold is
    // that no row changed and no row became visible to the caller.
    const before = await countAuditRows();
    const affected = await writeAs(
      'admin',
      ADMIN,
      `update audit_logs set action = 'tampered' where action is not null`,
    );
    expect(affected).toBe(0);
    expect(await countAuditRows()).toBe(before);

    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from audit_logs where action = 'tampered'`,
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it('refuses DELETE of an audit row from the application role', async () => {
    // Two independent layers can refuse this and the test does not care which:
    // `samjona_app` holds no DELETE grant at all on `audit_logs` (so the
    // statement raises `permission denied`), and the append-only trigger would
    // refuse it even for a role that did. Asserting the trail survives is the
    // property; the mechanism is an implementation detail.
    const before = await countAuditRows();
    let refused = false;
    try {
      await writeAs('admin', ADMIN, `delete from audit_logs`);
    } catch {
      refused = true;
    }
    expect(refused, 'a direct DELETE is refused, not silently tolerated').toBe(true);
    expect(await countAuditRows()).toBe(before);
  });

  it('leaves the whole trail intact after every attempt above', async () => {
    const { rows } = await db.query<{ n: string }>('select count(*)::text as n from audit_logs');
    expect(Number(rows[0]!.n)).toBeGreaterThan(0);

    const { rows: tampered } = await db.query<{ n: string }>(
      `select count(*)::text as n from audit_logs where action = 'tampered'`,
    );
    expect(Number(tampered[0]!.n)).toBe(0);
  });});
