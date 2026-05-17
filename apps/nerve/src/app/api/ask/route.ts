import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySignature } from "@/lib/sl-mas/hmac";
import { semanticSearch, type SearchFilter } from "@/lib/embeddings";
import { askClaude, buildContextBlock, isAskAvailable } from "@/lib/anthropic";
import { getLeadSourceIds } from "@/lib/sl-mas/leadEmbeddings";

// R5: external RAG-answer endpoint. Mirrors the web `/ask` machinery
// but as a one-shot JSON call — no chat session persistence. Built so
// iOS / Pi agents / sales-dashboard can ground their own answers in
// the NERVE vault without round-tripping through a browser.
//
// HMAC: sign the raw body with OUTCOME_INGEST_SECRET, send as
// `x-read-signature`. Same pattern as /api/read/* and /api/search.
//
// Optional `leadSlug` narrows retrieval to that one business (the same
// source-id allow-list R3's `LeadChatPanel` uses). When the lead has no
// embeddings, the answer still returns — context block flags it as
// "(no chunks tied to this lead yet …)".

export const dynamic = "force-dynamic";

const Body = z.object({
  query: z.string().min(1).max(4000),
  topK: z.number().int().min(1).max(30).optional(),
  leadSlug: z.string().optional(),
  priorTurns: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .max(20)
    .optional(),
});

interface AskResponse {
  answer: string;
  sources: Array<{
    source_type: string;
    source_id: string;
    title: string | null;
    chunk_text: string;
    distance: number;
    phase_label: string;
  }>;
  scope: { lead_slug: string | null; chunk_count: number };
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  queried_at: string;
}

const DEFAULT_TOP_K = 12;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();

  const allowUnsigned =
    process.env.NODE_ENV !== "production" &&
    process.env.OUTCOME_INGEST_ALLOW_UNSIGNED === "true";

  if (!allowUnsigned) {
    const secret = process.env.OUTCOME_INGEST_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "OUTCOME_INGEST_SECRET not configured" },
        { status: 503 },
      );
    }
    const signature = req.headers.get("x-read-signature");
    if (!verifySignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  if (!isAskAvailable()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 503 },
    );
  }

  let parsed;
  try {
    parsed = Body.parse(JSON.parse(rawBody));
  } catch (e) {
    return NextResponse.json(
      { error: `bad body: ${e instanceof Error ? e.message : String(e)}` },
      { status: 400 },
    );
  }

  // Optional per-lead scope. Same path as the R3 web chat.
  let filter: SearchFilter | undefined;
  if (parsed.leadSlug) {
    const sourceIds = await getLeadSourceIds(parsed.leadSlug);
    filter = { sourceId: sourceIds };
  }

  let hits: Awaited<ReturnType<typeof semanticSearch>> = [];
  let resolved: Awaited<ReturnType<typeof buildContextBlock>>["resolved"] = [];
  let contextBlock = parsed.leadSlug
    ? "(no chunks tied to this lead yet — answering from general context only.)"
    : "(no vault context available)";

  try {
    hits = await semanticSearch(parsed.query, {
      topK: parsed.topK ?? DEFAULT_TOP_K,
      filter,
    });
    if (hits.length > 0) {
      const built = await buildContextBlock(hits);
      contextBlock = built.block;
      resolved = built.resolved;
    }
  } catch (e) {
    contextBlock = `(retrieval failed: ${e instanceof Error ? e.message : String(e)})`;
  }

  let answer = "";
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let model = "";
  try {
    const res = await askClaude(parsed.query, contextBlock, parsed.priorTurns ?? []);
    answer = res.text;
    inputTokens = res.inputTokens;
    outputTokens = res.outputTokens;
    model = res.model;
  } catch (e) {
    return NextResponse.json(
      { error: `claude failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }

  const payload: AskResponse = {
    answer,
    sources: hits.map((h, i) => ({
      source_type: h.sourceType,
      source_id: h.sourceId,
      title: resolved[i]?.title ?? null,
      chunk_text: h.chunkText.slice(0, 280),
      distance: h.distance,
      phase_label: h.phaseLabel,
    })),
    scope: {
      lead_slug: parsed.leadSlug ?? null,
      chunk_count: hits.length,
    },
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    queried_at: new Date().toISOString(),
  };

  return NextResponse.json(payload);
}
