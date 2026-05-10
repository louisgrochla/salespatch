import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { cn } from "@/lib/cn";
import { strategicStore, type StrategyRow } from "@/lib/sl-mas/strategicStore";
import type { StrategyStatus } from "@/lib/sl-mas/types";

export const dynamic = "force-dynamic";

interface SearchParams {
  vertical?: string;
  status?: StrategyStatus;
}

export default async function StrategiesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const validStatus = (
    ["new", "testing", "active", "champion", "deprecated"] as const
  ).find((s) => s === searchParams.status);
  const strategies = await strategicStore.list({
    vertical: searchParams.vertical,
    status: validStatus,
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Strategies"
        subtitle="Ranker output · close rate by design combination · Wilson 95% CI"
        actions={
          <>
            <HeaderLink href="/pipeline">Pivot</HeaderLink>
            <HeaderLink href="/pipeline/episodes">Episodes</HeaderLink>
          </>
        }
      />

      <StrategyTable strategies={strategies} />

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
        <div className="border border-border bg-bg-panel px-4 py-3">
          <div className="h-section mb-2">lifecycle</div>
          <ul className="space-y-1 text-fg-muted">
            <li>
              <span className="text-rose-400">deprecated</span> — n ≥ 20 AND
              close_rate &lt; 15%
            </li>
            <li>
              <span className="text-purple-400">champion</span> — n ≥ 50 AND
              CI lower ≥ 40%
            </li>
            <li>
              <span className="text-emerald-400">active</span> — n ≥ 20 AND CI
              lower ≥ 20%
            </li>
            <li>
              <span className="text-sky-400">testing</span> — n ≥ 5
            </li>
            <li>
              <span className="text-fg-dim">new</span> — otherwise
            </li>
          </ul>
        </div>
        <div className="border border-border bg-bg-panel px-4 py-3 text-fg-dim">
          <div className="h-section mb-2">honest read</div>
          At solo-founder volumes most rows stay <em>testing</em> or
          <em> new</em>. The ranker surfaces candidates; manual review is the
          path to promotion until n &gt; 20 per cell becomes routine.
        </div>
      </div>

      <p className="font-mono text-2xs text-fg-dim mt-4">
        Live from Postgres. Use ?vertical=barber or ?status=champion in the URL.
        Nightly ranker runs at 03:00 UTC via Vercel Cron.
      </p>
    </div>
  );
}

function StrategyTable({ strategies }: { strategies: StrategyRow[] }) {
  if (strategies.length === 0) {
    return (
      <div className="border border-border bg-bg-panel px-4 py-6 text-fg-dim font-mono text-xs">
        No strategies yet. Once outcomes land, the nightly ranker
        (<code className="text-fg-muted">
          /api/cron/strategy-ranker
        </code>) populates this table.
      </div>
    );
  }

  return (
    <div className="border border-border bg-bg-panel overflow-x-auto">
      <table className="min-w-full text-xs font-mono">
        <thead>
          <tr className="text-fg-dim uppercase tracking-wider text-2xs border-b border-border">
            <th className="text-left px-3 py-2 font-medium">vertical</th>
            <th className="text-left px-3 py-2 font-medium">parameters</th>
            <th className="text-right px-3 py-2 font-medium">n</th>
            <th className="text-right px-3 py-2 font-medium">rate</th>
            <th className="text-right px-3 py-2 font-medium">95% ci</th>
            <th className="text-left px-3 py-2 font-medium">status</th>
          </tr>
        </thead>
        <tbody>
          {strategies.map((s) => (
            <tr
              key={s.id}
              className="border-t border-border/50 hover:bg-bg-hover"
            >
              <td className="px-3 py-2 text-fg">{s.vertical}</td>
              <td className="px-3 py-2 text-fg-muted">
                {Object.entries(s.parameters)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(" · ")}
              </td>
              <td className="px-3 py-2 text-right text-fg">{s.sample_size}</td>
              <td className="px-3 py-2 text-right text-fg">
                {s.close_rate != null
                  ? `${Math.round(s.close_rate * 100)}%`
                  : "—"}
              </td>
              <td className="px-3 py-2 text-right text-fg-dim">
                {s.confidence_lower != null && s.confidence_upper != null
                  ? `[${Math.round(s.confidence_lower * 100)}, ${Math.round(s.confidence_upper * 100)}]`
                  : "—"}
              </td>
              <td className="px-3 py-2">
                <span className={cn("font-medium", statusClass(s.status))}>
                  {s.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function statusClass(status: StrategyStatus): string {
  switch (status) {
    case "champion":
      return "text-purple-400";
    case "active":
      return "text-emerald-400";
    case "testing":
      return "text-sky-400";
    case "deprecated":
      return "text-rose-400";
    default:
      return "text-fg-dim";
  }
}
