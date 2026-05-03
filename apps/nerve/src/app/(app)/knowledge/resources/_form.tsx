import { Field, TextInput, TextArea, SubmitButton } from "@/components/Form";
import Link from "next/link";

export function ResourceForm({
  action, initial, cancelHref, submitLabel = "Save",
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: { toolName?: string; url?: string; purpose?: string; notes?: string | null };
  cancelHref: string; submitLabel?: string;
}) {
  return (
    <form action={action} className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-2 gap-3">
        <Field label="tool name" required><TextInput name="toolName" required defaultValue={initial?.toolName ?? ""} /></Field>
        <Field label="url" required><TextInput type="url" name="url" required defaultValue={initial?.url ?? ""} /></Field>
      </div>
      <Field label="purpose" required><TextInput name="purpose" required defaultValue={initial?.purpose ?? ""} /></Field>
      <Field label="notes"><TextArea name="notes" rows={4} defaultValue={initial?.notes ?? ""} /></Field>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="font-sans text-sm text-fg-muted hover:text-fg px-3 py-1.5">Cancel</Link>
      </div>
    </form>
  );
}
