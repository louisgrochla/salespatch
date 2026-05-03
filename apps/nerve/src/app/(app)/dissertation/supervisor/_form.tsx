import { Field, TextInput, TextArea, SubmitButton } from "@/components/Form";
import { format } from "date-fns";
import Link from "next/link";

interface InitialValues {
  date?: Date | string;
  notes?: string | null;
  feedback?: string | null;
  agreedActions?: string | null;
  followUpStatus?: string | null;
}

export function MeetingForm({
  action, initial, cancelHref, submitLabel = "Save",
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: InitialValues;
  cancelHref: string;
  submitLabel?: string;
}) {
  const date = initial?.date
    ? typeof initial.date === "string" ? initial.date.slice(0, 16)
      : format(initial.date, "yyyy-MM-dd'T'HH:mm")
    : format(new Date(), "yyyy-MM-dd'T'HH:mm");

  return (
    <form action={action} className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-2 gap-3">
        <Field label="meeting date" required>
          <TextInput type="datetime-local" name="date" required defaultValue={date} />
        </Field>
        <Field label="follow-up status" hint="e.g. pending / done / blocked">
          <TextInput name="followUpStatus" defaultValue={initial?.followUpStatus ?? ""} />
        </Field>
      </div>
      <Field label="notes">
        <TextArea name="notes" rows={6} defaultValue={initial?.notes ?? ""} />
      </Field>
      <Field label="feedback">
        <TextArea name="feedback" rows={5} defaultValue={initial?.feedback ?? ""} />
      </Field>
      <Field label="agreed actions">
        <TextArea name="agreedActions" rows={4} defaultValue={initial?.agreedActions ?? ""} />
      </Field>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="font-sans text-sm text-fg-muted hover:text-fg px-3 py-1.5">Cancel</Link>
      </div>
    </form>
  );
}
