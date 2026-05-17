import { cn } from "@/lib/cn";
import { Section, formatIso } from "./primitives";
import type { QaVisualResultRow } from "@/lib/sl-mas/qaVisualResultStore";

function grade(record: Record<string, unknown> | null, key: string): string {
  if (!record) return "—";
  const v = record[key];
  if (typeof v === "number") return v.toFixed(1);
  if (typeof v === "string") return v;
  return "—";
}

function sectionMean(grades: unknown[] | null): string {
  if (!grades || grades.length === 0) return "—";
  let sum = 0;
  let n = 0;
  for (const g of grades) {
    if (typeof g === "object" && g !== null && "grade" in g) {
      const v = (g as { grade?: number }).grade;
      if (typeof v === "number") {
        sum += v;
        n += 1;
      }
    }
  }
  return n === 0 ? "—" : (sum / n).toFixed(1);
}

export function QaVisualPanel({ rows }: { rows: QaVisualResultRow[] }) {
  if (rows.length === 0) return null;
  return (
    <Section
      title="Visual QA"
      subtitle={`${rows.length} six-layer review${rows.length === 1 ? "" : "s"} · model judgements on bugs · brand · voice · owner · customer · section grades`}
    >
      <div className="border border-border bg-bg-panel">
        <table className="nv-table">
          <thead>
            <tr>
              <th>ran at</th>
              <th>model</th>
              <th className="text-right">bugs</th>
              <th>critical</th>
              <th className="text-right">brand</th>
              <th className="text-right">voice</th>
              <th className="text-right">sections</th>
              <th>failed layers</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.qa_visual_id}>
                <td className="font-mono text-2xs">{formatIso(r.ran_at)}</td>
                <td className="font-mono text-2xs text-fg-muted">{r.model}</td>
                <td className="text-right font-mono text-xs">{r.bug_count ?? "—"}</td>
                <td
                  className={cn(
                    "font-mono text-2xs uppercase",
                    r.has_critical === true && "text-status-rejected",
                    r.has_critical === false && "text-status-closed",
                    r.has_critical === null && "text-fg-dim",
                  )}
                >
                  {r.has_critical === null
                    ? "—"
                    : r.has_critical
                      ? "yes"
                      : "no"}
                </td>
                <td className="text-right font-mono text-xs">
                  {grade(r.brand_fidelity, "overall_grade")}
                </td>
                <td className="text-right font-mono text-xs">
                  {grade(r.voice_consistency, "overall_grade")}
                </td>
                <td className="text-right font-mono text-xs">
                  {sectionMean(r.section_grades)}
                </td>
                <td className="font-mono text-2xs text-fg-muted">
                  {r.failed_layers.length > 0 ? r.failed_layers.join(", ") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
