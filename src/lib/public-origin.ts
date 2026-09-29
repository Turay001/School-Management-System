/**
 * The public origin of a deployment.
 *
 * A sitemap needs absolute URLs, and robots.txt needs to say where its sitemap
 * lives, so both need to know the host they are being served from. There are
 * two sources and they disagree in practice:
 *
 * - `NEXTAUTH_URL`, if the operator set it. Explicit and canonical, so it wins.
 * - The host actually serving this request, which is always correct for
 *   whichever deployment is answering.
 *
 * WHY THE REQUEST, AND NOT ONLY THE ENV VAR
 * -----------------------------------------
 * This was built the other way first — the origin came from `NEXTAUTH_URL` and
 * fell back to `http://localhost:3000`, exactly as `serverEnv` does. Deployed,
 * it produced a live sitemap reading `http://localhost:3000/` in production,
 * because the variable had never been set in the deployment and nothing
 * enforced it: `validateConfig` reports a missing `NEXTAUTH_URL` but, per
 * docs/deployment.md, is not yet called from anywhere.
 *
 * Worse, these routes were PRERENDERED. The value was frozen at build time, so
 * setting the variable in the dashboard afterwards would not have fixed the
 * already-deployed build. A default that can only be corrected by a rebuild is
 * not a default; it is a way of publishing a wrong address.
 *
 * So the env var is a preference and the request is the guarantee. With no
 * variable set, the sitemap still names the host that is actually serving it,
 * which on a preview deployment is the preview host - factually true, rather
 * than a localhost address that is false everywhere except one developer's
 * laptop.
 *
 * `host` is used, never `x-forwarded-host`: the latter is a client-supplied
 * header in several proxy configurations, and a client-supplied host is not
 * something to build a document's canonical address from.
 */

/**
 * Accept an absolute http(s) origin and return it without a trailing slash.
 *
 * Returns null for anything else - a bare path, a relative value, a value with
 * whitespace, or an empty string. Nothing is repaired: a caller that gets null
 * can omit the claim entirely, which is better than emitting a guess.
 */
export function normaliseOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+$/i.test(trimmed)) return null;
  return trimmed;
}

/**
 * The origin of the request being served, from its host and scheme headers.
 */
export function requestOrigin(
  host: string | null | undefined,
  scheme: string | null | undefined,
): string | null {
  if (!host) return null;
  // A deployment terminating TLS always forwards the real scheme. Defaulting to
  // https is the safe direction: a wrong https in a sitemap is merely redundant,
  // a wrong http would have crawlers fetch the address over plaintext.
  return normaliseOrigin(`${scheme === 'http' ? 'http' : 'https'}://${host}`);
}

/**
 * The origin to publish: the configured one when there is one, otherwise the
 * host actually serving this request. Null when neither is available, in which
 * case the caller must publish nothing rather than publish something invented.
 */
export function publicOrigin(options: {
  configured?: string | null;
  host?: string | null;
  scheme?: string | null;
}): string | null {
  return normaliseOrigin(options.configured) ?? requestOrigin(options.host, options.scheme);
}
