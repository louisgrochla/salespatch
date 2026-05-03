import { Field, TextInput, TextArea, SubmitButton } from "@/components/Form";
import Link from "next/link";

export function TermForm({
  action, initial, cancelHref, submitLabel = "Save",
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: { term?: string; definition?: string; context?: string | null };
  cancelHref: string; submitLabel?: string;
}) {
  return (
    <form action={action} className="space-y-4 max-w-2xl">
      <Field label="term" required><TextInput name="term" required defaultValue={initial?.term ?? ""} /></Field>
      <Field label="definition" required><TextArea name="definition" rows={4} required defaultValue={initial?.definition ?? ""} /></Field>
      <Field label="context"><TextArea name="context" rows={3} defaultValue={initial?.context ?? ""} /></Field>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="font-sans text-sm text-fg-muted hover:text-fg px-3 py-1.5">Cancel</Link>
      </div>
    </form>
  );
}
