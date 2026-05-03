import { Field, TextInput, TextArea, SubmitButton } from "@/components/Form";
import Link from "next/link";

interface InitialValues {
  name?: string;
  fullText?: string;
  model?: string;
  performanceNotes?: string | null;
  tags?: string[];
}

export function PromptForm({
  action, initial, cancelHref, submitLabel = "Save",
  nameDisabled = false,
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: InitialValues;
  cancelHref: string;
  submitLabel?: string;
  nameDisabled?: boolean;
}) {
  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Field label="name" required hint="Stable identifier. Renames are not currently supported.">
          <TextInput name="name" required defaultValue={initial?.name ?? ""} disabled={nameDisabled} />
        </Field>
        <Field label="model" required hint='e.g. "claude-sonnet-4-6", "gpt-4o", "gemini-2.0".'>
          <TextInput name="model" required defaultValue={initial?.model ?? ""} />
        </Field>
        <Field label="tags (comma-separated)">
          <TextInput name="tags" placeholder="outreach, qualification, demo-gen"
            defaultValue={(initial?.tags ?? []).join(", ")} />
        </Field>
      </div>

      <Field label="full prompt text" required
        hint="A new PromptVersion is appended whenever this body OR model changes. Performance notes alone don't bump the version.">
        <TextArea name="fullText" rows={20} required defaultValue={initial?.fullText ?? ""} />
      </Field>

      <Field label="performance notes" hint="Free-form. Capture observed behaviour for THIS version of the prompt.">
        <TextArea name="performanceNotes" rows={5} defaultValue={initial?.performanceNotes ?? ""} />
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
