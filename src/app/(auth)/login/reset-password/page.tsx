import { ResetPasswordForm } from './reset-password-form';

/**
 * The second half of the password-reset journey. The browser lands here from
 * /auth/callback after the recovery code is exchanged for a session; the form
 * sets the new password and signs the recovery session out.
 */
export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}