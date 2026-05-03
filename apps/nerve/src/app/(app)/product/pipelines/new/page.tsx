import { PageHeader } from "@/components/PageHeader";
import { ProductSubNav } from "../../_components/SubNav";
import { PipelineForm } from "../_form";
import { createPipeline } from "../actions";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <div className="p-6">
      <ProductSubNav />
      <PageHeader title="New Pipeline" />
      <PipelineForm action={createPipeline} cancelHref="/product/pipelines" submitLabel="Create" />
    </div>
  );
}
