import { prisma } from "@/lib/db";
import Link from "next/link";
import { PageHeader, HeaderPrimary } from "@/components/PageHeader";
import { LegalSubNav } from "../_components/SubNav";
export const dynamic = "force-dynamic";
export default async function Page() {
  const items = await prisma.gdprRecord.findMany({ orderBy: { dataType: "asc" } });
  return (
    <div className="p-6">
      <LegalSubNav />
      <PageHeader title="GDPR records" subtitle={`${items.length} processing record${items.length === 1 ? "" : "s"}`}
        actions={<HeaderPrimary href="/legal/gdpr/new">+ record</HeaderPrimary>} />
      {items.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">No GDPR records yet.</div>
      ) : (
        <div className="border border-border bg-bg-panel">
          <table className="nv-table">
            <thead><tr><th>data type</th><th>basis</th><th>retention</th></tr></thead>
            <tbody>
              {items.map((g) => (
                <tr key={g.id} className="cursor-pointer">
                  <td><Link href={`/legal/gdpr/${g.id}`} className="text-fg hover:underline">{g.dataType}</Link></td>
                  <td className="text-fg-muted truncate max-w-md">{g.legalBasis}</td>
                  <td>{g.retentionPeriod}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
