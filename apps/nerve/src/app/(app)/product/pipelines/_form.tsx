import { Field, TextInput, TextArea, SubmitButton } from "@/components/Form";
import Link from "next/link";

interface InitialValues {
  name?: string; description?: string; version?: string; performanceNotes?: string | null;
}
export function PipelineForm({
  action, initial, cancelHref, submitLabel = "Save",
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: InitialValues; cancelHref: string; submitLabel?: string;
}) {
  return (
    <form action={action} className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-2 gap-3">
        <Field label="name" required><TextInput name="name" required defaultValue={initial?.name ?? ""} /></Field>
        <Field label="version" required><TextInput name="version" required defaultValue={initial?.version ?? ""} /></Field>
      </div>
      <Field label="description" required><TextArea name="description" rows={6} required defaultValue={initial?.description ?? ""} /></Field>
      <Field label="performance notes"><TextArea name="performanceNotes" rows={5} defaultValue={initial?.performanceNotes ?? ""} /></Field>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="font-sans text-sm text-fg-muted hover:text-fg px-3 py-1.5">Cancel</Link>
      </div>
    </form>
  );
}
