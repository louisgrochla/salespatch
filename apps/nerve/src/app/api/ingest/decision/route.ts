import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { decisionStore } from "@/lib/sl-mas/decisionStore";
import { episodicStore } from "@/lib/sl-mas/episodicStore";

// POST /api/ingest/decision
//
// Manual /build-demo skill decision ingest. Called by:
//   sales-dashboard /api/admin/demo-decision forwarder
//   (which is itself triggered by the admin uploader after the founder
//    drops the demo + decision.json files)
//
// Body shape mirrors src/missionControl/routes/decisions.ts ManualDecisionBody
// from the runtime side. Each rebuild creates a new decision with a
// timestamped run_id so v1 vs v2 of the same lead are independently
// attributable.

interface ManualDecisionBody {
  source: string;
  agent_id: string;
  lead_id: string;
  business_name: string;
  vertical?: string;
  design_decisions: {
    hero_variant?: string;
    palette_family?: string;
    primary_hex?: string;
    accent_hex?: string;
    cta_pattern?: string;
    proof_emphasis?: string;
    custom_tags?: string[];
  };
  reasoning?: string;
  pitch_brief_summary?: string;
  lead_summary?: Record<string, unknown>;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const raw = await req.text();
  const signature = req.headers.get("x-ingest-signature");
  const secret = process.env.OUTCOME_INGEST_SECRET; // shared with outcome ingest
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

  let body: ManualDecisionBody;
  try {
    body = JSON.parse(raw) as ManualDecisionBody;
  } catch (e) {
    return NextResponse.json(
      { error: `bad json: ${String(e)}` },
      { status: 400 },
    );
  }

  const validation = validate(body);
  if (validation) {
    return NextResponse.json({ error: validation }, { status: 400 });
  }

  // Synthetic timestamped run id so each rebuild is its own decision.
  const isoNoColons = new Date().toISOString().replace(/[:.]/g, "-");
  const runId = `manual-${body.lead_id}-${isoNoColons}`;
  const nodeId = "manual-build";
  const tags = buildTags(body);

  // Open a synthetic episode for this manual run so dashboard pivots see it.
  await episodicStore
    .start({
      pipeline_run_id: runId,
      pipeline_definition_id: "manual-build-demo",
      trigger: "manual",
    })
    .catch(() => undefined); // duplicate run_id = harmless re-attempt

  const decision = await decisionStore.logDecision({
    agent_id: body.agent_id,
    run_id: runId,
    node_id: nodeId,
    action: `manual demo built for ${body.business_name}`,
    reasoning: body.reasoning ?? "Manual /build-demo skill output",
    alternatives: [],
    confidence: 1.0,
    inputs_summary: summariseInputs(body),
    output_summary: body.pitch_brief_summary ?? "manual demo + brief",
    tags,
  });

  // Finalise the synthetic episode so pivot_tags are populated.
  await episodicStore.completeRun(runId, {
    status: "completed",
    pivot_tags: tags.filter((t) => isPivotTag(t)),
    lead_id: body.lead_id,
    business_name: body.business_name,
    vertical: body.vertical,
  });

  return NextResponse.json({
    decision_id: decision.id,
    run_id: runId,
    tags,
  });
}

// ── HMAC verify (kept inline so this route is self-contained) ──

function verifySignature(
  rawBody: string,
  header: string | null,
  secret: string,
): boolean {
  if (!header) return false;
  const candidate = header.startsWith("sha256=") ? header.slice(7) : header;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (candidate.length !== expected.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(candidate, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}

// ── Helpers ──

const PIVOT_PREFIXES = [
  "vertical:",
  "hero:",
  "palette:",
  "cta:",
  "proof:",
  "brand_source:",
  "category:",
  "qa_passed:",
  "section:",
  "component_style:",
  "font_pairing:",
];

function isPivotTag(tag: string): boolean {
  return PIVOT_PREFIXES.some((p) => tag.startsWith(p));
}

function validate(body: Partial<ManualDecisionBody>): string | undefined {
  if (!body || typeof body !== "object") return "body required";
  if (typeof body.source !== "string") return "source required";
  if (typeof body.agent_id !== "string") return "agent_id required";
  if (typeof body.lead_id !== "string" || body.lead_id.length === 0)
    return "lead_id required";
  if (typeof body.business_name !== "string") return "business_name required";
  if (!body.design_decisions || typeof body.design_decisions !== "object")
    return "design_decisions object required";
  return undefined;
}

function buildTags(body: ManualDecisionBody): string[] {
  const tags: string[] = [
    `agent:${body.agent_id}`,
    `lead_id:${body.lead_id}`,
    `source:${body.source}`,
  ];
  if (body.vertical) tags.push(`vertical:${body.vertical}`);
  const d = body.design_decisions;
  if (d.hero_variant) tags.push(`hero:${d.hero_variant}`);
  if (d.palette_family) tags.push(`palette:${d.palette_family}`);
  if (d.cta_pattern) tags.push(`cta:${d.cta_pattern}`);
  if (d.proof_emphasis) tags.push(`proof:${d.proof_emphasis}`);
  if (Array.isArray(d.custom_tags)) tags.push(...d.custom_tags.map(String));
  return tags;
}

function summariseInputs(body: ManualDecisionBody): string {
  const parts: string[] = [`business=${body.business_name}`];
  if (body.vertical) parts.push(`vertical=${body.vertical}`);
  if (body.design_decisions.primary_hex)
    parts.push(`primary=${body.design_decisions.primary_hex}`);
  return parts.join(" ");
}
