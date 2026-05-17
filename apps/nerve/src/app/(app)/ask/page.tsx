import { prisma } from "@/lib/db";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { PageHeader } from "@/components/PageHeader";
import { PhasePill } from "@/components/PhasePill";
import { newChatSession } from "./actions";
import { isAskAvailable } from "@/lib/anthropic";

export const dynamic = "force-dynamic";

const EXAMPLES = [
  "Based on Phase 1 pitch data and literature on platform economics, what is the strongest argument for the discussion chapter?",
  "Summarise conversion patterns from the last 8 weeks in academic language for a findings section.",
  "What gaps exist between current data volume and what the methodology requires?",
  "Draft a methodology paragraph describing Phase 1 data collection.",
  "What does the failure log say about the most common points of drop-off?",
  "What has changed in the prompt library since February?",
];

export default async function AskListPage() {
  const sessions = await prisma.chatSession.findMany({
    orderBy: { updatedAt: "desc" }, take: 50,
    include: { _count: { select: { messages: true } } },
  });
  // R3: any session with scopeLeadSlug renders a small "scoped" badge so
  // the operator can tell vault-wide chats apart from per-business chats
  // at a glance.
  const askOk = isAskAvailable();
  const embeddingDisabled =
    !process.env.OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY === "" ||
    process.env.OPENAI_API_KEY.startsWith("sk-not-real");

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Ask"
        subtitle="Conversational queries grounded in your vault. Every turn cites the chunks it used."
        actions={
          <form action={newChatSession}>
            <button
              type="submit" disabled={!askOk}
              className="font-mono text-2xs uppercase tracking-wider bg-fg text-bg
                         hover:bg-fg-muted px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + new chat
            </button>
          </form>
        }
      />

      {!askOk && (
        <div className="border border-status-followup/40 bg-status-followup/5 px-4 py-3">
          <div className="h-section text-status-followup mb-1">/ask is disabled</div>
          <div className="font-mono text-xs text-fg-muted">
            <code>ANTHROPIC_API_KEY</code> is unset. Set it in <code>.env.local</code> (and on Vercel for prod) to enable conversational queries.
          </div>
        </div>
      )}
      {embeddingDisabled && (
        <div className="border border-status-followup/40 bg-status-followup/5 px-4 py-3">
          <div className="h-section text-status-followup mb-1">retrieval will be empty</div>
          <div className="font-mono text-xs text-fg-muted">
            <code>OPENAI_API_KEY</code> is also unset. Without embeddings, /ask answers from
            its system prompt only — no vault context. Set the OpenAI key and run
            <code>npm run db:backfill-embeddings</code> for the full RAG experience.
          </div>
        </div>
      )}

      {sessions.length === 0 ? (
        <div>
          <div className="h-section mb-2">try one of these</div>
          <ul className="border border-border bg-bg-panel divide-y divide-border max-w-3xl">
            {EXAMPLES.map((q) => (
              <li key={q} className="px-4 py-3 font-mono text-xs text-fg-muted">
                {q}
              </li>
            ))}
          </ul>
          <div className="font-mono text-2xs text-fg-dim mt-3">
            Click <span className="text-fg">+ new chat</span> to start one of these — or any of your own.
          </div>
        </div>
      ) : (
        <div>
          <div className="h-section mb-2">recent conversations</div>
          <div className="border border-border bg-bg-panel divide-y divide-border">
            {sessions.map((s) => (
              <Link key={s.id} href={`/ask/${s.id}`} className="block px-4 py-3 hover:bg-bg-hover">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="font-mono text-xs text-fg flex-1 truncate">
                    {s.title ?? "(untitled session)"}
                  </span>
                  {s.scopeLeadSlug && (
                    <span
                      className="font-mono text-2xs uppercase tracking-wider border border-accent/40 text-accent px-1.5 py-0.5"
                      title={`scoped to ${s.scopeLeadSlug}`}
                    >
                      scoped · {s.scopeLeadSlug}
                    </span>
                  )}
                  <span className="font-mono text-2xs text-fg-dim">
                    {s._count.messages} message{s._count.messages === 1 ? "" : "s"}
                  </span>
                  <PhasePill phase={s.phaseLabel} />
                  <span className="font-mono text-2xs text-fg-dim">
                    {formatDistanceToNow(s.updatedAt, { addSuffix: true })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
