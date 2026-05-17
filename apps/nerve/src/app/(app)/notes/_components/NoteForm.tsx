"use client";

import { Field, TextInput, TextArea, Select, SubmitButton } from "@/components/Form";
import Link from "next/link";

type Scope = "lead" | "system" | "pitch" | "research" | "other";

interface InitialValues {
  title?: string;
  scope?: Scope;
  body?: string | null;
  relatedSlug?: string | null;
  tags?: string[];
}

export function NoteForm({
  action,
  initial,
  cancelHref,
  submitLabel = "Save",
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: InitialValues;
  cancelHref: string;
  submitLabel?: string;
}) {
  return (
    <form action={action} className="space-y-4 max-w-3xl">
      <Field label="title" required>
        <TextInput name="title" required defaultValue={initial?.title ?? ""} maxLength={200} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="scope" required hint="Filters /api/read/notes — pick what kind of context this carries.">
          <Select name="scope" required defaultValue={initial?.scope ?? "system"}>
            <option value="lead">lead — about a specific demo/lead</option>
            <option value="system">system — NERVE / agents / pipeline</option>
            <option value="pitch">pitch — sales interaction / objection</option>
            <option value="research">research — dissertation / methodology</option>
            <option value="other">other</option>
          </Select>
        </Field>
        <Field label="related slug" hint="Canonical lead slug (e.g. the-tartan-pig). Optional unless scope=lead.">
          <TextInput
            name="relatedSlug"
            placeholder="the-tartan-pig"
            defaultValue={initial?.relatedSlug ?? ""}
          />
        </Field>
      </div>

      <Field label="body" required hint="Markdown. Embeds on save → searchable via /search and /ask.">
        <TextArea name="body" rows={18} required defaultValue={initial?.body ?? ""} />
      </Field>

      <Field label="tags (comma-separated)">
        <TextInput
          name="tags"
          placeholder="qa-visual, follow-up, hardcoded-live"
          defaultValue={(initial?.tags ?? []).join(", ")}
        />
      </Field>

      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link
          href={cancelHref}
          className="font-sans text-sm text-fg-muted hover:text-fg px-3 py-1.5"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
