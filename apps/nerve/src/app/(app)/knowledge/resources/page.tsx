import { prisma } from "@/lib/db";
import Link from "next/link";
import { PageHeader, HeaderPrimary } from "@/components/PageHeader";
import { KnowledgeSubNav } from "../_components/SubNav";
export const dynamic = "force-dynamic";
export default async function Page() {
  const items = await prisma.externalResource.findMany({ orderBy: { toolName: "asc" } });
  return (
    <div className="p-6">
      <KnowledgeSubNav />
      <PageHeader title="External resources" subtitle={`${items.length}`}
        actions={<HeaderPrimary href="/knowledge/resources/new">+ resource</HeaderPrimary>} />
      {items.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">No resources yet.</div>
      ) : (
        <div className="border border-border bg-bg-panel">
          <table className="nv-table">
            <thead><tr><th>tool</th><th>purpose</th><th>url</th></tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="cursor-pointer">
                  <td><Link href={`/knowledge/resources/${r.id}`} className="text-fg hover:underline">{r.toolName}</Link></td>
                  <td className="text-fg-muted">{r.purpose}</td>
                  <td><a href={r.url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline truncate inline-block max-w-md">{r.url}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
