import { prisma } from "@/lib/db";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, HeaderPrimary } from "@/components/PageHeader";
import { ResearchSubNav } from "../_components/SubNav";

export const dynamic = "force-dynamic";

export default async function SupervisorPage() {
  const meetings = await prisma.supervisorMeeting.findMany({
    orderBy: { date: "desc" }, take: 200,
  });

  return (
    <div className="p-6">
      <ResearchSubNav />
      <PageHeader
        title="Supervisor Meetings"
        subtitle={`${meetings.length} logged`}
        actions={<HeaderPrimary href="/research/supervisor/new">+ new meeting</HeaderPrimary>}
      />

      {meetings.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">
          No meetings logged yet.
        </div>
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border">
          {meetings.map((m) => (
            <Link key={m.id} href={`/research/supervisor/${m.id}`} className="block px-4 py-3 hover:bg-bg-hover">
              <div className="flex items-baseline gap-3 mb-1">
                <span className="font-mono text-xs text-fg">{format(m.date, "EEE dd LLL yyyy · HH:mm")}</span>
                {m.followUpStatus && (
                  <span className="font-mono text-2xs text-fg-muted">follow-up: {m.followUpStatus}</span>
                )}
              </div>
              <div className="font-sans text-sm text-fg-muted line-clamp-2">
                {m.notes ?? m.feedback ?? "—"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
