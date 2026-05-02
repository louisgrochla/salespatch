import { prisma } from "@/lib/db";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { PageHeader, HeaderLink, HeaderPrimary } from "@/components/PageHeader";
import { ResearchSubNav } from "../_components/SubNav";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  not_started: "text-fg-dim",
  draft: "text-status-followup",
  in_progress: "text-phase-one",
  complete: "text-status-closed",
};

export default async function SectionsPage() {
  const sections = await prisma.dissertationSection.findMany({
    orderBy: { chapter: "asc" },
    include: { _count: { select: { literatureLinks: true, versions: true } } },
  });

  const totalTarget = sections.reduce((s, x) => s + (x.wordCountTarget ?? 0), 0);
  const totalWritten = sections.reduce((s, x) => s + x.wordCount, 0);

  return (
    <div className="p-6">
      <ResearchSubNav />
      <PageHeader
        title="Dissertation Sections"
        subtitle={`${sections.length} chapter${sections.length === 1 ? "" : "s"} · ${totalWritten.toLocaleString()} / ${totalTarget.toLocaleString()} words`}
        actions={
          <>
            <HeaderLink href="/api/research/sections/export?format=csv">csv</HeaderLink>
            <HeaderLink href="/api/research/sections/export?format=json">json</HeaderLink>
            <HeaderPrimary href="/dissertation/sections/new">+ new section</HeaderPrimary>
          </>
        }
      />

      {sections.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">
          No sections yet. Create the first chapter.
        </div>
      ) : (
        <div className="border border-border bg-bg-panel">
          <table className="nv-table">
            <thead>
              <tr>
                <th>chapter</th>
                <th>status</th>
                <th className="text-right">words</th>
                <th className="text-right">target</th>
                <th>progress</th>
                <th className="text-right">refs</th>
                <th className="text-right">revs</th>
                <th>updated</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => {
                const pct = s.wordCountTarget && s.wordCountTarget > 0
                  ? Math.min(1, s.wordCount / s.wordCountTarget) : 0;
                return (
                  <tr key={s.id} className="cursor-pointer">
                    <td>
                      <Link href={`/dissertation/sections/${s.id}`} className="text-fg hover:underline">
                        {s.chapter}
                      </Link>
                    </td>
                    <td className={cn("uppercase", STATUS_COLOR[s.status])}>
                      {s.status.replace("_", " ")}
                    </td>
                    <td className="text-right">{s.wordCount.toLocaleString()}</td>
                    <td className="text-right">
                      {s.wordCountTarget?.toLocaleString() ?? <span className="text-fg-dim">—</span>}
                    </td>
                    <td>
                      {s.wordCountTarget ? (
                        <div className="bg-border h-2 w-32">
                          <div className="bg-accent h-2" style={{ width: `${pct * 100}%` }} />
                        </div>
                      ) : <span className="text-fg-dim">—</span>}
                    </td>
                    <td className="text-right">{s._count.literatureLinks}</td>
                    <td className="text-right">{s._count.versions}</td>
                    <td className="text-fg-dim">
                      {formatDistanceToNow(s.updatedAt, { addSuffix: true })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
