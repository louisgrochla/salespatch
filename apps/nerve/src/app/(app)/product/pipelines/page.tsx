import { prisma } from "@/lib/db";
import Link from "next/link";
import { PageHeader, HeaderPrimary } from "@/components/PageHeader";
import { ProductSubNav } from "../_components/SubNav";
export const dynamic = "force-dynamic";
export default async function PipelinesPage() {
  const items = await prisma.pipelineDoc.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="p-6">
      <ProductSubNav />
      <PageHeader title="Pipelines" subtitle={`${items.length}`}
        actions={<HeaderPrimary href="/product/pipelines/new">+ pipeline</HeaderPrimary>} />
      {items.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">No pipelines documented.</div>
      ) : (
        <div className="border border-border bg-bg-panel">
          <table className="nv-table">
            <thead><tr><th>name</th><th>version</th><th>description</th></tr></thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="cursor-pointer">
                  <td><Link href={`/product/pipelines/${p.id}`} className="text-fg hover:underline">{p.name}</Link></td>
                  <td className="text-fg-dim">v{p.version}</td>
                  <td className="text-fg-muted truncate max-w-md">{p.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
