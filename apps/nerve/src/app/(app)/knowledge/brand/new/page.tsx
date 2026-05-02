import { PageHeader } from "@/components/PageHeader";
import { KnowledgeSubNav } from "../../_components/SubNav";
import { BrandForm } from "../_form";
import { createBrand } from "../actions";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <div className="p-6">
      <KnowledgeSubNav />
      <PageHeader title="New Brand Document" />
      <BrandForm action={createBrand} cancelHref="/knowledge/brand" submitLabel="Create" />
    </div>
  );
}
