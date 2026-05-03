import { Field, TextInput, TextArea, Select, SubmitButton } from "@/components/Form";
import { format } from "date-fns";
import Link from "next/link";

export function IpForm({
  action, initial, cancelHref, submitLabel = "Save",
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: { type?: string; title?: string; description?: string | null; date?: Date | string; reference?: string | null };
  cancelHref: string; submitLabel?: string;
}) {
  const date = initial?.date
    ? typeof initial.date === "string" ? initial.date.slice(0, 10) : format(initial.date, "yyyy-MM-dd")
    : format(new Date(), "yyyy-MM-dd");
  return (
    <form action={action} className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-3 gap-3">
        <Field label="type" required>
          <Select name="type" required defaultValue={initial?.type ?? "trademark"}>
            <option value="trademark">trademark</option>
            <option value="patent">patent</option>
            <option value="copyright">copyright</option>
            <option value="trade_secret">trade secret</option>
            <option value="other">other</option>
          </Select>
        </Field>
        <Field label="title" required><TextInput name="title" required defaultValue={initial?.title ?? ""} /></Field>
        <Field label="date" required><TextInput type="date" name="date" required defaultValue={date} /></Field>
      </div>
      <Field label="reference"><TextInput name="reference" defaultValue={initial?.reference ?? ""} /></Field>
      <Field label="description"><TextArea name="description" rows={6} defaultValue={initial?.description ?? ""} /></Field>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="font-sans text-sm text-fg-muted hover:text-fg px-3 py-1.5">Cancel</Link>
      </div>
    </form>
  );
}
