import { IncomingMessage, ServerResponse } from "node:http";
import type { ModelRegistry } from "../../runtime/modelRegistry.js";

const MAX_BODY_BYTES = 65_536;

interface RouteDeps {
  modelRegistry: ModelRegistry;
}

export async function handleModelsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  deps: RouteDeps,
): Promise<boolean> {
  const method = req.method ?? "GET";

  if (method === "GET" && url.pathname === "/api/models") {
    const kind = url.searchParams.get("kind") ?? undefined;
    const agentId = url.searchParams.get("agent_id") ?? undefined;
    const list = deps.modelRegistry.list({
      kind: kind === "critic" || kind === "agent" ? kind : undefined,
      agent_id: agentId,
    });
    sendJson(res, 200, { count: list.length, models: list });
    return true;
  }

  if (method === "POST" && url.pathname === "/api/models/swap") {
    let raw: string;
    try {
      raw = await readRawBody(req);
    } catch (e) {
      sendJson(res, 413, { error: String(e) });
      return true;
    }
    let body: { id?: string };
    try {
      body = JSON.parse(raw) as { id?: string };
    } catch (e) {
      sendJson(res, 400, { error: `bad json: ${String(e)}` });
      return true;
    }
    if (typeof body.id !== "string" || body.id.length === 0) {
      sendJson(res, 400, { error: "id required" });
      return true;
    }
    const result = deps.modelRegistry.swap(body.id);
    if (!result) {
      sendJson(res, 404, { error: "model not found" });
      return true;
    }
    sendJson(res, 200, { active: result });
    return true;
  }

  return false;
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
