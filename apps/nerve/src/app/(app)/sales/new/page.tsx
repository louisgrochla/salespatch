import { PageHeader } from "@/components/PageHeader";
import { PitchForm } from "../_components/PitchForm";
import { createPitch } from "../actions";

export const dynamic = "force-dynamic";

export default function NewPitchPage() {
  return (
    <div className="p-6">
      <PageHeader title="New Pitch" subtitle="Manual entry — embedding fires immediately on save." />
      <PitchForm action={createPitch} cancelHref="/sales" submitLabel="Create pitch" />
    </div>
  );
}
