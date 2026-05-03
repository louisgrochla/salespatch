import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { ResearchSubNav } from "../../_components/SubNav";
import { EvidenceForm } from "../_form";
import { createEvidence } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewEvidencePage({
  searchParams,
}: {
  searchParams: { sourceType?: string; sourceId?: string };
}) {
  const sections = await prisma.dissertationSection.findMany({
    orderBy: { chapter: "asc" },
    select: { id: true, chapter: true },
  });
  return (
    <div className="p-6">
      <ResearchSubNav />
      <PageHeader title="New Evidence Entry" subtitle="Bind a NERVE row to a dissertation section." />
      <EvidenceForm
        action={createEvidence}
        sections={sections}
        cancelHref="/dissertation/evidence"
        submitLabel="Log evidence"
        initial={{ sourceType: searchParams.sourceType, sourceId: searchParams.sourceId }}
      />
    </div>
  );
}
