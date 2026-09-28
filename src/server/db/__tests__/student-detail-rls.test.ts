/**
 * STUDENT DETAIL - FINANCIAL BOUNDARY AND SCOPING TESTS (Phase 3).
 *
 * THE VULNERABILITY THIS FILE LOCKS DOWN
 * ======================================
 * `getStudentDetail()` gated its fee-balance read on STUDENT read permissions.
 * A teacher holds `students:read_own_class`, so a teacher calling the student
 * detail service (or the `/api/students/[id]` route, or the profile page)
 * received the student's fee balances, arrears state and payment-derived
 * figures. Decision 3 of the Phase 3 security gate: teachers must NEVER
 * receive student financial information, enforced at the SERVICE/API boundary,
 * not by hiding UI.
 *
 * THE FIX UNDER TEST
 * ==================
 * `getStudentDetail` now delegates to `loadStudentDetail`, which:
 *   1. fetches fee balances ONLY when the caller holds `fees:read`
 *      (Proprietor, Bursar, Principal) - teachers never even run the
 *      `v_student_fee_balances` query;
 *   2. returns the field absent (not an empty array) for every other role, so
 *      even "no balance" is not leaked as a financial fact.
 * RLS stays the final backstop: `v_student_fee_balances` is SECURITY INVOKER,
 * so a raw SELECT by a teacher returns zero rows even if a future bug calls it.
 *
 * HOW THE SERVICE IS EXERCISED
 * ============================
 * Ordinary service functions run on the application pool, which vitest cannot
 * reach. `loadStudentDetail` is exported precisely so the exact code the
 * production wrapper runs inside `withUserContext` can be invoked against a
 * real PostgreSQL engine (PGlite) with the RLS GUC context set (`set local
 * role samjona_app` + `app.user_role` + `app.user_id`). That is a DIRECT
 * SERVICE invocation - the same path an API caller lands on - and it asserts
 * the response body, not the UI.
 *
 * As with every other DB test, assertions run as the application role, never
 * as the owner (the owner bypasses RLS even with FORCE ROW LEVEL SECURITY).
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDatabase } from './harness';
import type { Queryable } from '../pool';
import { loadStudentDetail, type StudentDetail } from '../../portal/students';
import type { SessionUser } from '../../auth/permissions';
import { NotFoundError } from '../../../lib/errors';

let db: PGlite;

const PROPRIETOR = 'aaaaaaaa-1111-4111-8111-aaaaaaaa1111';
const TEACHER = 'aaaaaaaa-2222-4222-8222-aaaaaaaa2222';
const OTHER_TEACHER = 'aaaaaaaa-5555-5555-8555-aaaaaaaa5555';
const PRINCIPAL = 'aaaaaaaa-3333-4333-8333-aaaaaaaa3333';
const BURSAR = 'aaaaaaaa-4444-4444-8444-aaaaaaaa4444';
const ADMIN = 'aaaaaaaa-6666-4666-8666-aaaaaaaa6666';
const CLASS_TEACHER_EMP = 'bbbbbbbb-1111-4111-8111-bbbbbbbb1111';
const OTHER_TEACHER_EMP = 'bbbbbbbb-2222-4222-8222-bbbbbbbb2222';
const STUDENT_A = 'cccccccc-1111-4111-8111-cccccccc1111';
const STUDENT_B = 'cccccccc-2222-4222-8222-cccccccc2222';

let yearId = '';
let termId = '';
let teacherClassId = '';
let otherClassId = '';
let feeTypeId = '';
let feeStructureId = '';

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sessionUser(role: SessionUser['role'], id: string): SessionUser {
  return { id, username: `${role}_user`, fullName: `${role} user`, role, employeeId: null };
}

interface RunResult {
  rows: Array<Record<string, unknown>>;
}

async function runAs(
  role: string,
  userId: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<RunResult> {
  await db.exec('begin');
  try {
    await db.exec('set local role samjona_app');
    await db.exec('set local app.user_role = ' + quote(role));
    if (userId) await db.exec('set local app.user_id = ' + quote(userId));
    const result = await db.query(sql, params);
    await db.exec('commit');
    return { rows: result.rows as Array<Record<string, unknown>> };
  } catch (err) {
    await db.exec('rollback');
    throw err;
  }
}

async function visibleCount(
  sql: string,
  role: string,
  userId: string | null,
  params: unknown[] = [],
): Promise<number> {
  const result = await runAs(role, userId, sql, params);
  return Number(result.rows[0]?.count ?? 0);
}

/**
 * Run the real service seam inside one transaction with the RLS GUC context of
 * the given role, exactly as `getStudentDetail` runs it inside
 * `withUserContext`. This is the direct service/API-invocation proof.
 */
