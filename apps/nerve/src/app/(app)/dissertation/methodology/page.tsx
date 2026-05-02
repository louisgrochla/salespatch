import { prisma } from "@/lib/db";
import Link from "next/link";
import { PageHeader, HeaderPrimary } from "@/components/PageHeader";
import { PhasePill } from "@/components/PhasePill";
import { ResearchSubNav } from "../_components/SubNav";

export const dynamic = "force-dynamic";

export default async function MethodologyPage() {
  const docs = await prisma.methodologyDoc.findMany({
    orderBy: { phaseName: "asc" },
  });

  return (
    <div className="p-6">
      <ResearchSubNav />
      <PageHeader
        title="Methodology"
        subtitle="One doc per phase. The formal description and NERVE-as-infrastructure paragraph are dissertation-bound."
        actions={<HeaderPrimary href="/dissertation/methodology/new">+ new methodology doc</HeaderPrimary>}
      />

      {docs.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">
          No methodology documents yet. Write one per phase.
        </div>
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border">
          {docs.map((d) => (
            <Link
              key={d.id}
              href={`/dissertation/methodology/${d.id}`}
              className="block px-4 py-3 hover:bg-bg-hover"
            >
              <div className="flex items-center gap-3 mb-1">
                <PhasePill phase={d.phaseName} />
                <span className="font-mono text-2xs text-fg-dim">
                  {d.formalDescription.split(/\s+/).filter(Boolean).length.toLocaleString()} words
                </span>
              </div>
              <div className="font-sans text-sm text-fg-muted line-clamp-2">
                {d.formalDescription.slice(0, 240)}{d.formalDescription.length > 240 ? "…" : ""}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
