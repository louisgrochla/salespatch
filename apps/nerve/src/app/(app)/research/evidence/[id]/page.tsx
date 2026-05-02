import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { ResearchSubNav } from "../../_components/SubNav";
import { EvidenceForm } from "../_form";
import { updateEvidence, deleteEvidence } from "../actions";
import { resolveEvidenceSource } from "@/lib/evidence";

export const dynamic = "force-dynamic";

export default async function EvidenceDetailPage({
  params, searchParams,
}: { params: { id: string }; searchParams: { edit?: string } }) {
  const e = await prisma.evidenceLog.findUnique({
    where: { id: params.id },
    include: { dissertationSection: true },
  });
  if (!e) notFound();

  const editing = searchParams.edit === "1";
  const updateAction = updateEvidence.bind(null, e.id);
  const deleteAction = deleteEvidence.bind(null, e.id);

  const sections = await prisma.dissertationSection.findMany({
    orderBy: { chapter: "asc" }, select: { id: true, chapter: true },
  });
  const src = await resolveEvidenceSource(e.sourceType, e.sourceId);

  return (
    <div className="p-6">
      <ResearchSubNav />
      <PageHeader
        title="Evidence Entry"
        subtitle={`logged ${format(e.createdAt, "dd LLL yyyy · HH:mm")}`}
        actions={
          editing ? (
            <HeaderLink href={`/research/evidence/${e.id}`}>cancel edit</HeaderLink>
          ) : (
            <>
              <form action={deleteAction}>
                <button type="submit"
                  className="font-mono text-2xs uppercase tracking-wider text-status-rejected
                             hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">
                  delete
                </button>
              </form>
              <HeaderLink href={`/research/evidence/${e.id}?edit=1`}>edit</HeaderLink>
              <Link href="/research/evidence" className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1">
                back
              </Link>
            </>
          )
        }
      />

      {editing ? (
        <EvidenceForm
          action={updateAction}
          sections={sections}
          cancelHref={`/research/evidence/${e.id}`}
          submitLabel="Save changes"
          initial={{
            sourceType: e.sourceType,
            sourceId: e.sourceId,
            dissertationSectionId: e.dissertationSectionId,
            annotation: e.annotation,
          }}
        />
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border max-w-3xl">
          <div className="px-4 py-3">
            <div className="h-section mb-1">source</div>
            <div className="flex items-center gap-3 mb-1">
              <span className="pill border-fg-muted/40 text-fg-muted">{e.sourceType}</span>
              <span className="font-mono text-xs text-fg">{src.title}</span>
              {!src.exists && <span className="font-mono text-2xs text-status-rejected">[unresolved]</span>}
            </div>
            {src.hint && <div className="font-mono text-2xs text-fg-muted">{src.hint}</div>}
            {src.url && (
              <div className="mt-1">
                <Link href={src.url} className="text-accent underline text-xs">open source row</Link>
              </div>
            )}
            <div className="font-mono text-2xs text-fg-dim mt-2">id: {e.sourceId}</div>
          </div>
          <div className="px-4 py-3">
            <div className="h-section mb-1">cited in</div>
            {e.dissertationSection
              ? <Link href={`/research/sections/${e.dissertationSection.id}`} className="text-accent underline">{e.dissertationSection.chapter}</Link>
              : <span className="text-fg-dim">unbound</span>}
          </div>
          <div className="px-4 py-3">
            <div className="h-section mb-1">annotation</div>
            <pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">{e.annotation}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
