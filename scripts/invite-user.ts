/**
 * INVITE A STAFF ACCOUNT
 * ======================
 *
 *   npm run db:invite-user -- <auth-user-uuid> <username> "<full name>" <role> \
 *                            [--employee <code>] [--allow-duplicate-role]
 *
 * WHY THIS EXISTS ALONGSIDE db:seed-first-user
 * --------------------------------------------
 * `seed-first-user` is named for what it is: the bootstrap. Creating the first
 * account is the one action that cannot be performed by an account that does not
 * exist yet, which is why it has its own script and its own error messages.
 *
 * Every account after that is ordinary staff onboarding, and it was being done by
 * re-running a script called "seed-first-user" with different arguments. That is
 * a bad way to run a school: the name tells the operator this is not the normal
 * path, the script's output promises first-time things ("What this unblocks: the
 * fee_adjustments path had no user to point at") that are long since true, and
 * nothing in it mentions the checks that matter when adding the tenth member of
 * staff rather than the first.
 *
 * So this script is the ordinary path, and `seed-first-user` stays as the
 * bootstrap. Both share one implementation of the parts that must not drift --
 * see `scripts/lib/app-user.ts` for how a stale copy of the role list nearly
 * shipped three roles the database does not have.
 *
 * WHAT IT CHECKS, AND WHY EACH ONE IS HERE
 * -----------------------------------------
 *   auth user exists      Attaching a profile to an auth id that is not there
 *                         fails on the foreign key with a message that does not
 *                         say what to do next.
 *   profile not existing  A second profile for one auth user is a data-integrity
 *                         error, not an update. This script does not overwrite.
 *   username free         `username` is citext, so uniqueness is already
 *                         case-insensitive in the database; checked here so the
 *                         error names the account that holds it.
 *   role is real          Checked against the application's own ROLES constant,
 *                         not a copied list.
 *   role occupancy        See `assessRole`. `proprietor` is single-holder; a
 *                         second one is a change of governance, not a staffing
 *                         decision, so it needs an explicit flag.
 *   employee link         Optional but worth doing. `app_users.employee_id` is
 *                         what `/my-profile` and the staff-id resolution in
 *                         `src/server/portal/staff.ts` read, so a staff login
 *                         created without it is a login that cannot find the
 *                         staff record behind it.
 *
 * IT SETS must_change_password
 * ----------------------------
 * The auth user was created in the Supabase dashboard with a password the
 * administrator chose, which means the administrator knows it. Every role
 * dashboard renders `PasswordChangeAlert` when this flag is set, so the new
 * account is told to replace it on first sign-in.
 *
 * That banner is currently text only -- it does not link anywhere -- so the
 * person has to use "Forgot password" on the login page to actually change it.
 * Supabase sends that email itself, so the path works; it is just not advertised
 * where the instruction is given.
 *
 * NO PROMPTS
 * ----------
 * Argument order is explicit and nothing is interactive, for the same reason as
 * `seed-first-user`: this may be run twice by a nervous operator, or pasted from
 * a handover note, and it must behave identically both times. A prompt that
 * silently takes a default is how a Principal account quietly becomes a Teacher
 * account.
 */

import { existsSync } from 'node:fs';
import { Client } from 'pg';

import {
  ROLES,
  USERNAME_PATTERN,
  UUID_PATTERN,
  assessRole,
  fatal,
  isRole,
  readEnv,
  verifyVisibleAsItself,
  type Role,
  type RoleHolder,
} from './lib/app-user';

interface Args {
  authUserId: string;
  username: string;
  fullName: string;
  role: Role;
  employeeCode: string | null;
  allowDuplicateRole: boolean;
}

