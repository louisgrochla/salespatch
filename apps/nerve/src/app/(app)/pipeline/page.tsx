import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { PipelinePivot } from "@/components/PipelinePivot";
import { episodicStore } from "@/lib/sl-mas/episodicStore";

export const dynamic = "force-dynamic";

interface SearchParams {
  vertical?: string;
  group_by?: string;
}

const DEFAULT_GROUP_BY = ["vertical", "hero", "palette"];

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const groupByKeys =
    searchParams.group_by?.split(",").map((s) => s.trim()).filter(Boolean) ??
    DEFAULT_GROUP_BY;

  const filters = searchParams.vertical
    ? [`vertical:${searchParams.vertical}`]
    : [];
  const groupByPrefixes = groupByKeys.map((g) => `${g}:`);

  const [pivot, recent] = await Promise.all([
    episodicStore.pivotByTags(filters, groupByPrefixes),
    episodicStore.listRecent(200),
  ]);

  const totalPitched = pivot.reduce((s, r) => s + r.closed + r.rejected, 0);
  const totalClosed = pivot.reduce((s, r) => s + r.closed, 0);
  const totalPending = pivot.reduce((s, r) => s + r.pending, 0);
  const overallRate = totalPitched > 0 ? totalClosed / totalPitched : 0;
  const closedRevenue = recent.reduce(
    (s, ep) =>
      s + (ep.pitch_outcome === "closed" ? ep.close_amount_gbp ?? 0 : 0),
    0,
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Pipeline"
        subtitle="SL-MAS overview · close-rate by design choice"
        actions={
          <>
            <HeaderLink href="/pipeline/episodes">Recent episodes</HeaderLink>
            <HeaderLink href="/pipeline/strategies">Strategies</HeaderLink>
          </>
        }
      />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatTile
          label="overall close rate"
          value={
            totalPitched > 0 ? `${Math.round(overallRate * 100)}%` : "—"
          }
          hint={`${totalClosed} / ${totalPitched} pitched`}
        />
        <StatTile
          label="revenue (closed)"
          value={`£${closedRevenue.toLocaleString()}`}
          hint="cumulative across visible episodes"
        />
        <StatTile
          label="pending pitches"
          value={totalPending}
          hint="demos awaiting outcome"
        />
        <StatTile
          label="design combos"
          value={pivot.length}
          hint={`grouped by ${groupByKeys.join(" × ")}`}
        />
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-sans text-base font-medium text-fg">
            Pivot by{" "}
            <span className="font-mono text-sm text-fg-muted">
              {groupByKeys.join(" × ")}
            </span>
          </h2>
          <PivotControls
            currentVertical={searchParams.vertical}
            currentGroupBy={groupByKeys.join(",")}
          />
        </div>
        <PipelinePivot rows={pivot} groupBy={groupByKeys} />
      </section>

      <p className="font-mono text-2xs text-fg-dim mt-6">
        Live from Postgres. Edit ?vertical= or ?group_by= in the URL to slice.
        Available group keys: vertical, hero, palette, cta, proof, brand_source,
        category, qa_passed, section, component_style, font_pairing.
      </p>
    </div>
  );
}

function PivotControls({
  currentVertical,
  currentGroupBy,
}: {
  currentVertical?: string;
  currentGroupBy: string;
}) {
  return (
    <form
      action="/pipeline"
      method="GET"
      className="flex items-center gap-2"
    >
      <input
        type="text"
        name="vertical"
        placeholder="vertical (blank = all)"
        defaultValue={currentVertical ?? ""}
        className="font-mono text-xs bg-bg-panel border border-border px-2 py-1 w-40 text-fg"
      />
      <input
        type="text"
        name="group_by"
        placeholder="vertical,hero,palette"
        defaultValue={currentGroupBy}
        className="font-mono text-xs bg-bg-panel border border-border px-2 py-1 w-56 text-fg"
      />
      <button
        type="submit"
        className="font-mono text-2xs uppercase tracking-wider text-fg-muted
                   hover:text-fg border border-border hover:border-border-strong
                   px-2 py-1"
      >
        apply
      </button>
    </form>
  );
}
