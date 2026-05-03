import { prisma } from "@/lib/db";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { PageHeader, HeaderLink, HeaderPrimary } from "@/components/PageHeader";
import { ProductSubNav } from "../_components/SubNav";

export const dynamic = "force-dynamic";

export default async function PromptsPage() {
  const prompts = await prisma.promptLibraryEntry.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { versions: true } } },
  });

  return (
    <div className="p-6">
      <ProductSubNav />
      <PageHeader
        title="Prompt Library"
        subtitle={`${prompts.length} prompt${prompts.length === 1 ? "" : "s"} · every iteration kept, never deleted`}
        actions={
          <>
            <HeaderLink href="/api/product/prompts/export?format=csv">csv</HeaderLink>
            <HeaderLink href="/api/product/prompts/export?format=json">json</HeaderLink>
            <HeaderPrimary href="/product/prompts/new">+ new prompt</HeaderPrimary>
          </>
        }
      />

      {prompts.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">
          No prompts yet.
        </div>
      ) : (
        <div className="border border-border bg-bg-panel">
          <table className="nv-table">
            <thead>
              <tr>
                <th>name</th>
                <th>model</th>
                <th className="text-right">version</th>
                <th className="text-right">history</th>
                <th>tags</th>
                <th>updated</th>
              </tr>
            </thead>
            <tbody>
              {prompts.map((p) => (
                <tr key={p.id} className="cursor-pointer">
                  <td>
                    <Link href={`/product/prompts/${p.id}`} className="text-fg hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  <td className="text-fg-muted">{p.model}</td>
                  <td className="text-right font-mono">v{p.versionNumber}</td>
                  <td className="text-right text-fg-dim">{p._count.versions}</td>
                  <td>
                    {p.tags.length === 0 ? <span className="text-fg-dim">—</span> : (
                      <div className="flex gap-1 flex-wrap">
                        {p.tags.map((t) => (
                          <span key={t} className="border border-border px-1 py-0.5 text-2xs">{t}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="text-fg-dim">{formatDistanceToNow(p.updatedAt, { addSuffix: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
