import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { ProductSubNav } from "../../_components/SubNav";
import { ModelForm } from "../_form";
import { updateModel, deleteModel } from "../actions";

export const dynamic = "force-dynamic";

export default async function Page({
  params, searchParams,
}: { params: { id: string }; searchParams: { edit?: string } }) {
  const r = await prisma.modelDoc.findUnique({ where: { id: params.id } });
  if (!r) notFound();
  const editing = searchParams.edit === "1";
  const updateAction = updateModel.bind(null, r.id);
  const deleteAction = deleteModel.bind(null, r.id);
  return (
    <div className="p-6">
      <ProductSubNav />
      <PageHeader title={r.name} subtitle={r.purpose}
        actions={editing ? <HeaderLink href={`/product/models/${r.id}`}>cancel edit</HeaderLink> : (
          <>
            <form action={deleteAction}><button type="submit" className="font-mono text-2xs uppercase tracking-wider text-status-rejected hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">delete</button></form>
            <HeaderLink href={`/product/models/${r.id}?edit=1`}>edit</HeaderLink>
            <Link href="/product/models" className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1">back</Link>
          </>
        )} />
      {editing ? (
        <ModelForm action={updateAction} cancelHref={`/product/models/${r.id}`} submitLabel="Save changes"
          initial={{ ...r, costPerCycle: r.costPerCycle == null ? null : Number(r.costPerCycle) }} />
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border max-w-3xl">
          <div className="px-4 py-3"><div className="h-section mb-1">cost per cycle</div><div className="font-mono text-xs text-fg">{r.costPerCycle == null ? "—" : `£${Number(r.costPerCycle).toFixed(4)}`}</div></div>
          <div className="px-4 py-3"><div className="h-section mb-1">training details</div><pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">{r.trainingDetails ?? "—"}</pre></div>
        </div>
      )}
    </div>
  );
}
