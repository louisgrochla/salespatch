import { prisma } from "@/lib/db";
import Link from "next/link";
import { PageHeader, HeaderPrimary } from "@/components/PageHeader";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  not_contacted: "text-fg-dim",
  contacted: "text-phase-one",
  pitched: "text-status-followup",
  closed: "text-status-closed",
  rejected: "text-status-rejected",
};

interface SearchParams { status?: string; source?: string }

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const where: Record<string, unknown> = {};
  if (searchParams.status && ["not_contacted","contacted","pitched","closed","rejected"].includes(searchParams.status)) {
    where.contactedStatus = searchParams.status;
  }
  if (searchParams.source) where.sourceMethod = searchParams.source;

  const [leads, sources, statusCounts] = await Promise.all([
    prisma.leadRecord.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.leadRecord.groupBy({
      by: ["sourceMethod", "contactedStatus"], _count: { _all: true },
    }),
    prisma.leadRecord.groupBy({ where, by: ["contactedStatus"], _count: { _all: true } }),
  ]);

  // Source performance — closed rate per sourceMethod.
  const sourcePerf = new Map<string, { total: number; closed: number; pitched: number }>();
  for (const r of sources) {
    const k = r.sourceMethod ?? "—";
    const t = sourcePerf.get(k) ?? { total: 0, closed: 0, pitched: 0 };
    t.total += r._count._all;
    if (r.contactedStatus === "closed") t.closed += r._count._all;
    if (r.contactedStatus === "pitched" || r.contactedStatus === "closed" || r.contactedStatus === "rejected") {
      t.pitched += r._count._all;
    }
    sourcePerf.set(k, t);
  }

  const total = statusCounts.reduce((s, c) => s + c._count._all, 0);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Lead Intelligence"
        subtitle={`${total.toLocaleString()} record${total === 1 ? "" : "s"}`}
        actions={<HeaderPrimary href="/leads/new">+ new lead</HeaderPrimary>}
      />

      {sourcePerf.size > 0 && (
        <section>
          <div className="h-section mb-2">source performance</div>
          <div className="border border-border bg-bg-panel">
            <table className="nv-table">
              <thead>
                <tr>
                  <th>source method</th>
                  <th className="text-right">leads</th>
                  <th className="text-right">pitched</th>
                  <th className="text-right">closed</th>
                  <th className="text-right">close rate of pitched</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(sourcePerf.entries()).sort((a, b) => b[1].total - a[1].total).map(([k, t]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td className="text-right">{t.total}</td>
                    <td className="text-right">{t.pitched}</td>
                    <td className="text-right text-status-closed">{t.closed}</td>
                    <td className="text-right">
                      {t.pitched > 0 ? `${((t.closed / t.pitched) * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {leads.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">
          No leads logged yet.
        </div>
      ) : (
        <div className="border border-border bg-bg-panel">
          <table className="nv-table">
            <thead>
              <tr>
                <th>name</th>
                <th>type</th>
                <th>sector</th>
                <th>location</th>
                <th>source</th>
                <th>status</th>
                <th>dnc</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="cursor-pointer">
                  <td><Link href={`/leads/${l.id}`} className="text-fg hover:underline">{l.name}</Link></td>
                  <td>{l.type ?? <span className="text-fg-dim">—</span>}</td>
                  <td>{l.sector ?? <span className="text-fg-dim">—</span>}</td>
                  <td>{l.location ?? <span className="text-fg-dim">—</span>}</td>
                  <td>{l.sourceMethod ?? <span className="text-fg-dim">—</span>}</td>
                  <td className={cn("uppercase", STATUS_COLOR[l.contactedStatus])}>{l.contactedStatus.replace("_", " ")}</td>
                  <td>{l.doNotContact ? <span className="text-status-rejected">DNC</span> : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
