import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { PageHeader, HeaderPrimary } from "@/components/PageHeader";
import { NotesList, type NotesListRow } from "./_components/NotesList";
import { NotesFilters } from "./_components/NotesFilters";

export const dynamic = "force-dynamic";

interface SearchParams {
  scope?: string;
  relatedSlug?: string;
  phase?: string;
  tag?: string;
}

const SCOPES = ["lead", "system", "pitch", "research", "other"] as const;
type Scope = (typeof SCOPES)[number];
function isScope(v: string | undefined): v is Scope {
  return SCOPES.includes(v as Scope);
}

function buildWhere(p: SearchParams): Prisma.NoteWhereInput {
  const where: Prisma.NoteWhereInput = {};
  if (isScope(p.scope)) where.scope = p.scope;
  if (p.relatedSlug) where.relatedSlug = p.relatedSlug;
  if (p.phase) where.phaseLabel = p.phase;
  if (p.tag) where.tags = { has: p.tag };
  return where;
}

export default async function NotesPage({ searchParams }: { searchParams: SearchParams }) {
  const where = buildWhere(searchParams);

  const [rows, phases, totals, allRelatedSlugs] = await Promise.all([
    prisma.note.findMany({ where, orderBy: { updatedAt: "desc" }, take: 500 }),
    prisma.phaseBoundary.findMany({ orderBy: { startDate: "asc" }, select: { name: true } }),
    prisma.note.groupBy({ by: ["scope"], where, _count: { _all: true } }),
    prisma.note.findMany({
      where: { relatedSlug: { not: null } },
      distinct: ["relatedSlug"],
      select: { relatedSlug: true },
      orderBy: { relatedSlug: "asc" },
    }),
  ]);

  const totalCount = totals.reduce((s, t) => s + t._count._all, 0);
  const relatedSlugs = allRelatedSlugs
    .map((r) => r.relatedSlug)
    .filter((s): s is string => s !== null);

  const listRows: NotesListRow[] = rows;

  return (
    <div className="p-6">
      <PageHeader
        title="Notes"
        subtitle={`${totalCount.toLocaleString()} note${totalCount === 1 ? "" : "s"} matching filters · context for you and the agents`}
        actions={<HeaderPrimary href="/notes/new">+ new note</HeaderPrimary>}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border border border-border mb-4">
        {SCOPES.map((s) => {
          const count = totals.find((x) => x.scope === s)?._count._all ?? 0;
          return (
            <div key={s} className="bg-bg-panel px-4 py-3">
              <div className="h-section">{s}</div>
              <div className="font-mono text-2xl text-fg mt-1 leading-none">{count}</div>
            </div>
          );
        })}
      </div>

      <NotesFilters
        phases={phases.map((p) => p.name)}
        relatedSlugs={relatedSlugs}
      />

      <NotesList rows={listRows} />

      {rows.length === 500 && (
        <div className="mt-3 font-mono text-2xs text-fg-dim">
          Showing first 500 — narrow filters to see the rest.
        </div>
      )}
    </div>
  );
}
