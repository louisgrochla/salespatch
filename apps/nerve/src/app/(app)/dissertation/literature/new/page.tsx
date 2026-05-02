import { PageHeader } from "@/components/PageHeader";
import { ResearchSubNav } from "../../_components/SubNav";
import { LiteratureForm } from "../_components/LiteratureForm";
import { createLiterature } from "../actions";

export const dynamic = "force-dynamic";

export default function NewLiteraturePage() {
  return (
    <div className="p-6">
      <ResearchSubNav />
      <PageHeader title="New Literature Entry" />
      <LiteratureForm action={createLiterature} cancelHref="/dissertation/literature" submitLabel="Add to library" />
    </div>
  );
}
