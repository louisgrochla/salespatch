import Link from "next/link";
import { format, formatDistanceToNow, subDays } from "date-fns";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { Section } from "@/components/Section";
import { cn } from "@/lib/cn";
import { qaVisualResultStore, type QaVisualResultRow } from "@/lib/sl-mas/qaVisualResultStore";

export const dynamic = "force-dynamic";

interface SearchParams {
  critical?: string;
  lead?: string;
  vertical?: string;
}

interface BugFindingLike {
  severity?: string;
  location?: string;
  finding?: string;
}

const REVIEW_LIMIT = 100;

export default async function QaVisualPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const onlyCritical = searchParams.critical === "1";
  const leadFilter = searchParams.lead?.trim() || null;
  const verticalFilter = searchParams.vertical?.trim() || null;

  const where: import("@prisma/client").Prisma.QaVisualResultWhereInput = {};
  if (onlyCritical) where.hasCritical = true;
  if (leadFilter) where.leadId = leadFilter;

  const weekAgo = subDays(new Date(), 7);

  const [
    totalReviews,
    weekReviews,
    latestRun,
    criticalLast50,
    rows,
    criticalRows,
    baselines,
  ] = await Promise.all([
    prisma.qaVisualResult.count(),
    prisma.qaVisualResult.count({ where: { ranAt: { gte: weekAgo } } }),
    prisma.qaVisualResult.findFirst({ orderBy: { ranAt: "desc" }, select: { ranAt: true } }),
    prisma.qaVisualResult.findMany({
      orderBy: { ranAt: "desc" },
      take: 50,
      select: { hasCritical: true },
    }),
    prisma.qaVisualResult.findMany({
      where,
      orderBy: { ranAt: "desc" },
      take: REVIEW_LIMIT,
    }),
    qaVisualResultStore.listWithCritical(10),
    qaVisualResultStore.computeBaselines(verticalFilter),
  ]);

  const criticalRate =
    criticalLast50.length > 0
      ? criticalLast50.filter((r) => r.hasCritical).length / criticalLast50.length
      : 0;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Visual QA"
        subtitle="Six-layer vision review across every demo. Critical bugs gate the build verdict. Brand / voice / customer reaction grades feed the cohort baselines below."
      />

      <Section
        title="state of play"
        framer="Coverage and severity at a glance. Last-50-review denominator on critical rate so the number tracks current pipeline health, not lifetime."
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border">
          <StatTile label="total reviews" value={totalReviews.toLocaleString()} />
          <StatTile
            label="critical rate"
            value={`${(criticalRate * 100).toFixed(0)}%`}
            hint="of last 50 runs"
          />
          <StatTile
            label="reviews this week"
            value={weekReviews.toLocaleString()}
            hint={`since ${format(weekAgo, "dd LLL")}`}
          />
          <StatTile
            label="latest run"
            value={
              latestRun
                ? formatDistanceToNow(latestRun.ranAt, { addSuffix: false })
                : "—"
            }
            hint={latestRun ? format(latestRun.ranAt, "dd LLL · HH:mm") : "no runs yet"}
          />
        </div>
      </Section>

      <Section
        title="cohort baselines"
        framer={
          verticalFilter
            ? `Medians and rates across runs in the ${verticalFilter} vertical only.`
            : "Medians and rates across every run (no vertical filter). Below n=10 the medians stay null — sample noise dominates."
        }
      >
        {baselines.baselines_available && baselines.medians && baselines.cohort_rates ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border">
            <StatTile
              label="brand fidelity (median)"
              value={baselines.medians.brand_fidelity?.toFixed(1) ?? "—"}
              hint={`n=${baselines.total_n}`}
            />
            <StatTile
              label="voice consistency (median)"
              value={baselines.medians.voice_consistency?.toFixed(1) ?? "—"}
            />
            <StatTile
              label="section grades (mean of medians)"
              value={baselines.medians.section_grades_mean?.toFixed(1) ?? "—"}
            />
            <StatTile
              label="critical bug rate"
              value={`${baselines.cohort_rates.has_critical_pct}%`}
            />
            <StatTile
              label="owner would buy"
              value={`${baselines.cohort_rates.would_buy_yes_pct}%`}
            />
            <StatTile
              label="customer would act"
              value={`${baselines.cohort_rates.would_act_yes_pct}%`}
            />
            <StatTile
              label="trust at glance · high"
              value={`${baselines.cohort_rates.trust_high_pct}%`}
            />
            <StatTile
              label="test of success passes"
              value={`${baselines.cohort_rates.test_passes_pct}%`}
            />
          </div>
        ) : (
          <div className="border border-border bg-bg-panel px-4 py-3 font-mono text-xs text-fg-dim">
            {baselines.sample_size_warning ?? "Not enough data yet."}
          </div>
        )}
      </Section>

      <Section
        title="critical bugs"
        framer="Latest reviews flagged with at least one critical finding. Critical = shop owner would notice in 5 seconds. Anything here gates the build verdict."
      >
        {criticalRows.length === 0 ? (
          <div className="border border-border bg-bg-panel px-4 py-3 font-mono text-xs text-fg-dim">
            No critical bugs in any recent review. (Good sign — or a sign of a
            silently failing scanner. Spot-check `apps/nerve/scripts/qa-visual-VERIFICATION.md`.)
          </div>
        ) : (
          <div className="border border-border bg-bg-panel divide-y divide-border">
            {criticalRows.map((r) => (
              <CriticalRow key={r.qa_visual_id} row={r} />
            ))}
          </div>
        )}
      </Section>

      <Section
        title={`recent reviews (${rows.length})`}
        framer="Every six-layer review, newest first. Use the filter to narrow to a single lead or to critical-only."
      >
        <form
          method="get"
          className="border border-border bg-bg-panel px-4 py-3 flex items-end gap-3 flex-wrap"
        >
          <label className="block">
            <span className="h-section block mb-1">lead id / slug</span>
            <input
              type="text"
              name="lead"
              defaultValue={leadFilter ?? ""}
              placeholder="the-tartan-pig"
              className="w-48 font-mono text-xs bg-bg-raised border border-border px-2 py-1 text-fg"
            />
          </label>
          <label className="block">
            <span className="h-section block mb-1">vertical (for baselines)</span>
            <input
              type="text"
              name="vertical"
              defaultValue={verticalFilter ?? ""}
              placeholder="cafe"
              className="w-40 font-mono text-xs bg-bg-raised border border-border px-2 py-1 text-fg"
            />
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              name="critical"
              value="1"
              defaultChecked={onlyCritical}
              className="accent-fg"
            />
            <span className="font-mono text-2xs uppercase tracking-wider text-fg-muted">
              critical only
            </span>
          </label>
          <button
            type="submit"
            className="font-mono text-2xs uppercase tracking-wider bg-fg text-bg hover:bg-fg-muted px-3 py-1"
          >
            filter
          </button>
          {(leadFilter || verticalFilter || onlyCritical) && (
            <Link
              href="/qa"
              className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border px-2 py-1"
            >
              reset
            </Link>
          )}
        </form>

        {rows.length === 0 ? (
          <div className="border border-border bg-bg-panel px-4 py-6 font-mono text-xs text-fg-dim text-center">
            No reviews match this filter.
          </div>
        ) : (
          <div className="border border-border bg-bg-panel overflow-x-auto">
            <table className="nv-table">
              <thead>
                <tr>
                  <th>ran at</th>
                  <th>lead</th>
                  <th>model</th>
                  <th className="text-right">bugs</th>
                  <th>critical</th>
                  <th className="text-right">brand</th>
                  <th className="text-right">voice</th>
                  <th>failed layers</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.qaVisualId}>
                    <td className="font-mono text-2xs">
                      {format(r.ranAt, "dd LLL · HH:mm")}
                    </td>
                    <td className="font-mono text-xs">
                      <Link
                        href={`/leads/${r.leadId}`}
                        className="text-accent hover:text-fg"
                      >
                        {r.leadId}
                      </Link>
                    </td>
                    <td className="font-mono text-2xs text-fg-muted">{r.model}</td>
                    <td className="text-right font-mono text-xs">{r.bugCount ?? "—"}</td>
                    <td
                      className={cn(
                        "font-mono text-2xs uppercase",
                        r.hasCritical === true && "text-status-rejected",
                        r.hasCritical === false && "text-status-closed",
                        r.hasCritical === null && "text-fg-dim",
                      )}
                    >
                      {r.hasCritical === null ? "—" : r.hasCritical ? "yes" : "no"}
                    </td>
                    <td className="text-right font-mono text-xs">
                      {gradeOf(r.brandFidelity, "overall_grade")}
                    </td>
                    <td className="text-right font-mono text-xs">
                      {gradeOf(r.voiceConsistency, "overall_grade")}
                    </td>
                    <td className="font-mono text-2xs text-fg-muted truncate max-w-xs">
                      {asLayerList(r.failedLayers)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function CriticalRow({ row }: { row: QaVisualResultRow }) {
  const bugs = (row.bugs ?? []) as BugFindingLike[];
  const critical = bugs.filter((b) => b.severity === "critical").slice(0, 3);
  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-baseline gap-3 flex-wrap">
        <Link
          href={`/leads/${row.lead_id}`}
          className="font-mono text-xs text-accent hover:text-fg"
        >
          {row.lead_id}
        </Link>
        <span className="font-mono text-2xs text-fg-dim">
          {format(new Date(row.ran_at), "dd LLL · HH:mm")}
        </span>
        <span className="font-mono text-2xs text-fg-dim">{row.model}</span>
        <span className="font-mono text-2xs uppercase tracking-wider text-status-rejected">
          {row.bug_count ?? 0} bug{row.bug_count === 1 ? "" : "s"}
        </span>
      </div>
      {critical.length === 0 ? (
        <div className="font-mono text-xs text-fg-dim">
          Marked critical, but no bug-list payload — older review row.
        </div>
      ) : (
        <ul className="space-y-1">
          {critical.map((b, i) => (
            <li key={i} className="font-mono text-xs text-fg-muted">
              <span className="text-status-rejected uppercase">[{b.severity ?? "?"}]</span>{" "}
              <span className="text-fg">{b.location ?? "—"}</span>
              {b.finding && <span> — {b.finding}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function gradeOf(record: unknown, key: string): string {
  if (!record || typeof record !== "object") return "—";
  const v = (record as Record<string, unknown>)[key];
  if (typeof v === "number") return v.toFixed(1);
  if (typeof v === "string") return v;
  return "—";
}

function asLayerList(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "—";
  return value.filter((v) => typeof v === "string").join(", ");
}
