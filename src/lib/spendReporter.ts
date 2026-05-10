/**
 * Spend reporter — fire-and-forget POST to NERVE's /api/ingest/spend.
 *
 * Wraps every paid external API call (OpenRouter, Apify, Google Places,
 * etc.) so the founder can answer "how much did vertical=barber cost in
 * May?" from a single NERVE query.
 *
 * Contract:
 * - Never throws — caller MUST be able to call this without try/catch.
 * - Never awaits — the HTTP send is detached so callers don't pay
 *   latency.
 * - Never blocks shutdown — uses fetch with a short timeout.
 * - If env not configured (NERVE_API_URL or NERVE_INGEST_SECRET missing),
 *   no-ops with a single warn-line so dev/local boxes stay quiet.
 *
 * HMAC: SHA-256 of the raw JSON body, signed with NERVE_INGEST_SECRET
 * (alias OUTCOME_INGEST_SECRET — one secret covers all NERVE ingest
 * endpoints). Header X-Ingest-Signature: sha256=<hex>.
 */

import { createHmac } from "node:crypto";
import { createLogger } from "./logger.js";

const log = createLogger("spend-reporter");

export interface SpendReport {
  provider: "openrouter" | "apify" | "google_places" | string;
  model?: string;
  agent_id?: string;
  run_id?: string;
  node_id?: string;
  lead_id?: string;
  vertical?: string;
  cost_usd: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  request_kind?: string;
  success?: boolean;
  error_message?: string;
  metadata?: Record<string, unknown>;
  occurred_at: string; // ISO timestamp
}

const SPEND_TIMEOUT_MS = Number(process.env.NERVE_SPEND_TIMEOUT_MS ?? "5000");

// Soft warning suppression — we don't want every paid API call to splat
// "NERVE_API_URL not set" into the log. Warn once per process.
let warnedMissingConfig = false;

/**
 * Fire-and-forget — never throws, never blocks the caller. Logs warnings.
 */
export function reportSpend(input: SpendReport): void {
  const baseUrl = (process.env.NERVE_API_URL ?? "").replace(/\/+$/, "");
  const secret =
    process.env.NERVE_INGEST_SECRET ?? process.env.OUTCOME_INGEST_SECRET ?? "";

  if (!baseUrl || !secret) {
    if (!warnedMissingConfig) {
      log.warn(
        "spend-reporter disabled (set NERVE_API_URL and NERVE_INGEST_SECRET to enable)",
      );
      warnedMissingConfig = true;
    }
    return;
  }

  if (!input || typeof input !== "object") return;
  if (typeof input.provider !== "string" || input.provider.length === 0) return;
  if (typeof input.cost_usd !== "number" || !Number.isFinite(input.cost_usd))
    return;
  if (typeof input.occurred_at !== "string") return;

  // Fire-and-forget: kick off the send, return immediately. Errors are
  // swallowed and logged — never propagate to the caller.
  void sendDetached(baseUrl, secret, input);
}

async function sendDetached(
  baseUrl: string,
  secret: string,
  input: SpendReport,
): Promise<void> {
  try {
    const body = JSON.stringify(input);
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SPEND_TIMEOUT_MS);
    try {
      const response = await fetch(`${baseUrl}/api/ingest/spend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Ingest-Signature": signature,
        },
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await safeReadText(response);
        log.warn("spend ingest non-2xx", {
          status: response.status,
          provider: input.provider,
          body: text.slice(0, 200),
        });
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    log.warn("spend ingest failed", {
      provider: input.provider,
      error: String(err),
    });
  }
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
