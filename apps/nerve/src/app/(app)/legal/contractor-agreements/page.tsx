import { prisma } from "@/lib/db";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, HeaderPrimary } from "@/components/PageHeader";
import { LegalSubNav } from "../_components/SubNav";
export const dynamic = "force-dynamic";
export default async function Page() {
  const items = await prisma.contractorAgreementVersion.findMany({ orderBy: { date: "desc" } });
  return (
    <div className="p-6">
      <LegalSubNav />
      <PageHeader title="Contractor agreement versions" subtitle={`${items.length}`}
        actions={<HeaderPrimary href="/legal/contractor-agreements/new">+ version</HeaderPrimary>} />
      {items.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">No agreement versions yet.</div>
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border">
          {items.map((a) => (
            <Link key={a.id} href={`/legal/contractor-agreements/${a.id}`} className="block px-4 py-3 hover:bg-bg-hover flex items-baseline justify-between">
              <span className="font-mono text-xs text-fg">v{a.version}</span>
              <span className="font-mono text-2xs text-fg-dim">{format(a.date, "dd LLL yyyy")}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
