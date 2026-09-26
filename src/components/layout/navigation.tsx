import type { ComponentType } from 'react';

import type { IconProps } from '@/components/icons';
import {
  IconBell,
  IconDashboard,
  IconExpenses,
  IconFees,
  IconLeave,
  IconPayroll,
  IconReports,
  IconSettings,
  IconStudent,
  IconUsers,
} from '@/components/icons';
import { can, canAny, type Permission, type SessionUser } from '@/server/auth/permissions';

/**
 * Navigation, gated by the SAME permission matrix the server enforces. The
 * sidebar only renders items the signed-in role may actually use; hiding a
 * link here is affordance - the route handler still forbids unauthorized use.
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
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ href: '/dashboard', label: 'Dashboard', access: ['employees:read'], icon: IconDashboard }],
  },
  {
    label: 'People',
    items: [
      { href: '/staff', label: 'Staff', access: ['employees:read', 'employees:read_own'], icon: IconUsers },
      {
        href: '/students',
        label: 'Students',
        access: ['students:read', 'students:read_own_class'],
        icon: IconStudent,
        placeholder: true,
      },
      {
        href: '/leave',
        label: 'Leave',
        access: ['leave:read_own', 'leave:approve'],
        icon: IconLeave,
        placeholder: true,
      },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/payroll', label: 'Payroll', access: ['payroll:read'], icon: IconPayroll },
      { href: '/fees', label: 'Fees', access: ['fees:read'], icon: IconFees, placeholder: true },
      { href: '/expenses', label: 'Expenses', access: ['expenses:read'], icon: IconExpenses, placeholder: true },
    ],
  },
  {
    label: 'Administration',
    items: [
      { href: '/reports', label: 'Reports', access: ['reports:read'], icon: IconReports, placeholder: true },
      {
        href: '/notifications',
        label: 'Notifications',
        // Visible to everyone with an account - the item can never be hidden
        // behind an empty permission list (an empty list matches no one).
        access: ['employees:read'],
        icon: IconBell,
        placeholder: true,
      },
      {
        href: '/settings',
        label: 'Settings',
        access: ['settings:manage', 'users:manage', 'audit:read'],
        icon: IconSettings,
        placeholder: true,
      },
    ],
  },
];

/** Groups and items visible to one user, in document order. */
export function navGroupsFor(user: SessionUser | null): NavGroup[] {
  if (!user) return [];
  return NAV_GROUPS.flatMap((group) => {
    const items = group.items.filter((item) => canAny(user, item.access));
    return items.length === 0 ? [] : [{ ...group, items }];
  });
}

/** The label of the current section, for the header breadcrumb. */
export function sectionLabelForPathname(user: SessionUser | null, pathname: string): string | null {
  if (!user) return null;
  if (pathname === '/dashboard') return 'Dashboard';
  for (const group of navGroupsFor(user)) {
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