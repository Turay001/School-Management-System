import 'server-only';

import { z } from 'zod';

import { assertPermission, type SessionUser } from '../auth/permissions';
import { findCurrentTerm } from '../db/current-term';
import type { Queryable } from '../db/pool';
import { withUserContext } from '../db/transaction';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PreconditionError,
  ValidationError,
} from '../../lib/errors';

/**
 * RESULTS MODULE - service layer
 * ==============================
 * Assessments (a named test within a class, subject and term), student marks
 * against them, and report cards aggregated from the raw marks.
 *
 * NO GRADING RULES EXIST HERE. The school has not confirmed a grading scale,
 * pass marks, weighting or ranking, so nothing invents one. Percentages are
 * computed over assessments that actually have a recorded mark for the
 * student in question, and nothing else is derived.
 *
 * Access control is RLS-first: teachers are scoped to the classes they teach
 * by database policy (migrations 020/012), and this service adds the
 * permission checks the UI should not bypass even with a valid row.
 */

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const subjectNameSchema = z
  .string()
  .trim()
  .min(1, 'A subject needs a name.')
  .max(80, 'Keep the subject name under 80 characters.');

const assessmentSchema = z.object({
  classId: z.string().uuid('Choose a class.'),
  subjectId: z.string().uuid('Choose a subject.'),
  termId: z.string().uuid('Choose a term.'),
  name: z
    .string()
    .trim()
    .min(1, 'Give the assessment a name, e.g. "End of Term Test".')
    .max(80, 'Keep the assessment name under 80 characters.'),
  maxMarks: z
    .number()
    .finite('Enter a maximum mark.')
    .positive('The maximum mark must be greater than zero.'),
  heldOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid date.')
    .nullable()
    .optional(),
});

