import { PageHeader } from "@/components/PageHeader";
import { LeadForm } from "../_form";
import { createLead } from "../actions";

export const dynamic = "force-dynamic";

export default function NewLeadPage() {
  return (
    <div className="p-6">
      <PageHeader title="New Lead" />
      <LeadForm action={createLead} cancelHref="/leads" submitLabel="Add lead" />
    </div>
  );
}
