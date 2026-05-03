import { prisma } from "@/lib/db";
import Link from "next/link";
import { PageHeader, HeaderPrimary } from "@/components/PageHeader";
import { KnowledgeSubNav } from "../_components/SubNav";
export const dynamic = "force-dynamic";
export default async function Page() {
  const items = await prisma.glossaryEntry.findMany({ orderBy: { term: "asc" } });
  return (
    <div className="p-6">
      <KnowledgeSubNav />
      <PageHeader title="Glossary" subtitle={`${items.length} term${items.length === 1 ? "" : "s"}`}
        actions={<HeaderPrimary href="/knowledge/glossary/new">+ term</HeaderPrimary>} />
      {items.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">No terms yet.</div>
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border max-w-3xl">
          {items.map((g) => (
            <Link key={g.id} href={`/knowledge/glossary/${g.id}`} className="block px-4 py-3 hover:bg-bg-hover">
              <div className="font-mono text-xs text-fg">{g.term}</div>
              <div className="font-sans text-sm text-fg-muted mt-1 leading-snug">{g.definition}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
