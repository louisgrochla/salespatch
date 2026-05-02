import { prisma } from "@/lib/db";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, HeaderLink, HeaderPrimary } from "@/components/PageHeader";
import { ResearchSubNav } from "../_components/SubNav";
import { resolveEvidenceSource } from "@/lib/evidence";

export const dynamic = "force-dynamic";

interface SearchParams {
  sourceType?: string;
  sectionId?: string;
}

export default async function EvidencePage({ searchParams }: { searchParams: SearchParams }) {
  const where: Record<string, unknown> = {};
  if (searchParams.sourceType) where.sourceType = searchParams.sourceType;
  if (searchParams.sectionId) where.dissertationSectionId = searchParams.sectionId;

  const [items, sourceTypes, sections] = await Promise.all([
    prisma.evidenceLog.findMany({
      where, orderBy: { createdAt: "desc" }, take: 500,
      include: { dissertationSection: { select: { id: true, chapter: true } } },
    }),
    prisma.evidenceLog.findMany({ distinct: ["sourceType"], select: { sourceType: true } }),
    prisma.dissertationSection.findMany({
      orderBy: { chapter: "asc" }, select: { id: true, chapter: true },
    }),
  ]);

  // Resolve all source rows in parallel for the snapshot column.
  const resolved = await Promise.all(
    items.map((i) => resolveEvidenceSource(i.sourceType, i.sourceId)),
  );

  return (
    <div className="p-6">
      <ResearchSubNav />
      <PageHeader
        title="Evidence Log"
        subtitle={`${items.length} entr${items.length === 1 ? "y" : "ies"} — quote-ready citations bound to source rows`}
        actions={
          <>
            <HeaderLink href="/api/research/evidence/export?format=csv">csv</HeaderLink>
            <HeaderLink href="/api/research/evidence/export?format=json">json</HeaderLink>
            <HeaderPrimary href="/research/evidence/new">+ new evidence</HeaderPrimary>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[14rem_1fr] gap-4">
        <aside className="space-y-4">
          <div className="border border-border bg-bg-panel">
            <div className="px-3 py-2 border-b border-border h-section">source type</div>
            <ul>
              <li>
                <Link href="/research/evidence" className="block px-3 py-1.5 font-mono text-xs hover:bg-bg-hover">
                  all
                </Link>
              </li>
              {sourceTypes.map((s) => (
                <li key={s.sourceType}>
                  <Link href={`/research/evidence?sourceType=${s.sourceType}`}
                    className="block px-3 py-1.5 font-mono text-xs hover:bg-bg-hover text-fg-muted">
                    {s.sourceType}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="border border-border bg-bg-panel">
            <div className="px-3 py-2 border-b border-border h-section">section</div>
            <ul>
              <li>
                <Link href="/research/evidence" className="block px-3 py-1.5 font-mono text-xs hover:bg-bg-hover">
                  all
                </Link>
              </li>
              {sections.map((s) => (
                <li key={s.id}>
                  <Link href={`/research/evidence?sectionId=${s.id}`}
                    className="block px-3 py-1.5 font-mono text-xs hover:bg-bg-hover text-fg-muted">
                    {s.chapter}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <main>
          {items.length === 0 ? (
            <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">
              No evidence logged yet. Bind a row to a section as you write.
            </div>
          ) : (
            <div className="border border-border bg-bg-panel divide-y divide-border">
              {items.map((e, i) => {
                const src = resolved[i];
                return (
                  <Link key={e.id} href={`/research/evidence/${e.id}`} className="block px-4 py-3 hover:bg-bg-hover">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <span className="pill border-fg-muted/40 text-fg-muted">{e.sourceType}</span>
                      <span className="font-mono text-xs text-fg">{src.title}</span>
                      {src.hint && <span className="font-mono text-2xs text-fg-dim">{src.hint}</span>}
                      {!src.exists && (
                        <span className="font-mono text-2xs text-status-rejected">[unresolved]</span>
                      )}
                      {e.dissertationSection && (
                        <span className="font-mono text-2xs text-accent ml-auto">
                          → {e.dissertationSection.chapter}
                        </span>
                      )}
                    </div>
                    <div className="font-sans text-sm text-fg-muted leading-snug">
                      {e.annotation.length > 240 ? e.annotation.slice(0, 240) + "…" : e.annotation}
                    </div>
                    <div className="font-mono text-2xs text-fg-dim mt-1">
                      {format(e.createdAt, "dd LLL yyyy · HH:mm")}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
