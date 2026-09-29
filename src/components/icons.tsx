/**
 * SAMJONA icon set.
 *
 * Hand-written 24x24 stroke icons, `currentColor`, consistent 1.75 stroke.
 * Decorative by design: every icon in the application sits next to a text
 * label, and the `sr-only` label is what a screen reader announces. No icon
 * library is used - the set is small, and shipping one more dependency for
 * nineteen paths is not worth the install or the audit surface.
 */

import type { ReactNode } from 'react';

export interface IconProps {
  className?: string;
}

function Svg({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function IconDashboard(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </Svg>
  );
}

export function IconUsers(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.4 3.2-5 6.5-5s5.9 1.6 6.5 5" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M18.6 15.4c1.6.8 2.6 2.2 2.9 4.6" />
    </Svg>
  );
}

export function IconStudent(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M22 9 12 4 2 9l10 5 10-5Z" />
      <path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5" />
      <path d="M22 9v5" />
    </Svg>
  );
}

export function IconPayroll(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.5" y="6" width="19" height="13" rx="2" />
      <circle cx="12" cy="12.5" r="2.8" />
      <path d="M6 9.7h.01M18 15.3h.01" />
    </Svg>
  );
}

export function IconFees(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="9" cy="9" r="6.5" />
      <path d="M9 5.8v6.4M7 8.4h4a1.6 1.6 0 1 0 0-3.2" />
      <path d="M15 8.5a6.5 6.5 0 1 1-3 5.5" opacity={0.5} />
    </Svg>
  );
}

export function IconExpenses(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 3.5h13a2 2 0 0 1 2 2V20l-2.5-1.8L14 20l-2.5-1.8L9 20l-2.5-1.8L4 20V3.5Z" />
      <path d="M7.5 8.5h8M7.5 12h8" />
    </Svg>
  );
}

export function IconReports(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
    </Svg>
  );
}

export function IconBell(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5Z" />
      <path d="M9.5 19a2.5 2.5 0 0 0 5 0" />
    </Svg>
  );
}

export function IconSettings(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-2-1.2L14.2 3h-4L9.6 5.7a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.3 2.7h4l.3-2.7a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" />
    </Svg>
  );
}

export function IconSearch(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.8-3.8" />
    </Svg>
  );
}

export function IconResults(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
      <path d="M8.5 8h7M8.5 17h7" opacity={0.45} />
    </Svg>
  );
}

export function IconReportCard(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 3.5h12a2 2 0 0 1 2 2V20l-2.5-1.8L15 20l-2.5-1.8L10 20l-2.5-1.8L5 20V4.5A1 1 0 0 1 6 3.5Z" />
      <path d="M9 9.5h7M9 12.8h7M9 16h4" />
    </Svg>
  );
}

export function IconUpload(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 16V5" />
      <path d="m7.5 9.5 4.5-4.5 4.5 4.5" />
      <path d="M4.5 20h15" />
    </Svg>
  );
}

export function IconSubjects(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 6.5C10.6 5 8.6 4.5 6.5 4.5c-1.2 0-2.2.2-3 .5v12c.8-.3 1.8-.5 3-.5 2.1 0 4.1.5 5.5 2 1.4-1.5 3.4-2 5.5-2 1.2 0 2.2.2 3 .5v-12c-.8-.3-1.8-.5-3-.5-2.1 0-4.1.5-5.5 2Z" />
      <path d="M12 6.5V19.5" />
    </Svg>
  );
}

export function IconMenu(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Svg>
  );
}

export function IconX(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function IconChevronDown(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

export function IconChevronUp(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m6 15 6-6 6 6" />
    </Svg>
  );
}

export function IconChevronRight(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m9 6 6 6-6 6" />
    </Svg>
  );
}

export function IconChevronLeft(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m15 6-6 6 6 6" />
    </Svg>
  );
}

export function IconUser(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c.7-3.7 3.8-5.5 7.5-5.5s6.8 1.8 7.5 5.5" />
    </Svg>
  );
}

export function IconLogOut(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H9" />
      <path d="m15 8 4 4-4 4M19 12H9" />
    </Svg>
  );
}

