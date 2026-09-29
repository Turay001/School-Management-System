import type { Metadata } from 'next';

import { About } from '@/components/marketing/about';
import { BrandStatement } from '@/components/marketing/brand-statement';
import { Community } from '@/components/marketing/community';
import { Hero } from '@/components/marketing/hero';
import { SchoolExperience } from '@/components/marketing/school-experience';
import { Trust } from '@/components/marketing/trust';
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
 * To introduce SAMJONA's School Management System to the people who interact
 * with SAMJONA. Not to sell it, and not to recruit schools as customers — this
 * is one school's own system and the visitor is most likely already connected
 * to it in some way.
 *
 * The order follows a single argument, and each step is one a visitor actually
 * asks in sequence:
 *
 *   1. Hero          What is this?  -> SAMJONA, and what kind of thing it is.
 *   2. About         What is it for? -> the school, and the system it runs on.
 *   3. Experience    Who is it for?  -> students, families, teachers, the office.
 *   4. Community     Why does it matter? -> because a school runs on shared,
 *                                      current information.
 *   5. Trust         Can I rely on it? -> what happens to a child's records.
 *   6. Statement     What is it trying to be? -> the closing intention.
 *
 * WHAT THIS PAGE IS NOT
 * ---------------------
 * It is not a product page, and it is written to be recognisably not one. That
 * constraint is the reason several sections were removed, and it is worth
 * recording why, because the earlier version of this file argued the opposite.
 *
 * The previous page had eleven sections, including a fifteen-row capability
 * catalogue with a readiness badge on every row ("Ready now", "Partly ready",
 * "Held back"), a list of what was not built yet, and separate sections
 * pitching parents, staff and the proprietor as three markets. All of it was
 * true, and all of it read as vendor documentation: a build report and a
 * segment analysis, published on a school's own front page.
 *
 * A school introducing its own system does not publish its build status to
 * families, and it does not need to sell itself to its own staff. So the status
 * badges, the not-yet list and the three-market structure are gone.
 *
 * The scope did not go with them, and that is the part worth being careful
 * about. The school office really does keep student records, staff, salaries,
 * fees, expenses and reports, and a page about a school that stopped mentioning
 * any of that would have quietly become a brochure for something much smaller
 * than SAMJONA. That work is still described — in `SCHOOL_EXPERIENCE` and
 * `COMMUNITY_POINTS` in `src/lib/brand.ts`, and in prose, inside sentences about
 * what the school does. What is gone is the grid of icons and status labels that
 * made the page look like a comparison table.
 *
 * Where a capability is not built, the page says nothing about it. Nothing here
 * promises attendance recording, email or SMS delivery, printed fee receipts,
 * grade letters or statutory deductions, because none of those exist in the
 * running system. Silence is not a claim, and `docs/` remains the record of what
 * the system does and does not do.
 *
 * Claim discipline: every sentence is sourced from `src/lib/brand.ts`, where the
 * provenance of each string is recorded. Nothing about the school that is not in
 * the repository is stated — no founding year, roll size, motto, results, fee
 * amounts, awards, address, telephone or email.
 */
export const metadata: Metadata = {
  // `absolute`, because the root layout's template would otherwise append
  // "· SAMJONA" to a title that already begins with the school name.
  //
  // The system is named first, not the school. This was the other way round
  // until this pass, with the school name leading and the tagline behind it —
  // which is a description of a school's website rather than a statement of
  // what the page is. A browser tab and a search result both have room for the
  // system name, and the system name is the thing being introduced.
  title: { absolute: `${SAMJONA_BRAND.systemName} | ${SAMJONA_BRAND.name}` },
  description:
    'The SAMJONA School Management System is the digital system of Samjona ' +
    'International Academy in Sierra Leone, where students, staff, families ' +
    'and the school office work from the same records.',
  alternates: { canonical: '/' },
};

export default function MarketingPage() {
  return (
    <>
      <Hero />
      <About />
      <SchoolExperience />
      <Community />
      <Trust />
      <BrandStatement />
    </>
  );
}
