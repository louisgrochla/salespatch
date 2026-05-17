// Shared primitives + utilities used across every lead-detail sub-panel.
// Lifted out of `page.tsx` in R2 so new panels (Notes, Embeddings,
// QaVisual, Stripe events) can import them without duplicating.

export function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2 gap-4">
        <h2 className="font-sans text-base font-medium text-fg">{title}</h2>
        {subtitle && (
          <div className="font-mono text-2xs text-fg-dim text-right">{subtitle}</div>
        )}
      </div>
      {children}
    </section>
  );
}

export function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-border bg-bg-panel divide-y divide-border">
      {children}
    </div>
  );
}

export function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 px-4 py-2">
      <div className="h-section pt-0.5">{label}</div>
      <div className="font-mono text-xs text-fg">{children}</div>
    </div>
  );
}

export function Swatch({
  hex,
  label,
  pct,
}: {
  hex?: string;
  label: string;
  pct?: number;
}) {
  if (!hex) return null;
  return (
    <div className="flex items-center gap-2 font-mono text-2xs">
      <span
        className="inline-block w-7 h-7 border border-border"
        style={{ backgroundColor: hex }}
      />
      <div>
        <div className="text-fg">{hex}</div>
        <div className="text-fg-dim">
          {label}
          {pct !== undefined ? ` ${pct}%` : ""}
        </div>
      </div>
    </div>
  );
}

export function formatIso(iso: string | undefined | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").slice(0, 16) + "Z";
}

export function safeHost(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function outcomeColor(o: string): string {
  switch (o) {
    case "closed":
      return "text-status-closed";
    case "rejected":
      return "text-status-rejected";
    case "followup":
      return "text-status-followup";
    default:
      return "text-fg-muted";
  }
}
