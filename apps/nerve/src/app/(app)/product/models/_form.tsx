import { Field, TextInput, TextArea, SubmitButton } from "@/components/Form";
import Link from "next/link";

interface InitialValues {
  name?: string; purpose?: string;
  trainingDetails?: string | null;
  costPerCycle?: number | string | null;
}
export function ModelForm({
  action, initial, cancelHref, submitLabel = "Save",
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: InitialValues; cancelHref: string; submitLabel?: string;
}) {
  return (
    <form action={action} className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-3 gap-3">
        <Field label="model name" required hint="e.g. claude-sonnet-4-6, gpt-4o, in-house-XGB">
          <TextInput name="name" required defaultValue={initial?.name ?? ""} />
        </Field>
        <Field label="purpose" required><TextInput name="purpose" required defaultValue={initial?.purpose ?? ""} /></Field>
        <Field label="cost per cycle (£)"><TextInput type="number" step="0.0001" name="costPerCycle" defaultValue={initial?.costPerCycle?.toString() ?? ""} /></Field>
      </div>
      <Field label="training details"><TextArea name="trainingDetails" rows={8} defaultValue={initial?.trainingDetails ?? ""} /></Field>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="font-sans text-sm text-fg-muted hover:text-fg px-3 py-1.5">Cancel</Link>
      </div>
    </form>
  );
}
