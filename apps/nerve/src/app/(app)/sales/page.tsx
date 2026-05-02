import { prisma } from "@/lib/db";
import { PageHeader, HeaderLink, HeaderPrimary } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { PitchTable, type PitchRow } from "./_components/PitchTable";
import { SalesFilters, type FilterOptions } from "./_components/SalesFilters";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

interface SearchParams {
  outcome?: string;
  phase?: string;
  sector?: string;
  businessType?: string;
  leadSource?: string;
  demoVersion?: string;
  contractorId?: string;
  q?: string;
}

function buildWhere(p: SearchParams): Prisma.PitchLogWhereInput {
  const where: Prisma.PitchLogWhereInput = {};
  if (p.outcome === "closed" || p.outcome === "rejected" || p.outcome === "follow_up") {
    where.outcome = p.outcome;
  }
  if (p.phase) where.phaseLabel = p.phase;
  if (p.sector) where.sector = p.sector;
  if (p.businessType) where.businessType = p.businessType;
  if (p.leadSource) where.leadSource = p.leadSource;
  if (p.demoVersion) where.demoVersion = p.demoVersion;
  if (p.contractorId) where.contractorId = p.contractorId;
  if (p.q) where.businessName = { contains: p.q, mode: "insensitive" };
  return where;
}

async function loadFilterOptions(): Promise<FilterOptions> {
  const [phases, sectors, businessTypes, leadSources, demoVersions, contractors] =
    await Promise.all([
      prisma.phaseBoundary.findMany({ orderBy: { startDate: "asc" }, select: { name: true } }),
      prisma.pitchLog.findMany({ where: { sector: { not: null } }, distinct: ["sector"], select: { sector: true } }),
      prisma.pitchLog.findMany({ where: { businessType: { not: null } }, distinct: ["businessType"], select: { businessType: true } }),
      prisma.pitchLog.findMany({ where: { leadSource: { not: null } }, distinct: ["leadSource"], select: { leadSource: true } }),
      prisma.pitchLog.findMany({ where: { demoVersion: { not: null } }, distinct: ["demoVersion"], select: { demoVersion: true } }),
      prisma.pitchLog.findMany({ where: { contractorId: { not: null } }, distinct: ["contractorId"], select: { contractorId: true } }),
    ]);

  return {
    phases: phases.map((p) => p.name),
    sectors: sectors.map((s) => s.sector!).sort(),
    businessTypes: businessTypes.map((s) => s.businessType!).sort(),
    leadSources: leadSources.map((s) => s.leadSource!).sort(),
    demoVersions: demoVersions.map((s) => s.demoVersion!).sort(),
    contractors: contractors.map((s) => s.contractorId!).sort(),
  };
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const where = buildWhere(searchParams);

  const [pitches, options, totals] = await Promise.all([
    prisma.pitchLog.findMany({
      where,
      orderBy: { date: "desc" },
      include: { objections: { include: { objection: true } } },
      take: 500,
    }),
    loadFilterOptions(),
    prisma.pitchLog.groupBy({
      by: ["outcome"], where, _count: { _all: true },
    }),
  ]);

  const totalCount = totals.reduce((s, t) => s + t._count._all, 0);
  const closedCount = totals.find((t) => t.outcome === "closed")?._count._all ?? 0;
  const rejectedCount = totals.find((t) => t.outcome === "rejected")?._count._all ?? 0;
  const followUpCount = totals.find((t) => t.outcome === "follow_up")?._count._all ?? 0;
  const closeRate = totalCount > 0 ? closedCount / totalCount : 0;

  const rows: PitchRow[] = pitches.map((p) => ({
    id: p.id,
    date: p.date.toISOString(),
    businessName: p.businessName,
    businessType: p.businessType,
    sector: p.sector,
    leadSource: p.leadSource,
    demoVersion: p.demoVersion,
    outcome: p.outcome,
    contractorId: p.contractorId,
    pitchDuration: p.pitchDuration,
    phaseLabel: p.phaseLabel,
    objections: p.objections.map((o) => o.objection.name),
  }));

  const exportQuery = new URLSearchParams(
    Object.entries(searchParams).filter(([, v]) => v) as [string, string][],
  ).toString();
  const csvHref = `/api/sales/export?format=csv${exportQuery ? `&${exportQuery}` : ""}`;
  const jsonHref = `/api/sales/export?format=json${exportQuery ? `&${exportQuery}` : ""}`;

  return (
    <div className="p-6">
      <PageHeader
        title="Sales Intelligence"
        subtitle={`${totalCount.toLocaleString()} pitch${totalCount === 1 ? "" : "es"} matching filters`}
        actions={
          <>
            <HeaderLink href="/sales/analytics">analytics</HeaderLink>
            <HeaderLink href={csvHref}>csv</HeaderLink>
            <HeaderLink href={jsonHref}>json</HeaderLink>
            <HeaderPrimary href="/sales/new">+ new pitch</HeaderPrimary>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border mb-4">
        <StatTile label="total" value={totalCount.toLocaleString()} />
        <StatTile label="closed" value={closedCount.toLocaleString()} hint={`${(closeRate * 100).toFixed(1)}% close rate`} />
        <StatTile label="rejected" value={rejectedCount.toLocaleString()} />
        <StatTile label="follow up" value={followUpCount.toLocaleString()} />
      </div>

      <SalesFilters options={options} />

      <PitchTable rows={rows} />

      {pitches.length === 500 && (
        <div className="mt-3 font-mono text-2xs text-fg-dim">
          Showing first 500 — narrow filters or export to see the rest.
        </div>
      )}
    </div>
  );
}
