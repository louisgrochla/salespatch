import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { PhasePill } from "@/components/PhasePill";
import { ResearchSubNav } from "../../_components/SubNav";
import { MethodologyForm } from "../_form";
import { updateMethodology, deleteMethodology } from "../actions";

export const dynamic = "force-dynamic";

export default async function MethodologyDetailPage({
  params, searchParams,
}: { params: { id: string }; searchParams: { edit?: string } }) {
  const d = await prisma.methodologyDoc.findUnique({ where: { id: params.id } });
  if (!d) notFound();

  const editing = searchParams.edit === "1";
  const updateAction = updateMethodology.bind(null, d.id);
  const deleteAction = deleteMethodology.bind(null, d.id);

  return (
    <div className="p-6">
      <ResearchSubNav />
      <PageHeader
        title={`Methodology: ${d.phaseName}`}
        actions={
          editing ? (
            <HeaderLink href={`/research/methodology/${d.id}`}>cancel edit</HeaderLink>
          ) : (
            <>
              <form action={deleteAction}>
                <button type="submit"
                  className="font-mono text-2xs uppercase tracking-wider text-status-rejected
                             hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">
                  delete
                </button>
              </form>
              <HeaderLink href={`/research/methodology/${d.id}?edit=1`}>edit</HeaderLink>
              <Link href="/research/methodology" className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1">
                back
              </Link>
            </>
          )
        }
      />

      {editing ? (
        <MethodologyForm action={updateAction} cancelHref={`/research/methodology/${d.id}`} submitLabel="Save changes" initial={d} />
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border max-w-3xl">
          <Block label="phase"><PhasePill phase={d.phaseName} /></Block>
          <Block label="formal description" value={d.formalDescription} />
          <Block label="mixed-methods justification" value={d.mixedMethodsJustification} />
          <Block label="sample size notes" value={d.sampleSizeNotes} />
          <Block label="statistical approach" value={d.statisticalApproach} />
          <Block label="GDPR handling" value={d.gdprHandling} />
          <Block label="NERVE as infrastructure" value={d.nerveAsInfrastructure} />
        </div>
      )}
    </div>
  );
}

function Block({ label, value, children }: { label: string; value?: string | null; children?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[12rem_1fr] gap-3 px-4 py-3">
      <div className="h-section pt-0.5">{label}</div>
      {children ?? (
        <pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">{value ?? "—"}</pre>
      )}
    </div>
  );
}
