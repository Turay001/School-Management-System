/**
 * PHASE 6 - MUTATION GATES: every write/approval service denies every role
 * that does not hold its permission, BEFORE any database work happens.
 *
 * The services under test live in src/server/portal and share one attribute:
 * `assertPermission(user, ...)` is the first statement after input parsing
 * (or before it), so an unauthorized caller is refused without a connection,
 * without a row-level lookup, and without leaking whether a record exists.
 *
 * This suite is pure on purpose - there is no database in this process. If a
 * future refactor moved a permission check behind a DB call, the denied-role
 * call below would either throw the wrong error (test fails) or attempt a
 * real connection (test fails noisily). Either way the regression is caught
 * here, not in production.
 *
 * The authorized paths (role -> permission granted -> service performs the
 * mutation) are exercised against the PGlite harness in
 * salary-separation.test.ts and the existing DB suites.
 */

import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '../../../lib/errors';
import { roleHasPermission, type Permission, type SessionUser } from '../../auth/permissions';
import { ROLES, type Role } from '../../db/types';
import { createStaff, deactivateStaff, updateStaffBank } from '../../portal/staff';
import { createStudent, updateStudentStatus } from '../../portal/students';
import { adjustStudentBalance, recordFeePayment } from '../../portal/fees';
import { createExpense, decideExpense, submitExpense } from '../../portal/expenses';
import { createLeaveRequest, decideLeaveRequest } from '../../portal/leave';
import {
  createAssessment,
  createSubject,
  saveMarks,
  uploadResultsFromCsv,
} from '../../portal/results';
import { exportPayrollRun, generatePayroll, transitionPayrollRun } from '../../portal/payroll';
import { updateSetting } from '../../portal/settings';

/** Any well-formed userId. Never reaches the database on denied paths. */
const ID = '11111111-1111-4111-8111-111111111111';

interface GateCase {
  permission: Permission;
  description: string;
  call: (user: SessionUser) => Promise<unknown>;
}

/**
 * Every WRITE, APPROVAL and privilege-adjacent mutation the application
 * exposes, keyed by the permission that guards it. Arguments are intentionally
 * sparse: the guard must fire before validation or lookup, so the shape of the
 * input must not matter for denied roles. `transitionPayrollRun` parses the
 * body before the (hoisted, Phase 6) permission gate, so it passes a body the
 * schema accepts.
 */
const WRITE_GATES: readonly GateCase[] = [
  {
    permission: 'employees:write',
    description: 'createStaff',
    call: (user) => createStaff(user, null),
  },
  {
    permission: 'employees:deactivate',
    description: 'deactivateStaff',
    call: (user) => deactivateStaff(user, ID, null),
  },
  {
    permission: 'employees:bank',
    description: 'updateStaffBank',
    call: (user) => updateStaffBank(user, ID, null),
  },
  {
    permission: 'students:write',
    description: 'createStudent',
    call: (user) => createStudent(user, null),
  },
  {
    permission: 'students:write',
    description: 'updateStudentStatus',
    call: (user) => updateStudentStatus(user, ID, null),
  },
  {
    permission: 'fees:record',
    description: 'recordFeePayment',
    call: (user) => recordFeePayment(user, null),
  },
  {
    permission: 'fees:adjust',
    description: 'adjustStudentBalance',
    call: (user) => adjustStudentBalance(user, null),
  },
  {
    permission: 'expenses:write',
    description: 'createExpense',
    call: (user) => createExpense(user, null),
  },
  {
    permission: 'expenses:write',
    description: 'submitExpense',
    call: (user) => submitExpense(user, ID),
  },
  {
    permission: 'expenses:approve',
    description: 'decideExpense',
    call: (user) => decideExpense(user, ID, { decision: 'approve' }),
  },
  {
    permission: 'leave:request',
    description: 'createLeaveRequest',
    call: (user) => createLeaveRequest(user, null),
  },
  {
    permission: 'leave:approve',
    description: 'decideLeaveRequest',
    call: (user) => decideLeaveRequest(user, ID, { decision: 'approved' }),
  },
  {
    permission: 'subjects:manage',
    description: 'createSubject',
    call: (user) => createSubject(user, null),
  },
  {
    permission: 'results:record',
    description: 'createAssessment',
    call: (user) => createAssessment(user, null),
  },
  {
    permission: 'results:record',
    description: 'saveMarks',
    call: (user) => saveMarks(user, null),
  },
  {
    permission: 'results:record',
    description: 'uploadResultsFromCsv',
    call: (user) => uploadResultsFromCsv(user, ID, ''),
  },
  {
    permission: 'payroll:generate',
    description: 'generatePayroll',
    call: (user) => generatePayroll(user, null),
  },
  {
    permission: 'payroll:review',
    description: 'transitionPayrollRun -> under_review',
    call: (user) => transitionPayrollRun(user, ID, { to: 'under_review' }),
  },
  {
    permission: 'payroll:approve',
    description: 'transitionPayrollRun -> approved',
    call: (user) => transitionPayrollRun(user, ID, { to: 'approved' }),
  },
  {
    permission: 'payroll:reopen',
    description: 'transitionPayrollRun -> reopened',
    call: (user) =>
      transitionPayrollRun(user, ID, { to: 'reopened', reason: 'long enough reason here' }),
  },
  {
    permission: 'payroll:export',
    description: 'transitionPayrollRun -> exported',
    call: (user) => transitionPayrollRun(user, ID, { to: 'exported' }),
  },
  {
    permission: 'payroll:export',
    description: 'exportPayrollRun',
    call: (user) => exportPayrollRun(user, ID),
  },
  {
    permission: 'settings:manage',
    description: 'updateSetting',
    call: (user) => updateSetting(user, null),
  },
];