async function serviceAs(
  role: SessionUser['role'],
  userId: string,
  studentId: string,
): Promise<StudentDetail> {
  await db.exec('begin');
  try {
    await db.exec('set local role samjona_app');
    await db.exec('set local app.user_role = ' + quote(role));
    await db.exec('set local app.user_id = ' + quote(userId));
    const result = await loadStudentDetail(
      db as unknown as Queryable,
      sessionUser(role, userId),
      studentId,
    );
    await db.exec('commit');
    return result;
  } catch (err) {
    await db.exec('rollback');
    throw err;
  }
}

/** The response body a teacher receives must contain NO financial facts. */
function expectNoFinancialData(detail: StudentDetail): void {
  const record = detail as unknown as Record<string, unknown>;
  expect('feeBalances' in record).toBe(false);
  expect(record.feeBalances).toBeUndefined();
  const serialized = JSON.stringify(record).toLowerCase();
  for (const word of ['balance', 'arrear', 'payment', 'receipt', 'amount_due', 'total_due']) {
    expect(serialized).not.toContain(word);
  }
}

beforeAll(async () => {
  db = await migratedDatabase();

  for (const [id, name, role] of [
    [PROPRIETOR, 'Proprietor', 'proprietor'],
    [TEACHER, 'Teacher User', 'teacher'],
    [OTHER_TEACHER, 'Other Teacher User', 'teacher'],
    [PRINCIPAL, 'Principal User', 'principal'],
    [BURSAR, 'Bursar User', 'bursar'],
    [ADMIN, 'Admin User', 'admin'],
  ] as const) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [
      id,
      `${name.toLowerCase().replace(/\s+/g, '_')}@example.test`,
    ]);
    await db.query('insert into app_users (id, username, full_name, role) values ($1,$2,$3,$4)', [
      id,
      name.toLowerCase().replace(/\s+/g, '_'),
      name,
      role,
    ]);
  }

  for (const [id, name] of [
    [CLASS_TEACHER_EMP, 'Class Teacher'],
    [OTHER_TEACHER_EMP, 'Other Teacher'],
  ] as const) {
    await db.query(
      `insert into employees (full_name, position, employment_date, status) values ($1, 'Teacher', date '2024-01-01', 'active')`,
      [name],
    );
    await db.query('update employees set id = $1 where full_name = $2', [id, name]);
  }

  await db.query('update app_users set employee_id = $1 where id = $2', [
    CLASS_TEACHER_EMP,
    TEACHER,
  ]);
  await db.query('update app_users set employee_id = $1 where id = $2', [
    OTHER_TEACHER_EMP,
    OTHER_TEACHER,
  ]);

  const { rows: yearRows } = await db.query<{ id: string }>(
    'select id from academic_years where is_current limit 1',
  );
  yearId = yearRows[0]!.id;
  const { rows: termRows } = await db.query<{ id: string }>(
    'select id from terms where academic_year_id = $1 order by sequence limit 1',
    [yearId],
  );
  termId = termRows[0]!.id;

  const { rows: classRows } = await db.query<{ id: string; teacher_id: string }>(
    `insert into classes (name, academic_year_id, teacher_id)
     values ('JSS 1A', $1, $2), ('JSS 2B', $1, $3) returning id, teacher_id`,
    [yearId, CLASS_TEACHER_EMP, OTHER_TEACHER_EMP],
  );
  teacherClassId = classRows.find((c) => c.teacher_id === CLASS_TEACHER_EMP)!.id;
  otherClassId = classRows.find((c) => c.teacher_id === OTHER_TEACHER_EMP)!.id;

  await db.query(
    `insert into students (id, full_name, admission_date, class_id, status)
     values ($1, 'My Class Student', date '2026-09-01', $2, 'active'),
            ($3, 'Other Class Student', date '2026-09-01', $4, 'active')`,
    [STUDENT_A, teacherClassId, STUDENT_B, otherClassId],
  );

  // A real fee ledger for STUDENT_A: one assignment of 200,000 and a 50,000
  // payment, so the balance view carries 150,000 in arrears. This is what the
  // teacher must never see and what the fee roles still may.
  const { rows: feeTypeRows } = await db.query<{ id: string }>(
    `select id from fee_types where name = 'Tuition' limit 1`,
  );
  feeTypeId = feeTypeRows.find((row) => row.id)?.id ?? feeTypeRows[0]!.id;
  const { rows: structureRows } = await db.query<{ id: string }>(
    `insert into fee_structures (class_id, academic_year_id, term_id, fee_type_id, amount)
     values ($1, $2, $3, $4, 200000) returning id`,
    [teacherClassId, yearId, termId, feeTypeId],
  );
  feeStructureId = structureRows[0]!.id;
  await db.query(
    `insert into student_fee_assignments
       (student_id, fee_structure_id, academic_year_id, term_id, fee_type_id, amount_due)
     values ($1, $2, $3, $4, $5, 200000) returning id`,
    [STUDENT_A, feeStructureId, yearId, termId, feeTypeId],
  );
  await db.query(
    `insert into fee_payments (student_id, academic_year_id, term_id, amount, method)
     values ($1, $2, $3, 50000, 'cash') returning id`,
    [STUDENT_A, yearId, termId],
  );
}, 120_000);

