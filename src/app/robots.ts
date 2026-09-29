import { headers } from 'next/headers';
import type { MetadataRoute } from 'next';

import { publicOrigin } from '@/lib/public-origin';

/**
 * robots.txt
 *
 * The landing page is meant to be indexed. Everything else is not: every
 * application screen lives behind `/login`, requires a session, and has no
 * public value. `Disallow: /` with a single `Allow: /$` would work too, but
 * listing the prefixes is the form that survives someone adding a route later
 * without thinking about it.
 *
 * A `sitemap` line points at `sitemap.xml`, rendered alongside this file from
 * the same origin resolution - see `src/lib/public-origin.ts`. Both files read
 * the origin, neither types it in, and a host written into a source file is a
 * host that silently rots when the domain changes.
 *
 * The `sitemap` line is OMITTED when no origin can be resolved, because
 * advertising a sitemap at an address that will not answer is worse than
 * advertising no sitemap at all.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const request = await headers();

  // The raw variable, not `serverEnv.NEXTAUTH_URL` - that accessor substitutes
  // `http://localhost:3000` when the variable is unset, and "unset" is
  // precisely the case this file has to handle honestly.
  const origin = publicOrigin({
    configured: process.env.NEXTAUTH_URL,
    host: request.get('host'),
    scheme: request.get('x-forwarded-proto'),
  });

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/login', '/auth/'],
      },
    ],
    ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}),
  };
}
