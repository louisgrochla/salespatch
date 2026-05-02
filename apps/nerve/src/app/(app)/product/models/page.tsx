import { prisma } from "@/lib/db";
import Link from "next/link";
import { PageHeader, HeaderPrimary } from "@/components/PageHeader";
import { ProductSubNav } from "../_components/SubNav";
export const dynamic = "force-dynamic";
export default async function Page() {
  const items = await prisma.modelDoc.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="p-6">
      <ProductSubNav />
      <PageHeader title="Models" subtitle={`${items.length}`}
        actions={<HeaderPrimary href="/product/models/new">+ model</HeaderPrimary>} />
      {items.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">No models documented.</div>
      ) : (
        <div className="border border-border bg-bg-panel">
          <table className="nv-table">
            <thead><tr><th>name</th><th>purpose</th><th className="text-right">cost / cycle</th></tr></thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} className="cursor-pointer">
                  <td><Link href={`/product/models/${m.id}`} className="text-fg hover:underline">{m.name}</Link></td>
                  <td className="text-fg-muted">{m.purpose}</td>
                  <td className="text-right">{m.costPerCycle == null ? "—" : `£${Number(m.costPerCycle).toFixed(4)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
