import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { Markdown } from "@/components/Markdown";
import { KnowledgeSubNav } from "../../_components/SubNav";
import { ProcessForm } from "../_form";
import { updateProcess, deleteProcess } from "../actions";

export const dynamic = "force-dynamic";

export default async function Page({
  params, searchParams,
}: { params: { id: string }; searchParams: { edit?: string } }) {
  const r = await prisma.processGuide.findUnique({ where: { id: params.id } });
  if (!r) notFound();
  const editing = searchParams.edit === "1";
  const updateAction = updateProcess.bind(null, r.id);
  const deleteAction = deleteProcess.bind(null, r.id);
  return (
    <div className="p-6">
      <KnowledgeSubNav />
      <PageHeader title={r.name} subtitle={`updated ${format(r.lastUpdated, "dd LLL yyyy")}`}
        actions={editing ? <HeaderLink href={`/knowledge/processes/${r.id}`}>cancel edit</HeaderLink> : (
          <>
            <form action={deleteAction}><button type="submit" className="font-mono text-2xs uppercase tracking-wider text-status-rejected hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">delete</button></form>
            <HeaderLink href={`/knowledge/processes/${r.id}?edit=1`}>edit</HeaderLink>
            <Link href="/knowledge/processes" className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1">back</Link>
          </>
        )} />
      {editing ? (
        <ProcessForm action={updateAction} cancelHref={`/knowledge/processes/${r.id}`} submitLabel="Save changes" initial={r} />
      ) : (
        <article className="border border-border bg-bg-panel p-6 max-w-4xl"><Markdown source={r.steps} /></article>
      )}
    </div>
  );
}
