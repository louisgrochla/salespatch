import Link from "next/link";

export interface SourceItem {
  sourceType: string;
  sourceId: string;
  title: string;
  url: string | null;
  excerpt: string;
  distance: number;
  sectionPath: string | null;
  phaseLabel: string;
}

export function Sources({ items }: { items: SourceItem[] }) {
  if (!items || items.length === 0) {
    return (
      <div className="font-mono text-2xs text-fg-dim italic">
        No sources retrieved for this turn.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((s, i) => (
        <li key={`${s.sourceType}-${s.sourceId}-${i}`} className="border border-border bg-bg-raised">
          <div className="px-3 py-1.5 border-b border-border flex items-center gap-2 flex-wrap">
            <span className="font-mono text-2xs text-fg-dim">[{i + 1}]</span>
            <span className="font-mono text-2xs text-fg-muted">{s.sourceType}</span>
            {s.url
              ? <Link href={s.url} className="font-mono text-2xs text-fg hover:underline truncate">
                  {s.title}
                </Link>
              : <span className="font-mono text-2xs text-fg truncate">{s.title}</span>}
            <span className="font-mono text-2xs text-fg-dim ml-auto">d={s.distance.toFixed(3)}</span>
          </div>
          <pre className="font-mono text-2xs text-fg-muted whitespace-pre-wrap leading-snug px-3 py-2 max-h-32 overflow-y-auto">
            {s.excerpt}
          </pre>
        </li>
      ))}
    </ul>
  );
}
