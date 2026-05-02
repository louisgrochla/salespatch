import { Field, TextInput, TextArea, SubmitButton } from "@/components/Form";
import Link from "next/link";

interface InitialValues {
  phaseName?: string;
  formalDescription?: string;
  mixedMethodsJustification?: string | null;
  sampleSizeNotes?: string | null;
  statisticalApproach?: string | null;
  gdprHandling?: string | null;
  nerveAsInfrastructure?: string | null;
}

const NERVE_DEFAULT =
  "Operational data is captured continuously through NERVE — a founder-only " +
  "intranet that ingests pitch records via a Supabase webhook the moment a " +
  "contractor logs them in the iOS app. Every record is timestamped with the " +
  "active phase label, written to a Postgres database, and immediately " +
  "chunked and embedded into pgvector for retrieval. Manual entries " +
  "(operations log, decisions, financial records) follow the same pipeline. " +
  "This makes the dataset both a real-time operational tool and the primary " +
  "research instrument for this study.";

export function MethodologyForm({
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
      <Field label="phase name" required hint='Must match a PhaseBoundary name (e.g. "Phase 1").'>
        <TextInput name="phaseName" required defaultValue={initial?.phaseName ?? ""} />
      </Field>
      <Field label="formal description" required hint="Citable methodology text. This is what goes into your dissertation methodology chapter.">
        <TextArea name="formalDescription" rows={8} required defaultValue={initial?.formalDescription ?? ""} />
      </Field>
      <Field label="mixed-methods justification">
        <TextArea name="mixedMethodsJustification" rows={5} defaultValue={initial?.mixedMethodsJustification ?? ""} />
      </Field>
      <Field label="sample size notes" hint="Why this n is sufficient. Acknowledge limits.">
        <TextArea name="sampleSizeNotes" rows={4} defaultValue={initial?.sampleSizeNotes ?? ""} />
      </Field>
      <Field label="statistical approach">
        <TextArea name="statisticalApproach" rows={4} defaultValue={initial?.statisticalApproach ?? ""} />
      </Field>
      <Field label="GDPR handling" hint="Lawful basis, consent capture, retention, anonymisation.">
        <TextArea name="gdprHandling" rows={4} defaultValue={initial?.gdprHandling ?? ""} />
      </Field>
      <Field label="NERVE as research infrastructure"
        hint="Description of how NERVE itself functioned as the data collection and knowledge management layer. Feeds directly into the methodology chapter.">
        <TextArea
          name="nerveAsInfrastructure"
          rows={6}
          defaultValue={initial?.nerveAsInfrastructure ?? NERVE_DEFAULT}
        />
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
