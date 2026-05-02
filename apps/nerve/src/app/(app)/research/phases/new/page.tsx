import { PageHeader } from "@/components/PageHeader";
import { ResearchSubNav } from "../../_components/SubNav";
import { PhaseForm } from "../_form";
import { createPhase } from "../actions";

export const dynamic = "force-dynamic";

export default function NewPhasePage() {
  return (
    <div className="p-6">
      <ResearchSubNav />
      <PageHeader title="New Phase Boundary" />
      <PhaseForm action={createPhase} cancelHref="/research/phases" submitLabel="Create phase" />
    </div>
  );
}
