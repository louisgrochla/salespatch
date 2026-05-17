import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { businessFactStore } from "@/lib/sl-mas/businessFactStore";

// R4 (business facts): structured key/value facts about a business that
// don't fit the rigid LeadProfile / SiteBrief / Note shapes. Producers
// (the spec-site-brief skill, the build-demo skill, future agents) POST
// here to assert what they learned.
//
// Same shared-secret auth as /api/ingest/notes — `NERVE_CHANGELOG_SECRET`,
// already configured for slash-command producers.
//
// Upsert semantics: a re-assert of the exact same (leadSlug, key, value,
// source) is a no-op. Changing the value or source creates a new row so
// history is preserved.

const Body = z
  .object({
    lead_slug: z.string().min(1),
    key: z.string().min(1).max(120),
    value: z.string().min(1),
    source: z.string().min(1).max(40),
    confidence: z.number().min(0).max(1).nullable().optional(),
    created_by: z.string().max(120).nullable().optional(),
    phase_label: z.string().nullable().optional(),
  })
  .passthrough();

type ParsedBody = z.infer<typeof Body>;

function verifySecret(headerValue: string | null): boolean {
  const secret = process.env.NERVE_CHANGELOG_SECRET;
  if (!secret) return false;
  if (!headerValue) return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const headerSecret =
    req.headers.get("x-nerve-secret") ??
    req.headers.get("x-nerve-changelog-secret");

  if (!verifySecret(headerSecret)) {
    await logIngestion("/api/ingest/business-fact", "failed", "invalid secret", rawBody);
    return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  }

  let parsed: ParsedBody;
  try {
    parsed = Body.parse(JSON.parse(rawBody));
  } catch (e) {
    await logIngestion("/api/ingest/business-fact", "failed", `bad body: ${msg(e)}`, rawBody);
    return NextResponse.json({ error: `bad body: ${msg(e)}` }, { status: 400 });
  }

  const explicitPhase = parsed.phase_label;
  const phaseLabel =
    explicitPhase && explicitPhase.trim().length > 0
      ? explicitPhase
      : await phaseLabelFor(new Date());

  try {
    const result = await businessFactStore.ingest({
      lead_slug: parsed.lead_slug,
      key: parsed.key,
      value: parsed.value,
      source: parsed.source,
      confidence: parsed.confidence ?? null,
      created_by: parsed.created_by ?? null,
      phase_label: phaseLabel,
    });

    // Auto-embed so /ask and /search cover the fact, and so the per-lead
    // scoped chat (R3) retrieves it on every turn.
    await embedRecord(
      {
        sourceType: "BusinessFact",
        sourceId: result.id,
        phaseLabel,
        metadata: {
          section: "business-facts",
          leadSlug: result.row.lead_slug,
          key: result.row.key,
          source: result.row.source,
        },
      },
      {
        key: result.row.key,
        value: result.row.value,
        source: result.row.source,
        leadSlug: result.row.lead_slug,
      },
    );

    await logIngestion("/api/ingest/business-fact", "ok", null, rawBody);
    return NextResponse.json({
      ok: true,
      id: result.id,
      action: result.inserted ? "inserted" : "updated",
    });
  } catch (e) {
    const message = msg(e);
    await logIngestion("/api/ingest/business-fact", "failed", message, rawBody);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function logIngestion(
  endpoint: string,
  status: "ok" | "failed",
  errorMessage: string | null,
  rawBody: string,
) {
  try {
    await prisma.webhookIngestion.create({
      data: {
        endpoint,
        status,
        errorMessage,
        payloadHash: crypto.createHash("sha256").update(rawBody).digest("hex"),
      },
    });
  } catch {
    // best-effort logging
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
