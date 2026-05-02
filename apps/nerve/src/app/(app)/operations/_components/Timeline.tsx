import Link from "next/link";
import { format } from "date-fns";
import { PhasePill } from "@/components/PhasePill";
import { cn } from "@/lib/cn";

export interface TimelineRow {
  id: string;
  date: Date;
  type: "weekly" | "decision" | "failure" | "iteration";
  body: string | null;
  decision: string | null;
  reasoning: string | null;
  outcome: string | null;
  whatFailed: string | null;
  why: string | null;
  whatChanged: string | null;
  beforeState: string | null;
  afterState: string | null;
  tags: string[];
  phaseLabel: string;
}

const TYPE_COLOR: Record<TimelineRow["type"], string> = {
  weekly: "border-fg-muted/50 text-fg-muted",
  decision: "border-phase-one/40 text-phase-one bg-phase-one/5",
  failure: "border-status-rejected/40 text-status-rejected bg-status-rejected/5",
  iteration: "border-phase-three/40 text-phase-three bg-phase-three/5",
};

export function Timeline({ rows }: { rows: TimelineRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">
        No operations logs yet.
      </div>
    );
  }

  return (
    <div className="border border-border bg-bg-panel">
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/operations/${r.id}`}
              className="block px-4 py-3 hover:bg-bg-hover"
            >
              <div className="flex items-start gap-3">
                <div className="w-32 shrink-0 font-mono text-2xs text-fg-dim pt-0.5">
                  {format(r.date, "dd LLL yyyy · HH:mm")}
                </div>
                <span className={cn("pill shrink-0", TYPE_COLOR[r.type])}>
                  {r.type}
                </span>
                <div className="flex-1 min-w-0">
                  <Headline row={r} />
                  <Body row={r} />
                  {r.tags.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {r.tags.map((t) => (
                        <span key={t} className="font-mono text-2xs text-fg-dim border border-border px-1.5 py-0.5">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <PhasePill phase={r.phaseLabel} className="shrink-0 mt-0.5" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Headline({ row }: { row: TimelineRow }) {
  let primary = "";
  if (row.type === "weekly") primary = firstLine(row.body);
  else if (row.type === "decision") primary = firstLine(row.decision);
  else if (row.type === "failure") primary = firstLine(row.whatFailed);
  else if (row.type === "iteration") primary = firstLine(row.whatChanged);
  return <div className="font-mono text-xs text-fg leading-snug">{primary || "—"}</div>;
}

function Body({ row }: { row: TimelineRow }) {
  let secondary = "";
  if (row.type === "decision") secondary = firstLine(row.reasoning) || firstLine(row.outcome);
  else if (row.type === "failure") secondary = firstLine(row.why) || firstLine(row.whatChanged);
  else if (row.type === "iteration") {
    const before = firstLine(row.beforeState);
    const after = firstLine(row.afterState);
    if (before || after) secondary = `${before} → ${after}`;
  }
  if (!secondary) return null;
  return (
    <div className="font-mono text-2xs text-fg-muted mt-1 leading-snug truncate">
      {secondary}
    </div>
  );
}

function firstLine(s: string | null | undefined): string {
  if (!s) return "";
  const trimmed = s.trim();
  const idx = trimmed.indexOf("\n");
  const first = idx === -1 ? trimmed : trimmed.slice(0, idx);
  return first.length > 200 ? first.slice(0, 200) + "…" : first;
}
