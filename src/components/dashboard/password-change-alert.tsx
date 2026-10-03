import Link from 'next/link';

import { Alert } from '@/components/ui/alert';

/**
 * Shown on every role dashboard for a first-time sign-in: the invitation
 * password is temporary, so the user is asked to replace it before continuing.
 *
 * The link matters. This banner tells someone to change their password, and
 * until it pointed at the only route that can do it, it was an instruction with
 * no way to follow it -- the reader had to guess that "Forgot password" on the
 * login page was the intended mechanism. Supabase sends that email itself, so
 * the path works; it just was not advertised at the point the need is stated.
 */
export function PasswordChangeAlert() {
  return (
    <Alert variant="warning" title="Please change your password">
      <p>
        This is your first sign-in. Choose a new password before continuing - the invitation
        password was temporary.{' '}
        <Link
          href="/login/forgot-password"
          className="text-primary underline underline-offset-4"
        >
          Set a new password
        </Link>
        .
      </p>
    </Alert>
  );
}
