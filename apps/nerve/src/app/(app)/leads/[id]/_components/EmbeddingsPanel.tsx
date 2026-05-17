import { Section, formatIso } from "./primitives";

interface EmbeddingGroup {
  sourceType: string;
  count: number;
  lastEmbeddedAt: Date | null;
}

export function EmbeddingsPanel({
  totalChunks,
  groups,
  sourceRecordCount,
}: {
  totalChunks: number;
  groups: EmbeddingGroup[];
  sourceRecordCount: number;
}) {
  if (totalChunks === 0) {
    return (
      <Section
        title="RAG coverage"
        subtitle="What the vault knows about this lead"
      >
        <div className="border border-border bg-bg-panel px-4 py-3 font-mono text-xs text-fg-dim">
          No embeddings yet. Once a brief, demo, or note is captured for this lead,
          chunks land here and become searchable via <code>/ask</code> and{" "}
          <code>/search</code>.
        </div>
      </Section>
    );
  }
  return (
    <Section
      title="RAG coverage"
      subtitle={`${totalChunks} chunk${totalChunks === 1 ? "" : "s"} across ${sourceRecordCount} record${sourceRecordCount === 1 ? "" : "s"} · queryable from /ask and /search`}
    >
      <div className="border border-border bg-bg-panel">
        <table className="nv-table">
          <thead>
            <tr>
              <th>source type</th>
              <th className="text-right">chunks</th>
              <th>last embedded</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.sourceType}>
                <td className="font-mono text-xs">{g.sourceType}</td>
                <td className="text-right font-mono text-xs">{g.count}</td>
                <td className="font-mono text-2xs text-fg-muted">
                  {formatIso(g.lastEmbeddedAt?.toISOString())}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
