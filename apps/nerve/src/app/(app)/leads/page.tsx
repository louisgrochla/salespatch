import { prisma } from "@/lib/db";
import Link from "next/link";
import { PageHeader, HeaderPrimary } from "@/components/PageHeader";
import { cn } from "@/lib/cn";
import { normaliseName } from "@/lib/sl-mas/businessIdentityStore";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  not_contacted: "text-fg-dim",
  contacted: "text-phase-one",
  pitched: "text-status-followup",
  closed: "text-status-closed",
  rejected: "text-status-rejected",
};

interface SearchParams {
  status?: string;
  source?: string;
  vertical?: string;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const where: Record<string, unknown> = {};
  if (
    searchParams.status &&
    ["not_contacted", "contacted", "pitched", "closed", "rejected"].includes(
      searchParams.status,
    )
  ) {
    where.contactedStatus = searchParams.status;
  }
  if (searchParams.source) where.sourceMethod = searchParams.source;

  const slMasWhere: Record<string, unknown> = {};
  if (searchParams.vertical) slMasWhere.vertical = searchParams.vertical;

  const [
    leads,
    sources,
    statusCounts,
    profiles,
    briefCounts,
    demoCounts,
    assignmentCounts,
  ] = await Promise.all([
    prisma.leadRecord.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.leadRecord.groupBy({
      by: ["sourceMethod", "contactedStatus"],
      _count: { _all: true },
    }),
    prisma.leadRecord.groupBy({
      where,
      by: ["contactedStatus"],
      _count: { _all: true },
    }),
    prisma.leadProfile.findMany({
      where: slMasWhere,
      orderBy: { profiledAt: "desc" },
      take: 500,
    }),
    prisma.siteBrief.groupBy({ by: ["leadId"], _count: { _all: true } }),
    prisma.demoArtefact.groupBy({ by: ["leadId"], _count: { _all: true } }),
    prisma.leadAssignmentEvent.groupBy({
      by: ["leadId"],
      _count: { _all: true },
    }),
  ]);

  const briefByLead = new Map(
    briefCounts.map((r) => [r.leadId, r._count._all]),
  );
  const demoByLead = new Map(demoCounts.map((r) => [r.leadId, r._count._all]));
  const assignmentByLead = new Map(
    assignmentCounts.map((r) => [r.leadId, r._count._all]),
  );

  const sourcePerf = new Map<
    string,
    { total: number; closed: number; pitched: number }
  >();
  for (const r of sources) {
    const k = r.sourceMethod ?? "—";
    const t = sourcePerf.get(k) ?? { total: 0, closed: 0, pitched: 0 };
    t.total += r._count._all;
    if (r.contactedStatus === "closed") t.closed += r._count._all;
    if (
      r.contactedStatus === "pitched" ||
      r.contactedStatus === "closed" ||
      r.contactedStatus === "rejected"
    ) {
      t.pitched += r._count._all;
    }
    sourcePerf.set(k, t);
  }

  // F1 dedup: a manual LeadRecord that refers to the same physical
  // business as an SL-MAS lead_profile should not surface twice. Build
  // the normalised-name set from SL-MAS profiles and hide manual leads
  // that collide. The SL-MAS row stays because it carries the richer
  // data (briefs, demos, assignments).
  const slMasNormalisedNames = new Set(
    profiles.map((p) => normaliseName(p.businessName)),
  );
  const dedupedManual = leads.filter(
    (l) => !slMasNormalisedNames.has(normaliseName(l.name)),
  );
  const dedupedHidden = leads.length - dedupedManual.length;

  const manualTotal = statusCounts.reduce((s, c) => s + c._count._all, 0);
  const slMasTotal = profiles.length;
  const slMasWithDemo = profiles.filter((p) => (demoByLead.get(p.leadId) ?? 0) > 0).length;
  const slMasInPipeline = profiles.filter(
    (p) => (assignmentByLead.get(p.leadId) ?? 0) > 0,
  ).length;

  const verticals = Array.from(
    new Set(profiles.map((p) => p.vertical).filter((v): v is string => !!v)),
  ).sort();

