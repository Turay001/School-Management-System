import type { MetadataRoute } from 'next';

/**
 * robots.txt
 *
 * The landing page is meant to be indexed. Everything else is not: every
 * application screen lives behind `/login`, requires a session, and has no
 * public value. `Disallow: /` with a single `Allow: /$` would work too, but
 * listing the prefixes is the form that survives someone adding a route later
 * without thinking about it.
 *
 * No `sitemap` line, deliberately. A sitemap needs absolute URLs, and the
 * school's domain is not known in this repository. Emitting a sitemap pointing
 * at a guessed host would be a fabricated claim, so it is omitted until
 * `NEXTAUTH_URL` is set on the deployment. A two-URL site is below the point
 * where a sitemap earns its maintenance anyway.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/login', '/auth/'],
      },
    ],
  };
}
