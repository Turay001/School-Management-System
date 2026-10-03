/**
 * SEED THE FIRST APPLICATION USER
 * ===============================
 *
 *   npm run db:seed-first-user -- <auth-user-uuid> <username> "<full name>" [role]
 *
 * WHY THIS SCRIPT EXISTS
 * ----------------------
 * `app_users` is the application's own profile table, and it has a hard
 * dependency the application cannot satisfy for itself: `id` references
 * `auth.users (id)`. Until one row exists, a live piece of the system is
 * unusable:
 *
 *   * `fee_adjustments.created_by` is NOT NULL and references `app_users`, so
 *     nobody can record a fee adjustment at all.
 *   * `fee_payments.received_by`, `employees.created_by` and the salary and
 *     bank-account attribution columns all reference it too.
 *   * No one can sign in, because signing in looks the person up here.
 *
 * And there is no way in through the application, because creating the first
 * user is a bootstrap: it is the one account that cannot be created by an
 * account that does not yet exist. Public self-signup is not an acceptable
 * answer, since anyone reaching the deployment would be able to claim the
 * Proprietor role.
 *
 * WHY IT DOES NOT CREATE THE AUTH USER
 * ------------------------------------
 * Creating a row in `auth.users` properly means going through the Supabase Auth
 * admin API, which authenticates with the service-role key. That key is a
 * broader credential than anything in this system needs, and it is deliberately
 * absent from this repository - see the note on `SUPABASE_SERVICE_ROLE_KEY` in
 * `src/server/env.ts`.
 *
 * So the split is:
 *
 *   1. The administrator creates the auth user, in the Supabase dashboard.
 *      That is a one-time manual action, it is a thing the dashboard is good
 *      at, and it needs a credential this project should not hold.
 *   2. This script attaches the application profile to that auth user, using
 *      the admin database connection the administrator already has.
 *
 * The result is that every credential in this repository is one the running
 * application needs, and the one credential it must never have belongs to
 * nobody but the person administering the account.
 *
 * THE FIRST ACCOUNT ONLY
 * ---------------------
 * For every account after the first, use `npm run db:invite-user`. This script
 * is the bootstrap, and it stays that way: it is the one action that cannot be
 * performed by an account that does not exist yet. `invite-user` is the
 * ordinary path and checks things this one has no reason to -- role occupancy,
 * and linking the login to an employee record.
 *
 * Both share their implementation through `scripts/lib/app-user.ts`.
 *
 * SAFE TO RE-RUN
 * --------------
 * If a row already exists for the given auth user id, the script reports it
 * rather than failing, and only changes something if the operator explicitly
 * asked for a different profile.
 *
 * ARGUMENT ORDER IS EXPLICIT, NOT INTERACTIVE
 * -------------------------------------------
 * No prompts. A script that can be piped into from a deployment log, or run
 * twice by a nervous operator, must behave identically both times. A prompt
 * that silently takes defaults is how a Proprietor account quietly becomes a
 * teacher account.
 */

import { existsSync } from 'node:fs';
import { Client } from 'pg';

import {
  ROLES,
  USERNAME_PATTERN,
  UUID_PATTERN,
  fatal,
  isRole,
  readEnv,
  verifyVisibleAsItself,
  type Role,
} from './lib/app-user';

const USAGE = `
  npm run db:seed-first-user -- <auth-user-uuid> <username> "<full name>" [role]

    auth-user-uuid   The id of the auth user you created in the Supabase
                     dashboard: Dashboard -> Authentication -> Users -> copy the
                     UUID. Not the email address.
    username         Login name. Letters, digits, dot, underscore and dash;
                     3 to 64 characters.
    "<full name>"    The person's name as it should appear on receipts and
                     reports. Quote it.
    role             One of: ${ROLES.join(', ')}
                     Required, not defaulted. A silent default of
                     "proprietor" would hand the highest privilege in
                     the system to whoever forgot to type it.
`;

/**
 * A type guard rather than `ROLES.includes(x)`.
 *
 * `Array.includes` does not narrow, so it cannot be used to prove to the
 * compiler that a string is one of the roles. The assertion that would be needed
 * in its place is exactly the kind that hides a typo: `propritor` would compile,
 * and would then be rejected by the database enum at runtime with an error that
 * says nothing about which word was wrong.
 *
 * The role list itself now lives in `scripts/lib/app-user.ts`, which imports it
 * from the application's own ROLES constant. This file used to carry a literal
 * copy that had drifted: it offered `accountant`, `auditor` and `storekeeper`,
 * none of which are in the `app_role` enum, and omitted `admin`, which is. So it
 * accepted three roles the database would reject and rejected one it has -- the
 * exact failure the comment above describes, arriving anyway.
 */
