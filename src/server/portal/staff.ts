import 'server-only';

import { z } from 'zod';

import { assertPermission, canAny, type SessionUser } from '../auth/permissions';
import type { MinorUnits } from '../db/money';
import type { Queryable } from '../db/pool';
import { withUserContext } from '../db/transaction';
import type { Employee, EmployeeStatus, SalaryRecord } from '../db/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors';
import {
  bankAccountRepository,
  employeeRepository,
  salaryRecordRepository,
} from '../repositories/postgres';
import type { NewRecord } from '../repositories/types';

/**
 * STAFF MODULE - service layer
 * ============================
 * The only path from route handlers to employee data in one transaction.
 * Every imported repository is built inside `withUserContext`, so all reads
 * and writes carry Row Level Security context.
 */

export const EMPLOYEE_STATUS: readonly EmployeeStatus[] = [
  'active',
  'inactive',
  'suspended',
  'terminated',
];

const CREATE_STAFF_SCHEMA = z.object({
  fullName: z.string().trim().min(2, 'Enter the full name').max(120),
  position: z.string().trim().min(2, 'Enter a position').max(80),
  department: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().toLowerCase().max(120).nullable().optional(),
  gender: z.enum(['male', 'female', 'other']).nullable().optional(),
  employmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date format YYYY-MM-DD'),
  baseSalary: z.number().int('Salary must be whole minor units').positive('Salary must be greater than zero'),
  allowances: z.number().int().nonnegative().default(0),
  deductions: z.number().int().nonnegative().default(0),
  bankName: z.string().trim().max(80).nullable().optional(),
  accountName: z.string().trim().max(120).nullable().optional(),
  accountNumber: z.string().trim().max(34).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

const DEACTIVATE_SCHEMA = z.object({
  reason: z.string().trim().min(10, 'Enter a reason of at least 10 characters').max(500),
});

export interface CreateStaffResult {
  employeeId: string;
  salaryId: string;
  bankId: string | null;
}

export interface StaffListOptions {
  q?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface StaffListRow extends Employee {
  baseSalary: MinorUnits | null;
}

export interface StaffListResult {
  rows: StaffListRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface StaffBankSummary {
  id: string;
  bankName: string;
  accountName: string;
  /** Last four digits only. The full number is never sent to the UI. */
  accountNumber: string;
  isPrimary: boolean;
  effectiveFrom: string;
}

export interface StaffDetail {
  employee: Employee;
  salaries: SalaryRecord[];
  banks: StaffBankSummary[];
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createStaff(user: SessionUser, raw: unknown): Promise<CreateStaffResult> {
  assertPermission(user, 'employees:write');

  const parsed = CREATE_STAFF_SCHEMA.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      'Some staff details are incorrect. Please fix the highlighted fields and try again.',
      flattenZod(parsed.error),
    );
  }
  const input = parsed.data;

  const today = new Date().toISOString().slice(0, 10);
  if (input.employmentDate > today) {
    throw new ValidationError('Employment date cannot be in the future.');
  }

  // Bank fields are all-or-nothing: a record that names a bank but not an
  // account would leave payroll unable to reconcile the employee.
  const bankFields = collectBankFields(input);
  if (
    bankFields &&
    (!bankFields.bankName || !bankFields.accountName || !bankFields.accountNumber)
  ) {
    throw new ValidationError(
      'Bank values must be entered together: bank name, account name and account number.',
    );
  }

  return withUserContext(user, async (tx) => {
    const employees = employeeRepository(tx);
    const salaries = salaryRecordRepository(tx);
    const accounts = bankAccountRepository(tx);

    const employee = await employees.create(
      {
        employeeCode: undefined, // the database assigns EMP-#### via its sequence
        fullName: input.fullName,
        phone: input.phone ?? null,
        email: input.email ?? null,
        gender: input.gender ?? null,
        position: input.position,
        department: input.department ?? null,
        employmentDate: input.employmentDate,
        terminationDate: null,
        // Omitted (undefined) so the database default 'active' applies -
        // the column is `not null default 'active'` and null would be refused.
        status: undefined,
        notes: input.notes ?? null,
        createdBy: user.id,
      } as unknown as NewRecord<Employee>,
    );

    const salary = await salaries.create({
      employeeId: employee.id,
      baseSalary: input.baseSalary,
      allowances: input.allowances,
      deductions: input.deductions,
      effectiveFrom: input.employmentDate,
      effectiveTo: null,
      reason: 'Initial salary on joining',
      createdBy: user.id,
    } as NewRecord<SalaryRecord>);

    let bank: { id: string } | null = null;
    if (bankFields) {
      const normalized = normalizeAccountNumber(bankFields.accountNumber);
      const existing = await accounts.list({
        pageSize: 1,
        select: ['id'],
        filter: { eq: { account_number: normalized, account_status: 'active' } },
      });
      if (existing.total > 0) {
        throw new ConflictError(
          'Another active employee already uses this bank account number. Check the number and try again.',
        );
      }
      bank = await accounts.create({
        employeeId: employee.id,
        bankName: bankFields.bankName,
        accountName: bankFields.accountName,
        accountNumber: normalized,
        accountStatus: 'active',
        isPrimary: true,
        effectiveFrom: input.employmentDate,
        effectiveTo: null,
        createdBy: user.id,
      });
    }

    return { employeeId: employee.id, salaryId: salary.id, bankId: bank?.id ?? null };
  });
}

export async function deactivateStaff(user: SessionUser, id: string, raw: unknown): Promise<{ id: string }> {
  assertPermission(user, 'employees:deactivate');

  const parsed = DEACTIVATE_SCHEMA.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError('Enter a reason for deactivating this employee.', flattenZod(parsed.error));
  }
  const { reason } = parsed.data;

  return withUserContext(user, async (tx) => {
    const employees = employeeRepository(tx);
    const existing = await employees.getById(id);
    if (!existing) throw new NotFoundError('Employee', id);
    if (existing.status !== 'active') {
      throw new ConflictError(
        `This employee is ${existing.status}, so they cannot be deactivated again.`,
      );
    }

    const updated = await employees.update(id, {
      status: 'inactive',
      terminationDate: new Date().toISOString().slice(0, 10),
      notes: [existing.notes, `Deactivated: ${reason}`].filter(Boolean).join('\n'),
    });

    return { id: updated.id };
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listStaff(user: SessionUser, options: StaffListOptions = {}): Promise<StaffListResult> {
  if (!canAny(user, ['employees:read', 'employees:read_own'])) {
    throw new ForbiddenError('Your role does not allow viewing the staff list.');
  }

  const q = options.q?.trim().slice(0, 100) ?? '';
  const status = EMPLOYEE_STATUS.includes(options.status as EmployeeStatus)
    ? (options.status as EmployeeStatus)
    : undefined;
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.trunc(options.pageSize ?? 15)));

  return withUserContext(user, async (tx) => {
    const employees = employeeRepository(tx);
    const result = await employees.list({
      page,
      pageSize,
      sortBy: 'full_name',
      sortDir: 'asc',
      filter: {
        search: q ? { term: q, fields: ['full_name', 'employee_code', 'position', 'department'] } : undefined,
        eq: status ? { status } : undefined,
      },
    });

    const salaries = await currentSalariesByIds(tx, result.rows.map((row) => row.id));
    return {
      ...result,
      rows: result.rows.map((row) => ({ ...row, baseSalary: salaries.get(row.id) ?? null })),
    };
  });
}

export async function getStaffDetail(user: SessionUser, id: string): Promise<StaffDetail> {
  if (!canAny(user, ['employees:read', 'employees:read_own'])) {
    throw new ForbiddenError('Your role does not allow viewing staff records.');
  }

  return withUserContext(user, async (tx) => {
    const employee = await employeeRepository(tx).getById(id);
    // `null` means either "does not exist" or "RLS hides it from you". Both
    // answer "not found" as a 404, revealing nothing about records the caller
    // may not read.
    if (!employee) throw new NotFoundError('Employee', id);

    // Sequential, not Promise.all: these share one transaction client, and pg
    // forbids more than one query in flight at once.
    const salaries = await salaryRecordRepository(tx).list({
      filter: { eq: { employee_id: id } },
      sortBy: 'effective_from',
      sortDir: 'desc',
    });
    const banks = await bankAccountRepository(tx).list({
      filter: { eq: { employee_id: id } },
      sortBy: 'effective_from',
      sortDir: 'desc',
    });

    return {
      employee,
      salaries: salaries.rows,
      banks: banks.rows.map((bank) => ({
        id: bank.id,
        bankName: bank.bankName,
        accountName: bank.accountName,
        accountNumber: maskAccountNumber(bank.accountNumber),
        isPrimary: bank.isPrimary,
        effectiveFrom: bank.effectiveFrom,
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function currentSalariesByIds(tx: Queryable, ids: string[]): Promise<Map<string, MinorUnits>> {
  if (ids.length === 0) return new Map();
  const { rows } = await tx.query<{ employee_id: string; base_salary: number }>(
    `select employee_id, base_salary
       from v_employee_current_salary
      where employee_id = any($1::uuid[])`,
    [ids],
  );
  return new Map(rows.map((row) => [row.employee_id, row.base_salary]));
}

interface BankFields {
  bankName: string;
  accountName: string;
  accountNumber: string;
}

function collectBankFields(input: {
  bankName?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
}): BankFields | null {
  const bankName = input.bankName?.trim() ?? '';
  const accountName = input.accountName?.trim() ?? '';
  const accountNumber = input.accountNumber?.trim() ?? '';
  if (!bankName && !accountName && !accountNumber) return null;
  return { bankName, accountName, accountNumber };
}

function normalizeAccountNumber(raw: string): string {
  const normalized = raw.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z0-9]{6,34}$/.test(normalized)) {
    throw new ValidationError(
      'The account number must be 6-34 digits and letters, without spaces. Please re-enter it.',
    );
  }
  return normalized;
}

function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/[^0-9A-Z]/g, '');
  return `•••• •••• ${digits.slice(-4)}`;
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