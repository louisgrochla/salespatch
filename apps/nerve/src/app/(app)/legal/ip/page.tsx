import { prisma } from "@/lib/db";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, HeaderPrimary } from "@/components/PageHeader";
import { LegalSubNav } from "../_components/SubNav";
export const dynamic = "force-dynamic";
export default async function Page() {
  const items = await prisma.ipDocument.findMany({ orderBy: { date: "desc" } });
  return (
    <div className="p-6">
      <LegalSubNav />
      <PageHeader title="Intellectual property" subtitle={`${items.length}`}
        actions={<HeaderPrimary href="/legal/ip/new">+ ip record</HeaderPrimary>} />
      {items.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">No IP records yet.</div>
      ) : (
        <div className="border border-border bg-bg-panel">
          <table className="nv-table">
            <thead><tr><th>type</th><th>title</th><th>date</th><th>reference</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="cursor-pointer">
                  <td className="text-fg-muted uppercase">{i.type.replace("_", " ")}</td>
                  <td><Link href={`/legal/ip/${i.id}`} className="text-fg hover:underline">{i.title}</Link></td>
                  <td>{format(i.date, "dd LLL yyyy")}</td>
                  <td className="font-mono text-fg-muted">{i.reference ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
