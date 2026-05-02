import { prisma } from "@/lib/db";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader } from "@/components/PageHeader";
import { Field, TextInput, Select, SubmitButton } from "@/components/Form";
import { PhasePill } from "@/components/PhasePill";
import { semanticSearch, type SearchHit, type SearchFilter } from "@/lib/embeddings";
import { resolveSource, sectionPathFor } from "@/lib/source-resolver";
import { isAskAvailable } from "@/lib/anthropic";

export const dynamic = "force-dynamic";

const SOURCE_TYPES = [
  "PitchLog", "OperationsLog", "RevenueEntry", "CostEntry",
  "DemoRecord", "LeadRecord", "LiteratureEntry", "DissertationSection",
  "DissertationMeta", "MethodologyDoc", "PhaseBoundary",
  "PromptLibraryEntry", "EvidenceLog", "SupervisorMeeting",
  "AcademicCalendarItem",
];

interface SearchParams {
  q?: string;
  sourceType?: string;
  phase?: string;
  after?: string;
  before?: string;
  k?: string;
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const embeddingDisabled =
    !process.env.OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY === "" ||
    process.env.OPENAI_API_KEY.startsWith("sk-not-real");
  const embeddingsCount = await prisma.embedding.count();

  const phases = await prisma.phaseBoundary.findMany({
    orderBy: { startDate: "asc" }, select: { name: true },
  });

  const topK = Math.max(1, Math.min(50, Number(searchParams.k) || 10));
  const query = searchParams.q?.trim() ?? "";

  let hits: SearchHit[] = [];
  let resolved: Awaited<ReturnType<typeof resolveSource>>[] = [];
  let runError: string | null = null;

  if (query && !embeddingDisabled && embeddingsCount > 0) {
    try {
      const filter: SearchFilter = {};
      if (searchParams.sourceType) filter.sourceType = searchParams.sourceType;
      if (searchParams.phase) filter.phaseLabel = searchParams.phase;
      if (searchParams.after) filter.createdAfter = new Date(searchParams.after);
      if (searchParams.before) filter.createdBefore = new Date(searchParams.before);

      hits = await semanticSearch(query, { topK, filter });
      resolved = await Promise.all(
        hits.map((h) => resolveSource(h.sourceType, h.sourceId)),
      );
    } catch (e) {
      runError = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Search"
        subtitle={
          <span>
            Semantic search across the entire vault.
            {embeddingsCount > 0 && <> {embeddingsCount.toLocaleString()} embeddings indexed.</>}
            {isAskAvailable() && <> Try <Link href="/ask" className="text-accent underline">/ask</Link> for natural-language queries.</>}
          </span>
        }
      />

      {embeddingDisabled && (
        <div className="border border-status-followup/40 bg-status-followup/5 px-4 py-3">
          <div className="h-section text-status-followup mb-1">embeddings disabled</div>
          <div className="font-mono text-xs text-fg-muted">
            <code>OPENAI_API_KEY</code> is unset. Search needs OpenAI to embed queries and your vault content.
            Set the key and run <code>npm run db:backfill-embeddings</code>.
          </div>
        </div>
      )}

      {!embeddingDisabled && embeddingsCount === 0 && (
        <div className="border border-status-followup/40 bg-status-followup/5 px-4 py-3">
          <div className="h-section text-status-followup mb-1">no embeddings yet</div>
          <div className="font-mono text-xs text-fg-muted">
            Key is set but no rows have been embedded. Run <code>npm run db:backfill-embeddings</code>
            or save any record from the UI to backfill.
          </div>
        </div>
      )}

      <form className="border border-border bg-bg-panel p-4 space-y-3">
        <Field label="query">
          <TextInput
            type="search"
            name="q"
            placeholder="objections in hospitality pitches, methodology paragraph, prompt v3 changes…"
            defaultValue={query}
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Field label="source type">
            <Select name="sourceType" defaultValue={searchParams.sourceType ?? ""}>
              <option value="">any</option>
              {SOURCE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="phase">
            <Select name="phase" defaultValue={searchParams.phase ?? ""}>
              <option value="">any</option>
              {phases.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="created after">
            <TextInput type="date" name="after" defaultValue={searchParams.after ?? ""} />
          </Field>
          <Field label="created before">
            <TextInput type="date" name="before" defaultValue={searchParams.before ?? ""} />
          </Field>
          <Field label="top-k">
            <TextInput type="number" min={1} max={50} name="k" defaultValue={String(topK)} />
          </Field>
        </div>
        <div className="pt-2">
          <SubmitButton>Search</SubmitButton>
        </div>
      </form>

      {runError && (
        <div className="border border-status-rejected/40 bg-status-rejected/5 px-4 py-3 font-mono text-xs text-status-rejected">
          {runError}
        </div>
      )}

      {query && !runError && !embeddingDisabled && embeddingsCount > 0 && (
        <section>
          <div className="h-section mb-2">
            {hits.length === 0
              ? <>no results for <span className="text-fg">{query}</span></>
              : <>{hits.length} result{hits.length === 1 ? "" : "s"} for <span className="text-fg">{query}</span></>}
          </div>
          {hits.length > 0 && (
            <ol className="space-y-2">
              {hits.map((h, i) => {
                const r = resolved[i];
                return (
                  <li key={h.id} className="border border-border bg-bg-panel">
                    <div className="px-4 py-2 border-b border-border flex items-center gap-3 flex-wrap">
                      <span className="font-mono text-2xs text-fg-dim">#{i + 1}</span>
                      <span className="pill border-fg-muted/40 text-fg-muted">
                        {sectionPathFor(h.sourceType)}
                      </span>
                      <span className="font-mono text-2xs text-fg-dim">{h.sourceType}</span>
                      {r.url
                        ? <Link href={r.url} className="font-mono text-xs text-fg hover:underline">{r.title}</Link>
                        : <span className="font-mono text-xs text-fg">{r.title}</span>}
                      {!r.exists && <span className="font-mono text-2xs text-status-rejected">[unresolved]</span>}
                      {r.date && <span className="font-mono text-2xs text-fg-dim">{format(r.date, "dd LLL yyyy")}</span>}
                      <span className="ml-auto flex items-center gap-2">
                        <PhasePill phase={h.phaseLabel} />
                        <span className="font-mono text-2xs text-fg-dim">d={h.distance.toFixed(3)}</span>
                      </span>
                    </div>
                    <pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed p-4">
                      {h.chunkText}
                    </pre>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}
