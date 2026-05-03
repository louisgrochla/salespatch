"use client";

import { Field, TextInput, TextArea, Select, SubmitButton } from "@/components/Form";
import { format } from "date-fns";
import Link from "next/link";
import { useState } from "react";

type LogType = "weekly" | "decision" | "failure" | "iteration";

interface InitialValues {
  date?: Date | string;
  type?: LogType;
  body?: string | null;
  decision?: string | null;
  reasoning?: string | null;
  outcome?: string | null;
  whatFailed?: string | null;
  why?: string | null;
  whatChanged?: string | null;
  beforeState?: string | null;
  afterState?: string | null;
  tags?: string[];
}

export function OperationsForm({
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
  const [type, setType] = useState<LogType>(initial?.type ?? "weekly");

  const date = initial?.date
    ? typeof initial.date === "string"
      ? initial.date.slice(0, 16)
      : format(initial.date, "yyyy-MM-dd'T'HH:mm")
    : format(new Date(), "yyyy-MM-dd'T'HH:mm");

  return (
    <form action={action} className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-2 gap-3">
        <Field label="type" required>
          <Select
            name="type"
            required
            value={type}
            onChange={(e) => setType(e.target.value as LogType)}
          >
            <option value="weekly">weekly — narrative log</option>
            <option value="decision">decision — what + why</option>
            <option value="failure">failure — root cause + change</option>
            <option value="iteration">iteration — before/after</option>
          </Select>
        </Field>
        <Field label="date / time" required>
          <TextInput type="datetime-local" name="date" required defaultValue={date} />
        </Field>
      </div>

      {type === "weekly" && (
        <Field label="body" hint="Markdown supported. The week's narrative.">
          <TextArea name="body" rows={14} defaultValue={initial?.body ?? ""} />
        </Field>
      )}

      {type === "decision" && (
        <>
          <Field label="decision" required>
            <TextArea name="decision" rows={3} required defaultValue={initial?.decision ?? ""} />
          </Field>
          <Field label="reasoning" hint="The why. What other options were considered?">
            <TextArea name="reasoning" rows={6} defaultValue={initial?.reasoning ?? ""} />
          </Field>
          <Field label="outcome" hint="Editable later — leave blank if too early to know.">
            <TextArea name="outcome" rows={4} defaultValue={initial?.outcome ?? ""} />
          </Field>
        </>
      )}

      {type === "failure" && (
        <>
          <Field label="what failed" required>
            <TextArea name="whatFailed" rows={3} required defaultValue={initial?.whatFailed ?? ""} />
          </Field>
          <Field label="why">
            <TextArea name="why" rows={4} defaultValue={initial?.why ?? ""} />
          </Field>
          <Field label="what changed in response">
            <TextArea name="whatChanged" rows={4} defaultValue={initial?.whatChanged ?? ""} />
          </Field>
        </>
      )}

      {type === "iteration" && (
        <>
          <Field label="what changed" required>
            <TextArea name="whatChanged" rows={3} required defaultValue={initial?.whatChanged ?? ""} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="before state">
              <TextArea name="beforeState" rows={6} defaultValue={initial?.beforeState ?? ""} />
            </Field>
            <Field label="after state">
              <TextArea name="afterState" rows={6} defaultValue={initial?.afterState ?? ""} />
            </Field>
          </div>
        </>
      )}

      <Field label="tags (comma-separated)">
        <TextInput name="tags" placeholder="onboarding, payments, demo-pipeline"
          defaultValue={(initial?.tags ?? []).join(", ")} />
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
