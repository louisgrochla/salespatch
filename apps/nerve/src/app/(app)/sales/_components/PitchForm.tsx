import { Field, TextInput, TextArea, Select, Checkbox, SubmitButton } from "@/components/Form";
import { format } from "date-fns";
import Link from "next/link";

interface InitialValues {
  date?: Date | string;
  businessName?: string;
  businessType?: string | null;
  sector?: string | null;
  location?: string | null;
  leadSource?: string | null;
  demoVersion?: string | null;
  outcome?: "closed" | "rejected" | "follow_up";
  contractorId?: string | null;
  pitchDuration?: number | null;
  consentFlag?: boolean;
  notes?: string | null;
  objections?: string[];
}

export function PitchForm({
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
  const date = initial?.date
    ? typeof initial.date === "string"
      ? initial.date.slice(0, 16)
      : format(initial.date, "yyyy-MM-dd'T'HH:mm")
    : format(new Date(), "yyyy-MM-dd'T'HH:mm");

  return (
    <form action={action} className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-2 gap-3">
        <Field label="business name" required>
          <TextInput name="businessName" required defaultValue={initial?.businessName ?? ""} />
        </Field>
        <Field label="date / time" required>
          <TextInput type="datetime-local" name="date" required defaultValue={date} />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="business type">
          <TextInput name="businessType" placeholder="pub, salon, garage…"
            defaultValue={initial?.businessType ?? ""} />
        </Field>
        <Field label="sector">
          <TextInput name="sector" placeholder="hospitality, retail…"
            defaultValue={initial?.sector ?? ""} />
        </Field>
        <Field label="location">
          <TextInput name="location" placeholder="Aberdeen, AB10"
            defaultValue={initial?.location ?? ""} />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="outcome" required>
          <Select name="outcome" required defaultValue={initial?.outcome ?? "follow_up"}>
            <option value="closed">closed</option>
            <option value="rejected">rejected</option>
            <option value="follow_up">follow_up</option>
          </Select>
        </Field>
        <Field label="lead source">
          <TextInput name="leadSource" placeholder="walk-by, referral…"
            defaultValue={initial?.leadSource ?? ""} />
        </Field>
        <Field label="demo version">
          <TextInput name="demoVersion" placeholder="v1, v2…"
            defaultValue={initial?.demoVersion ?? ""} />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="contractor id">
          <TextInput name="contractorId" placeholder="sp-louis"
            defaultValue={initial?.contractorId ?? ""} />
        </Field>
        <Field label="duration (seconds)">
          <TextInput type="number" min={0} name="pitchDuration"
            defaultValue={initial?.pitchDuration ?? ""} />
        </Field>
        <Field label="consent">
          <div className="mt-2">
            <Checkbox name="consentFlag" label="GDPR consent recorded"
              defaultChecked={initial?.consentFlag ?? false} />
          </div>
        </Field>
      </div>

      <Field label="objections (comma-separated)" hint="Free-form tags. New names get added; existing ones reused.">
        <TextInput name="objections" placeholder="price, timing, already has a website"
          defaultValue={(initial?.objections ?? []).join(", ")} />
      </Field>

      <Field label="notes">
        <TextArea name="notes" rows={6} defaultValue={initial?.notes ?? ""} />
      </Field>

      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link
          href={cancelHref}
          className="font-sans text-sm text-fg-muted hover:text-fg px-3 py-1.5"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
