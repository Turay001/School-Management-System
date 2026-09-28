/**
 * ROLE DASHBOARDS - scoping, aggregation and RLS tests (Phase 2).
 *
 * The dashboard route dispatches per role, and each role's landing is built
 * from the live database inside `withUserContext`. These tests run the exact
 * queries the dashboards use, AS `samjona_app` under each role's GUC context,
 * and prove the scoping rules that make those landings honest:
 *
 *   teacher   - sees only their own classes, subjects and unfinished
 *               assessments; never school-wide figures
 *   principal - sees the school-wide academic overview
 *   bursar    - sees the financial overview the ledger grants them
 *
 * As with rls.test.ts, assertions run as the application role, never as the
 * owner (the owner bypasses RLS even with FORCE ROW LEVEL SECURITY).
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDatabase } from './harness';

let db: PGlite;

const PROPRIETOR = 'aaaaaaaa-1111-4111-8111-aaaaaaaa1111';
const TEACHER = 'aaaaaaaa-2222-4222-8222-aaaaaaaa2222';
const OTHER_TEACHER = 'aaaaaaaa-5555-5555-8555-aaaaaaaa5555';
const PRINCIPAL = 'aaaaaaaa-3333-4333-8333-aaaaaaaa3333';
const BURSAR = 'aaaaaaaa-4444-4444-8444-aaaaaaaa4444';
const CLASS_TEACHER_EMP = 'bbbbbbbb-1111-4111-8111-bbbbbbbb1111';
const OTHER_TEACHER_EMP = 'bbbbbbbb-2222-4222-8222-bbbbbbbb2222';
const STUDENT_A = 'cccccccc-1111-4111-8111-cccccccc1111';
const STUDENT_B = 'cccccccc-2222-4222-8222-cccccccc2222';

let yearId = '';
let termId = '';
let teacherClassId = '';
let otherClassId = '';
let assessmentPendingId = '';
let assessmentDoneId = '';
let assessmentOtherId = '';
let scienceId = '';
let englishId = '';

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
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

async function singleNumber(
  sql: string,
  role: string,
  userId: string | null,
  column: string,
): Promise<number> {
  const result = await runAs(role, userId, sql);
  const row = result.rows[0];
  return row == null ? 0 : Number(row[column] ?? 0);
}

// ---------------------------------------------------------------------------
// The exact queries the dashboards run, extracted verbatim so the test guards
// what production actually executes.
// ---------------------------------------------------------------------------

const TEACHER_CLASSES_SQL = `
  select c.id, c.name,
         (select count(*)::int from students s
           where s.class_id = c.id and s.status = 'active') as student_count,
         (select count(*)::int from assessments a
           join terms t on t.id = a.term_id
           join academic_years ay on ay.id = t.academic_year_id
          where a.class_id = c.id and ay.is_current) as assessments_this_year,
         (select count(*)::int from assessments a
           join terms t on t.id = a.term_id
           join academic_years ay on ay.id = t.academic_year_id
          where a.class_id = c.id and ay.is_current
            and (select count(*)::int from student_results r where r.assessment_id = a.id)
                < (select count(*)::int from students s
                   where s.class_id = c.id and s.status = 'active')) as pending_marks
    from classes c
    join academic_years ay on ay.id = c.academic_year_id
   where c.status = 'active'
     and c.teacher_id = app_current_employee_id()
     and ay.is_current
   order by lower(btrim(c.name))`;

const TEACHER_PENDING_SQL = `
  select a.id, a.name, cl.name as class_name, su.name as subject_name,
         t.name as term_name, a.max_marks::float8 as max_marks,
         (select count(*)::int from student_results r where r.assessment_id = a.id) as recorded,
         (select count(*)::int from students s
           where s.class_id = cl.id and s.status = 'active') as class_size
    from assessments a
    join classes cl on cl.id = a.class_id
    join subjects su on su.id = a.subject_id
    join terms t on t.id = a.term_id
    join academic_years ay on ay.id = t.academic_year_id
   where cl.teacher_id = app_current_employee_id()
     and cl.status = 'active'
     and ay.is_current
     and (select count(*)::int from student_results r where r.assessment_id = a.id)
         < (select count(*)::int from students s
            where s.class_id = cl.id and s.status = 'active')
   order by a.created_at desc
   limit 5`;

const TEACHER_SUBJECTS_SQL = `
  select distinct su.id, su.name
    from assessments a
    join subjects su on su.id = a.subject_id
    join classes cl on cl.id = a.class_id
    join terms t on t.id = a.term_id
    join academic_years ay on ay.id = t.academic_year_id
   where cl.teacher_id = app_current_employee_id()
     and cl.status = 'active'
     and ay.is_current`;

const PRINCIPAL_OVERVIEW_SQL = `
  select
    (select count(*)::int from students where status = 'active') as active_students,
    (select count(*)::int from classes where status = 'active') as active_classes,
    (select count(*)::int from subjects where status = 'active') as active_subjects,
    (select count(*)::int from assessments a
       join terms t on t.id = a.term_id
       join academic_years ay on ay.id = t.academic_year_id
      where ay.is_current) as assessments_this_year,
    (select count(*)::int from student_results r
       join assessments a on a.id = r.assessment_id
       join terms t on t.id = a.term_id
       join academic_years ay on ay.id = t.academic_year_id
      where ay.is_current) as results_this_year`;

const BURSAR_OVERVIEW_SQL = `
  select
    (select count(*)::int from v_student_fee_balances where is_in_arrears)
      as arrears_count,
    (select coalesce(sum(balance), 0)::bigint from v_student_fee_balances where is_in_arrears)
      as arrears_total,
    (select count(*)::int from expenses where status = 'submitted') as pending_expenses,
    (select count(*)::int from payroll_runs where status = 'under_review')
      as payroll_under_review,
    (select count(*)::int from fee_payments
      where not is_reversed and received_at >= date_trunc('day', now())) as payments_today,
    (select coalesce(sum(amount), 0)::bigint from fee_payments
      where not is_reversed and received_at >= date_trunc('day', now()))
      as payments_today_total`;

beforeAll(async () => {
  db = await migratedDatabase();

  for (const [id, name, role] of [
    [PROPRIETOR, 'Proprietor', 'proprietor'],
    [TEACHER, 'Teacher User', 'teacher'],
    [OTHER_TEACHER, 'Other Teacher User', 'teacher'],
    [PRINCIPAL, 'Principal User', 'principal'],
    [BURSAR, 'Bursar User', 'bursar'],
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

  const { rows: mathRows } = await db.query<{ id: string }>(
    `insert into subjects (name) values ('Mathematics') returning id`,
  );
  const mathId = mathRows[0]!.id;
  const { rows: scienceRows } = await db.query<{ id: string }>(
    `insert into subjects (name) values ('Science') returning id`,
  );
  scienceId = scienceRows[0]!.id;
  const { rows: englishRows } = await db.query<{ id: string }>(
    `insert into subjects (name) values ('English') returning id`,
  );
  englishId = englishRows[0]!.id;

  const { rows: assessmentRows } = await db.query<{ id: string; class_id: string }>(
    `insert into assessments (class_id, subject_id, academic_year_id, term_id, name, max_marks)
     values ($1, $2, $3, $4, 'Quiz 1', 20),            -- teacher class, no marks yet (pending)
            ($5, $6, $3, $4, 'End of Term Test', 100),  -- teacher class, marks recorded (done)
            ($7, $8, $3, $4, 'Mid Term Test', 50)       -- other class, teacher must not see
     returning id, class_id`,
    [teacherClassId, mathId, yearId, termId, teacherClassId, scienceId, otherClassId, englishId],
  );
  const [pending, done, other] = assessmentRows;
  assessmentPendingId = pending!.id;
  assessmentDoneId = done!.id;
  assessmentOtherId = other!.id;

  // Record a mark for every active student in the teacher's class on the
  // "done" assessment so it stops appearing as pending.
  await db.query(
    `insert into student_results (assessment_id, student_id, marks, recorded_by)
     values ($1, $2, 80, $3)`,
    [assessmentDoneId, STUDENT_A, TEACHER],
  );
}, 120_000);

describe('teacher dashboard - classes scoped to the teacher', () => {
  it('returns only the classes the teacher is assigned to teach', async () => {
    const { rows } = await runAs('teacher', TEACHER, TEACHER_CLASSES_SQL);
    expect(rows).toHaveLength(1);
    expect(rows[0]!['name']).toBe('JSS 1A');
    expect(rows[0]!['student_count']).toBe(1);
    expect(rows[0]!['pending_marks']).toBe(1); // only Quiz 1 is unfinished
  });

  it('another teacher sees their own class, not this teacher\u2019s', async () => {
    const { rows } = await runAs('teacher', OTHER_TEACHER, TEACHER_CLASSES_SQL);
    expect(rows).toHaveLength(1);
    expect(rows[0]!['name']).toBe('JSS 2B');
    expect(rows[0]!['student_count']).toBe(1);
    expect(rows[0]!['pending_marks']).toBe(1); // other-class Mid Term Test has no marks
  });
});

describe('teacher dashboard - assessments awaiting marks', () => {
  it('lists only the teacher\u2019s own unfinished assessments in current-year classes', async () => {
    const { rows } = await runAs('teacher', TEACHER, TEACHER_PENDING_SQL);
    expect(rows).toHaveLength(1);
    expect(rows[0]!['id']).toBe(assessmentPendingId);
    expect(rows[0]!['recorded']).toBe(0);
    expect(rows[0]!['class_size']).toBe(1);
  });

  it('excludes a fully-recorded assessment and other-class assessments', async () => {
    const { rows } = await runAs('teacher', TEACHER, TEACHER_PENDING_SQL);
    const ids = rows.map((r) => r['id']);
    expect(ids).not.toContain(assessmentDoneId); // fully recorded
    expect(ids).not.toContain(assessmentOtherId); // not the teacher's class
  });
});

describe('teacher dashboard - subjects taught', () => {
  it('contains only subjects from the teacher\u2019s own assessments', async () => {
    const { rows } = await runAs('teacher', TEACHER, TEACHER_SUBJECTS_SQL);
    const names = rows.map((r) => r['name']).sort();
    expect(names).toEqual(['Mathematics', 'Science']);
    expect(names).not.toContain('English'); // taught only in the other class
  });
});

describe('principal dashboard - school-wide academic overview', () => {
  it('returns school-wide figures when run by the principal', async () => {
    expect(
      await singleNumber(PRINCIPAL_OVERVIEW_SQL, 'principal', PRINCIPAL, 'active_students'),
    ).toBe(2);
    expect(
      await singleNumber(PRINCIPAL_OVERVIEW_SQL, 'principal', PRINCIPAL, 'active_classes'),
    ).toBe(2);
    expect(
      await singleNumber(PRINCIPAL_OVERVIEW_SQL, 'principal', PRINCIPAL, 'assessments_this_year'),
    ).toBe(3);
    expect(
      await singleNumber(PRINCIPAL_OVERVIEW_SQL, 'principal', PRINCIPAL, 'results_this_year'),
    ).toBe(1);
  });

  it('stays RLS-bounded even if a teacher somehow runs the aggregation', async () => {
    // A mis-routed call cannot leak school-wide numbers: students,
    // assessments and results are scoped to the teacher's own classes by RLS.
    // The classes SUBJECT is deliberately school-wide reference data (every
    // role reads the catalog per migration 012 classes_select), so only the
    // class COUNT is un-blurred - but it carries no student or mark data.
    expect(await singleNumber(PRINCIPAL_OVERVIEW_SQL, 'teacher', TEACHER, 'active_students')).toBe(
      1,
    );
    expect(await singleNumber(PRINCIPAL_OVERVIEW_SQL, 'teacher', TEACHER, 'active_classes')).toBe(
      2,
    );
    expect(
      await singleNumber(PRINCIPAL_OVERVIEW_SQL, 'teacher', TEACHER, 'assessments_this_year'),
    ).toBe(2);
    expect(
      await singleNumber(PRINCIPAL_OVERVIEW_SQL, 'teacher', TEACHER, 'results_this_year'),
    ).toBe(1);
  });
});

describe('bursar dashboard - financial overview', () => {
  it('reports the ledger amounts the bursar is permitted to read', async () => {
    const { rows } = await runAs('bursar', BURSAR, BURSAR_OVERVIEW_SQL);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    // With no fee assignments or expenses in the fixture, every figure is a
    // real zero from an empty ledger - the query must still run cleanly.
    expect(Number(row['arrears_count'])).toBe(0);
    expect(Number(row['arrears_total'])).toBe(0);
    expect(Number(row['pending_expenses'])).toBe(0);
    expect(Number(row['payroll_under_review'])).toBe(0);
    expect(Number(row['payments_today'])).toBe(0);
    expect(Number(row['payments_today_total'])).toBe(0);
  });
});
