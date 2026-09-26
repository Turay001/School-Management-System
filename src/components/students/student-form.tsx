'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { IconPlus, IconX } from '@/components/icons';

type FieldErrors = Record<string, string[] | undefined>;

interface GuardianDraft {
  id: string;
  fullName: string;
  phone: string;
  relationship: string;
  email: string;
  isPrimary: boolean;
}

interface StudentFormProps {
  classes: { id: string; name: string }[];
}

/**
 * Add a student. One form creates the student record and up to three
 * guardians. The class list comes from the server so the client never needs
 * a database connection; server field errors map straight back onto the
 * fields that produced them.
 */
export function StudentForm({ classes }: StudentFormProps) {
  const router = useRouter();
  const toast = useToast();

  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [admissionDate, setAdmissionDate] = useState('');
  const [classId, setClassId] = useState('');
  const [notes, setNotes] = useState('');
  const [guardians, setGuardians] = useState<GuardianDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const addGuardian = () => {
    if (guardians.length >= 3) return;
    setGuardians((current) => [
      ...current,
      { id: crypto.randomUUID(), fullName: '', phone: '', relationship: '', email: '', isPrimary: current.length === 0 },
    ]);
  };

  const updateGuardian = (id: string, patch: Partial<GuardianDraft>) => {
    setGuardians((current) => current.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };

  const removeGuardian = (id: string) => {
    setGuardians((current) => current.filter((g) => g.id !== id));
  };

  const primaryCount = guardians.filter((g) => g.isPrimary).length;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});

    if (!fullName.trim()) {
      setErrors({ fullName: ['Enter the full name'] });
      return;
    }
    if (!admissionDate) {
      setErrors({ admissionDate: ['Choose the admission date'] });
      return;
    }
    for (const guardian of guardians) {
      if (!guardian.fullName.trim() || !guardian.phone.trim()) {
        setErrors({
          guardians: ['Every guardian needs a name and a phone number.'],
        });
        return;
      }
    }
    if (primaryCount > 1) {
      setErrors({ guardians: ['Only one guardian can be primary.'] });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          gender: gender || null,
          dateOfBirth: dateOfBirth || null,
          admissionDate,
          classId: classId || null,
          notes: notes.trim() || null,
          guardians: guardians.map((g) => ({
            fullName: g.fullName.trim(),
            phone: g.phone.trim(),
            relationship: g.relationship.trim() || null,
            email: g.email.trim() || null,
            isPrimary: g.isPrimary,
          })),
        }),
      });

      if (response.ok) {
        const body = (await response.json()) as { studentId: string };
        toast.success('Student added', `${fullName.trim()} is now on the register.`);
        router.push(`/students/${body.studentId}`);
        router.refresh();
        return;
      }

      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string; details?: FieldErrors };
      } | null;
      const detailErrors = payload?.error?.details ?? {};
      setErrors(detailErrors);
      throw new Error(payload?.error?.message ?? 'Could not add the student. Please try again.');
    } catch (err) {
      toast.error('Could not add student', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {errors._form?.[0] ? <Alert variant="destructive" title={errors._form[0]} /> : null}

      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="student-full-name">Full name</Label>
          <Input
            id="student-full-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Aminata Sesay"
            aria-invalid={errors.fullName ? true : undefined}
          />
          {errors.fullName ? (
            <p className="text-xs text-destructive" role="alert">
              {errors.fullName[0]}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="student-gender">Gender</Label>
          <Select value={gender || 'unset'} onValueChange={(v) => setGender(v === 'unset' ? '' : v)}>
            <SelectTrigger id="student-gender" aria-label="Gender">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset">Not stated</SelectItem>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="student-dob">Date of birth</Label>
          <Input
            id="student-dob"
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="student-admission">Admission date</Label>
          <Input
            id="student-admission"
            type="date"
            required
            value={admissionDate}
            onChange={(e) => setAdmissionDate(e.target.value)}
            aria-invalid={errors.admissionDate ? true : undefined}
          />
          {errors.admissionDate ? (
            <p className="text-xs text-destructive" role="alert">
              {errors.admissionDate[0]}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="student-class">Class</Label>
          <Select value={classId || 'unset'} onValueChange={(v) => setClassId(v === 'unset' ? '' : v)}>
            <SelectTrigger id="student-class" aria-label="Class">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset">Not assigned yet</SelectItem>
              {classes.map((cls) => (
                <SelectItem key={cls.id} value={cls.id}>
                  {cls.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {classes.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No classes exist yet - the student will be added without a class assignment.
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="student-notes">Notes</Label>
          <Textarea
            id="student-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth noting about this student (optional)."
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Guardians</h2>
            <p className="text-xs text-muted-foreground">
              Up to three contacts. Phone numbers are used for urgent messages.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addGuardian}>
            <IconPlus />
            Add guardian
          </Button>
        </div>

        {errors.guardians?.[0] ? (
          <Alert variant="destructive" title={errors.guardians[0]} />
        ) : null}

        {guardians.length === 0 ? (
          <p className="text-sm text-muted-foreground">No guardians added yet.</p>
        ) : (
          <div className="space-y-3">
            {guardians.map((guardian, index) => (
              <div key={guardian.id} className="rounded-lg border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Guardian {index + 1}
                  </p>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={guardian.isPrimary}
                        onChange={(event) =>
                          updateGuardian(guardian.id, { isPrimary: event.target.checked })
                        }
                        className="size-4 rounded border-input accent-primary"
                      />
                      Primary
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeGuardian(guardian.id)}
                      aria-label={`Remove guardian ${index + 1}`}
                    >
                      <IconX />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`guardian-name-${index}`}>Full name</Label>
                    <Input
                      id={`guardian-name-${index}`}
                      value={guardian.fullName}
                      onChange={(e) => updateGuardian(guardian.id, { fullName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`guardian-phone-${index}`}>Phone</Label>
                    <Input
                      id={`guardian-phone-${index}`}
                      value={guardian.phone}
                      onChange={(e) => updateGuardian(guardian.id, { phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`guardian-relationship-${index}`}>Relationship</Label>
                    <Input
                      id={`guardian-relationship-${index}`}
                      placeholder="e.g. mother, father, sponsor"
                      value={guardian.relationship}
                      onChange={(e) => updateGuardian(guardian.id, { relationship: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`guardian-email-${index}`}>Email</Label>
                    <Input
                      id={`guardian-email-${index}`}
                      type="email"
                      value={guardian.email}
                      onChange={(e) => updateGuardian(guardian.id, { email: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Add Student'}
        </Button>
      </div>
    </form>
  );
}