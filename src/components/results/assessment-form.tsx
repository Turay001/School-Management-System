'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import type { AcademicOptions } from '@/server/portal/results';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';

type FieldErrors = Record<string, string[] | undefined>;

interface AssessmentFormProps {
  options: AcademicOptions;
}

/**
 * Create an assessment: one name per (class, subject, term), with the
 * teacher-chosen maximum mark. Produces a draft the teacher then fills with
 * marks from the assessment page.
 */
export function AssessmentForm({ options }: AssessmentFormProps) {
  const router = useRouter();
  const toast = useToast();

  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  // The term in progress, NOT terms[0]: that list runs `sequence asc`, so it
// starts at Term 1 and an assessment would default to the wrong term for two
// thirds of the school year. See src/server/db/current-term.ts.
const [termId, setTermId] = useState(options.currentTermId || options.terms[0]?.id || '');
  const [name, setName] = useState('');
  const [maxMarks, setMaxMarks] = useState('100');
  const [heldOn, setHeldOn] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});

    const localErrors: FieldErrors = {};
    if (!classId) localErrors.classId = ['Choose a class.'];
    if (!subjectId) localErrors.subjectId = ['Choose a subject.'];
    if (!termId) localErrors.termId = ['Choose a term.'];
    if (!name.trim()) localErrors.name = ['Give the assessment a name.'];

    const maxValue = Number(maxMarks);
    if (!Number.isFinite(maxValue) || maxValue <= 0) {
      localErrors.maxMarks = ['Enter a maximum mark greater than zero.'];
    }

    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId,
          subjectId,
          termId,
          name: name.trim(),
          maxMarks: maxValue,
          heldOn: heldOn || null,
        }),
      });

      if (response.ok) {
        const body = (await response.json()) as { id: string };
        toast.success('Assessment created', 'Now record the marks for this class.');
        router.push(`/results/${body.id}`);
        router.refresh();
        return;
      }

      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string; details?: FieldErrors };
      } | null;
      setErrors(payload?.error?.details ?? {});
      throw new Error(payload?.error?.message ?? 'Could not create the assessment.');
    } catch (err) {
      toast.error(
        'Assessment not created',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {errors._form?.[0] ? <Alert variant="destructive" title={errors._form[0]} /> : null}

      <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="assessment-class">Class *</Label>
          <Select
            value={classId || 'unset'}
            onValueChange={(v) => setClassId(v === 'unset' ? '' : v)}
          >
            <SelectTrigger
              id="assessment-class"
              aria-label="Class"
              aria-invalid={errors.classId ? true : undefined}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset" disabled>
                Choose a class…
              </SelectItem>
              {options.classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.classId ? <p className="text-sm text-destructive">{errors.classId[0]}</p> : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="assessment-subject">Subject *</Label>
          <Select
            value={subjectId || 'unset'}
            onValueChange={(v) => setSubjectId(v === 'unset' ? '' : v)}
          >
            <SelectTrigger
              id="assessment-subject"
              aria-label="Subject"
              aria-invalid={errors.subjectId ? true : undefined}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset" disabled>
                Choose a subject…
              </SelectItem>
              {options.subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.subjectId ? (
            <p className="text-sm text-destructive">{errors.subjectId[0]}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="assessment-term">Term *</Label>
          <Select
            value={termId || 'unset'}
            onValueChange={(v) => setTermId(v === 'unset' ? '' : v)}
          >
            <SelectTrigger
              id="assessment-term"
              aria-label="Term"
              aria-invalid={errors.termId ? true : undefined}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.terms.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.termId ? <p className="text-sm text-destructive">{errors.termId[0]}</p> : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="assessment-name">Name *</Label>
          <Input
            id="assessment-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. End of Term Test"
            aria-invalid={errors.name ? true : undefined}
          />
          {errors.name ? <p className="text-sm text-destructive">{errors.name[0]}</p> : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="assessment-max">Maximum mark *</Label>
          <Input
            id="assessment-max"
            type="number"
            min="0.5"
            step="0.5"
            value={maxMarks}
            onChange={(e) => setMaxMarks(e.target.value)}
            aria-invalid={errors.maxMarks ? true : undefined}
          />
          {errors.maxMarks ? (
            <p className="text-sm text-destructive">{errors.maxMarks[0]}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="assessment-date">Date held</Label>
          <Input
            id="assessment-date"
            type="date"
            value={heldOn}
            onChange={(e) => setHeldOn(e.target.value)}
          />
        </div>
      </CardContent>

      <div className="flex items-center justify-end gap-3 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create assessment'}
        </Button>
      </div>
    </form>
  );
}
