import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { PhasePill } from "@/components/PhasePill";
import { FinancialSubNav } from "../../_components/SubNav";
import { RevenueForm } from "../_form";
import { updateRevenue, deleteRevenue } from "../actions";

export const dynamic = "force-dynamic";

export default async function RevenueDetailPage({
  params, searchParams,
}: { params: { id: string }; searchParams: { edit?: string } }) {
  const r = await prisma.revenueEntry.findUnique({ where: { id: params.id } });
  if (!r) notFound();

  const editing = searchParams.edit === "1";
  const updateAction = updateRevenue.bind(null, r.id);
  const deleteAction = deleteRevenue.bind(null, r.id);

  return (
    <div className="p-6">
      <FinancialSubNav />
      <PageHeader
        title={`Revenue · £${Number(r.amount).toFixed(2)}`}
        subtitle={`logged ${formatDistanceToNow(r.createdAt, { addSuffix: true })}`}
        actions={
          editing ? (
            <HeaderLink href={`/financial/revenue/${r.id}`}>cancel edit</HeaderLink>
          ) : (
            <>
              <form action={deleteAction}>
                <button type="submit"
                  className="font-mono text-2xs uppercase tracking-wider text-status-rejected
                             hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">
                  delete
                </button>
              </form>
              <HeaderLink href={`/financial/revenue/${r.id}?edit=1`}>edit</HeaderLink>
              <Link href="/financial/revenue" className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1">
                back
              </Link>
            </>
          )
        }
      />

      {editing ? (
        <RevenueForm action={updateAction} cancelHref={`/financial/revenue/${r.id}`} submitLabel="Save changes"
          initial={{ date: r.date, dealReference: r.dealReference, amount: Number(r.amount), notes: r.notes }} />
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border max-w-2xl">
          <Row label="date">{format(r.date, "EEE dd LLL yyyy")}</Row>
          <Row label="amount" className="text-status-closed">£{Number(r.amount).toFixed(2)}</Row>
          <Row label="deal">{r.dealReference ?? "—"}</Row>
          <Row label="phase"><PhasePill phase={r.phaseLabel} /></Row>
          <Row label="notes">
            <pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">{r.notes ?? "—"}</pre>
          </Row>
        </div>
      )}
    </div>
  );
}

function Row({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 px-4 py-2">
      <div className="h-section pt-0.5">{label}</div>
      <div className={`font-mono text-xs text-fg ${className ?? ""}`}>{children}</div>
    </div>
  );
}
