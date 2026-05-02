import { Field, TextInput, TextArea, SubmitButton } from "@/components/Form";
import Link from "next/link";

export function BrandForm({
  action, initial, cancelHref, submitLabel = "Save",
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: { title?: string; body?: string };
  cancelHref: string; submitLabel?: string;
}) {
  return (
    <form action={action} className="space-y-4 max-w-3xl">
      <Field label="title" required><TextInput name="title" required defaultValue={initial?.title ?? ""} /></Field>
      <Field label="body (markdown)" required><TextArea name="body" rows={20} required defaultValue={initial?.body ?? ""} /></Field>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="font-sans text-sm text-fg-muted hover:text-fg px-3 py-1.5">Cancel</Link>
      </div>
    </form>
  );
}
