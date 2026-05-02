import { Field, TextInput, TextArea, Select, SubmitButton } from "@/components/Form";
import Link from "next/link";
import { EVIDENCE_SOURCE_TYPES } from "./_types";

interface SectionOption { id: string; chapter: string }

interface InitialValues {
  sourceType?: string;
  sourceId?: string;
  dissertationSectionId?: string | null;
  annotation?: string;
}

export function EvidenceForm({
  action,
  initial,
  sections,
  cancelHref,
  submitLabel = "Save",
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: InitialValues;
  sections: SectionOption[];
  cancelHref: string;
  submitLabel?: string;
}) {
  return (
    <form action={action} className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-2 gap-3">
        <Field label="source type" required hint="Which NERVE table this evidence points at.">
          <Select name="sourceType" required defaultValue={initial?.sourceType ?? "PitchLog"}>
            {EVIDENCE_SOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="source id" required hint="The cuid of the row. Copy from the relevant detail page URL.">
          <TextInput name="sourceId" required defaultValue={initial?.sourceId ?? ""} />
        </Field>
      </div>
      <Field label="dissertation section" hint="Which chapter this evidence supports.">
        <Select name="dissertationSectionId" defaultValue={initial?.dissertationSectionId ?? ""}>
          <option value="">—</option>
          {sections.map((s) => <option key={s.id} value={s.id}>{s.chapter}</option>)}
        </Select>
      </Field>
      <Field label="annotation" required hint="Why this is evidence. What argument it supports. Quote-ready text.">
        <TextArea name="annotation" rows={6} required defaultValue={initial?.annotation ?? ""} />
      </Field>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="font-sans text-sm text-fg-muted hover:text-fg px-3 py-1.5">
          Cancel
        </Link>
      </div>
    </form>
  );
}
