"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { semanticSearch, type SearchFilter } from "@/lib/embeddings";
import { askClaude, buildContextBlock, isAskAvailable } from "@/lib/anthropic";
import { phaseLabelFor } from "@/lib/phase";
import { requireSession } from "@/lib/auth-guard";
import { getLeadSourceIds } from "@/lib/sl-mas/leadEmbeddings";

const TOP_K = 12;

export async function newChatSession() {
  await requireSession();
  const phaseLabel = await phaseLabelFor(new Date());
  const session = await prisma.chatSession.create({
    data: { phaseLabel },
  });
  revalidatePath("/ask");
  redirect(`/ask/${session.id}`);
}

// R3: start a new chat session scoped to one lead. The session's
// scopeLeadSlug field steers semanticSearch to embeddings tied to this
// lead only on every subsequent sendMessage call.
export async function newLeadChat(leadSlug: string) {
  await requireSession();
  const phaseLabel = await phaseLabelFor(new Date());
  const session = await prisma.chatSession.create({
    data: { phaseLabel, scopeLeadSlug: leadSlug },
  });
  revalidatePath("/ask");
  revalidatePath(`/leads/${leadSlug}`);
  redirect(`/ask/${session.id}`);
}

export async function deleteChatSession(id: string) {
  await requireSession();
  await prisma.chatSession.delete({ where: { id } });
  revalidatePath("/ask");
  redirect("/ask");
}

export async function sendMessage(sessionId: string, formData: FormData) {
  await requireSession();
  const raw = formData.get("query");
  const query = typeof raw === "string" ? raw.trim() : "";
  if (!query) return;
  if (!isAskAvailable()) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  // 1. Persist the user message immediately (so even a Claude failure
  //    leaves the question recorded).
  const user = await prisma.chatMessage.create({
    data: { sessionId, role: "user", content: query },
  });

  // R3: if this session is scoped to a lead, narrow retrieval to that
  // lead's source IDs only. Empty array → semanticSearch short-circuits
  // and we'll fall through to the "no vault context available" path
  // rather than running an unfiltered query that'd defeat the scope.
  const scopeSession = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { scopeLeadSlug: true },
  });
  let scopeFilter: SearchFilter | undefined;
  if (scopeSession?.scopeLeadSlug) {
    const sourceIds = await getLeadSourceIds(scopeSession.scopeLeadSlug);
    scopeFilter = { sourceId: sourceIds };
  }

  // 2. RAG retrieve.
  let hits: Awaited<ReturnType<typeof semanticSearch>> = [];
  let resolved: Awaited<ReturnType<typeof buildContextBlock>>["resolved"] = [];
  let contextBlock = scopeSession?.scopeLeadSlug
    ? `(no chunks tied to this lead yet — RAG can't help here. Answering from general context.)`
    : "(no vault context available)";
  try {
    hits = await semanticSearch(query, { topK: TOP_K, filter: scopeFilter });
    if (hits.length > 0) {
      const built = await buildContextBlock(hits);
      contextBlock = built.block;
      resolved = built.resolved;
    }
  } catch (e) {
    // Embedding failures shouldn't block the call — just answer without context.
    contextBlock = `(retrieval failed: ${e instanceof Error ? e.message : String(e)})`;
  }

  // 3. Pull prior turns (excluding the one just inserted) for conversation continuity.
  const prior = await prisma.chatMessage.findMany({
    where: { sessionId, id: { not: user.id } },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
    take: 20,
  });

  // 4. Call Claude.
  let answer = "";
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let model: string | null = null;
  try {
    const res = await askClaude(
      query,
      contextBlock,
      prior.map((p) => ({ role: p.role as "user" | "assistant", content: p.content })),
    );
    answer = res.text;
    inputTokens = res.inputTokens;
    outputTokens = res.outputTokens;
    model = res.model;
  } catch (e) {
    answer = `[Error calling Claude]\n${e instanceof Error ? e.message : String(e)}`;
  }

  // 5. Persist assistant message with sources snapshot.
  const sources = hits.map((h, i) => ({
    sourceType: h.sourceType,
    sourceId: h.sourceId,
    title: resolved[i]?.title ?? "(unresolved)",
    url: resolved[i]?.url ?? null,
    excerpt: h.chunkText.slice(0, 280),
    distance: h.distance,
    sectionPath: resolved[i]?.url?.split("/")[1] ?? null,
    phaseLabel: h.phaseLabel,
  }));

  await prisma.chatMessage.create({
    data: {
      sessionId, role: "assistant", content: answer,
      sources: sources as unknown as object,
      model, inputTokens, outputTokens,
    },
  });

  // 6. Auto-title the session from the first question.
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId }, select: { title: true },
  });
  if (!session?.title) {
    const title = query.length > 80 ? query.slice(0, 80) + "…" : query;
    await prisma.chatSession.update({
      where: { id: sessionId }, data: { title },
    });
  }

  revalidatePath("/ask");
  revalidatePath(`/ask/${sessionId}`);
}
