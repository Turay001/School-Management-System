import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Edge middleware: refreshes the Supabase session cookie on every request and
 * guards the application routes. Deep authorization still happens on the
 * server (see (app)/layout.tsx and every route handler); this middleware
 * exists so an expiring session does not 401 the middle of a working day and
 * so an anonymous visitor cannot start the application shell at all.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, searchParams } = request.nextUrl;

  const isPublicPath =
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname.startsWith('/auth/') ||
    // API routes are NOT session-guarded here: every route handler calls
    // requireUser() and returns the JSON 401 contract (never an HTML redirect),
    // and /api/auth/session + /api/auth/logout must work while logged out too.
    pathname.startsWith('/api/') ||
    pathname === '/';

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = searchParams.get('next') ?? '/dashboard';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets. The pattern inverts "next" internals
    // and files with an extension.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};