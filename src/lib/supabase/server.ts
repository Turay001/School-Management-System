import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { requirePublicEnv } from './config';

/**
 * Server-side Supabase client bound to the request's cookies.
 *
 * Every page under the application shell goes through a maintenance step on
 * every request (middleware) that refreshes an expiring session here, and the
 * `(app)/layout.tsx` bootstraps the application user through
 * `getSessionUser()`.
 */
export async function createSupabaseServerClient() {
  const { url, anonKey } = requirePublicEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: setting cookies there is not
          // allowed, which is fine - the middleware handles the write/refresh.
        }
      },
    },
  });
}