import { Field, TextInput, TextArea, SubmitButton } from "@/components/Form";
import Link from "next/link";
import { format } from "date-fns";

interface InitialValues {
  name?: string;
  startDate?: Date | string;
  endDate?: Date | string | null;
  operationalDescription?: string;
}

export function PhaseForm({
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
  const startDate = initial?.startDate
    ? typeof initial.startDate === "string"
      ? initial.startDate.slice(0, 10)
      : format(initial.startDate, "yyyy-MM-dd")
    : format(new Date(), "yyyy-MM-dd");

  const endDate =
    initial?.endDate == null
      ? ""
      : typeof initial.endDate === "string"
        ? initial.endDate.slice(0, 10)
        : format(initial.endDate, "yyyy-MM-dd");

  return (
    <form action={action} className="space-y-4 max-w-3xl">
      <Field label="phase name" required hint='Methodology timeline anchor — e.g. "Phase 1", "Phase 2".'>
        <TextInput name="name" required defaultValue={initial?.name ?? ""} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="start date" required>
          <TextInput type="date" name="startDate" required defaultValue={startDate} />
        </Field>
        <Field label="end date" hint="Leave blank for the current phase.">
          <TextInput type="date" name="endDate" defaultValue={endDate} />
        </Field>
      </div>
      <Field label="operational description" required
        hint="Plain English description of the operational state during this phase. This becomes citable methodology text.">
        <TextArea name="operationalDescription" rows={6} required
          defaultValue={initial?.operationalDescription ?? ""} />
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
