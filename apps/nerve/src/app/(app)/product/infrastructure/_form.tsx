import { Field, TextInput, TextArea, SubmitButton } from "@/components/Form";
import { format } from "date-fns";
import Link from "next/link";

interface InitialValues {
  serviceName?: string; purpose?: string;
  configNotes?: string | null; date?: Date | string;
}

export function InfraForm({
  action, initial, cancelHref, submitLabel = "Save",
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: InitialValues; cancelHref: string; submitLabel?: string;
}) {
  const date = initial?.date
    ? typeof initial.date === "string" ? initial.date.slice(0, 10) : format(initial.date, "yyyy-MM-dd")
    : format(new Date(), "yyyy-MM-dd");

  return (
    <form action={action} className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-3 gap-3">
        <Field label="service name" required><TextInput name="serviceName" required defaultValue={initial?.serviceName ?? ""} /></Field>
        <Field label="purpose" required><TextInput name="purpose" required defaultValue={initial?.purpose ?? ""} /></Field>
        <Field label="date" required><TextInput type="date" name="date" required defaultValue={date} /></Field>
      </div>
      <Field label="config notes"><TextArea name="configNotes" rows={10} defaultValue={initial?.configNotes ?? ""} /></Field>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="font-sans text-sm text-fg-muted hover:text-fg px-3 py-1.5">Cancel</Link>
      </div>
    </form>
  );
}
