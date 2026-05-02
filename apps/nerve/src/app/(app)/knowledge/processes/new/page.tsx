import { PageHeader } from "@/components/PageHeader";
import { KnowledgeSubNav } from "../../_components/SubNav";
import { ProcessForm } from "../_form";
import { createProcess } from "../actions";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <div className="p-6">
      <KnowledgeSubNav />
      <PageHeader title="New Process Guide" />
      <ProcessForm action={createProcess} cancelHref="/knowledge/processes" submitLabel="Create" />
    </div>
  );
}
