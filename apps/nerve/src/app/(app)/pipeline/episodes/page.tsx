import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { cn } from "@/lib/cn";
import { episodicStore, type EpisodeRow } from "@/lib/sl-mas/episodicStore";

export const dynamic = "force-dynamic";

interface SearchParams {
  vertical?: string;
  limit?: string;
}

export default async function EpisodesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const limit = Math.min(Math.max(Number(searchParams.limit ?? "100"), 1), 500);
  const episodes = await episodicStore.listRecent(limit, searchParams.vertical);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Recent episodes"
        subtitle={`Last ${limit} pipeline runs · click any row to expand`}
        actions={
          <>
            <HeaderLink href="/pipeline">Pivot</HeaderLink>
            <HeaderLink href="/pipeline/strategies">Strategies</HeaderLink>
          </>
        }
      />

      <EpisodesTable episodes={episodes} />

      <p className="font-mono text-2xs text-fg-dim mt-6">
        Live from Postgres. Use ?vertical=barber or ?limit=200 in the URL.
      </p>
    </div>
  );
}

function EpisodesTable({ episodes }: { episodes: EpisodeRow[] }) {
  if (episodes.length === 0) {
    return (
      <div className="border border-border bg-bg-panel px-4 py-6 text-fg-dim font-mono text-xs">
        No episodes yet. Run a pipeline or log a manual /build-demo decision.
      </div>
    );
  }

  return (
    <div className="border border-border bg-bg-panel overflow-x-auto">
      <table className="min-w-full text-xs font-mono">
        <thead>
          <tr className="text-fg-dim uppercase tracking-wider text-2xs border-b border-border">
            <th className="text-left px-3 py-2 font-medium">lead</th>
            <th className="text-left px-3 py-2 font-medium">vertical</th>
            <th className="text-left px-3 py-2 font-medium">outcome</th>
            <th className="text-right px-3 py-2 font-medium">£</th>
            <th className="text-right px-3 py-2 font-medium">score</th>
            <th className="text-right px-3 py-2 font-medium">retries</th>
            <th className="text-left px-3 py-2 font-medium">tags</th>
            <th className="text-left px-3 py-2 font-medium">started</th>
          </tr>
        </thead>
        <tbody>
          {episodes.map((ep) => {
            const outcomeClass =
              ep.pitch_outcome === "closed"
                ? "text-emerald-400"
                : ep.pitch_outcome === "rejected"
                  ? "text-rose-400"
                  : ep.pitch_outcome === "follow_up"
                    ? "text-amber-400"
                    : "text-fg-dim";
            const composerScore = ep.critic_scores?.compose;
            const startedAt = new Date(ep.started_at);
            return (
              <tr
                key={ep.id}
                className="border-t border-border/50 hover:bg-bg-hover align-top"
              >
                <td className="px-3 py-2 text-fg">
                  {ep.lead_id ?? "—"}
                  {ep.business_name && ep.business_name !== ep.lead_id && (
                    <div className="text-fg-dim text-2xs mt-0.5">
                      {ep.business_name}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-fg-muted">{ep.vertical ?? "—"}</td>
                <td className={cn("px-3 py-2", outcomeClass)}>
                  {ep.pitch_outcome ?? "(pending)"}
                </td>
                <td className="px-3 py-2 text-right text-fg">
                  {ep.close_amount_gbp != null
                    ? `£${ep.close_amount_gbp}`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right text-fg-muted">
                  {composerScore != null ? composerScore.toFixed(2) : "—"}
                </td>
                <td className="px-3 py-2 text-right text-fg-dim">
                  {ep.reflection_iterations}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1 max-w-md">
                    {ep.pivot_tags.slice(0, 6).map((t) => (
                      <span
                        key={t}
                        className="text-2xs text-fg-dim border border-border/60 px-1.5 py-0.5"
                      >
                        {t}
                      </span>
                    ))}
                    {ep.pivot_tags.length > 6 && (
                      <span className="text-2xs text-fg-dim">
                        +{ep.pivot_tags.length - 6}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-fg-dim whitespace-nowrap">
                  {startedAt.toLocaleString("en-GB", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
