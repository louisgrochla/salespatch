import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySignature } from "@/lib/sl-mas/hmac";
import { semanticSearch, type SearchFilter } from "@/lib/embeddings";

// R5: external JSON API in front of the existing semantic-search vault.
// Same HMAC pattern as the rest of /api/read/* — sign the raw request
// body with OUTCOME_INGEST_SECRET, send as `x-read-signature`.
//
// In dev (NODE_ENV !== production), OUTCOME_INGEST_ALLOW_UNSIGNED=true
// bypasses the signature check for ergonomic curl-ing.
//
// Returns ranked chunks. Caller is responsible for resolving sourceId
// back to a record if they want the full source content — same contract
// as the web /search page.

export const dynamic = "force-dynamic";

const StringOrArray = z.union([z.string(), z.array(z.string())]);

const Body = z.object({
  query: z.string().min(1).max(2000),
  topK: z.number().int().min(1).max(50).optional(),
  filter: z
    .object({
      sourceType: StringOrArray.optional(),
      sourceId: StringOrArray.optional(),
      phaseLabel: StringOrArray.optional(),
      createdAfter: z.string().optional(),
      createdBefore: z.string().optional(),
    })
    .optional(),
});

interface SearchResponse {
  hits: Array<{
    id: string;
    source_type: string;
    source_id: string;
    chunk_text: string;
    chunk_index: number;
    metadata: Record<string, unknown>;
    phase_label: string;
    distance: number;
  }>;
  queried_at: string;
}

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

  let parsed;
  try {
    parsed = Body.parse(JSON.parse(rawBody));
  } catch (e) {
    return NextResponse.json(
      { error: `bad body: ${e instanceof Error ? e.message : String(e)}` },
      { status: 400 },
    );
  }

  const filter: SearchFilter | undefined = parsed.filter
    ? {
        sourceType: parsed.filter.sourceType,
        sourceId: parsed.filter.sourceId,
        phaseLabel: parsed.filter.phaseLabel,
        createdAfter: parsed.filter.createdAfter
          ? new Date(parsed.filter.createdAfter)
          : undefined,
        createdBefore: parsed.filter.createdBefore
          ? new Date(parsed.filter.createdBefore)
          : undefined,
      }
    : undefined;

  let hits;
  try {
    hits = await semanticSearch(parsed.query, {
      topK: parsed.topK ?? 10,
      filter,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `search failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  const payload: SearchResponse = {
    hits: hits.map((h) => ({
      id: h.id,
      source_type: h.sourceType,
      source_id: h.sourceId,
      chunk_text: h.chunkText,
      chunk_index: h.chunkIndex,
      metadata: h.metadata,
      phase_label: h.phaseLabel,
      distance: h.distance,
    })),
    queried_at: new Date().toISOString(),
  };

  return NextResponse.json(payload);
}
