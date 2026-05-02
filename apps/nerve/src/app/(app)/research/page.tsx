import { prisma } from "@/lib/db";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { PhasePill } from "@/components/PhasePill";
import { ResearchSubNav } from "./_components/SubNav";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const METHODOLOGY_MIN_PITCHES_PER_PHASE = 50;
const STATUS_COLOR: Record<string, string> = {
  not_started: "text-fg-dim",
  draft: "text-status-followup",
  in_progress: "text-phase-one",
  complete: "text-status-closed",
};

export default async function ResearchDashboardPage() {
  const now = new Date();
  const [
    meta, sections, literatureCount, evidenceCount, methodologyDocs,
    phases, pitchByPhase, supervisorMeetings, calendarUpcoming, calendarOverdue,
    titleVersionCount, rqVersionCount,
  ] = await Promise.all([
    prisma.dissertationMeta.findUnique({ where: { id: "main" } }),
    prisma.dissertationSection.findMany({
      orderBy: { chapter: "asc" },
      select: { id: true, chapter: true, status: true, wordCount: true, wordCountTarget: true, updatedAt: true },
    }),
    prisma.literatureEntry.count(),
    prisma.evidenceLog.count(),
    prisma.methodologyDoc.findMany({ select: { phaseName: true } }),
    prisma.phaseBoundary.findMany({ orderBy: { startDate: "asc" } }),
    prisma.pitchLog.groupBy({ by: ["phaseLabel"], _count: { _all: true } }),
    prisma.supervisorMeeting.findMany({ orderBy: { date: "desc" }, take: 3 }),
    prisma.academicCalendarItem.findMany({
      where: { deadline: { gte: now }, status: { not: "done" } },
      orderBy: { deadline: "asc" }, take: 5,
      include: { dissertationSection: { select: { chapter: true } } },
    }),
    prisma.academicCalendarItem.count({
      where: { deadline: { lt: now }, status: { notIn: ["done"] } },
    }),
    prisma.workingTitleVersion.count(),
    prisma.researchQuestionVersion.count(),
  ]);

  const totalTarget = sections.reduce((s, x) => s + (x.wordCountTarget ?? 0), 0);
  const totalWritten = sections.reduce((s, x) => s + x.wordCount, 0);
  const sectionsByStatus: Record<string, number> = {};
  for (const s of sections) sectionsByStatus[s.status] = (sectionsByStatus[s.status] ?? 0) + 1;

  const daysToDeadline = meta?.submissionDeadline
    ? Math.ceil((meta.submissionDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const phaseDataSufficiency = phases.map((p) => {
    const n = pitchByPhase.find((x) => x.phaseLabel === p.name)?._count._all ?? 0;
    const ratio = Math.min(1, n / METHODOLOGY_MIN_PITCHES_PER_PHASE);
    const hasMethodology = methodologyDocs.some((m) => m.phaseName === p.name);
    return { phase: p.name, n, ratio, hasMethodology };
  });

  // Outstanding agreed actions across recent supervisor meetings.
  const supervisorActions = supervisorMeetings
    .filter((m) => m.agreedActions && m.followUpStatus !== "done")
    .map((m) => ({ id: m.id, date: m.date, actions: m.agreedActions! }));

  return (
    <div className="p-6 space-y-6">
      <ResearchSubNav />
      <PageHeader
        title="Research Project"
        subtitle={
          meta ? (
            <span>
              {meta.workingTitle}
              {titleVersionCount > 1 && <span className="ml-2 text-fg-dim">(v{titleVersionCount})</span>}
            </span>
          ) : (
            "no dissertation record yet — initialise via the dissertation tab"
          )
        }
        actions={
          <HeaderLink href="/research/dissertation">edit metadata</HeaderLink>
        }
      />

      {meta && (
        <section>
          <div className="h-section mb-2">research question {rqVersionCount > 1 && <span className="text-fg-dim">· v{rqVersionCount}</span>}</div>
          <div className="border border-border bg-bg-panel p-4">
            <p className="font-sans text-base text-fg leading-relaxed">{meta.researchQuestion}</p>
          </div>
        </section>
      )}

      <section>
        <div className="h-section mb-2">progress</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border">
          <StatTile
            label="days to submission"
            value={daysToDeadline ?? "—"}
            hint={meta?.submissionDeadline ? format(meta.submissionDeadline, "dd LLL yyyy") : "no deadline set"}
          />
          <StatTile
            label="word count"
            value={totalWritten.toLocaleString()}
            hint={totalTarget > 0
              ? `${((totalWritten / totalTarget) * 100).toFixed(0)}% of ${totalTarget.toLocaleString()}`
              : "no target set"}
          />
          <StatTile label="literature" value={literatureCount.toLocaleString()} />
          <StatTile label="evidence entries" value={evidenceCount.toLocaleString()} />
        </div>
      </section>

      <section>
        <div className="h-section mb-2">data sufficiency vs methodology</div>
        <div className="border border-border bg-bg-panel">
          <table className="nv-table">
            <thead>
              <tr>
                <th>phase</th>
                <th className="text-right">pitches</th>
                <th className="text-right">target</th>
                <th>progress</th>
                <th>methodology doc</th>
              </tr>
            </thead>
            <tbody>
              {phaseDataSufficiency.map((p) => (
                <tr key={p.phase}>
                  <td><PhasePill phase={p.phase} /></td>
                  <td className="text-right">{p.n}</td>
                  <td className="text-right text-fg-dim">{METHODOLOGY_MIN_PITCHES_PER_PHASE}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="bg-border h-2 w-32">
                        <div
                          className={cn("h-2", p.ratio >= 1 ? "bg-status-closed" : "bg-accent")}
                          style={{ width: `${p.ratio * 100}%` }}
                        />
                      </div>
                      <span className="text-fg-muted">{(p.ratio * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td>
                    {p.hasMethodology
                      ? <span className="text-status-closed">✓ written</span>
                      : <span className="text-status-rejected">missing</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div>
            <div className="h-section mb-2">sections</div>
            {sections.length === 0 ? (
              <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">
                <Link href="/research/sections/new" className="text-accent underline">Create the first chapter</Link>
              </div>
            ) : (
              <div className="border border-border bg-bg-panel">
                <table className="nv-table">
                  <thead>
                    <tr>
                      <th>chapter</th>
                      <th>status</th>
                      <th className="text-right">words</th>
                      <th>progress</th>
                      <th>updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sections.map((s) => {
                      const pct = s.wordCountTarget && s.wordCountTarget > 0
                        ? Math.min(1, s.wordCount / s.wordCountTarget) : 0;
                      return (
                        <tr key={s.id} className="cursor-pointer">
                          <td>
                            <Link href={`/research/sections/${s.id}`} className="text-fg hover:underline">
                              {s.chapter}
                            </Link>
                          </td>
                          <td className={cn("uppercase", STATUS_COLOR[s.status])}>
                            {s.status.replace("_", " ")}
                          </td>
                          <td className="text-right">{s.wordCount.toLocaleString()}</td>
                          <td>
                            {s.wordCountTarget ? (
                              <div className="bg-border h-1.5 w-20">
                                <div className="bg-accent h-1.5" style={{ width: `${pct * 100}%` }} />
                              </div>
                            ) : <span className="text-fg-dim">—</span>}
                          </td>
                          <td className="text-fg-dim">{formatDistanceToNow(s.updatedAt, { addSuffix: true })}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border mt-px">
              {(["not_started", "draft", "in_progress", "complete"] as const).map((st) => (
                <div key={st} className="bg-bg-panel px-4 py-2">
                  <div className="h-section">{st.replace("_", " ")}</div>
                  <div className="font-mono text-lg text-fg mt-0.5 leading-none">
                    {sectionsByStatus[st] ?? 0}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="border border-border bg-bg-panel">
            <div className="px-3 py-2 border-b border-border h-section flex items-center justify-between">
              <span>upcoming deadlines</span>
              {calendarOverdue > 0 && (
                <span className="font-mono text-2xs text-status-rejected">
                  {calendarOverdue} overdue
                </span>
              )}
            </div>
            {calendarUpcoming.length === 0 ? (
              <div className="px-3 py-4 font-mono text-xs text-fg-dim text-center">
                <Link href="/research/calendar/new" className="text-accent underline">+ milestone</Link>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {calendarUpcoming.map((c) => (
                  <li key={c.id} className="px-3 py-2">
                    <Link href={`/research/calendar/${c.id}`} className="font-mono text-xs text-fg hover:underline">
                      {c.milestone}
                    </Link>
                    <div className="font-mono text-2xs text-fg-dim mt-0.5">
                      {format(c.deadline, "dd LLL")} · {formatDistanceToNow(c.deadline, { addSuffix: true })}
                      {c.dissertationSection && <span className="ml-2 text-accent">→ {c.dissertationSection.chapter}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border border-border bg-bg-panel">
            <div className="px-3 py-2 border-b border-border h-section">supervisor — outstanding actions</div>
            {supervisorActions.length === 0 ? (
              <div className="px-3 py-4 font-mono text-xs text-fg-dim text-center">
                None.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {supervisorActions.map((a) => (
                  <li key={a.id} className="px-3 py-2">
                    <div className="font-mono text-2xs text-fg-dim">{format(a.date, "dd LLL yyyy")}</div>
                    <pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed mt-1">
                      {a.actions}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}
