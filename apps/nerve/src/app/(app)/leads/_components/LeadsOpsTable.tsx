import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/cn";
import type { LeadOpsRow, LeadOpsStage } from "@/lib/sl-mas/leadOpsQuery";

interface LeadsOpsTableProps {
  rows: LeadOpsRow[];
}

const STAGE_PILL: Record<LeadOpsStage, string> = {
  unassigned: "pill-status-pending",
  not_contacted: "pill-status-pending",
  contacted: "pill-status-followup",
  pitched: "pill-status-followup",
  sold: "pill-status-closed",
  paid: "pill-status-closed",
  rejected: "pill-status-rejected",
};

export function LeadsOpsTable({ rows }: LeadsOpsTableProps) {
  if (rows.length === 0) {
    return (
      <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">
        No leads match the current filter.
      </div>
    );
  }
  return (
    <div className="border border-border bg-bg-panel overflow-x-auto">
      <table className="nv-table">
        <thead>
          <tr>
            <th>business</th>
            <th>stage</th>
            <th>assigned to</th>
            <th>demo</th>
            <th>pitches</th>
            <th>build</th>
            <th className="text-right">revenue</th>
            <th>last activity</th>
            <th className="text-right">visits</th>
            <th>feedback</th>
            <th>flags</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.source}:${r.leadId}`} className="cursor-pointer">
              <BusinessCell row={r} />
              <StageCell row={r} />
              <AssignedCell row={r} />
              <DemoCell row={r} />
              <PitchCell row={r} />
              <BuildCell row={r} />
              <RevenueCell row={r} />
              <ActivityCell row={r} />
              <VisitCell row={r} />
              <FeedbackCell row={r} />
              <FlagsCell row={r} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BusinessCell({ row }: { row: LeadOpsRow }) {
  const subtitleBits = [row.vertical, row.postcode ?? row.location].filter(Boolean);
  return (
    <td>
      <Link
        href={`/leads/${row.leadId}`}
        className="text-fg hover:underline"
      >
        {row.businessName}
      </Link>
      {subtitleBits.length > 0 && (
        <div className="font-mono text-2xs text-fg-dim mt-0.5">
          {subtitleBits.join(" · ")}
        </div>
      )}
    </td>
  );
}

function StageCell({ row }: { row: LeadOpsRow }) {
  return (
    <td>
      <span className={cn("pill", STAGE_PILL[row.stage])}>
        {row.stage.replace(/_/g, " ")}
      </span>
    </td>
  );
}

function AssignedCell({ row }: { row: LeadOpsRow }) {
  if (!row.assignedUserId) {
    return <td className="text-fg-dim">—</td>;
  }
  return (
    <td className="font-mono text-xs">
      {row.assignedDisplayName ?? (
        <span className="text-fg-muted">{row.assignedUserId.slice(0, 8)}…</span>
      )}
    </td>
  );
}

function DemoCell({ row }: { row: LeadOpsRow }) {
  if (!row.hasDemo) {
    return <td className="text-fg-dim">—</td>;
  }
  const qaTone =
    row.hasCriticalQa === true
      ? "text-status-rejected"
      : row.hasCriticalQa === false
      ? "text-status-closed"
      : "text-fg-dim";
  const qaLabel =
    row.hasCriticalQa === true
      ? "critical"
      : row.hasCriticalQa === false
      ? "clean"
      : "no QA";
  return (
    <td>
      <div className="font-mono text-xs text-fg">
        {row.demoCount} demo{row.demoCount === 1 ? "" : "s"}
      </div>
      <div className={cn("font-mono text-2xs uppercase tracking-wider", qaTone)}>
        {qaLabel}
      </div>
    </td>
  );
}

function PitchCell({ row }: { row: LeadOpsRow }) {
  if (row.pitchCount === 0) {
    return <td className="text-fg-dim">—</td>;
  }
  return (
    <td>
      <div className="font-mono text-xs">{row.pitchCount}</div>
      {row.latestPitchOutcome && (
        <div className="font-mono text-2xs uppercase tracking-wider text-fg-muted">
          {row.latestPitchOutcome.replace(/_/g, " ")}
        </div>
      )}
    </td>
  );
}

function BuildCell({ row }: { row: LeadOpsRow }) {
  if (!row.build) {
    return <td className="text-fg-dim">—</td>;
  }
  const parts: string[] = [];
  if (row.build.paid) parts.push("paid");
  if (row.build.onboardingCompleted) parts.push("onboarded");
  else if (row.build.onboardingTouched) parts.push("active");
  if (row.build.hasChangeRequests) parts.push("changes");
  return (
    <td>
      <Link
        href="/builds"
        className="font-mono text-xs text-fg hover:underline"
      >
        {parts.length > 0 ? parts.join(" · ") : row.build.status ?? "—"}
      </Link>
    </td>
  );
}

function RevenueCell({ row }: { row: LeadOpsRow }) {
  if (row.revenuePence === 0) {
    return <td className="text-right text-fg-dim">—</td>;
  }
  const pounds = row.revenuePence / 100;
  return (
    <td className="text-right font-mono text-xs">
      £{pounds.toFixed(2)}
    </td>
  );
}

function ActivityCell({ row }: { row: LeadOpsRow }) {
  if (!row.lastActivityAt) {
    return <td className="text-fg-dim">—</td>;
  }
  return (
    <td className="font-mono text-2xs text-fg-muted whitespace-nowrap">
      {formatDistanceToNow(row.lastActivityAt, { addSuffix: true })}
    </td>
  );
}

function VisitCell({ row }: { row: LeadOpsRow }) {
  if (row.visitMinutes === null || row.visitMinutes === 0) {
    return <td className="text-right text-fg-dim">—</td>;
  }
  if (row.visitMinutes < 60) {
    return <td className="text-right font-mono text-xs">{row.visitMinutes}m</td>;
  }
  const hours = (row.visitMinutes / 60).toFixed(1);
  return <td className="text-right font-mono text-xs">{hours}h</td>;
}

function FeedbackCell({ row }: { row: LeadOpsRow }) {
  if (row.feedbackCount === 0) {
    return <td className="text-fg-dim">—</td>;
  }
  return (
    <td>
      <Link
        href={`/leads/${row.leadId}#notes`}
        className="font-mono text-xs text-fg hover:underline"
      >
        {row.feedbackCount}
      </Link>
    </td>
  );
}

function FlagsCell({ row }: { row: LeadOpsRow }) {
  const flags: { label: string; tone: string }[] = [];
  if (row.flags.criticalQa) flags.push({ label: "critical", tone: "pill-status-rejected" });
  if (row.flags.unassigned) flags.push({ label: "unassigned", tone: "pill-status-pending" });
  if (row.flags.paidUnbuilt) flags.push({ label: "unbuilt", tone: "pill-status-followup" });
  if (row.flags.overdue) flags.push({ label: "overdue", tone: "pill-status-rejected" });
  if (row.flags.missingPitchLog) flags.push({ label: "no pitch row", tone: "pill-status-rejected" });
  if (flags.length === 0) {
    return <td className="text-fg-dim">—</td>;
  }
  return (
    <td>
      <div className="flex flex-wrap gap-1">
        {flags.map((f) => (
          <span key={f.label} className={cn("pill", f.tone)}>
            {f.label}
          </span>
        ))}
      </div>
    </td>
  );
}

