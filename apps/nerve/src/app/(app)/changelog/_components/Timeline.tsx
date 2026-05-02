"use client";

import { useState } from "react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { ProjectBadge } from "./ProjectBadge";
import { PhasePill } from "@/components/PhasePill";
import { Markdown } from "@/components/Markdown";

export interface TimelineRow {
  id: string;
  project: string;
  projectType: string;
  sessionSummary: string;
  whatChanged: string;
  why: string;
  decisionsMade: string;
  problemsEncountered: string;
  currentState: string;
  whatsNext: string;
  filesModified: string[];
  tags: string[];
  sessionDate: Date;
  sessionDurationMinutes: number | null;
  phaseLabel: string;
  retrospectiveNote: string | null;
  createdAt: Date;
}

export function Timeline({ rows }: { rows: TimelineRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="border border-border bg-bg-panel py-12 text-center">
        <div className="font-mono text-xs text-fg-dim">
          No sessions logged yet. Run <code>/nerve-log</code> at the end of a Claude Code session.
        </div>
      </div>
    );
  }
  return (
    <div className="border border-border bg-bg-panel divide-y divide-border">
      {rows.map((r) => (
        <Row key={r.id} row={r} />
      ))}
    </div>
  );
}

function Row({ row }: { row: TimelineRow }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-4 py-3">
      <div className="flex items-baseline gap-3 cursor-pointer" onClick={() => setOpen((v) => !v)}>
        <button
          type="button"
          aria-label={open ? "collapse" : "expand"}
          className="font-mono text-fg-dim hover:text-fg shrink-0 leading-none"
        >
          {open ? "▾" : "▸"}
        </button>
        <div className="font-mono text-2xs text-fg-dim w-32 shrink-0">
          {format(row.sessionDate, "dd LLL · HH:mm")}
        </div>
        <ProjectBadge projectType={row.projectType} />
        <div className="font-mono text-2xs text-fg-dim shrink-0">{row.project}</div>
        <div className="font-sans text-sm text-fg flex-1 min-w-0 truncate">
          {row.sessionSummary || "(no summary)"}
        </div>
        <Link
          href={`/changelog/${row.id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-2xs uppercase tracking-wider text-fg-dim hover:text-fg shrink-0"
        >
          open →
        </Link>
      </div>

      {row.tags.length > 0 && (
        <div className="ml-[10rem] mt-1 flex flex-wrap gap-1">
          {row.tags.map((t) => (
            <span
              key={t}
              className="font-mono text-2xs text-fg-dim bg-bg-raised border border-border px-1 py-0.5 leading-none"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="ml-[10rem] mt-3 border-l border-border pl-4 space-y-3">
          <Meta row={row} />
          <Section label="what changed" value={row.whatChanged} />
          <Section label="why" value={row.why} />
          <Section label="decisions made" value={row.decisionsMade} />
          <Section label="problems encountered" value={row.problemsEncountered} />
          <Section label="current state" value={row.currentState} />
          <Section label="what's next" value={row.whatsNext} />
          {row.filesModified.length > 0 && (
            <div>
              <div className="h-section mb-1">files modified</div>
              <ul className="font-mono text-2xs text-fg-muted space-y-0.5">
                {row.filesModified.map((f) => (
                  <li key={f} className="truncate">{f}</li>
                ))}
              </ul>
            </div>
          )}
          {row.retrospectiveNote && (
            <div className="border border-accent/40 bg-accent/5 p-3">
              <div className="h-section text-accent mb-1">retrospective note</div>
              <Markdown source={row.retrospectiveNote} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Meta({ row }: { row: TimelineRow }) {
  return (
    <div className="flex flex-wrap items-center gap-3 font-mono text-2xs text-fg-dim">
      <PhasePill phase={row.phaseLabel} />
      <span>logged {formatDistanceToNow(row.createdAt, { addSuffix: true })}</span>
      {row.sessionDurationMinutes != null && (
        <span>
          duration <span className="text-fg">{row.sessionDurationMinutes}m</span>
        </span>
      )}
      <span>
        {row.filesModified.length} file{row.filesModified.length === 1 ? "" : "s"}
      </span>
    </div>
  );
}

function Section({ label, value }: { label: string; value: string }) {
  if (!value || !value.trim()) return null;
  return (
    <div>
      <div className="h-section mb-1">{label}</div>
      <Markdown source={value} />
    </div>
  );
}
