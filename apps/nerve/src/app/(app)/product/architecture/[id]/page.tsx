import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { Markdown } from "@/components/Markdown";
import { ProductSubNav } from "../../_components/SubNav";
import { ArchitectureForm } from "../_form";
import { updateArchitecture, deleteArchitecture } from "../actions";

export const dynamic = "force-dynamic";

export default async function ArchDetailPage({
  params, searchParams,
}: { params: { id: string }; searchParams: { edit?: string } }) {
  const d = await prisma.architectureDocument.findUnique({ where: { id: params.id } });
  if (!d) notFound();
  const editing = searchParams.edit === "1";
  const updateAction = updateArchitecture.bind(null, d.id);
  const deleteAction = deleteArchitecture.bind(null, d.id);

  return (
    <div className="p-6">
      <ProductSubNav />
      <PageHeader
        title={d.title}
        subtitle={`v${d.version} · ${format(d.date, "dd LLL yyyy")}`}
        actions={editing ? <HeaderLink href={`/product/architecture/${d.id}`}>cancel edit</HeaderLink> : (
          <>
            <form action={deleteAction}><button type="submit" className="font-mono text-2xs uppercase tracking-wider text-status-rejected hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">delete</button></form>
            <HeaderLink href={`/product/architecture/${d.id}?edit=1`}>edit</HeaderLink>
            <Link href="/product/architecture" className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1">back</Link>
          </>
        )}
      />
      {editing ? (
        <ArchitectureForm action={updateAction} cancelHref={`/product/architecture/${d.id}`} submitLabel="Save changes" initial={d} />
      ) : (
        <article className="border border-border bg-bg-panel p-6 max-w-4xl">
          <Markdown source={d.body} />
          {d.tags.length > 0 && (
            <div className="flex gap-1 mt-4 flex-wrap pt-4 border-t border-border">
              {d.tags.map((t) => <span key={t} className="font-mono text-2xs text-fg-dim border border-border px-1.5 py-0.5">{t}</span>)}
            </div>
          )}
        </article>
      )}
    </div>
  );
}
