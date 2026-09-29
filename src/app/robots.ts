import type { MetadataRoute } from 'next';

import { serverEnv } from '@/server/env';

/**
 * robots.txt
 *
 * The landing page is meant to be indexed. Everything else is not: every
 * application screen lives behind `/login`, requires a session, and has no
 * public value. `Disallow: /` with a single `Allow: /$` would work too, but
 * listing the prefixes is the form that survives someone adding a route later
 * without thinking about it.
 *
 * A `sitemap` line points at `sitemap.xml`, rendered alongside this file. That
 * route reads the origin from `NEXTAUTH_URL` at request time rather than
 * hard-coding a host, so it cannot point at a guessed domain — see the note
 * there on why the repository not knowing the school's domain is not the same
 * problem as a deployment not knowing its own origin.
 */
export default function robots(): MetadataRoute.Robots {
  // Read from the deployment, never from a literal in this file. A host typed
  // in here is a host that silently rots the moment the domain changes. See the
  // note in sitemap.ts on why the localhost fallback is acceptable.
  const base = serverEnv.NEXTAUTH_URL;

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/login', '/auth/'],
      },
    ],
    sitemap: `${base.replace(/\/+$/, '')}/sitemap.xml`,
  };
}
