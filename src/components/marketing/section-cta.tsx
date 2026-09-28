import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { IconArrowRight } from '@/components/icons';
import { SAMJONA_BRAND } from '@/lib/brand';

import { Section } from './section';

/**
 * Sign-in call to action.
 *
 * No contact form, no "book a demo", no email address. None of those exist:
 * the repository holds no phone number, email address or street address for the
 * school — the corresponding settings rows are null and flagged as unconfirmed.
 * Inventing a contact route for a page shown to the school's own
 * representatives would be the most easily falsified claim on the page.
 */
export function SignInCta() {
  return (
    <Section id="sign-in" tone="muted">
      <div
        id="sign-in-heading"
        className="flex flex-col items-start gap-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-10 lg:flex-row lg:items-center lg:justify-between"
      >
        <div className="max-w-xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Sign in to {SAMJONA_BRAND.name}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Accounts are created by the proprietor and issued one at a time. If you
            do not have an account, ask — there is no way to register from this page.
          </p>
        </div>

        <Button asChild size="lg" className="w-full shrink-0 lg:w-auto">
          <Link href="/login">
            Sign in
            <IconArrowRight />
          </Link>
        </Button>
      </div>
    </Section>
  );
}
