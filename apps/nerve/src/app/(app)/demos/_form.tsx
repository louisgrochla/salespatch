import { Field, TextInput, TextArea, Select, SubmitButton } from "@/components/Form";
import { format } from "date-fns";
import Link from "next/link";

interface InitialValues {
  businessName?: string;
  sector?: string | null;
  url?: string | null;
  fileReference?: string | null;
  dateBuilt?: Date | string;
  templateVersion?: string | null;
  conversionOutcome?: string | null;
  notes?: string | null;
}

export function DemoForm({
  action, initial, cancelHref, submitLabel = "Save",
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: InitialValues; cancelHref: string; submitLabel?: string;
}) {
  const dateBuilt = initial?.dateBuilt
    ? typeof initial.dateBuilt === "string" ? initial.dateBuilt.slice(0, 10)
      : format(initial.dateBuilt, "yyyy-MM-dd")
    : format(new Date(), "yyyy-MM-dd");

  return (
    <form action={action} className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-3 gap-3">
        <Field label="business name" required>
          <TextInput name="businessName" required defaultValue={initial?.businessName ?? ""} />
        </Field>
        <Field label="sector"><TextInput name="sector" defaultValue={initial?.sector ?? ""} /></Field>
        <Field label="date built" required>
          <TextInput type="date" name="dateBuilt" required defaultValue={dateBuilt} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="url"><TextInput type="url" name="url" defaultValue={initial?.url ?? ""} /></Field>
        <Field label="file reference" hint="If hosted as a file rather than a URL.">
          <TextInput name="fileReference" defaultValue={initial?.fileReference ?? ""} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="template version" hint="e.g. v1, v2 — drives the template-performance breakdown.">
          <TextInput name="templateVersion" defaultValue={initial?.templateVersion ?? ""} />
        </Field>
        <Field label="conversion outcome">
          <Select name="conversionOutcome" defaultValue={initial?.conversionOutcome ?? ""}>
            <option value="">unpitched</option>
            <option value="closed">closed</option>
            <option value="rejected">rejected</option>
            <option value="follow_up">follow_up</option>
          </Select>
        </Field>
      </div>
      <Field label="notes"><TextArea name="notes" rows={5} defaultValue={initial?.notes ?? ""} /></Field>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="font-sans text-sm text-fg-muted hover:text-fg px-3 py-1.5">Cancel</Link>
      </div>
    </form>
  );
}
