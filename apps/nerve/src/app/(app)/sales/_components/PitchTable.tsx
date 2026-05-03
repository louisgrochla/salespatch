"use client";

import { DataTable, type Column } from "@/components/DataTable";
import { PhasePill, StatusPill } from "@/components/PhasePill";
import { format } from "date-fns";
import { useRouter } from "next/navigation";

export interface PitchRow {
  id: string;
  date: string; // ISO
  businessName: string;
  businessType: string | null;
  sector: string | null;
  leadSource: string | null;
  demoVersion: string | null;
  outcome: "closed" | "rejected" | "follow_up" | "closed_now" | "closed_followup" | "not_pitched";
  contractorId: string | null;
  pitchDuration: number | null;
  phaseLabel: string;
  objections: string[];
}

export function PitchTable({ rows }: { rows: PitchRow[] }) {
  const router = useRouter();

  const columns: Column<PitchRow>[] = [
    {
      key: "date",
      header: "date",
      cell: (r) => format(new Date(r.date), "dd LLL HH:mm"),
      sortValue: (r) => new Date(r.date).getTime(),
      width: "11rem",
    },
    {
      key: "businessName",
      header: "business",
      cell: (r) => <span className="text-fg">{r.businessName}</span>,
      sortValue: (r) => r.businessName.toLowerCase(),
    },
    {
      key: "sector",
      header: "sector",
      cell: (r) => r.sector ?? <span className="text-fg-dim">—</span>,
      sortValue: (r) => r.sector ?? "",
    },
    {
      key: "businessType",
      header: "type",
      cell: (r) => r.businessType ?? <span className="text-fg-dim">—</span>,
      sortValue: (r) => r.businessType ?? "",
    },
    {
      key: "outcome",
      header: "outcome",
      cell: (r) => <StatusPill status={r.outcome} />,
      sortValue: (r) => r.outcome,
    },
    {
      key: "objections",
      header: "objections",
      cell: (r) => r.objections.length === 0
        ? <span className="text-fg-dim">—</span>
        : <span className="text-fg-muted">{r.objections.join(", ")}</span>,
    },
    {
      key: "leadSource",
      header: "lead",
      cell: (r) => r.leadSource ?? <span className="text-fg-dim">—</span>,
      sortValue: (r) => r.leadSource ?? "",
    },
    {
      key: "demoVersion",
      header: "demo",
      cell: (r) => r.demoVersion ?? <span className="text-fg-dim">—</span>,
      sortValue: (r) => r.demoVersion ?? "",
    },
    {
      key: "contractorId",
      header: "sp",
      cell: (r) => r.contractorId ?? <span className="text-fg-dim">—</span>,
      sortValue: (r) => r.contractorId ?? "",
    },
    {
      key: "duration",
      header: "duration",
      cell: (r) => r.pitchDuration == null
        ? <span className="text-fg-dim">—</span>
        : `${Math.round(r.pitchDuration / 60)}m`,
      sortValue: (r) => r.pitchDuration ?? -1,
      align: "right",
      width: "5rem",
    },
    {
      key: "phaseLabel",
      header: "phase",
      cell: (r) => <PhasePill phase={r.phaseLabel} />,
      sortValue: (r) => r.phaseLabel,
      width: "6rem",
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      defaultSortKey="date"
      defaultSortDir="desc"
      empty="No pitches match the current filters."
      onRowClick={(r) => router.push(`/sales/${r.id}`)}
    />
  );
}
