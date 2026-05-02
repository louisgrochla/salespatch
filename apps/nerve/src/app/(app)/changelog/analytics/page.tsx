import Link from "next/link";
import { prisma } from "@/lib/db";
import { format, startOfWeek } from "date-fns";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { ProjectBadge } from "../_components/ProjectBadge";

export const dynamic = "force-dynamic";

interface WeekBucket {
  weekStart: Date;
  count: number;
}

export default async function ChangelogAnalyticsPage() {
  const rows = await prisma.changelogEntry.findMany({
    select: {
      id: true,
      project: true,
      projectType: true,
      sessionDate: true,
      filesModified: true,
      tags: true,
      sessionDurationMinutes: true,
    },
    orderBy: { sessionDate: "asc" },
  });

  const totalSessions = rows.length;
  const totalMinutes = rows.reduce(
    (s, r) => s + (r.sessionDurationMinutes ?? 0),
    0,
  );
  const totalFiles = rows.reduce((s, r) => s + r.filesModified.length, 0);

  // Weekly bucket for sparkline-style chart.
  const weekMap = new Map<string, WeekBucket>();
  for (const r of rows) {
    const ws = startOfWeek(r.sessionDate, { weekStartsOn: 1 });
    const key = ws.toISOString();
    const ex = weekMap.get(key);
    if (ex) ex.count += 1;
    else weekMap.set(key, { weekStart: ws, count: 1 });
  }
  const weeks = Array.from(weekMap.values()).sort(
    (a, b) => a.weekStart.getTime() - b.weekStart.getTime(),
  );
  const peakWeek = weeks.reduce<WeekBucket | null>(
    (max, w) => (max == null || w.count > max.count ? w : max),
    null,
  );
  const maxCount = peakWeek?.count ?? 1;

  // Project frequency.
  const projectCounts = new Map<string, { project: string; type: string; count: number }>();
  for (const r of rows) {
    const key = r.project;
    const ex = projectCounts.get(key);
    if (ex) ex.count += 1;
    else projectCounts.set(key, { project: r.project, type: r.projectType, count: 1 });
  }
  const projects = Array.from(projectCounts.values()).sort((a, b) => b.count - a.count);

  // Tag frequency.
  const tagCounts = new Map<string, number>();
  for (const r of rows) {
    for (const t of r.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const tags = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);

  // File frequency.
  const fileCounts = new Map<string, number>();
  for (const r of rows) {
    for (const f of r.filesModified) fileCounts.set(f, (fileCounts.get(f) ?? 0) + 1);
  }
  const files = Array.from(fileCounts.entries())
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);

  return (
    <div className="p-6">
      <PageHeader
        title="Changelog · Analytics"
        subtitle={
          <span>
            {totalSessions.toLocaleString()} session{totalSessions === 1 ? "" : "s"} ·{" "}
            {totalFiles.toLocaleString()} file edits ·{" "}
            {totalMinutes.toLocaleString()}m logged
          </span>
        }
        actions={<HeaderLink href="/changelog">timeline</HeaderLink>}
      />

      {totalSessions === 0 ? (
        <div className="border border-border bg-bg-panel py-12 text-center font-mono text-xs text-fg-dim">
          No sessions logged yet. Once <code>/nerve-log</code> ships entries here, charts populate.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel title={`sessions per week · ${weeks.length} weeks active`}>
            <div className="flex items-end gap-1 h-32 overflow-x-auto">
              {weeks.map((w) => {
                const h = Math.max(4, Math.round((w.count / maxCount) * 120));
                return (
                  <div
                    key={w.weekStart.toISOString()}
                    className="flex flex-col items-center gap-1 shrink-0 w-6"
                    title={`${format(w.weekStart, "dd LLL yyyy")} · ${w.count} session${w.count === 1 ? "" : "s"}`}
                  >
                    <div
                      className="w-full bg-accent/70 hover:bg-accent border-t border-accent"
                      style={{ height: `${h}px` }}
                    />
                    <div className="font-mono text-2xs text-fg-dim">{w.count}</div>
                  </div>
                );
              })}
            </div>
            {peakWeek && (
              <div className="font-mono text-2xs text-fg-dim mt-2">
                peak · {format(peakWeek.weekStart, "dd LLL yyyy")} · {peakWeek.count} sessions
              </div>
            )}
          </Panel>

          <Panel title="most active projects">
            {projects.length === 0 ? (
              <Empty />
            ) : (
              <div className="divide-y divide-border">
                {projects.slice(0, 10).map((p) => {
                  const pct = Math.round((p.count / totalSessions) * 100);
                  return (
                    <Link
                      key={p.project}
                      href={`/changelog?project=${encodeURIComponent(p.project)}`}
                      className="grid grid-cols-[1fr_auto] items-center gap-3 py-2 hover:bg-bg-hover px-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <ProjectBadge projectType={p.type} />
                        <div className="font-mono text-xs text-fg truncate">{p.project}</div>
                      </div>
                      <div className="font-mono text-2xs text-fg-dim">
                        {p.count} · <span className="text-fg-muted">{pct}%</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title="tag frequency">
            {tags.length === 0 ? (
              <Empty />
            ) : (
              <div className="flex flex-wrap gap-1">
                {tags.map((t) => (
                  <Link
                    key={t.tag}
                    href={`/changelog?tag=${encodeURIComponent(t.tag)}`}
                    className="border border-border bg-bg-raised hover:border-border-strong
                               px-2 py-1 leading-none font-mono text-xs"
                  >
                    <span className="text-fg">{t.tag}</span>
                    <span className="text-fg-dim ml-1">{t.count}</span>
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="files modified most often">
            {files.length === 0 ? (
              <Empty />
            ) : (
              <div className="divide-y divide-border">
                {files.map((f) => (
                  <div
                    key={f.file}
                    className="grid grid-cols-[1fr_auto] gap-3 py-1.5 px-2 hover:bg-bg-hover"
                  >
                    <div className="font-mono text-2xs text-fg truncate">{f.file}</div>
                    <div className="font-mono text-2xs text-fg-dim">{f.count}</div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border bg-bg-panel p-4">
      <div className="h-section mb-3">{title}</div>
      {children}
    </div>
  );
}

function Empty() {
  return (
    <div className="font-mono text-xs text-fg-dim italic">no data yet</div>
  );
}
