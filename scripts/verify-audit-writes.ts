/**
 * VERIFY THE AUDIT WRITE PATH AGAINST A REAL DATABASE
 * ===================================================
 *
 * WHY THIS EXISTS
 * ---------------
 * Six functions write to `audit_logs`. They were all SECURITY INVOKER, and
 * `audit_logs` has no INSERT policy for application roles, so every audited
 * write failed with:
 *
 *   ERROR 42501: new row violates row-level security policy for table
 *   "audit_logs"
 *
 * 285 tests did not catch it. They could not: the test engine runs every
 * session as a superuser, and a superuser bypasses RLS even against
 * `FORCE ROW LEVEL SECURITY`. Those tests exercised trigger LOGIC and proved
 * nothing about PRIVILEGES.
 *
 * Two halves, two tools:
 *
 *   src/server/db/__tests__/audit-write-path.test.ts  the privilege PROPERTIES,
 *       read from the catalog. Fast, runs in CI, cannot prove the write.
 *   THIS SCRIPT  the actual write, over a real connection, as the roles the
 *       application really uses. Slow, manual, and the only thing that settles
 *       it.
 *
 * RUN IT after any migration that touches a trigger, function, policy or grant,
 * and before trusting a deploy.
 *
 * TWO CONNECTIONS, BECAUSE THE APP DOES NOT USE ONE ROLE
 * -----------------------------------------------------
 * Most writes happen as the application role (`samjona_login`, via
 * DATABASE_URL). Payroll does not: `payroll_periods` and `payroll_runs` have
 * SELECT-only policies on purpose, because generation must go through the
 * privileged service context so that a compromised route handler cannot write
 * payroll lines. So payroll is probed as `samjona_service_login`, whose
 * credentials live only in `.env.setup` and are built here by substituting the
 * user in DATABASE_URL. Probing payroll as the app role would report a
 * perfectly correct policy decision as a failure.
 *
 * `postgres` is never used to write. It is not a member of `samjona_app` and
 * cannot SET ROLE to it, so a write as `postgres` would test something the
 * application never does - and `postgres` bypasses RLS, so it would pass
 * regardless of how broken the policies were.
 *
 * EVERYTHING IS ROLLED BACK
 * -------------------------
 * One transaction, `rollback` in a `finally`. Nothing is committed. Safe
 * against production. Each probe gets its own savepoint so that one failure
 * does not abort the transaction and cascade into every later probe reporting
 * nonsense.
 *
 * COVERAGE - READ THIS BEFORE TRUSTING A PASS
 * -------------------------------------------
 * Probed: employees (insert and update), employee_salary_history (insert and
 * update), employee_bank_accounts (insert), fee_payments (insert),
 * payroll_periods and payroll_runs (insert, as the service role). Five of the
 * six audited tables, both trigger branches, and both roles.
 *
 * NOT probed: `fee_adjustments`. `created_by` is NOT NULL and references
 * `app_users`, which is empty, so there is no user to attribute an adjustment
 * to and the insert cannot be attempted at all. That is not a gap in this
 * script, it is a real onboarding problem: until the first user is provisioned,
 * nobody can record a fee adjustment. Trigger logic for it is covered by the
 * PGlite integrity suite.
 *
 * A pass means these five tables are writable by the role that writes them,
 * and a forbidden write is still forbidden. It does NOT mean every table,
 * policy and function in the database has been exercised.
 */

import { existsSync, readFileSync } from 'node:fs';
import { Client } from 'pg';

type Outcome = 'ok' | 'refused' | 'failed' | 'skipped';

interface ProbeResult {
  name: string;
  outcome: Outcome;
  detail: string;
}

/** Read a dotenv file without printing anything from it. */
function readEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !line.trimStart().startsWith('#')) out[m[1]!] = m[2]!.trim();
  }
  return out;
}

/**
 * Build the service-role connection string by substituting the user in
 * DATABASE_URL, so the host, port and TLS settings stay exactly as configured
 * for the application and cannot drift from them.
 */
function serviceUrl(databaseUrl: string, password: string): string {
  const url = new URL(databaseUrl);
  url.username = 'samjona_service_login';
  url.password = password;
  return url.toString();
}

/**
 * Classify a failure, because "the write failed" is not a useful report. The
 * distinction matters: 42501 naming `audit_logs` is THE BUG, 42501 naming
 * another table is a policy decision working correctly, and a dependency that
 * never got created is a cascade, not a finding.
 */
