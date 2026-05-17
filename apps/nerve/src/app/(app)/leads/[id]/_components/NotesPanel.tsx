import Link from "next/link";
import { Section, formatIso } from "./primitives";
import { Markdown } from "@/components/Markdown";

interface NoteRow {
  id: string;
  scope: string;
  title: string;
  body: string;
  tags: string[];
  phaseLabel: string;
  updatedAt: Date;
}

export function NotesPanel({ notes }: { notes: NoteRow[] }) {
  if (notes.length === 0) return null;
  return (
    <Section
      title="Notes"
      subtitle={`${notes.length} note${notes.length === 1 ? "" : "s"} scoped to this lead`}
    >
      <div className="border border-border bg-bg-panel divide-y divide-border">
        {notes.map((n) => (
          <div key={n.id} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/notes/${n.id}`}
                  className="font-sans text-sm text-fg hover:text-accent"
                >
                  {n.title}
                </Link>
                <span className="font-mono text-2xs uppercase tracking-wider text-fg-dim ml-2">
                  {n.scope}
                </span>
              </div>
              <span className="font-mono text-2xs text-fg-dim shrink-0">
                {formatIso(n.updatedAt.toISOString())}
              </span>
            </div>
            {n.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {n.tags.map((t) => (
                  <span
                    key={t}
                    className="font-mono text-2xs uppercase tracking-wider border border-border px-1.5 py-0.5 text-fg-muted"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 font-mono text-xs text-fg-muted max-h-32 overflow-y-auto">
              <Markdown source={n.body} />
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
