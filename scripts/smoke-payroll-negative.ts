/**
 * SMOKE TEST: PAYROLL GENERATION, NEGATIVE PATH, LIVE DATABASE
 * ============================================================
 *
 * WHY IT EXISTS
 * -------------
 * Payroll generation is the one write path that cannot run under the
 * application role: payroll_periods / payroll_runs / payroll_items have no
 * INSERT policy, so generation escalates to the service context (BYPASSRLS)
 * with the caller's identity stamped into `app.user_id`. That plumbing is
 * worth proving once against a real database, on the friendliest possible
 * branch: the "no eligible employees" path, which throws PreconditionError
 * and writes NOTHING.
 *
 * HOW IT STAYS SAFE
 * -----------------
 * Before calling generatePayroll it runs getGeneratePreview - a read-only
 * path - and only proceeds when the chosen period has no run AND no eligible
 * employees. If the database ever has enough data that generation would
 * succeed, the script prints SKIPPED and exits 0 rather than writing real
 * payroll lines. 2099-12 is used so it cannot collide with real periods.
 *
 * RUN: npx tsx scripts/smoke-payroll-negative.ts
 * Requires .env.local with SERVICE_DATABASE_URL (and DATABASE_URL for the
 * read-only preview is NOT needed - preview runs in user context on the app
 * pool, generation in service context on the service pool).
 */

import { existsSync, readFileSync } from 'node:fs';

import type { SessionUser } from '../src/server/auth/permissions';
import { PreconditionError } from '../src/lib/errors';
import { generatePayroll, getGeneratePreview } from '../src/server/portal/payroll';

/** Read a dotenv file without printing anything from it. */
function readEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !line.trimStart().startsWith('#')) out[m[1]!] = m[2]!.trim();
  }
  return out;
}

async function main(): Promise<number> {
  if (!existsSync('.env.local')) {
    console.error('No .env.local - this needs SERVICE_DATABASE_URL.');
    return 2;
  }
  const env = readEnv('.env.local');
  if (!env.SERVICE_DATABASE_URL) {
    console.error('No SERVICE_DATABASE_URL in .env.local.');
    return 2;
  }
  for (const [key, value] of Object.entries(env)) {
    process.env[key] ??= value;
  }

  // The seeded proprietor. The id is a placeholder: the negative path writes
  // no rows, so no FK to app_users is ever touched here.
  const user: SessionUser = {
    id: '00000000-0000-4000-8000-000000000000',
    username: 'smoke-test',
    fullName: 'Payroll Smoke Test',
    role: 'proprietor',
    employeeId: null,
  };

  const YEAR = 2099;
  const MONTH = 12;

  console.log(`[1/2] Read-only preview for ${YEAR}-${MONTH} ...`);
  const preview = await getGeneratePreview(user, { year: YEAR, month: MONTH });
  console.log(
    `      period=${preview.period} existingRun=${preview.existingRun?.runCode ?? 'none'}` +
      ` eligible=${preview.eligibleEmployees.length}` +
      ` excludedMissingSalary=${preview.excludedMissingSalary}` +
      ` currency=${preview.currencyCode}`,
  );

  if (preview.eligibleEmployees.length > 0) {
    console.log(
      '\nSKIPPED: eligible employees exist, so generation would succeed and write real data.\n' +
        'A smoke test must never do that - re-run on an empty database.',
    );
    return 0;
  }

  console.log('[2/2] Calling generatePayroll (expects PreconditionError, writes nothing) ...');
  try {
    const result = await generatePayroll(user, { year: YEAR, month: MONTH });
    console.error(
      `UNEXPECTED: generation succeeded (run ${result.runCode}, ${result.employeeCount} employees). ` +
        'This wrote real data - inspect and remove it before continuing.',
    );
    return 1;
  } catch (err) {
    if (err instanceof PreconditionError) {
      console.log(`OK (PreconditionError): ${err.message}`);
      return 0;
    }
    console.error(`UNEXPECTED ERROR (${err instanceof Error ? err.name : typeof err}):`, err);
    return 1;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 2;
  });