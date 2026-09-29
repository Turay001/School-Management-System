import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import { DEFAULT_REDIRECT_PATH, safeRedirectPath } from './lib/redirect-target';

/**
 * Public files served by the application itself, addressed by an extension.
 *
 * These need naming here because the matcher below excludes _next internals and
 * static assets, so the middleware DOES run for them. Without this list an
 * anonymous request for /robots.txt was answered with a 307 to the sign-in
 * page: a search crawler fetching the crawling rules received HTML, and the
 * school could not be indexed.
 *
 * Matched exactly, not by prefix, so a future /robots.txt.bak or
 * /staff-export.xml stays guarded. The matcher is deliberately NOT widened to
 * `txt|xml`: excluding a path there stops the middleware running at all, which
 * would make every present and future .txt/.xml path public with no way to opt
 * back in. This list is the security decision, so the list is here.
 */
const PUBLIC_METADATA_PATHS = ['/robots.txt', '/sitemap.xml', '/manifest.webmanifest'];

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
    PUBLIC_METADATA_PATHS.includes(pathname) ||
    pathname === '/';

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    // `next` comes from the query string, so it is attacker-controlled; only a
    // same-origin path is honoured. See src/lib/redirect-target.ts.
    url.pathname = safeRedirectPath(searchParams.get('next')) ?? DEFAULT_REDIRECT_PATH;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Excludes Next.js internals and static asset EXTENSIONS ALREADY SERVED
    // FROM public/ (images, the favicon). It deliberately does not exclude
    // .txt/.xml: see PUBLIC_METADATA_PATHS above, which is where the
    // public-path decision is made and documented. Adding extensions here would
    // switch the middleware off for the path entirely, so the explicit list
    // there would stop being a decision and become a comment.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
