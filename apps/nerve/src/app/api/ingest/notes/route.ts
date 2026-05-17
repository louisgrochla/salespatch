import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";

// Receives a Note from Claude Code (`.claude/commands/nerve-note.md`).
// Same shared-secret auth as `/api/ingest/changelog` so the same env var
// (NERVE_CHANGELOG_SECRET, already present in apps/nerve/.env.local)
// works for both — agents don't need a second credential.
//
// Created so agents can write to /notes without needing prod DB
// credentials locally. Closes the read/write asymmetry: /api/read/notes
// (GET) was added with the notes feature; this is its write companion.
//
// Upsert semantics: when (relatedSlug, title) match an existing note,
// the body/scope/tags are updated in place rather than inserted as a
// duplicate. This makes the slash command safely re-runnable.

const SCOPES = ["lead", "system", "pitch", "research", "other"] as const;

const Body = z
  .object({
    title: z.string().min(1).max(200),
    body: z.string().min(1),
    scope: z.enum(SCOPES),
    relatedSlug: z.string().nullable().optional(),
    related_slug: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
    phaseLabel: z.string().nullable().optional(),
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

function pickStr(...vals: Array<string | undefined | null>): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const headerSecret =
    req.headers.get("x-nerve-secret") ??
    req.headers.get("x-nerve-changelog-secret");

  if (!verifySecret(headerSecret)) {
    await logIngestion("/api/ingest/notes", "failed", "invalid secret", rawBody);
    return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  }

  let parsed: ParsedBody;
  try {
    parsed = Body.parse(JSON.parse(rawBody));
  } catch (e) {
    await logIngestion("/api/ingest/notes", "failed", `bad body: ${msg(e)}`, rawBody);
    return NextResponse.json({ error: `bad body: ${msg(e)}` }, { status: 400 });
  }

  const now = new Date();
  const explicitPhase = parsed.phaseLabel ?? parsed.phase_label;
  const phaseLabel =
    explicitPhase && explicitPhase.trim().length > 0
      ? explicitPhase
      : await phaseLabelFor(now);

  const relatedSlug = pickStr(parsed.relatedSlug, parsed.related_slug);
  const tags = Array.isArray(parsed.tags) ? parsed.tags : [];

  try {
    // Upsert on (relatedSlug, title). When relatedSlug is null, we still
    // dedup on title alone — safer default for re-runnable seeds.
    const existing = await prisma.note.findFirst({
      where: { title: parsed.title, relatedSlug: relatedSlug ?? null },
    });

    let entry;
    let action: "inserted" | "updated";
    if (existing) {
      entry = await prisma.note.update({
        where: { id: existing.id },
        data: {
          body: parsed.body,
          scope: parsed.scope,
          relatedSlug,
          tags,
        },
      });
      action = "updated";
    } else {
      entry = await prisma.note.create({
        data: {
          title: parsed.title,
          body: parsed.body,
          scope: parsed.scope,
          relatedSlug,
          tags,
          phaseLabel,
        },
      });
      action = "inserted";
    }

    await embedRecord(
      {
        sourceType: "Note",
        sourceId: entry.id,
        phaseLabel: entry.phaseLabel,
        metadata: {
          section: "notes",
          scope: entry.scope,
          relatedSlug: entry.relatedSlug,
          tags: entry.tags,
        },
      },
      {
        title: entry.title,
        body: entry.body,
        tags: entry.tags.join(", "),
        relatedSlug: entry.relatedSlug,
      },
    );

    await logIngestion("/api/ingest/notes", "ok", null, rawBody);
    return NextResponse.json({ ok: true, id: entry.id, action });
  } catch (e) {
    const message = msg(e);
    await logIngestion("/api/ingest/notes", "failed", message, rawBody);
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
    // Logging best-effort; don't shadow the upstream error.
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