function classify(err: unknown): string {
  const e = err as { code?: string; message?: string; constraint?: string };
  const code = e.code ?? '????';
  const first = (e.message ?? String(err)).split('\n')[0] ?? '';
  if (code === '42501' && first.includes('audit_logs')) {
    return 'THE BUG: the audit trigger is not SECURITY DEFINER';
  }
  if (code === '23503') return `23503 foreign key ${e.constraint ?? '?'}: ${first}`;
  if (code === '23505') return `23505 unique ${e.constraint ?? '?'}: ${first}`;
  // 42501 is overloaded in PostgreSQL: it is both "violates row-level security
  // policy" AND "permission denied for table". The two mean very different
  // things here, so the server's own wording is always passed through rather
  // than being flattened into one label.
  return `${code} ${first}`;
}

const MARK: Record<Outcome, string> = {
  ok: 'OK      ',
  refused: 'REFUSED ',
  failed: 'FAILED  ',
  skipped: 'SKIPPED ',
};

function report(results: ProbeResult[]): boolean {
  console.log();
  for (const r of results) {
    const indent = r.detail ? '\n           ' : '';
    console.log(`  ${MARK[r.outcome]} ${r.name}${indent}${r.detail}`);
  }
  const count = (o: Outcome) => results.filter((r) => r.outcome === o).length;
  console.log(
    `\n${results.length} probe(s): ${count('ok')} written, ${count('refused')} correctly refused, ` +
      `${count('skipped')} skipped, ${count('failed')} failed.` +
      '\nEverything rolled back; nothing was committed.',
  );
  return count('failed') === 0;
}

async function catalogFacts(adminUrl: string | undefined): Promise<void> {
  if (!adminUrl) {
    console.log(
      '\n[1/3] Catalog check SKIPPED - no ADMIN_DATABASE_URL available.\n' +
        '      Normal for a deployment host, which needs no admin credentials.',
    );
    return;
  }

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const { rows: fns } = await admin.query<{
      proname: string;
      prosecdef: boolean;
      owner: string;
      bypass: boolean;
    }>(`
      select p.proname, p.prosecdef, r.rolname as owner, r.rolbypassrls as bypass
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_roles  r on r.oid = p.proowner
      where n.nspname = 'public' and strpos(p.prosrc, 'insert into audit_logs') > 0
      order by p.proname
    `);

    console.log('\n[1/3] Functions that write audit_logs');
    if (fns.length === 0) {
      console.log('  NONE FOUND - the discovery query is wrong, not the database.');
    }
    for (const f of fns) {
      // Both are load-bearing: SECURITY DEFINER makes the function run as its
      // owner, and the owner needs BYPASSRLS to get past a table that is
      // FORCE RLS with no INSERT policy. One without the other fails.
      const bad = !f.prosecdef ? '  <-- NOT SECURITY DEFINER, its writes WILL fail' : '';
      const weak = f.bypass ? '' : '  <-- owner lacks BYPASSRLS, its writes WILL fail';
      console.log(`  ${f.proname.padEnd(34)} definer=${f.prosecdef} owner=${f.owner}${bad}${weak}`);
    }

    const { rows: pol } = await admin.query<{ cmd: string }>(`
      select cmd from pg_policies
      where schemaname = 'public' and tablename = 'audit_logs'
    `);
    const cmds = [...new Set(pol.map((p) => p.cmd.toUpperCase()))].sort();
    console.log(
      `\n  audit_logs policies: ${cmds.length ? cmds.join(', ') : 'NONE'}` +
        `\n  An INSERT policy here would mean app code can forge audit rows.` +
        `\n  Expected: SELECT only.`,
    );

    // The service role, and the login roles that connect as it.
    //
    // `rolbypassrls` is an attribute of the role itself. Whether a login role
    // that is a MEMBER of a BYPASSRLS role inherits that attribute is exactly
    // the kind of thing worth not reasoning about from memory, and the catalog
    // has no function that answers it directly - so the facts are printed and
    // the probe below is the arbiter. If payroll writes succeed, membership was
    // enough; if they fail with 42501, it was not.
    const { rows: svc } = await admin.query<{
      rolname: string;
      bypass: boolean;
      member_of_app: boolean;
      member_of_service: boolean;
    }>(`
      select r.rolname,
             r.rolbypassrls                                   as bypass,
             pg_has_role(r.oid, 'samjona_app', 'MEMBER')     as member_of_app,
             pg_has_role(r.oid, 'samjona_service', 'MEMBER') as member_of_service
      from pg_roles r
      where r.rolname in ('samjona_app', 'samjona_service',
                          'samjona_login', 'samjona_service_login')
      order by r.rolname
    `);
    console.log('\n  Roles');
    for (const r of svc) {
      // Two things must hold, and they pull in opposite directions. The app
      // role must NOT bypass RLS, or every policy above is decorative. The
      // service login MUST end up with it, or payroll cannot be written at all.
      const problem =
        r.rolname === 'samjona_app' && r.bypass
          ? '  <-- app role BYPASSES RLS: every policy above is decorative'
          : r.rolname === 'samjona_service_login' && !r.member_of_service
            ? '  <-- not a member of samjona_service: payroll writes WILL fail'
            : '';
      console.log(
        `  ${r.rolname.padEnd(22)} bypassrls=${String(r.bypass).padEnd(5)} ` +
          `member_of_app=${String(r.member_of_app).padEnd(5)} ` +
          `member_of_service=${r.member_of_service}${problem}`,
      );
    }
  } finally {
    await admin.end();
  }
}