export function IconHelp(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.4 9a2.6 2.6 0 1 1 4.1 2.1c-.9.7-1.5 1.1-1.5 2.2" />
      <path d="M12 16.6h.01" />
    </Svg>
  );
}

export function IconPlus(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconAlertTriangle(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10.3 3.9 2.4 17.5a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 16.5h.01" />
    </Svg>
  );
}

export function IconCheck(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m4.5 12.5 5 5 10-11" />
    </Svg>
  );
}

export function IconEye(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

export function IconEyeOff(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 4l16 16" />
      <path d="M9.9 5.2A9.9 9.9 0 0 1 12 5c6 0 9.5 7 9.5 7a17.7 17.7 0 0 1-3 3.9" />
      <path d="M6.1 6.6A16 16 0 0 0 2.5 12S6 19 12 19a9.6 9.6 0 0 0 4.4-1.1" />
    </Svg>
  );
}

export function IconArrowRight(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  );
}

export function IconCalendar(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 10h17M8 2.5V6.5M16 2.5V6.5" />
    </Svg>
  );
}

export function IconBank(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 9.5 12 4l9 5.5Z" />
      <path d="M5 10v7M9.5 10v7M14.5 10v7M19 10v7M3.5 21h17" />
    </Svg>
  );
}

export function IconInfo(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.6h.01" />
    </Svg>
  );
}

export function IconDownload(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.5v11M7 10l5 5 5-5" />
      <path d="M4.5 19.5h15" />
    </Svg>
  );
}

export function IconLeave(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 3.5v17" />
      <path d="M8 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
      <path d="M4.5 12h11.5M14 8.5l3.5 3.5L14 15.5" />
    </Svg>
  );
}

/*
 * The eight icons below were added with the public landing page, for the
 * sections that explain SAMJONA to parents and staff rather than to a
 * developer. They follow the same conventions as the rest of the set - 24x24,
 * `currentColor`, 1.75 stroke - and each still sits next to a text label, so
 * none of them carries meaning on its own.
 */

export function IconShield(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3 5 5.8v5.5c0 4.2 2.8 7.6 7 9.2 4.2-1.6 7-5 7-9.2V5.8L12 3Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </Svg>
  );
}

export function IconLock(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
      <path d="M12 14.2v2.4" />
    </Svg>
  );
}

export function IconFolder(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.2l2 2.4H19a1.5 1.5 0 0 1 1.5 1.5v9.6A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5Z" />
      <path d="M8 13h8M8 16.5h5" />
    </Svg>
  );
}

export function IconMessage(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20.5 12.5c0 3.9-3.8 7-8.5 7-1 0-2-.2-2.9-.4L4 20.5l1.3-3.6A6.6 6.6 0 0 1 3.5 12.5c0-3.9 3.8-7 8.5-7s8.5 3.1 8.5 7Z" />
      <path d="M8.5 12.5h.01M12 12.5h.01M15.5 12.5h.01" />
    </Svg>
  );
}

export function IconClock(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.2V12l3.2 2" />
    </Svg>
  );
}

export function IconHistory(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.8 11.2A8.5 8.5 0 1 1 4.6 16" />
      <path d="M3.5 5.5v5.5H9" />
      <path d="M12 7.8V12l3 1.8" />
    </Svg>
  );
}

export function IconSchool(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3 2.8 7.4 12 11.8l9.2-4.4L12 3Z" />
      <path d="M6.4 9.8v6.4c0 1.7 2.5 3.1 5.6 3.1s5.6-1.4 5.6-3.1V9.8" />
      <path d="M21.2 7.4v5" />
    </Svg>
  );
}

export function IconFamily(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="6.2" cy="8.4" r="2.7" />
      <path d="M1.8 19.2c.5-2.8 2.3-4.2 4.4-4.2s3.9 1.4 4.4 4.2" />
      <circle cx="12" cy="10.6" r="1.9" />
      <path d="M9 19.4c.3-2 1.4-3.1 3-3.1s2.7 1.1 3 3.1" />
      <circle cx="18" cy="7.6" r="3" />
      <path d="M13.3 19.2c.5-3.1 2.4-4.7 4.7-4.7 1.9 0 3.4.8 4.2 2.3" />
    </Svg>
  );
}
