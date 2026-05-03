import { prisma } from "@/lib/db";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, HeaderPrimary } from "@/components/PageHeader";
import { LegalSubNav } from "../_components/SubNav";
export const dynamic = "force-dynamic";
export default async function Page() {
  const items = await prisma.companiesHouseRecord.findMany({ orderBy: { date: "desc" } });
  return (
    <div className="p-6">
      <LegalSubNav />
      <PageHeader title="Companies House" subtitle={`${items.length} filing${items.length === 1 ? "" : "s"}`}
        actions={<HeaderPrimary href="/legal/companies-house/new">+ filing</HeaderPrimary>} />
      {items.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">No filings yet.</div>
      ) : (
        <div className="border border-border bg-bg-panel">
          <table className="nv-table">
            <thead><tr><th>type</th><th>date</th><th>reference</th><th>description</th></tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="cursor-pointer">
                  <td><Link href={`/legal/companies-house/${c.id}`} className="text-fg hover:underline">{c.filingType}</Link></td>
                  <td>{format(c.date, "dd LLL yyyy")}</td>
                  <td className="font-mono text-fg-muted">{c.reference ?? "—"}</td>
                  <td className="text-fg-muted truncate max-w-md">{c.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
