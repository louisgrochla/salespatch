import { prisma } from "@/lib/db";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { PhasePill, StatusPill } from "@/components/PhasePill";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const SAMPLE_SIZE_WARN = 10;
const SAMPLE_SIZE_GOOD = 30;

type GroupRow = {
  key: string;
  closed: number;        // closed_now + closed_followup + legacy closed
  rejected: number;
  followUp: number;
  notPitched: number;    // visits that ended without a pitch
  total: number;         // every PitchLog row keyed under this group
  /// Pitches actually delivered (excludes not_pitched). Used as the
  /// denominator for close-rate so "didn't get to pitch" doesn't dilute
  /// the conversion math.
  pitched: number;
};

function groupBucket(
  rows: Array<{ key: string | null; outcome: string; n: number }>,
): GroupRow[] {
  const map = new Map<string, GroupRow>();
  for (const r of rows) {
    const key = r.key ?? "—";
    const b = map.get(key) ?? { key, closed: 0, rejected: 0, followUp: 0, notPitched: 0, total: 0, pitched: 0 };
    if (r.outcome === "closed" || r.outcome === "closed_now" || r.outcome === "closed_followup") {
      b.closed += r.n;
      b.pitched += r.n;
    } else if (r.outcome === "rejected") {
      b.rejected += r.n;
      b.pitched += r.n;
    } else if (r.outcome === "follow_up") {
      b.followUp += r.n;
      b.pitched += r.n;
    } else if (r.outcome === "not_pitched") {
      b.notPitched += r.n;
    }
    b.total += r.n;
    map.set(key, b);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

async function bucket(field: "phaseLabel" | "sector" | "businessType" | "leadSource" | "demoVersion") {
  const rows = await prisma.pitchLog.groupBy({
    by: [field, "outcome"],
    _count: { _all: true },
  });
  return groupBucket(rows.map((r) => ({
    key: (r as unknown as Record<string, string | null>)[field],
    outcome: r.outcome,
    n: r._count._all,
  })));
}

async function objectionFrequency() {
  const rows = await prisma.$queryRaw<Array<{ name: string; n: bigint }>>`
    SELECT t."name", count(*) AS n
    FROM "PitchObjection" po
    JOIN "ObjectionTag" t ON t."id" = po."objectionId"
    GROUP BY t."name"
    ORDER BY n DESC
  `;
  return rows.map((r) => ({ name: r.name, n: Number(r.n) }));
}

export default async function SalesAnalyticsPage() {
  const [byPhase, bySector, byType, byLead, byDemo, objections, total] = await Promise.all([
    bucket("phaseLabel"),
    bucket("sector"),
    bucket("businessType"),
    bucket("leadSource"),
    bucket("demoVersion"),
    objectionFrequency(),
    prisma.pitchLog.count(),
  ]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Sales Analytics"
        subtitle={`${total.toLocaleString()} pitches across all phases`}
        actions={<HeaderLink href="/sales">back to table</HeaderLink>}
      />

      {total === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">
          No pitches yet — analytics populate as data accumulates.
        </div>
      ) : (
        <>
          <ConversionGroup title="phase comparison" rows={byPhase} keyRender={(k) => <PhasePill phase={k} />} />
          <ConversionGroup title="conversion by sector" rows={bySector} />
          <ConversionGroup title="conversion by business type" rows={byType} />
          <ConversionGroup title="conversion by lead source" rows={byLead} />
          <ConversionGroup title="conversion by demo version" rows={byDemo} />
          <ObjectionGroup rows={objections} />
        </>
      )}
    </div>
  );
}

function ConversionGroup({
  title,
  rows,
  keyRender,
}: {
  title: string;
  rows: GroupRow[];
  keyRender?: (key: string) => React.ReactNode;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <div className="h-section mb-2">{title}</div>
      <div className="border border-border bg-bg-panel">
        <table className="nv-table">
          <thead>
            <tr>
              <th className="w-1/4">{title.replace("conversion by ", "")}</th>
              <th className="text-right">n</th>
              <th className="text-right">pitched</th>
              <th className="text-right">closed</th>
              <th className="text-right">rejected</th>
              <th className="text-right">follow up</th>
              <th className="text-right">no pitch</th>
              <th className="text-right">close rate</th>
              <th className="w-1/4">distribution</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              // close rate uses pitched as denominator so "couldn't
              // pitch" rows don't artificially deflate conversion.
              const closeRate = r.pitched > 0 ? r.closed / r.pitched : 0;
              const conf = sampleConfidence(r.pitched);
              return (
                <tr key={r.key}>
                  <td>{keyRender ? keyRender(r.key) : r.key}</td>
                  <td className="text-right">
                    <span className={cn(
                      "font-mono text-xs",
                      conf === "low" && "text-status-rejected",
                      conf === "medium" && "text-status-followup",
                      conf === "high" && "text-fg",
                    )}>
                      {r.total}
                    </span>
                  </td>
                  <td className="text-right text-fg">{r.pitched}</td>
                  <td className="text-right text-status-closed">{r.closed}</td>
                  <td className="text-right text-status-rejected">{r.rejected}</td>
                  <td className="text-right text-status-followup">{r.followUp}</td>
                  <td className="text-right text-fg-dim">{r.notPitched}</td>
                  <td className="text-right">{(closeRate * 100).toFixed(1)}%</td>
                  <td>
                    <DistroBar closed={r.closed} rejected={r.rejected} followUp={r.followUp} total={r.pitched} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="font-mono text-2xs text-fg-dim mt-1">
        n &lt; {SAMPLE_SIZE_WARN}: low confidence ·
        n {SAMPLE_SIZE_WARN}–{SAMPLE_SIZE_GOOD - 1}: medium ·
        n ≥ {SAMPLE_SIZE_GOOD}: usable for findings
      </div>
    </section>
  );
}

function ObjectionGroup({ rows }: { rows: Array<{ name: string; n: number }> }) {
  if (rows.length === 0) return null;
  const maxN = Math.max(...rows.map((r) => r.n));
  return (
    <section>
      <div className="h-section mb-2">objection frequency</div>
      <div className="border border-border bg-bg-panel">
        <table className="nv-table">
          <thead>
            <tr>
              <th className="w-1/3">objection</th>
              <th className="text-right" style={{ width: "5rem" }}>count</th>
              <th>frequency</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="text-right">{r.n}</td>
                <td>
                  <div className="bg-border h-2 w-full">
                    <div
                      className="bg-accent h-2"
                      style={{ width: `${(r.n / maxN) * 100}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DistroBar({ closed, rejected, followUp, total }: { closed: number; rejected: number; followUp: number; total: number }) {
  if (total === 0) return null;
  return (
    <div className="flex h-2 w-full bg-border overflow-hidden">
      {closed > 0 && <div className="bg-status-closed" style={{ width: `${(closed / total) * 100}%` }} />}
      {rejected > 0 && <div className="bg-status-rejected" style={{ width: `${(rejected / total) * 100}%` }} />}
      {followUp > 0 && <div className="bg-status-followup" style={{ width: `${(followUp / total) * 100}%` }} />}
    </div>
  );
}

function sampleConfidence(n: number): "low" | "medium" | "high" {
  if (n < SAMPLE_SIZE_WARN) return "low";
  if (n < SAMPLE_SIZE_GOOD) return "medium";
  return "high";
}
