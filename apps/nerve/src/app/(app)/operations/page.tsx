import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { PageHeader, HeaderLink, HeaderPrimary } from "@/components/PageHeader";
import { Timeline, type TimelineRow } from "./_components/Timeline";
import { OperationsFilters } from "./_components/OperationsFilters";

export const dynamic = "force-dynamic";

interface SearchParams {
  type?: string;
  phase?: string;
  tag?: string;
}

function buildWhere(p: SearchParams): Prisma.OperationsLogWhereInput {
  const where: Prisma.OperationsLogWhereInput = {};
  if (p.type === "weekly" || p.type === "decision" || p.type === "failure" || p.type === "iteration") {
    where.type = p.type;
  }
  if (p.phase) where.phaseLabel = p.phase;
  if (p.tag) where.tags = { has: p.tag };
  return where;
}

export default async function OperationsPage({ searchParams }: { searchParams: SearchParams }) {
  const where = buildWhere(searchParams);

  const [rows, phases, totals] = await Promise.all([
    prisma.operationsLog.findMany({ where, orderBy: { date: "desc" }, take: 500 }),
    prisma.phaseBoundary.findMany({ orderBy: { startDate: "asc" }, select: { name: true } }),
    prisma.operationsLog.groupBy({ by: ["type"], where, _count: { _all: true } }),
  ]);

  const totalCount = totals.reduce((s, t) => s + t._count._all, 0);
  const exportQuery = new URLSearchParams(
    Object.entries(searchParams).filter(([, v]) => v) as [string, string][],
  ).toString();

  const timelineRows: TimelineRow[] = rows;

  return (
    <div className="p-6">
      <PageHeader
        title="Operations Log"
        subtitle={`${totalCount.toLocaleString()} entr${totalCount === 1 ? "y" : "ies"} matching filters`}
        actions={
          <>
            <HeaderLink href={`/api/operations/export?format=csv${exportQuery ? `&${exportQuery}` : ""}`}>csv</HeaderLink>
            <HeaderLink href={`/api/operations/export?format=json${exportQuery ? `&${exportQuery}` : ""}`}>json</HeaderLink>
            <HeaderPrimary href="/operations/new">+ new entry</HeaderPrimary>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border mb-4">
        {(["weekly", "decision", "failure", "iteration"] as const).map((t) => {
          const count = totals.find((x) => x.type === t)?._count._all ?? 0;
          return (
            <div key={t} className="bg-bg-panel px-4 py-3">
              <div className="h-section">{t}</div>
              <div className="font-mono text-2xl text-fg mt-1 leading-none">{count}</div>
            </div>
          );
        })}
      </div>

      <OperationsFilters phases={phases.map((p) => p.name)} />

      <Timeline rows={timelineRows} />

      {rows.length === 500 && (
        <div className="mt-3 font-mono text-2xs text-fg-dim">
          Showing first 500 — narrow filters or export to see the rest.
        </div>
      )}
    </div>
  );
}
