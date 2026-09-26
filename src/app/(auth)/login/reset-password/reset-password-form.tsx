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
 * Set a new password after a recovery link. The recovery session (created by
 * the auth callback) is used once to update the password, then signed out, so
 * the new password is proven by a normal sign-in. A lost or expired session is
 * the most common failure and is explained as such - never a raw Supabase
 * error string.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Your new password must be at least 6 characters long.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match. Please type them again.');
      return;
    }

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(friendlyPasswordError(updateError));
        return;
      }

      // The recovery session has served its purpose: sign out so the new
      // password is proven with a normal sign-in.
      await supabase.auth.signOut();
      router.replace('/login?message=password_reset');
      router.refresh();
    } catch {
      setError('We could not set your new password right now. Please try again in a moment.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Set a new password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a password you have not used for this account before.
        </p>
      </div>

      {error ? <Alert variant="destructive" title={error} /> : null}

      <div className="space-y-2">
        <Label htmlFor="new-password">New password</Label>
        <div className="relative">
          <Input
            id="new-password"
            name="new-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            minLength={6}
            placeholder="At least 6 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
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

      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <Input
          id="confirm-password"
          name="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          placeholder="Type it again"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Saving…' : 'Set new password'}
      </Button>

      <p className="text-center text-sm">
        <Link
          href="/login/forgot-password"
          className="text-primary underline-offset-4 hover:underline"
        >
          Link not working? Request a new one
        </Link>
      </p>
    </form>
  );
}

function friendlyPasswordError(error: { code?: string; status?: number }): string {
  switch (error.code) {
    case 'weak_password':
      return 'That password is too weak. Use at least 6 characters.';
    case 'same_password':
      return 'Your new password must be different from the previous one. Please choose another.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many attempts. Please wait a few minutes and try again.';
    default:
      // A missing or expired recovery session is by far the most common
      // failure here - prefer that explanation over a raw error string.
      if (error.status === 401 || error.status === 400) {
        return 'This reset link has expired or already been used. Please request a new one from the sign-in page.';
      }
      return 'We could not set your new password right now. Please try again in a moment.';
  }
}