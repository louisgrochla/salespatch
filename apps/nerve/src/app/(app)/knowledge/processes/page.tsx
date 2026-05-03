import { prisma } from "@/lib/db";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, HeaderPrimary } from "@/components/PageHeader";
import { KnowledgeSubNav } from "../_components/SubNav";
export const dynamic = "force-dynamic";
export default async function Page() {
  const items = await prisma.processGuide.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="p-6">
      <KnowledgeSubNav />
      <PageHeader title="Process guides" subtitle={`${items.length}`}
        actions={<HeaderPrimary href="/knowledge/processes/new">+ guide</HeaderPrimary>} />
      {items.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">No process guides yet.</div>
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border">
          {items.map((p) => (
            <Link key={p.id} href={`/knowledge/processes/${p.id}`} className="block px-4 py-3 hover:bg-bg-hover flex items-baseline justify-between gap-3">
              <span className="font-sans text-sm text-fg">{p.name}</span>
              <span className="font-mono text-2xs text-fg-dim">{format(p.lastUpdated, "dd LLL yyyy")}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
