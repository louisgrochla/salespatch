import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { LegalSubNav } from "../../_components/SubNav";
import { IpForm } from "../_form";
import { updateIp, deleteIp } from "../actions";

export const dynamic = "force-dynamic";

export default async function Page({
  params, searchParams,
}: { params: { id: string }; searchParams: { edit?: string } }) {
  const r = await prisma.ipDocument.findUnique({ where: { id: params.id } });
  if (!r) notFound();
  const editing = searchParams.edit === "1";
  const updateAction = updateIp.bind(null, r.id);
  const deleteAction = deleteIp.bind(null, r.id);
  return (
    <div className="p-6">
      <LegalSubNav />
      <PageHeader title={r.title} subtitle={`${r.type.replace("_", " ")} · ${format(r.date, "dd LLL yyyy")}${r.reference ? ` · ${r.reference}` : ""}`}
        actions={editing ? <HeaderLink href={`/legal/ip/${r.id}`}>cancel edit</HeaderLink> : (
          <>
            <form action={deleteAction}><button type="submit" className="font-mono text-2xs uppercase tracking-wider text-status-rejected hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">delete</button></form>
            <HeaderLink href={`/legal/ip/${r.id}?edit=1`}>edit</HeaderLink>
            <Link href="/legal/ip" className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1">back</Link>
          </>
        )} />
      {editing ? (
        <IpForm action={updateAction} cancelHref={`/legal/ip/${r.id}`} submitLabel="Save changes" initial={r} />
      ) : (
        <div className="border border-border bg-bg-panel max-w-2xl px-4 py-3">
          <div className="h-section mb-1">description</div>
          <pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">{r.description ?? "—"}</pre>
        </div>
      )}
    </div>
  );
}
