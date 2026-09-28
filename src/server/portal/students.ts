import 'server-only';

import { z } from 'zod';

import { assertPermission, can, canAny, type SessionUser } from '../auth/permissions';
import type { Queryable } from '../db/pool';
import { withUserContext } from '../db/transaction';
import type { Guardian, Student, StudentStatus } from '../db/types';
import { STUDENT_STATUSES } from '../db/types';
import { ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors';

/**
 * STUDENTS MODULE - service layer
 * ================================
 * The only path from route handlers to student records in one transaction.
 * RLS decides which rows are visible: roles with `students:read` see
 * everyone, teachers with `students:read_own_class` see only the students in
 * classes they teach. Reads and writes carry that context via
 * `withUserContext`.
 */

export interface StudentRow {
  id: string;
  studentCode: string;
  fullName: string;
  gender: 'male' | 'female' | 'other' | null;
  className: string | null;
  classId: string | null;
  admissionDate: string;
  status: StudentStatus;
}

export interface StudentListResult {
  rows: StudentRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface StudentListOptions {
  q?: string;
  status?: string;
  classId?: string;
  page?: number;
  pageSize?: number;
}

export interface StudentDetail extends Omit<Student, 'createdBy' | 'updatedAt'> {
  guardians: Guardian[];
  classCode: string | null;
  className: string | null;
  /**
   * Recent term balances derived from the fee ledger. ONLY present when the
   * caller has `fees:read` (Proprietor, Bursar, Principal). For every other
   * role the key is absent entirely - the ledger is not even queried - so a
   * teacher's student record can never contain a fee figure, a balance, or
   * "in arrears" state. Absent is different from `[]`: an empty list would
   * still reveal that a student has no balance.
   */
  feeBalances?: StudentFeeBalanceRow[];
}

export interface StudentFeeBalanceRow {
  academicYear: string;
  term: string;
  balance: number;
  isInArrears: boolean;
}

export interface CreateStudentResult {
  studentId: string;
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const GUARDIAN_SCHEMA = z.object({
  fullName: z.string().trim().min(2, 'Enter the guardian name').max(120),
  phone: z.string().trim().min(3, 'Enter a phone number').max(30),
  email: z.string().trim().toLowerCase().max(120).nullable().optional(),
  relationship: z.string().trim().max(40).nullable().optional(),
  isPrimary: z.boolean().default(false),
});

const CREATE_STUDENT_SCHEMA = z.object({
  fullName: z.string().trim().min(2, 'Enter the full name').max(120),
  gender: z.enum(['male', 'female', 'other']).nullable().optional(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date format YYYY-MM-DD')
    .nullable()
    .optional(),
  admissionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date format YYYY-MM-DD'),
  classId: z.string().uuid('Choose a class').nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  guardians: z.array(GUARDIAN_SCHEMA).max(3, 'You can add up to three guardians'),
});

const STUDENT_STATUS_SCHEMA = z.object({
  status: z.enum(STUDENT_STATUSES as unknown as [StudentStatus, ...StudentStatus[]]),
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createStudent(user: SessionUser, raw: unknown): Promise<CreateStudentResult> {
  assertPermission(user, 'students:write');

  const parsed = CREATE_STUDENT_SCHEMA.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      'Some student details are incorrect. Please fix the highlighted fields and try again.',
      flattenZod(parsed.error),
    );
  }
  const input = parsed.data;

  const today = new Date().toISOString().slice(0, 10);
  if (input.admissionDate > today) {
    throw new ValidationError('Admission date cannot be in the future.');
  }
  if (input.dateOfBirth && input.dateOfBirth > today) {
    throw new ValidationError('Date of birth cannot be in the future.');
  }
  if (input.dateOfBirth && input.dateOfBirth > input.admissionDate) {
    throw new ValidationError('Admission date cannot be before the date of birth.');
  }

  const primaryCount = input.guardians.filter((g) => g.isPrimary).length;
  if (primaryCount > 1) {
    throw new ValidationError('Only one guardian can be marked as primary.');
  }

  return withUserContext(user, async (tx) => {
    // The database assigns STU-#### via its sequence - omit the code so the
    // default applies rather than writing null into a not-null column.
    const { rows } = await tx.query<{ id: string }>(
      `insert into students
         (full_name, gender, date_of_birth, admission_date, class_id, notes, created_by)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [
        input.fullName,
        input.gender ?? null,
        input.dateOfBirth ?? null,
        input.admissionDate,
        input.classId ?? null,
        input.notes ?? null,
        user.id,
      ],
    );
    const studentId = rows[0]?.id;
    if (!studentId) {
      throw new Error('Insert into students returned no row. The record was not created.');
    }

    // Guardians are reads/writes on the same transaction client - sequential,
    // never Promise.all (pg forbids a second in-flight query on one client).
    for (const guardian of input.guardians) {
      await tx.query(
        `insert into guardians
           (student_id, full_name, phone, email, relationship, is_primary)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          studentId,
          guardian.fullName,
          guardian.phone,
          guardian.email ?? null,
          guardian.relationship ?? null,
          guardian.isPrimary,
        ],
      );
    }

    return { studentId };
  });
}

export async function updateStudentStatus(
  user: SessionUser,
  id: string,
  raw: unknown,
): Promise<{ studentId: string }> {
  assertPermission(user, 'students:write');

  const parsed = STUDENT_STATUS_SCHEMA.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      'Choose a valid student status.',
      flattenZod(parsed.error),
    );
  }
  const { status } = parsed.data;

  return withUserContext(user, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `update students set status = $2, updated_at = now()
        where id = $1
        returning id`,
      [id, status],
    );
    // `null` means "does not exist" or "RLS hides it from you". Not found is
    // the safe answer for both - it reveals nothing about records the caller
    // may not see.
    if (!rows[0]) throw new NotFoundError('Student', id);
    return { studentId: rows[0].id };
  });
}

