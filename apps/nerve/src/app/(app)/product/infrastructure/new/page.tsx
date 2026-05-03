import { PageHeader } from "@/components/PageHeader";
import { ProductSubNav } from "../../_components/SubNav";
import { InfraForm } from "../_form";
import { createInfra } from "../actions";
export const dynamic = "force-dynamic";
export default function NewInfraPage() {
  return (
    <div className="p-6">
      <ProductSubNav />
      <PageHeader title="New Infrastructure Note" />
      <InfraForm action={createInfra} cancelHref="/product/infrastructure" submitLabel="Create" />
    </div>
  );
}
