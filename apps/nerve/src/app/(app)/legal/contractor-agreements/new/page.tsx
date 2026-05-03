import { PageHeader } from "@/components/PageHeader";
import { LegalSubNav } from "../../_components/SubNav";
import { AgreementForm } from "../_form";
import { createAgreement } from "../actions";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <div className="p-6">
      <LegalSubNav />
      <PageHeader title="New Contractor Agreement Version" />
      <AgreementForm action={createAgreement} cancelHref="/legal/contractor-agreements" submitLabel="Create" />
    </div>
  );
}
