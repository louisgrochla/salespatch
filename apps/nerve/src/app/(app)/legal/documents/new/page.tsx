import { PageHeader } from "@/components/PageHeader";
import { LegalSubNav } from "../../_components/SubNav";
import { DocForm } from "../_form";
import { createDoc } from "../actions";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <div className="p-6">
      <LegalSubNav />
      <PageHeader title="New Legal Document" />
      <DocForm action={createDoc} cancelHref="/legal/documents" submitLabel="Create" />
    </div>
  );
}
