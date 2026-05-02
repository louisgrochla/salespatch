import { Field, TextInput, Select, SubmitButton } from "@/components/Form";
import { format } from "date-fns";
import Link from "next/link";

interface SectionOption { id: string; chapter: string }

interface InitialValues {
  milestone?: string;
  deadline?: Date | string;
  status?: string;
  dissertationSectionId?: string | null;
}

export function CalendarForm({
  action, initial, sections, cancelHref, submitLabel = "Save",
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: InitialValues;
  sections: SectionOption[];
  cancelHref: string;
  submitLabel?: string;
}) {
  const deadline = initial?.deadline
    ? typeof initial.deadline === "string" ? initial.deadline.slice(0, 10)
      : format(initial.deadline, "yyyy-MM-dd")
    : "";

  return (
    <form action={action} className="space-y-4 max-w-3xl">
      <Field label="milestone" required>
        <TextInput name="milestone" required defaultValue={initial?.milestone ?? ""} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="deadline" required>
          <TextInput type="date" name="deadline" required defaultValue={deadline} />
        </Field>
        <Field label="status">
          <Select name="status" defaultValue={initial?.status ?? "pending"}>
            <option value="pending">pending</option>
            <option value="in_progress">in progress</option>
            <option value="done">done</option>
            <option value="missed">missed</option>
          </Select>
        </Field>
        <Field label="linked section">
          <Select name="dissertationSectionId" defaultValue={initial?.dissertationSectionId ?? ""}>
            <option value="">—</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.chapter}</option>)}
          </Select>
        </Field>
      </div>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="font-sans text-sm text-fg-muted hover:text-fg px-3 py-1.5">Cancel</Link>
      </div>
    </form>
  );
}
