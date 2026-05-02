import { PageHeader } from "@/components/PageHeader";
import { ResearchSubNav } from "../../_components/SubNav";
import { MethodologyForm } from "../_form";
import { createMethodology } from "../actions";

export const dynamic = "force-dynamic";

export default function NewMethodologyPage() {
  return (
    <div className="p-6">
      <ResearchSubNav />
      <PageHeader title="New Methodology Doc" />
      <MethodologyForm action={createMethodology} cancelHref="/research/methodology" submitLabel="Create methodology doc" />
    </div>
  );
}
