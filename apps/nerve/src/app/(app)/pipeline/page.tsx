import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { PipelinePivot } from "@/components/PipelinePivot";
import { RuntimeStatusBanner } from "@/components/PipelineStatus";
import {
  getPivot,
  getRecentEpisodes,
  getRuntimeStatus,
  safe,
} from "@/lib/runtime-api";

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
  const status = await getRuntimeStatus();
  const groupBy =
    searchParams.group_by?.split(",").map((s) => s.trim()).filter(Boolean) ??
    DEFAULT_GROUP_BY;

  const [pivot, episodes] = await Promise.all([
    safe(() =>
      getPivot({
        vertical: searchParams.vertical,
        group_by: groupBy.map((g) => `${g}:`),
      }),
    ),
    safe(() => getRecentEpisodes({ limit: 200 })),
  ]);

  // Compute summary tiles from the pivot rows
  const totalPitched = pivot.data
    ? pivot.data.rows.reduce((s, r) => s + r.closed + r.rejected, 0)
    : 0;
  const totalClosed = pivot.data
    ? pivot.data.rows.reduce((s, r) => s + r.closed, 0)
    : 0;
  const totalPending = pivot.data
    ? pivot.data.rows.reduce((s, r) => s + r.pending, 0)
    : 0;
  const overallRate = totalPitched > 0 ? totalClosed / totalPitched : 0;
  const closedRevenue = episodes.data
    ? episodes.data.episodes.reduce(
        (s, ep) =>
          s + (ep.pitch_outcome === "closed" ? ep.close_amount_gbp ?? 0 : 0),
        0,
      )
    : 0;

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

      <RuntimeStatusBanner status={status} />

      {pivot.error && (
        <div className="border border-rose-700 bg-rose-950/30 px-4 py-3 mb-4 font-mono text-xs text-rose-200">
          Pivot fetch failed: {pivot.error}
        </div>
      )}

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
          value={pivot.data?.rows.length ?? 0}
          hint={`grouped by ${groupBy.join(" × ")}`}
        />
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-sans text-base font-medium text-fg">
            Pivot by{" "}
            <span className="font-mono text-sm text-fg-muted">
              {groupBy.join(" × ")}
            </span>
          </h2>
          <PivotControls
            currentVertical={searchParams.vertical}
            currentGroupBy={groupBy.join(",")}
          />
        </div>
        {pivot.data ? (
          <PipelinePivot rows={pivot.data.rows} groupBy={groupBy} />
        ) : (
          <div className="border border-border bg-bg-panel px-4 py-6 text-fg-dim font-mono text-xs">
            Could not load pivot data.
          </div>
        )}
      </section>

      <p className="font-mono text-2xs text-fg-dim mt-6">
        Cached for 60s. Edit ?vertical= or ?group_by= in the URL to slice.
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
