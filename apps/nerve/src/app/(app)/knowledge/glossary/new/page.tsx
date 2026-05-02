import { PageHeader } from "@/components/PageHeader";
import { KnowledgeSubNav } from "../../_components/SubNav";
import { TermForm } from "../_form";
import { createTerm } from "../actions";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <div className="p-6">
      <KnowledgeSubNav />
      <PageHeader title="New Glossary Term" />
      <TermForm action={createTerm} cancelHref="/knowledge/glossary" submitLabel="Create" />
    </div>
  );
}