/**
 * Probe runner over one connection. Savepoints are what keep a single failure
 * from poisoning the rest of the report.
 */
function prober(client: Client, results: ProbeResult[]) {
  let n = 0;
  return async function probe(options: {
    name: string;
    expect?: 'success' | 'refusal';
    /** When false, the probe is reported as skipped rather than attempted. */
    ready?: boolean;
    blockedBy?: string;
    run: () => Promise<void>;
  }): Promise<void> {
    const { name, expect = 'success', ready = true, blockedBy, run } = options;

    if (!ready) {
      results.push({
        name,
        outcome: 'skipped',
        detail: `not attempted - blocked by the failure of "${blockedBy}"`,
      });
      return;
    }

    const sp = `probe_${++n}`;
    await client.query(`savepoint ${sp}`);
    try {
      await run();
      results.push(
        expect === 'success'
          ? { name, outcome: 'ok', detail: '' }
          : { name, outcome: 'failed', detail: 'SUCCEEDED but had to be refused' },
      );
    } catch (err) {
      if (expect === 'refusal') {
        // Any error will do: what is asserted is that the write did not happen.
        const detail = classify(err);
        results.push({
          name,
          outcome: 'refused',
          detail: detail.startsWith('42501') ? detail : `refused, but oddly: ${detail}`,
        });
      } else {
        results.push({ name, outcome: 'failed', detail: classify(err) });
      }
      await client.query(`rollback to savepoint ${sp}`);
      return;
    }
    await client.query(`release savepoint ${sp}`);
  };
}

