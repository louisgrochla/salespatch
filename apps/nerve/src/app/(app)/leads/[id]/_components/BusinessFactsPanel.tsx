import { formatDistanceToNow } from "date-fns";
import { Section } from "./primitives";
import { addFact, deleteFact } from "../factActions";
import type { BusinessFactRow } from "@/lib/sl-mas/businessFactStore";

const SOURCES = ["manual", "scraped", "agent", "conversation"] as const;

export function BusinessFactsPanel({
  leadSlug,
  displayName,
  facts,
}: {
  leadSlug: string;
  displayName: string;
  facts: BusinessFactRow[];
}) {
  const grouped = groupByKey(facts);
  const addAction = addFact.bind(null, leadSlug);

  return (
    <Section
      title="Business facts"
      subtitle={`Structured key/value facts about ${displayName}. Append-only — multiple values per key preserve history.`}
    >
      <div className="border border-border bg-bg-panel">
        {/* Inline add-fact form */}
        <form
          action={addAction}
          className="px-4 py-3 border-b border-border grid grid-cols-1 md:grid-cols-[8rem_1fr_7rem_5rem_auto] gap-2 items-end"
        >
          <label className="block">
            <span className="h-section block mb-1">key</span>
            <input
              type="text"
              name="key"
              required
              placeholder="owner_name"
              pattern="[a-z0-9_]+"
              title="lowercase letters, digits, underscores"
              className="w-full font-mono text-xs bg-bg-raised border border-border px-2 py-1 text-fg"
            />
          </label>
          <label className="block">
            <span className="h-section block mb-1">value</span>
            <input
              type="text"
              name="value"
              required
              placeholder="Mark Smith"
              className="w-full font-mono text-xs bg-bg-raised border border-border px-2 py-1 text-fg"
            />
          </label>
          <label className="block">
            <span className="h-section block mb-1">source</span>
            <select
              name="source"
              defaultValue="manual"
              className="w-full font-mono text-xs bg-bg-raised border border-border px-2 py-1 text-fg"
            >
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="h-section block mb-1">conf</span>
            <input
              type="number"
              name="confidence"
              step="0.05"
              min="0"
              max="1"
              placeholder="—"
              className="w-full font-mono text-xs bg-bg-raised border border-border px-2 py-1 text-fg"
            />
          </label>
          <button
            type="submit"
            className="font-mono text-2xs uppercase tracking-wider bg-fg text-bg
                       hover:bg-fg-muted px-3 py-1 shrink-0"
          >
            + add
          </button>
        </form>

        {/* Facts list, grouped by key */}
        {facts.length === 0 ? (
          <div className="px-4 py-6 font-mono text-xs text-fg-dim text-center">
            No facts recorded yet. Use the form above to add one.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {grouped.map(({ key, rows }) => (
              <div key={key} className="px-4 py-3">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="font-mono text-xs text-fg">{key}</span>
                  <span className="font-mono text-2xs text-fg-dim">
                    {rows.length} value{rows.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="space-y-1">
                  {rows.map((r) => {
                    const deleteAction = deleteFact.bind(null, leadSlug, r.id);
                    return (
                      <li
                        key={r.id}
                        className="grid grid-cols-[1fr_5rem_4rem_6rem_auto] gap-2 items-center"
                      >
                        <span className="font-sans text-xs text-fg break-words">
                          {r.value}
                        </span>
                        <span className="font-mono text-2xs uppercase tracking-wider text-fg-muted">
                          {r.source}
                        </span>
                        <span className="font-mono text-2xs text-fg-dim text-right">
                          {r.confidence !== null ? r.confidence.toFixed(2) : "—"}
                        </span>
                        <span className="font-mono text-2xs text-fg-dim text-right">
                          {formatDistanceToNow(new Date(r.created_at), {
                            addSuffix: true,
                          })}
                        </span>
                        <form action={deleteAction}>
                          <button
                            type="submit"
                            className="font-mono text-2xs uppercase tracking-wider text-status-rejected
                                       hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-0.5 shrink-0"
                            title="Delete this fact"
                          >
                            del
                          </button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}

function groupByKey(
  facts: BusinessFactRow[],
): { key: string; rows: BusinessFactRow[] }[] {
  const map = new Map<string, BusinessFactRow[]>();
  for (const f of facts) {
    const arr = map.get(f.key) ?? [];
    arr.push(f);
    map.set(f.key, arr);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rows]) => ({ key, rows }));
}
