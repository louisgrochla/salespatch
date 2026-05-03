import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { PhasePill } from "@/components/PhasePill";
import { DemoForm } from "../_form";
import { updateDemo, deleteDemo } from "../actions";

export const dynamic = "force-dynamic";

export default async function DemoDetailPage({
  params, searchParams,
}: { params: { id: string }; searchParams: { edit?: string } }) {
  const d = await prisma.demoRecord.findUnique({ where: { id: params.id } });
  if (!d) notFound();
  const editing = searchParams.edit === "1";
  const updateAction = updateDemo.bind(null, d.id);
  const deleteAction = deleteDemo.bind(null, d.id);

  return (
    <div className="p-6">
      <PageHeader
        title={d.businessName}
        subtitle={`built ${format(d.dateBuilt, "EEE dd LLL yyyy")}`}
        actions={editing ? (
          <HeaderLink href={`/demos/${d.id}`}>cancel edit</HeaderLink>
        ) : (
          <>
            <form action={deleteAction}>
              <button type="submit"
                className="font-mono text-2xs uppercase tracking-wider text-status-rejected
                           hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">
                delete
              </button>
            </form>
            <HeaderLink href={`/demos/${d.id}?edit=1`}>edit</HeaderLink>
            <Link href="/demos" className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1">back</Link>
          </>
        )}
      />
      {editing ? (
        <DemoForm action={updateAction} cancelHref={`/demos/${d.id}`} submitLabel="Save changes" initial={d} />
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border max-w-3xl">
          <Row label="sector">{d.sector ?? "—"}</Row>
          <Row label="url">{d.url ? <a href={d.url} target="_blank" rel="noreferrer noopener" className="text-accent underline break-all">{d.url}</a> : "—"}</Row>
          <Row label="file ref">{d.fileReference ?? "—"}</Row>
          <Row label="template">{d.templateVersion ?? "—"}</Row>
          <Row label="outcome">{d.conversionOutcome ?? "unpitched"}</Row>
          <Row label="phase"><PhasePill phase={d.phaseLabel} /></Row>
          <Row label="notes"><pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">{d.notes ?? "—"}</pre></Row>
        </div>
      )}
    </div>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[10rem_1fr] gap-3 px-4 py-2"><div className="h-section pt-0.5">{label}</div><div className="font-mono text-xs text-fg">{children}</div></div>;
}
