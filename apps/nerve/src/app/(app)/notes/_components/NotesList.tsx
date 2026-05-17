import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { PhasePill } from "@/components/PhasePill";
import { cn } from "@/lib/cn";

export interface NotesListRow {
  id: string;
  title: string;
  body: string;
  scope: "lead" | "system" | "pitch" | "research" | "other";
  relatedSlug: string | null;
  tags: string[];
  phaseLabel: string;
  createdAt: Date;
  updatedAt: Date;
}

const SCOPE_COLOR: Record<NotesListRow["scope"], string> = {
  lead: "border-phase-three/40 text-phase-three bg-phase-three/5",
  system: "border-phase-one/40 text-phase-one bg-phase-one/5",
  pitch: "border-accent/40 text-accent bg-accent/5",
  research: "border-fg-muted/50 text-fg-muted",
  other: "border-border text-fg-dim",
};

export function NotesList({ rows }: { rows: NotesListRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">
        No notes yet. Drop the first one with <span className="text-fg">+ new note</span>.
      </div>
    );
  }

  return (
    <div className="border border-border bg-bg-panel">
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/notes/${r.id}`}
              className="block px-4 py-3 hover:bg-bg-hover"
            >
              <div className="flex items-start gap-3">
                <div className="w-32 shrink-0 font-mono text-2xs text-fg-dim pt-0.5">
                  {format(r.updatedAt, "dd LLL yyyy · HH:mm")}
                </div>
                <span className={cn("pill shrink-0", SCOPE_COLOR[r.scope])}>
                  {r.scope}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs text-fg leading-snug">{r.title}</div>
                  <div className="font-mono text-2xs text-fg-muted mt-1 leading-snug truncate">
                    {firstLine(r.body)}
                  </div>
                  {(r.relatedSlug || r.tags.length > 0) && (
                    <div className="flex gap-1 mt-2 flex-wrap items-center">
                      {r.relatedSlug && (
                        <span className="font-mono text-2xs text-accent border border-accent/40 px-1.5 py-0.5">
                          {r.relatedSlug}
                        </span>
                      )}
                      {r.tags.map((t) => (
                        <span key={t} className="font-mono text-2xs text-fg-dim border border-border px-1.5 py-0.5">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <PhasePill phase={r.phaseLabel} className="mt-0.5" />
                  <span className="font-mono text-2xs text-fg-dim">
                    {formatDistanceToNow(r.createdAt, { addSuffix: true })}
                  </span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function firstLine(s: string): string {
  const trimmed = s.trim();
  const idx = trimmed.indexOf("\n");
  const first = idx === -1 ? trimmed : trimmed.slice(0, idx);
  return first.length > 200 ? first.slice(0, 200) + "…" : first;
}
