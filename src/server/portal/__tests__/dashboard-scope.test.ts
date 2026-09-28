/**
 * ROLE DASHBOARDS (Phase 5) - GETTER GUARDS AND WRITE DENIALS AT THE SERVICE
 * BOUNDARY.
 *
 * UI visibility is never the mechanism that protects data. These tests run
 * the actual portal services for roles they do not serve and prove the
 * server-side guards fire BEFORE any connection is opened:
 *
 *   - each role getter returns null for any role it does not serve, so a
 *     routing mistake cannot conjure a cross-role dashboard
 *   - academic WRITE mutations deny the bursar and the principal even when
 *     called directly (no results:record / subjects:manage)
 *   - financial WRITE and READ mutations deny the admin (no fees:record /
 *     fees:read) and the teacher, exactly as the phase gate requires.
 *
 * The underlying RLS negatives are the DB layer's backstop and live in
 * role-dashboard-security.test.ts; the bounds asserted here never reach the
 * database at all.
 */

import { describe, expect, it } from 'vitest';
import type { Role } from '../../db/types';
import type { SessionUser } from '../../auth/permissions';
import { ForbiddenError } from '../../../lib/errors';
import {
  getBursarDashboardData,
  getPrincipalDashboardData,
  getTeacherDashboardData,
} from '../dashboard';
import { createAssessment, createSubject, saveMarks } from '../results';
import { getFeeOverview, recordFeePayment } from '../fees';

const user = (role: Role, id = 'user-1'): SessionUser => ({
  id,
  username: 'test',
  fullName: 'Test',
  role,
  employeeId: null,
});

describe('role dashboard getters - a getter refuses every role it does not serve', () => {
  it('getPrincipalDashboardData returns null unless the caller is the principal', async () => {
    for (const role of ['teacher', 'bursar', 'admin', 'proprietor'] as const) {
      expect(await getPrincipalDashboardData(user(role)), `${role} must be refused`).toBeNull();
    }
  });

  it('getBursarDashboardData returns null unless the caller is the bursar', async () => {
    for (const role of ['teacher', 'principal', 'admin', 'proprietor'] as const) {
      expect(await getBursarDashboardData(user(role)), `${role} must be refused`).toBeNull();
    }
  });

  it('getTeacherDashboardData returns null unless the caller is the teacher', async () => {
    for (const role of ['principal', 'bursar', 'admin', 'proprietor'] as const) {
      expect(await getTeacherDashboardData(user(role)), `${role} must be refused`).toBeNull();
    }
  });
});

describe('academic writes - the bursar and the principal are denied server-side', () => {
  it('denies the bursar recording marks', async () => {
    await expect(saveMarks(user('bursar'), null)).rejects.toThrow(ForbiddenError);
  });

  it('denies the bursar creating an assessment', async () => {
    await expect(createAssessment(user('bursar'), null)).rejects.toThrow(ForbiddenError);
  });

  it('denies the principal creating an assessment (no results:record)', async () => {
    await expect(createAssessment(user('principal'), null)).rejects.toThrow(ForbiddenError);
  });

  it('denies the bursar creating a subject', async () => {
    await expect(createSubject(user('bursar'), null)).rejects.toThrow(ForbiddenError);
  });

  it('denies the principal creating a subject (no subjects:manage)', async () => {
    await expect(createSubject(user('principal'), null)).rejects.toThrow(ForbiddenError);
  });
});

describe('financial writes and reads - admin and teacher are denied server-side', () => {
  it('denies the admin recording a fee payment (no fees:record)', async () => {
    await expect(recordFeePayment(user('admin'), null)).rejects.toThrow(ForbiddenError);
  });

  it('denies the teacher recording a fee payment', async () => {
    await expect(recordFeePayment(user('teacher'), null)).rejects.toThrow(ForbiddenError);
  });

  it('denies the admin reading fee records (no fees:read)', async () => {
    await expect(getFeeOverview(user('admin'))).rejects.toThrow(ForbiddenError);
  });

  it('denies the teacher reading fee records', async () => {
    await expect(getFeeOverview(user('teacher'))).rejects.toThrow(ForbiddenError);
  });
});