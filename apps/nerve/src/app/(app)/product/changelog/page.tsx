import { prisma } from "@/lib/db";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, HeaderPrimary } from "@/components/PageHeader";
import { ProductSubNav } from "../_components/SubNav";

export const dynamic = "force-dynamic";

export default async function ChangelogPage() {
  const entries = await prisma.systemChangelog.findMany({ orderBy: { date: "desc" } });
  return (
    <div className="p-6">
      <ProductSubNav />
      <PageHeader title="System changelog"
        subtitle={`${entries.length} entr${entries.length === 1 ? "y" : "ies"}`}
        actions={<HeaderPrimary href="/product/changelog/new">+ entry</HeaderPrimary>} />
      {entries.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">No changelog entries.</div>
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border">
          {entries.map((e) => (
            <Link key={e.id} href={`/product/changelog/${e.id}`} className="block px-4 py-3 hover:bg-bg-hover">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-2xs text-fg-dim w-24">{format(e.date, "dd LLL yyyy")}</span>
                <span className="font-mono text-2xs text-fg-muted">v{e.version}</span>
                <span className="font-mono text-xs text-fg flex-1 truncate">{e.whatChanged}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
