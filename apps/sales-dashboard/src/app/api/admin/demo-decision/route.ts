import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { validateAdminToken } from "@/lib/admin-auth";

// POST /api/admin/demo-decision
//
// Forwarder for the manual /build-demo skill's `decision.json`. The skill
// drops the file alongside the demo HTML and lead JSON. The admin dropzone
// (or any admin tool) POSTs the decision.json content here; this route HMAC-
// signs the body and forwards to the Pi runtime's /api/decisions/manual.
//
// Body shape mirrors `ManualDecisionBody` in
// src/missionControl/routes/decisions.ts on the runtime side. We pass it
// through verbatim — validation lives on the runtime.

interface DecisionForwardBody {
  source: string;
  agent_id: string;
  lead_id: string;
  business_name: string;
  vertical?: string;
  design_decisions: Record<string, unknown>;
  reasoning?: string;
  pitch_brief_summary?: string;
  lead_summary?: Record<string, unknown>;
}

function requireAdmin(req: NextRequest): NextResponse | null {
  const token = req.cookies.get("admin_token")?.value;
  if (!token || !validateAdminToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  let body: DecisionForwardBody;
  try {
    body = (await req.json()) as DecisionForwardBody;
  } catch (e) {
    return NextResponse.json({ error: `bad json: ${String(e)}` }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "body required" }, { status: 400 });
  }

  const runtimeUrl = process.env.PI_RUNTIME_URL ?? process.env.RUNTIME_URL;
  const secret = process.env.OUTCOME_INGEST_SECRET;
  if (!runtimeUrl) {
    return NextResponse.json(
      { error: "PI_RUNTIME_URL not configured" },
      { status: 503 },
    );
  }

  const canonical = JSON.stringify(body, Object.keys(body).sort());
  const signature = secret
    ? `sha256=${crypto.createHmac("sha256", secret).update(canonical).digest("hex")}`
    : undefined;

  const endpoint = `${runtimeUrl.replace(/\/$/, "")}/api/decisions/manual`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(signature ? { "x-ingest-signature": signature } : {}),
      },
      body: canonical,
      signal: controller.signal,
    });
    const text = await res.text();
    return NextResponse.json(
      { ok: res.ok, status: res.status, runtime_response: tryParseJson(text) },
      { status: res.ok ? 200 : 502 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: `forward failed: ${String(e)}` },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
