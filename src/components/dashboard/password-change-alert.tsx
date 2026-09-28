import { Alert } from '@/components/ui/alert';

/**
 * Shown on every role dashboard for a first-time sign-in: the invitation
 * password is temporary, so the user is asked to replace it before continuing.
 */
export function PasswordChangeAlert() {
  return (
    <Alert variant="warning" title="Please change your password">
      <p>
        This is your first sign-in. Choose a new password before continuing - the invitation
        password was temporary.
      </p>
    </Alert>
  );
}
