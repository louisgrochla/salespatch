import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySignature } from "@/lib/sl-mas/hmac";

// GET /api/read/notes?scope=&relatedSlug=&tag=&q=&limit=
//
// HMAC-signed read endpoint for the founder's notes. Built so
// /build-demo (and any other Claude Code skill) can pull per-lead
// context in one round-trip — `?relatedSlug=the-tartan-pig` returns
// every note tied to that lead, newest first.
//
// Same auth as the rest of /api/read/* — canonical query string signed
// with OUTCOME_INGEST_SECRET, sent as X-Read-Signature header. In dev
// with OUTCOME_INGEST_ALLOW_UNSIGNED=true the signature check is
// bypassed for ergonomics.
//
// Notes go into the polymorphic Embedding table on every save, so
// they're also reachable via /search (semantic) and /ask (RAG). This
// endpoint is the literal read path for when an agent already knows
// which lead/scope it cares about.
//
// Query params (all optional):
//   - scope=lead|system|pitch|research|other
//   - relatedSlug=<slug>
//   - tag=<single tag, exact match>
//   - q=<substring, case-insensitive, ILIKE on title+body>
//   - limit=<number, default 50, max 200>

export const dynamic = "force-dynamic";

const SCOPES = ["lead", "system", "pitch", "research", "other"] as const;
type Scope = (typeof SCOPES)[number];
function isScope(v: string | undefined | null): v is Scope {
  return v !== null && v !== undefined && (SCOPES as readonly string[]).includes(v);
}

interface NotePayload {
  id: string;
  title: string;
  body: string;
  scope: Scope;
  related_slug: string | null;
  tags: string[];
  phase_label: string;
  created_at: string;
  updated_at: string;
}

interface NotesResponse {
  notes: NotePayload[];
  total: number;
  queried_at: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const canonical = canonicalQuery(url.searchParams);

  const secret = process.env.OUTCOME_INGEST_SECRET;
  const allowUnsigned =
    process.env.NODE_ENV !== "production" &&
    process.env.OUTCOME_INGEST_ALLOW_UNSIGNED === "true";

  if (!allowUnsigned) {
    if (!secret) {
      return NextResponse.json(
        { error: "OUTCOME_INGEST_SECRET not configured" },
        { status: 503 },
      );
    }
    const signature = req.headers.get("x-read-signature");
    if (!verifySignature(canonical, signature, secret)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  const scopeParam = url.searchParams.get("scope");
  const relatedSlug = url.searchParams.get("relatedSlug");
  const tag = url.searchParams.get("tag");
  const q = url.searchParams.get("q");
  const limitRaw = Number(url.searchParams.get("limit") ?? "50");
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 200);

  const where: import("@prisma/client").Prisma.NoteWhereInput = {};
  if (isScope(scopeParam)) where.scope = scopeParam;
  if (relatedSlug) where.relatedSlug = relatedSlug;
  if (tag) where.tags = { has: tag };
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { body: { contains: q, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.note.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
    }),
    prisma.note.count({ where }),
  ]);

  const payload: NotesResponse = {
    notes: rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      scope: r.scope as Scope,
      related_slug: r.relatedSlug,
      tags: r.tags,
      phase_label: r.phaseLabel,
      created_at: r.createdAt.toISOString(),
      updated_at: r.updatedAt.toISOString(),
    })),
    total,
    queried_at: new Date().toISOString(),
  };

  return NextResponse.json(payload);
}

function canonicalQuery(params: URLSearchParams): string {
  const entries: Array<[string, string]> = [];
  params.forEach((value, key) => {
    entries.push([key, value]);
  });
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries.map(([k, v]) => `${k}=${v}`).join("&");
}
