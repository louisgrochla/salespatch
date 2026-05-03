import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import Link from "next/link";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { ChangelogFilters } from "./_components/ChangelogFilters";
import { Timeline, type TimelineRow } from "./_components/Timeline";

export const dynamic = "force-dynamic";

const PROJECT_TYPES = [
  "nerve", "salespatch", "ios_app", "sl_mas_pipeline", "spit_out", "other",
] as const;

interface SearchParams {
  projectType?: string;
  project?: string;
  phase?: string;
  tag?: string;
}

function buildWhere(p: SearchParams): Prisma.ChangelogEntryWhereInput {
  const where: Prisma.ChangelogEntryWhereInput = {};
  if (p.projectType && (PROJECT_TYPES as readonly string[]).includes(p.projectType)) {
    where.projectType = p.projectType as (typeof PROJECT_TYPES)[number];
  }
  if (p.project) where.project = p.project;
  if (p.phase) where.phaseLabel = p.phase;
  if (p.tag) where.tags = { has: p.tag };
  return where;
}

export default async function ChangelogPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const where = buildWhere(searchParams);

  const [rows, phaseRows, projectRows, totalsByType] = await Promise.all([
    prisma.changelogEntry.findMany({
      where,
      orderBy: { sessionDate: "desc" },
      take: 200,
    }),
    prisma.phaseBoundary.findMany({
      orderBy: { startDate: "asc" },
      select: { name: true },
    }),
    prisma.changelogEntry.findMany({
      distinct: ["project"],
      orderBy: { project: "asc" },
      select: { project: true },
    }),
    prisma.changelogEntry.groupBy({
      by: ["projectType"],
      where,
      _count: { _all: true },
    }),
  ]);

  const totalCount = totalsByType.reduce((s, t) => s + t._count._all, 0);

  const timelineRows: TimelineRow[] = rows.map((r) => ({
    id: r.id,
    project: r.project,
    projectType: r.projectType,
    sessionSummary: r.sessionSummary,
    whatChanged: r.whatChanged,
    why: r.why,
    decisionsMade: r.decisionsMade,
    problemsEncountered: r.problemsEncountered,
    currentState: r.currentState,
    whatsNext: r.whatsNext,
    filesModified: r.filesModified,
    tags: r.tags,
    sessionDate: r.sessionDate,
    sessionDurationMinutes: r.sessionDurationMinutes,
    phaseLabel: r.phaseLabel,
    retrospectiveNote: r.retrospectiveNote,
    createdAt: r.createdAt,
  }));

  return (
    <div className="p-6">
      <PageHeader
        title="Changelog"
        subtitle={
          <span>
            {totalCount.toLocaleString()} session{totalCount === 1 ? "" : "s"} matching filters · auto-logged via{" "}
            <code className="bg-bg-raised px-1 border border-border">/nerve-log</code> from Claude Code
          </span>
        }
        actions={
          <>
            <HeaderLink href="/changelog/analytics">analytics</HeaderLink>
            <HeaderLink href="/search?sourceType=ChangelogEntry">search</HeaderLink>
          </>
        }
      />

      <div className="grid grid-cols-3 md:grid-cols-6 gap-px bg-border border border-border mb-4">
        {PROJECT_TYPES.map((t) => {
          const count = totalsByType.find((x) => x.projectType === t)?._count._all ?? 0;
          const active = searchParams.projectType === t;
          return (
            <Link
              key={t}
              href={
                active
                  ? buildLink({ ...searchParams, projectType: undefined })
                  : buildLink({ ...searchParams, projectType: t })
              }
              className={`bg-bg-panel px-3 py-2 hover:bg-bg-hover ${
                active ? "border-l-2 border-accent" : ""
              }`}
            >
              <div className="h-section truncate">{t}</div>
              <div className="font-mono text-xl text-fg mt-0.5 leading-none">{count}</div>
            </Link>
          );
        })}
      </div>

      <ChangelogFilters
        phases={phaseRows.map((p) => p.name)}
        projects={projectRows.map((p) => p.project)}
      />

      <Timeline rows={timelineRows} />

      {rows.length === 200 && (
        <div className="mt-3 font-mono text-2xs text-fg-dim">
          Showing first 200 — narrow filters to see older entries.
        </div>
      )}
    </div>
  );
}

function buildLink(params: Record<string, string | undefined>): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) next.set(k, v);
  }
  const qs = next.toString();
  return `/changelog${qs ? `?${qs}` : ""}`;
}
