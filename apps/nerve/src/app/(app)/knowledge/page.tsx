import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { KnowledgeSubNav } from "./_components/SubNav";

export const dynamic = "force-dynamic";

export default async function KnowledgeOverviewPage() {
  const [brand, processes, glossary, resources] = await Promise.all([
    prisma.brandDocument.count(),
    prisma.processGuide.count(),
    prisma.glossaryEntry.count(),
    prisma.externalResource.count(),
  ]);
  return (
    <div className="p-6 space-y-6">
      <KnowledgeSubNav />
      <PageHeader title="Knowledge Base" subtitle="Brand, processes, glossary, and external resources." />
      <section className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border">
        <StatTile label="brand documents" value={brand.toLocaleString()} />
        <StatTile label="process guides" value={processes.toLocaleString()} />
        <StatTile label="glossary terms" value={glossary.toLocaleString()} />
        <StatTile label="external resources" value={resources.toLocaleString()} />
      </section>
    </div>
  );
}
