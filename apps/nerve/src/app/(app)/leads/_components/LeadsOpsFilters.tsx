import Link from "next/link";
import { STAGE_ORDER, type LeadOpsFilterOptions } from "@/lib/sl-mas/leadOpsQuery";

interface LeadsOpsFiltersProps {
  searchParams: Record<string, string | string[] | undefined>;
  options: LeadOpsFilterOptions;
}

const FLAG_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "all leads" },
  { value: "only_critical_qa", label: "critical QA only" },
  { value: "only_paid_unbuilt", label: "paid · unbuilt" },
  { value: "only_unassigned", label: "unassigned" },
  { value: "only_active_onboarding", label: "active onboarding" },
];

/**
 * Server component — submits to /leads as GET with the same param names
 * loadLeadsOps reads. No client JS; the table re-renders on submit.
 */
export function LeadsOpsFilters({
  searchParams,
  options,
}: LeadsOpsFiltersProps) {
  const currentStages = readMulti(searchParams.stage);
  const currentSources = readMulti(searchParams.source);
  const currentVertical = readOne(searchParams.vertical);
  const currentSp = readOne(searchParams.sp);
  const currentFlag = readOne(searchParams.flag);
  const currentQ = readOne(searchParams.q);

  const hasFilter =
    currentStages.length > 0 ||
    currentSources.length > 0 ||
    !!currentVertical ||
    !!currentSp ||
    !!currentFlag ||
    !!currentQ;

  return (
    <form
      method="get"
      action="/leads"
      className="border border-border bg-bg-panel px-4 py-3 space-y-3"
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="block flex-1 min-w-[180px]">
          <span className="h-section block mb-1">search</span>
          <input
            type="text"
            name="q"
            defaultValue={currentQ ?? ""}
            placeholder="business name · postcode · slug"
            className="w-full font-mono text-xs bg-bg-raised border border-border px-2 py-1 text-fg"
          />
        </label>

        <label className="block">
          <span className="h-section block mb-1">vertical</span>
          <select
            name="vertical"
            defaultValue={currentVertical ?? ""}
            className="w-40 font-mono text-xs bg-bg-raised border border-border px-2 py-1 text-fg"
          >
            <option value="">all</option>
            {options.verticals.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="h-section block mb-1">salesperson</span>
          <select
            name="sp"
            defaultValue={currentSp ?? ""}
            className="w-44 font-mono text-xs bg-bg-raised border border-border px-2 py-1 text-fg"
            disabled={options.salespeople.length === 0}
          >
            <option value="">any</option>
            {options.salespeople.map((u) => (
              <option key={u.userId} value={u.displayName}>
                {u.displayName}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="h-section block mb-1">flag</span>
          <select
            name="flag"
            defaultValue={currentFlag ?? ""}
            className="w-44 font-mono text-xs bg-bg-raised border border-border px-2 py-1 text-fg"
          >
            {FLAG_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="font-mono text-2xs uppercase tracking-wider bg-fg text-bg hover:bg-fg-muted px-3 py-1"
          >
            apply
          </button>
          {hasFilter && (
            <Link
              href="/leads"
              className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border px-2 py-1"
            >
              reset
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="h-section">stage</span>
        {STAGE_ORDER.map((stage) => {
          const checked = currentStages.includes(stage);
          return (
            <label
              key={stage}
              className="inline-flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wider text-fg-muted cursor-pointer"
            >
              <input
                type="checkbox"
                name="stage"
                value={stage}
                defaultChecked={checked}
                className="accent-fg"
              />
              <span>{stage.replace(/_/g, " ")}</span>
            </label>
          );
        })}
        <span className="h-section ml-4">source</span>
        {options.sources.map((src) => {
          const checked = currentSources.includes(src);
          return (
            <label
              key={src}
              className="inline-flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wider text-fg-muted cursor-pointer"
            >
              <input
                type="checkbox"
                name="source"
                value={src}
                defaultChecked={checked}
                className="accent-fg"
              />
              <span>{src}</span>
            </label>
          );
        })}
      </div>
    </form>
  );
}

function readOne(v: string | string[] | undefined): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (Array.isArray(v) && v.length > 0) return v[0] ?? null;
  return null;
}

function readMulti(v: string | string[] | undefined): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.flatMap((s) => s.split(",")).filter(Boolean);
  return v.split(",").filter(Boolean);
}
