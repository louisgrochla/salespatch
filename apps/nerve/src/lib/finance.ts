import { prisma } from "./db";

export interface PhaseFinance {
  phase: string;
  revenue: number;
  cost: number;
  net: number;
  closedDeals: number;
  cac: number | null; // null when no closed deals
  roi: number | null; // null when zero cost
}

// Aggregate revenue, cost and CAC per phase.
// CAC = total cost / closed deals (per phase).
// ROI = net / cost.
export async function financeByPhase(): Promise<PhaseFinance[]> {
  const [phases, revenueByPhase, costByPhase, closedByPhase] = await Promise.all([
    prisma.phaseBoundary.findMany({
      orderBy: { startDate: "asc" }, select: { name: true },
    }),
    prisma.revenueEntry.groupBy({ by: ["phaseLabel"], _sum: { amount: true } }),
    prisma.costEntry.groupBy({ by: ["phaseLabel"], _sum: { amount: true } }),
    prisma.pitchLog.groupBy({
      by: ["phaseLabel"], where: { outcome: "closed" }, _count: { _all: true },
    }),
  ]);

  const allPhases = new Set<string>();
  phases.forEach((p) => allPhases.add(p.name));
  revenueByPhase.forEach((r) => allPhases.add(r.phaseLabel));
  costByPhase.forEach((c) => allPhases.add(c.phaseLabel));
  closedByPhase.forEach((c) => allPhases.add(c.phaseLabel));

  return Array.from(allPhases).sort().map((phase) => {
    const revenue = Number(
      revenueByPhase.find((r) => r.phaseLabel === phase)?._sum.amount ?? 0,
    );
    const cost = Number(
      costByPhase.find((c) => c.phaseLabel === phase)?._sum.amount ?? 0,
    );
    const closedDeals = closedByPhase.find((c) => c.phaseLabel === phase)?._count._all ?? 0;
    const cac = closedDeals > 0 ? cost / closedDeals : null;
    const roi = cost > 0 ? (revenue - cost) / cost : null;
    return { phase, revenue, cost, net: revenue - cost, closedDeals, cac, roi };
  });
}

export interface MonthlyPoint {
  month: string; // YYYY-MM
  revenue: number;
  cost: number;
  net: number;
}

// Last 12 calendar months (zero-filled).
export async function monthlyTrend(): Promise<MonthlyPoint[]> {
  const now = new Date();
  const months: { key: string; start: Date; end: Date }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      start: d, end: next,
    });
  }

  const earliest = months[0].start;
  const latest = months[months.length - 1].end;

  const [revenue, cost] = await Promise.all([
    prisma.revenueEntry.findMany({
      where: { date: { gte: earliest, lt: latest } },
      select: { date: true, amount: true },
    }),
    prisma.costEntry.findMany({
      where: { date: { gte: earliest, lt: latest } },
      select: { date: true, amount: true },
    }),
  ]);

  return months.map((m) => {
    const r = revenue
      .filter((x) => x.date >= m.start && x.date < m.end)
      .reduce((s, x) => s + Number(x.amount), 0);
    const c = cost
      .filter((x) => x.date >= m.start && x.date < m.end)
      .reduce((s, x) => s + Number(x.amount), 0);
    return { month: m.key, revenue: r, cost: c, net: r - c };
  });
}

// Naive sustainability verdict. Compares last 3 months' net to prior 3.
// "sustainable" when avg-net is positive AND trending up (or flat positive).
// "trending" when avg-net is positive but down vs prior period.
// "unsustainable" when avg-net is negative.
// "insufficient" when fewer than 6 months of activity.
export type SustainabilityVerdict = "sustainable" | "trending" | "unsustainable" | "insufficient";

export function sustainability(monthly: MonthlyPoint[]): {
  verdict: SustainabilityVerdict;
  recentAvg: number;
  priorAvg: number;
} {
  const nonZero = monthly.filter((m) => m.revenue > 0 || m.cost > 0);
  if (nonZero.length < 6) {
    return { verdict: "insufficient", recentAvg: 0, priorAvg: 0 };
  }
  const recent = monthly.slice(-3);
  const prior = monthly.slice(-6, -3);
  const recentAvg = recent.reduce((s, m) => s + m.net, 0) / 3;
  const priorAvg = prior.reduce((s, m) => s + m.net, 0) / 3;

  if (recentAvg < 0) return { verdict: "unsustainable", recentAvg, priorAvg };
  if (recentAvg >= priorAvg) return { verdict: "sustainable", recentAvg, priorAvg };
  return { verdict: "trending", recentAvg, priorAvg };
}
