/**
 * Post-sign-in redirect targets.
 *
 * `?next=` is attacker-controllable: anyone can send a link to
 * `/login?next=https://example.invalid`. The sign-in form honours it, so an
 * unvalidated value lets a link to the school's genuine sign-in page carry the
 * user to an attacker's site the instant they finish entering real credentials
 * — at the exact moment they are most likely to trust the screen and type their
 * password. That is a working phishing primitive, and it costs the attacker only
 * a link.
 *
 * So `next` is only ever honoured when it is a path on this origin. The rule is
 * deliberately narrow rather than clever: a same-origin absolute path, and
 * nothing else. Anything that does not match falls back to the caller's default
 * rather than being repaired, because a "repaired" URL is a URL whose parsing
 * we would then be depending on.
 */

/**
 * The default destination after signing in, and the fallback for any `next`
 * that is not a plain same-origin path.
 */
export const DEFAULT_REDIRECT_PATH = '/dashboard';

/**
 * Return `candidate` if it is safe to navigate to, otherwise null.
 *
 * The rejected shapes, and why each is a redirect to somewhere else:
 *
 * - `https://host/x`, `//host/x` - absolute and protocol-relative URLs. The
 *   second is the sharp one: it starts with a single `/`, so a naive
 *   "must start with /" check lets it straight through.
 * - `/\host` - browsers normalise a backslash to a forward slash, so this
 *   becomes `//host` in the address bar while looking like a path here.
 * - `javascript:...` - no leading slash, and a navigation we never want.
 *
 * A path with a query string or fragment (`/students?status=active`) is fine
 * and is returned unchanged.
 */
export function safeRedirectPath(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  if (!candidate.startsWith('/')) return null;
  if (candidate.startsWith('//')) return null;
  if (candidate.includes('\\')) return null;
  return candidate;
}
