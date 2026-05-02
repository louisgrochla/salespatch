import { prisma } from "@/lib/db";
import { format } from "date-fns";
import { SupervisorSubNav } from "../_components/SubNav";
import { PhasePill } from "@/components/PhasePill";

export const dynamic = "force-dynamic";

export default async function SupervisorMethodologyPage() {
  const [docs, phases] = await Promise.all([
    prisma.methodologyDoc.findMany({ orderBy: { phaseName: "asc" } }),
    prisma.phaseBoundary.findMany({ orderBy: { startDate: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <SupervisorSubNav />
      <header>
        <h1 className="font-sans text-xl font-medium text-fg">Methodology</h1>
        <p className="font-mono text-2xs text-fg-dim mt-1">
          Read-only methodology documentation per phase, plus the phase boundary log.
        </p>
      </header>

      <section>
        <div className="h-section mb-2">phase boundaries</div>
        <div className="border border-border bg-bg-panel">
          <table className="nv-table">
            <thead>
              <tr><th>phase</th><th>start</th><th>end</th><th>operational description</th></tr>
            </thead>
            <tbody>
              {phases.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-fg-dim py-3">No phases logged.</td></tr>
              ) : phases.map((p) => (
                <tr key={p.id}>
                  <td><PhasePill phase={p.name} /></td>
                  <td>{format(p.startDate, "dd LLL yyyy")}</td>
                  <td>{p.endDate ? format(p.endDate, "dd LLL yyyy") : <span className="text-fg-dim">current</span>}</td>
                  <td className="text-fg-muted">{p.operationalDescription}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {docs.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">
          No methodology documents yet.
        </div>
      ) : (
        docs.map((d) => (
          <article key={d.id} className="border border-border bg-bg-panel">
            <header className="px-4 py-2 border-b border-border flex items-center gap-3">
              <PhasePill phase={d.phaseName} />
              <span className="font-mono text-2xs text-fg-dim">methodology document</span>
            </header>
            <div className="divide-y divide-border">
              <Block label="formal description" value={d.formalDescription} />
              <Block label="mixed-methods justification" value={d.mixedMethodsJustification} />
              <Block label="sample size notes" value={d.sampleSizeNotes} />
              <Block label="statistical approach" value={d.statisticalApproach} />
              <Block label="GDPR handling" value={d.gdprHandling} />
              <Block label="NERVE as research infrastructure" value={d.nerveAsInfrastructure} />
            </div>
          </article>
        ))
      )}
    </div>
  );
}

function Block({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[14rem_1fr] gap-3 px-4 py-3">
      <div className="h-section pt-0.5">{label}</div>
      <pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">{value ?? "—"}</pre>
    </div>
  );
}