const USAGE = `
  npm run db:invite-user -- <auth-user-uuid> <username> "<full name>" <role> [options]

    auth-user-uuid   The id of the auth user created in the Supabase dashboard:
                     Dashboard -> Authentication -> Users -> copy the UUID.
                     Not the email address.
    username         Login name. Letters, digits, dot, underscore and dash;
                     3 to 64 characters. Case-insensitive, and must be unused.
    "<full name>"    The person's name as it should appear on receipts and
                     reports. Quote it.
    role             One of: ${ROLES.join(', ')}
                     Required, not defaulted. A silent default would hand out a
                     role nobody chose.

  options
    --employee <code>        Link the login to an employee record, e.g. EMP-0004.
                             Without it the login works but /my-profile cannot
                             find the staff record behind it.
    --allow-duplicate-role   Permit a second active holder of a single-holder
                             role. Only "proprietor" is single-holder.
    -h, --help               This text.

  Examples
    npm run db:invite-user -- 8f14e45f-ea8f-4b2c-9d1a-1b2c3d4e5f60 amminah \\
      "Aminata Bangura" teacher --employee EMP-0004

    npm run db:invite-user -- 1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d ebangura \\
      "Ebrima Bangura" bursar
`;

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let employeeCode: string | null = null;
  let allowDuplicateRole = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else if (arg === '--allow-duplicate-role') {
      allowDuplicateRole = true;
    } else if (arg === '--employee') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        fatal('--employee needs an employee code, e.g. --employee EMP-0004');
      }
      employeeCode = value;
      i++;
    } else if (arg.startsWith('--')) {
      fatal(`Unknown option "${arg}".${USAGE}`);
    } else {
      positional.push(arg);
    }
  }

  const [id, username, fullName, roleArg, ...extra] = positional;
  if (!id) fatal(`Missing arguments.${USAGE}`);
  if (extra.length > 0) fatal(`Unexpected extra arguments: ${extra.join(' ')}`);

  if (!username || !USERNAME_PATTERN.test(username)) {
    fatal(
      `"${username ?? ''}" is not a usable username. It must be 3 to 64 characters, ` +
        'letters, digits, dot, underscore or dash only - that is the database constraint, ' +
        'checked here so the error is legible rather than a raw constraint violation.',
    );
  }
  if (!UUID_PATTERN.test(id)) {
    fatal(
      `"${id}" is not a UUID. This is the auth.users id from the Supabase dashboard, ` +
        'not the email address. Copy it from Dashboard -> Authentication -> Users.',
    );
  }
  if (!fullName || fullName.trim().length === 0) {
    fatal('A full name is required. It is printed on receipts and reports.');
  }
  if (!isRole(roleArg)) {
    fatal(`Unknown role ${roleArg ? `"${roleArg}"` : '(none given)'}. Choose one of: ${ROLES.join(', ')}`);
  }

  return {
    authUserId: id,
    username,
    fullName: fullName.trim(),
    role: roleArg,
    employeeCode,
    allowDuplicateRole,
  };
}

interface EmployeeRow {
  id: string;
  employee_code: string;
  full_name: string;
  status: string;
}

