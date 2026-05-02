import { Field, TextInput, TextArea, SubmitButton } from "@/components/Form";
import { format } from "date-fns";
import Link from "next/link";

interface InitialValues {
  title?: string; body?: string; version?: string;
  date?: Date | string; tags?: string[];
}

export function ArchitectureForm({
  action, initial, cancelHref, submitLabel = "Save",
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: InitialValues; cancelHref: string; submitLabel?: string;
}) {
  const date = initial?.date
    ? typeof initial.date === "string" ? initial.date.slice(0, 10)
      : format(initial.date, "yyyy-MM-dd")
    : format(new Date(), "yyyy-MM-dd");

  return (
    <form action={action} className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-3 gap-3">
        <Field label="title" required><TextInput name="title" required defaultValue={initial?.title ?? ""} /></Field>
        <Field label="version" required><TextInput name="version" required defaultValue={initial?.version ?? ""} /></Field>
        <Field label="date" required><TextInput type="date" name="date" required defaultValue={date} /></Field>
      </div>
      <Field label="body (markdown)" required>
        <TextArea name="body" rows={20} required defaultValue={initial?.body ?? ""} />
      </Field>
      <Field label="tags (comma-separated)">
        <TextInput name="tags" defaultValue={(initial?.tags ?? []).join(", ")} />
      </Field>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="font-sans text-sm text-fg-muted hover:text-fg px-3 py-1.5">Cancel</Link>
      </div>
    </form>
  );
}
