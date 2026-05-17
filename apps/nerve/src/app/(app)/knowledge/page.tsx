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
      <PageHeader
        title="Knowledge Base"
        subtitle="Long-lived institutional memory — anything that doesn't fit a single pitch, lead, or session lives here."
      />
      <section className="space-y-2">
        <div className="font-sans text-xs text-fg-muted max-w-2xl">
          Use this section for things that change rarely but matter often: brand
          guidelines, repeatable processes, the glossary of in-house terms, and
          pointers to external resources. Each tile below opens the full library
          for that type.
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border">
          <StatTile label="brand documents" value={brand.toLocaleString()} />
          <StatTile label="process guides" value={processes.toLocaleString()} />
          <StatTile label="glossary terms" value={glossary.toLocaleString()} />
          <StatTile label="external resources" value={resources.toLocaleString()} />
        </div>
      </section>
    </div>
  );
}
