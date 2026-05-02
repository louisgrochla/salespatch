import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { KnowledgeSubNav } from "../../_components/SubNav";
import { ResourceForm } from "../_form";
import { updateResource, deleteResource } from "../actions";

export const dynamic = "force-dynamic";

export default async function Page({
  params, searchParams,
}: { params: { id: string }; searchParams: { edit?: string } }) {
  const r = await prisma.externalResource.findUnique({ where: { id: params.id } });
  if (!r) notFound();
  const editing = searchParams.edit === "1";
  const updateAction = updateResource.bind(null, r.id);
  const deleteAction = deleteResource.bind(null, r.id);
  return (
    <div className="p-6">
      <KnowledgeSubNav />
      <PageHeader title={r.toolName} subtitle={r.purpose}
        actions={editing ? <HeaderLink href={`/knowledge/resources/${r.id}`}>cancel edit</HeaderLink> : (
          <>
            <form action={deleteAction}><button type="submit" className="font-mono text-2xs uppercase tracking-wider text-status-rejected hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">delete</button></form>
            <HeaderLink href={`/knowledge/resources/${r.id}?edit=1`}>edit</HeaderLink>
            <Link href="/knowledge/resources" className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1">back</Link>
          </>
        )} />
      {editing ? (
        <ResourceForm action={updateAction} cancelHref={`/knowledge/resources/${r.id}`} submitLabel="Save changes" initial={r} />
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border max-w-2xl">
          <div className="px-4 py-2 grid grid-cols-[6rem_1fr] gap-3"><div className="h-section pt-0.5">url</div><a href={r.url} target="_blank" rel="noreferrer noopener" className="font-mono text-xs text-accent hover:underline break-all">{r.url}</a></div>
          <div className="px-4 py-2 grid grid-cols-[6rem_1fr] gap-3"><div className="h-section pt-0.5">notes</div><pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">{r.notes ?? "—"}</pre></div>
        </div>
      )}
    </div>
  );
}