/** One row of the closing roster, which is the same shape the occupancy check reads. */
interface RosterRow extends RoleHolder {
  username: string;
  role: string;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!existsSync('.env.setup')) {
    fatal(
      'No .env.setup. This script needs ADMIN_DATABASE_URL, which lives in .env.setup. ' +
        'See .env.example and docs/setup.md.',
    );
  }
  const adminUrl = readEnv('.env.setup').ADMIN_DATABASE_URL;
  if (!adminUrl) fatal('ADMIN_DATABASE_URL is not set in .env.setup.');

  const db = new Client({ connectionString: adminUrl });
  await db.connect();

  try {
    console.log('\n  SAMJONA SMS - invite staff account\n');

    // --- 1. The auth user must already exist. ------------------------------
    const auth = await db.query<{ id: string; email: string | null }>(
      'select id, email from auth.users where id = $1',
      [args.authUserId],
    );
    const authUser = auth.rows[0];
    if (!authUser) {
      fatal(
        `No auth user with id ${args.authUserId}.\n` +
          '        Create the login first: Supabase dashboard -> Authentication -> Users ->\n' +
          '        Add user. Then re-run with that user\'s UUID.\n' +
          '        Creating the auth user is deliberately not done here, because it needs\n' +
          '        the service-role key and this project does not hold it.',
      );
    }
    console.log(`  auth user   ${authUser.email ?? '(no email on file)'}`);
    console.log(`              ${args.authUserId}`);

    // --- 2. No profile may already exist for this auth user. ---------------
    const existing = await db.query<{ user_code: string; role: string }>(
      'select user_code, role from app_users where id = $1',
      [args.authUserId],
    );
    if (existing.rows[0]) {
      const current = existing.rows[0];
      fatal(
        `${current.user_code} (${current.role}) is already attached to this auth user.\n` +
          '        This script issues new logins and does not modify existing ones. To change\n' +
          "        someone's role, do it from the application as the Proprietor, where it is\n" +
          '        recorded in the audit log.',
      );
    }

    // --- 3. The username must be free. -------------------------------------
    const clash = await db.query<{ user_code: string }>(
      'select user_code from app_users where username = $1',
      [args.username],
    );
    if (clash.rows[0]) {
      fatal(
        `The username "${args.username}" is already taken by ${clash.rows[0].user_code}. ` +
          'Pick a different one.',
      );
    }

    // --- 4. Role occupancy. -------------------------------------------------
    const holders = (
      await db.query<RoleHolder>(
        `select user_code, full_name, status from app_users where role = $1::app_role order by user_code`,
        [args.role],
      )
    ).rows;
    const verdict = assessRole(args.role, holders, args.allowDuplicateRole);
    if (!verdict.ok) fatal(verdict.message);
    for (const warning of verdict.warnings) console.log(`\n  note        ${warning}`);

    // --- 5. Employee link, if asked for. -----------------------------------
    let employeeId: string | null = null;
    if (args.employeeCode) {
      const found = await db.query<EmployeeRow>(
        'select id, employee_code, full_name, status from employees where employee_code = $1',
        [args.employeeCode],
      );
      const employee = found.rows[0];
      if (!employee) {
        const available = await db.query<{ employee_code: string; full_name: string }>(
          `select employee_code, full_name from employees where status = 'active' order by employee_code`,
        );
        const list =
          available.rows.length > 0
            ? available.rows.map((e) => `${e.employee_code} ${e.full_name}`).join(', ')
            : '(no active employees exist yet)';
        fatal(
          `No employee with code ${args.employeeCode}.\n` +
            `        Active employees: ${list}\n` +
            '        Create the staff record first (/staff/new), or omit --employee.',
        );
      }
      const linked = await db.query<{ user_code: string }>(
        'select user_code from app_users where employee_id = $1',
        [employee.id],
      );
      if (linked.rows[0]) {
        fatal(
          `${employee.employee_code} (${employee.full_name}) is already linked to ` +
            `${linked.rows[0].user_code}. One login per staff member: link this login to a ` +
            'different employee, or deactivate the existing login first.',
        );
      }
      employeeId = employee.id;
      console.log(`\n  employee    ${employee.employee_code}  ${employee.full_name} (${employee.status})`);
    }

    // --- 6. Insert. ---------------------------------------------------------
    const inserted = await db.query<{ id: string; user_code: string }>(
      `insert into app_users (id, username, full_name, role, employee_id, must_change_password)
       values ($1, $2, $3, $4, $5, true)
       returning id, user_code`,
      [args.authUserId, args.username, args.fullName, args.role, employeeId],
    );
    const created = inserted.rows[0]!;

    // --- 7. Prove it resolves the way a real request will resolve it. -------
    const visible = await verifyVisibleAsItself(db, args.authUserId, args.role);
    if (visible !== created.user_code) {
      fatal(
        'The row was created but is not visible under its own role context. An RLS policy ' +
          'on app_users is blocking it, which would make the account unable to sign in. ' +
          'Run: npm run db:verify-writes',
      );
    }

    console.log(`\n  created     ${created.user_code}  (${args.role})`);
    console.log(`              ${args.username} - ${args.fullName}`);
    console.log(`              must change password on first sign-in`);
    if (!employeeId) {
      console.log(`              not linked to an employee record`);
    }
    console.log(`\n  verified    ${visible} resolves to its own row and role.`);

    // --- 8. If nothing was linked, say who could be. ------------------------
    if (!employeeId) {
      const candidate = await db.query<EmployeeRow>(
        `select e.id, e.employee_code, e.full_name, e.status
           from employees e
          where e.status = 'active'
            and lower(btrim(e.full_name)) = lower(btrim($1))
            and not exists (select 1 from app_users u where u.employee_id = e.id)`,
        [args.fullName],
      );
      if (candidate.rows.length === 1) {
        const match = candidate.rows[0]!;
        console.log(
          `\n  note        ${match.employee_code} ${match.full_name} matches this name and has no\n` +
            '              login. To link them, re-create the account with\n' +
            `                --employee ${match.employee_code}\n` +
            '              Nothing is guessed here on purpose: two staff can share a name, and a\n' +
            '              wrong link would attach one person\'s payroll record to another.',
        );
      }
    }

    // --- 9. The roster, so the operator can see the whole picture. -----------
    const roster = await db.query<RosterRow>(
      `select user_code, username, full_name, role, status from app_users order by user_code`,
    );
    console.log('\n  accounts now:');
    for (const u of roster.rows) {
      console.log(`    ${String(u.user_code).padEnd(10)} ${String(u.role).padEnd(12)} ${u.username.padEnd(16)} ${u.full_name} (${u.status})`);
    }
    const uncovered = ROLES.filter((r) => !roster.rows.some((u) => u.role === r && u.status === 'active'));
    if (uncovered.length > 0) {
      console.log(`\n  roles with no active account: ${uncovered.join(', ')}`);
    }

    console.log(
      '\n  Next: the person signs in at /login with the username above. Signing in is the\n' +
        '  only way the session bootstrap can resolve this profile through RLS, which is\n' +
        "  what makes this script's verification a preview rather than the real thing.\n",
    );
  } finally {
    await db.end();
  }
}

main().catch((err: unknown) => {
  console.error(`\n  ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
