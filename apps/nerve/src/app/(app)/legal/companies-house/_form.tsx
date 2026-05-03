import { Field, TextInput, TextArea, SubmitButton } from "@/components/Form";
import { format } from "date-fns";
import Link from "next/link";

export function CHForm({
  action, initial, cancelHref, submitLabel = "Save",
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: { filingType?: string; description?: string; date?: Date | string; reference?: string | null };
  cancelHref: string; submitLabel?: string;
}) {
  const date = initial?.date
    ? typeof initial.date === "string" ? initial.date.slice(0, 10) : format(initial.date, "yyyy-MM-dd")
    : format(new Date(), "yyyy-MM-dd");
  return (
    <form action={action} className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-3 gap-3">
        <Field label="filing type" required hint="e.g. CS01, AP01, incorporation"><TextInput name="filingType" required defaultValue={initial?.filingType ?? ""} /></Field>
        <Field label="date" required><TextInput type="date" name="date" required defaultValue={date} /></Field>
        <Field label="reference"><TextInput name="reference" defaultValue={initial?.reference ?? ""} /></Field>
      </div>
      <Field label="description" required><TextArea name="description" rows={5} required defaultValue={initial?.description ?? ""} /></Field>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="font-sans text-sm text-fg-muted hover:text-fg px-3 py-1.5">Cancel</Link>
      </div>
    </form>
  );
}