function parseArgs(argv: string[]): {
  authUserId: string;
  username: string;
  fullName: string;
  role: Role;
} {
  const [id, username, fullName, roleArg, ...extra] = argv;

  if (id === '--help' || id === '-h') {
    console.log(USAGE);
    process.exit(0);
  }
  if (!id) {
    console.error(`\n  Missing arguments.${USAGE}`);
    process.exit(1);
  }
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
    fatal(
      `Unknown role ${roleArg ? `"${roleArg}"` : '(none given)'}. ` +
        `Choose one of: ${ROLES.join(', ')}`,
    );
  }

  return { authUserId: id, username, fullName: fullName.trim(), role: roleArg };
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
  if (!adminUrl) {
    fatal('ADMIN_DATABASE_URL is not set in .env.setup.');
  }

  const db = new Client({ connectionString: adminUrl });
  await db.connect();

  try {
    console.log('\n  SAMJONA SMS - first user\n');

    // The auth user must already exist. Checking is the whole point of this
    // step: without it the insert would fail on the foreign key with a message
    // that does not say what the operator has to do next.
    const auth = await db.query<{ id: string; email: string | null }>(
      'select id, email from auth.users where id = $1',
      [args.authUserId],
    );
    const authUser = auth.rows[0];
    if (!authUser) {
      fatal(
        `No auth user with id ${args.authUserId}.\n` +
          '        Create the login first: Supabase dashboard -> Authentication -> Users -> ' +
          'Add user.\n' +
          "        Then re-run this script with that user's UUID. Creating the auth user is " +
          'deliberately\n' +
          '        not done here, because it needs the service-role key and this project ' +
          'does not hold it.',
      );
    }
    console.log(`  auth user   ${authUser.email ?? '(no email on file)'}`);
    console.log(`              ${args.authUserId}`);

    const existing = await db.query<{ id: string; user_code: string; role: string }>(
      'select id, user_code, role from app_users where id = $1',
      [args.authUserId],
    );

    if (existing.rows[0]) {
      const current = existing.rows[0];
      console.log(`\n  A profile already exists: ${current.user_code}, role ${current.role}.`);

      if (current.role === args.role) {
        // A re-run with an unchanged role is also a health check: this is
        // the one place with admin access that can confirm the profile
        // still resolves through the application's context functions.
        const userCode = await verifyVisibleAsItself(db, args.authUserId, args.role);
        if (userCode !== current.user_code) {
          fatal(
            'The profile exists but is not visible under its own role context, which would ' +
              'make the account unable to sign in. Run: npm run db:verify-writes',
          );
        }
        console.log(`\n  verified    ${userCode} still resolves to its own row and role.`);
        console.log('  Nothing to change. Re-running this script changes nothing.\n');
        return;
      }
      // Refuse rather than promote or demote. A role change is a deliberate
      // act with an audit trail; the identity of who performed it and why is
      // not something a re-run of a seed script should decide.
      fatal(
        `That account already has role "${current.role}", not "${args.role}".\n` +
          '        Changing a role is deliberate and should be done by the Proprietor from the\n' +
          '        application, where it is recorded in the audit log. This script will not do it.',
      );
    }

    // A username collision with a different auth user would fail on the unique
    // index, but the message would not say which account it belonged to.
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

    const inserted = await db.query<{ id: string; user_code: string }>(
      `insert into app_users (id, username, full_name, role)
       values ($1, $2, $3, $4)
       returning id, user_code`,
      [args.authUserId, args.username, args.fullName, args.role],
    );
    const created = inserted.rows[0]!;

    console.log(`\n  created     ${created.user_code}  (${args.role})`);
    console.log(`              ${args.username} - ${args.fullName}`);

    // Confirm the row resolves through the RLS context the application actually
    // uses, and that it is the row just created. The admin connection bypasses
    // RLS by itself, so the check mirrors withUserContext instead - the same
    // transaction-scoped GUCs and the policy predicates evaluated verbatim
    // (see verifyVisibleAsItself).
    const visible = await verifyVisibleAsItself(db, args.authUserId, args.role);
    if (visible !== created.user_code) {
      fatal(
        'The row was created but is not visible under its own role context. An RLS ' +
          'policy on app_users is blocking it, which would make the account unable to ' +
          'sign in. Run: npm run db:verify-writes',
      );
    }

    console.log(`\n  verified    ${visible} resolves to its own row and role.`);
    console.log(
      '\n  What this unblocks:\n' +
        '    * signing in at all - the application looks the account up here\n' +
        '    * fee_adjustments, whose created_by is NOT NULL and had no user to point at\n' +
        '    * attribution on fee_payments, salaries and bank-account changes\n' +
        '\n' +
        '  What it does not do: create a student, an academic year, a term or a class.\n' +
        '  The fee-adjustment path needs all four, so it cannot be exercised end to end\n' +
        "  until the school's data is loaded. That is a data-loading step, not a schema one.\n" +
        '\n' +
        '  Next: sign in at /login with the username you just created. Signing in is the\n' +
        '  only way the session bootstrap can resolve this profile through RLS.\n',
    );
  } finally {
    await db.end();
  }
}

main().catch((err: unknown) => {
  console.error(`\n  ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
