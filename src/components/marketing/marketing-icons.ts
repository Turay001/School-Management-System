import type { ComponentType } from 'react';

import {
  IconBell,
  IconCalendar,
  IconClock,
  IconDashboard,
  IconExpenses,
  IconFamily,
  IconFees,
  IconFolder,
  IconHistory,
  IconLeave,
  IconLock,
  IconMessage,
  IconPayroll,
  IconReportCard,
  IconReports,
  IconSchool,
  IconSearch,
  IconSettings,
  IconShield,
  IconStudent,
  IconSubjects,
  IconUser,
  IconUsers,
  type IconProps,
} from '@/components/icons';
import type { MarketingIcon } from '@/lib/brand';

/**
 * Icon keys to drawings.
 *
 * The public copy in `src/lib/brand.ts` names an icon as a string rather than
 * holding a component, so that `src/lib` never has to import from
 * `src/components`. This map is the single seam between the two, and it is
 * typed: adding a key to `MarketingIcon` without drawing it here is a build
 * error rather than a blank tile at runtime.
 *
 * Every drawing is one that already exists in `src/components/icons.tsx` for the
 * application's own navigation. Nothing was drawn for the landing page: the
 * icons on a page about a school should be the same icons as the icons inside
 * the school, and a parallel set would be one more thing to keep consistent.
 */
export const MARKETING_ICONS: Record<MarketingIcon, ComponentType<IconProps>> = {
  academics: IconSubjects,
  attendance: IconCalendar,
  bell: IconBell,
  clock: IconClock,
  dashboard: IconDashboard,
  expenses: IconExpenses,
  family: IconFamily,
  fees: IconFees,
  folder: IconFolder,
  history: IconHistory,
  leave: IconLeave,
  lock: IconLock,
  message: IconMessage,
  payroll: IconPayroll,
  records: IconReportCard,
  reports: IconReports,
  school: IconSchool,
  search: IconSearch,
  settings: IconSettings,
  shield: IconShield,
  staff: IconUsers,
  students: IconStudent,
  user: IconUser,
};
