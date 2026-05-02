import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { PhasePill } from "@/components/PhasePill";
import { FinancialSubNav } from "../../_components/SubNav";
import { CostForm } from "../_form";
import { updateCost, deleteCost } from "../actions";

export const dynamic = "force-dynamic";

export default async function CostDetailPage({
  params, searchParams,
}: { params: { id: string }; searchParams: { edit?: string } }) {
  const r = await prisma.costEntry.findUnique({ where: { id: params.id } });
  if (!r) notFound();

  const editing = searchParams.edit === "1";
  const updateAction = updateCost.bind(null, r.id);
  const deleteAction = deleteCost.bind(null, r.id);

  return (
    <div className="p-6">
      <FinancialSubNav />
      <PageHeader
        title={`${r.category} · £${Number(r.amount).toFixed(2)}`}
        subtitle={`logged ${formatDistanceToNow(r.createdAt, { addSuffix: true })}`}
        actions={
          editing ? (
            <HeaderLink href={`/financial/costs/${r.id}`}>cancel edit</HeaderLink>
          ) : (
            <>
              <form action={deleteAction}>
                <button type="submit"
                  className="font-mono text-2xs uppercase tracking-wider text-status-rejected
                             hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">
                  delete
                </button>
              </form>
              <HeaderLink href={`/financial/costs/${r.id}?edit=1`}>edit</HeaderLink>
              <Link href="/financial/costs" className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1">
                back
              </Link>
            </>
          )
        }
      />

      {editing ? (
        <CostForm action={updateAction} cancelHref={`/financial/costs/${r.id}`} submitLabel="Save changes"
          initial={{ date: r.date, category: r.category, amount: Number(r.amount), notes: r.notes }} />
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border max-w-2xl">
          <Row label="date">{format(r.date, "EEE dd LLL yyyy")}</Row>
          <Row label="category">{r.category}</Row>
          <Row label="amount" className="text-status-rejected">£{Number(r.amount).toFixed(2)}</Row>
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
