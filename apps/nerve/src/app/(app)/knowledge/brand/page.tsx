import { prisma } from "@/lib/db";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { PageHeader, HeaderPrimary } from "@/components/PageHeader";
import { KnowledgeSubNav } from "../_components/SubNav";

export const dynamic = "force-dynamic";

export default async function Page() {
  const docs = await prisma.brandDocument.findMany({ orderBy: { updatedAt: "desc" } });
  return (
    <div className="p-6">
      <KnowledgeSubNav />
      <PageHeader title="Brand documents" subtitle={`${docs.length}`}
        actions={<HeaderPrimary href="/knowledge/brand/new">+ document</HeaderPrimary>} />
      {docs.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">No brand documents yet.</div>
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border">
          {docs.map((d) => (
            <Link key={d.id} href={`/knowledge/brand/${d.id}`} className="block px-4 py-3 hover:bg-bg-hover">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-sans text-sm text-fg">{d.title}</span>
                <span className="font-mono text-2xs text-fg-dim">updated {formatDistanceToNow(d.updatedAt, { addSuffix: true })}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