  return (
    <div className="p-6 space-y-8">
      <PageHeader
        title="Leads"
        subtitle={`${slMasTotal} SL-MAS · ${manualTotal} manual`}
        actions={<HeaderPrimary href="/leads/new">+ new manual lead</HeaderPrimary>}
      />

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-sans text-base font-medium text-fg">
            SL-MAS leads{" "}
            <span className="font-mono text-2xs text-fg-dim ml-2">
              {slMasInPipeline} in pipeline · {slMasWithDemo} with demo
            </span>
          </h2>
          <VerticalFilter currentVertical={searchParams.vertical} options={verticals} />
        </div>
        {profiles.length === 0 ? (
          <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">
            {searchParams.vertical
              ? `No SL-MAS leads in vertical "${searchParams.vertical}".`
              : "No SL-MAS leads ingested yet. Producer skills write lead_profiles via /api/ingest/lead-profile."}
          </div>
        ) : (
          <div className="border border-border bg-bg-panel">
            <table className="nv-table">
              <thead>
                <tr>
                  <th>business</th>
                  <th>vertical</th>
                  <th>postcode</th>
                  <th className="text-right">★</th>
                  <th className="text-right">followers</th>
                  <th className="text-right">briefs</th>
                  <th className="text-right">demos</th>
                  <th>stage</th>
                  <th>profiled</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => {
                  const briefs = briefByLead.get(p.leadId) ?? 0;
                  const demos = demoByLead.get(p.leadId) ?? 0;
                  const inPipeline = (assignmentByLead.get(p.leadId) ?? 0) > 0;
                  return (
                    <tr key={p.leadId} className="cursor-pointer">
                      <td>
                        <Link
                          href={`/leads/${p.leadId}`}
                          className="text-fg hover:underline"
                        >
                          {p.businessName}
                        </Link>
                      </td>
                      <td>
                        {p.vertical ?? <span className="text-fg-dim">—</span>}
                      </td>
                      <td>
                        {p.postcode ?? <span className="text-fg-dim">—</span>}
                      </td>
                      <td className="text-right font-mono text-xs">
                        {p.googleRating !== null ? p.googleRating.toFixed(1) : "—"}
                      </td>
                      <td className="text-right font-mono text-xs">
                        {p.instagramFollowers !== null
                          ? p.instagramFollowers.toLocaleString()
                          : "—"}
                      </td>
                      <td className="text-right font-mono text-xs">
                        {briefs > 0 ? briefs : <span className="text-fg-dim">0</span>}
                      </td>
                      <td className="text-right font-mono text-xs">
                        {demos > 0 ? demos : <span className="text-fg-dim">0</span>}
                      </td>
                      <td
                        className={cn(
                          "font-mono text-2xs uppercase",
                          inPipeline ? "text-status-followup" : "text-fg-dim",
                        )}
                      >
                        {inPipeline ? "in pipeline" : "demo only"}
                      </td>
                      <td className="font-mono text-2xs text-fg-muted">
                        {p.profiledAt.toISOString().slice(0, 10)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-sans text-base font-medium text-fg">
          Manual lead records{" "}
          <span className="font-mono text-2xs text-fg-dim ml-2">
            {manualTotal.toLocaleString()} record{manualTotal === 1 ? "" : "s"}
          </span>
        </h2>

        {sourcePerf.size > 0 && (
          <div className="border border-border bg-bg-panel">
            <table className="nv-table">
              <thead>
                <tr>
                  <th>source method</th>
                  <th className="text-right">leads</th>
                  <th className="text-right">pitched</th>
                  <th className="text-right">closed</th>
                  <th className="text-right">close rate of pitched</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(sourcePerf.entries())
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([k, t]) => (
                    <tr key={k}>
                      <td>{k}</td>
                      <td className="text-right">{t.total}</td>
                      <td className="text-right">{t.pitched}</td>
                      <td className="text-right text-status-closed">{t.closed}</td>
                      <td className="text-right">
                        {t.pitched > 0
                          ? `${((t.closed / t.pitched) * 100).toFixed(1)}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {dedupedHidden > 0 && (
          <div className="font-mono text-2xs text-fg-dim">
            {dedupedHidden} manual record{dedupedHidden === 1 ? "" : "s"} hidden
            (already present as SL-MAS lead via canonical identity).
          </div>
        )}

        {dedupedManual.length === 0 ? (
          <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">
            {leads.length === 0
              ? "No manual lead records yet."
              : "All manual records overlap with SL-MAS leads above."}
          </div>
        ) : (
          <div className="border border-border bg-bg-panel">
            <table className="nv-table">
              <thead>
                <tr>
                  <th>name</th>
                  <th>type</th>
                  <th>sector</th>
                  <th>location</th>
                  <th>source</th>
                  <th>status</th>
                  <th>dnc</th>
                </tr>
              </thead>
              <tbody>
                {dedupedManual.map((l) => (
                  <tr key={l.id} className="cursor-pointer">
                    <td>
                      <Link
                        href={`/leads/${l.id}`}
                        className="text-fg hover:underline"
                      >
                        {l.name}
                      </Link>
                    </td>
                    <td>{l.type ?? <span className="text-fg-dim">—</span>}</td>
                    <td>{l.sector ?? <span className="text-fg-dim">—</span>}</td>
                    <td>{l.location ?? <span className="text-fg-dim">—</span>}</td>
                    <td>
                      {l.sourceMethod ?? <span className="text-fg-dim">—</span>}
                    </td>
                    <td
                      className={cn(
                        "uppercase",
                        STATUS_COLOR[l.contactedStatus],
                      )}
                    >
                      {l.contactedStatus.replace("_", " ")}
                    </td>
                    <td>
                      {l.doNotContact ? (
                        <span className="text-status-rejected">DNC</span>
                      ) : (
                        ""
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="font-mono text-2xs text-fg-dim">
        SL-MAS leads are skill-emitted (lead_profiles, keyed by slug). Manual
        records are operator-added (lead_records, keyed by cuid). Both link to
        the same `/leads/[id]` detail page.
      </p>
    </div>
  );
}

function VerticalFilter({
  currentVertical,
  options,
}: {
  currentVertical?: string;
  options: string[];
}) {
  if (options.length === 0) return null;
  return (
    <form action="/leads" method="GET" className="flex items-center gap-2">
      <select
        name="vertical"
        defaultValue={currentVertical ?? ""}
        className="font-mono text-xs bg-bg-panel border border-border px-2 py-1 text-fg"
      >
        <option value="">all verticals</option>
        {options.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1"
      >
        apply
      </button>
    </form>
  );
}
