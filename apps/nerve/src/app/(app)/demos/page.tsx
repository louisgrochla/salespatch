import { prisma } from "@/lib/db";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, HeaderPrimary } from "@/components/PageHeader";
import { PhasePill } from "@/components/PhasePill";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const OUTCOME_COLOR: Record<string, string> = {
  closed: "text-status-closed",
  rejected: "text-status-rejected",
  follow_up: "text-status-followup",
};

export default async function DemosPage() {
  const [demos, byTemplate] = await Promise.all([
    prisma.demoRecord.findMany({ orderBy: { dateBuilt: "desc" }, take: 500 }),
    prisma.demoRecord.groupBy({
      by: ["templateVersion", "conversionOutcome"], _count: { _all: true },
    }),
  ]);

  // Template performance — close rate per templateVersion.
  const templates = new Map<string, { total: number; closed: number }>();
  for (const r of byTemplate) {
    const key = r.templateVersion ?? "—";
    const t = templates.get(key) ?? { total: 0, closed: 0 };
    t.total += r._count._all;
    if (r.conversionOutcome === "closed") t.closed += r._count._all;
    templates.set(key, t);
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Demo Library"
        subtitle={`${demos.length.toLocaleString()} demo${demos.length === 1 ? "" : "s"} built`}
        actions={<HeaderPrimary href="/demos/new">+ new demo</HeaderPrimary>}
      />

      {templates.size > 0 && (
        <section>
          <div className="h-section mb-2">template performance</div>
          <div className="border border-border bg-bg-panel">
            <table className="nv-table">
              <thead>
                <tr>
                  <th>template</th>
                  <th className="text-right">built</th>
                  <th className="text-right">closed</th>
                  <th className="text-right">close rate</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(templates.entries()).sort((a, b) => b[1].total - a[1].total).map(([k, t]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td className="text-right">{t.total}</td>
                    <td className="text-right text-status-closed">{t.closed}</td>
                    <td className="text-right">
                      {t.total > 0 ? `${((t.closed / t.total) * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {demos.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">
          No demos logged yet.
        </div>
      ) : (
        <div className="border border-border bg-bg-panel">
          <table className="nv-table">
            <thead>
              <tr>
                <th>date built</th>
                <th>business</th>
                <th>sector</th>
                <th>template</th>
                <th>outcome</th>
                <th>phase</th>
              </tr>
            </thead>
            <tbody>
              {demos.map((d) => (
                <tr key={d.id} className="cursor-pointer">
                  <td>
                    <Link href={`/demos/${d.id}`} className="text-fg hover:underline">
                      {format(d.dateBuilt, "dd LLL yyyy")}
                    </Link>
                  </td>
                  <td>{d.businessName}</td>
                  <td>{d.sector ?? <span className="text-fg-dim">—</span>}</td>
                  <td>{d.templateVersion ?? <span className="text-fg-dim">—</span>}</td>
                  <td className={cn("uppercase", OUTCOME_COLOR[d.conversionOutcome ?? ""])}>
                    {d.conversionOutcome ? d.conversionOutcome.replace("_", " ") : <span className="text-fg-dim">unpitched</span>}
                  </td>
                  <td><PhasePill phase={d.phaseLabel} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
