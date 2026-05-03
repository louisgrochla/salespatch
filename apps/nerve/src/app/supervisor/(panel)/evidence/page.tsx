import { prisma } from "@/lib/db";
import { format } from "date-fns";
import { SupervisorSubNav } from "../_components/SubNav";
import { resolveEvidenceSource } from "@/lib/evidence";

export const dynamic = "force-dynamic";

export default async function SupervisorEvidencePage() {
  const items = await prisma.evidenceLog.findMany({
    orderBy: { createdAt: "desc" }, take: 500,
    include: { dissertationSection: { select: { chapter: true } } },
  });
  const resolved = await Promise.all(
    items.map((i) => resolveEvidenceSource(i.sourceType, i.sourceId)),
  );

  return (
    <div className="space-y-6">
      <SupervisorSubNav />
      <header>
        <h1 className="font-sans text-xl font-medium text-fg">Evidence log</h1>
        <p className="font-mono text-2xs text-fg-dim mt-1">
          Read-only — data points flagged for citation, with the dissertation section they support.
          Source titles for sensitive types (PitchLog, RevenueEntry) are shown only in summary form.
        </p>
      </header>

      {items.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">
          No evidence logged yet.
        </div>
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border">
          {items.map((e, i) => {
            const src = resolved[i];
            // Strip business name from PitchLog titles before rendering for the supervisor.
            const safeTitle = e.sourceType === "PitchLog"
              ? `${src.hint ?? "pitch record"}`
              : src.title;
            return (
              <div key={e.id} className="px-4 py-3">
                <div className="flex items-center gap-3 mb-1 flex-wrap">
                  <span className="pill border-fg-muted/40 text-fg-muted">{e.sourceType}</span>
                  <span className="font-mono text-xs text-fg">{safeTitle}</span>
                  {!src.exists && <span className="font-mono text-2xs text-status-rejected">[unresolved]</span>}
                  {e.dissertationSection && (
                    <span className="font-mono text-2xs text-accent ml-auto">
                      → {e.dissertationSection.chapter}
                    </span>
                  )}
                </div>
                <p className="font-sans text-sm text-fg-muted leading-snug">{e.annotation}</p>
                <div className="font-mono text-2xs text-fg-dim mt-1">{format(e.createdAt, "dd LLL yyyy · HH:mm")}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