// ---------------------------------------------------------------------------
// Reads (user context)
// ---------------------------------------------------------------------------

export async function listStudents(
  user: SessionUser,
  options: StudentListOptions = {},
): Promise<StudentListResult> {
  if (!canAny(user, ['students:read', 'students:read_own_class'])) {
    throw new ForbiddenError('Your role does not allow viewing student records.');
  }

  const q = options.q?.trim().slice(0, 100) ?? '';
  const status = STUDENT_STATUSES.includes(options.status as StudentStatus)
    ? (options.status as StudentStatus)
    : undefined;
  const classId = options.classId?.trim() ?? '';
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.trunc(options.pageSize ?? 15)));

  return withUserContext(user, async (tx) => {
    const { where, params } = buildFilter({ q, status, classId });

    // Sequential on one client. Never Promise.all here.
    const count = await tx.query<{ c: number }>(
      `select count(*)::int as c from students s ${where}`,
      params,
    );
    const { rows } = await tx.query<{
      id: string;
      student_code: string;
      full_name: string;
      gender: string | null;
      class_name: string | null;
      class_id: string | null;
      admission_date: string;
      status: string;
    }>(
      `select s.id, s.student_code, s.full_name, s.gender, s.admission_date, s.status,
              c.name as class_name, s.class_id
         from students s
         left join classes c on c.id = s.class_id
         ${where}
         order by s.student_code asc
         limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    );

    const total = count.rows[0]?.c ?? 0;
    return {
      rows: rows.map((row) => ({
        id: row.id,
        studentCode: row.student_code,
        fullName: row.full_name,
        gender: row.gender as StudentRow['gender'],
        className: row.class_name ?? null,
        classId: row.class_id,
        admissionDate: row.admission_date,
        status: row.status as StudentStatus,
      })),
      total,
      page,
      pageSize,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    };
  });
}

export async function getStudentDetail(user: SessionUser, id: string): Promise<StudentDetail> {
  if (!canAny(user, ['students:read', 'students:read_own_class'])) {
    throw new ForbiddenError('Your role does not allow viewing student records.');
  }

  return withUserContext(user, (tx) => loadStudentDetail(tx, user, id));
}

/**
 * The transaction-bound reads behind `getStudentDetail`, exported so the
 * service boundary is testable against a real PostgreSQL engine (PGlite) with
 * the RLS GUC context set - proving that a teacher's detail record contains no
 * fee data even when the service is called directly, not only via the UI.
 *
 * THE FINANCIAL BOUNDARY LIVES HERE. `feeBalances` is fetched from the fee
 * ledger ONLY when the caller holds `fees:read`. Teachers (and any role
 * without the financial permission) not only lose the field - the
 * `v_student_fee_balances` view is never queried for them at all. RLS remains
 * the final backstop: the view is SECURITY INVOKER, so even a raw query
 * returns nothing to a role the ledger does not admit.
 *
 * `user` is used for the fee-gate decision only. Row visibility comes from the
 * GUC-context RLS attached to `tx` by the caller.
 */
export async function loadStudentDetail(
  tx: Queryable,
  user: SessionUser,
  id: string,
): Promise<StudentDetail> {
  // Sequential reads: exactly one in-flight query per client.
  const student = await findStudent(tx, id);
  if (!student) throw new NotFoundError('Student', id);

  const guardians = await tx.query<GuardianRow>(
    `select * from guardians where student_id = $1 order by is_primary desc, full_name`,
    [id],
  );

  const detail: StudentDetail = {
    id: student.id,
    studentCode: student.student_code,
    fullName: student.full_name,
    gender: student.gender as Student['gender'],
    dateOfBirth: student.date_of_birth,
    admissionDate: student.admission_date,
    classId: student.class_id,
    notes: student.notes,
    status: student.status as StudentStatus,
    createdAt: student.created_at,
    classCode: student.class_code,
    className: student.class_name,
    guardians: guardians.rows.map((row) => ({
      id: row.id,
      studentId: row.student_id,
      fullName: row.full_name,
      phone: row.phone,
      email: row.email,
      relationship: row.relationship,
      isPrimary: row.is_primary,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };

  // Gate the ledger read on the FINANCIAL permission, never the student-read
  // permission. A teacher reads students via `students:read_own_class` and
  // must still never see a balance.
  if (can(user, 'fees:read')) {
    const feeBalances = await tx.query<FeeBalanceRow>(
      `select ay.name as academic_year, t.name as term, b.balance, b.is_in_arrears
         from v_student_fee_balances b
         join academic_years ay on ay.id = b.academic_year_id
         join terms t on t.id = b.term_id
        where b.student_id = $1
        order by ay.start_date desc, t.sequence desc
        limit 5`,
      [id],
    );
    detail.feeBalances = feeBalances.rows.map((row) => ({
      academicYear: row.academic_year,
      term: row.term,
      balance: row.balance,
      isInArrears: row.is_in_arrears,
    }));
  }

  return detail;
}

export async function listClasses(user: SessionUser): Promise<{ id: string; name: string }[]> {
  if (!canAny(user, ['students:read', 'students:read_own_class'])) return [];
  return withUserContext(user, async (tx) => {
    const { rows } = await tx.query<{ id: string; name: string }>(
      `select c.id, c.name
         from classes c
         join academic_years ay on ay.id = c.academic_year_id
        where c.status = 'active' and ay.is_current
        order by c.name`,
    );
    return rows;
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface GuardianRow {
  id: string;
  student_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  relationship: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

interface FeeBalanceRow {
  academic_year: string;
  term: string;
  balance: number;
  is_in_arrears: boolean;
}

interface StudentDbRow {
  id: string;
  student_code: string;
  full_name: string;
  gender: string | null;
  date_of_birth: string | null;
  admission_date: string;
  class_id: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  class_code: string | null;
  class_name: string | null;
}

async function findStudent(tx: Queryable, id: string): Promise<StudentDbRow | null> {
  const { rows } = await tx.query<StudentDbRow>(
    `select s.id, s.student_code, s.full_name, s.gender, s.date_of_birth, s.admission_date,
            s.class_id, s.notes, s.status, s.created_at,
            c.class_code, c.name as class_name
       from students s
       left join classes c on c.id = s.class_id
      where s.id = $1
      limit 1`,
    [id],
  );
  return rows[0] ?? null;
}

function buildFilter(filters: {
  q: string;
  status?: StudentStatus;
  classId: string;
}): { where: string; params: unknown[] } {
  const params: unknown[] = [];
  const clauses: string[] = [];

  if (filters.q) {
    params.push(likePattern(filters.q));
    clauses.push(
      `(lower(s.full_name) like $${params.length} or lower(s.student_code) like $${params.length})`,
    );
  }
  if (filters.status) {
    params.push(filters.status);
    clauses.push(`s.status = $${params.length}`);
  }
  if (filters.classId) {
    params.push(filters.classId);
    clauses.push(`s.class_id = $${params.length}::uuid`);
  }

  return {
    where: clauses.length > 0 ? `where ${clauses.join(' and ')}` : '',
    params,
  };
}

/** Escape LIKE wildcards so a search for "100%" matches literally. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

function flattenZod(error: z.ZodError): Record<string, string[]> {
  const flat = error.flatten();
  return {
    ...(flat.formErrors.length > 0 ? { _form: flat.formErrors } : {}),
    ...Object.fromEntries(
      Object.entries(flat.fieldErrors).map(([key, messages]) => [key, messages ?? []]),
    ),
  };
}