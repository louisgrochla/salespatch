import { PageHeader } from "@/components/PageHeader";
import { PhasePill } from "@/components/PhasePill";
import { FinancialSubNav } from "../_components/SubNav";
import { financeByPhase, monthlyTrend, sustainability, type SustainabilityVerdict } from "@/lib/finance";

export const dynamic = "force-dynamic";

const VERDICT: Record<SustainabilityVerdict, { label: string; tone: string; rationale: string }> = {
  sustainable: {
    label: "sustainable",
    tone: "text-status-closed",
    rationale: "Net contribution is positive over the last three months and equal to or above the prior three months.",
  },
  trending: {
    label: "trending — slowing",
    tone: "text-status-followup",
    rationale: "Net is positive over the last three months but lower than the prior three. Worth a look.",
  },
  unsustainable: {
    label: "unsustainable",
    tone: "text-status-rejected",
    rationale: "Net is negative across the recent window. Costs exceed revenue.",
  },
  insufficient: {
    label: "insufficient data",
    tone: "text-fg-dim",
    rationale: "Need at least 6 months of activity for a sustainability verdict.",
  },
};

export default async function FinancialAnalyticsPage() {
  const [phaseFinance, trend] = await Promise.all([financeByPhase(), monthlyTrend()]);
  const sus = sustainability(trend);
  const v = VERDICT[sus.verdict];

  const cumulative: Array<{ month: string; cumNet: number }> = [];
  let running = 0;
  for (const m of trend) {
    running += m.net;
    cumulative.push({ month: m.month, cumNet: running });
  }
  const cumMax = Math.max(1, ...cumulative.map((c) => Math.abs(c.cumNet)));

  return (
    <div className="p-6 space-y-6">
      <FinancialSubNav />
      <PageHeader title="Financial Analytics" subtitle="ROI, CAC, sustainability." />

      <section>
        <div className="h-section mb-2">sustainability verdict</div>
        <div className="border border-border bg-bg-panel p-4">
          <div className={`font-sans text-2xl font-medium ${v.tone}`}>{v.label}</div>
          <p className="font-mono text-xs text-fg-muted mt-2">{v.rationale}</p>
          <div className="font-mono text-2xs text-fg-dim mt-3">
            recent 3-month avg net: £{sus.recentAvg.toFixed(2)} ·
            prior 3-month avg net: £{sus.priorAvg.toFixed(2)}
          </div>
        </div>
      </section>

      <section>
        <div className="h-section mb-2">roi by phase</div>
        <div className="border border-border bg-bg-panel">
          <table className="nv-table">
            <thead>
              <tr>
                <th>phase</th>
                <th className="text-right">revenue</th>
                <th className="text-right">cost</th>
                <th className="text-right">net</th>
                <th className="text-right">roi</th>
                <th>net trajectory</th>
              </tr>
            </thead>
            <tbody>
              {phaseFinance.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-fg-dim py-4">No financial entries yet.</td></tr>
              ) : phaseFinance.map((p) => {
                const span = Math.max(p.revenue, p.cost, 1);
                return (
                  <tr key={p.phase}>
                    <td><PhasePill phase={p.phase} /></td>
                    <td className="text-right text-status-closed">£{p.revenue.toFixed(2)}</td>
                    <td className="text-right text-status-rejected">£{p.cost.toFixed(2)}</td>
                    <td className={`text-right ${p.net >= 0 ? "text-status-closed" : "text-status-rejected"}`}>£{p.net.toFixed(2)}</td>
                    <td className="text-right">{p.roi == null ? "—" : `${(p.roi * 100).toFixed(0)}%`}</td>
                    <td>
                      <div className="flex h-2 w-32 bg-border overflow-hidden">
                        <div className="bg-status-closed" style={{ width: `${(p.revenue / span) * 100}%` }} />
                        <div className="bg-status-rejected" style={{ width: `${(p.cost / span) * 100}%`, marginLeft: 2 }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="h-section mb-2">cumulative net (last 12 months)</div>
        <div className="border border-border bg-bg-panel p-4">
          <div className="grid grid-cols-12 gap-1 items-end h-32">
            {cumulative.map((c) => {
              const isNeg = c.cumNet < 0;
              const h = (Math.abs(c.cumNet) / cumMax) * 100;
              return (
                <div key={c.month} className="flex flex-col items-center gap-1">
                  <div className="flex-1 w-full flex items-end justify-center">
                    <div className={`w-3 ${isNeg ? "bg-status-rejected" : "bg-status-closed"}`}
                      style={{ height: `${h}%` }} title={`£${c.cumNet.toFixed(2)}`} />
                  </div>
                  <div className="font-mono text-2xs text-fg-dim">{c.month.slice(5)}</div>
                </div>
              );
            })}
          </div>
          <div className="font-mono text-2xs text-fg-dim mt-3">
            Bar height = cumulative net contribution since {cumulative[0]?.month ?? "—"}.
          </div>
        </div>
      </section>
    </div>
  );
}
