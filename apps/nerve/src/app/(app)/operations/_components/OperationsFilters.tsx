"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Field, Select } from "@/components/Form";

export function OperationsFilters({ phases }: { phases: string[] }) {
  const router = useRouter();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/operations?${next.toString()}`);
  }

  const has = Array.from(params.keys()).length > 0;

  return (
    <div className="border border-border bg-bg-panel p-3 mb-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <Field label="type">
          <Select value={params.get("type") ?? ""} onChange={(e) => set("type", e.target.value)}>
            <option value="">all types</option>
            <option value="weekly">weekly</option>
            <option value="decision">decision</option>
            <option value="failure">failure</option>
            <option value="iteration">iteration</option>
          </Select>
        </Field>
        <Field label="phase">
          <Select value={params.get("phase") ?? ""} onChange={(e) => set("phase", e.target.value)}>
            <option value="">all phases</option>
            {phases.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
        <Field label="tag contains">
          <input
            type="text"
            placeholder="onboarding, payments…"
            defaultValue={params.get("tag") ?? ""}
            onKeyDown={(e) => { if (e.key === "Enter") set("tag", (e.target as HTMLInputElement).value); }}
            className="mt-1 w-full bg-bg-panel border border-border focus:border-accent
                       text-fg font-mono text-xs px-2.5 py-1.5 outline-none"
          />
        </Field>
      </div>
      {has && (
        <button
          onClick={() => router.replace("/operations")}
          className="mt-2 font-mono text-2xs uppercase tracking-wider text-fg-dim hover:text-fg"
        >
          clear filters
        </button>
      )}
    </div>
  );
}
