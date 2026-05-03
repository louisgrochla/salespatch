import { prisma } from "@/lib/db";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, HeaderPrimary } from "@/components/PageHeader";
import { LegalSubNav } from "../_components/SubNav";
export const dynamic = "force-dynamic";
export default async function Page() {
  const items = await prisma.legalDocument.findMany({ orderBy: [{ type: "asc" }, { date: "desc" }] });
  return (
    <div className="p-6">
      <LegalSubNav />
      <PageHeader title="Legal documents" subtitle={`${items.length}`}
        actions={<HeaderPrimary href="/legal/documents/new">+ document</HeaderPrimary>} />
      {items.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">No legal documents yet.</div>
      ) : (
        <div className="border border-border bg-bg-panel">
          <table className="nv-table">
            <thead><tr><th>type</th><th>title</th><th>version</th><th>date</th></tr></thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id} className="cursor-pointer">
                  <td className="text-fg-muted">{d.type}</td>
                  <td><Link href={`/legal/documents/${d.id}`} className="text-fg hover:underline">{d.title}</Link></td>
                  <td className="font-mono">v{d.version}</td>
                  <td>{format(d.date, "dd LLL yyyy")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
