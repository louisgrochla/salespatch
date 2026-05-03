import { cn } from "@/lib/cn";

const PHASE_CLASS: Record<string, string> = {
  "Phase 1": "pill-phase-1",
  "Phase 2": "pill-phase-2",
  "Phase 3": "pill-phase-3",
};

export function PhasePill({ phase, className }: { phase: string; className?: string }) {
  const cls = PHASE_CLASS[phase] ?? "pill-status-pending";
  return <span className={cn("pill", cls, className)}>{phase}</span>;
}

const STATUS_CLASS: Record<string, string> = {
  closed: "pill-status-closed",
  closed_now: "pill-status-closed",
  closed_followup: "pill-status-closed",
  rejected: "pill-status-rejected",
  follow_up: "pill-status-followup",
  not_pitched: "pill-status-pending",
  pending: "pill-status-pending",
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const cls = STATUS_CLASS[status] ?? "pill-status-pending";
  return (
    <span className={cn("pill", cls, className)}>{status.replace(/_/g, " ")}</span>
  );
}
