import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { LeadForm } from "../_form";
import { updateLead, deleteLead } from "../actions";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params, searchParams,
}: { params: { id: string }; searchParams: { edit?: string } }) {
  const l = await prisma.leadRecord.findUnique({ where: { id: params.id } });
  if (!l) notFound();
  const editing = searchParams.edit === "1";
  const updateAction = updateLead.bind(null, l.id);
  const deleteAction = deleteLead.bind(null, l.id);

  return (
    <div className="p-6">
      <PageHeader
        title={l.name}
        subtitle={`${l.contactedStatus.replace("_", " ")}${l.doNotContact ? " · DNC" : ""}`}
        actions={editing ? (
          <HeaderLink href={`/leads/${l.id}`}>cancel edit</HeaderLink>
        ) : (
          <>
            <form action={deleteAction}>
              <button type="submit" className="font-mono text-2xs uppercase tracking-wider text-status-rejected hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">delete</button>
            </form>
            <HeaderLink href={`/leads/${l.id}?edit=1`}>edit</HeaderLink>
            <Link href="/leads" className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1">back</Link>
          </>
        )}
      />
      {editing ? (
        <LeadForm action={updateAction} cancelHref={`/leads/${l.id}`} submitLabel="Save changes" initial={l} />
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border max-w-2xl">
          <Row label="type">{l.type ?? "—"}</Row>
          <Row label="sector">{l.sector ?? "—"}</Row>
          <Row label="location">{l.location ?? "—"}</Row>
          <Row label="source">{l.sourceMethod ?? "—"}</Row>
          <Row label="notes"><pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">{l.notes ?? "—"}</pre></Row>
        </div>
      )}
    </div>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[10rem_1fr] gap-3 px-4 py-2"><div className="h-section pt-0.5">{label}</div><div className="font-mono text-xs text-fg">{children}</div></div>;
}
