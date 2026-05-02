import { PageHeader } from "@/components/PageHeader";
import { ProductSubNav } from "../../_components/SubNav";
import { ArchitectureForm } from "../_form";
import { createArchitecture } from "../actions";

export const dynamic = "force-dynamic";

export default function NewArchPage() {
  return (
    <div className="p-6">
      <ProductSubNav />
      <PageHeader title="New Architecture Doc" />
      <ArchitectureForm action={createArchitecture} cancelHref="/product/architecture" submitLabel="Create doc" />
    </div>
  );
}
