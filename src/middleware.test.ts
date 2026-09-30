import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { middleware } from './middleware';

/**
 * EDGE MIDDLEWARE ROUTING
 * =======================
 * This middleware is the only thing standing between an anonymous request and
 * the application shell, and until now it had no tests at all. The consequence
 * was a defect that survived a full brand pass, a security review and two
 * deployments: `/robots.txt` was answered with a 307 to the sign-in page, so
 * every search crawler fetching the crawling rules received HTML instead, and
 * the school could not be indexed.
 *
 * The tests are written to fail if the guard is weakened in EITHER direction:
 * a path that must stay open, and a path that must stay shut. The
 * "still guarded" block matters as much as the "now public" one.
 */

// vi.hoisted so the factory closes over a binding that is already initialised
// when the mocked module is first imported, rather than hitting the temporal
// dead zone that a plain module-level `let` would.
const session = vi.hoisted(() => ({ user: null as { id: string } | null }));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: session.user }, error: null }),
    },
  }),
}));

const ORIGIN = 'https://samjona.test';

function run(path: string) {
  return middleware(new NextRequest(new URL(path, ORIGIN)));
}

/** A pass-through carries `x-middleware-next`; a redirect does not. */
function isPassThrough(response: Awaited<ReturnType<typeof run>>): boolean {
  return response.headers.get('x-middleware-next') === '1';
}

function redirectTarget(response: Awaited<ReturnType<typeof run>>): URL {
  const location = response.headers.get('location');
  if (!location) throw new Error('expected a redirect, got a pass-through');
  return new URL(location);
}

beforeEach(() => {
  session.user = null;
});

describe('public files served by the application', () => {
  // The defect these lock down. Each is addressed by an extension, so the
  // matcher does not exclude it and the middleware does run for it.
  for (const path of ['/robots.txt', '/sitemap.xml', '/manifest.webmanifest']) {
    it(`serves ${path} to an anonymous visitor`, async () => {
      const response = await run(path);
      expect(isPassThrough(response)).toBe(true);
      expect(response.headers.get('location')).toBeNull();
    });
  }
});

describe('paths that must stay guarded', () => {
  // No regression permitted. If any of these stops redirecting, the fix above
  // has opened a hole rather than closed one.
  for (const path of [
    '/dashboard',
    '/students',
    '/payroll',
    '/settings',
    '/expenses',
    '/leave',
    '/report-cards',
  ]) {
    it(`redirects ${path} to sign-in`, async () => {
      const response = await run(path);
      const target = redirectTarget(response);
      expect(target.pathname).toBe('/login');
      expect(target.searchParams.get('next')).toBe(path);
    });
  }
});

describe('the public list is exact, not a prefix or extension rule', () => {
  // Each of these looks adjacent to a public path. None may be public: a
  // prefix or substring match would open all of them.
  for (const path of [
    '/robots.txt.bak',
    '/xrobots.txt',
    '/robots.txt/anything',
    '/manifest.webmanifest.bak',
    '/xmanifest.webmanifest',
    '/sitemaps.xml',
    '/secret.xml',
    '/backup.txt',
    // /no-access is a real screen, not a static asset, but it must NOT be
    // public: an anonymous visitor sent there instead of to /login would see a
    // "your account has no application account" page with no session at all.
    '/no-access',
  ]) {
    it(`keeps ${path} behind authentication`, async () => {
      const response = await run(path);
      expect(isPassThrough(response)).toBe(false);
      expect(redirectTarget(response).pathname).toBe('/login');
    });
  }
});

describe('paths that were already public stay public', () => {
  for (const path of [
    '/',
    '/login',
    '/login/forgot-password',
    '/login/reset-password',
    '/auth/callback',
  ]) {
    it(`serves ${path} to an anonymous visitor`, async () => {
      expect(isPassThrough(await run(path))).toBe(true);
    });
  }

  it('leaves /api/* to the route handlers, which answer with a JSON 401', async () => {
    // Not a session guard here: requireUser() owns the API contract, and
    // /api/auth/session + /api/auth/logout must work while logged out.
    expect(isPassThrough(await run('/api/students'))).toBe(true);
    expect(isPassThrough(await run('/api/auth/logout'))).toBe(true);
  });
});

describe('an authenticated user', () => {
  beforeEach(() => {
    session.user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
  });

  it('reaches the application routes', async () => {
    expect(isPassThrough(await run('/dashboard'))).toBe(true);
    expect(isPassThrough(await run('/students'))).toBe(true);
  });

  it('is sent from /login to the dashboard by default', async () => {
    expect(redirectTarget(await run('/login')).pathname).toBe('/dashboard');
  });

  it('can reach /no-access, where the (app) guard sends an unusable identity', async () => {
    // The other half of the redirect loop. This middleware redirects an
    // authenticated visitor OFF /login (asserted just above), so the (app)
    // guard must send a visitor who is signed in but not provisioned somewhere
    // that is not /login - /no-access. Guarding /no-access here as well would
    // close the cycle from this side and restore the blank dashboard, so the
    // path has to stay reachable.
    expect(isPassThrough(await run('/no-access'))).toBe(true);
  });

  it('is returned to the page it asked for', async () => {
    expect(redirectTarget(await run('/login?next=/students')).pathname).toBe('/students');
  });

  it('refuses to be sent to another origin via next', async () => {
    // Otherwise a link to the real sign-in page harvests a real password and
    // then delivers the user, freshly authenticated, to the attacker.
    for (const hostile of [
      'https://evil.invalid/steal',
      '//evil.invalid',
      '/\\evil.invalid',
      'javascript:alert(1)',
    ]) {
      const target = redirectTarget(await run(`/login?next=${encodeURIComponent(hostile)}`));
      expect(target.pathname).toBe('/dashboard');
      expect(target.origin).toBe(ORIGIN);
    }
  });

  it('can still reach the public files', async () => {
    expect(isPassThrough(await run('/robots.txt'))).toBe(true);
  });
});
