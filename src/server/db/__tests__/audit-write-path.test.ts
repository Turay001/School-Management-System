/**
 * AUDIT WRITE PATH TESTS
 * ======================
 *
 * Regression tests for the bug found in Phase 5: the six functions that write
 * `audit_logs` were SECURITY INVOKER, and `audit_logs` has no INSERT policy for
 * application roles. Every audited write therefore failed with 42501.
 *
 * WHAT THESE TESTS CAN AND CANNOT PROVE
 * ------------------------------------
 * They CANNOT prove the write succeeds, because the test engine runs every
 * session as a superuser and a superuser bypasses RLS even against
 * `FORCE ROW LEVEL SECURITY`. That is precisely why 179 tests missed this bug:
 * the integrity suite writes as the table owner and exercises trigger LOGIC
 * only.
 *
 * What they CAN prove is the property the fix depends on: every function that
 * writes `audit_logs` is SECURITY DEFINER, and its owner outranks the caller.
 * That property is what makes the write succeed in production, and it is
 * observable in the catalog from a superuser session just as well as from a
 * restricted one.
 *
 * The end-to-end proof - an INSERT as `samjona_login` on the live database - is
 * `scripts/diagnose-audit-write.ts`, which runs every statement in a
 * transaction that is rolled back.
 *
 * THE FUNCTION LIST IS DISCOVERED, NOT HARDCODED
 * ----------------------------------------------
 * The set of audit-writing functions is read out of `pg_proc.prosrc`. A list
 * written out by hand would go stale the moment someone adds an audit branch to
 * a new table, and the new function would be SECURITY INVOKER by default -
 * which is the bug, repeated.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDatabase } from '../../db/__tests__/harness';

let db: PGlite;

interface AuditFunction {
  proname: string;
  prosecdef: boolean;
  owner: string;
  owner_bypass: boolean;
  owner_super: boolean;
  search_path_pinned: boolean;
  executable_by_app: boolean;
}

beforeAll(async () => {
  db = await migratedDatabase();
}, 120_000);

async function auditFunctions(): Promise<AuditFunction[]> {
  const { rows } = await db.query<{
    proname: string;
    prosecdef: boolean;
    owner: string;
    owner_bypass: boolean;
    owner_super: boolean;
    search_path_pinned: boolean;
    executable_by_app: boolean;
  }>(`
    select
      p.proname,
      p.prosecdef,
      r.rolname                              as owner,
      r.rolbypassrls                         as owner_bypass,
      r.rolsuper                             as owner_super,
      exists (
        select 1 from unnest(p.proconfig) cfg where left(cfg, 12) = 'search_path='
      )                                      as search_path_pinned,
      has_function_privilege('samjona_app', p.oid, 'EXECUTE') as executable_by_app
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_roles r on r.oid = p.proowner
    where n.nspname = 'public'
      and strpos(p.prosrc, 'insert into audit_logs') > 0
    order by p.proname
  `);
  return rows as AuditFunction[];
}

describe('every function that writes the audit trail', () => {
  it('is found by the discovery query', () => {
    // If this is zero the query regressed and every assertion below is
    // vacuous. It is the same failure mode migration 016 hit with a LIKE
    // pattern that matched nothing.
    // Count: 6 from 010 + 1 from 002 + 2 from 020 + 4 from 022 = 13
    return expect(auditFunctions()).resolves.toHaveLength(13);
  });

  it('includes all audit-writing functions from 002, 010, 020, and 022', async () => {
    const names = (await auditFunctions()).map((f) => f.proname);

    expect(names).toEqual([
      'app_audit_adjustments',
      'app_audit_assessments',
      'app_audit_bank_account_changes',
      'app_audit_employee_changes',
      'app_audit_expenses',
      'app_audit_fee_events',
      'app_audit_leave_requests',
      'app_audit_payroll_run',
      'app_audit_results',
      'app_audit_salary_history_insert',
      'app_audit_students',
      'app_log_audit',
      'app_protect_salary_history',
    ]);
  });

  it('is SECURITY DEFINER', async () => {
    // THE assertion. Without it, every audited write fails with
    // "new row violates row-level security policy for table audit_logs".
    const insecure = (await auditFunctions()).filter((f) => !f.prosecdef).map((f) => f.proname);

    expect(insecure, 'these audit functions are SECURITY INVOKER').toEqual([]);
  });

  it('is owned by a role whose privileges outrank the application role', async () => {
    // `audit_logs` has FORCE ROW LEVEL SECURITY, so a definer function owned by
    // an ordinary role is still subject to its policies - and there is no
    // INSERT policy. The fix only works because the owner holds BYPASSRLS or
    // SUPERUSER. If this ever fails, migration 017's guard would have raised.
    const weak = (await auditFunctions())
      .filter((f) => !f.owner_bypass && !f.owner_super)
      .map((f) => `${f.proname} (owner ${f.owner})`);

    expect(weak).toEqual([]);
  });

  it('has a pinned search_path', async () => {
    // Object shadowing inside a SECURITY DEFINER function is a
    // privilege-escalation path: a writable schema earlier in the path can
    // supply a replacement function. Migration 016 pinned this for every
    // app_* function, and re-creating a function without the clause would undo
    // it - which is why the clause is repeated in 017.
    const unpinned = (await auditFunctions())
      .filter((f) => !f.search_path_pinned)
      .map((f) => f.proname);

    expect(unpinned).toEqual([]);
  });

  it('is not directly executable by the application role', async () => {
    // SECURITY DEFINER widens what a function may do, so it must not widen who
    // may call it. These are trigger functions and cannot do anything when
    // called directly, but the check is here so that a future change making one
    // callable is caught here rather than reasoned about later.
    const callable = (await auditFunctions())
      .filter((f) => f.executable_by_app)
      .map((f) => f.proname);

    expect(callable).toEqual([]);
  });
});

describe('migration 017 is a faithful copy of the definitions it supersedes', () => {
  /**
   * `SECURITY DEFINER` can only be set at creation time, so 017 has to repeat
   * the six function bodies from 010. That is a real duplication hazard: the
   * live function is whichever definition was applied last, and if someone edits
   * an audit branch in 010 and not in 017 the two disagree with no error.
   *
   * These tests fail if the copies drift. The bodies are compared with
   * whitespace collapsed, because the clause that differs - `security definer`
   * and the `set search_path` line - sits between the header and the body.
   */
  const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
  const ORIGINALS = ['010_triggers.sql', '017_audit_trigger_security_definer.sql'];
  const SUPERSEDED = [
    'app_protect_salary_history',
    'app_audit_fee_events',
    'app_audit_adjustments',
    'app_audit_employee_changes',
    'app_audit_bank_account_changes',
    'app_audit_payroll_run',
  ];

  /** Extract the `as $$ ... $$` body of a zero-argument function from a file. */
  function bodyIn(file: string, fn: string): string {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    const escaped = fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(
      `create or replace function ${escaped}\\(\\)[\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`,
      'i',
    ).exec(sql);
    if (!match?.[1]) throw new Error(`No body found for ${fn} in ${file}`);
    return match[1].replace(/\s+/g, ' ').trim();
  }

  it.each(SUPERSEDED)('%s has the same body in 010 and 017', (fn) => {
    expect(bodyIn(ORIGINALS[1]!, fn)).toBe(bodyIn(ORIGINALS[0]!, fn));
  });

  it('declares security definer on exactly the six it supersedes', () => {
    const sql = readFileSync(join(MIGRATIONS, ORIGINALS[1]!), 'utf8');
    const declared = [
      ...sql.matchAll(/create or replace function (\w+)\(\)[\s\S]*?security definer/gi),
    ]
      .map((m) => m[1])
      .sort();

    expect(declared).toEqual([...SUPERSEDED].sort());
  });
});
