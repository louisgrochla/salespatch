import { cn } from "@/lib/cn";

export function RuntimeStatusBanner({
  status,
}: {
  status: { configured: boolean; reachable: boolean; error?: string };
}) {
  if (status.reachable) return null;

  const tone = status.configured ? "warn" : "info";
  const headline = status.configured
    ? "Runtime unreachable"
    : "Runtime not configured";
  const detail = status.configured
    ? `Pi runtime didn't respond — showing cached values where available. ${status.error ?? ""}`
    : "Set RUNTIME_URL and MISSION_CONTROL_API_TOKEN in this Vercel project's env to fetch live SL-MAS data.";

  return (
    <div
      className={cn(
        "border px-4 py-3 mb-4 font-mono text-xs",
        tone === "warn"
          ? "border-amber-700 bg-amber-950/30 text-amber-200"
          : "border-border bg-bg-panel text-fg-muted",
      )}
    >
      <div className="font-medium uppercase tracking-wider text-2xs mb-1">
        {headline}
      </div>
      <div className="text-fg-dim">{detail}</div>
    </div>
  );
}
