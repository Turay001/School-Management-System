'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IconEye, IconEyeOff } from '@/components/icons';

/**
 * Sign-in. Every failure is translated into a message an administrator can
 * act on; a raw Supabase error string is never shown.
 */
export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password to sign in.');
      return;
    }

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(friendlySignInError(signInError));
        return;
      }

      router.push(next);
      router.refresh();
    } catch {
      setError('We could not sign you in right now. Please try again in a moment.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sign in to SAMJONA</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use the email and password your school administrator gave you.
        </p>
      </div>

      {notice ? (
        <Alert variant="info" title={notice} />
      ) : null}
      {error ? <Alert variant="destructive" title={error} /> : null}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@samjona.school"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={error ? true : undefined}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/login/forgot-password"
            className="text-xs text-primary underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={error ? true : undefined}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showPassword ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
          </button>
        </div>
      </div>

      <Button type="submit" className="w-full" size="lg" disabled={loading}>
        {loading ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}

function friendlySignInError(error: { code?: string; status?: number; message?: string }): string {
  switch (error.code) {
    case 'invalid_credentials':
      return 'Your email or password is incorrect. Please check both and try again.';
    case 'email_not_confirmed':
      return 'Your email address has not been confirmed yet. Check your inbox for the confirmation link.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many sign-in attempts. Please wait a few minutes and try again.';
    default:
      // Never a raw message: a Supabase error string may contain implementation
      // detail the school's administrator does not need to read.
      if (error.status === 401 || error.status === 400) {
        return 'Your email or password is incorrect. Please check both and try again.';
      }
      return 'We could not sign you in right now. Please try again in a moment.';
  }
}