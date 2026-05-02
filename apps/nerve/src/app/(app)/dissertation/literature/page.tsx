import { prisma } from "@/lib/db";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import { PageHeader, HeaderLink, HeaderPrimary } from "@/components/PageHeader";
import { ResearchSubNav } from "../_components/SubNav";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const POSITION_COLOR: Record<string, string> = {
  supports: "text-status-closed",
  challenges: "text-status-rejected",
  contextualises: "text-phase-one",
};

interface SearchParams {
  theme?: string;
  position?: string;
  q?: string;
}

function buildWhere(p: SearchParams): Prisma.LiteratureEntryWhereInput {
  const where: Prisma.LiteratureEntryWhereInput = {};
  if (p.theme) where.themeTags = { has: p.theme };
  if (p.position === "supports" || p.position === "challenges" || p.position === "contextualises") {
    where.position = p.position;
  }
  if (p.q) {
    where.OR = [
      { title: { contains: p.q, mode: "insensitive" } },
      { authors: { contains: p.q, mode: "insensitive" } },
    ];
  }
  return where;
}

export default async function LiteraturePage({ searchParams }: { searchParams: SearchParams }) {
  const where = buildWhere(searchParams);
  const [entries, allThemes, total] = await Promise.all([
    prisma.literatureEntry.findMany({
      where,
      orderBy: [{ year: "desc" }, { authors: "asc" }],
      take: 500,
    }),
    prisma.literatureEntry.findMany({
      select: { themeTags: true },
    }),
    prisma.literatureEntry.count(),
  ]);

  const themeCounts = new Map<string, number>();
  for (const e of allThemes) {
    for (const t of e.themeTags) themeCounts.set(t, (themeCounts.get(t) ?? 0) + 1);
  }
  const themes = Array.from(themeCounts.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div className="p-6">
      <ResearchSubNav />
      <PageHeader
        title="Literature"
        subtitle={`${entries.length} of ${total.toLocaleString()} entries`}
        actions={
          <>
            <HeaderLink href="/api/research/literature/export?format=csv">csv</HeaderLink>
            <HeaderLink href="/api/research/literature/export?format=json">json</HeaderLink>
            <HeaderPrimary href="/dissertation/literature/new">+ new entry</HeaderPrimary>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-4">
        <aside>
          <div className="border border-border bg-bg-panel">
            <div className="px-3 py-2 border-b border-border h-section">themes</div>
            <ul>
              <li>
                <Link
                  href="/dissertation/literature"
                  className={cn("block px-3 py-1.5 font-mono text-xs hover:bg-bg-hover",
                    !searchParams.theme && "text-fg bg-bg-hover")}>
                  all <span className="text-fg-dim ml-1">{total}</span>
                </Link>
              </li>
              {themes.map(([t, n]) => (
                <li key={t}>
                  <Link
                    href={`/dissertation/literature?theme=${encodeURIComponent(t)}`}
                    className={cn("flex justify-between px-3 py-1.5 font-mono text-xs hover:bg-bg-hover",
                      searchParams.theme === t ? "text-fg bg-bg-hover" : "text-fg-muted")}>
                    <span>{t}</span>
                    <span className="text-fg-dim">{n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="border border-border bg-bg-panel mt-4">
            <div className="px-3 py-2 border-b border-border h-section">position</div>
            <ul>
              {[["", "all"], ["supports", "supports"], ["challenges", "challenges"], ["contextualises", "contextualises"]].map(([v, label]) => {
                const active = (searchParams.position ?? "") === v;
                const params = new URLSearchParams();
                if (searchParams.theme) params.set("theme", searchParams.theme);
                if (v) params.set("position", v);
                if (searchParams.q) params.set("q", searchParams.q);
                return (
                  <li key={v}>
                    <Link
                      href={`/dissertation/literature?${params.toString()}`}
                      className={cn("block px-3 py-1.5 font-mono text-xs hover:bg-bg-hover",
                        active ? "text-fg bg-bg-hover" : "text-fg-muted")}>
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        <main>
          {entries.length === 0 ? (
            <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">
              No entries match the current filters.
            </div>
          ) : (
            <div className="border border-border bg-bg-panel divide-y divide-border">
              {entries.map((e) => (
                <Link
                  key={e.id}
                  href={`/dissertation/literature/${e.id}`}
                  className="block px-4 py-3 hover:bg-bg-hover"
                >
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-xs text-fg">{e.authors}</span>
                    <span className="font-mono text-2xs text-fg-dim">{e.year ?? "n.d."}</span>
                    {e.position && (
                      <span className={cn("font-mono text-2xs uppercase tracking-wider", POSITION_COLOR[e.position])}>
                        {e.position}
                      </span>
                    )}
                  </div>
                  <div className="font-sans text-sm text-fg mt-1 leading-snug">{e.title}</div>
                  {e.themeTags.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {e.themeTags.map((t) => (
                        <span key={t} className="font-mono text-2xs text-fg-dim border border-border px-1.5 py-0.5">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
