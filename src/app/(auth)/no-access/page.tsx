import Link from 'next/link';
import { redirect } from 'next/navigation';

import { resolveSessionUser } from '@/server/auth/bootstrap';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { IconAlertTriangle } from '@/components/icons';
import { SignOutButton } from '@/components/auth/sign-out-button';

/**
 * NO APPLICATION ACCESS
 * ====================
 * The landing place for a visitor who holds a valid Supabase session but NOT a
 * usable application identity: no `app_users` row, a disabled account, or a
 * role the application does not recognise.
 *
 * WHY THIS PAGE EXISTS AT ALL
 * ===========================
 * These visitors used to be redirected to `/login`. That was a redirect loop,
 * not a redirect:
 *
 *     GET /dashboard
 *       -> (app)/layout.tsx  : no app profile      -> redirect('/login')
 *       -> middleware         : Supabase user IS set -> redirect('/dashboard')
 *       -> GET /dashboard
 *       -> (repeat)
 *
 * The browser rendered a blank page and Chromium throttled the navigation
 * ("Throttling navigation to prevent the browser from hanging"), because no
 * single hop was an error - each redirect was individually defensible.
 *
 * The cycle is broken structurally rather than by timing: this page sits in the
 * `(auth)` group, OUTSIDE the `(app)` layout whose guard sends visitors here, so
 * there is no path by which rendering this page can trigger the redirect again.
 *
 * It also has to be honest. "You are not signed in" would be a lie here - the
 * visitor IS signed in, and telling them so would send them round the password
 * reset loop looking for a password that was never the problem. So each reason
 * names itself and names the command that fixes it.
 */
export default async function NoAccessPage() {
  const resolution = await resolveSessionUser();

  // Nothing wrong here: someone typed the URL while perfectly provisioned, or
  // an account was repaired while this response was in flight.
  if (resolution.status === 'ok') redirect('/dashboard');

  // Genuinely anonymous. The sign-in page is the right answer, and no
  // middleware redirect is involved, so there is no cycle.
  if (resolution.status === 'anonymous') redirect('/login');

  const { title, description, children } = explain(resolution);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconAlertTriangle className="size-5 text-warning" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}

        {/* Sign out, not "sign in": this visitor already holds a session, and
            /login would send them straight back to the application they cannot
            use. Signing out is the only action that changes anything. */}
        <div className="flex flex-wrap gap-2">
          <SignOutButton />
          <Button variant="ghost" asChild>
            <Link href="/">Back to the SAMJONA site</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** The three unusable-but-signed-in states, each with its own remedy. */
type BlockedResolution = Exclude<
  Awaited<ReturnType<typeof resolveSessionUser>>,
  { status: 'ok' } | { status: 'anonymous' }
>;

function explain(resolution: BlockedResolution) {
  switch (resolution.status) {
    case 'unprovisioned':
      return {
        title: 'Your sign-in has no application account',
        description:
          'You signed in successfully, but this school has not attached an application account to your sign-in yet. Nothing is wrong with your password.',
        children: (
          <Alert variant="warning" title="What the Proprietor needs to run">
            <p>
              Your sign-in worked, so it exists in Supabase &rarr; Authentication &rarr; Users. This
              is its id:
            </p>
            <pre className="mt-2 overflow-x-auto rounded bg-muted p-3 text-xs">
              <code>{resolution.authUserId}</code>
            </pre>
            <p className="mt-3">
              On the machine that runs this project, attach an application account to it:
            </p>
            <pre className="mt-2 overflow-x-auto rounded bg-muted p-3 text-xs">
              <code>
                {`npm run db:seed-first-user -- ${resolution.authUserId} <username> "<Full Name>" proprietor`}
              </code>
            </pre>
            <p className="mt-2 text-xs">
              The script is safe to re-run, and the password is the one you chose in Supabase.
            </p>
          </Alert>
        ),
      };

    case 'inactive':
      return {
        title: 'Your account is not active',
        description:
          'Your sign-in works, but the application account attached to it has been disabled. Ask the Proprietor to reactivate it.',
        children: null,
      };

    case 'invalid_role':
      return {
        title: 'Your account role is not recognised',
        description: `This sign-in is attached to an application account with the role "${resolution.role}", which is not one this application knows. Ask the Proprietor to correct it.`,
        children: null,
      };
  }
}
