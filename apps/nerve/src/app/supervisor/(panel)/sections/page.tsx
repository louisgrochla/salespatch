import { prisma } from "@/lib/db";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { SupervisorSubNav } from "../_components/SubNav";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  not_started: "text-fg-dim",
  draft: "text-status-followup",
  in_progress: "text-phase-one",
  complete: "text-status-closed",
};

export default async function SupervisorSectionsPage() {
  const sections = await prisma.dissertationSection.findMany({
    orderBy: { chapter: "asc" },
    include: { _count: { select: { literatureLinks: true } } },
  });

  return (
    <div className="space-y-6">
      <SupervisorSubNav />
      <header>
        <h1 className="font-sans text-xl font-medium text-fg">Dissertation sections</h1>
        <p className="font-mono text-2xs text-fg-dim mt-1">
          Click any chapter to read the draft and leave feedback.
        </p>
      </header>

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
              <th>updated</th>
            </tr>
          </thead>
          <tbody>
            {sections.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-fg-dim py-3">No chapters yet.</td></tr>
            ) : sections.map((s) => {
              const pct = s.wordCountTarget && s.wordCountTarget > 0
                ? Math.min(1, s.wordCount / s.wordCountTarget) : 0;
              return (
                <tr key={s.id} className="cursor-pointer">
                  <td>
                    <Link href={`/supervisor/sections/${s.id}`} className="text-fg hover:underline">
                      {s.chapter}
                    </Link>
                  </td>
                  <td className={cn("uppercase", STATUS_COLOR[s.status])}>
                    {s.status.replace("_", " ")}
                  </td>
                  <td className="text-right">{s.wordCount.toLocaleString()}</td>
                  <td className="text-right">{s.wordCountTarget?.toLocaleString() ?? <span className="text-fg-dim">—</span>}</td>
                  <td>
                    {s.wordCountTarget ? (
                      <div className="bg-border h-2 w-32"><div className="bg-accent h-2" style={{ width: `${pct * 100}%` }} /></div>
                    ) : <span className="text-fg-dim">—</span>}
                  </td>
                  <td className="text-right">{s._count.literatureLinks}</td>
                  <td className="text-fg-dim">{formatDistanceToNow(s.updatedAt, { addSuffix: true })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
