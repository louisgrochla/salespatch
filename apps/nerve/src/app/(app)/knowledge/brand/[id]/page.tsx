import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { Markdown } from "@/components/Markdown";
import { KnowledgeSubNav } from "../../_components/SubNav";
import { BrandForm } from "../_form";
import { updateBrand, deleteBrand } from "../actions";

export const dynamic = "force-dynamic";

export default async function Page({
  params, searchParams,
}: { params: { id: string }; searchParams: { edit?: string } }) {
  const d = await prisma.brandDocument.findUnique({ where: { id: params.id } });
  if (!d) notFound();
  const editing = searchParams.edit === "1";
  const updateAction = updateBrand.bind(null, d.id);
  const deleteAction = deleteBrand.bind(null, d.id);
  return (
    <div className="p-6">
      <KnowledgeSubNav />
      <PageHeader title={d.title}
        actions={editing ? <HeaderLink href={`/knowledge/brand/${d.id}`}>cancel edit</HeaderLink> : (
          <>
            <form action={deleteAction}><button type="submit" className="font-mono text-2xs uppercase tracking-wider text-status-rejected hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">delete</button></form>
            <HeaderLink href={`/knowledge/brand/${d.id}?edit=1`}>edit</HeaderLink>
            <Link href="/knowledge/brand" className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1">back</Link>
          </>
        )} />
      {editing ? (
        <BrandForm action={updateAction} cancelHref={`/knowledge/brand/${d.id}`} submitLabel="Save changes" initial={d} />
      ) : (
        <article className="border border-border bg-bg-panel p-6 max-w-4xl"><Markdown source={d.body} /></article>
      )}
    </div>
  );
}
