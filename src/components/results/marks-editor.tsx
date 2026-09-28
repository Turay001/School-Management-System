'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { AssessmentRosterStudent } from '@/server/portal/results';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { IconUpload } from '@/components/icons';

interface MarksEditorProps {
  assessmentId: string;
  students: AssessmentRosterStudent[];
  maxMarks: number;
}

interface UploadSummary {
  imported?: number;
  updated?: number;
  skipped?: Array<{ studentCode: string; reason: string }>;
}

/**
 * Record marks for an assessment. Two entry paths, one destination: the
 * per-student grid saves a JSON upsert, the CSV upload saves the same upsert
 * server-side. Both reload the page so the roster reflects what is stored.
 */
export function MarksEditor({ assessmentId, students, maxMarks }: MarksEditorProps) {
  const router = useRouter();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [marks, setMarks] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const s of students) {
      if (s.marks !== null) initial[s.id] = String(s.marks);
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploadDetail, setUploadDetail] = useState<UploadSummary | null>(null);

  const editable = useMemo(() => students.filter((s) => s.marks === null), [students]);

  const handleSave = async () => {
    setFormError(null);
    setSaving(true);
    try {
      const results = students
        .filter((s) => marks[s.id] !== undefined && marks[s.id]?.trim() !== '')
        .map((s) => ({ studentId: s.id, marks: Number(marks[s.id]) }));

      if (results.length === 0) {
        setFormError('Enter at least one mark before saving.');
        return;
      }
      const outOfRange = results.find((r) => r.marks > maxMarks);
      if (outOfRange) {
        setFormError(`Marks cannot exceed the maximum of ${maxMarks}.`);
        return;
      }

      const response = await fetch(`/api/results/${assessmentId}/marks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results }),
      });

      if (response.ok) {
        toast.success('Marks saved', `${results.length} recorded or updated.`);
        router.refresh();
        return;
      }
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(payload?.error?.message ?? 'Could not save the marks.');
    } catch (err) {
      toast.error('Marks not saved', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (file: File) => {
    setFormError(null);
    setUploadDetail(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`/api/results/${assessmentId}/upload`, {
        method: 'POST',
        body,
      });

      if (response.ok) {
        const summary = (await response.json()) as UploadSummary;
        setUploadDetail(summary);
        const skipped = summary.skipped?.length ?? 0;
        toast.success(
          'Marks uploaded',
          `${summary.imported ?? 0} new, ${summary.updated ?? 0} updated${skipped > 0 ? `, ${skipped} skipped` : ''}.`,
        );
        router.refresh();
        return;
      }
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(payload?.error?.message ?? 'Could not upload the file.');
    } catch (err) {
      toast.error('Upload failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="marks-csv">Upload a class-roll CSV</Label>
            <div className="flex items-center gap-3">
              <input
                ref={fileInput}
                id="marks-csv"
                type="file"
                accept=".csv,text/csv"
                disabled={uploading}
                className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-secondary/80"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUpload(file);
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
              >
                <IconUpload />
                {uploading ? 'Uploading…' : 'Choose file'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              One line per student: <code>student_code,marks</code>. An optional header row is
              ignored; unknown students are reported below, never guessed.
            </p>
          </div>
        </div>

        {formError ? <Alert variant="destructive" title={formError} /> : null}

        {uploadDetail ? (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="font-medium">
              Uploaded {uploadDetail.imported ?? 0} new and updated {uploadDetail.updated ?? 0}.
            </p>
            {(uploadDetail.skipped ?? []).length > 0 ? (
              <ul className="mt-2 list-inside list-disc space-y-0.5 text-muted-foreground">
                {uploadDetail.skipped!.map((s, i) => (
                  <li key={`${s.studentCode}-${i}`}>
                    {s.studentCode} — {s.reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Code</TableHead>
              <TableHead className="text-right">Mark (max {maxMarks})</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.fullName}</TableCell>
                <TableCell className="tabular-nums">{s.studentCode}</TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    min="0"
                    max={maxMarks}
                    step="0.5"
                    value={marks[s.id] ?? ''}
                    placeholder="—"
                    aria-label={`Mark for ${s.fullName}`}
                    className="ml-auto w-28 text-right tabular-nums"
                    onChange={(e) => setMarks((prev) => ({ ...prev, [s.id]: e.target.value }))}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-3">
        {editable.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Every student already has a mark — edit a cell to correct it.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {editable.length} students still unmarked.
          </p>
        )}
        <Button type="button" onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Saving…' : 'Save marks'}
        </Button>
      </div>
    </div>
  );
}
