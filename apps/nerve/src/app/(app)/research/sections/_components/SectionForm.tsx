"use client";

import { Field, TextInput, TextArea, Select, SubmitButton, Checkbox } from "@/components/Form";
import { countWords } from "@/lib/words";
import Link from "next/link";
import { useMemo, useState } from "react";

export interface LiteratureOption {
  id: string;
  title: string;
  authors: string;
  year: number | null;
}

interface InitialValues {
  chapter?: string;
  content?: string;
  status?: "not_started" | "draft" | "in_progress" | "complete";
  wordCountTarget?: number | null;
  supervisorFeedback?: string | null;
  literatureIds?: string[];
}

export function SectionForm({
  action,
  initial,
  literatureOptions,
  cancelHref,
  submitLabel = "Save",
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: InitialValues;
  literatureOptions: LiteratureOption[];
  cancelHref: string;
  submitLabel?: string;
}) {
  const [content, setContent] = useState(initial?.content ?? "");
  const wordCount = useMemo(() => countWords(content), [content]);
  const target = initial?.wordCountTarget ?? null;
  const pct = target && target > 0 ? Math.min(1, wordCount / target) : null;

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Field label="chapter" required hint="Unique label, e.g. Methodology, Findings, Discussion.">
          <TextInput name="chapter" required defaultValue={initial?.chapter ?? ""} />
        </Field>
        <Field label="status" required>
          <Select name="status" required defaultValue={initial?.status ?? "draft"}>
            <option value="not_started">not started</option>
            <option value="draft">draft</option>
            <option value="in_progress">in progress</option>
            <option value="complete">complete</option>
          </Select>
        </Field>
        <Field label="word count target">
          <TextInput type="number" min={0} name="wordCountTarget"
            defaultValue={initial?.wordCountTarget ?? ""} />
        </Field>
      </div>

      <Field label="content (markdown)"
        hint={
          <span>
            <span className="font-mono">{wordCount.toLocaleString()}</span> words
            {target ? <> · target <span className="font-mono">{target.toLocaleString()}</span> · <span className="font-mono">{(pct! * 100).toFixed(0)}%</span></> : null}
          </span>
        }>
        <TextArea name="content" rows={24} value={content} onChange={(e) => setContent(e.target.value)} />
      </Field>

      <Field label="supervisor feedback">
        <TextArea name="supervisorFeedback" rows={5} defaultValue={initial?.supervisorFeedback ?? ""} />
      </Field>

      <Field label="linked literature">
        {literatureOptions.length === 0 ? (
          <div className="font-mono text-2xs text-fg-dim mt-1">
            No literature in the library yet. Add some at /research/literature first.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1 mt-1 border border-border bg-bg-panel max-h-64 overflow-y-auto p-2">
            {literatureOptions.map((l) => (
              <Checkbox
                key={l.id}
                name="literatureIds"
                value={l.id}
                defaultChecked={initial?.literatureIds?.includes(l.id) ?? false}
                label={`${l.authors} (${l.year ?? "n.d."}) — ${l.title}`}
              />
            ))}
          </div>
        )}
      </Field>

      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="font-sans text-sm text-fg-muted hover:text-fg px-3 py-1.5">
          Cancel
        </Link>
      </div>
    </form>
  );
}
