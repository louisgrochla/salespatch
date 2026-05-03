import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";

// Receives a structured changelog entry from Claude Code
// (`.claude/commands/nerve-log.md`). Authenticated via a shared secret
// header `x-nerve-secret`, constant-time compared. Once validated the
// entry is persisted to ChangelogEntry and immediately embedded so the
// session is searchable from /search and queryable from /ask.
//
// We accept BOTH `snake_case` (per spec) and `camelCase` keys so the
// slash command can ship either shape without negotiating.

const PROJECT_TYPES = [
  "nerve", "salespatch", "ios_app", "sl_mas_pipeline", "spit_out", "other",
] as const;

const Body = z
  .object({
    project: z.string().min(1).optional(),
    session_summary: z.string().optional(),
    sessionSummary: z.string().optional(),
    what_changed: z.string().optional(),
    whatChanged: z.string().optional(),
    why: z.string().optional(),
    decisions_made: z.string().optional(),
    decisionsMade: z.string().optional(),
    problems_encountered: z.string().optional(),
    problemsEncountered: z.string().optional(),
    current_state: z.string().optional(),
    currentState: z.string().optional(),
    whats_next: z.string().optional(),
    whatsNext: z.string().optional(),
    files_modified: z.array(z.string()).optional(),
    filesModified: z.array(z.string()).optional(),
    session_date: z.string().or(z.date()).optional(),
    sessionDate: z.string().or(z.date()).optional(),
    session_duration_minutes: z.number().int().nonnegative().nullable().optional(),
    sessionDurationMinutes: z.number().int().nonnegative().nullable().optional(),
    tags: z.array(z.string()).optional(),
    phase_label: z.string().nullable().optional(),
    phaseLabel: z.string().nullable().optional(),
    project_type: z.enum(PROJECT_TYPES).optional(),
    projectType: z.enum(PROJECT_TYPES).optional(),
  })
  .passthrough();

type ParsedBody = z.infer<typeof Body>;

function pickStr(...vals: Array<string | undefined | null>): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return "";
}

function pickArr(...vals: Array<string[] | undefined>): string[] {
  for (const v of vals) if (Array.isArray(v)) return v;
  return [];
}

function pickDate(...vals: Array<string | Date | undefined>): Date {
  for (const v of vals) {
    if (!v) continue;
    const d = v instanceof Date ? v : new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

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
    await logIngestion("/api/ingest/changelog", "failed", "invalid secret", rawBody);
    return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  }

  let parsed: ParsedBody;
  try {
    parsed = Body.parse(JSON.parse(rawBody));
  } catch (e) {
    await logIngestion("/api/ingest/changelog", "failed", `bad body: ${msg(e)}`, rawBody);
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  const project = pickStr(parsed.project);
  const projectType = parsed.projectType ?? parsed.project_type;
  const sessionSummary = pickStr(parsed.sessionSummary, parsed.session_summary);

  if (!project) {
    return NextResponse.json({ error: "project required" }, { status: 400 });
  }
  if (!projectType) {
    return NextResponse.json({ error: "project_type required" }, { status: 400 });
  }
  if (!sessionSummary) {
    return NextResponse.json({ error: "session_summary required" }, { status: 400 });
  }

  const sessionDate = pickDate(parsed.sessionDate, parsed.session_date);
  const explicitPhase = parsed.phaseLabel ?? parsed.phase_label;
  const phaseLabel =
    explicitPhase && explicitPhase.trim().length > 0
      ? explicitPhase
      : await phaseLabelFor(sessionDate);

  const filesModified = pickArr(parsed.filesModified, parsed.files_modified);
  const tags = pickArr(parsed.tags);

  const whatChanged = pickStr(parsed.whatChanged, parsed.what_changed);
  const why = pickStr(parsed.why);
  const decisionsMade = pickStr(parsed.decisionsMade, parsed.decisions_made);
  const problemsEncountered = pickStr(parsed.problemsEncountered, parsed.problems_encountered);
  const currentState = pickStr(parsed.currentState, parsed.current_state);
  const whatsNext = pickStr(parsed.whatsNext, parsed.whats_next);
  const sessionDurationMinutes =
    parsed.sessionDurationMinutes ?? parsed.session_duration_minutes ?? null;

  try {
    const entry = await prisma.changelogEntry.create({
      data: {
        project,
        sessionSummary,
        whatChanged,
        why,
        decisionsMade,
        problemsEncountered,
        currentState,
        whatsNext,
        filesModified,
        sessionDate,
        sessionDurationMinutes,
        tags,
        projectType,
        phaseLabel,
      },
    });

    await embedRecord(
      {
        sourceType: "ChangelogEntry",
        sourceId: entry.id,
        phaseLabel,
        metadata: {
          section: "changelog",
          project,
          projectType,
          date: sessionDate.toISOString(),
          tags,
          phaseLabel,
        },
      },
      {
        project,
        projectType,
        sessionSummary,
        whatChanged,
        why,
        decisionsMade,
        problemsEncountered,
        currentState,
        whatsNext,
        filesModified: filesModified.join("\n"),
        tags: tags.join(", "),
        sessionDate,
      },
    );

    await logIngestion("/api/ingest/changelog", "ok", null, rawBody);
    return NextResponse.json({ ok: true, id: entry.id });
  } catch (e) {
    const message = msg(e);
    await logIngestion("/api/ingest/changelog", "failed", message, rawBody);
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
