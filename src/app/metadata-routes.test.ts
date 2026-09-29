import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import manifest from './manifest';
import robots from './robots';
import sitemap from './sitemap';

/**
 * PUBLIC METADATA ROUTES
 * ======================
 * `/robots.txt`, `/sitemap.xml` and `/manifest.webmanifest` are the three files
 * a stranger, a crawler or a browser asks for before anyone signs in. Two of
 * them did not exist, and all three were being answered with a redirect to the
 * sign-in page.
 *
 * The governing rule: none of these may hard-code a host, and none may publish
 * an address that was not observed. The first version of the sitemap read
 * `NEXTAUTH_URL` and fell back to `http://localhost:3000`; deployed, it
 * published a live sitemap pointing at localhost, because the variable was
 * never set in the deployment and nothing enforced it. These tests exist to
 * make that failure impossible to reintroduce.
 */

// vi.hoisted so the factory closes over bindings that are already initialised
// when the mocked module is first imported.
const request = vi.hoisted(() => ({ host: null as string | null, scheme: null as string | null }));

vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (name: string) => {
      const key = name.toLowerCase();
      if (key === 'host') return request.host;
      if (key === 'x-forwarded-proto') return request.scheme;
      return null;
    },
  }),
}));

/** Minimal HSL -> hex, matching the token notation in globals.css. */
function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lig - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const hex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function hslParts(match: RegExpMatchArray): [number, number, number] {
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Read a `--name: H S% L%;` token straight out of the stylesheet. */
function cssToken(name: string): string {
  const css = readFileSync(fileURLToPath(new URL('./globals.css', import.meta.url)), 'utf8');
  const match = css.match(new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
  if (!match) throw new Error(`token --${name} not found in globals.css`);
  return hslToHex(...hslParts(match));
}

/** Narrow a possibly-absent first element, so the assertions below read cleanly. */
function first<T>(items: T[] | undefined): T {
  if (!items || items.length === 0) throw new Error('expected at least one entry');
  return items[0]!;
}

async function onlyUrl(): Promise<string> {
  return first(await sitemap()).url;
}

beforeEach(() => {
  request.host = 'school.example.com';
  request.scheme = 'https';
  delete process.env.NEXTAUTH_URL;
});

describe('sitemap', () => {
  it('names the host actually serving the request', async () => {
    expect(await onlyUrl()).toBe('https://school.example.com/');
  });

  it('names the live host even with no NEXTAUTH_URL configured', async () => {
    // The regression that shipped. Deployed with the variable unset, the
    // sitemap read http://localhost:3000/ in production and could only be
    // corrected by a rebuild.
    expect(process.env.NEXTAUTH_URL).toBeUndefined();
    expect(await onlyUrl()).not.toContain('localhost');
  });

  it('prefers a configured NEXTAUTH_URL over the request host', async () => {
    process.env.NEXTAUTH_URL = 'https://canonical.example.org';
    request.host = 'preview.internal';
    expect(await onlyUrl()).toBe('https://canonical.example.org/');
  });

  it('follows the deployment when the domain changes', async () => {
    request.host = 'a-different-school.org';
    expect(await onlyUrl()).toBe('https://a-different-school.org/');
  });

  it('does not double the slash when the origin has a trailing one', async () => {
    process.env.NEXTAUTH_URL = 'https://school.example.com/';
    expect(await onlyUrl()).toBe('https://school.example.com/');
  });

  it('lists the landing page, which is the only public URL', async () => {
    // robots.txt allows / and disallows /api/, /login and /auth/, and every
    // application screen is behind a session. A sitemap listing anything else
    // would be advertising URLs that redirect to a sign-in form.
    expect((await sitemap()).map((entry) => entry.url)).toEqual(['https://school.example.com/']);
  });

  it('claims no lastModified date it cannot know', async () => {
    // Nothing in the repository records when the copy last changed, so a build
    // timestamp would be an invention.
    expect(first(await sitemap()).lastModified).toBeUndefined();
  });

  it('publishes an empty document rather than a guess when no host is known', async () => {
    request.host = null;
    delete process.env.NEXTAUTH_URL;
    // An empty urlset is valid and truthful. A urlset naming a guessed host is
    // neither, and is what a crawler would cache.
    expect(await sitemap()).toEqual([]);
  });
});

describe('robots', () => {
  it('allows the landing page and keeps the rest out', async () => {
    const rules = first((await robots()).rules as Array<{ allow?: string; disallow?: string[] }>);
    expect(rules.allow).toBe('/');
    expect(rules.disallow).toEqual(['/api/', '/login', '/auth/']);
  });

  it('points at the sitemap on the resolved origin', async () => {
    expect((await robots()).sitemap).toBe('https://school.example.com/sitemap.xml');
  });

  it('advertises no localhost in production', async () => {
    delete process.env.NEXTAUTH_URL;
    expect(String((await robots()).sitemap)).not.toContain('localhost');
  });

  it('omits the sitemap line entirely when no origin can be resolved', async () => {
    // Advertising a sitemap at an address that will not answer is worse than
    // advertising no sitemap.
    request.host = null;
    delete process.env.NEXTAUTH_URL;
    expect((await robots()).sitemap).toBeUndefined();
  });

  it('keeps the sitemap line consistent with the sitemap itself', async () => {
    // If these ever disagree, robots.txt advertises a sitemap the site does not
    // actually serve, and a crawler has no way to tell that from a dead link.
    const advertised = String((await robots()).sitemap);
    expect((await sitemap()).map((entry) => entry.url)).toContain(
      advertised.replace(/sitemap\.xml$/, ''),
    );
  });
});

describe('manifest', () => {
  it('uses the --primary token as its theme colour', () => {
    expect(manifest().theme_color).toBe(cssToken('primary'));
  });

  it('uses the --background token as its background colour', () => {
    expect(manifest().background_color).toBe(cssToken('background'));
  });

  it('agrees with the theme colour the document already declares', () => {
    // src/app/layout.tsx sets themeColor in HSL. The manifest needs hex. They
    // are the same colour expressed twice, so they must not drift.
    const layout = readFileSync(fileURLToPath(new URL('./layout.tsx', import.meta.url)), 'utf8');
    const match = layout.match(/themeColor:\s*'hsl\(([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\)'/);
    expect(match).not.toBeNull();
    expect(manifest().theme_color).toBe(hslToHex(...hslParts(match!)));
  });

  it('does not claim the icon is maskable when it is not', () => {
    // The monogram is a rounded rectangle with transparent corners. A maskable
    // icon must fill its canvas to the edges, because Android crops it. Saying
    // otherwise here would show notched corners on a home screen.
    for (const icon of manifest().icons ?? []) {
      expect(icon.purpose).toBe('any');
    }
  });

  it('points at the icon the application actually serves', () => {
    // src/app/icon.svg is served at /icon.svg by the file-convention route.
    for (const icon of manifest().icons ?? []) {
      expect(icon.src).toBe('/icon.svg');
    }
  });

  it('scopes the installed app to this origin only', () => {
    // Relative, so the manifest is correct on any host and needs no origin
    // resolution at all - which is why this route can stay prerendered.
    expect(manifest().start_url).toBe('/');
    expect(manifest().scope).toBe('/');
  });
});
