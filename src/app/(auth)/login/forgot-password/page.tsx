'use client';

import { useState } from 'react';
import Link from 'next/link';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Password reset request. The response is deliberately the same whether or
 * not the email exists - never confirm to a stranger which accounts a school
 * has.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState('loading');
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/login&type=recovery`,
      });
      if (resetError) {
        setError('We could not send the reset link right now. Please try again in a moment.');
        setState('error');
        return;
      }
      setState('sent');
    } catch {
      setError('We could not send the reset link right now. Please try again in a moment.');
      setState('error');
    }
  }

  if (state === 'sent') {
    return (
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight">Check your inbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          If an account exists for <span className="font-medium">{email}</span>, a link to reset
          your password is on its way. It expires in a few minutes.
        </p>
        <div className="mt-4">
          <Link
            href="/login"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the email you sign in with and we will send you a reset link.
        </p>
      </div>

      {error ? <Alert variant="destructive" title={error} /> : null}

      <div className="space-y-2">
        <Label htmlFor="reset-email">Email</Label>
        <Input
          id="reset-email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@samjona.school"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <Button type="submit" className="w-full" disabled={state === 'loading'}>
        {state === 'loading' ? 'Sending…' : 'Send reset link'}
      </Button>

      <p className="text-center text-sm">
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}