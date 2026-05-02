import { Field, TextInput, TextArea, SubmitButton } from "@/components/Form";
import { format } from "date-fns";
import Link from "next/link";

interface InitialValues {
  date?: Date | string;
  dealReference?: string | null;
  amount?: number | string | null;
  notes?: string | null;
}

export function RevenueForm({
  action, initial, cancelHref, submitLabel = "Save",
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: InitialValues;
  cancelHref: string;
  submitLabel?: string;
}) {
  const date = initial?.date
    ? typeof initial.date === "string" ? initial.date.slice(0, 10)
      : format(initial.date, "yyyy-MM-dd")
    : format(new Date(), "yyyy-MM-dd");

  return (
    <form action={action} className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-3 gap-3">
        <Field label="date" required>
          <TextInput type="date" name="date" required defaultValue={date} />
        </Field>
        <Field label="amount (£)" required>
          <TextInput type="number" step="0.01" min="0" name="amount" required
            defaultValue={initial?.amount?.toString() ?? ""} />
        </Field>
        <Field label="deal reference" hint="Optional. Used to tie revenue to a pitch / contract.">
          <TextInput name="dealReference" defaultValue={initial?.dealReference ?? ""} />
        </Field>
      </div>
      <Field label="notes">
        <TextArea name="notes" rows={5} defaultValue={initial?.notes ?? ""} />
      </Field>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="font-sans text-sm text-fg-muted hover:text-fg px-3 py-1.5">Cancel</Link>
      </div>
    </form>
  );
}
