import { describe, expect, it } from 'vitest';

import { navGroupsFor, sectionLabelForPathname } from '../navigation';
import { ROLE_PERMISSIONS, type SessionUser } from '@/server/auth/permissions';
import type { Role } from '@/server/db/types';

/**
 * NAVIGATION MATRIX
 * =================
 * The sidebar is generated from the SAME permission matrix the server and the
 * database enforce. These tests lock in the affordance rules for the
 * role-aware shell (Phase 2): every role can reach its own dashboard, feature
 * flags can hide a module, and no role is offered a module it cannot use.
 *
 * Hiding a link here is affordance, never authorization - the route handler
 * and RLS still forbid misuse. These tests are about what the UI offers.
 */

function userFor(role: Role): SessionUser {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    username: `${role}_user`,
    fullName: `${role} user`,
    role,
    employeeId: null,
  };
}

function labelsFor(user: SessionUser, options?: { leaveEnabled?: boolean }): string[] {
  return navGroupsFor(user, options).flatMap((group) => group.items.map((item) => item.label));
}

const ALL_ROLES = Object.keys(ROLE_PERMISSIONS) as Role[];

describe('navGroupsFor - the dashboard is reachable by every role', () => {
  it('shows the dashboard to every role, even one without employees:read', () => {
    for (const role of ALL_ROLES) {
      expect(labelsFor(userFor(role))).toContain('Dashboard');
    }
  });

  it('shows the dashboard even when leave is disabled', () => {
    expect(labelsFor(userFor('teacher'), { leaveEnabled: false })).toContain('Dashboard');
  });

  it('returns nothing for an anonymous user', () => {
    expect(navGroupsFor(null)).toEqual([]);
  });
});

describe('navGroupsFor - teacher affordances', () => {
  it('offers a teacher their class, self-service and academic tools', () => {
    const labels = labelsFor(userFor('teacher'));
    for (const shown of [
      'Dashboard',
      'Staff', // their own record only (employees:read_own, RLS-scoped)
      'Students',
      'Leave',
      'My Classes',
      'My Subjects',
      'Results',
      'Report Cards',
      'Notifications',
    ]) {
      expect(labels).toContain(shown);
    }
  });

  it('never offers a teacher finance, payroll, reports or settings', () => {
    const labels = labelsFor(userFor('teacher'));
    for (const hidden of ['Payroll', 'Fees', 'Expenses', 'Reports', 'Settings', 'Subjects']) {
      expect(labels).not.toContain(hidden);
    }
  });
});

describe('navGroupsFor - the teacher hubs are teacher-scoped destinations', () => {
  it('shows My Classes and My Subjects to teachers', () => {
    for (const label of ['My Classes', 'My Subjects']) {
      expect(labelsFor(userFor('teacher'))).toContain(label);
    }
  });

  it('hides the teacher hubs from admin, principal and bursar (no class-teaching scope)', () => {
    for (const role of ['admin', 'principal', 'bursar'] as const) {
      for (const label of ['My Classes', 'My Subjects']) {
        expect(labelsFor(userFor(role)), `${role} must not see ${label}`).not.toContain(label);
      }
    }
  });

  it('shows them to the proprietor, who holds every permission including the teacher scope', () => {
    // proprietor: ALL permissions, `students:read_own_class` included. The
    // route itself still refuses non-teachers, so this is affordance parity,
    // not expanded access.
    for (const label of ['My Classes', 'My Subjects']) {
      expect(labelsFor(userFor('proprietor'))).toContain(label);
    }
  });
});

describe('navGroupsFor - bursar affordances', () => {
  it('offers the bursar finance and reports but not academic management', () => {
    const labels = labelsFor(userFor('bursar'));
    for (const shown of [
      'Dashboard',
      'Staff',
      'Students',
      'Payroll',
      'Fees',
      'Expenses',
      'Reports',
      'Notifications',
    ]) {
      expect(labels).toContain(shown);
    }
    for (const hidden of ['Subjects', 'Report Cards', 'Results', 'Settings']) {
      expect(labels).not.toContain(hidden);
    }
  });
});

describe('navGroupsFor - principal affordances', () => {
  it('offers the principal academic oversight plus permitted finance reads', () => {
    const labels = labelsFor(userFor('principal'));
    for (const shown of [
      'Dashboard',
      'Staff',
      'Students',
      'Leave',
      'Payroll',
      'Fees',
      'Expenses',
      'Results',
      'Report Cards',
      'Reports',
      'Settings', // read-only: audit:read, no settings:manage
    ]) {
      expect(labels).toContain(shown);
    }
    expect(labels).not.toContain('Subjects'); // subjects:manage only
  });
});

