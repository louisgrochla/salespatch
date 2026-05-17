"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Field, Select } from "@/components/Form";

export function NotesFilters({ phases, relatedSlugs }: { phases: string[]; relatedSlugs: string[] }) {
  const router = useRouter();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/notes?${next.toString()}`);
  }

  const has = Array.from(params.keys()).length > 0;

  return (
    <div className="border border-border bg-bg-panel p-3 mb-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Field label="scope">
          <Select value={params.get("scope") ?? ""} onChange={(e) => set("scope", e.target.value)}>
            <option value="">all scopes</option>
            <option value="lead">lead</option>
            <option value="system">system</option>
            <option value="pitch">pitch</option>
            <option value="research">research</option>
            <option value="other">other</option>
          </Select>
        </Field>
        <Field label="related slug">
          <Select value={params.get("relatedSlug") ?? ""} onChange={(e) => set("relatedSlug", e.target.value)}>
            <option value="">any slug</option>
            {relatedSlugs.map((s) => <option key={s} value={s}>{s}</option>)}
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
            placeholder="qa-visual, follow-up…"
            defaultValue={params.get("tag") ?? ""}
            onKeyDown={(e) => { if (e.key === "Enter") set("tag", (e.target as HTMLInputElement).value); }}
            className="mt-1 w-full bg-bg-panel border border-border focus:border-accent
                       text-fg font-mono text-xs px-2.5 py-1.5 outline-none"
          />
        </Field>
      </div>
      {has && (
        <button
          onClick={() => router.replace("/notes")}
          className="mt-2 font-mono text-2xs uppercase tracking-wider text-fg-dim hover:text-fg"
        >
          clear filters
        </button>
      )}
    </div>
  );
}
