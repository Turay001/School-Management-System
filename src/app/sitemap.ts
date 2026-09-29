import { headers } from 'next/headers';
import type { MetadataRoute } from 'next';

import { publicOrigin } from '@/lib/public-origin';

/**
 * sitemap.xml
 *
 * The file did not exist, and its absence was a deliberate decision recorded in
 * `robots.ts`: a sitemap needs absolute URLs, the school's domain is not known
 * in this repository, and emitting a sitemap pointing at a guessed host would be
 * a fabricated claim.
 *
 * The domain objection dissolves in practice. A metadata route renders on the
 * server, where the host serving the request is available, so the origin is
 * read rather than typed in - and `NEXTAUTH_URL`, if the operator has set it,
 * takes precedence as the explicit canonical value. See `src/lib/public-origin.ts`
 * for why the request host is the guarantee and the variable is only a
 * preference.
 *
 * This route is deliberately NOT prerendered. Built as a static file, the origin
 * is frozen at build time, so a deployment that had not yet set `NEXTAUTH_URL`
 * published a sitemap naming `http://localhost:3000` in production and could
 * not be corrected without a rebuild. Nothing on the deployment enforced the
 * variable: `validateConfig` reports a missing `NEXTAUTH_URL` but, per
 * docs/deployment.md, is not yet called from anywhere. Reading the request
 * removes the dependency instead of documenting it.
 *
 * THE ONE URL
 * -----------
 * `/robots.txt` allows `/` and disallows `/api/`, `/login` and `/auth/`, and
 * every application screen is behind a session. The indexable surface is
 * therefore the landing page and nothing else, so the sitemap lists the landing
 * page and nothing else. Its value is modest and it is not a growth lever: it
 * states the canonical address of a site with a single public URL. It is here
 * because a crawler asking for /sitemap.xml should get an answer, not a sign-in
 * page, and because the address it states is read rather than invented.
 *
 * No `lastModified`. A build timestamp would be a claim about when the copy last
 * changed, and nothing in this repository records that. Claiming a date we do
 * not know is the same error as claiming a host we do not know.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const request = await headers();

  // The raw variable, not `serverEnv.NEXTAUTH_URL`: that accessor substitutes
  // `http://localhost:3000` when the variable is absent, and the difference
  // between "configured" and "not configured" is the whole point here.
  const origin = publicOrigin({
    configured: process.env.NEXTAUTH_URL,
    host: request.get('host'),
    scheme: request.get('x-forwarded-proto'),
  });

  // No origin means no claim. An empty urlset is a valid, truthful document;
  // a urlset naming a guessed host is not.
  if (!origin) return [];

  return [
    {
      url: `${origin}/`,
      changeFrequency: 'monthly',
      priority: 1,
    },
  ];
}
