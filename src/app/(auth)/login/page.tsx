import { LoginForm } from './login-form';

const MESSAGES: Record<string, string> = {
  session_expired: 'Your session expired. Please sign in again.',
  recovery_sent: 'If an account exists for that email, a password reset link is on its way.',
  password_reset: 'Your password has been reset. Please sign in with your new password.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = typeof params.next === 'string' ? params.next : '/dashboard';
  const raw = typeof params.message === 'string' ? params.message : undefined;

  return <LoginForm next={next} notice={raw ? MESSAGES[raw] : undefined} />;
}