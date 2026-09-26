import type { MinorUnits } from './money';

/**
 * Domain entities, mirroring the PostgreSQL schema in supabase/migrations.
 *
 * These types are the contract between the database and the application. They
 * contain no SQL, no row numbers, and no storage-engine concepts.
 *
 * All money fields are integer minor units (kobo). `NLe 4,500.00` is
 * `450000`. There is no float money anywhere in this system.
 */

// ---------------------------------------------------------------------------
// Enumerations - these mirror the Postgres enum types exactly.
// A test asserts the two lists stay in step.
// ---------------------------------------------------------------------------

export const EMPLOYEE_STATUSES = ['active', 'inactive', 'suspended', 'terminated'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const STUDENT_STATUSES = [
  'active',
  'inactive',
  'graduated',
  'withdrawn',
  'transferred',
] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export const PAYROLL_RUN_STATUSES = [
  'draft',
  'calculated',
  'under_review',
  'approved',
  'exported',
  'archived',
  'reopened',
] as const;
export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];

/** Statuses whose payroll lines are frozen. Enforced by a DB trigger. */
export const FROZEN_PAYROLL_STATUSES: readonly PayrollRunStatus[] = [
  'approved',
  'exported',
  'archived',
];

export const EXPENSE_STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'paid'] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const LEAVE_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const PAYMENT_METHODS = ['cash', 'bank', 'mobile_money', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const RECORD_STATUSES = ['active', 'inactive'] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

export const ROLES = ['proprietor', 'bursar', 'admin', 'principal', 'teacher'] as const;
export type Role = (typeof ROLES)[number];

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * An application user. Credentials live in Supabase Auth (auth.users);
 * this is the application profile only. There is deliberately no
 * passwordHash field, because the application never handles passwords.
 */
export interface AppUser {
  id: string;
  userCode: string;
  username: string;
  fullName: string;
  role: Role;
  status: RecordStatus;
  employeeId: string | null;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  gender: 'male' | 'female' | 'other' | null;
  position: string;
  department: string | null;
  employmentDate: string;
  terminationDate: string | null;
  status: EmployeeStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

/**
 * A salary record. Effective-dated: the employee's current salary is the row
 * with `effectiveTo === null`. A raise closes the previous row and opens a new
 * one, so history is added to rather than overwritten.
 */
export interface SalaryRecord {
  id: string;
  employeeId: string;
  baseSalary: MinorUnits;
  allowances: MinorUnits;
  deductions: MinorUnits;
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string | null;
  createdAt: string;
  createdBy: string | null;
}

/**
 * SENSITIVE. Separate table so access can be restricted independently of the
 * rest of the staff record. Never logged in full; the audit trail records
 * only the last four digits.
 */
export interface BankAccount {
  id: string;
  employeeId: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  accountStatus: RecordStatus;
  isPrimary: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

/** Employee joined with their current salary. Mirrors v_employee_current_salary. */
export interface EmployeeWithSalary extends Employee {
  baseSalary: MinorUnits;
  allowances: MinorUnits;
  recurringDeductions: MinorUnits;
  effectiveFrom: string | null;
  monthlyNetEstimate: MinorUnits;
}

// ---------------------------------------------------------------------------
// Academic structure
// ---------------------------------------------------------------------------

export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Term {
  id: string;
  academicYearId: string;
  name: string;
  sequence: number;
  startDate: string;
  endDate: string;
}

export interface SchoolClass {
  id: string;
  classCode: string;
  name: string;
  level: string | null;
  academicYearId: string;
  teacherId: string | null;
  capacity: number | null;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Student {
  id: string;
  studentCode: string;
  fullName: string;
  gender: 'male' | 'female' | 'other' | null;
  dateOfBirth: string | null;
  admissionDate: string;
  classId: string | null;
  status: StudentStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface Guardian {
  id: string;
  studentId: string;
  fullName: string;
  phone: string;
  email: string | null;
  relationship: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------

export interface FeeType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isMandatory: boolean;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
}

/** The price list: what a class owes for a fee type in a term. */
export interface FeeStructure {
  id: string;
  /** null means "applies to every class". */
  classId: string | null;
  academicYearId: string;
  termId: string;
  feeTypeId: string;
  amount: MinorUnits;
  effectiveFrom: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

/** What one student owes. `amountDue` is a snapshot of the structure price. */
export interface StudentFeeAssignment {
  id: string;
  studentId: string;
  feeStructureId: string;
  academicYearId: string;
  termId: string;
  feeTypeId: string;
  amountDue: MinorUnits;
  isWaived: boolean;
  waiverReason: string | null;
  createdAt: string;
  createdBy: string | null;
}

/** Append-only. A mistaken payment is reversed, never deleted. */
export interface FeePayment {
  id: string;
  receiptNo: string;
  studentId: string;
  academicYearId: string;
  termId: string;
  amount: MinorUnits;
  method: PaymentMethod;
  reference: string | null;
  receivedBy: string | null;
  receivedAt: string;
  notes: string | null;
  createdAt: string;
  isReversed: boolean;
  reversedBy: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
}

/** The only sanctioned way to change a balance other than a payment. */
export interface FeeAdjustment {
  id: string;
  studentId: string;
  academicYearId: string;
  termId: string;
  /** Positive REDUCES the balance owed. */
  amount: MinorUnits;
  reason: string;
  createdBy: string;
  createdAt: string;
  approvedBy: string | null;
}

/**
 * A computed balance. Mirrors v_student_fee_balances.
 *
 *   balance = totalDue - totalPaid - totalAdjusted
 *
 * There is no stored balance column in the database. A positive balance is
 * owed; a negative balance is a credit.
 */
export interface StudentFeeBalance {
  studentId: string;
  studentCode: string;
  studentName: string;
  academicYearId: string;
  academicYear: string;
  termId: string;
  term: string;
  termSequence: number;
  totalDue: MinorUnits;
  totalPaid: MinorUnits;
  totalAdjusted: MinorUnits;
  balance: MinorUnits;
  isInArrears: boolean;
  isInCredit: boolean;
  assignmentCount: number;
  paymentCount: number;
}

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------

export interface PayrollPeriod {
  id: string;
  year: number;
  month: number;
  status: PayrollRunStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollRun {
  id: string;
  periodId: string;
  revision: number;
  /** PAY-2026-09-0001 */
  runCode: string;
  status: PayrollRunStatus;

  // Maintained by trigger from payroll_items, so they cannot drift.
  employeeCount: number;
  totalGross: MinorUnits;
  totalDeductions: MinorUnits;
  totalNet: MinorUnits;
  totalEmployerCosts: MinorUnits;

  currencyCode: string;
  /** Which statuses were eligible, snapshotted for the record. */
  eligibilityRule: string;

  generatedBy: string | null;
  generatedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  exportedAt: string | null;
  archivedAt: string | null;

  supersedesRunId: string | null;
  reopenReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The shape written into a payroll item's `bank_account_snapshot`. */
export interface BankAccountSnapshot {
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  accountStatus?: string | null;
  paymentReference?: string | null;
  effectiveFrom?: string | null;
}

/**
 * One employee's pay for one run. IMMUTABLE once the run is approved.
 *
 * Every monetary field is a SNAPSHOT taken at generation time. This is what
 * makes the requirement satisfiable: September keeps reading NLe 4,500.00
 * after the employee's salary is raised to NLe 5,000.00 in October, because
 * nothing joins back to live salary data at read time.
 */
export interface PayrollItem {
  id: string;
  payrollRunId: string;
  employeeId: string;

  // snapshot: identity
  employeeCode: string;
  employeeName: string;
  position: string;
  department: string | null;

  // snapshot: pay
  basicSalary: MinorUnits;
  allowances: MinorUnits;
  overtime: MinorUnits;
  otherEarnings: MinorUnits;
  deductions: MinorUnits;
  employerCosts: MinorUnits;

  // snapshot: bank details
  bankAccountSnapshot: BankAccountSnapshot;

  // deterministic results
  gross: MinorUnits;
  net: MinorUnits;

  notes: string | null;
  createdAt: string;
}

/** Mirrors v_payroll_run_summary, with the independent reconciliation flag. */
export interface PayrollRunSummary extends PayrollRun {
  year: number;
  month: number;
  period: string;
  generatedByName: string | null;
  approvedByName: string | null;
  itemCountActual: number;
  grossActual: MinorUnits;
  deductionsActual: MinorUnits;
  netActual: MinorUnits;
  totalsReconcile: boolean;
  itemsMissingBankDetails: number;
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export interface ExpenseCategory {
  id: string;
  name: string;
  description: string | null;
  monthlyBudget: MinorUnits | null;
  status: RecordStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  categoryId: string;
  /** Copied so a category rename never rewrites expense history. */
  categoryName: string;
  amount: MinorUnits;
  date: string;
  description: string;
  vendor: string | null;
  method: PaymentMethod;
  reference: string | null;
  status: ExpenseStatus;
  requestedBy: string | null;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  paidAt: string | null;
  paidReference: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Leave
// ---------------------------------------------------------------------------

export interface LeaveType {
  id: string;
  name: string;
  isPaid: boolean;
  annualQuotaDays: number | null;
  requiresNote: boolean;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string | null;
  status: LeaveStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Audit and settings
// ---------------------------------------------------------------------------

export interface AuditEntry {
  id: string;
  occurredAt: string;
  actorId: string | null;
  actorName: string;
  actorRole: Role | null;
  action: string;
  entityType: string;
  entityId: string | null;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  correlationId: string | null;
}

/**
 * A configuration value. `isPlaceholder` marks settings that are still
 * awaiting confirmation from the school, so the UI can badge them rather than
 * presenting a guess as fact.
 */
export interface Setting<T = unknown> {
  key: string;
  value: T;
  description: string | null;
  isPlaceholder: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

// ---------------------------------------------------------------------------
// Bank export
// ---------------------------------------------------------------------------

/**
 * A bank export format definition.
 *
 * CONFIGURATION REQUIRED: the school has not yet supplied its bank's real
 * file format. The seeded template is a structurally valid PLACEHOLDER and is
 * flagged as such, so it can never be mistaken for a confirmed bank format.
 */
export interface BankExportTemplate {
  id: string;
  name: string;
  fileFormat: 'csv' | 'xlsx';
  columns: BankTemplateColumn[];
  delimiter: string;
  lineEnding: 'CRLF' | 'LF';
  includeHeader: boolean;
  amountInMajorUnits: boolean;
  isPlaceholder: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BankTemplateColumn {
  key: string;
  header: string;
  source:
    | 'accountName'
    | 'accountNumber'
    | 'bankName'
    | 'amount'
    | 'paymentReference'
    | 'payrollPeriod'
    | 'employeeCode'
    | 'employeeName'
    | 'position'
    | 'department';
  format?: 'text' | 'amount' | 'date';
}
