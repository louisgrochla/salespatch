import { PageHeader } from "@/components/PageHeader";
import { FinancialSubNav } from "../../_components/SubNav";
import { RevenueForm } from "../_form";
import { createRevenue } from "../actions";

export const dynamic = "force-dynamic";

export default function NewRevenuePage() {
  return (
    <div className="p-6">
      <FinancialSubNav />
      <PageHeader title="New Revenue Entry" />
      <RevenueForm action={createRevenue} cancelHref="/financial/revenue" submitLabel="Log revenue" />
    </div>
  );
}
