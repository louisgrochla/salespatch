import { PageHeader } from "@/components/PageHeader";
import { LegalSubNav } from "../../_components/SubNav";
import { CHForm } from "../_form";
import { createCH } from "../actions";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <div className="p-6">
      <LegalSubNav />
      <PageHeader title="New Companies House Filing" />
      <CHForm action={createCH} cancelHref="/legal/companies-house" submitLabel="Create" />
    </div>
  );
}
