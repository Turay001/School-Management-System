import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * PAGE SESSION GUARD - THE REDIRECT LOOP
 * ======================================
 *
 * The defect this file exists to prevent: an empty application dashboard and a
 * console full of "Throttling navigation to prevent the browser from hanging".
 *
 * What the browser was actually doing, hop by hop, for a visitor holding a valid
 * Supabase session but no `app_users` row:
 *
 *     GET /dashboard
 *       -> (app)/layout.tsx   getSessionUser() === null  -> redirect('/login')
 *       -> middleware          Supabase user IS present  -> redirect('/dashboard')
 *       -> GET /dashboard
 *       -> ...
 *
 * Neither redirect is wrong alone, so nothing threw and no error boundary fired.
 * The loop is a property of the PAIR, which is why asserting one side is not
 * enough: the middleware test already locks in "an authenticated visitor is
 * bounced off /login", and these tests lock in that the (app) guard therefore
 * must NEVER be the thing that sends an authenticated visitor to /login.
 *
 * The single invariant: `/login` is reachable from the application shell only
 * for a visitor who has NO Supabase session at all.
 */

const { resolveSessionUser } = vi.hoisted(() => ({ resolveSessionUser: vi.fn() }));

vi.mock('@/server/auth/bootstrap', () => ({ resolveSessionUser }));

/** Next.js `redirect()` signals by throwing; capture the destination instead. */
const redirects: string[] = [];
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    redirects.push(path);
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));

const { requireAppUser } = await import('@/server/auth/page-guard');

const AUTH_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const usable = {
  id: AUTH_USER_ID,
  username: 'head',
  fullName: 'Head Teacher',
  role: 'teacher' as const,
  employeeId: null,
  mustChangePassword: false,
};

/** Run the guard and report where it tried to send the visitor. */
async function destinationFor(resolution: unknown): Promise<string> {
  resolveSessionUser.mockResolvedValue(resolution);
  try {
    await requireAppUser();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('NEXT_REDIRECT:')) return message.slice('NEXT_REDIRECT:'.length);
    throw err;
  }
  return '(rendered the page)';
}

beforeEach(() => {
  redirects.length = 0;
  resolveSessionUser.mockReset();
});

describe('a visitor the application can serve', () => {
  it('renders the page instead of redirecting anywhere', async () => {
    expect(await destinationFor({ status: 'ok', user: usable })).toBe('(rendered the page)');
  });

  it('hands back the resolved identity', async () => {
    resolveSessionUser.mockResolvedValue({ status: 'ok', user: usable });
    await expect(requireAppUser()).resolves.toEqual(usable);
  });
});

describe('the only visitor who belongs at the sign-in page', () => {
  it('sends an anonymous visitor to /login', async () => {
    expect(await destinationFor({ status: 'anonymous' })).toBe('/login');
  });
});

describe('signed in, but not a usable application identity', () => {
  // Each of these is the loop-forming case: the middleware WILL bounce them off
  // /login and back to /dashboard, so /login must never be chosen here.
  const loopForming = [
    ['unprovisioned', { status: 'unprovisioned', authUserId: AUTH_USER_ID }],
    ['inactive', { status: 'inactive', authUserId: AUTH_USER_ID }],
    ['invalid_role', { status: 'invalid_role', authUserId: AUTH_USER_ID, role: 'wizard' }],
    ['bootstrap failure reported as unusable', { status: 'inactive', authUserId: AUTH_USER_ID }],
  ] as const;

  for (const [label, resolution] of loopForming) {
    it(`sends a ${label} visitor to /no-access, never /login`, async () => {
      expect(await destinationFor(resolution)).toBe('/no-access');
    });
  }

  it('never emits /login for any signed-in-but-unusable state', async () => {
    for (const [, resolution] of loopForming) {
      expect(await destinationFor(resolution)).not.toBe('/login');
    }
  });

  it('does not send them to /dashboard either, which would be the other half of the loop', async () => {
    for (const [, resolution] of loopForming) {
      expect(await destinationFor(resolution)).not.toBe('/dashboard');
    }
  });
});
