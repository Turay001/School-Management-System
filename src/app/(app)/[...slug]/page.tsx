import { notFound } from 'next/navigation';

import { requireAppUser } from '@/server/auth/page-guard';
import { sectionLabelForPathname } from '@/components/layout/navigation';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { IconInfo } from '@/components/icons';

/**
 * CATCH-ALL PLACEHOLDER
 * =====================
 * Every module shown in the navigation - even one whose screens arrive in a
 * later phase - must answer "where am I" instead of throwing a dead 404. This
 * page greets anyone who opens a section that is scheduled but not yet built.
 * Sections that exist in no navigation group are genuinely unknown paths and
 * correctly 404.
 */
export default async function ModulePlaceholder({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const user = await requireAppUser();

  const { slug } = await params;
  const pathname = `/${slug.join('/')}`;
  const section = sectionLabelForPathname(user, pathname);
  if (!section) notFound();

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: section }]} />
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary/10">
              <IconInfo className="size-5 text-primary" />
            </div>
            <div>
              <CardTitle>{section} is coming online</CardTitle>
              <CardDescription>
                This module is part of the SAMJONA roadmap and is not available yet.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}