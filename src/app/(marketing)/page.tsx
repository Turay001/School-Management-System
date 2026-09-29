import type { Metadata } from 'next';

import { About } from '@/components/marketing/about';
import { FinalCta } from '@/components/marketing/section-cta';
import { ForAdministration } from '@/components/marketing/for-administration';
import { ForParents } from '@/components/marketing/for-parents';
import { ForStaff } from '@/components/marketing/for-staff';
import { Hero } from '@/components/marketing/hero';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { SchoolRules } from '@/components/marketing/school-rules';
import { SystemCapabilities } from '@/components/marketing/system-capabilities';
import { Trust } from '@/components/marketing/trust';
import { WhySamjona } from '@/components/marketing/why-samjona';
import { SAMJONA_BRAND } from '@/lib/brand';

/**
 * The public landing page.
 *
 * STATIC BY CONSTRUCTION. This page is a server component that imports no
 * database client, no service and no session lookup. It renders from
 * `src/lib/brand.ts` alone, so it cannot fail because a migration is unapplied,
 * cannot leak a session, and does not add a query to the hot path of an
 * unauthenticated request. The one client component it reaches is the mobile
 * navigation disclosure, which holds no data.
 *
 * WHAT IT IS FOR
 * --------------
 * Three readers, in this order, and the order is the argument:
 *
 *   1. A parent, who needs to know what they will be able to see.
 *   2. A teacher, who needs to know whether it will save them time.
 *   3. A proprietor, who is deciding whether this replaces what they currently
 *      run the school on.
 *
 * The first two sections after the hero answer the first two readers. The third
 * — `ForAdministration` — is where payroll, fees, staff, expenses and reports
 * appear as substance rather than as a mention, because a proprietor who reads
 * a landing page that covers results and fees concludes the product has no
 * payroll, and that conclusion is reached in about four seconds.
 *
 * `SystemCapabilities` then gives the entire catalogue in one place, with the
 * status of each part stated plainly. It is the section that lets a reader
 * check the scope rather than take the page's word for it, and it is the reason
 * the three audience sections above it can be lenses rather than the whole truth.
 *
 * `SchoolRules` follows, because it is what makes the statuses in that list
 * believable; `Trust` follows that, because a reader who has just been told the
 * system will not invent an absence rule is the reader most receptive to being
 * told what protects the data.
 *
 * It is a page about the value of the product, not a page about how the product
 * was built. Anything a visitor would need a technical vocabulary to understand
 * does not belong here, and none of it does — including the fact that the
 * completeness of this page is maintained deliberately.
 *
 * Claim discipline: every sentence is sourced from `src/lib/brand.ts`, where
 * the provenance of each string is recorded. Nothing about the school that is
 * not in the repository is stated — no founding year, roll size, motto,
 * results, fee amounts, awards, address, telephone or email.
 */
export const metadata: Metadata = {
  // `absolute`, because the root layout's template would otherwise append
  // "· SAMJONA" to a title that already begins with the school name.
  title: { absolute: `${SAMJONA_BRAND.name} | ${SAMJONA_BRAND.tagline}` },
  description:
    'SAMJONA is a complete school management system: student records, staff, ' +
    'payroll, fees, results, leave, expenses and reports in one place, with ' +
    'clear access for parents, teachers and the school office.',
  alternates: { canonical: '/' },
};

export default function MarketingPage() {
  return (
    <>
      <Hero />
      <WhySamjona />
      <ForParents />
      <ForStaff />
      <ForAdministration />
      <SystemCapabilities />
      <HowItWorks />
      <SchoolRules />
      <Trust />
      <About />
      <FinalCta />
    </>
  );
}