describe('navGroupsFor - admin and proprietor affordances', () => {
  it('keeps the full administration surface, minus financial management, for admin', () => {
    const labels = labelsFor(userFor('admin'));
    for (const shown of [
      'Dashboard',
      'Staff',
      'Students',
      'Leave',
      'Expenses',
      'Results',
      'Report Cards',
      'Subjects',
      'Reports',
      'Notifications',
    ]) {
      expect(labels).toContain(shown);
    }
    // Admin holds no financial permissions - those modules stay hidden.
    for (const hidden of ['Payroll', 'Fees', 'Settings']) {
      expect(labels).not.toContain(hidden);
    }
  });

  it('offers the proprietor every module', () => {
    const labels = labelsFor(userFor('proprietor'));
    for (const shown of [
      'Dashboard',
      'Staff',
      'Students',
      'Leave',
      'Payroll',
      'Fees',
      'Expenses',
      'My Classes',
      'My Subjects',
      'Results',
      'Report Cards',
      'Subjects',
      'Reports',
      'Notifications',
      'Settings',
    ]) {
      expect(labels).toContain(shown);
    }
  });
});

describe('navGroupsFor - My Profile (Phase 4 self-service front door)', () => {
  it('offers My Profile to every role: every sign-in is potentially an employee', () => {
    for (const role of ALL_ROLES) {
      expect(labelsFor(userFor(role))).toContain('My Profile');
    }
  });

  it('labels the /my-profile path under the People section for every role', () => {
    for (const role of ALL_ROLES) {
      expect(sectionLabelForPathname(userFor(role), '/my-profile')).toBe('My Profile');
    }
  });
});

describe('navGroupsFor - Phase 5 dashboard module affordances', () => {
  it('offers the principal every module its dashboard links to', () => {
    const labels = labelsFor(userFor('principal'));
    for (const label of ['Students', 'Results', 'Report Cards', 'Reports', 'Fees', 'Payroll', 'Expenses']) {
      expect(labels, `principal must be offered ${label}`).toContain(label);
    }
  });

  it('offers the bursar every module its dashboard links to and no academics', () => {
    const labels = labelsFor(userFor('bursar'));
    for (const label of ['Fees', 'Payroll', 'Expenses', 'Reports']) {
      expect(labels, `bursar must be offered ${label}`).toContain(label);
    }
    for (const label of ['Results', 'Report Cards', 'Subjects', 'My Classes', 'My Subjects']) {
      expect(labels, `bursar must NOT be offered ${label}`).not.toContain(label);
    }
  });
});

describe('navGroupsFor - leave feature flag', () => {
  it('hides the leave module for everyone when the flag is off', () => {
    for (const role of ALL_ROLES) {
      expect(labelsFor(userFor(role), { leaveEnabled: false })).not.toContain('Leave');
    }
  });

  it('keeps the leave module when the flag is on (default)', () => {
    for (const role of ALL_ROLES) {
      expect(labelsFor(userFor(role))).toContain('Leave');
    }
  });
});

describe('sectionLabelForPathname', () => {
  it('labels the dashboard specially and known sections by group', () => {
    const teacher = userFor('teacher');
    expect(sectionLabelForPathname(teacher, '/dashboard')).toBe('Dashboard');
    expect(sectionLabelForPathname(teacher, '/results/123')).toBe('Results');
    expect(sectionLabelForPathname(teacher, '/students')).toBe('Students');
    expect(sectionLabelForPathname(teacher, '/staff/abc')).toBe('Staff');
    expect(sectionLabelForPathname(teacher, '/my-classes')).toBe('My Classes');
    expect(sectionLabelForPathname(teacher, '/my-subjects')).toBe('My Subjects');
  });

  it('does not label a path whose section is hidden from the role', () => {
    const teacher = userFor('teacher');
    expect(sectionLabelForPathname(teacher, '/payroll')).toBeNull();
    expect(sectionLabelForPathname(teacher, '/fees')).toBeNull();
    expect(sectionLabelForPathname(teacher, '/settings')).toBeNull();
    // The teacher hubs are teacher-scoped: a principal is not offered them.
    expect(sectionLabelForPathname(userFor('principal'), '/my-classes')).toBeNull();
    expect(sectionLabelForPathname(userFor('principal'), '/my-subjects')).toBeNull();
  });
});
