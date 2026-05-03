import { prisma } from "@/lib/db";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, HeaderLink, HeaderPrimary } from "@/components/PageHeader";
import { PhasePill } from "@/components/PhasePill";
import { FinancialSubNav } from "../_components/SubNav";

export const dynamic = "force-dynamic";

export default async function RevenuePage() {
  const [rows, total] = await Promise.all([
    prisma.revenueEntry.findMany({ orderBy: { date: "desc" }, take: 500 }),
    prisma.revenueEntry.aggregate({ _sum: { amount: true }, _count: { _all: true } }),
  ]);

  const sum = Number(total._sum.amount ?? 0);

  return (
    <div className="p-6">
      <FinancialSubNav />
      <PageHeader
        title="Revenue"
        subtitle={`${total._count._all.toLocaleString()} entr${total._count._all === 1 ? "y" : "ies"} · £${sum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total`}
        actions={
          <>
            <HeaderLink href="/api/financial/revenue/export?format=csv">csv</HeaderLink>
            <HeaderLink href="/api/financial/revenue/export?format=json">json</HeaderLink>
            <HeaderPrimary href="/financial/revenue/new">+ revenue</HeaderPrimary>
          </>
        }
      />

      {rows.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">
          No revenue logged yet.
        </div>
      ) : (
        <div className="border border-border bg-bg-panel">
          <table className="nv-table">
            <thead>
              <tr>
                <th>date</th>
                <th>deal</th>
                <th className="text-right">amount</th>
                <th>notes</th>
                <th>phase</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer">
                  <td>
                    <Link href={`/financial/revenue/${r.id}`} className="text-fg hover:underline">
                      {format(r.date, "dd LLL yyyy")}
                    </Link>
                  </td>
                  <td>{r.dealReference ?? <span className="text-fg-dim">—</span>}</td>
                  <td className="text-right text-status-closed">£{Number(r.amount).toFixed(2)}</td>
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