function userOf(role: Role): SessionUser {
  return { id: ID, username: 't', fullName: 'Test', role, employeeId: null };
}

describe('Phase 6 - mutation gates refuse non-holders before any DB work', () => {
  it('covers every write and approval permission', () => {
    const covered = new Set(WRITE_GATES.map((gate) => gate.permission));
    const writeApproval = new Set<Permission>([
      'employees:write',
      'employees:deactivate',
      'employees:bank',
      'payroll:generate',
      'payroll:review',
      'payroll:approve',
      'payroll:reopen',
      'payroll:export',
      'students:write',
      'fees:record',
      'fees:adjust',
      'expenses:write',
      'expenses:approve',
      'leave:request',
      'leave:approve',
      'subjects:manage',
      'results:record',
      'settings:manage',
    ]);
    expect([...covered].sort()).toEqual([...writeApproval].sort());
  });

  for (const gate of WRITE_GATES) {
    it(`denies ${gate.description} (${gate.permission}) to every non-holder role and to anonymous callers`, async () => {
      const holders = ROLES.filter((role) => roleHasPermission(role, gate.permission));
      // Every role is either a holder or a non-holder; completeness is proven
      // by the matrix suite. Test every NON-holder here.
      const nonHolders = ROLES.filter((role) => !holders.includes(role));
      expect(nonHolders.length).toBeGreaterThan(0);

      for (const role of nonHolders) {
        await expect(gate.call(userOf(role))).rejects.toBeInstanceOf(ForbiddenError);
      }
      await expect(gate.call(null as unknown as SessionUser)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  }
});

describe('Phase 6 - transitionPayrollRun authorizes before the run lookup (F-3 regression)', () => {
  it('refuses a teacher before the existence oracle can leak a run code or status', async () => {
    // post-fix: ForbiddenError fires before withServiceContext, so even a run
    // id that does not exist must never reach the NotFound/Conflict path.
    await expect(
      transitionPayrollRun(userOf('teacher'), ID, { to: 'approved' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      transitionPayrollRun(userOf('teacher'), 'no-such-run', { to: 'under_review' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses a transition a role holds no permission for, even with a valid body', async () => {
    // principal holds payroll:export but not payroll:approve.
    await expect(
      transitionPayrollRun(userOf('principal'), ID, { to: 'approved' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // bursar holds payroll:review but not payroll:approve.
    await expect(
      transitionPayrollRun(userOf('bursar'), ID, { to: 'approved' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // admin holds no payroll transition permission at all.
    await expect(
      transitionPayrollRun(userOf('admin'), ID, { to: 'exported' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});