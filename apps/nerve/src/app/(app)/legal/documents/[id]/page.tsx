import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { Markdown } from "@/components/Markdown";
import { LegalSubNav } from "../../_components/SubNav";
import { DocForm } from "../_form";
import { updateDoc, deleteDoc } from "../actions";

export const dynamic = "force-dynamic";

export default async function Page({
  params, searchParams,
}: { params: { id: string }; searchParams: { edit?: string } }) {
  const r = await prisma.legalDocument.findUnique({ where: { id: params.id } });
  if (!r) notFound();
  const editing = searchParams.edit === "1";
  const updateAction = updateDoc.bind(null, r.id);
  const deleteAction = deleteDoc.bind(null, r.id);
  return (
    <div className="p-6">
      <LegalSubNav />
      <PageHeader title={r.title} subtitle={`${r.type} · v${r.version} · ${format(r.date, "dd LLL yyyy")}`}
        actions={editing ? <HeaderLink href={`/legal/documents/${r.id}`}>cancel edit</HeaderLink> : (
          <>
            <form action={deleteAction}><button type="submit" className="font-mono text-2xs uppercase tracking-wider text-status-rejected hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">delete</button></form>
            <HeaderLink href={`/legal/documents/${r.id}?edit=1`}>edit</HeaderLink>
            <Link href="/legal/documents" className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1">back</Link>
          </>
        )} />
      {editing ? (
        <DocForm action={updateAction} cancelHref={`/legal/documents/${r.id}`} submitLabel="Save changes" initial={r} />
      ) : (
        <div className="space-y-4 max-w-4xl">
          {r.content && <article className="border border-border bg-bg-panel p-6"><Markdown source={r.content} /></article>}
          {r.fileReference && (
            <div className="border border-border bg-bg-panel p-4 font-mono text-xs">
              <span className="text-fg-dim">file reference:</span> <span className="text-fg">{r.fileReference}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
