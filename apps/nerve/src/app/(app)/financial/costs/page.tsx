import { prisma } from "@/lib/db";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, HeaderLink, HeaderPrimary } from "@/components/PageHeader";
import { PhasePill } from "@/components/PhasePill";
import { FinancialSubNav } from "../_components/SubNav";

export const dynamic = "force-dynamic";

const CATEGORY_COLOR: Record<string, string> = {
  infrastructure: "text-phase-one",
  compute: "text-phase-two",
  tools: "text-phase-three",
  misc: "text-fg-muted",
};

interface SearchParams { category?: string }

export default async function CostsPage({ searchParams }: { searchParams: SearchParams }) {
  const where = searchParams.category &&
    ["infrastructure", "compute", "tools", "misc"].includes(searchParams.category)
      ? { category: searchParams.category as "infrastructure" | "compute" | "tools" | "misc" }
      : {};

  const [rows, totals, byCategory] = await Promise.all([
    prisma.costEntry.findMany({ where, orderBy: { date: "desc" }, take: 500 }),
    prisma.costEntry.aggregate({ where, _sum: { amount: true }, _count: { _all: true } }),
    prisma.costEntry.groupBy({
      by: ["category"], _sum: { amount: true }, _count: { _all: true },
    }),
  ]);

  const sum = Number(totals._sum.amount ?? 0);

  return (
    <div className="p-6">
      <FinancialSubNav />
      <PageHeader
        title="Costs"
        subtitle={`${totals._count._all.toLocaleString()} entr${totals._count._all === 1 ? "y" : "ies"} · £${sum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total`}
        actions={
          <>
            <HeaderLink href="/api/financial/costs/export?format=csv">csv</HeaderLink>
            <HeaderLink href="/api/financial/costs/export?format=json">json</HeaderLink>
            <HeaderPrimary href="/financial/costs/new">+ cost</HeaderPrimary>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border mb-4">
        {(["infrastructure", "compute", "tools", "misc"] as const).map((cat) => {
          const c = byCategory.find((g) => g.category === cat);
          const value = Number(c?._sum.amount ?? 0);
          const active = searchParams.category === cat;
          return (
            <Link key={cat}
              href={active ? "/financial/costs" : `/financial/costs?category=${cat}`}
              className={`bg-bg-panel px-4 py-3 hover:bg-bg-hover ${active ? "border-l-2 border-accent" : ""}`}>
              <div className="h-section">{cat}</div>
              <div className={`font-mono text-lg mt-0.5 leading-none ${CATEGORY_COLOR[cat]}`}>
                £{value.toFixed(2)}
              </div>
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">
          No costs logged yet.
        </div>
      ) : (
        <div className="border border-border bg-bg-panel">
          <table className="nv-table">
            <thead>
              <tr>
                <th>date</th>
                <th>category</th>
                <th className="text-right">amount</th>
                <th>notes</th>
                <th>phase</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer">
                  <td>
                    <Link href={`/financial/costs/${r.id}`} className="text-fg hover:underline">
                      {format(r.date, "dd LLL yyyy")}
                    </Link>
                  </td>
                  <td className={`uppercase ${CATEGORY_COLOR[r.category]}`}>{r.category}</td>
                  <td className="text-right text-status-rejected">£{Number(r.amount).toFixed(2)}</td>
                  <td className="text-fg-muted truncate max-w-md">{r.notes ?? "—"}</td>
                  <td><PhasePill phase={r.phaseLabel} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
