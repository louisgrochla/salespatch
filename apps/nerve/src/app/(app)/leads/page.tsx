import { PageHeader, HeaderPrimary } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { StatTile } from "@/components/StatTile";
import { loadLeadsOps } from "@/lib/sl-mas/leadOpsQuery";
import { LeadsOpsFilters } from "./_components/LeadsOpsFilters";
import { LeadsOpsTable } from "./_components/LeadsOpsTable";

export const dynamic = "force-dynamic";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { rows, filterOptions, summary } = await loadLeadsOps(searchParams);

  const subtitleBits: string[] = [`${summary.total} leads`];
  if (summary.assigned > 0) subtitleBits.push(`${summary.assigned} assigned`);
  if (summary.paid > 0) subtitleBits.push(`${summary.paid} paid`);
  if (!summary.supabaseAvailable) {
    subtitleBits.push("Supabase live-pull unavailable — SP / visits / build columns will read —");
  }
  const subtitle = subtitleBits.join(" · ");

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Leads"
        subtitle={subtitle}
        actions={<HeaderPrimary href="/leads/new">+ new manual lead</HeaderPrimary>}
      />

      <Section
        title="state of play"
        framer="One row per canonical business. SL-MAS leads (skill-emitted) win over manual records when names collide. Tiles count the full vault; the table below respects active filters."
      >
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-border border border-border">
          <StatTile label="total" value={summary.total.toLocaleString()} />
          <StatTile label="assigned" value={summary.assigned.toLocaleString()} />
          <StatTile label="in pitch" value={summary.inPitch.toLocaleString()} />
          <StatTile label="paid" value={summary.paid.toLocaleString()} />
          <StatTile label="unbuilt" value={summary.unbuilt.toLocaleString()} />
          <StatTile label="flagged" value={summary.flagged.toLocaleString()} />
        </div>
      </Section>

      <Section
        title={`all leads (${rows.length})`}
        framer="Click any row to open the per-lead 360°. Filters URL-driven — paste this URL into Slack and the other person sees the same view."
      >
        <div className="space-y-3">
          <LeadsOpsFilters searchParams={searchParams} options={filterOptions} />
          <LeadsOpsTable rows={rows} />
        </div>
      </Section>

      <p className="font-mono text-2xs text-fg-dim">
        SL-MAS leads are skill-emitted (lead_profiles, keyed by slug). Manual
        records are operator-added (lead_records, keyed by cuid). Both link to
        the same `/leads/[id]` detail page. SP names + visit time + build state
        are live-pulled from Supabase today; R9 will mirror visits into NERVE.
      </p>
    </div>
  );
}
