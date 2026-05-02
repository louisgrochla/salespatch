import { PageHeader } from "@/components/PageHeader";
import { FinancialSubNav } from "../../_components/SubNav";
import { CostForm } from "../_form";
import { createCost } from "../actions";

export const dynamic = "force-dynamic";

export default function NewCostPage() {
  return (
    <div className="p-6">
      <FinancialSubNav />
      <PageHeader title="New Cost Entry" />
      <CostForm action={createCost} cancelHref="/financial/costs" submitLabel="Log cost" />
    </div>
  );
}
