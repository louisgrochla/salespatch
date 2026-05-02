import { prisma } from "@/lib/db";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { PageHeader, HeaderPrimary, HeaderLink } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { PhasePill } from "@/components/PhasePill";
import { FinancialSubNav } from "./_components/SubNav";
import { financeByPhase, monthlyTrend, sustainability, type SustainabilityVerdict } from "@/lib/finance";

export const dynamic = "force-dynamic";

const VERDICT_LABEL: Record<SustainabilityVerdict, { label: string; className: string }> = {
  sustainable: { label: "sustainable", className: "text-status-closed" },
  trending: { label: "trending — slowing", className: "text-status-followup" },
  unsustainable: { label: "unsustainable", className: "text-status-rejected" },
  insufficient: { label: "insufficient data", className: "text-fg-dim" },
};

export default async function FinancialPage() {
  const [phaseFinance, trend, recent] = await Promise.all([
    financeByPhase(),
    monthlyTrend(),
    Promise.all([
      prisma.revenueEntry.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
      prisma.costEntry.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    ]),
  ]);
  const [recentRevenue, recentCosts] = recent;
  const sus = sustainability(trend);
  const verdict = VERDICT_LABEL[sus.verdict];

  const totalRevenue = phaseFinance.reduce((s, p) => s + p.revenue, 0);
  const totalCost = phaseFinance.reduce((s, p) => s + p.cost, 0);
  const totalNet = totalRevenue - totalCost;
  const totalClosed = phaseFinance.reduce((s, p) => s + p.closedDeals, 0);
  const overallCac = totalClosed > 0 ? totalCost / totalClosed : null;

  // Merge revenue + cost into a single timeline.
  type Entry = { id: string; kind: "revenue" | "cost"; date: Date; label: string; amount: number; phase: string };
  const merged: Entry[] = [
    ...recentRevenue.map((r) => ({
      id: r.id, kind: "revenue" as const, date: r.date,
      label: r.dealReference ?? "—", amount: Number(r.amount), phase: r.phaseLabel,
    })),
    ...recentCosts.map((c) => ({
      id: c.id, kind: "cost" as const, date: c.date,
      label: c.category, amount: Number(c.amount), phase: c.phaseLabel,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 15);

  const maxAbs = Math.max(1, ...trend.map((t) => Math.max(Math.abs(t.revenue), Math.abs(t.cost))));

  return (
    <div className="p-6 space-y-6">
      <FinancialSubNav />
      <PageHeader
        title="Financial Tracker"
        subtitle="Revenue and cost rollup across all phases."
        actions={
          <>
            <HeaderPrimary href="/financial/revenue/new">+ revenue</HeaderPrimary>
            <HeaderLink href="/financial/costs/new">+ cost</HeaderLink>
          </>
        }
      />

      <section>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border border border-border">
          <StatTile label="revenue" value={`£${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
          <StatTile label="cost" value={`£${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
          <StatTile
            label="net"
            value={`£${totalNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            hint={totalCost > 0 ? `${(((totalRevenue - totalCost) / totalCost) * 100).toFixed(0)}% margin` : undefined}
          />
          <StatTile label="cac (overall)" value={overallCac == null ? "—" : `£${overallCac.toFixed(2)}`} hint={`${totalClosed} closed`} />
          <div className="bg-bg-panel px-4 py-3">
            <div className="h-section">sustainability</div>
            <div className={`font-mono text-base mt-1 leading-none ${verdict.className}`}>
              {verdict.label}
            </div>
            <div className="font-mono text-2xs text-fg-dim mt-2">
              recent 3mo avg: £{sus.recentAvg.toFixed(0)} · prior 3mo: £{sus.priorAvg.toFixed(0)}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="h-section mb-2">phase breakdown</div>
        <div className="border border-border bg-bg-panel">
          <table className="nv-table">
            <thead>
              <tr>
                <th>phase</th>
                <th className="text-right">revenue</th>
                <th className="text-right">cost</th>
                <th className="text-right">net</th>
                <th className="text-right">closed</th>
                <th className="text-right">cac</th>
                <th className="text-right">roi</th>
              </tr>
            </thead>
            <tbody>
              {phaseFinance.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-fg-dim py-4">No financial entries yet.</td></tr>
              ) : phaseFinance.map((p) => (
                <tr key={p.phase}>
                  <td><PhasePill phase={p.phase} /></td>
                  <td className="text-right text-status-closed">£{p.revenue.toFixed(2)}</td>
                  <td className="text-right text-status-rejected">£{p.cost.toFixed(2)}</td>
                  <td className={`text-right ${p.net >= 0 ? "text-status-closed" : "text-status-rejected"}`}>
                    £{p.net.toFixed(2)}
                  </td>
                  <td className="text-right">{p.closedDeals}</td>
                  <td className="text-right">{p.cac == null ? "—" : `£${p.cac.toFixed(2)}`}</td>
                  <td className="text-right">{p.roi == null ? "—" : `${(p.roi * 100).toFixed(0)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="h-section mb-2">monthly trend (last 12 months)</div>
        <div className="border border-border bg-bg-panel p-4">
          <div className="grid grid-cols-12 gap-1 items-end h-32">
            {trend.map((m) => {
              const r = (m.revenue / maxAbs) * 100;
              const c = (m.cost / maxAbs) * 100;
              return (
                <div key={m.month} className="flex flex-col items-center gap-1">
                  <div className="flex-1 w-full flex items-end justify-center gap-0.5">
                    <div className="w-2 bg-status-closed" style={{ height: `${r}%` }} title={`£${m.revenue}`} />
                    <div className="w-2 bg-status-rejected" style={{ height: `${c}%` }} title={`£${m.cost}`} />
                  </div>
                  <div className="font-mono text-2xs text-fg-dim">{m.month.slice(5)}</div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 mt-3 font-mono text-2xs text-fg-dim">
            <span><span className="inline-block w-2 h-2 bg-status-closed mr-1" />revenue</span>
            <span><span className="inline-block w-2 h-2 bg-status-rejected mr-1" />cost</span>
          </div>
        </div>
      </section>

      <section>
        <div className="h-section mb-2">recent activity</div>
        {merged.length === 0 ? (
          <div className="border border-border bg-bg-panel px-4 py-6 text-center font-mono text-xs text-fg-dim">
            Log your first entry from the buttons up top.
          </div>
        ) : (
          <div className="border border-border bg-bg-panel divide-y divide-border">
            {merged.map((e) => (
              <Link
                key={`${e.kind}-${e.id}`}
                href={`/financial/${e.kind === "revenue" ? "revenue" : "costs"}/${e.id}`}
                className="block px-4 py-2 hover:bg-bg-hover flex items-center gap-3"
              >
                <span className={`pill ${e.kind === "revenue" ? "border-status-closed/40 text-status-closed bg-status-closed/5" : "border-status-rejected/40 text-status-rejected bg-status-rejected/5"}`}>
                  {e.kind}
                </span>
                <span className="font-mono text-2xs text-fg-dim w-24">{format(e.date, "dd LLL yyyy")}</span>
                <span className="font-mono text-xs text-fg flex-1 truncate">{e.label}</span>
                <span className={`font-mono text-xs ${e.kind === "revenue" ? "text-status-closed" : "text-status-rejected"}`}>
                  {e.kind === "revenue" ? "+" : "−"}£{e.amount.toFixed(2)}
                </span>
                <PhasePill phase={e.phase} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
