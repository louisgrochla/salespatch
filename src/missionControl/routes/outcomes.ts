import { IncomingMessage, ServerResponse } from "node:http";
import { createLogger } from "../../lib/logger.js";
import {
  OutcomeIngester,
  OutcomeIngestPayload,
  verifySignature,
} from "../../learning/outcomeIngest.js";

const log = createLogger("outcomes-route");

const MAX_BODY_BYTES = 1_048_576;
const SIGNATURE_HEADER = "x-ingest-signature";

interface RouteDeps {
  ingester: OutcomeIngester;
  /** Shared HMAC secret. If undefined, ingest is rejected unless explicitly allowed. */
  ingestSecret: string | undefined;
  /** Dev / test escape hatch. Treat with care. */
  allowUnsigned: boolean;
}

/**
 * Returns true if the request was handled (response written). The mission
 * control server should call this early and return when it returns true.
 */
export async function handleOutcomesRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  deps: RouteDeps,
): Promise<boolean> {
  const method = req.method ?? "GET";
  const path = url.pathname;

  if (method === "POST" && path === "/api/outcomes/ingest") {
    await handleIngest(req, res, deps);
    return true;
  }

  if (method === "GET" && path === "/api/outcomes/recent") {
    handleRecent(res, url, deps);
    return true;
  }

  return false;
}

async function handleIngest(
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

  const signature = (req.headers[SIGNATURE_HEADER] as string | undefined) ?? null;
  if (!deps.allowUnsigned) {
    if (!deps.ingestSecret) {
      sendJson(res, 503, { error: "OUTCOME_INGEST_SECRET not configured" });
      return;
    }
    if (!verifySignature(raw, signature, deps.ingestSecret)) {
      log.warn("rejected unsigned/invalid ingest", { has_header: signature !== null });
      sendJson(res, 401, { error: "invalid signature" });
      return;
    }
  }

  let payload: OutcomeIngestPayload;
  try {
    payload = JSON.parse(raw) as OutcomeIngestPayload;
  } catch (e) {
    sendJson(res, 400, { error: `bad json: ${String(e)}` });
    return;
  }

  const validation = validatePayload(payload);
  if (validation) {
    sendJson(res, 400, { error: validation });
    return;
  }

  const result = deps.ingester.ingest(payload);
  sendJson(res, 200, result);
}

function handleRecent(res: ServerResponse, url: URL, deps: RouteDeps): void {
  const limitParam = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 50;
  const entries = deps.ingester.listRecent(limit);
  sendJson(res, 200, { count: entries.length, entries });
}

// ── Helpers ──

function validatePayload(p: Partial<OutcomeIngestPayload>): string | undefined {
  if (!p || typeof p !== "object") return "payload required";
  if (typeof p.source !== "string") return "source required";
  if (typeof p.external_id !== "string" || p.external_id.length === 0)
    return "external_id required";
  if (typeof p.outcome_type !== "string") return "outcome_type required";
  if (p.result !== "positive" && p.result !== "negative" && p.result !== "neutral")
    return "result must be positive|negative|neutral";
  if (typeof p.occurred_at !== "string" || Number.isNaN(Date.parse(p.occurred_at)))
    return "occurred_at must be ISO timestamp";
  if (!p.lead_id && !p.business_name)
    return "lead_id or business_name required for matching";
  return undefined;
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
