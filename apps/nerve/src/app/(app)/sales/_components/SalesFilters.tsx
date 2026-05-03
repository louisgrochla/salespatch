"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Field, Select, TextInput } from "@/components/Form";

export interface FilterOptions {
  phases: string[];
  sectors: string[];
  businessTypes: string[];
  leadSources: string[];
  demoVersions: string[];
  contractors: string[];
}

export function SalesFilters({ options }: { options: FilterOptions }) {
  const router = useRouter();
  const params = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/sales?${next.toString()}`);
  }

  function clear() {
    router.replace("/sales");
  }

  const has = Array.from(params.keys()).length > 0;

  return (
    <div className="border border-border bg-bg-panel p-3 mb-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        <Field label="outcome">
          <Select value={params.get("outcome") ?? ""} onChange={(e) => setParam("outcome", e.target.value)}>
            <option value="">any</option>
            <option value="closed">closed</option>
            <option value="rejected">rejected</option>
            <option value="follow_up">follow_up</option>
          </Select>
        </Field>
        <Field label="phase">
          <Select value={params.get("phase") ?? ""} onChange={(e) => setParam("phase", e.target.value)}>
            <option value="">any</option>
            {options.phases.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
        <Field label="sector">
          <Select value={params.get("sector") ?? ""} onChange={(e) => setParam("sector", e.target.value)}>
            <option value="">any</option>
            {options.sectors.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="business type">
          <Select value={params.get("businessType") ?? ""} onChange={(e) => setParam("businessType", e.target.value)}>
            <option value="">any</option>
            {options.businessTypes.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="lead source">
          <Select value={params.get("leadSource") ?? ""} onChange={(e) => setParam("leadSource", e.target.value)}>
            <option value="">any</option>
            {options.leadSources.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="demo version">
          <Select value={params.get("demoVersion") ?? ""} onChange={(e) => setParam("demoVersion", e.target.value)}>
            <option value="">any</option>
            {options.demoVersions.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="search">
          <TextInput placeholder="business name…" defaultValue={params.get("q") ?? ""}
            onKeyDown={(e) => { if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value); }} />
        </Field>
      </div>
      {has && (
        <button
          onClick={clear}
          className="mt-2 font-mono text-2xs uppercase tracking-wider text-fg-dim hover:text-fg"
        >
          clear filters
        </button>
      )}
    </div>
  );
}
