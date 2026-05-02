import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { PhasePill } from "@/components/PhasePill";
import { ResearchSubNav } from "../../_components/SubNav";
import { PhaseForm } from "../_form";
import { updatePhase, deletePhase } from "../actions";

export const dynamic = "force-dynamic";

export default async function PhaseDetailPage({
  params, searchParams,
}: { params: { id: string }; searchParams: { edit?: string } }) {
  const phase = await prisma.phaseBoundary.findUnique({ where: { id: params.id } });
  if (!phase) notFound();

  const editing = searchParams.edit === "1";
  const updateAction = updatePhase.bind(null, phase.id);
  const deleteAction = deletePhase.bind(null, phase.id);

  const recordCount = await prisma.pitchLog.count({ where: { phaseLabel: phase.name } });

  return (
    <div className="p-6">
      <ResearchSubNav />
      <PageHeader
        title={phase.name}
        subtitle={`${recordCount} pitches tagged with this phase label`}
        actions={
          editing ? (
            <HeaderLink href={`/research/phases/${phase.id}`}>cancel edit</HeaderLink>
          ) : (
            <>
              <form action={deleteAction}>
                <button type="submit"
                  className="font-mono text-2xs uppercase tracking-wider text-status-rejected
                             hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">
                  delete
                </button>
              </form>
              <HeaderLink href={`/research/phases/${phase.id}?edit=1`}>edit</HeaderLink>
              <Link href="/research/phases" className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1">
                back
              </Link>
            </>
          )
        }
      />

      {editing ? (
        <PhaseForm action={updateAction} cancelHref={`/research/phases/${phase.id}`} submitLabel="Save changes"
          initial={{ name: phase.name, startDate: phase.startDate, endDate: phase.endDate, operationalDescription: phase.operationalDescription }} />
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border max-w-3xl">
          <Row label="phase"><PhasePill phase={phase.name} /></Row>
          <Row label="start">{format(phase.startDate, "EEE dd LLL yyyy")}</Row>
          <Row label="end">{phase.endDate ? format(phase.endDate, "EEE dd LLL yyyy") : "current"}</Row>
          <Row label="description">
            <pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">
              {phase.operationalDescription}
            </pre>
          </Row>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 px-4 py-2">
      <div className="h-section pt-0.5">{label}</div>
      <div className="font-mono text-xs text-fg">{children}</div>
    </div>
  );
}
