import { prisma } from "@/lib/db";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, HeaderPrimary } from "@/components/PageHeader";
import { ProductSubNav } from "../_components/SubNav";

export const dynamic = "force-dynamic";

export default async function InfraPage() {
  const items = await prisma.infrastructureNote.findMany({ orderBy: [{ serviceName: "asc" }] });
  return (
    <div className="p-6">
      <ProductSubNav />
      <PageHeader title="Infrastructure"
        subtitle={`${items.length} service${items.length === 1 ? "" : "s"}`}
        actions={<HeaderPrimary href="/product/infrastructure/new">+ service</HeaderPrimary>} />
      {items.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">No infrastructure logged.</div>
      ) : (
        <div className="border border-border bg-bg-panel">
          <table className="nv-table">
            <thead><tr><th>service</th><th>purpose</th><th>date</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="cursor-pointer">
                  <td><Link href={`/product/infrastructure/${i.id}`} className="text-fg hover:underline">{i.serviceName}</Link></td>
                  <td className="text-fg-muted">{i.purpose}</td>
                  <td className="text-fg-dim">{format(i.date, "dd LLL yyyy")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