const saveMarksSchema = z.object({
  assessmentId: z.string().uuid(),
  results: z.array(
    z.object({
      studentId: z.string().uuid(),
      marks: z.number().finite('Enter a number.').min(0, 'Marks cannot be negative.'),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Shared row shapes
// ---------------------------------------------------------------------------

export interface SubjectRow {
  id: string;
  code: string;
  name: string;
  status: string;
}

export interface AcademicOptions {
  yearId: string;
  yearName: string;
  /**
   * The term the school is in today, or `''` when no term has been defined.
   *
   * Present so a screen with no term chosen can open on the right one. The
   * `terms` list is ordered `sequence asc` for the picker's own sake, which
   * makes `terms[0]` Term 1 - right for a school in Term 1, and last term's
   * grades for a school in Term 3. Defaulting to `terms[0]` was that bug;
   * `currentTermId` is the fix, and it is one field rather than a rule each
   * caller reimplements. See `db/current-term.ts`.
   */
  currentTermId: string;
  terms: Array<{ id: string; name: string }>;
  classes: Array<{ id: string; name: string }>;
  subjects: SubjectRow[];
}

export interface AssessmentListRow {
  id: string;
  code: string;
  name: string;
  className: string;
  subjectName: string;
  termName: string;
  yearName: string;
  maxMarks: number;
  heldOn: string | null;
  recordedCount: number;
  classSize: number | null;
  average: number | null;
}

export interface AssessmentRosterStudent {
  id: string;
  studentCode: string;
  fullName: string;
  marks: number | null;
  recordedAt: string | null;
}

export interface AssessmentDetail {
  id: string;
  code: string;
  name: string;
  className: string;
  classId: string;
  subjectName: string;
  termName: string;
  termId: string;
  yearName: string;
  maxMarks: number;
  heldOn: string | null;
  createdByName: string | null;
  students: AssessmentRosterStudent[];
}

export interface UploadSummary {
  imported: number;
  updated: number;
  skipped: Array<{ studentCode: string; reason: string }>;
  fileLineCount: number;
}

export interface ReportCardEntry {
  assessmentId: string;
  assessmentName: string;
  maxMarks: number;
  heldOn: string | null;
  marks: number | null;
}

export interface ReportCardSubject {
  subjectId: string;
  subjectName: string;
  entries: ReportCardEntry[];
  marksTotal: number;
  maxTotal: number;
  /** Percentage over recorded marks only, or null when nothing is recorded. */
  percentage: number | null;
}

export interface ReportCardStudent {
  studentId: string;
  studentCode: string;
  fullName: string;
  subjects: ReportCardSubject[];
  overallTotal: number;
  overallMax: number;
  overallPercentage: number | null;
}

export interface StudentCard {
  student: ReportCardStudent;
  studentName: string;
  studentCode: string;
  className: string;
  termName: string;
  yearName: string;
  note: string;
}

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------

export async function listSubjects(
  user: SessionUser,
  opts: { includeInactive?: boolean } = {},
): Promise<SubjectRow[]> {
  assertPermission(user, 'subjects:read');
  return withUserContext(user, async (tx) => {
    const { rows } = await tx.query<SubjectRow>(
      `select id, code, name, status
         from subjects
        where status = 'active' or $1::boolean
        order by lower(btrim(name))`,
      [opts.includeInactive ?? false],
    );
    return rows.map((r) => ({ ...r }));
  });
}

export async function createSubject(user: SessionUser, input: unknown): Promise<{ id: string }> {
  assertPermission(user, 'subjects:manage');
  const parsed = subjectNameSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('The subject could not be saved.', {
      details: { name: parsed.error.issues.map((i) => i.message) },
    });
  }
  const name = parsed.data;

  return withUserContext(user, async (tx) => {
    const exists = await tx.query<{ id: string }>(
      `select id from subjects where lower(btrim(name)) = lower($1) limit 1`,
      [name],
    );
    if (exists.rows[0]) {
      throw new ConflictError('That subject is already on the list.');
    }
    const { rows } = await tx.query<{ id: string }>(
      `insert into subjects (name) values ($1) returning id`,
      [name],
    );
    return { id: rows[0]!.id };
  });
}

// ---------------------------------------------------------------------------
// Form options (calendar, classes, subjects)
// ---------------------------------------------------------------------------

export async function getAcademicOptions(user: SessionUser): Promise<AcademicOptions> {
  assertPermission(user, 'subjects:read');
  return withUserContext(user, async (tx) => {
    const year = await tx.query<{ id: string; name: string }>(
      `select id, name from academic_years where is_current limit 1`,
    );
    const yearId = year.rows[0]?.id ?? null;
    const terms = yearId
      ? await tx.query<{ id: string; name: string }>(
          `select id, name from terms where academic_year_id = $1 order by sequence`,
          [yearId],
        )
      : { rows: [] };
    const classes = await tx.query<{ id: string; name: string }>(
      `select id, name from classes where status = 'active' order by lower(btrim(name))`,
    );
    const subjects = await tx.query<SubjectRow>(
      `select id, code, name, status from subjects where status = 'active' order by lower(btrim(name))`,
    );
    return {
      yearId: yearId ?? '',
      yearName: year.rows[0]?.name ?? '',
      currentTermId: (await findCurrentTerm(tx))?.id ?? '',
      terms: terms.rows,
      classes: classes.rows,
      subjects: subjects.rows,
    };
  });
}

// ---------------------------------------------------------------------------
// Assessments
// ---------------------------------------------------------------------------

export async function getReportCardOptions(user: SessionUser): Promise<AcademicOptions> {
  assertPermission(user, 'reportcards:read');
  return getAcademicOptions(user);
}

export interface AssessmentListQuery {
  classId?: string;
  subjectId?: string;
  termId?: string;
  page?: number;
  pageSize?: number;
}

export interface AssessmentListResult {
  rows: AssessmentListRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listAssessments(
  user: SessionUser,
  query: AssessmentListQuery = {},
): Promise<AssessmentListResult> {
  assertPermission(user, 'results:read');
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 15));
  const offset = (page - 1) * pageSize;

  return withUserContext(user, async (tx) => {
    const where: string[] = [];
    const params: unknown[] = [];
    if (query.classId) {
      params.push(query.classId);
      where.push(`a.class_id = $${params.length}`);
    }
    if (query.subjectId) {
      params.push(query.subjectId);
      where.push(`a.subject_id = $${params.length}`);
    }
    if (query.termId) {
      params.push(query.termId);
      where.push(`a.term_id = $${params.length}`);
    }
    const whereSql = where.length > 0 ? `where ${where.join(' and ')}` : '';

    const { rows: totalRows } = await tx.query<{ count: string }>(
      `select count(*)::text as count from assessments a ${whereSql}`,
      params,
    );
    const total = Number(totalRows[0]?.count ?? 0);

    const { rows } = await tx.query(
      `select
         a.id, a.code, a.name,
         cl.name as class_name, su.name as subject_name,
         t.name as term_name, ay.name as year_name,
         a.max_marks::float8 as max_marks, a.held_on,
         count(r.id)::int as recorded_count,
         (select count(*)::int from students s
           where s.class_id = a.class_id and s.status = 'active') as class_size,
         avg(r.marks)::float8 as average
       from assessments a
       join classes cl on cl.id = a.class_id
       join subjects su on su.id = a.subject_id
       join terms t on t.id = a.term_id
       join academic_years ay on ay.id = a.academic_year_id
       left join student_results r on r.assessment_id = a.id
       ${whereSql}
       group by a.id, cl.name, su.name, t.name, ay.name
       order by a.created_at desc, a.name
       limit ${pageSize} offset ${offset}`,
      params,
    );

    return {
      rows: rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        className: r.class_name,
        subjectName: r.subject_name,
        termName: r.term_name,
        yearName: r.year_name,
        maxMarks: Number(r.max_marks),
        heldOn: r.held_on,
        recordedCount: Number(r.recorded_count),
        classSize: r.class_size == null ? null : Number(r.class_size),
        average: r.average == null ? null : Number(r.average),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  });
}

export async function getAssessmentDetail(
  user: SessionUser,
  assessmentId: string,
): Promise<AssessmentDetail> {
  assertPermission(user, 'results:read');
  return withUserContext(user, async (tx) => {
    const { rows } = await tx.query(
      `select
         a.id, a.code, a.name, a.class_id, a.term_id,
         a.max_marks::float8 as max_marks, a.held_on,
         cl.name as class_name, su.name as subject_name,
         t.name as term_name, ay.name as year_name,
         u.full_name as created_by_name
       from assessments a
       join classes cl on cl.id = a.class_id
       join subjects su on su.id = a.subject_id
       join terms t on t.id = a.term_id
       join academic_years ay on ay.id = a.academic_year_id
       left join app_users u on u.id = a.created_by
       where a.id = $1`,
      [assessmentId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundError('Assessment');

    const students = await tx.query(
      `select
         s.id, s.student_code, s.full_name,
         r.marks::float8 as marks, r.recorded_at
       from students s
       left join student_results r on r.assessment_id = $1 and r.student_id = s.id
       where s.class_id = $2 and s.status = 'active'
       order by lower(btrim(s.full_name))`,
      [assessmentId, row.class_id],
    );

    return {
      id: row.id,
      code: row.code,
      name: row.name,
      classId: row.class_id,
      className: row.class_name,
      termId: row.term_id,
      termName: row.term_name,
      yearName: row.year_name,
      subjectName: row.subject_name,
      maxMarks: Number(row.max_marks),
      heldOn: row.held_on,
      createdByName: row.created_by_name,
      students: students.rows.map((s) => ({
        id: s.id,
        studentCode: s.student_code,
        fullName: s.full_name,
        marks: s.marks == null ? null : Number(s.marks),
        recordedAt: s.recorded_at,
      })),
    };
  });
}

export async function createAssessment(
  user: SessionUser,
  input: unknown,
): Promise<{ id: string; code: string }> {
  assertPermission(user, 'results:record');
  const parsed = assessmentSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('The assessment could not be saved.', {
      details: Object.fromEntries(
        Object.entries(parsed.error.flatten().fieldErrors).map(([key, msgs]) => [key, msgs ?? []]),
      ),
    });
  }
  const { classId, subjectId, termId, name, maxMarks, heldOn } = parsed.data;

  return withUserContext(user, async (tx) => {
    const dup = await tx.query<{ id: string }>(
      `select id from assessments
        where class_id = $1 and term_id = $2 and subject_id = $3 and name = $4
        limit 1`,
      [classId, termId, subjectId, name],
    );
    if (dup.rows[0]) {
      throw new ConflictError(
        'An assessment with this name already exists for that subject, class and term.',
      );
    }

    const { rows } = await tx.query<{ id: string; code: string }>(
      `insert into assessments
         (class_id, subject_id, academic_year_id, term_id, name, max_marks, held_on, created_by)
       select $1, $2, c.academic_year_id, $3, $4, $5, $6::date, $7
         from classes c where c.id = $1
       returning id, code`,
      [classId, subjectId, termId, name, maxMarks, heldOn ?? null, user.id],
    );
    if (!rows[0]) {
      throw new ForbiddenError('Your role does not allow creating this assessment.');
    }
    return { id: rows[0].id, code: rows[0].code };
  });
}

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

async function getAssessmentMaxMarks(tx: Queryable, assessmentId: string): Promise<number> {
  const { rows } = await tx.query<{ max_marks: string }>(
    `select max_marks::text as max_marks from assessments where id = $1`,
    [assessmentId],
  );
  const value = rows[0];
  if (!value) throw new NotFoundError('Assessment');
  return Number(value.max_marks);
}

export async function saveMarks(user: SessionUser, input: unknown): Promise<{ saved: number }> {
  assertPermission(user, 'results:record');
  const parsed = saveMarksSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('The marks could not be saved.', {
      details: parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>,
    });
  }
  const { assessmentId, results } = parsed.data;

  return withUserContext(user, async (tx) => {
    const maxMarks = await getAssessmentMaxMarks(tx, assessmentId);
    const tooHigh = results.filter((r) => r.marks > maxMarks);
    if (tooHigh.length > 0) {
      throw new ValidationError(`Some marks exceed the assessment maximum of ${maxMarks}.`, {
        details: { rows: tooHigh.map((r) => ({ studentId: r.studentId, message: 'Too high.' })) },
      });
    }
    if (results.length === 0) return { saved: 0 };

    let saved = 0;
    for (const r of results) {
      const { rowCount } = await tx.query(
        `insert into student_results (assessment_id, student_id, marks, recorded_by)
         values ($1, $2, $3, $4)
         on conflict (assessment_id, student_id)
         do update set marks = excluded.marks, recorded_by = excluded.recorded_by`,
        [assessmentId, r.studentId, r.marks, user.id],
      );
      saved += rowCount ?? 0;
    }
    return { saved };
  });
}

// ---------------------------------------------------------------------------
// CSV upload
// ---------------------------------------------------------------------------

/**
 * Parse a class-roll CSV: one student per line, `student_code,marks`.
 * An optional header line is tolerated (matched by name), blank lines are
 * skipped, and a line that cannot be read is reported rather than throwing.
 */
export function parseMarksCsv(
  csvText: string,
): Array<{ studentCode: string; marks: number | null; raw: string }> {
  const lines = csvText.split(/\r?\n/);
  const rows: Array<{ studentCode: string; marks: number | null; raw: string }> = [];

  lines.forEach((line, index) => {
    const raw = line.trim();
    if (!raw || raw.startsWith('#')) return;
    if (index === 0) {
      const first = raw.split(',')[0]?.trim().toLowerCase() ?? '';
      if (first === 'student_code' || first === 'studentcode' || first === 'code') return;
    }
    const parts = raw.split(',');
    const studentCode = parts[0]?.trim() ?? '';
    const marksText = parts[1]?.trim() ?? '';
    if (!studentCode) return;

    if (!marksText) {
      rows.push({ studentCode, marks: null, raw });
      return;
    }
    const marks = Number(marksText);
    rows.push({ studentCode, marks: Number.isFinite(marks) && marks >= 0 ? marks : null, raw });
  });
  return rows;
}

export async function uploadResultsFromCsv(
  user: SessionUser,
  assessmentId: string,
  csvText: string,
): Promise<UploadSummary> {
  assertPermission(user, 'results:record');
  const parsed = parseMarksCsv(csvText);
  const fileLineCount = parsed.length;

  return withUserContext(user, async (tx) => {
    await getAssessmentMaxMarks(tx, assessmentId);

    const roster = await tx.query<{ id: string; student_code: string }>(
      `select s.id, s.student_code
         from students s
         join assessments a on a.class_id = s.class_id and a.id = $1
        where s.status = 'active'`,
      [assessmentId],
    );
    const byCode = new Map(roster.rows.map((r) => [r.student_code, r.id]));
    const byId = new Map(roster.rows.map((r) => [r.id, r.student_code]));

    const matched: Array<{ studentId: string; marks: number | null }> = [];
    const skipped: Array<{ studentCode: string; reason: string }> = [];
    const seen = new Set<string>();

    for (const row of parsed) {
      const studentId = byCode.get(row.studentCode) ?? byId.get(row.studentCode);
      if (!studentId) {
        skipped.push({
          studentCode: row.studentCode,
          reason: 'Not an active student in this class.',
        });
        continue;
      }
      if (seen.has(studentId)) {
        skipped.push({ studentCode: byId.get(studentId)!, reason: 'Duplicate line in the file.' });
        continue;
      }
      seen.add(studentId);
      if (row.marks === null) {
        skipped.push({
          studentCode: row.studentCode,
          reason: 'Marks column is empty or not a number.',
        });
        continue;
      }
      matched.push({ studentId, marks: row.marks });
    }

    if (matched.length === 0) {
      return { imported: 0, updated: 0, skipped, fileLineCount };
    }

    let imported = 0;
    let updated = 0;
    for (const m of matched) {
      const existing = await tx.query<{ id: string }>(
        `select id from student_results where assessment_id = $1 and student_id = $2 limit 1`,
        [assessmentId, m.studentId],
      );
      const { rowCount } = await tx.query(
        `insert into student_results (assessment_id, student_id, marks, recorded_by)
         values ($1, $2, $3, $4)
         on conflict (assessment_id, student_id)
         do update set marks = excluded.marks, recorded_by = excluded.recorded_by`,
        [assessmentId, m.studentId, m.marks, user.id],
      );
      if (existing.rows[0]) updated += 1;
      else imported += rowCount ?? 0;
    }

    return { imported, updated, skipped, fileLineCount };
  });
}

// ---------------------------------------------------------------------------
// Report cards
// ---------------------------------------------------------------------------

interface RawReportRow {
  student_id: string;
  subject_id: string;
  subject_name: string;
  assessment_id: string;
  assessment_name: string;
  max_marks: number;
  held_on: string | null;
  marks: number | null;
}

/** Aggregate raw rows into per-student report cards. Pure; shared by readers. */
function aggregateReportCards(
  students: Array<{ id: string; student_code: string; full_name: string }>,
  raw: RawReportRow[],
): ReportCardStudent[] {
  const byStudent = new Map<string, Map<string, ReportCardSubject>>();

  for (const row of raw) {
    let student = byStudent.get(row.student_id);
    if (!student) {
      student = new Map();
      byStudent.set(row.student_id, student);
    }
    let subject = student.get(row.subject_id);
    if (!subject) {
      subject = {
        subjectId: row.subject_id,
        subjectName: row.subject_name,
        entries: [],
        marksTotal: 0,
        maxTotal: 0,
        percentage: null,
      };
      student.set(row.subject_id, subject);
    }
    subject.entries.push({
      assessmentId: row.assessment_id,
      assessmentName: row.assessment_name,
      maxMarks: Number(row.max_marks),
      heldOn: row.held_on,
      marks: row.marks == null ? null : Number(row.marks),
    });
  }

  return students.map((s) => {
    const subjectMap = byStudent.get(s.id) ?? new Map();
    const subjects: ReportCardSubject[] = [];
    let overallTotal = 0;
    let overallMax = 0;

    for (const subject of subjectMap.values()) {
      let marksTotal = 0;
      let maxTotal = 0;
      for (const e of subject.entries) {
        if (e.marks !== null) {
          marksTotal += e.marks;
          maxTotal += e.maxMarks;
        }
      }
      const percentage = maxTotal > 0 ? (marksTotal / maxTotal) * 100 : null;
      subjects.push({
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        entries: subject.entries,
        marksTotal,
        maxTotal,
        percentage,
      });
      overallTotal += marksTotal;
      overallMax += maxTotal;
    }

    return {
      studentId: s.id,
      studentCode: s.student_code,
      fullName: s.full_name,
      subjects,
      overallTotal,
      overallMax,
      overallPercentage: overallMax > 0 ? (overallTotal / overallMax) * 100 : null,
    };
  });
}

function loadReportRows(
  tx: Queryable,
  termId: string,
  classId: string,
): Promise<{ rows: RawReportRow[] }> {
  return tx.query(
    `select
       s.id as student_id,
       sub.id as subject_id, sub.name as subject_name,
       a.id as assessment_id, a.name as assessment_name,
       a.max_marks::float8 as max_marks, a.held_on,
       r.marks::float8 as marks
     from students s
     join assessments a on a.class_id = s.class_id and a.term_id = $1
     join subjects sub on sub.id = a.subject_id
     left join student_results r on r.assessment_id = a.id and r.student_id = s.id
     where s.class_id = $2 and s.status = 'active'
     order by lower(btrim(sub.name)), a.held_on nulls last, a.created_at, a.name`,
    [termId, classId],
  );
}

export async function getClassReportCard(
  user: SessionUser,
  query: { classId: string; termId: string },
): Promise<ReportCardStudent[]> {
  assertPermission(user, 'reportcards:read');
  const { classId, termId } = query;

  return withUserContext(user, async (tx) => {
    const students = await tx.query<{ id: string; student_code: string; full_name: string }>(
      `select id, student_code, full_name
         from students
        where class_id = $1 and status = 'active'
        order by lower(btrim(full_name))`,
      [classId],
    );
    const raw = await loadReportRows(tx, termId, classId);
    return aggregateReportCards(students.rows, raw.rows);
  });
}

export async function getStudentReportCard(
  user: SessionUser,
  studentId: string,
  termId: string,
): Promise<StudentCard> {
  assertPermission(user, 'reportcards:read');

  return withUserContext(user, async (tx) => {
    const meta = await tx.query<{
      id: string;
      full_name: string;
      student_code: string;
      class_id: string;
      class_name: string;
      term_name: string;
      year_name: string;
    }>(
      `select
         s.id, s.full_name, s.student_code, s.class_id,
         cl.name as class_name,
         t.name as term_name, ay.name as year_name
       from students s
       join classes cl on cl.id = s.class_id
       cross join terms t
       join academic_years ay on ay.id = t.academic_year_id
       where s.id = $1 and t.id = $2 and s.status = 'active'`,
      [studentId, termId],
    );
    const row = meta.rows[0];
    if (!row) throw new NotFoundError('Student or term');

    const raw = await loadReportRows(tx, termId, row.class_id);
    const cards = aggregateReportCards(
      [
        {
          id: row.id,
          student_code: row.student_code,
          full_name: row.full_name,
        },
      ],
      raw.rows,
    );
    const card = cards[0];
    if (!card || card.subjects.length === 0) {
      throw new PreconditionError('That student has no recorded results for this term.');
    }

    return {
      student: card,
      studentName: row.full_name,
      studentCode: row.student_code,
      className: row.class_name,
      termName: row.term_name,
      yearName: row.year_name,
      note: 'Percentages are computed over assessments that have a recorded mark. Grading bands and class position await school confirmation.',
    };
  });
}
