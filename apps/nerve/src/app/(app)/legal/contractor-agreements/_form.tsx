import { Field, TextInput, TextArea, SubmitButton } from "@/components/Form";
import { format } from "date-fns";
import Link from "next/link";

export function AgreementForm({
  action, initial, cancelHref, submitLabel = "Save",
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: { version?: string; date?: Date | string; content?: string };
  cancelHref: string; submitLabel?: string;
}) {
  const date = initial?.date
    ? typeof initial.date === "string" ? initial.date.slice(0, 10) : format(initial.date, "yyyy-MM-dd")
    : format(new Date(), "yyyy-MM-dd");
  return (
    <form action={action} className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-2 gap-3">
        <Field label="version" required hint="Stable version label, e.g. 2026-05-01"><TextInput name="version" required defaultValue={initial?.version ?? ""} /></Field>
        <Field label="date" required><TextInput type="date" name="date" required defaultValue={date} /></Field>
      </div>
      <Field label="content (markdown)" required><TextArea name="content" rows={20} required defaultValue={initial?.content ?? ""} /></Field>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="font-sans text-sm text-fg-muted hover:text-fg px-3 py-1.5">Cancel</Link>
      </div>
    </form>
  );
}
