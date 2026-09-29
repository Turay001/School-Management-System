import type { MetadataRoute } from 'next';

import { SAMJONA_BRAND } from '@/lib/brand';

/**
 * Web app manifest
 *
 * The file did not exist, and nothing in the application referenced it. It is
 * added because a browser asked for /manifest.webmanifest and was answered
 * with a redirect to the sign-in page, which is a worse answer than an honest
 * one and a worse answer than none.
 *
 * WHAT THIS IS FOR
 * ----------------
 * A manifest is what makes a site installable: a teacher on a phone can add
 * SAMJONA to their home screen and open it full-screen. For a school whose staff
 * use the system daily on whatever handset they can afford, that is the whole
 * value. It declares no capability the application lacks and asks for no
 * permission - there is no service worker here, so nothing is cached offline
 * and nothing about payroll or student records is ever stored on the device
 * beyond what the session cookie already requires.
 *
 * `display: standalone` is a real behaviour change and is deliberate: installed,
 * the app has no browser chrome, which is what makes it feel like the school's
 * own system rather than a page inside a browser. The trade is that there is no
 * visible address bar, so back is provided by the application's own navigation.
 *
 * THE COLOURS ARE COPIED, NOT CHOSEN
 * ---------------------------------
 * `theme_color` is the `--primary` token, and `background_color` is the
 * `--background` token, both converted from the HSL triplets in
 * `src/app/globals.css` (hsl 187 62% 24% and hsl 210 25% 98%). A manifest
 * requires hex; the tokens are HSL, so the conversion is explicit here and the
 * comment names both source values. It also matches the `themeColor` already set
 * in `src/app/layout.tsx`, so the browser chrome and the installed icon agree.
 *
 * Deliberately NOT the `#10454f` of `src/app/icon.svg`. That is a separate,
 * darker teal used for the photographic scrim and recorded as such in
 * `public/branding/SOURCES.md`; using it here would make the installed icon
 * and the browser chrome two different colours for one brand.
 *
 * THE ICON IS NOT "maskable"
 * -------------------------
 * `purpose` is `any`, not `any maskable`. The monogram is a rounded rectangle
 * with transparent corners, and a maskable icon is required to fill its canvas
 * to the edges because Android crops it to whatever shape the launcher uses.
 * Declaring this one maskable would show notched corners on a home screen. A
 * maskable variant needs its own padded artwork; until that exists, `any` is
 * the truthful declaration.
 *
 * The copy is taken from `SAMJONA_BRAND` rather than restated, so the manifest
 * cannot drift from the page.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SAMJONA_BRAND.systemName,
    short_name: SAMJONA_BRAND.wordmark,
    description: SAMJONA_BRAND.subline,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // hsl(187 62% 24%) = --primary. See src/app/globals.css.
    theme_color: '#175a63',
    // hsl(210 25% 98%) = --background. See src/app/globals.css.
    background_color: '#f9fafb',
    icons: [
      {
        src: '/icon.svg',
        // The monogram is drawn on a 64-unit viewBox, so it scales to any size
        // the launcher asks for; there is no single pixel size to declare.
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