describe('teacher service boundary - student detail carries no financial data', () => {
  it('returns the student profile WITHOUT any fee field, even via direct service call', async () => {
    const detail = await serviceAs('teacher', TEACHER, STUDENT_A);
    const record = detail as unknown as Record<string, unknown>;
    expect(record['fullName']).toBe('My Class Student');
    expect(record['classId']).toBe(teacherClassId);
    expectNoFinancialData(detail);
  });

  it('does not leak "no balance" either: the field is absent, not an empty list', async () => {
    // The ledger HAS a row for this student (150,000 in arrears). Absence vs
    // [] matters: [] would still reveal that the student has no debt, which is
    // itself financial information.
    expect(
      await visibleCount(
        'select count(*)::text as count from v_student_fee_balances where student_id = $1::uuid',
        'proprietor',
        PROPRIETOR,
        [STUDENT_A],
      ),
    ).toBe(1);
    const detail = await serviceAs('teacher', TEACHER, STUDENT_A);
    expect(detail.feeBalances).toBeUndefined();
  });

  it('hides a student outside the teacher\u2019s class with a not-found error', async () => {
    await expect(serviceAs('teacher', TEACHER, STUDENT_B)).rejects.toThrow(NotFoundError);
  });
});

describe('teacher RLS boundary - the ledger is unreadable even by raw SQL', () => {
  it('returns zero fee-balance rows for the teacher\u2019s OWN class student', async () => {
    expect(
      await visibleCount(
        'select count(*)::text as count from v_student_fee_balances where student_id = $1::uuid',
        'teacher',
        TEACHER,
        [STUDENT_A],
      ),
    ).toBe(0);
  });

  it('returns zero payment-history rows for the teacher\u2019s own class student', async () => {
    expect(
      await visibleCount(
        'select count(*)::text as count from fee_payments where student_id = $1::uuid',
        'teacher',
        TEACHER,
        [STUDENT_A],
      ),
    ).toBe(0);
  });

  it('returns zero assignment rows for the teacher\u2019s own class student', async () => {
    expect(
      await visibleCount(
        'select count(*)::text as count from student_fee_assignments where student_id = $1::uuid',
        'teacher',
        TEACHER,
        [STUDENT_A],
      ),
    ).toBe(0);
  });

  it('scopes the student register itself to the classes the teacher teaches', async () => {
    expect(
      await visibleCount('select count(*)::text as count from students', 'teacher', TEACHER),
    ).toBe(1);
    expect(
      await visibleCount(
        'select count(*)::text as count from students where id = $1::uuid',
        'teacher',
        TEACHER,
        [STUDENT_B],
      ),
    ).toBe(0);
  });
});

describe('legitimate financial visibility is preserved for fee roles', () => {
  it('proprietor sees the student\u2019s fee balances, including arrears state', async () => {
    const detail = await serviceAs('proprietor', PROPRIETOR, STUDENT_A);
    expect(detail.feeBalances).toHaveLength(1);
    const row = detail.feeBalances![0]!;
    expect(Number(row.balance)).toBe(150_000); // 200,000 assigned - 50,000 paid
    expect(row.isInArrears).toBe(true);
    expect(row.academicYear.length).toBeGreaterThan(0);
    expect(row.term.length).toBeGreaterThan(0);
  });

  it('principal keeps the financial visibility the permission matrix already grants', async () => {
    const detail = await serviceAs('principal', PRINCIPAL, STUDENT_A);
    expect(detail.feeBalances).toHaveLength(1);
    expect(Number(detail.feeBalances![0]!.balance)).toBe(150_000);
  });

  it('bursar keeps the financial visibility the permission matrix already grants', async () => {
    const detail = await serviceAs('bursar', BURSAR, STUDENT_A);
    expect(detail.feeBalances).toHaveLength(1);
    expect(Number(detail.feeBalances![0]!.balance)).toBe(150_000);
  });

  it('admin receives no fee data either - admin has no fees:read', async () => {
    // Admin reads students via students:read, but the financial permission is
    // what matters here. Absence keeps the boundary consistent with the
    // permission matrix rather than with the student-read permission.
    const detail = await serviceAs('admin', ADMIN, STUDENT_A);
    expect(detail.feeBalances).toBeUndefined();
  });
});

describe('the ledger view itself is SECURITY INVOKER and readable by fee roles', () => {
  it('proprietor reads the same balance from raw SQL that the service returns', async () => {
    const { rows } = await runAs(
      'proprietor',
      PROPRIETOR,
      `select balance::text as balance, is_in_arrears
         from v_student_fee_balances where student_id = $1::uuid`,
      [STUDENT_A],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!['balance'])).toBe(150_000);
    expect(rows[0]!['is_in_arrears']).toBe(true);
  });
});