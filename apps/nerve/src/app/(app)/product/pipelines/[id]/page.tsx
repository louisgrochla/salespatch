import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { ProductSubNav } from "../../_components/SubNav";
import { PipelineForm } from "../_form";
import { updatePipeline, deletePipeline } from "../actions";

export const dynamic = "force-dynamic";

export default async function Page({
  params, searchParams,
}: { params: { id: string }; searchParams: { edit?: string } }) {
  const r = await prisma.pipelineDoc.findUnique({ where: { id: params.id } });
  if (!r) notFound();
  const editing = searchParams.edit === "1";
  const updateAction = updatePipeline.bind(null, r.id);
  const deleteAction = deletePipeline.bind(null, r.id);
  return (
    <div className="p-6">
      <ProductSubNav />
      <PageHeader title={r.name} subtitle={`v${r.version}`}
        actions={editing ? <HeaderLink href={`/product/pipelines/${r.id}`}>cancel edit</HeaderLink> : (
          <>
            <form action={deleteAction}><button type="submit" className="font-mono text-2xs uppercase tracking-wider text-status-rejected hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">delete</button></form>
            <HeaderLink href={`/product/pipelines/${r.id}?edit=1`}>edit</HeaderLink>
            <Link href="/product/pipelines" className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1">back</Link>
          </>
        )} />
      {editing ? (
        <PipelineForm action={updateAction} cancelHref={`/product/pipelines/${r.id}`} submitLabel="Save changes" initial={r} />
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border max-w-3xl">
          <div className="px-4 py-3"><div className="h-section mb-1">description</div><pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">{r.description}</pre></div>
          <div className="px-4 py-3"><div className="h-section mb-1">performance notes</div><pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">{r.performanceNotes ?? "—"}</pre></div>
        </div>
      )}
    </div>
  );
}
