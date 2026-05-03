import { Field, TextInput, TextArea, Select, Checkbox, SubmitButton } from "@/components/Form";
import Link from "next/link";

interface InitialValues {
  name?: string;
  type?: string | null;
  sector?: string | null;
  location?: string | null;
  contactedStatus?: "not_contacted" | "contacted" | "pitched" | "closed" | "rejected";
  sourceMethod?: string | null;
  doNotContact?: boolean;
  notes?: string | null;
}

export function LeadForm({
  action, initial, cancelHref, submitLabel = "Save",
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: InitialValues; cancelHref: string; submitLabel?: string;
}) {
  return (
    <form action={action} className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-3 gap-3">
        <Field label="business name" required>
          <TextInput name="name" required defaultValue={initial?.name ?? ""} />
        </Field>
        <Field label="type"><TextInput name="type" placeholder="pub, salon, garage…" defaultValue={initial?.type ?? ""} /></Field>
        <Field label="sector"><TextInput name="sector" defaultValue={initial?.sector ?? ""} /></Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="location"><TextInput name="location" defaultValue={initial?.location ?? ""} /></Field>
        <Field label="status">
          <Select name="contactedStatus" defaultValue={initial?.contactedStatus ?? "not_contacted"}>
            <option value="not_contacted">not contacted</option>
            <option value="contacted">contacted</option>
            <option value="pitched">pitched</option>
            <option value="closed">closed</option>
            <option value="rejected">rejected</option>
          </Select>
        </Field>
        <Field label="source method" hint="e.g. Claude search, walk-by, referral">
          <TextInput name="sourceMethod" defaultValue={initial?.sourceMethod ?? ""} />
        </Field>
      </div>
      <Field label="do not contact" hint="Suppresses this lead from any future outreach lists.">
        <div className="mt-2"><Checkbox name="doNotContact" label="never contact" defaultChecked={initial?.doNotContact ?? false} /></div>
      </Field>
      <Field label="notes"><TextArea name="notes" rows={5} defaultValue={initial?.notes ?? ""} /></Field>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="font-sans text-sm text-fg-muted hover:text-fg px-3 py-1.5">Cancel</Link>
      </div>
    </form>
  );
}
