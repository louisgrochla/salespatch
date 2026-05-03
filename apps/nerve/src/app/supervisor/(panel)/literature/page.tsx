import { prisma } from "@/lib/db";
import { SupervisorSubNav } from "../_components/SubNav";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const POSITION_COLOR: Record<string, string> = {
  supports: "text-status-closed",
  challenges: "text-status-rejected",
  contextualises: "text-phase-one",
};

export default async function SupervisorLiteraturePage() {
  const entries = await prisma.literatureEntry.findMany({
    orderBy: [{ year: "desc" }, { authors: "asc" }],
  });

  return (
    <div className="space-y-6">
      <SupervisorSubNav />
      <header>
        <h1 className="font-sans text-xl font-medium text-fg">Literature</h1>
        <p className="font-mono text-2xs text-fg-dim mt-1">
          Read-only view of the literature library. {entries.length.toLocaleString()} entries.
        </p>
      </header>

      {entries.length === 0 ? (
        <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">
          No entries yet.
        </div>
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border">
          {entries.map((e) => (
            <div key={e.id} className="px-4 py-3">
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="font-mono text-xs text-fg">{e.authors}</span>
                <span className="font-mono text-2xs text-fg-dim">{e.year ?? "n.d."}</span>
                {e.position && (
                  <span className={cn("font-mono text-2xs uppercase tracking-wider", POSITION_COLOR[e.position])}>
                    {e.position}
                  </span>
                )}
                {e.doi && (
                  <a href={`https://doi.org/${e.doi}`} target="_blank" rel="noreferrer noopener"
                    className="font-mono text-2xs text-accent hover:underline ml-auto">
                    doi:{e.doi}
                  </a>
                )}
                {!e.doi && e.url && (
                  <a href={e.url} target="_blank" rel="noreferrer noopener"
                    className="font-mono text-2xs text-accent hover:underline ml-auto truncate max-w-xs">
                    {e.url}
                  </a>
                )}
              </div>
              <div className="font-sans text-sm text-fg mt-1 leading-snug">{e.title}</div>
              {e.themeTags.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {e.themeTags.map((t) => (
                    <span key={t} className="font-mono text-2xs text-fg-dim border border-border px-1.5 py-0.5">{t}</span>
                  ))}
                </div>
              )}
              {e.abstract && (
                <p className="font-sans text-xs text-fg-muted mt-2 leading-relaxed">{e.abstract}</p>
              )}
              {e.personalNotes && (
                <details className="mt-2">
                  <summary className="font-mono text-2xs text-fg-dim cursor-pointer">researcher notes</summary>
                  <pre className="font-mono text-2xs text-fg-muted whitespace-pre-wrap leading-relaxed mt-1">{e.personalNotes}</pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
