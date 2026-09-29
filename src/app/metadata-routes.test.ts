import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it } from 'vitest';

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
 * The theme running through this file: none of these may hard-code a host. The
 * school's domain is a property of the deployment, not of the repository, and a
 * literal typed into a source file is one that silently rots the day the domain
 * changes - leaving a sitemap that confidently points crawlers at a host that no
 * longer resolves, and a robots.txt advertising a sitemap nobody can fetch.
 */

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

/** Read a `--name: H S% L%;` token straight out of the stylesheet. */
function cssToken(name: string): string {
  const css = readFileSync(fileURLToPath(new URL('./globals.css', import.meta.url)), 'utf8');
  const match = css.match(new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
  if (!match) throw new Error(`token --${name} not found in globals.css`);
  return hslToHex(...hslParts(match));
}

function hslParts(match: RegExpMatchArray): [number, number, number] {
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Narrow a possibly-absent first element, so the assertions below read cleanly. */
function first<T>(items: T[] | undefined): T {
  if (!items || items.length === 0) throw new Error('expected at least one entry');
  return items[0]!;
}

/** The single sitemap URL, with the origin already applied. */
function onlyUrl(): string {
  return first(sitemap()).url;
}

beforeEach(() => {
  process.env.NEXTAUTH_URL = 'https://school.example.com';
});

describe('sitemap', () => {
  it('takes its origin from the deployment, not from a literal', () => {
    expect(onlyUrl()).toBe('https://school.example.com/');
  });

  it('follows the deployment when the domain changes', () => {
    process.env.NEXTAUTH_URL = 'https://a-different-school.org';
    expect(onlyUrl()).toBe('https://a-different-school.org/');
  });

  it('does not double the slash when the origin has a trailing one', () => {
    process.env.NEXTAUTH_URL = 'https://school.example.com/';
    expect(onlyUrl()).toBe('https://school.example.com/');
  });

  it('lists the landing page, which is the only public URL', () => {
    // robots.txt allows / and disallows /api/, /login and /auth/, and every
    // application screen is behind a session. A sitemap listing anything else
    // would be advertising URLs that redirect to a sign-in form.
    expect(sitemap().map((entry) => entry.url)).toEqual(['https://school.example.com/']);
  });

  it('claims no lastModified date it cannot know', () => {
    // Nothing in the repository records when the copy last changed, so a build
    // timestamp would be an invention.
    expect(first(sitemap()).lastModified).toBeUndefined();
  });
});

describe('robots', () => {
  it('allows the landing page and keeps the rest out', () => {
    const rules = first(robots().rules as Array<{ allow?: string; disallow?: string[] }>);
    expect(rules.allow).toBe('/');
    expect(rules.disallow).toEqual(['/api/', '/login', '/auth/']);
  });

  it('points at the sitemap on the deployment origin', () => {
    expect(robots().sitemap).toBe('https://school.example.com/sitemap.xml');
  });

  it('keeps the sitemap line consistent with the sitemap itself', () => {
    // If these ever disagree, robots.txt advertises a sitemap the site does not
    // actually serve, and a crawler has no way to tell that from a dead link.
    const advertised = String(robots().sitemap);
    expect(sitemap().map((entry) => entry.url)).toContain(advertised.replace(/sitemap\.xml$/, ''));
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
    expect(manifest().start_url).toBe('/');
    expect(manifest().scope).toBe('/');
  });
});
