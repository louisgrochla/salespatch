import { cn } from "@/lib/cn";

// Each project_type gets its own colour pill so the timeline scans
// fast. Colours are pulled from the existing palette so they sit
// alongside phase + status pills without visual noise.

const STYLES: Record<string, string> = {
  nerve: "border-accent/40 text-accent",
  salespatch: "border-status-closed/40 text-status-closed",
  ios_app: "border-status-followup/40 text-status-followup",
  sl_mas_pipeline: "border-fg-muted/40 text-fg-muted",
  spit_out: "border-status-rejected/40 text-status-rejected",
  other: "border-border text-fg-dim",
};

export function ProjectBadge({ projectType }: { projectType: string }) {
  const style = STYLES[projectType] ?? STYLES.other;
  return (
    <span
      className={cn(
        "inline-flex items-center font-mono text-2xs uppercase tracking-wider",
        "border px-1.5 py-0.5 leading-none",
        style,
      )}
    >
      {projectType}
    </span>
  );
}
