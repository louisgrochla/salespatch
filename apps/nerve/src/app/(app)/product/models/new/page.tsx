import { PageHeader } from "@/components/PageHeader";
import { ProductSubNav } from "../../_components/SubNav";
import { ModelForm } from "../_form";
import { createModel } from "../actions";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <div className="p-6">
      <ProductSubNav />
      <PageHeader title="New Model" />
      <ModelForm action={createModel} cancelHref="/product/models" submitLabel="Create" />
    </div>
  );
}
