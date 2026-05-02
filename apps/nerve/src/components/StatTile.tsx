import { cn } from "@/lib/cn";

export function StatTile({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("border border-border bg-bg-panel px-4 py-3", className)}>
      <div className="h-section">{label}</div>
      <div className="font-mono text-2xl text-fg mt-1 leading-none">{value}</div>
      {hint && (
        <div className="font-mono text-2xs text-fg-dim mt-2">{hint}</div>
      )}
    </div>
  );
}
