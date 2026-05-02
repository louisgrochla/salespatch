import { Field, TextInput, TextArea, SubmitButton } from "@/components/Form";
import Link from "next/link";

export function ProcessForm({
  action, initial, cancelHref, submitLabel = "Save",
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: { name?: string; steps?: string };
  cancelHref: string; submitLabel?: string;
}) {
  return (
    <form action={action} className="space-y-4 max-w-3xl">
      <Field label="process name" required><TextInput name="name" required defaultValue={initial?.name ?? ""} /></Field>
      <Field label="steps (markdown — number them as a list)" required><TextArea name="steps" rows={20} required defaultValue={initial?.steps ?? ""} /></Field>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="font-sans text-sm text-fg-muted hover:text-fg px-3 py-1.5">Cancel</Link>
      </div>
    </form>
  );
}
