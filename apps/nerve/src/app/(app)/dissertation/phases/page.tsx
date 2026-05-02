import { prisma } from "@/lib/db";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, HeaderPrimary } from "@/components/PageHeader";
import { PhasePill } from "@/components/PhasePill";
import { ResearchSubNav } from "../_components/SubNav";

export const dynamic = "force-dynamic";

export default async function PhasesPage() {
  const phases = await prisma.phaseBoundary.findMany({
    orderBy: { startDate: "asc" },
  });

  // Quick gap/overlap check across consecutive phases.
  const issues: string[] = [];
  for (let i = 0; i < phases.length - 1; i++) {
    const a = phases[i];
    const b = phases[i + 1];
    if (!a.endDate) continue;
    if (a.endDate.getTime() > b.startDate.getTime()) {
      issues.push(`overlap: ${a.name} ends after ${b.name} starts`);
    } else if (
      b.startDate.getTime() - a.endDate.getTime() > 24 * 60 * 60 * 1000
    ) {
      issues.push(`gap > 1 day between ${a.name} and ${b.name}`);
    }
  }

  return (
    <div className="p-6">
      <ResearchSubNav />
      <PageHeader
        title="Phase Boundaries"
        subtitle="Methodology timeline anchors. Editing these does NOT rewrite history — phaseLabel on existing records stays as-is."
        actions={<HeaderPrimary href="/dissertation/phases/new">+ new phase</HeaderPrimary>}
      />

      {issues.length > 0 && (
        <div className="border border-status-followup/40 bg-status-followup/5 px-4 py-2 mb-4">
          <div className="h-section text-status-followup mb-1">timeline issues</div>
          <ul className="font-mono text-xs text-fg-muted space-y-0.5">
            {issues.map((i) => <li key={i}>· {i}</li>)}
          </ul>
        </div>
      )}

      {phases.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">
          No phases yet. Create the first one — every record needs a phase to attach to.
        </div>
      ) : (
        <div className="border border-border bg-bg-panel">
          <table className="nv-table">
            <thead>
              <tr>
                <th>phase</th>
                <th>start</th>
                <th>end</th>
                <th>description</th>
              </tr>
            </thead>
            <tbody>
              {phases.map((p) => (
                <tr key={p.id} className="cursor-pointer">
                  <td>
                    <Link href={`/dissertation/phases/${p.id}`}>
                      <PhasePill phase={p.name} />
                    </Link>
                  </td>
                  <td>{format(p.startDate, "dd LLL yyyy")}</td>
                  <td>{p.endDate ? format(p.endDate, "dd LLL yyyy") : <span className="text-fg-dim">— current —</span>}</td>
                  <td className="text-fg-muted">{p.operationalDescription}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
