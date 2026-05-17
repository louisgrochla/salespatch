import { prisma } from "@/lib/db";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";

export const dynamic = "force-dynamic";

// R7 (2026-05-17): rewrite reads from `prisma.demoRecord` (legacy manual-
// entry table, mostly empty) to `prisma.demoArtefact` (the Phase A table
// every /build-demo skill run writes into). Closes the bug where skill-
// generated demos surfaced on /leads/[id] but never in the Demo Library.

export default async function DemosPage() {
  const [demos, totals] = await Promise.all([
    prisma.demoArtefact.findMany({
      orderBy: { generatedAt: "desc" },
      take: 500,
      select: {
        id: true,
        artefactId: true,
        leadId: true,
        businessName: true,
        vertical: true,
        aestheticPositioning: true,
        photoCount: true,
        htmlSizeBytes: true,
        dominantHex: true,
        source: true,
        generatedAt: true,
      },
    }),
    prisma.demoArtefact.groupBy({
      by: ["vertical"],
      _count: { _all: true },
      _avg: { photoCount: true, htmlSizeBytes: true },
    }),
  ]);

  // Strip a known noise vertical that's the empty-string default.
  const verticalRollup = totals
    .filter((t) => t.vertical && t.vertical.trim().length > 0)
    .sort((a, b) => b._count._all - a._count._all);

  const sizeOf = (bytes: number): string =>
    bytes < 1024 ? `${bytes}B` : `${(bytes / 1024).toFixed(0)}kB`;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Demo Library"
        subtitle={`${demos.length.toLocaleString()} demo${demos.length === 1 ? "" : "s"} produced by the /build-demo skill. Click any row to open the lead view with the full preview.`}
      />

      {verticalRollup.length > 0 && (
        <Section
          title="by vertical"
          framer="Volume per vertical and the average asset footprint. Useful as a sanity check that the build-demo skill is hitting all the verticals you've been pitching, not just one."
        >
          <div className="border border-border bg-bg-panel">
            <table className="nv-table">
              <thead>
                <tr>
                  <th>vertical</th>
                  <th className="text-right">demos built</th>
                  <th className="text-right">avg photos</th>
                  <th className="text-right">avg html size</th>
                </tr>
              </thead>
              <tbody>
                {verticalRollup.map((v) => (
                  <tr key={v.vertical ?? "—"}>
                    <td>{v.vertical ?? "—"}</td>
                    <td className="text-right">{v._count._all}</td>
                    <td className="text-right">
                      {v._avg.photoCount !== null
                        ? Math.round(v._avg.photoCount)
                        : "—"}
                    </td>
                    <td className="text-right">
                      {v._avg.htmlSizeBytes !== null
                        ? sizeOf(Math.round(v._avg.htmlSizeBytes))
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section
        title={`all artefacts (${demos.length})`}
        framer="Every demo the build-demo skill has produced. Outcome lookup lives on the per-lead page — click through for the full picture."
      >
        {demos.length === 0 ? (
          <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">
            No demos yet. Run <code className="text-fg">/build-demo</code> on a lead to populate the library.
          </div>
        ) : (
          <div className="border border-border bg-bg-panel overflow-x-auto">
            <table className="nv-table">
              <thead>
                <tr>
                  <th>generated</th>
                  <th>business</th>
                  <th>lead</th>
                  <th>vertical</th>
                  <th>aesthetic</th>
                  <th className="text-right">photos</th>
                  <th className="text-right">html</th>
                  <th>palette</th>
                  <th>source</th>
                </tr>
              </thead>
              <tbody>
                {demos.map((d) => (
                  <tr key={d.id}>
                    <td className="font-mono text-2xs">
                      {format(d.generatedAt, "dd LLL yyyy · HH:mm")}
                    </td>
                    <td>{d.businessName}</td>
                    <td>
                      <Link
                        href={`/leads/${d.leadId}`}
                        className="text-accent hover:text-fg"
                      >
                        {d.leadId}
                      </Link>
                    </td>
                    <td>
                      {d.vertical ?? <span className="text-fg-dim">—</span>}
                    </td>
                    <td className="font-mono text-2xs text-fg-muted truncate max-w-[12rem]">
                      {d.aestheticPositioning ?? <span className="text-fg-dim">—</span>}
                    </td>
                    <td className="text-right">{d.photoCount}</td>
                    <td className="text-right">{sizeOf(d.htmlSizeBytes)}</td>
                    <td>
                      {d.dominantHex ? (
                        <span className="inline-flex items-center gap-2 font-mono text-2xs">
                          <span
                            className="inline-block w-4 h-4 border border-border"
                            style={{ backgroundColor: d.dominantHex }}
                          />
                          {d.dominantHex}
                        </span>
                      ) : (
                        <span className="text-fg-dim">—</span>
                      )}
                    </td>
                    <td className="font-mono text-2xs text-fg-muted">
                      {d.source}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
