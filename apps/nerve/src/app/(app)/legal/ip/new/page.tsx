import { PageHeader } from "@/components/PageHeader";
import { LegalSubNav } from "../../_components/SubNav";
import { IpForm } from "../_form";
import { createIp } from "../actions";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <div className="p-6">
      <LegalSubNav />
      <PageHeader title="New IP Record" />
      <IpForm action={createIp} cancelHref="/legal/ip" submitLabel="Create" />
    </div>
  );
}
