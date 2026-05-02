import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { LegalSubNav } from "../../_components/SubNav";
import { GdprForm } from "../_form";
import { updateGdpr, deleteGdpr } from "../actions";

export const dynamic = "force-dynamic";

export default async function Page({
  params, searchParams,
}: { params: { id: string }; searchParams: { edit?: string } }) {
  const r = await prisma.gdprRecord.findUnique({ where: { id: params.id } });
  if (!r) notFound();
  const editing = searchParams.edit === "1";
  const updateAction = updateGdpr.bind(null, r.id);
  const deleteAction = deleteGdpr.bind(null, r.id);
  return (
    <div className="p-6">
      <LegalSubNav />
      <PageHeader title={r.dataType}
        actions={editing ? <HeaderLink href={`/legal/gdpr/${r.id}`}>cancel edit</HeaderLink> : (
          <>
            <form action={deleteAction}><button type="submit" className="font-mono text-2xs uppercase tracking-wider text-status-rejected hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">delete</button></form>
            <HeaderLink href={`/legal/gdpr/${r.id}?edit=1`}>edit</HeaderLink>
            <Link href="/legal/gdpr" className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1">back</Link>
          </>
        )} />
      {editing ? (
        <GdprForm action={updateAction} cancelHref={`/legal/gdpr/${r.id}`} submitLabel="Save changes" initial={r} />
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border max-w-2xl">
          <Row label="collection method"><pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">{r.collectionMethod}</pre></Row>
          <Row label="retention period">{r.retentionPeriod}</Row>
          <Row label="legal basis"><pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">{r.legalBasis}</pre></Row>
        </div>
      )}
    </div>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[10rem_1fr] gap-3 px-4 py-2"><div className="h-section pt-0.5">{label}</div><div className="font-mono text-xs text-fg">{children}</div></div>;
}
