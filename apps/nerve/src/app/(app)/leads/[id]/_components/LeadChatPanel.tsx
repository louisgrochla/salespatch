import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Section } from "./primitives";
import { newLeadChat } from "@/app/(app)/ask/actions";

interface ScopedSession {
  id: string;
  title: string | null;
  updatedAt: Date;
  messageCount: number;
}

export function LeadChatPanel({
  leadSlug,
  displayName,
  sessions,
  askAvailable,
  embeddingsExist,
}: {
  leadSlug: string;
  displayName: string;
  sessions: ScopedSession[];
  askAvailable: boolean;
  embeddingsExist: boolean;
}) {
  const startAction = newLeadChat.bind(null, leadSlug);
  return (
    <Section
      title="Ask about this business"
      subtitle="Conversational queries scoped to chunks tied to this lead only"
    >
      <div className="border border-border bg-bg-panel">
        {!askAvailable && (
          <div className="px-4 py-3 font-mono text-xs text-fg-muted border-b border-border">
            <code>ANTHROPIC_API_KEY</code> is unset. Set it on Vercel to enable
            conversational queries.
          </div>
        )}
        {askAvailable && !embeddingsExist && (
          <div className="px-4 py-3 font-mono text-xs text-fg-muted border-b border-border">
            No embeddings tied to this lead yet. A chat will still answer from
            general knowledge but won't cite this business's records.
          </div>
        )}

        {sessions.length === 0 ? (
          <div className="px-4 py-4 flex items-center justify-between gap-3">
            <div className="font-sans text-xs text-fg-muted">
              No scoped chats yet. Ask anything about{" "}
              <span className="text-fg">{displayName}</span> — answers will
              only cite chunks from this lead's records.
            </div>
            <form action={startAction}>
              <button
                type="submit"
                disabled={!askAvailable}
                className="font-mono text-2xs uppercase tracking-wider bg-fg text-bg
                           hover:bg-fg-muted px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed
                           shrink-0"
              >
                + start chat
              </button>
            </form>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border">
              {sessions.map((s) => (
                <Link
                  key={s.id}
                  href={`/ask/${s.id}`}
                  className="block px-4 py-3 hover:bg-bg-hover"
                >
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="font-mono text-xs text-fg flex-1 truncate">
                      {s.title ?? "(untitled chat)"}
                    </span>
                    <span className="font-mono text-2xs text-fg-dim">
                      {s.messageCount} msg{s.messageCount === 1 ? "" : "s"}
                    </span>
                    <span className="font-mono text-2xs text-fg-dim">
                      {formatDistanceToNow(s.updatedAt, { addSuffix: true })}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-3">
              <span className="font-mono text-2xs text-fg-dim">
                {sessions.length} scoped chat{sessions.length === 1 ? "" : "s"}{" "}
                · earlier chats: <Link href="/ask" className="hover:text-fg">/ask</Link>
              </span>
              <form action={startAction}>
                <button
                  type="submit"
                  disabled={!askAvailable}
                  className="font-mono text-2xs uppercase tracking-wider bg-fg text-bg
                             hover:bg-fg-muted px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed
                             shrink-0"
                >
                  + new chat
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </Section>
  );
}
