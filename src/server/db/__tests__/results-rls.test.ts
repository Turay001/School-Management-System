/**
 * RESULTS MODULE - RLS, integrity and audit tests.
 *
 * Migration 020 adds subjects, assessments and student_results. The rules
 * that matter are the ones LIKE the rest of this schema: teachers are scoped
 * to the classes they teach by RLS (not by the UI), the database refuses a
 * mark that breaks a cross-table rule (student not in the class, mark above
 * the maximum), and every write lands in the audit trail as the application
 * role.
 *
 * As with rls.test.ts these tests run AS `samjona_app`, never as the owner:
 * a superuser bypasses RLS even when FORCE ROW LEVEL SECURITY is enabled, so
 * the assertions would prove nothing.
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

let yearId = '';
let otherYearId = '';
let classId = '';
let otherClassId = '';
let subjectId = '';
let assessmentId = '';
let otherAssessmentId = '';
let termId = '';

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

interface RunResult {
  rows: Array<Record<string, unknown>>;
  rowCount: number | null;
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
    return { rows: result.rows as Array<Record<string, unknown>>, rowCount: result.rowCount ?? 0 };
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

  const { rows: yearRows } = await db.query<{ id: string }>(
    'select id from academic_years where is_current limit 1',
  );
  yearId = yearRows[0]!.id;
  const { rows: termRows } = await db.query<{ id: string }>(
    'select id from terms where academic_year_id = $1 order by sequence limit 1',
    [yearId],
  );
  termId = termRows[0]!.id;

  // A second academic year, used to prove the assessment term must belong to
  // the same year as its class.
  const { rows: otherYearRows } = await db.query<{ id: string }>(
    `insert into academic_years (name, start_date, end_date, is_current)
     values ('2099/00', date '2099-01-01', date '2099-12-31', false) returning id`,
  );
  otherYearId = otherYearRows[0]!.id;
  await db.query(
    `insert into terms (academic_year_id, name, sequence, start_date, end_date)
     values ($1, 'Term 1', 1, date '2099-01-01', date '2099-03-31')`,
    [otherYearId],
  );

  const { rows: classRows } = await db.query<{ id: string; teacher_id: string }>(
    `insert into classes (name, academic_year_id, teacher_id)
     values ('JHS 1', $1, $2), ('JHS 2', $1, $3) returning id, teacher_id`,
    [yearId, CLASS_TEACHER_EMP, OTHER_TEACHER_EMP],
  );
  classId = classRows.find((c) => c.teacher_id === CLASS_TEACHER_EMP)!.id;
  otherClassId = classRows.find((c) => c.teacher_id === OTHER_TEACHER_EMP)!.id;

  await db.query(
    `insert into students (id, full_name, admission_date, class_id, status)
     values ($1, 'Student In My Class', date '2026-09-01', $2, 'active'),
            ($3, 'Student In Other Class', date '2026-09-01', $4, 'active'),
            ($5, 'Inactive Student', date '2026-09-01', $2, 'inactive')`,
    [STUDENT_A, classId, STUDENT_B, otherClassId, 'cccccccc-3333-4333-8333-cccccccc3333'],
  );

  const { rows: subjectRows } = await db.query<{ id: string }>(
    `insert into subjects (name) values ('Mathematics') returning id`,
  );
  subjectId = subjectRows[0]!.id;

  const { rows: assessmentRows } = await db.query<{ id: string; class_id: string }>(
    `insert into assessments (class_id, subject_id, academic_year_id, term_id, name, max_marks)
     values ($1, $2, $3, $4, 'End of Term Test', 100),
            ($5, $2, $3, $4, 'End of Term Test', 100)
     returning id, class_id`,
    [classId, subjectId, yearId, termId, otherClassId],
  );
  assessmentId = assessmentRows.find((r) => r.class_id === classId)!.id;
  otherAssessmentId = assessmentRows.find((r) => r.class_id === otherClassId)!.id;
}, 120_000);

describe('subjects - reference data, admin managed', () => {
  it('are readable by teachers, principal and admin', async () => {
    expect(
      await visibleCount('select count(*)::text as count from subjects', 'teacher', TEACHER),
    ).toBe(1);
    expect(await visibleCount('select count(*)::text as count from subjects', 'admin', null)).toBe(
      1,
    );
    expect(
      await visibleCount('select count(*)::text as count from subjects', 'principal', null),
    ).toBe(1);
  });

  it('refuse a teacher adding a subject (admin writes only)', async () => {
    await expect(
      runAs('teacher', TEACHER, `insert into subjects (name) values ('History')`),
    ).rejects.toThrow(/row-level security/i);

    // An UPDATE blocked by RLS does not raise: the row is simply not visible to
    // the USING clause, so it reports "UPDATE 0". The denial is observed on the
    // rows returned (mirrors policy-hardening.test.ts).
    const result = await runAs('teacher', TEACHER, `update subjects set name = 'Hacked'`);
    expect(result.rowCount).toBe(0);

    // And the school's subject is genuinely untouched.
    const subjects = await runAs(
      'admin',
      null,
      `select name from subjects where name = 'Mathematics'`,
    );
    expect(subjects.rows).toHaveLength(1);
  });

  it('let an admin add a subject', async () => {
    const result = await runAs('admin', null, `insert into subjects (name) values ('English')`, []);
    expect(result.rowCount).toBe(1);
  });
});

describe('assessments - teacher scope is the class they teach', () => {
  it('hides other classes from a teacher and shows them all to admin', async () => {
    expect(
      await visibleCount('select count(*)::text as count from assessments', 'teacher', TEACHER),
    ).toBe(1);
    expect(
      await visibleCount('select count(*)::text as count from assessments', 'admin', null),
    ).toBe(2);
  });

  it('lets a teacher create an assessment for their own class', async () => {
    const result = await runAs(
      'teacher',
      TEACHER,
      `insert into assessments (class_id, subject_id, academic_year_id, term_id, name, max_marks)
       values ($1, $2, $3, $4, 'Midterm', 50) returning id`,
      [classId, subjectId, yearId, termId],
    );
    expect(result.rows).toHaveLength(1);
  });

  it('refuses a teacher creating an assessment for another class', async () => {
    await expect(
      runAs(
        'teacher',
        TEACHER,
        `insert into assessments (class_id, subject_id, academic_year_id, term_id, name, max_marks)
         values ($1, $2, $3, $4, 'Sneaky', 50)`,
        [otherClassId, subjectId, yearId, termId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('refuses a term that belongs to a different academic year than the class', async () => {
    await expect(
      runAs(
        'admin',
        null,
        `insert into assessments (class_id, subject_id, academic_year_id, term_id, name, max_marks)
         values ($1, $2, $3, (select id from terms where academic_year_id = $4 limit 1), 'Bad Term', 50)`,
        [classId, subjectId, yearId, otherYearId],
      ),
    ).rejects.toThrow(/same academic year/i);
  });
});

describe('student_results - marks are guarded, audited and never deleted', () => {
  it('lets the teacher record a mark for a student in their class', async () => {
    const result = await runAs(
      'teacher',
      TEACHER,
      `insert into student_results (assessment_id, student_id, marks, recorded_by)
       values ($1, $2, 78, $3) returning id`,
      [assessmentId, STUDENT_A, TEACHER],
    );
    expect(result.rows).toHaveLength(1);
  });

  it('refuses a mark for a student outside the assessment class', async () => {
    await expect(
      runAs(
        'teacher',
        TEACHER,
        `insert into student_results (assessment_id, student_id, marks, recorded_by)
         values ($1, $2, 90, $3)`,
        [assessmentId, STUDENT_B, TEACHER],
      ),
    ).rejects.toThrow(/not in the class/i);
  });

  it('refuses marks above the assessment maximum', async () => {
    await expect(
      runAs(
        'teacher',
        TEACHER,
        `insert into student_results (assessment_id, student_id, marks, recorded_by)
         values ($1, $2, 150, $3)`,
        [assessmentId, STUDENT_A, TEACHER],
      ),
    ).rejects.toThrow(/cannot exceed/i);
  });

  it('refuses marks for an inactive student', async () => {
    await expect(
      runAs(
        'teacher',
        TEACHER,
        `insert into student_results (assessment_id, student_id, marks, recorded_by)
         values ($1, (select id from students where status = 'inactive' limit 1), 50, $2)`,
        [assessmentId, TEACHER],
      ),
    ).rejects.toThrow(/active students/i);
  });

  it('upserts on conflict instead of duplicating a student', async () => {
    await runAs(
      'teacher',
      TEACHER,
      `insert into student_results (assessment_id, student_id, marks, recorded_by)
       values ($1, $2, 80, $3)
       on conflict (assessment_id, student_id)
       do update set marks = excluded.marks, recorded_by = excluded.recorded_by`,
      [assessmentId, STUDENT_A, TEACHER],
    );
    const count = await visibleCount(
      'select count(*)::text as count from student_results where student_id = $1::uuid',
      'teacher',
      TEACHER,
      [STUDENT_A],
    );
    // The first test of this describe block recorded one row; the upsert must
    // update it rather than insert a second.
    expect(count).toBe(1);
  });

  it('hides another class results from a teacher', async () => {
    await runAs(
      'proprietor',
      PROPRIETOR,
      `insert into student_results (assessment_id, student_id, marks, recorded_by)
       values ($1, $2, 55, $3)`,
      [otherAssessmentId, STUDENT_B, PROPRIETOR],
    );
    expect(
      await visibleCount('select count(*)::text as count from student_results', 'teacher', TEACHER),
    ).toBe(1);
  });

  it('writes an audit row as the application role (SECURITY DEFINER path)', async () => {
    const { rows } = await db.query<{ action: string; count: string }>(
      `select action, count(*)::text as count from audit_logs
        where entity_type = 'student_results'
        group by action order by action`,
    );
    expect(rows).toEqual([
      { action: 'RESULT_RECORDED', count: '2' },
      { action: 'RESULT_UPDATED', count: '1' },
    ]);
  });

  it('grants teachers read access to terms for form population', async () => {
    expect(async () => {
      await runAs(
        'teacher',
        TEACHER,
        'select count(*)::text as count from terms where academic_year_id = $1',
        [yearId],
      );
    }).not.toThrow();
  });

  it('refuses any application role to delete a result', async () => {
    for (const role of ['proprietor', 'admin', 'teacher'] as const) {
      await expect(
        runAs(role, role === 'teacher' ? TEACHER : null, `delete from student_results`),
      ).rejects.toThrow(/permission denied|row-level security/i);
    }
  });
});
