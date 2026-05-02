import { prisma } from "@/lib/db";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, HeaderPrimary } from "@/components/PageHeader";
import { ProductSubNav } from "../_components/SubNav";

export const dynamic = "force-dynamic";

export default async function ArchitecturePage() {
  const docs = await prisma.architectureDocument.findMany({
    orderBy: [{ date: "desc" }, { title: "asc" }],
  });
  return (
    <div className="p-6">
      <ProductSubNav />
      <PageHeader title="Architecture documents"
        subtitle={`${docs.length} doc${docs.length === 1 ? "" : "s"}`}
        actions={<HeaderPrimary href="/product/architecture/new">+ new doc</HeaderPrimary>} />
      {docs.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">No architecture docs yet.</div>
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border">
          {docs.map((d) => (
            <Link key={d.id} href={`/product/architecture/${d.id}`} className="block px-4 py-3 hover:bg-bg-hover">
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="font-sans text-sm text-fg">{d.title}</span>
                <span className="font-mono text-2xs text-fg-dim">v{d.version}</span>
                <span className="font-mono text-2xs text-fg-dim ml-auto">{format(d.date, "dd LLL yyyy")}</span>
              </div>
              {d.tags.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {d.tags.map((t) => <span key={t} className="font-mono text-2xs text-fg-dim border border-border px-1.5 py-0.5">{t}</span>)}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