async function main(): Promise<void> {
  if (!existsSync('.env.local')) {
    console.error('No .env.local - this needs DATABASE_URL, the application connection.');
    process.exit(2);
  }
  const local = readEnv('.env.local');
  const setup = existsSync('.env.setup') ? readEnv('.env.setup') : {};
  const databaseUrl = local.DATABASE_URL;
  if (!databaseUrl) {
    console.error('No DATABASE_URL in .env.local.');
    process.exit(2);
  }

  await catalogFacts(setup.ADMIN_DATABASE_URL);

  // `app.user_id` is deliberately never set. `app_users` is empty on this
  // database, so there is no user to set it to, and the audit functions
  // coalesce a missing actor to 'system' - which is the correct behaviour for
  // an unattributed write and is itself worth exercising.
  const asRole = (client: Client, role: string) =>
    client.query(`select set_config('app.user_role', $1, true)`, [role]);

  const results: ProbeResult[] = [];
  const app = new Client({ connectionString: databaseUrl });
  await app.connect();
  const { rows: who } = await app.query<{ current_user: string }>('select current_user');
  console.log(`\n[2/3] Write probes as the application role (${who[0]?.current_user})`);

  let employeeId = '';
  let academicYearId = '';
  let termId = '';

  await app.query('begin');
  try {
    await asRole(app, 'proprietor');
    const probe = prober(app, results);

    await probe({
      name: 'employees INSERT (audited)',
      run: async () => {
        const { rows } = await app.query<{ id: string }>(
          `insert into employees (full_name, position, employment_date)
           values ('ZZ VERIFY ROLLBACK', 'Verification', '2026-01-01') returning id`,
        );
        employeeId = rows[0]!.id;
      },
    });

    // The UPDATE branch of the same trigger, so both branches are covered.
    await probe({
      name: 'employees UPDATE status (audited)',
      ready: employeeId !== '',
      blockedBy: 'employees INSERT (audited)',
      run: async () => {
        await app.query(`update employees set status = 'inactive' where id = $1`, [employeeId]);
      },
    });

    await probe({
      name: 'employee_salary_history INSERT',
      ready: employeeId !== '',
      blockedBy: 'employees INSERT (audited)',
      run: async () => {
        await app.query(
          `insert into employee_salary_history (employee_id, base_salary, effective_from)
           values ($1, 450000, '2026-01-01')`,
          [employeeId],
        );
      },
    });

    // The audit row for a salary change is written from inside the protection
    // trigger, so this proves the guard and the audit write coexist.
    await probe({
      name: 'employee_salary_history UPDATE base_salary (audited)',
      ready: employeeId !== '',
      blockedBy: 'employees INSERT (audited)',
      run: async () => {
        await app.query(
          `update employee_salary_history set base_salary = 500000
           where employee_id = $1 and effective_from = '2026-01-01'`,
          [employeeId],
        );
      },
    });

    await probe({
      name: 'employee_bank_accounts INSERT (audited)',
      ready: employeeId !== '',
      blockedBy: 'employees INSERT (audited)',
      run: async () => {
        await app.query(
          `insert into employee_bank_accounts
             (employee_id, bank_name, account_name, account_number)
           values ($1, 'ZZ Bank', 'ZZ Verification', '0000000000000000')`,
          [employeeId],
        );
      },
    });

    // 2099 so it cannot collide with real data. Left uncommitted, so the
    // sequences it consumes roll back with everything else.
    await probe({
      name: 'fixture: academic_year + term',
      run: async () => {
        const ay = await app.query<{ id: string }>(
          `insert into academic_years (name, start_date, end_date)
           values ('2099/00', '2099-01-01', '2099-12-31') returning id`,
        );
        academicYearId = ay.rows[0]!.id;
        const term = await app.query<{ id: string }>(
          `insert into terms (academic_year_id, name, sequence, start_date, end_date)
           values ($1, 'ZZ Verification Term', 1, '2099-01-01', '2099-06-30') returning id`,
          [academicYearId],
        );
        termId = term.rows[0]!.id;
      },
    });

    await probe({
      name: 'fee_payments INSERT (audited)',
      ready: termId !== '',
      blockedBy: 'fixture: academic_year + term',
      run: async () => {
        await app.query(
          `insert into students (full_name, admission_date)
           values ('ZZ Verification', '2099-01-05')`,
        );
        await app.query(
          `insert into fee_payments (student_id, academic_year_id, term_id, amount, method)
           select s.id, $1, $2, 25000, 'cash' from students s
           where s.full_name = 'ZZ Verification'`,
          [academicYearId, termId],
        );
      },
    });

    // The other direction. If the audit fix had widened anything, it shows here.
    await asRole(app, 'teacher');
    await probe({
      name: 'employees INSERT as teacher (MUST be refused)',
      expect: 'refusal',
      run: async () => {
        await app.query(
          `insert into employees (full_name, position, employment_date)
           values ('ZZ Should Not Exist', 'Head Teacher', '2026-01-01')`,
        );
      },
    });
  } finally {
    await app.query('rollback');
    await app.end();
  }

  results.push({
    name: 'fee_adjustments INSERT (audited)',
    outcome: 'skipped',
    detail: 'created_by is NOT NULL and app_users is empty - no user to attribute it to',
  });

  // Payroll, as the service role, because that is the only role allowed to
  // write it. Probed as the app role it would fail on a deliberate policy and be
  // read as a bug.
  //
  // The probe must mirror `withServiceContext` exactly: CONNECT as the service
  // login, then `set local role samjona_service`. Connecting as the login and
  // stopping there tests nothing useful - `samjona_service_login` is a member
  // of `samjona_service`, but `rolbypassrls` is a role attribute and is not
  // inherited through membership, so the login on its own is blocked by RLS
  // exactly like the application role. That has been verified on this very
  // database; it is the second production bug this suite exists to catch, and
  // the escalation is the real production path.
  const svcPassword = setup.SAMJONA_SERVICE_LOGIN_PASSWORD;
  console.log('\n[3/3] Write probes as the payroll service role');
  if (!svcPassword) {
    results.push({
      name: 'payroll_periods + payroll_runs INSERT (audited)',
      outcome: 'skipped',
      detail: 'no SAMJONA_SERVICE_LOGIN_PASSWORD in .env.setup',
    });
  } else {
    const svc = new Client({ connectionString: serviceUrl(databaseUrl, svcPassword) });
    await svc.connect();
    const { rows: svcWho } = await svc.query<{ current_user: string }>('select current_user');
    console.log(`     connected as ${svcWho[0]?.current_user}`);
    const svcProbe = prober(svc, results);
    await svc.query('begin');
    try {
      await svcProbe({
        name: 'payroll_periods + payroll_runs INSERT (audited)',
        run: async () => {
          // The escalation, per transaction. `set LOCAL` so a pooled connection
          // cannot carry it to the next caller - same as withServiceContext.
          await svc.query('set local role samjona_service');
          const period = await svc.query<{ id: string }>(
            `insert into payroll_periods (year, month) values (2099, 12) returning id`,
          );
          await svc.query(`insert into payroll_runs (period_id) values ($1)`, [period.rows[0]!.id]);
        },
      });
    } finally {
      await svc.query('rollback');
      await svc.end();
    }
  }

  if (!report(results)) {
    console.error('\nAUDIT WRITE PATH IS NOT HEALTHY. Do not deploy on this database.');
    process.exit(1);
  }
  console.log('\nAudit write path healthy for the probed tables. See COVERAGE in the header.');
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
