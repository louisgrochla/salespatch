import { loadPublicMetrics } from "@/lib/public-metrics";
import { format } from "date-fns";
import { AutoRefresh } from "./_components/AutoRefresh";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUS_COLOR: Record<string, string> = {
  not_started: "text-fg-dim",
  draft: "text-status-followup",
  in_progress: "text-phase-one",
  complete: "text-status-closed",
};

export default async function PublicResearchDashboard() {
  const metrics = await loadPublicMetrics();
  const generated = new Date(metrics.generatedAt);

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-8 py-8 sm:py-12 space-y-10">
      <AutoRefresh />

      {/* Header */}
      <header className="space-y-3">
        <div className="font-mono text-2xs uppercase tracking-wider text-fg-dim">
          live primary data collection
        </div>
        <h1 className="font-sans text-3xl sm:text-4xl font-medium text-fg leading-tight">
          SL-MAS Research Dashboard
        </h1>
        <p className="font-sans text-base text-fg-muted leading-relaxed max-w-3xl">
          {metrics.timeline.workingTitle ?? "Live primary data for an undergraduate dissertation."}
        </p>
        <div className="font-mono text-xs text-fg-dim flex flex-wrap gap-x-4 gap-y-1">
          {metrics.timeline.institution && <span>{metrics.timeline.institution}</span>}
          {metrics.timeline.degree && <span>{metrics.timeline.degree}</span>}
        </div>
        <p className="font-sans text-sm text-fg-muted leading-relaxed max-w-3xl pt-2">
          This dashboard displays live anonymised data collected from the SL-MAS sales
          platform. Data is captured automatically via contractor activity in the field
          and forms the primary dataset for an undergraduate dissertation research
          project evaluating the commercial viability of AI-augmented distributed
          sales systems across three operational phases.
        </p>
      </header>

      {/* Phase indicator */}
      <section className="border border-border bg-bg-panel p-6">
        <div className="font-mono text-2xs uppercase tracking-wider text-fg-dim mb-1">
          current operational phase
        </div>
        <div className="flex items-baseline gap-4 flex-wrap">
          <h2 className="font-sans text-2xl font-medium text-fg">
            {metrics.currentPhase.name}
          </h2>
          {metrics.currentPhase.startDate && (
            <span className="font-mono text-xs text-fg-dim">
              started {format(new Date(metrics.currentPhase.startDate), "dd LLL yyyy")} · day {metrics.currentPhase.daysActive + 1}
            </span>
          )}
        </div>
        {metrics.currentPhase.description && (
          <p className="font-sans text-sm text-fg-muted leading-relaxed mt-3 max-w-3xl">
            {metrics.currentPhase.description}
          </p>
        )}
      </section>

      {/* Live pitch metrics */}
      <section>
        <div className="h-section mb-3">live pitch metrics</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border">
          <Tile label="total pitches"
            value={metrics.totals.pitches.toLocaleString()} />
          <Tile label="pitches this phase"
            value={metrics.currentPhase.pitches.toLocaleString()} />
          <Tile label="overall close rate"
            value={`${metrics.totals.closeRatePct.toFixed(1)}%`} />
          <Tile label="close rate this phase"
            value={`${metrics.currentPhase.closeRatePct.toFixed(1)}%`} />
        </div>
        <div className="font-mono text-2xs text-fg-dim mt-3">
          last pitch logged: {metrics.lastPitchAgo ?? "no pitches yet"}
        </div>
      </section>

      {/* Phase comparison */}
      <section>
        <div className="h-section mb-3">conversion rate across operational phases</div>
        <div className="border border-border bg-bg-panel">
          <table className="nv-table">
            <thead>
              <tr>
                <th>phase</th>
                <th className="text-right">pitches</th>
                <th className="text-right">close rate</th>
                <th>distribution</th>
              </tr>
            </thead>
            <tbody>
              {metrics.phases.map((p) => (
                <tr key={p.name}>
                  <td>
                    <span className={cn(
                      "pill",
                      p.name === metrics.currentPhase.name
                        ? "border-accent/40 text-accent bg-accent/10"
                        : p.started ? "border-fg-muted/40 text-fg-muted" : "border-border text-fg-dim",
                    )}>
                      {p.name}
                    </span>
                    {!p.started && <span className="ml-2 text-fg-dim text-2xs">(pending)</span>}
                  </td>
                  <td className="text-right">{p.pitches.toLocaleString()}</td>
                  <td className="text-right">
                    {p.pitches > 0 ? `${p.closeRatePct.toFixed(1)}%` : "—"}
                  </td>
                  <td>
                    {p.pitches > 0 ? (
                      <div className="flex h-2 w-full bg-border overflow-hidden">
                        {p.closed > 0 && <div className="bg-status-closed" style={{ width: `${(p.closed / p.pitches) * 100}%` }} />}
                        {p.rejected > 0 && <div className="bg-status-rejected" style={{ width: `${(p.rejected / p.pitches) * 100}%` }} />}
                        {p.followUp > 0 && <div className="bg-status-followup" style={{ width: `${(p.followUp / p.pitches) * 100}%` }} />}
                      </div>
                    ) : <span className="text-fg-dim">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-4 mt-3 font-mono text-2xs text-fg-dim">
          <span><span className="inline-block w-2 h-2 bg-status-closed mr-1" />closed</span>
          <span><span className="inline-block w-2 h-2 bg-status-rejected mr-1" />rejected</span>
          <span><span className="inline-block w-2 h-2 bg-status-followup mr-1" />follow-up</span>
        </div>
      </section>

      {/* Data sufficiency */}
      <section>
        <div className="h-section mb-3">primary data sufficiency</div>
        <div className="border border-border bg-bg-panel p-6 space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="font-sans text-sm text-fg">
              {metrics.currentPhase.name}
            </span>
            <span className="font-mono text-xs text-fg-muted">
              {metrics.currentPhase.pitches.toLocaleString()} / {metrics.currentPhase.dataSufficiencyTarget.toLocaleString()} pitches
            </span>
          </div>
          <div className="bg-border h-3 w-full">
            <div
              className={cn(
                "h-3",
                metrics.currentPhase.dataSufficiencyPct >= 100 ? "bg-status-closed" : "bg-accent",
              )}
              style={{ width: `${metrics.currentPhase.dataSufficiencyPct}%` }}
            />
          </div>
          <div className="font-mono text-2xs text-fg-dim">
            Methodology threshold: {metrics.currentPhase.dataSufficiencyTarget} clean pitch records per phase before findings-grade statistical comparisons.
          </div>
        </div>
      </section>

      {/* Dissertation status */}
      <section>
        <div className="h-section mb-3">research project status</div>
        <div className="border border-border bg-bg-panel">
          <table className="nv-table">
            <thead>
              <tr>
                <th>chapter</th>
                <th>status</th>
              </tr>
            </thead>
            <tbody>
              {metrics.dissertationStatus.length === 0 ? (
                <tr><td colSpan={2} className="text-center text-fg-dim py-3">No chapters defined yet.</td></tr>
              ) : metrics.dissertationStatus.map((s) => (
                <tr key={s.chapter}>
                  <td>{s.chapter}</td>
                  <td className={cn("uppercase", STATUS_COLOR[s.status])}>
                    {s.status.replace("_", " ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Research timeline */}
      <section>
        <div className="h-section mb-3">research timeline</div>
        <div className="border border-border bg-bg-panel divide-y divide-border">
          {metrics.phases.filter((p) => p.startDate).map((p) => (
            <div key={p.name} className="px-4 py-3 flex items-baseline justify-between gap-3">
              <span className="font-mono text-xs text-fg">{p.name} start</span>
              <span className="font-mono text-2xs text-fg-dim">
                {format(new Date(p.startDate!), "dd LLL yyyy")}
                {!p.started && <span className="ml-2">(target)</span>}
              </span>
            </div>
          ))}
          {metrics.timeline.daysToSubmission != null && (
            <div className="px-4 py-3 flex items-baseline justify-between gap-3">
              <span className="font-mono text-xs text-fg">submission</span>
              <span className="font-mono text-2xs text-fg-dim">
                {metrics.timeline.submissionDeadline
                  ? `${format(new Date(metrics.timeline.submissionDeadline), "dd LLL yyyy")} — ${metrics.timeline.daysToSubmission} days remaining`
                  : metrics.timeline.submissionNote ?? "TBC"}
              </span>
            </div>
          )}
          {metrics.timeline.daysToSubmission == null && metrics.timeline.submissionNote && (
            <div className="px-4 py-3 flex items-baseline justify-between gap-3">
              <span className="font-mono text-xs text-fg">submission</span>
              <span className="font-mono text-2xs text-fg-dim">{metrics.timeline.submissionNote}</span>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border pt-6 space-y-2">
        <p className="font-mono text-xs text-fg-muted">
          All data is anonymised. No individual businesses or contractors are identifiable in this dashboard.
        </p>
        <p className="font-mono text-xs text-fg-muted">
          Data updates in real time as field activity occurs. Page auto-refreshes every 30 seconds.
        </p>
        <p className="font-mono text-2xs text-fg-dim">
          <a href="https://salespatch.co.uk" className="text-accent hover:underline">salespatch.co.uk</a>
          <span className="mx-2">·</span>
          last computed: {format(generated, "dd LLL yyyy · HH:mm:ss")}
        </p>
      </footer>
    </main>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-panel px-5 py-4">
      <div className="font-mono text-2xs uppercase tracking-wider text-fg-dim">{label}</div>
      <div className="font-mono text-2xl text-fg mt-2 leading-none">{value}</div>
    </div>
  );
}
