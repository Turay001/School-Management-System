import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * OAuth/code exchange endpoint. Supabase redirects the browser here after
 * email confirmation or a password-reset link; the code is exchanged for a
 * real session and the user continues to `next`.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Failed or missing exchange: send them back to sign-in with a safe message.
  return NextResponse.redirect(`${origin}/login?message=session_expired`);
}