import { Hero } from '@/components/marketing/hero';
import { Modules } from '@/components/marketing/modules';
import { NoGuessing } from '@/components/marketing/no-guessing';
import { NotYet } from '@/components/marketing/not-built';
import { PayrollFlow } from '@/components/marketing/payroll-flow';
import { RoleGrid } from '@/components/marketing/role-grid';
import { SignInCta } from '@/components/marketing/section-cta';

/**
 * The public landing page.
 *
 * STATIC BY CONSTRUCTION. This page is a server component that imports no
 * database client, no service and no session lookup. It renders from
 * `src/lib/brand.ts` and `ROLE_PERMISSIONS` alone, so it cannot fail because a
 * migration is unapplied, cannot leak a session, and does not add a query to
 * the hot path of an unauthenticated request. The one client component it
 * reaches is the mobile navigation disclosure, which holds no data.
 *
 * Claim discipline: every sentence here is either sourced from
 * `src/lib/brand.ts` — where the provenance of each string is recorded — or
 * generated from the live permission matrix. Nothing about the school that is
 * not in the repository is stated: no founding year, roll size, motto, results,
 * fee amounts, awards, address, telephone or email.
 */
export default function MarketingPage() {
  return (
    <>
      <Hero />
      <Modules />
      <PayrollFlow />
      <RoleGrid />
      <NoGuessing />
      <NotYet />
      <SignInCta />
    </>
  );
}
