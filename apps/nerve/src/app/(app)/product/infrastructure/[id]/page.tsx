import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { ProductSubNav } from "../../_components/SubNav";
import { InfraForm } from "../_form";
import { updateInfra, deleteInfra } from "../actions";

export const dynamic = "force-dynamic";

export default async function InfraDetail({
  params, searchParams,
}: { params: { id: string }; searchParams: { edit?: string } }) {
  const r = await prisma.infrastructureNote.findUnique({ where: { id: params.id } });
  if (!r) notFound();
  const editing = searchParams.edit === "1";
  const updateAction = updateInfra.bind(null, r.id);
  const deleteAction = deleteInfra.bind(null, r.id);
  return (
    <div className="p-6">
      <ProductSubNav />
      <PageHeader title={r.serviceName} subtitle={r.purpose}
        actions={editing ? <HeaderLink href={`/product/infrastructure/${r.id}`}>cancel edit</HeaderLink> : (
          <>
            <form action={deleteAction}><button type="submit" className="font-mono text-2xs uppercase tracking-wider text-status-rejected hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">delete</button></form>
            <HeaderLink href={`/product/infrastructure/${r.id}?edit=1`}>edit</HeaderLink>
            <Link href="/product/infrastructure" className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1">back</Link>
          </>
        )} />
      {editing ? (
        <InfraForm action={updateAction} cancelHref={`/product/infrastructure/${r.id}`} submitLabel="Save changes" initial={r} />
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border max-w-3xl">
          <Row label="date">{format(r.date, "EEE dd LLL yyyy")}</Row>
          <Row label="config notes"><pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">{r.configNotes ?? "—"}</pre></Row>
        </div>
      )}
    </div>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[10rem_1fr] gap-3 px-4 py-2"><div className="h-section pt-0.5">{label}</div><div className="font-mono text-xs text-fg">{children}</div></div>;
}
