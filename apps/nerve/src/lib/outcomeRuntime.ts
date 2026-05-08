import crypto from "crypto";

// Mirror of OutcomeIngestPayload in src/learning/outcomeIngest.ts on the runtime
// side. Kept in sync manually — both apps version this contract together.
export interface OutcomeIngestPayload {
  source: "nerve_webhook" | "supabase_poll" | "manual_skill" | "test";
  external_id: string;
  lead_id?: string;
  business_name?: string;
  outcome_type:
    | "pitch_closed"
    | "pitch_rejected"
    | "pitch_followup"
    | "demo_viewed"
    | "no_outcome";
  result: "positive" | "negative" | "neutral";
  agreed_price_gbp?: number;
  interest_level?: "cold" | "warm" | "hot";
  demo_reaction?: "loved" | "liked" | "neutral" | "unimpressed";
  objections?: string[];
  notes?: string;
  occurred_at: string;
  pitch_log_id?: string;
  assignment_id?: string;
}

function canonicalBody(payload: OutcomeIngestPayload): string {
  return JSON.stringify(payload, Object.keys(payload).sort());
}

function signBody(rawBody: string, secret: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

/**
 * Fire-and-forget POST to the runtime's outcome ingest endpoint. Returns true
 * on 2xx. Caller should `.catch()` rejections — failures here must never break
 * the parent webhook handler.
 */
export async function postOutcomeToRuntime(
  payload: OutcomeIngestPayload,
): Promise<boolean> {
  const url = process.env.PI_RUNTIME_URL ?? process.env.RUNTIME_URL;
  const secret = process.env.OUTCOME_INGEST_SECRET;
  if (!url) {
    console.warn("[outcome-runtime] PI_RUNTIME_URL not set; skipping fan-out");
    return false;
  }
  if (!secret) {
    console.warn("[outcome-runtime] OUTCOME_INGEST_SECRET not set; skipping fan-out");
    return false;
  }

  const body = canonicalBody(payload);
  const signature = signBody(body, secret);
  const endpoint = `${url.replace(/\/$/, "")}/api/outcomes/ingest`;

  // 5s budget — well within Vercel's 60s function limit and the ingest CLAUDE.md
  // states 500ms-2s embed budget; this fan-out is tail latency.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ingest-signature": signature,
      },
      body,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[outcome-runtime] non-2xx", { status: res.status, body: text.slice(0, 200) });
      return false;
    }
    return true;
  } finally {
    clearTimeout(timer);
  }
}
