import { prisma } from "@/lib/db";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { PageHeader, HeaderPrimary } from "@/components/PageHeader";
import { ResearchSubNav } from "../_components/SubNav";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  pending: "text-fg-muted",
  in_progress: "text-phase-one",
  done: "text-status-closed",
  missed: "text-status-rejected",
};

export default async function CalendarPage() {
  const items = await prisma.academicCalendarItem.findMany({
    orderBy: { deadline: "asc" },
    include: { dissertationSection: { select: { id: true, chapter: true } } },
  });
  const now = new Date();

  return (
    <div className="p-6">
      <ResearchSubNav />
      <PageHeader
        title="Academic Calendar"
        subtitle={`${items.length} milestone${items.length === 1 ? "" : "s"}`}
        actions={<HeaderPrimary href="/research/calendar/new">+ new milestone</HeaderPrimary>}
      />

      {items.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">
          No milestones logged.
        </div>
      ) : (
        <div className="border border-border bg-bg-panel">
          <table className="nv-table">
            <thead>
              <tr>
                <th>milestone</th>
                <th>deadline</th>
                <th>relative</th>
                <th>status</th>
                <th>linked section</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const overdue = i.status !== "done" && i.deadline.getTime() < now.getTime();
                return (
                  <tr key={i.id} className="cursor-pointer">
                    <td>
                      <Link href={`/research/calendar/${i.id}`} className="text-fg hover:underline">
                        {i.milestone}
                      </Link>
                    </td>
                    <td>{format(i.deadline, "EEE dd LLL yyyy")}</td>
                    <td className={cn(overdue && "text-status-rejected")}>
                      {formatDistanceToNow(i.deadline, { addSuffix: true })}
                    </td>
                    <td className={cn("uppercase", STATUS_COLOR[i.status] ?? "text-fg-muted")}>
                      {i.status.replace("_", " ")}
                    </td>
                    <td>{i.dissertationSection?.chapter ?? <span className="text-fg-dim">—</span>}</td>
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
