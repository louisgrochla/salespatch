import { NextRequest, NextResponse } from "next/server";
import {
  brandAnalysisStore,
  type BrandAnalysisInput,
} from "@/lib/sl-mas/brandAnalysisStore";
import { verifySignature } from "@/lib/sl-mas/hmac";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";

// POST /api/ingest/brand-analysis
//
// HMAC-signed brand-analysis ingest. Companion to /api/ingest/site-brief —
// captures the structured Phase 2 (palette / typography / positioning)
// output as queryable JSON so the AI layer can search by colour family,
// font family, or positioning reference without parsing the brief markdown.
//
// Soft FK to SiteBrief.briefId via the optional `brief_id` field. Analyses
// without a parent brief are valid (autumn Pi could emit pure brand
// analysis from photos alone).
//
// Header: X-Ingest-Signature: sha256=<hex>
// Secret: OUTCOME_INGEST_SECRET (Vercel env)
//
// Idempotent on `analysis_id` (caller-supplied). Replay returns 200 with
// inserted=false.

export async function POST(req: NextRequest): Promise<NextResponse> {
  const raw = await req.text();
  const signature = req.headers.get("x-ingest-signature");
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
    if (!verifySignature(raw, signature, secret)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  let payload: BrandAnalysisInput;
  try {
    payload = JSON.parse(raw) as BrandAnalysisInput;
  } catch (e) {
    return NextResponse.json(
      { error: `bad json: ${String(e)}` },
      { status: 400 },
    );
  }

  const validation = validatePayload(payload);
  if (validation) {
    return NextResponse.json({ error: validation }, { status: 400 });
  }

  try {
    const result = await brandAnalysisStore.ingest(payload);

    // RAG embedding (PR 2). Selective fields capture the brand decode's
    // reasoning: logo description, voice fingerprint, positioning rationale,
    // photo classifications. Lets the agent answer "what positioning
    // alternatives were considered for vertical=X" via /ask. Skip on dup.
    if (result.inserted) {
      try {
        const meta = result.row.metadata ?? {};
        const phaseLabel = await phaseLabelFor(
          new Date(result.row.analyzed_at),
        );
        await embedRecord(
          {
            sourceType: "BrandAnalysis",
            sourceId: result.row.id,
            phaseLabel,
            metadata: {
              section: "brand-analysis",
              leadId: result.row.lead_id,
              analysisId: result.row.analysis_id,
            },
          },
          {
            logo_description: result.row.logo_description ?? null,
            logo_kind: result.row.logo_kind ?? null,
            voice_quotes:
              result.row.voice_quotes.length > 0
                ? result.row.voice_quotes.join("\n")
                : null,
            voice_adjectives:
              result.row.voice_adjectives.length > 0
                ? result.row.voice_adjectives.join(", ")
                : null,
            positioning_reference: result.row.positioning_reference ?? null,
            positioning_rationale: result.row.positioning_rationale ?? null,
            asset_notes:
              result.row.asset_notes.length > 0
                ? result.row.asset_notes.join("\n")
                : null,
            positioning_alternatives_considered: Array.isArray(
              meta.positioning_alternatives_considered,
            )
              ? JSON.stringify(meta.positioning_alternatives_considered)
              : null,
          },
        );
      } catch (e) {
        console.error("[brand-analysis] embed failed:", e);
      }
    }

    return NextResponse.json({
      analysis_id: result.analysis_id,
      inserted: result.inserted,
      id: result.row.id,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `ingest failed: ${String(e)}` },
      { status: 500 },
    );
  }
}

function validatePayload(p: Partial<BrandAnalysisInput>): string | undefined {
  if (!p || typeof p !== "object") return "payload required";
  if (typeof p.analysis_id !== "string" || p.analysis_id.length === 0)
    return "analysis_id required";
  if (typeof p.lead_id !== "string" || p.lead_id.length === 0)
    return "lead_id required";
  // Optional fields: null and undefined both mean "not supplied".
  if (
    isPresent(p.analyzed_at) &&
    (typeof p.analyzed_at !== "string" || Number.isNaN(Date.parse(p.analyzed_at)))
  )
    return "analyzed_at must be ISO timestamp";
  for (const k of ["dominant_pct", "neutral_pct", "accent_pct"] as const) {
    const v = p[k];
    if (isPresent(v) && (typeof v !== "number" || v < 0 || v > 100))
      return `${k} must be number in [0,100]`;
  }
  for (const k of ["dominant_hex", "neutral_hex", "accent_hex"] as const) {
    const v = p[k];
    if (isPresent(v) && (typeof v !== "string" || !/^#[0-9A-Fa-f]{3,8}$/.test(v)))
      return `${k} must be a hex string starting with #`;
  }
  if (isPresent(p.photo_roles)) {
    if (typeof p.photo_roles !== "object" || Array.isArray(p.photo_roles))
      return "photo_roles must be an object { filename: role }";
    for (const [filename, role] of Object.entries(p.photo_roles)) {
      if (typeof role !== "string")
        return `photo_roles["${filename}"] must be a string role`;
    }
  }
  return undefined;
}

function isPresent<T>(v: T | undefined | null): v is T {
  return v !== undefined && v !== null;
}
