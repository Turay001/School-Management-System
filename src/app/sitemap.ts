import type { MetadataRoute } from 'next';

import { serverEnv } from '@/server/env';

/**
 * sitemap.xml
 *
 * The file previously did not exist, and its absence was a deliberate decision
 * recorded in `robots.ts`: a sitemap needs absolute URLs, the school's domain
 * is not known in this repository, and emitting a sitemap pointing at a guessed
 * host would be a fabricated claim.
 *
 * The domain objection does not hold here, only in that wording. A metadata
 * route is rendered on the server, where `NEXTAUTH_URL` is present — and
 * `validateConfig` already reports its absence as a blocking problem in
 * production (src/server/env.ts). So the origin is read from the deployment
 * rather than from the repository. `serverEnv.NEXTAUTH_URL` falls back to
 * `http://localhost:3000`, which is why this file needs no "is it configured"
 * branch: the only deployments that would see the fallback are ones
 * `validateConfig` has already failed, and a local build that names localhost
 * harms nothing. The alternative — reading the raw variable and emitting
 * nothing — would duplicate a check the project already performs.
 *
 * THE ONE URL
 * -----------
 * `/robots.txt` allows `/` and disallows `/api/`, `/login` and `/auth/`, and
 * every application screen is behind a session. The indexable surface is
 * therefore the landing page and nothing else, so the sitemap lists the landing
 * page and nothing else. Its value is modest and it is not a growth lever: it
 * states the canonical origin for a site with a single public URL. It is here
 * because a crawler asking for /sitemap.xml should get an answer, not a login
 * page, and because the origin it declares is read rather than invented.
 *
 * No `lastModified`. A build timestamp would be a claim about when the copy
 * last changed, and nothing in this repository records that. Claiming a date we
 * do not know is the same error as claiming a host we do not know.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // Tolerate a trailing slash so the joined URL is never `https://host//`.
  const origin = serverEnv.NEXTAUTH_URL.replace(/\/+$/, '');

  return [
    {
      url: `${origin}/`,
      changeFrequency: 'monthly',
      priority: 1,
    },
  ];
}
