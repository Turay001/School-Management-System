import type { Metadata, Viewport } from 'next';

import './globals.css';
import { ToastProvider } from '@/components/ui/toast';
import { SAMJONA_BRAND } from '@/lib/brand';

/**
 * Root layout. The application shell and its session provider live in the
 * `(app)` route group; the public landing page has its own in `(marketing)`;
 * this root supplies global styles, document metadata and the toast surface so
 * feedback works on the login screen too.
 *
 * METADATA
 * --------
 * `metadataBase` is read from `NEXTAUTH_URL` — the deployment URL the
 * repository already documents in `.env.example`. It is NOT hardcoded, because
 * a guessed domain would be a fabricated claim: this page is for a school, and
 * the school's domain is not known here. When the variable is absent the
 * absolute Open Graph image URL is omitted rather than pointed at `localhost`,
 * which would emit a preview card linking nowhere.
 */
const siteUrl = process.env.NEXTAUTH_URL;

const description =
  'School administration, fees, payroll and results for one school. ' +
  'Money is computed from records, access is enforced by the database, and ' +
  'unconfirmed rules are left visible rather than guessed.';

export const metadata: Metadata = {
  title: {
    default: `${SAMJONA_BRAND.name} — ${SAMJONA_BRAND.product}`,
    template: `%s · ${SAMJONA_BRAND.wordmark}`,
  },
  description,
  applicationName: SAMJONA_BRAND.systemName,
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  openGraph: {
    type: 'website',
    siteName: SAMJONA_BRAND.name,
    title: `${SAMJONA_BRAND.name} — ${SAMJONA_BRAND.product}`,
    description,
    locale: 'en_GB',
    ...(siteUrl
      ? { images: [{ url: '/branding/og-card.svg', width: 1200, height: 630, alt: SAMJONA_BRAND.name }] }
      : {}),
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SAMJONA_BRAND.name} — ${SAMJONA_BRAND.product}`,
    description,
  },
  robots: {
    // The landing page is meant to be found. The application shell is not:
    // every screen behind /login requires a session and has no public value.
    index: true,
    follow: true,
  },
};

/**
 * An explicit viewport export. Next supplies a default, but the theme colour is
 * part of the identity and there is only one sensible value for it: the
 * browser chrome should match the surface the page is built on.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: 'hsl(187 62% 24%)',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
