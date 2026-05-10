import { cn } from "@/lib/cn";
import type { PivotResult } from "@/lib/sl-mas/types";

export function PipelinePivot({
  rows,
  groupBy,
}: {
  rows: PivotResult[];
  groupBy: string[];
}) {
  if (rows.length === 0) {
    return (
      <div className="border border-border bg-bg-panel px-4 py-6 text-fg-dim font-mono text-xs">
        No episodes match the current filters. Run a pipeline or ingest pitch
        outcomes to populate this table.
      </div>
    );
  }

  const groupKeys = groupBy.map((g) => g.replace(/:$/, ""));

  return (
    <div className="border border-border bg-bg-panel overflow-x-auto">
      <table className="min-w-full text-xs font-mono">
        <thead className="bg-bg-panel border-b border-border">
          <tr className="text-fg-dim uppercase tracking-wider text-2xs">
            {groupKeys.map((k) => (
              <th key={k} className="text-left px-3 py-2 font-medium">
                {k}
              </th>
            ))}
            <th className="text-right px-3 py-2 font-medium">n</th>
            <th className="text-right px-3 py-2 font-medium">won</th>
            <th className="text-right px-3 py-2 font-medium">lost</th>
            <th className="text-right px-3 py-2 font-medium">pend</th>
            <th className="text-right px-3 py-2 font-medium">rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const ratePct =
              row.sample_size > 0
                ? Math.round(row.close_rate * 100) + "%"
                : "—";
            const rateClass =
              row.close_rate >= 0.5
                ? "text-emerald-400"
                : row.close_rate >= 0.25
                  ? "text-amber-400"
                  : "text-rose-400";
            return (
              <tr
                key={i}
                className="border-t border-border/50 hover:bg-bg-hover"
              >
                {groupKeys.map((k) => (
                  <td key={k} className="px-3 py-2 text-fg">
                    {row.group_key[k] ?? "—"}
                  </td>
                ))}
                <td className="px-3 py-2 text-right text-fg">
                  {row.sample_size}
                </td>
                <td className="px-3 py-2 text-right text-emerald-400/80">
                  {row.closed}
                </td>
                <td className="px-3 py-2 text-right text-rose-400/80">
                  {row.rejected}
                </td>
                <td className="px-3 py-2 text-right text-fg-dim">
                  {row.pending}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right font-medium",
                    row.sample_size > 0 ? rateClass : "text-fg-dim",
                  )}
                >
                  {ratePct}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
