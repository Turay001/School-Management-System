import type { ComponentType } from 'react';

import type { IconProps } from '@/components/icons';
import {
  IconBell,
  IconDashboard,
  IconExpenses,
  IconFees,
  IconLeave,
  IconPayroll,
  IconReportCard,
  IconReports,
  IconResults,
  IconSettings,
  IconStudent,
  IconSubjects,
  IconUser,
  IconUsers,
} from '@/components/icons';
import { can, canAny, type Permission, type SessionUser } from '@/server/auth/permissions';

/**
 * Navigation, gated by the SAME permission matrix the server enforces. The
 * sidebar only renders items the signed-in role may actually use; hiding a
 * link here is affordance - the route handler still forbids unauthorized use.
 *
 * The dashboard is the exception that proves the rule: every role lands on
 * its own role-scoped dashboard, so the link is shown to any authenticated
 * user (`always: true`). Module-level feature flags (e.g. Leave) are
 * respected through `NavOptions` so a disabled module stops appearing in the
 * navigation without touching the permission matrix.
 *
 * `placeholder: true` marks modules whose data layer/screens arrive in a
 * later phase. They route to the "coming online" page instead of a dead 404.
 */
export interface NavItem {
  href: string;
  label: string;
  /** Passed to canAny: the user needs at least one of these. */
  access: readonly Permission[];
  icon: ComponentType<IconProps>;
  placeholder?: boolean;
  /**
   * Always shown to any authenticated user, bypassing `access`. Only the
   * dashboard qualifies: every role lands on its own role-scoped dashboard,
   * and the route itself requires a session, so hiding the link would serve
   * no security purpose - it would just strand a teacher in a dead end.
   */
  always?: boolean;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      {
        href: '/dashboard',
        label: 'Dashboard',
        access: ['employees:read'],
        icon: IconDashboard,
        always: true,
      },
    ],
  },
  {
    label: 'People',
    items: [
      {
        href: '/my-profile',
        label: 'My Profile',
        // Every signed-in role is (potentially) an employee. The route resolves
        // the linked record server-side from the sign-in - no id in the URL to
        // tamper with - and explains honestly when no record is linked.
        access: ['employees:read', 'employees:read_own'],
        icon: IconUser,
      },
      {
        href: '/staff',
        label: 'Staff',
        access: ['employees:read', 'employees:read_own'],
        icon: IconUsers,
      },
      {
        href: '/students',
        label: 'Students',
        access: ['students:read', 'students:read_own_class'],
        icon: IconStudent,
      },
      {
        href: '/leave',
        label: 'Leave',
        access: ['leave:read_own', 'leave:approve'],
        icon: IconLeave,
      },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/payroll', label: 'Payroll', access: ['payroll:read'], icon: IconPayroll },
      { href: '/fees', label: 'Fees', access: ['fees:read'], icon: IconFees },
      { href: '/expenses', label: 'Expenses', access: ['expenses:read'], icon: IconExpenses },
    ],
  },
  {
    label: 'Academics',
    items: [
      // The two teacher-hub destinations are gated on `students:read_own_class`,
      // the single teacher-exclusive permission in the matrix: it exists for
      // exactly this "my class" scope. No new permission was introduced for
      // them (Phase 3 discipline). The routes themselves guard on the same
      // permission and refuse every other role.
      {
        href: '/my-classes',
        label: 'My Classes',
        access: ['students:read_own_class'],
        icon: IconStudent,
      },
      {
        href: '/my-subjects',
        label: 'My Subjects',
        access: ['students:read_own_class'],
        icon: IconSubjects,
      },
      { href: '/results', label: 'Results', access: ['results:read'], icon: IconResults },
      {
        href: '/report-cards',
        label: 'Report Cards',
        access: ['reportcards:read'],
        icon: IconReportCard,
      },
      {
        href: '/subjects',
        label: 'Subjects',
        access: ['subjects:manage'],
        icon: IconSubjects,
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      { href: '/reports', label: 'Reports', access: ['reports:read'], icon: IconReports },
      {
        href: '/notifications',
        label: 'Notifications',
        // Visible to every staff-linked account: the module's own page gates
        // each item by its source permission, so a teacher lands on an honest
        // "all clear" where a manager sees the full approval queue.
        access: ['employees:read', 'employees:read_own'],
        icon: IconBell,
      },
      {
        href: '/settings',
        label: 'Settings',
        access: ['settings:manage', 'users:manage', 'audit:read'],
        icon: IconSettings,
      },
    ],
  },
];

/** Options that shape the navigation surface per deployment. */
export interface NavOptions {
  /** False hides the Leave module from the sidebar (feature flag). */
  leaveEnabled?: boolean;
}

/** Groups and items visible to one user, in document order. */
export function navGroupsFor(user: SessionUser | null, options: NavOptions = {}): NavGroup[] {
  if (!user) return [];
  const leaveEnabled = options.leaveEnabled ?? true;
  return NAV_GROUPS.flatMap((group) => {
    const items = group.items.filter((item) => {
      if (item.always) return true;
      if (item.href.startsWith('/leave') && !leaveEnabled) return false;
      return canAny(user, item.access);
    });
    return items.length === 0 ? [] : [{ ...group, items }];
  });
}

/** The label of the current section, for the header breadcrumb. */
export function sectionLabelForPathname(
  user: SessionUser | null,
  pathname: string,
  options: NavOptions = {},
): string | null {
  if (!user) return null;
  if (pathname === '/dashboard') return 'Dashboard';
  for (const group of navGroupsFor(user, options)) {
    for (const item of group.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return item.label;
    }
  }
  return null;
}

export function canUseStaff(user: SessionUser | null): boolean {
  return canAny(user, ['employees:read', 'employees:read_own']);
}

export function canAddStaff(user: SessionUser | null): boolean {
  return can(user, 'employees:write');
}

export function canDeactivateStaff(user: SessionUser | null): boolean {
  return can(user, 'employees:deactivate');
}
