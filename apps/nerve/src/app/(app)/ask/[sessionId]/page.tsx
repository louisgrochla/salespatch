import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { Markdown } from "@/components/Markdown";
import { PhasePill } from "@/components/PhasePill";
import { sendMessage, deleteChatSession } from "../actions";
import { Composer } from "../_components/Composer";
import { Sources, type SourceItem } from "../_components/Sources";
import { isAskAvailable } from "@/lib/anthropic";

export const dynamic = "force-dynamic";

export default async function ChatSessionPage({
  params,
}: {
  params: { sessionId: string };
}) {
  const session = await prisma.chatSession.findUnique({
    where: { id: params.sessionId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!session) notFound();

  const sendAction = sendMessage.bind(null, session.id);
  const deleteAction = deleteChatSession.bind(null, session.id);
  const askOk = isAskAvailable();

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title={session.title ?? "(untitled chat)"}
        subtitle={
          <span>
            {session.messages.length} message{session.messages.length === 1 ? "" : "s"} ·
            started {formatDistanceToNow(session.createdAt, { addSuffix: true })}
            <span className="ml-2"><PhasePill phase={session.phaseLabel} /></span>
          </span>
        }
        actions={
          <>
            <form action={deleteAction}>
              <button type="submit"
                className="font-mono text-2xs uppercase tracking-wider text-status-rejected
                           hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">
                delete chat
              </button>
            </form>
            <Link href="/ask"
              className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg
                         border border-border hover:border-border-strong px-2 py-1">
              all chats
            </Link>
          </>
        }
      />

      <div className="space-y-3">
        {session.messages.map((m) => {
          const sources = (m.sources as unknown as SourceItem[] | null) ?? null;
          return (
            <div key={m.id} className="grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-3">
              <article
                className={`border border-border bg-bg-panel ${m.role === "user" ? "border-l-2 border-l-accent" : "border-l-2 border-l-fg-dim"}`}
              >
                <header className="px-4 py-2 border-b border-border flex items-baseline justify-between">
                  <span className="font-mono text-2xs uppercase tracking-wider text-fg-dim">
                    {m.role}
                  </span>
                  <span className="font-mono text-2xs text-fg-dim">
                    {format(m.createdAt, "dd LLL · HH:mm")}
                    {m.model && <span className="ml-2">· {m.model}</span>}
                    {m.inputTokens != null && m.outputTokens != null && (
                      <span className="ml-2">· in {m.inputTokens} / out {m.outputTokens}</span>
                    )}
                  </span>
                </header>
                <div className="p-4">
                  {m.role === "user" ? (
                    <pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">
                      {m.content}
                    </pre>
                  ) : (
                    <Markdown source={m.content} />
                  )}
                </div>
              </article>

              {m.role === "assistant" && sources && (
                <aside className="lg:sticky lg:top-4 lg:self-start">
                  <div className="h-section mb-2">sources ({sources.length})</div>
                  <Sources items={sources} />
                </aside>
              )}
            </div>
          );
        })}
      </div>

      <Composer action={sendAction} disabled={!askOk} />
    </div>
  );
}
