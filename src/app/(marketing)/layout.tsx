import { RecoveryRescue } from '@/components/marketing/recovery-rescue';
import { SiteFooter } from '@/components/marketing/site-footer';
import { SiteHeader } from '@/components/marketing/site-header';

/**
 * Public landing page layout.
 *
 * A separate route group so the marketing surface cannot inherit the
 * application shell. The `(app)` layout requires a session and renders the
 * sidebar; a public page must not have either, and a route group is how Next
 * keeps them from sharing a layout while still resolving both to `/`.
 *
 * The skip link is here rather than in the components, because it must be the
 * first focusable element in the document for it to do its job.
 *
 * `RecoveryRescue` is mounted here, and renders nothing, because the Supabase
 * Site URL — the fallback a rejected password-reset redirect is built from — is
 * the site root, which is this layout. See the component for the failure it
 * removes.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <RecoveryRescue />
    </div>
  );
}
