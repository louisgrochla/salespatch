import { prisma } from "@/lib/db";
import { format } from "date-fns";
import { SupervisorSubNav } from "../_components/SubNav";

export const dynamic = "force-dynamic";

export default async function SupervisorMeetingsPage() {
  const meetings = await prisma.supervisorMeeting.findMany({
    orderBy: { date: "desc" }, take: 200,
  });

  return (
    <div className="space-y-6">
      <SupervisorSubNav />
      <header>
        <h1 className="font-sans text-xl font-medium text-fg">Meetings</h1>
        <p className="font-mono text-2xs text-fg-dim mt-1">
          Read-only log of all supervision meetings — verify your own feedback was recorded accurately.
        </p>
      </header>

      {meetings.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">
          No meetings logged yet.
        </div>
      ) : (
        <div className="space-y-3">
          {meetings.map((m) => (
            <article key={m.id} className="border border-border bg-bg-panel">
              <header className="px-4 py-2 border-b border-border flex items-baseline justify-between flex-wrap gap-2">
                <span className="font-mono text-xs text-fg">{format(m.date, "EEE dd LLL yyyy · HH:mm")}</span>
                {m.followUpStatus && (
                  <span className="font-mono text-2xs text-fg-muted">follow-up: {m.followUpStatus}</span>
                )}
              </header>
              <div className="divide-y divide-border">
                <Block label="notes" value={m.notes} />
                <Block label="feedback" value={m.feedback} />
                <Block label="agreed actions" value={m.agreedActions} />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Block({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 px-4 py-2">
      <div className="h-section pt-0.5">{label}</div>
      <pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">{value ?? "—"}</pre>
    </div>
  );
}
