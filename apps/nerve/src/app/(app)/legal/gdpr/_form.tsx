import { Field, TextInput, TextArea, SubmitButton } from "@/components/Form";
import Link from "next/link";

export function GdprForm({
  action, initial, cancelHref, submitLabel = "Save",
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: { dataType?: string; collectionMethod?: string; retentionPeriod?: string; legalBasis?: string };
  cancelHref: string; submitLabel?: string;
}) {
  return (
    <form action={action} className="space-y-4 max-w-2xl">
      <Field label="data type" required hint="e.g. business name + contractor id, contractor email"><TextInput name="dataType" required defaultValue={initial?.dataType ?? ""} /></Field>
      <Field label="collection method" required hint="e.g. iOS app pitch form with consent toggle"><TextArea name="collectionMethod" rows={3} required defaultValue={initial?.collectionMethod ?? ""} /></Field>
      <Field label="retention period" required hint="e.g. 7 years for dissertation evidence; deletable on request"><TextInput name="retentionPeriod" required defaultValue={initial?.retentionPeriod ?? ""} /></Field>
      <Field label="legal basis" required hint="e.g. consent, legitimate interest, contract"><TextArea name="legalBasis" rows={3} required defaultValue={initial?.legalBasis ?? ""} /></Field>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="font-sans text-sm text-fg-muted hover:text-fg px-3 py-1.5">Cancel</Link>
      </div>
    </form>
  );
}
