import { NextRequest, NextResponse } from "next/server";
import {
  qaVisualResultStore,
  type QaVisualResultInput,
  type LayerName,
} from "@/lib/sl-mas/qaVisualResultStore";
import { verifySignature } from "@/lib/sl-mas/hmac";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";

// POST /api/ingest/qa-visual-result
//
// Producer-parity ingest for the visual-QA pipeline. Accepts the
// canonical `VisualQaResult` shape defined in
// `apps/nerve/scripts/qa-visual-prompts.ts`, regardless of producer:
// the manual /build-demo flow (in-session Claude) AND the SDK runner
// (qa-visual.ts) post the same shape here.
//
// /api/ingest/* is exempt from the NextAuth founder-session middleware,
// so the only auth here is the HMAC. Shares OUTCOME_INGEST_SECRET with
// the rest of the SL-MAS ingest endpoints.
//
// Header: X-Ingest-Signature: sha256=<hex>
// Secret: OUTCOME_INGEST_SECRET (Vercel env)
//
// Idempotent on `qa_visual_id` (caller-supplied, conventional format
// `<lead_id>-qa-visual-<iso_no_colons>`). Replay returns 200 with
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

  let payload: QaVisualResultInput;
  try {
    payload = JSON.parse(raw) as QaVisualResultInput;
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
    const result = await qaVisualResultStore.ingest(payload);

    // RAG embedding (PR 2). Selective fields capture the layers' prose
    // (bug findings, owner/customer reactions, voice drift notes) so
    // queries like "what did the owner say about the demo" or "what
    // critical bugs has visual-QA flagged for vertical=X" can retrieve
    // from /ask. Skip on dup.
    if (result.inserted) {
      try {
        const phaseLabel = await phaseLabelFor(new Date(result.row.ran_at));
        const bugsText = Array.isArray(result.row.bugs)
          ? (result.row.bugs as Array<Record<string, unknown>>)
              .map((b) => {
                const sev = typeof b.severity === "string" ? b.severity : "?";
                const loc = typeof b.location === "string" ? b.location : "?";
                const find = typeof b.finding === "string" ? b.finding : "";
                return `[${sev}] ${loc} — ${find}`;
              })
              .join("\n")
          : null;
        const ownerReaction = result.row.owner_reaction
          ? JSON.stringify(result.row.owner_reaction)
          : null;
        const customerReaction = result.row.customer_reaction
          ? JSON.stringify(result.row.customer_reaction)
          : null;
        const brandFidelityNotes = pickString(
          result.row.brand_fidelity,
          "notes",
        );
        const voiceNotes = pickString(result.row.voice_consistency, "notes");
        await embedRecord(
          {
            sourceType: "QaVisualResult",
            sourceId: result.row.id,
            phaseLabel,
            metadata: {
              section: "qa-visual",
              leadId: result.row.lead_id,
              qaVisualId: result.row.qa_visual_id,
              hasCritical: result.row.has_critical,
            },
          },
          {
            producer: result.row.producer,
            bug_count: result.row.bug_count,
            has_critical: result.row.has_critical,
            bugs: bugsText,
            owner_reaction: ownerReaction,
            customer_reaction: customerReaction,
            brand_fidelity_notes: brandFidelityNotes,
            voice_consistency_notes: voiceNotes,
            notes: result.row.notes,
          },
        );
      } catch (e) {
        console.error("[qa-visual-result] embed failed:", e);
      }
    }

    return NextResponse.json({
      qa_visual_id: result.qa_visual_id,
      inserted: result.inserted,
      id: result.row.id,
      has_critical: result.row.has_critical,
      failed_layers: result.row.failed_layers,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `ingest failed: ${String(e)}` },
      { status: 500 },
    );
  }
}

// ── Validation ────────────────────────────────────────────────────────
//
// Mirrors the Zod schema's hard constraints from
// `apps/nerve/scripts/qa-visual-prompts.ts:VisualQaResultSchema`. The
// producer side runs the full Zod validator before POST; this is the
// belt-and-braces check at the warehouse boundary.

const VALID_LAYER_NAMES: LayerName[] = [
  "bugs",
  "brand_fidelity",
  "owner_reaction",
  "voice_consistency",
  "customer_reaction",
  "section_grades",
];

function pickString(
  obj: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!obj) return null;
  const v = obj[key];
  return typeof v === "string" ? v : null;
}

function validatePayload(p: Partial<QaVisualResultInput>): string | undefined {
  if (!p || typeof p !== "object") return "payload required";
  if (typeof p.qa_visual_id !== "string" || p.qa_visual_id.length === 0)
    return "qa_visual_id required";
  if (typeof p.lead_id !== "string" || p.lead_id.length === 0)
    return "lead_id required";
  if (p.artefact_id !== null && typeof p.artefact_id !== "string")
    return "artefact_id must be string or null";
  if (p.demo_path !== null && typeof p.demo_path !== "string")
    return "demo_path must be string or null";
  if (
    !p.viewport ||
    typeof p.viewport.width !== "number" ||
    typeof p.viewport.height !== "number"
  )
    return "viewport.{width,height} required (numbers)";
  if (
    typeof p.ran_at !== "string" ||
    Number.isNaN(Date.parse(p.ran_at))
  )
    return "ran_at required (ISO 8601)";
  if (p.producer !== "manual_skill" && p.producer !== "sdk_runner")
    return "producer must be 'manual_skill' or 'sdk_runner'";
  if (typeof p.model !== "string" || p.model.length === 0)
    return "model required";

  // Nullable-layer fields: must be explicitly present (any value, including null).
  // The producer-side Zod validator enforces shape; we only enforce presence.
  const nullableLayerKeys = [
    "bugs",
    "has_critical",
    "bug_count",
    "brand_fidelity",
    "owner_reaction",
    "voice_consistency",
    "customer_reaction",
    "section_grades",
  ] as const;
  for (const k of nullableLayerKeys) {
    if (!(k in p)) return `${k} required (use null when the layer failed)`;
  }

  // failed_layers: optional; if present must be an array of valid layer names.
  if (p.failed_layers !== undefined) {
    if (!Array.isArray(p.failed_layers))
      return "failed_layers must be array";
    for (const name of p.failed_layers) {
      if (!VALID_LAYER_NAMES.includes(name as LayerName))
        return `failed_layers contains invalid layer name: ${String(name)}`;
    }
  }

  // Cross-field: failed_layers and nullness of layer fields must match.
  const failed = new Set(p.failed_layers ?? []);
  const checks: Array<[LayerName, unknown]> = [
    ["bugs", p.bugs],
    ["brand_fidelity", p.brand_fidelity],
    ["owner_reaction", p.owner_reaction],
    ["voice_consistency", p.voice_consistency],
    ["customer_reaction", p.customer_reaction],
    ["section_grades", p.section_grades],
  ];
  for (const [name, value] of checks) {
    if (failed.has(name) && value !== null)
      return `failed_layers includes '${name}' but field is not null`;
    if (!failed.has(name) && value === null)
      return `field '${name}' is null but failed_layers does not include it`;
  }

  // Cross-field: when bugs is null, derived fields must also be null.
  if (p.bugs === null) {
    if (p.has_critical !== null)
      return "has_critical must be null when bugs is null";
    if (p.bug_count !== null)
      return "bug_count must be null when bugs is null";
  } else {
    if (typeof p.has_critical !== "boolean")
      return "has_critical required (boolean) when bugs is non-null";
    if (typeof p.bug_count !== "number")
      return "bug_count required (number) when bugs is non-null";
  }

  return undefined;
}
