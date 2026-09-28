'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';

type FieldErrors = Record<string, string[] | undefined>;

/** Add a subject to the school's list. */
export function SubjectsForm() {
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});

    const trimmed = name.trim();
    if (!trimmed) {
      setErrors({ name: ['Enter a subject name.'] });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trimmed),
      });

      if (response.ok) {
        toast.success('Subject added', `${trimmed} is now on the list.`);
        setName('');
        router.refresh();
        return;
      }
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string; details?: FieldErrors };
      } | null;
      setErrors(payload?.error?.details ?? {});
      throw new Error(payload?.error?.message ?? 'Could not add the subject.');
    } catch (err) {
      toast.error('Subject not added', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="subject-name">Subject name *</Label>
        <Input
          id="subject-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Mathematics"
          aria-invalid={errors.name ? true : undefined}
        />
        {errors.name ? <p className="text-sm text-destructive">{errors.name[0]}</p> : null}
      </div>
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? 'Adding…' : 'Add subject'}
      </Button>
    </form>
  );
}
