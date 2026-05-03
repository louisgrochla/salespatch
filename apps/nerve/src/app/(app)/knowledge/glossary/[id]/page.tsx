import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { KnowledgeSubNav } from "../../_components/SubNav";
import { TermForm } from "../_form";
import { updateTerm, deleteTerm } from "../actions";

export const dynamic = "force-dynamic";

export default async function Page({
  params, searchParams,
}: { params: { id: string }; searchParams: { edit?: string } }) {
  const r = await prisma.glossaryEntry.findUnique({ where: { id: params.id } });
  if (!r) notFound();
  const editing = searchParams.edit === "1";
  const updateAction = updateTerm.bind(null, r.id);
  const deleteAction = deleteTerm.bind(null, r.id);
  return (
    <div className="p-6">
      <KnowledgeSubNav />
      <PageHeader title={r.term}
        actions={editing ? <HeaderLink href={`/knowledge/glossary/${r.id}`}>cancel edit</HeaderLink> : (
          <>
            <form action={deleteAction}><button type="submit" className="font-mono text-2xs uppercase tracking-wider text-status-rejected hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">delete</button></form>
            <HeaderLink href={`/knowledge/glossary/${r.id}?edit=1`}>edit</HeaderLink>
            <Link href="/knowledge/glossary" className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1">back</Link>
          </>
        )} />
      {editing ? (
        <TermForm action={updateAction} cancelHref={`/knowledge/glossary/${r.id}`} submitLabel="Save changes" initial={r} />
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border max-w-2xl">
          <div className="px-4 py-3"><div className="h-section mb-1">definition</div><pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">{r.definition}</pre></div>
          <div className="px-4 py-3"><div className="h-section mb-1">context</div><pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">{r.context ?? "—"}</pre></div>
        </div>
      )}
    </div>
  );
}
