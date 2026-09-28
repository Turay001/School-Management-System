import 'server-only';

import { z } from 'zod';

import { assertPermission, canAny, type SessionUser } from '../auth/permissions';
import type { Queryable } from '../db/pool';
import { withUserContext } from '../db/transaction';
import { ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors';

/**
 * FEES MODULE - service layer
 * ===========================
 * Fees are a LEDGER: a balance is never stored, it is derived from
 * assignments minus payments plus adjustments (migration 005, view
 * v_student_fee_balances). This module reads the derived views and writes
 * only the two sanctioned append-only records: payments and adjustments.
 *
 * A payment is money received; a positive adjustment reduces what is owed
 * (waiver/correction) and a negative one increases it. There is no "edit a
 * balance" anywhere.
 */

export interface FeesTermOption {
  id: string;
  label: string;
  academicYear: string;
  term: string;
  isCurrent: boolean;
}

export interface FeeBalanceRow {
  studentId: string;
  studentCode: string;
  studentName: string;
  termId: string;
  academicYear: string;
  term: string;
  termSequence: number;
  totalDue: number;
  totalPaid: number;
  totalAdjusted: number;
  balance: number;
  isInArrears: boolean;
  isInCredit: boolean;
}

export interface FeeOverviewResult {
  termLabel: string;
  summary: {
    studentsCount: number;
    studentsInArrears: number;
    totalOutstanding: number;
    totalCollected: number;
  };
  rows: FeeBalanceRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface FeeOverviewOptions {
  q?: string;
  termId?: string;
  page?: number;
  pageSize?: number;
}

export interface ClassOutstandingRow {
  classId: string;
  className: string;
  level: string | null;
  term: string;
  studentCount: number;
  totalDue: number;
  totalPaid: number;
  totalOutstanding: number;
  studentsInArrears: number;
}

export interface FeeStudentOption {
  id: string;
  fullName: string;
  studentCode: string;
}

export interface RecordPaymentResult {
  receiptNo: string;
  studentId: string;
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const PAYMENT_METHODS = ['cash', 'bank', 'mobile_money', 'other'] as const;

const RECORD_PAYMENT_SCHEMA = z.object({
  studentId: z.string().uuid('Choose a student.'),
  termId: z.string().uuid('Choose a term.'),
  amount: z
    .number()
    .int('Amount must be a whole number.')
    .positive('Amount must be greater than zero.')
    .max(Number.MAX_SAFE_INTEGER),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(60, 'Reference is too long.').nullable().optional(),
  notes: z.string().trim().max(500, 'Notes are too long.').nullable().optional(),
});

const ADJUST_BALANCE_SCHEMA = z.object({
  studentId: z.string().uuid('Choose a student.'),
  termId: z.string().uuid('Choose a term.'),
  amount: z
    .number()
    .int('Amount must be a whole number.')
    .min(-Number.MAX_SAFE_INTEGER)
    .max(Number.MAX_SAFE_INTEGER)
    .refine((value) => value !== 0, 'Amount cannot be zero.'),
  reason: z.string().trim().min(10, 'Explain the adjustment in at least 10 characters.'),
});

// ---------------------------------------------------------------------------
// Reads (user context)
// ---------------------------------------------------------------------------

export async function getFeeOverview(
  user: SessionUser,
  options: FeeOverviewOptions = {},
): Promise<FeeOverviewResult> {
  if (!canAny(user, ['fees:read'])) {
    throw new ForbiddenError('Your role does not allow viewing fee records.');
  }

  const q = options.q?.trim().slice(0, 100) ?? '';
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.trunc(options.pageSize ?? 15)));

  return withUserContext(user, async (tx) => {
    const term = await findTerm(tx, options.termId ?? null);

    // No term data yet (fresh install): present an honest empty overview
    // rather than a confusing zero-heavy page.
    if (!term) {
      return {
        termLabel: 'No term data yet',
        summary: {
          studentsCount: 0,
          studentsInArrears: 0,
          totalOutstanding: 0,
          totalCollected: 0,
        },
        rows: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
      };
    }

    // Sequential on one client - never Promise.all over a shared tx.
    const summary = await tx.query<{
      students_count: number;
      students_in_arrears: number;
      total_outstanding: number;
      total_collected: number;
    }>(
      `select count(*)::int as students_count,
              count(*) filter (where b.is_in_arrears)::int as students_in_arrears,
              coalesce(sum(b.balance) filter (where b.balance > 0), 0) as total_outstanding,
              coalesce(sum(b.total_paid), 0) as total_collected
         from v_student_fee_balances b
        where b.term_id = $1`,
      [term.id],
    );

    const { where, params } = buildBalanceFilter(q);
    params.push(term.id);

    const count = await tx.query<{ c: number }>(
      `select count(*)::int as c
         from v_student_fee_balances b
         ${where}
           and b.term_id = $${params.length}`,
      params,
    );

    const { rows } = await tx.query<FeeBalanceDbRow>(
      `select b.student_id, b.student_code, b.student_name, b.term_id,
              b.academic_year, b.term, b.term_sequence,
              b.total_due, b.total_paid, b.total_adjusted, b.balance,
              b.is_in_arrears, b.is_in_credit
         from v_student_fee_balances b
         ${where}
           and b.term_id = $${params.length}
         order by b.balance desc, b.student_name asc
         limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    );

    const total = count.rows[0]?.c ?? 0;
    return {
      termLabel: term.label,
      summary: {
        studentsCount: summary.rows[0]?.students_count ?? 0,
        studentsInArrears: summary.rows[0]?.students_in_arrears ?? 0,
        totalOutstanding: summary.rows[0]?.total_outstanding ?? 0,
        totalCollected: summary.rows[0]?.total_collected ?? 0,
      },
      rows: rows.map(mapFeeBalance),
      total,
      page,
      pageSize,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    };
  });
}

export async function getClassOutstanding(
  user: SessionUser,
  options: { termId?: string } = {},
): Promise<ClassOutstandingRow[]> {
  if (!canAny(user, ['fees:read'])) {
    throw new ForbiddenError('Your role does not allow viewing fee records.');
  }

  return withUserContext(user, async (tx) => {
    const term = await findTerm(tx, options.termId ?? null);
    if (!term) return [];

    const { rows } = await tx.query<ClassOutstandingDbRow>(
      `select c.class_id, c.class_name, c.level, c.term, c.student_count,
              c.total_due, c.total_paid, c.total_outstanding, c.students_in_arrears
         from v_class_fee_outstanding c
        where c.term_id = $1
        order by c.class_name`,
      [term.id],
    );

    return rows.map((row) => ({
      classId: row.class_id,
      className: row.class_name,
      level: row.level,
      term: row.term,
      studentCount: row.student_count,
      totalDue: row.total_due,
      totalPaid: row.total_paid,
      totalOutstanding: row.total_outstanding,
      studentsInArrears: row.students_in_arrears,
    }));
  });
}

export async function listFeesTerms(user: SessionUser): Promise<FeesTermOption[]> {
  if (!canAny(user, ['fees:read'])) return [];
  return withUserContext(user, async (tx) => {
    const { rows } = await tx.query<{
      id: string;
      name: string;
      academic_year: string;
      is_current: boolean;
    }>(
      `select t.id, t.name, ay.name as academic_year, ay.is_current
         from terms t
         join academic_years ay on ay.id = t.academic_year_id
        order by ay.is_current desc, ay.start_date desc, t.sequence desc`,
    );
    return rows.map((row) => ({
      id: row.id,
      label: `${row.academic_year} · ${row.name}`,
      academicYear: row.academic_year,
      term: row.name,
      isCurrent: row.is_current,
    }));
  });
}

export async function listFeeStudents(user: SessionUser): Promise<FeeStudentOption[]> {
  if (!canAny(user, ['fees:read'])) return [];
  return withUserContext(user, async (tx) => {
    const { rows } = await tx.query<{ id: string; full_name: string; student_code: string }>(
      `select id, full_name, student_code
         from students
        where status = 'active'
        order by full_name`,
    );
    return rows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      studentCode: row.student_code,
    }));
  });
}

// ---------------------------------------------------------------------------
// Writes (user context, RLS-gated by fees:record / fees:adjust)
// ---------------------------------------------------------------------------

export async function recordFeePayment(user: SessionUser, raw: unknown): Promise<RecordPaymentResult> {
  assertPermission(user, 'fees:record');

  const parsed = RECORD_PAYMENT_SCHEMA.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      'The payment details are incorrect. Please fix the highlighted fields.',
      flattenZod(parsed.error),
    );
  }
  const input = parsed.data;

  return withUserContext(user, async (tx) => {
    const term = await findTerm(tx, input.termId);
    if (!term) throw new NotFoundError('Term', input.termId);

    const student = await findStudent(tx, input.studentId);
    if (!student) throw new NotFoundError('Student', input.studentId);

    const { rows } = await tx.query<{ receipt_no: string }>(
      `insert into fee_payments
         (student_id, academic_year_id, term_id, amount, method, reference, received_by, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning receipt_no`,
      [
        input.studentId,
        term.academic_year_id,
        input.termId,
        input.amount,
        input.method,
        input.reference ?? null,
        user.id,
        input.notes ?? null,
      ],
    );
    const receiptNo = rows[0]?.receipt_no;
    if (!receiptNo) {
      throw new Error('Insert into fee_payments returned no row. The payment was not recorded.');
    }
    return { receiptNo, studentId: input.studentId };
  });
}

export async function adjustStudentBalance(
  user: SessionUser,
  raw: unknown,
): Promise<{ adjustmentId: string }> {
  assertPermission(user, 'fees:adjust');

  const parsed = ADJUST_BALANCE_SCHEMA.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      'The adjustment details are incorrect. Please fix the highlighted fields.',
      flattenZod(parsed.error),
    );
  }
  const input = parsed.data;

  return withUserContext(user, async (tx) => {
    const term = await findTerm(tx, input.termId);
    if (!term) throw new NotFoundError('Term', input.termId);

    const student = await findStudent(tx, input.studentId);
    if (!student) throw new NotFoundError('Student', input.studentId);

    const { rows } = await tx.query<{ id: string }>(
      `insert into fee_adjustments
         (student_id, academic_year_id, term_id, amount, reason, created_by)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [input.studentId, term.academic_year_id, input.termId, input.amount, input.reason, user.id],
    );
    const adjustmentId = rows[0]?.id;
    if (!adjustmentId) {
      throw new Error('Insert into fee_adjustments returned no row. The adjustment was not recorded.');
    }
    return { adjustmentId };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TermRow {
  id: string;
  name: string;
  academic_year_id: string;
  academic_year: string;
  is_current: boolean;
}

interface StudentMinRow {
  id: string;
  full_name: string;
}

interface FeeBalanceDbRow {
  student_id: string;
  student_code: string;
  student_name: string;
  term_id: string;
  academic_year: string;
  term: string;
  term_sequence: number;
  total_due: number;
  total_paid: number;
  total_adjusted: number;
  balance: number;
  is_in_arrears: boolean;
  is_in_credit: boolean;
}

interface ClassOutstandingDbRow {
  class_id: string;
  class_name: string;
  level: string | null;
  term: string;
  student_count: number;
  total_due: number;
  total_paid: number;
  total_outstanding: number;
  students_in_arrears: number;
}

async function findTerm(
  tx: Queryable,
  termId: string | null,
): Promise<
  (TermRow & { label: string }) | null
> {
  const { rows } = await tx.query<TermRow>(
    termId
      ? `select t.id, t.name, t.academic_year_id, ay.name as academic_year, ay.is_current
           from terms t
           join academic_years ay on ay.id = t.academic_year_id
          where t.id = $1
          limit 1`
      : `select t.id, t.name, t.academic_year_id, ay.name as academic_year, ay.is_current
           from terms t
           join academic_years ay on ay.id = t.academic_year_id
          order by ay.is_current desc, ay.start_date desc, t.sequence desc
          limit 1`,
    termId ? [termId] : [],
  );
  const row = rows[0];
  if (!row) return null;
  return { ...row, label: `${row.academic_year} · ${row.name}` };
}

async function findStudent(tx: Queryable, id: string): Promise<StudentMinRow | null> {
  const { rows } = await tx.query<StudentMinRow>(
    `select id, full_name from students where id = $1 limit 1`,
    [id],
  );
  return rows[0] ?? null;
}

function buildBalanceFilter(q: string): { where: string; params: unknown[] } {
  const params: unknown[] = [];
  const clauses: string[] = [];
  if (q) {
    params.push(likePattern(q));
    clauses.push(
      `(lower(b.student_name) like $${params.length} or lower(b.student_code) like $${params.length})`,
    );
  }
  return {
    where: clauses.length > 0 ? `where ${clauses.join(' and ')}` : 'where true',
    params,
  };
}

function mapFeeBalance(row: FeeBalanceDbRow): FeeBalanceRow {
  return {
    studentId: row.student_id,
    studentCode: row.student_code,
    studentName: row.student_name,
    termId: row.term_id,
    academicYear: row.academic_year,
    term: row.term,
    termSequence: row.term_sequence,
    totalDue: row.total_due,
    totalPaid: row.total_paid,
    totalAdjusted: row.total_adjusted,
    balance: row.balance,
    isInArrears: row.is_in_arrears,
    isInCredit: row.is_in_credit,
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