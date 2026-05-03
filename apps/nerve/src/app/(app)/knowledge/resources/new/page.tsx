import { PageHeader } from "@/components/PageHeader";
import { KnowledgeSubNav } from "../../_components/SubNav";
import { ResourceForm } from "../_form";
import { createResource } from "../actions";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <div className="p-6">
      <KnowledgeSubNav />
      <PageHeader title="New External Resource" />
      <ResourceForm action={createResource} cancelHref="/knowledge/resources" submitLabel="Create" />
    </div>
  );
}
