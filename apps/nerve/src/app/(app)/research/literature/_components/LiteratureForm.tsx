import { Field, TextInput, TextArea, Select, SubmitButton } from "@/components/Form";
import Link from "next/link";

interface InitialValues {
  title?: string;
  authors?: string;
  year?: number | null;
  url?: string | null;
  doi?: string | null;
  abstract?: string | null;
  themeTags?: string[];
  personalNotes?: string | null;
  position?: string | null;
}

const SUGGESTED_THEMES = [
  "algorithmic entrepreneurship",
  "platform economics and two-sided markets",
  "gig economy sustainability",
  "multi-agent systems in commercial applications",
  "AI in SME marketing and sales automation",
  "conversion rate optimisation",
  "distributed income models",
  "lean startup methodology",
];

export function LiteratureForm({
  action,
  initial,
  cancelHref,
  submitLabel = "Save",
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: InitialValues;
  cancelHref: string;
  submitLabel?: string;
}) {
  return (
    <form action={action} className="space-y-4 max-w-3xl">
      <Field label="title" required>
        <TextInput name="title" required defaultValue={initial?.title ?? ""} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="authors" required hint="e.g. Bauer, M. & Khan, R.">
          <TextInput name="authors" required defaultValue={initial?.authors ?? ""} />
        </Field>
        <Field label="year">
          <TextInput type="number" name="year" defaultValue={initial?.year ?? ""} />
        </Field>
        <Field label="position">
          <Select name="position" defaultValue={initial?.position ?? ""}>
            <option value="">—</option>
            <option value="supports">supports</option>
            <option value="challenges">challenges</option>
            <option value="contextualises">contextualises</option>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="url">
          <TextInput type="url" name="url" defaultValue={initial?.url ?? ""} />
        </Field>
        <Field label="doi">
          <TextInput name="doi" placeholder="10.xxxx/yyy" defaultValue={initial?.doi ?? ""} />
        </Field>
      </div>
      <Field label="abstract">
        <TextArea name="abstract" rows={6} defaultValue={initial?.abstract ?? ""} />
      </Field>
      <Field label="theme tags (comma-separated)"
        hint={
          <span>
            Suggested: {SUGGESTED_THEMES.map((t, i) => (
              <span key={t}>
                {i > 0 && ", "}
                <span className="text-fg-muted">{t}</span>
              </span>
            ))}
          </span>
        }>
        <TextInput name="themeTags" defaultValue={(initial?.themeTags ?? []).join(", ")} />
      </Field>
      <Field label="personal notes">
        <TextArea name="personalNotes" rows={5} defaultValue={initial?.personalNotes ?? ""} />
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
