import { NextRequest, NextResponse } from "next/server";
import {
  demoArtefactStore,
  type DemoArtefactInput,
} from "@/lib/sl-mas/demoArtefactStore";
import { verifySignature } from "@/lib/sl-mas/hmac";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";

// POST /api/ingest/demo-artefact
//
// HMAC-signed demo HTML ingest. Called fire-and-forget from the manual
// /build-demo skill (or the autumn Pi siteComposerAgent) after the
// self-contained demo.html has been written to disk. Stores the full
// HTML inline so the artefact trail is replayable from NERVE alone, no
// filesystem or Supabase Storage dependency.
//
// /api/ingest/* is exempt from the NextAuth founder-session middleware,
// so the only auth here is the HMAC. Shares OUTCOME_INGEST_SECRET with
// the rest of the SL-MAS ingest endpoints.
//
// Header: X-Ingest-Signature: sha256=<hex>
// Secret: OUTCOME_INGEST_SECRET (Vercel env)
//
// Idempotent on `artefact_id` (caller-supplied, conventional format
// `<lead_slug>-demo-<iso_no_colons>`). Replay returns 200 with
// inserted=false.

// Vercel request body cap is 4.5MB; we cap a little under to keep room
// for headers + envelope. Anything larger means the build-demo skill
// produced a heavier file than the pipeline can ingest — see the
// decision log entry on the Vercel 4.5MB cap (#33). The skill resizes
// photos via sips so this should rarely trip.
const MAX_HTML_BYTES = 4_000_000;

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

  let payload: DemoArtefactInput;
  try {
    payload = JSON.parse(raw) as DemoArtefactInput;
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
    const result = await demoArtefactStore.ingest(payload);

    // RAG embedding (PR 2). Selective fields — NEVER embed html_inline
    // (a 4MB markup blob would dominate the chunk budget and contribute
    // no semantic signal beyond what the structured fields already carry).
    // What matters for queries: aesthetic positioning, design rationale,
    // layout decisions (hero/gallery roles), NERVE consult summary.
    if (result.inserted) {
      try {
        const meta = result.row.metadata ?? {};
        const phaseLabel = await phaseLabelFor(
          new Date(result.row.generated_at),
        );
        const layoutDecisions =
          meta.layout_decisions && typeof meta.layout_decisions === "object"
            ? JSON.stringify(meta.layout_decisions)
            : null;
        const consult =
          meta.nerve_consult_summary &&
          typeof meta.nerve_consult_summary === "object"
            ? JSON.stringify(meta.nerve_consult_summary)
            : null;
        const designRationale =
          typeof meta.design_rationale === "string"
            ? meta.design_rationale
            : null;
        await embedRecord(
          {
            sourceType: "DemoArtefact",
            sourceId: result.row.id,
            phaseLabel,
            metadata: {
              section: "demo-artefact",
              leadId: result.row.lead_id,
              artefactId: result.row.artefact_id,
            },
          },
          {
            business_name: result.row.business_name,
            vertical: result.row.vertical ?? null,
            aesthetic_positioning: result.row.aesthetic_positioning ?? null,
            dominant_hex: result.row.dominant_hex ?? null,
            photo_count: result.row.photo_count,
            design_rationale: designRationale,
            layout_decisions: layoutDecisions,
            nerve_consult_summary: consult,
          },
        );
      } catch (e) {
        console.error("[demo-artefact] embed failed:", e);
      }
    }

    return NextResponse.json({
      artefact_id: result.artefact_id,
      inserted: result.inserted,
      id: result.row.id,
      html_size_bytes: result.row.html_size_bytes,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `ingest failed: ${String(e)}` },
      { status: 500 },
    );
  }
}

function validatePayload(p: Partial<DemoArtefactInput>): string | undefined {
  if (!p || typeof p !== "object") return "payload required";
  if (typeof p.artefact_id !== "string" || p.artefact_id.length === 0)
    return "artefact_id required";
  if (typeof p.lead_id !== "string" || p.lead_id.length === 0)
    return "lead_id required";
  if (typeof p.business_name !== "string" || p.business_name.length === 0)
    return "business_name required";
  if (typeof p.html_inline !== "string" || p.html_inline.length === 0)
    return "html_inline required (non-empty string)";
  const bytes = Buffer.byteLength(p.html_inline, "utf8");
  if (bytes > MAX_HTML_BYTES)
    return `html_inline too large (${bytes} bytes; cap ${MAX_HTML_BYTES})`;
  // Optional fields: null and undefined both mean "not supplied".
  if (
    isPresent(p.generated_at) &&
    (typeof p.generated_at !== "string" || Number.isNaN(Date.parse(p.generated_at)))
  )
    return "generated_at must be ISO timestamp";
  if (isPresent(p.photo_count) && (typeof p.photo_count !== "number" || p.photo_count < 0))
    return "photo_count must be non-negative number";
  if (
    isPresent(p.dominant_hex) &&
    (typeof p.dominant_hex !== "string" || !/^#[0-9A-Fa-f]{3,8}$/.test(p.dominant_hex))
  )
    return "dominant_hex must be a hex string starting with #";
  return undefined;
}

function isPresent<T>(v: T | undefined | null): v is T {
  return v !== undefined && v !== null;
}
