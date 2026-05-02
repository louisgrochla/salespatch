import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { PhasePill } from "@/components/PhasePill";
import { Markdown } from "@/components/Markdown";
import { Field, TextArea, SubmitButton } from "@/components/Form";
import { ProjectBadge } from "../_components/ProjectBadge";
import { updateRetrospectiveNote, deleteChangelogEntry } from "../actions";

export const dynamic = "force-dynamic";

export default async function ChangelogDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { edit?: string };
}) {
  const row = await prisma.changelogEntry.findUnique({
    where: { id: params.id },
  });
  if (!row) notFound();

  const editing = searchParams.edit === "1";
  const noteAction = updateRetrospectiveNote.bind(null, row.id);
  const deleteAction = deleteChangelogEntry.bind(null, row.id);

  // Spec: "Link to related pitch data or dissertation sections if
  // phase_label present." Pull a small, cheap set so the user can see
  // what was happening academically when this session ran.
  const [pitchCountInPhase, sectionsInPhase] = await Promise.all([
    prisma.pitchLog.count({ where: { phaseLabel: row.phaseLabel } }),
    prisma.dissertationSection.findMany({
      where: { phaseLabel: row.phaseLabel },
      select: { id: true, chapter: true, status: true },
      orderBy: { chapter: "asc" },
      take: 12,
    }),
  ]);

  return (
    <div className="p-6 max-w-4xl">
      <PageHeader
        title={row.sessionSummary || "(no summary)"}
        subtitle={
          <span className="flex items-center gap-3">
            <ProjectBadge projectType={row.projectType} />
            <span className="text-fg">{row.project}</span>
            <span>·</span>
            <span>{format(row.sessionDate, "EEE dd LLL yyyy · HH:mm")}</span>
            <span className="text-fg-dim">
              logged {formatDistanceToNow(row.createdAt, { addSuffix: true })}
            </span>
          </span>
        }
        actions={
          <>
            {!editing && (
              <form action={deleteAction}>
                <button
                  type="submit"
                  className="font-mono text-2xs uppercase tracking-wider text-status-rejected
                             hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1"
                >
                  delete
                </button>
              </form>
            )}
            <HeaderLink
              href={editing ? `/changelog/${row.id}` : `/changelog/${row.id}?edit=1`}
            >
              {editing ? "cancel" : "add note"}
            </HeaderLink>
            <Link
              href="/changelog"
              className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg
                         border border-border hover:border-border-strong px-2 py-1"
            >
              back
            </Link>
          </>
        }
      />

      <div className="border border-border bg-bg-panel divide-y divide-border">
        <Row label="phase">
          <PhasePill phase={row.phaseLabel} />
        </Row>
        {row.sessionDurationMinutes != null && (
          <Row label="duration">{row.sessionDurationMinutes}m</Row>
        )}
        {row.tags.length > 0 && (
          <Row label="tags">
            <div className="flex flex-wrap gap-1">
              {row.tags.map((t) => (
                <Link
                  key={t}
                  href={`/changelog?tag=${encodeURIComponent(t)}`}
                  className="bg-bg-raised border border-border px-1.5 py-0.5 leading-none
                             hover:border-border-strong hover:text-fg text-fg-muted"
                >
                  {t}
                </Link>
              ))}
            </div>
          </Row>
        )}
        <Block label="what changed" value={row.whatChanged} />
        <Block label="why" value={row.why} />
        <Block label="decisions made" value={row.decisionsMade} />
        <Block label="problems encountered" value={row.problemsEncountered} />
        <Block label="current state" value={row.currentState} />
        <Block label="what's next" value={row.whatsNext} />
        {row.filesModified.length > 0 && (
          <Row label="files modified">
            <ul className="font-mono text-2xs text-fg-muted space-y-0.5">
              {row.filesModified.map((f) => (
                <li key={f} className="truncate">{f}</li>
              ))}
            </ul>
          </Row>
        )}

        {editing ? (
          <div className="px-4 py-3">
            <form action={noteAction} className="space-y-3 max-w-2xl">
              <Field
                label="retrospective note"
                hint="Founder-only — added after the fact. Markdown supported. Embedded with the entry."
              >
                <TextArea
                  name="retrospectiveNote"
                  defaultValue={row.retrospectiveNote ?? ""}
                  rows={6}
                  placeholder="Looking back, the X decision turned out to be Y because…"
                />
              </Field>
              <SubmitButton>Save note</SubmitButton>
            </form>
          </div>
        ) : row.retrospectiveNote ? (
          <div className="px-4 py-3">
            <div className="border border-accent/40 bg-accent/5 p-3">
              <div className="h-section text-accent mb-1">retrospective note</div>
              <Markdown source={row.retrospectiveNote} />
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-6 border border-border bg-bg-panel p-3">
        <div className="h-section mb-2">phase context · {row.phaseLabel}</div>
        <div className="font-mono text-xs text-fg-muted space-y-1">
          <div>
            {pitchCountInPhase.toLocaleString()} pitch{pitchCountInPhase === 1 ? "" : "es"} logged in this phase ·{" "}
            <Link href={`/sales?phase=${encodeURIComponent(row.phaseLabel)}`} className="text-accent hover:text-fg">
              view sales →
            </Link>
          </div>
          {sectionsInPhase.length > 0 && (
            <div>
              dissertation sections active in phase:{" "}
              {sectionsInPhase.map((s, i) => (
                <span key={s.id}>
                  <Link href={`/dissertation/sections/${s.id}`} className="text-accent hover:text-fg">
                    {s.chapter}
                  </Link>
                  <span className="text-fg-dim"> · {s.status}</span>
                  {i < sectionsInPhase.length - 1 && <span>, </span>}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
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

function Block({ label, value }: { label: string; value: string }) {
  if (!value || !value.trim()) return null;
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 px-4 py-3">
      <div className="h-section pt-0.5">{label}</div>
      <div className="min-w-0">
        <Markdown source={value} />
      </div>
    </div>
  );
}
