import { IncomingMessage, ServerResponse } from "node:http";
import { createLogger } from "../../lib/logger.js";
import { DecisionStore } from "../../learning/decisionStore.js";

const log = createLogger("decisions-route");
const MAX_BODY_BYTES = 1_048_576;

export interface ManualDecisionBody {
  /** Origin marker — `build-demo-skill`, `manual-edit`, etc. */
  source: string;
  agent_id: string;
  /** Slug or stable lead identifier. */
  lead_id: string;
  business_name: string;
  vertical?: string;
  /** Pivot-table-friendly design choices. */
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

interface RouteDeps {
  decisionStore: DecisionStore;
}

/** Returns true if the request was handled. */
export async function handleDecisionsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  deps: RouteDeps,
): Promise<boolean> {
  const method = req.method ?? "GET";
  const path = url.pathname;

  if (method === "POST" && path === "/api/decisions/manual") {
    await handleManual(req, res, deps);
    return true;
  }

  if (method === "GET" && path === "/api/decisions/by-lead") {
    handleByLead(res, url, deps);
    return true;
  }

  return false;
}

async function handleManual(
  req: IncomingMessage,
  res: ServerResponse,
  deps: RouteDeps,
): Promise<void> {
  let raw: string;
  try {
    raw = await readRawBody(req);
  } catch (e) {
    sendJson(res, 413, { error: String(e) });
    return;
  }

  let body: ManualDecisionBody;
  try {
    body = JSON.parse(raw) as ManualDecisionBody;
  } catch (e) {
    sendJson(res, 400, { error: `bad json: ${String(e)}` });
    return;
  }

  const validation = validate(body);
  if (validation) {
    sendJson(res, 400, { error: validation });
    return;
  }

  // Each rebuild produces a new decision. The synthetic run_id is
  // timestamped so v1 and v2 of the same lead are independently attributable.
  const isoNoColons = new Date().toISOString().replace(/[:.]/g, "-");
  const runId = `manual-${body.lead_id}-${isoNoColons}`;
  const nodeId = "manual-build";

  const tags = buildTags(body);

  const decision = deps.decisionStore.logDecision({
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

  log.info("manual decision logged", {
    decision_id: decision.id,
    run_id: runId,
    lead_id: body.lead_id,
    tags,
  });

  sendJson(res, 200, {
    decision_id: decision.id,
    run_id: runId,
    tags,
  });
}

function handleByLead(res: ServerResponse, url: URL, deps: RouteDeps): void {
  const leadId = url.searchParams.get("lead_id");
  if (!leadId) {
    sendJson(res, 400, { error: "lead_id query param required" });
    return;
  }
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "50"), 1), 500);
  const decisions = deps.decisionStore.listDecisionsByLeadId(leadId, limit);
  sendJson(res, 200, { count: decisions.length, decisions });
}

// ── Helpers ──

function validate(body: Partial<ManualDecisionBody>): string | undefined {
  if (!body || typeof body !== "object") return "body required";
  if (typeof body.source !== "string") return "source required";
  if (typeof body.agent_id !== "string") return "agent_id required";
  if (typeof body.lead_id !== "string" || body.lead_id.length === 0) return "lead_id required";
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
  if (Array.isArray(d.custom_tags)) tags.push(...d.custom_tags.map((t) => String(t)));
  return tags;
}

function summariseInputs(body: ManualDecisionBody): string {
  const parts: string[] = [];
  parts.push(`business=${body.business_name}`);
  if (body.vertical) parts.push(`vertical=${body.vertical}`);
  if (body.design_decisions.primary_hex) parts.push(`primary=${body.design_decisions.primary_hex}`);
  return parts.join(" ");
}

async function readRawBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new Error(`body exceeds ${MAX_BODY_BYTES} bytes`);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}
