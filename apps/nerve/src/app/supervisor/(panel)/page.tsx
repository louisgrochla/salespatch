import { prisma } from "@/lib/db";
import { format, formatDistanceToNow } from "date-fns";
import { SupervisorSubNav } from "./_components/SubNav";
import { Markdown } from "@/components/Markdown";

export const dynamic = "force-dynamic";

export default async function SupervisorOverviewPage() {
  const [meta, titleVersions, rqVersions, phases, sectionCount, literatureCount, evidenceCount, pitchCount] =
    await Promise.all([
      prisma.dissertationMeta.findUnique({ where: { id: "main" } }),
      prisma.workingTitleVersion.findMany({
        where: { dissertationId: "main" }, orderBy: { createdAt: "desc" },
      }),
      prisma.researchQuestionVersion.findMany({
        where: { dissertationId: "main" }, orderBy: { createdAt: "desc" },
      }),
      prisma.phaseBoundary.findMany({ orderBy: { startDate: "asc" } }),
      prisma.dissertationSection.count(),
      prisma.literatureEntry.count(),
      prisma.evidenceLog.count(),
      prisma.pitchLog.count(),
    ]);

  return (
    <div className="space-y-6">
      <SupervisorSubNav />

      <header>
        <div className="font-mono text-2xs uppercase tracking-wider text-fg-dim">
          research overview
        </div>
        <h1 className="font-sans text-2xl font-medium text-fg mt-1">
          {meta?.workingTitle ?? "Dissertation"}
        </h1>
        <div className="font-mono text-xs text-fg-dim mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {meta?.degree && <span>{meta.degree}</span>}
          {meta?.institution && <span>{meta.institution}</span>}
          {meta?.supervisor && <span>supervisor: {meta.supervisor}</span>}
          {meta?.submissionDeadline && (
            <span>submission: {format(meta.submissionDeadline, "dd LLL yyyy")}</span>
          )}
          {!meta?.submissionDeadline && meta?.submissionDeadlineNote && (
            <span>submission: {meta.submissionDeadlineNote}</span>
          )}
        </div>
      </header>

      {meta?.researchQuestion && (
        <section className="border border-border bg-bg-panel p-4">
          <div className="h-section mb-2">research question</div>
          <p className="font-sans text-base text-fg leading-relaxed">{meta.researchQuestion}</p>
        </section>
      )}

      {meta?.academicFraming && (
        <section className="border border-border bg-bg-panel p-4">
          <div className="h-section mb-2">academic framing</div>
          <Markdown source={meta.academicFraming} />
        </section>
      )}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border">
        <Tile label="pitch records" value={pitchCount.toLocaleString()} />
        <Tile label="dissertation sections" value={sectionCount.toLocaleString()} />
        <Tile label="literature entries" value={literatureCount.toLocaleString()} />
        <Tile label="evidence items" value={evidenceCount.toLocaleString()} />
      </section>

      <section>
        <div className="h-section mb-2">phase boundaries</div>
        <div className="border border-border bg-bg-panel">
          <table className="nv-table">
            <thead>
              <tr><th>phase</th><th>start</th><th>end</th><th>description</th></tr>
            </thead>
            <tbody>
              {phases.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-fg-dim py-3">No phases logged.</td></tr>
              ) : phases.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{format(p.startDate, "dd LLL yyyy")}</td>
                  <td>{p.endDate ? format(p.endDate, "dd LLL yyyy") : <span className="text-fg-dim">current</span>}</td>
                  <td className="text-fg-muted">{p.operationalDescription}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <HistoryBlock title={`working title revisions (${titleVersions.length})`}
          versions={titleVersions} />
        <HistoryBlock title={`research question revisions (${rqVersions.length})`}
          versions={rqVersions} />
      </section>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-panel px-4 py-3">
      <div className="h-section">{label}</div>
      <div className="font-mono text-2xl text-fg mt-1 leading-none">{value}</div>
    </div>
  );
}

function HistoryBlock({
  title, versions,
}: { title: string; versions: { id: string; value: string; createdAt: Date }[] }) {
  return (
    <div className="border border-border bg-bg-panel">
      <div className="px-3 py-2 border-b border-border h-section">{title}</div>
      {versions.length === 0 ? (
        <div className="px-3 py-4 font-mono text-xs text-fg-dim text-center">No revisions.</div>
      ) : (
        <ul className="divide-y divide-border">
          {versions.map((v, i) => (
            <li key={v.id} className="px-3 py-2">
              <div className="flex items-center gap-2 font-mono text-2xs text-fg-dim">
                <span className="text-fg-muted">v{versions.length - i}</span>
                <span>{format(v.createdAt, "dd LLL yyyy · HH:mm")}</span>
                <span className="ml-auto">{formatDistanceToNow(v.createdAt, { addSuffix: true })}</span>
              </div>
              <div className="font-mono text-xs text-fg whitespace-pre-wrap mt-1">{v.value}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
