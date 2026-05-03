import { PageHeader } from "@/components/PageHeader";
import { LegalSubNav } from "../../_components/SubNav";
import { GdprForm } from "../_form";
import { createGdpr } from "../actions";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <div className="p-6">
      <LegalSubNav />
      <PageHeader title="New GDPR Record" />
      <GdprForm action={createGdpr} cancelHref="/legal/gdpr" submitLabel="Create" />
    </div>
  );
}
