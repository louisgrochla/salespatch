import { prisma } from "@/lib/db";
import { currentPhaseLabel } from "@/lib/phase";
import { StatTile } from "@/components/StatTile";
import { PhasePill, StatusPill } from "@/components/PhasePill";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { format, formatDistanceToNow } from "date-fns";

// Methodology threshold per phase, per spec ("data sufficiency indicator
// (current pitch volume vs minimum methodology threshold of 50 per phase)").
const METHODOLOGY_MIN_PITCHES_PER_PHASE = 50;

async function loadDashboard() {
  try {
    const [
      pitchCount,
      pitchOutcomes,
      revenueTotal,
      costTotal,
      activeDemos,
      phase,
      dissertation,
      sections,
      literatureCount,
      pitchByPhase,
      recent,
    ] = await Promise.all([
      prisma.pitchLog.count(),
      prisma.pitchLog.groupBy({ by: ["outcome"], _count: { _all: true } }),
      prisma.revenueEntry.aggregate({ _sum: { amount: true } }),
      prisma.costEntry.aggregate({ _sum: { amount: true } }),
      // R7: switched from legacy `demoRecord` (manual-entry, mostly empty)
      // to `demoArtefact` (where every /build-demo skill run lands). The
      // old `conversionOutcome: { not: "closed" }` filter needed a join
      // through LeadAssignmentEvent; for the dashboard headline tile a
      // simple lifetime count is honest and unambiguous.
      prisma.demoArtefact.count(),
      currentPhaseLabel(),
      prisma.dissertationMeta.findUnique({ where: { id: "main" } }),
      prisma.dissertationSection.findMany({
        select: {
          chapter: true,
          status: true,
          wordCount: true,
          wordCountTarget: true,
        },
      }),
      prisma.literatureEntry.count(),
      prisma.pitchLog.groupBy({ by: ["phaseLabel"], _count: { _all: true } }),
      loadRecentActivity(),
    ]);

    // Sum every "closed" variant (legacy `closed`, `closed_now`,
    // `closed_followup`) so the dashboard headline rate isn't broken
    // by the new richer outcomes.
    const closedCount = pitchOutcomes
      .filter((o) => o.outcome === "closed" || o.outcome === "closed_now" || o.outcome === "closed_followup")
      .reduce((sum, o) => sum + o._count._all, 0);
    // Exclude not_pitched rows from the conversion denominator —
    // they're visits that didn't end in a pitch, so including them
    // would deflate the rate.
    const notPitchedCount = pitchOutcomes.find((o) => o.outcome === "not_pitched")?._count._all ?? 0;
    const pitchedCount = pitchCount - notPitchedCount;
    const closeRate = pitchedCount > 0 ? closedCount / pitchedCount : 0;
    const revenue = Number(revenueTotal._sum.amount ?? 0);
    const cost = Number(costTotal._sum.amount ?? 0);
    const cac = closedCount > 0 ? cost / closedCount : 0;

    return {
      ok: true as const,
      pitchCount,
      pitchedCount,
      closedCount,
      pitchOutcomes,
      closeRate,
      revenue,
      cac,
      activeDemos,
      phase,
      dissertation,
      sections,
      literatureCount,
      pitchByPhase,
      recent,
    };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

interface ActivityItem {
  id: string;
  source: string;
  title: string;
  createdAt: Date;
  phaseLabel: string;
}

async function loadRecentActivity(): Promise<ActivityItem[]> {
  const [pitches, ops, revenue, demos, literature] = await Promise.all([
    prisma.pitchLog.findMany({
      orderBy: { createdAt: "desc" }, take: 10,
      select: { id: true, businessName: true, createdAt: true, phaseLabel: true },
    }),
    prisma.operationsLog.findMany({
      orderBy: { createdAt: "desc" }, take: 10,
      select: { id: true, type: true, body: true, decision: true, whatFailed: true, whatChanged: true, createdAt: true, phaseLabel: true },
    }),
    prisma.revenueEntry.findMany({
      orderBy: { createdAt: "desc" }, take: 5,
      select: { id: true, dealReference: true, amount: true, createdAt: true, phaseLabel: true },
    }),
    // R7: activity feed reads demoArtefact (skill output) not demoRecord
    // (legacy manual entry). DemoArtefact orders on generatedAt and the
    // table doesn't carry a phaseLabel column, so we derive that from
    // the linked Note / SiteBrief at display time — null is acceptable
    // for the activity row.
    prisma.demoArtefact.findMany({
      orderBy: { generatedAt: "desc" }, take: 5,
      select: { id: true, businessName: true, generatedAt: true },
    }),
    prisma.literatureEntry.findMany({
      orderBy: { createdAt: "desc" }, take: 5,
      select: { id: true, title: true, createdAt: true, phaseLabel: true },
    }),
  ]);

  const merged: ActivityItem[] = [
    ...pitches.map((p) => ({
      id: p.id, source: "pitch", title: p.businessName,
      createdAt: p.createdAt, phaseLabel: p.phaseLabel,
    })),
    ...ops.map((o) => ({
      id: o.id, source: `ops:${o.type}`,
      title: o.body ?? o.decision ?? o.whatFailed ?? o.whatChanged ?? "—",
      createdAt: o.createdAt, phaseLabel: o.phaseLabel,
    })),
    ...revenue.map((r) => ({
      id: r.id, source: "revenue",
      title: `${r.dealReference ?? "—"} · £${Number(r.amount).toFixed(2)}`,
      createdAt: r.createdAt, phaseLabel: r.phaseLabel,
    })),
    ...demos.map((d) => ({
      id: d.id, source: "demo", title: d.businessName,
      createdAt: d.generatedAt, phaseLabel: "Phase 1",
    })),
    ...literature.map((l) => ({
      id: l.id, source: "literature", title: l.title,
      createdAt: l.createdAt, phaseLabel: l.phaseLabel,
    })),
  ];

  merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return merged.slice(0, 20);
}

export default async function DashboardPage() {
  const data = await loadDashboard();
  const now = new Date();

  if (!data.ok) {
    return (
      <div className="p-6">
        <div className="border border-status-rejected/40 bg-status-rejected/5 px-4 py-3">
          <div className="h-section text-status-rejected">database unreachable</div>
          <div className="font-mono text-xs text-fg-muted mt-2">
            {data.error}
          </div>
          <div className="font-mono text-xs text-fg-dim mt-3">
            Run <code>npx prisma migrate deploy</code> against DATABASE_URL,
            then apply <code>prisma/sql/embeddings_index.sql</code>.
          </div>
        </div>
      </div>
    );
  }

  const totalSectionTarget = data.sections.reduce(
    (s, sec) => s + (sec.wordCountTarget ?? 0), 0,
  );
  const totalSectionWritten = data.sections.reduce((s, sec) => s + sec.wordCount, 0);
  const sectionsByStatus = countByStatus(data.sections.map((s) => s.status));
  const daysToDeadline = data.dissertation?.submissionDeadline
    ? Math.ceil(
        (data.dissertation.submissionDeadline.getTime() - now.getTime())
          / (1000 * 60 * 60 * 24),
      )
    : null;

  const currentPhasePitches =
    data.pitchByPhase.find((p) => p.phaseLabel === data.phase)?._count._all ?? 0;
  const dataSufficiency = Math.min(
    1, currentPhasePitches / METHODOLOGY_MIN_PITCHES_PER_PHASE,
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={`${format(now, "EEE dd LLL yyyy · HH:mm")} · operator overview · everything else is one click away`}
        actions={<PhasePill phase={data.phase} />}
      />

      <Section
        title="state of play"
        framer="Headline numbers across the sales pipeline. Click a tile for the full table."
        cta={{ href: "/sales", label: "all pitches" }}
      >
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-px bg-border border border-border">
          <StatTile label="total pitches" value={data.pitchCount.toLocaleString()} />
          <StatTile label="close rate" value={`${(data.closeRate * 100).toFixed(1)}%`} hint={`${data.closedCount} of ${data.pitchedCount} pitched`} />
          <StatTile label="revenue to date" value={`£${data.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
          <StatTile label="cac" value={data.cac > 0 ? `£${data.cac.toFixed(2)}` : "—"} hint="cost per close" />
          <StatTile label="demos built" value={data.activeDemos.toLocaleString()} hint="lifetime via /build-demo skill" />
        </div>
      </Section>

      <Section
        title="recent activity"
        framer="Every event hitting the warehouse, newest first — pitches, ops notes, demos, revenue, literature."
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 border border-border bg-bg-panel">
            <div className="px-4 py-2 border-b border-border flex items-center justify-between">
              <span className="h-section">timeline</span>
              <span className="font-mono text-2xs text-fg-dim">last 20</span>
            </div>
            {data.recent.length === 0 ? (
              <div className="px-4 py-8 text-center font-mono text-xs text-fg-dim">
                No activity yet.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {data.recent.map((item) => (
                  <li
                    key={`${item.source}-${item.id}`}
                    className="px-4 py-2 flex items-center gap-3 hover:bg-bg-hover"
                  >
                    <span className="font-mono text-2xs text-fg-dim w-24 shrink-0 uppercase">
                      {item.source}
                    </span>
                    <span className="font-mono text-xs text-fg flex-1 truncate">
                      {item.title}
                    </span>
                    <PhasePill phase={item.phaseLabel} className="shrink-0" />
                    <span className="font-mono text-2xs text-fg-dim w-24 shrink-0 text-right">
                      {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border border-border bg-bg-panel">
            <div className="px-4 py-2 border-b border-border">
              <span className="h-section">quick capture</span>
              <div className="font-sans text-2xs text-fg-dim mt-0.5">
                Drop something into the vault without leaving the dashboard.
              </div>
            </div>
            <ul className="divide-y divide-border">
              <QuickAction href="/notes/new" label="Add note" />
              <QuickAction href="/sales/new" label="Log pitch" />
              <QuickAction href="/operations/new?type=decision" label="Log decision" />
              <QuickAction href="/leads/new" label="Add lead" />
              <QuickAction href="/search" label="Search the vault" />
            </ul>

            <div className="px-4 py-2 border-t border-border">
              <span className="h-section">pitch outcomes</span>
              <div className="font-sans text-2xs text-fg-dim mt-0.5">
                Breakdown by outcome status, all time.
              </div>
            </div>
            <ul className="divide-y divide-border">
              {pitchOutcomesFromGroup(data.pitchOutcomes).map(([outcome, count]) => (
                <li key={outcome} className="px-4 py-2 flex items-center gap-3">
                  <StatusPill status={outcome} />
                  <span className="font-mono text-xs text-fg ml-auto">{count}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section
        title="dissertation"
        framer="Thesis word-count progress, deadlines, methodology data sufficiency. Tracked separately from sales ops."
        cta={{ href: "/dissertation", label: "open thesis tracker" }}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border">
          <StatTile
            label="days to submission"
            value={daysToDeadline ?? "—"}
            hint={data.dissertation?.submissionDeadline
              ? format(data.dissertation.submissionDeadline, "dd LLL yyyy")
              : "no deadline set"}
          />
          <StatTile
            label="word count progress"
            value={totalSectionTarget > 0
              ? `${((totalSectionWritten / totalSectionTarget) * 100).toFixed(0)}%`
              : "—"}
            hint={`${totalSectionWritten.toLocaleString()} / ${totalSectionTarget.toLocaleString()}`}
          />
          <StatTile
            label="literature count"
            value={data.literatureCount.toLocaleString()}
          />
          <StatTile
            label="data sufficiency"
            value={`${(dataSufficiency * 100).toFixed(0)}%`}
            hint={`${currentPhasePitches} / ${METHODOLOGY_MIN_PITCHES_PER_PHASE} pitches in ${data.phase}`}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border mt-px">
          {(["not_started", "draft", "in_progress", "complete"] as const).map((status) => (
            <StatTile
              key={status}
              label={`sections ${status.replace("_", " ")}`}
              value={sectionsByStatus[status] ?? 0}
            />
          ))}
        </div>
      </Section>
    </div>
  );
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <a
        href={href}
        className="block px-4 py-2 font-sans text-sm text-fg-muted hover:text-fg hover:bg-bg-hover"
      >
        {label}
      </a>
    </li>
  );
}

function countByStatus(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

function pitchOutcomesFromGroup(
  group: Array<{ outcome: string; _count: { _all: number } }>,
): [string, number][] {
  return group.map((g) => [g.outcome, g._count._all]);
}
