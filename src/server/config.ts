/**
 * Application configuration, read from environment variables.
 *
 * SERVER ONLY. Reads `process.env` through src/server/env.ts, which imports
 * `server-only` so this can never be pulled into a client bundle.
 *
 * Business rules that depend on school policy rather than on software
 * behaviour live in the `settings` table, not here, so an administrator can
 * change them without a deploy. This file holds only deployment-level
 * configuration and the defaults used before those settings are read.
 */

import { serverEnv } from './env';

export interface AppConfig {
  schoolName: string;
  currencyCode: string;
  currencyMinorUnits: number;
  /** Employee statuses included in payroll generation. */
  payrollEligibleStatuses: string[];
  /**
   * Internal control: the user who generates a payroll may not be the sole
   * user who approves it. Also enforced by a database CHECK constraint, so
   * disabling it here does not disable it in the database.
   */
  requireSeparateApprover: boolean;
  loginRateLimit: { attempts: number; windowMs: number };
  enableAttendance: boolean;
  enableLeave: boolean;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;

  const statuses = (serverEnv.PAYROLL_ELIGIBLE_EMPLOYEE_STATUSES ?? 'active')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  cached = {
    schoolName: 'SAMJONA',
    currencyCode: serverEnv.CURRENCY_CODE ?? 'NLe',
    currencyMinorUnits: int(serverEnv.CURRENCY_MINOR_UNITS, 2),
    // Defaults to Active only, so a suspended or terminated employee can never
    // be paid by accident.
    payrollEligibleStatuses: statuses.length > 0 ? statuses : ['active'],
    requireSeparateApprover: bool(serverEnv.REQUIRE_SEPARATE_PAYROLL_APPROVER, true),
    loginRateLimit: {
      attempts: int(serverEnv.LOGIN_RATE_LIMIT_ATTEMPTS, 5),
      windowMs: int(serverEnv.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    },
    // Attendance stays off until the school confirms its rules. The
    // specification forbids deducting pay for absence without an explicit
    // policy, and the feature flags make that impossible to do by accident.
    enableAttendance: bool(serverEnv.ENABLE_ATTENDANCE_MODULE, false),
    enableLeave: bool(serverEnv.ENABLE_LEAVE_MODULE, true),
  };
  return cached;
}

/** Test hook. */
export function resetConfigCache(): void {
  cached = null;
}
