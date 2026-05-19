import crypto from 'crypto';

// Forwards a structured pitch row from mobile-api → NERVE
// /api/ingest/pitch. HMAC-SHA256 signed.
//
// Configuration (preferred — unified Phase B secret):
//   NERVE_BASE_URL          — defaults to https://nerve.salespatch.co.uk
//   OUTCOME_INGEST_SECRET   — same value as NERVE's OUTCOME_INGEST_SECRET
//                             (the secret already used by lead-assignment,
//                             salesperson, Stripe, etc. ingest endpoints).
//                             Signs with header `X-Ingest-Signature`.
//
// Legacy fallback (kept so an env-var rollout can be staggered):
//   NERVE_PITCH_URL    — full endpoint, default {NERVE_BASE_URL}/api/ingest/pitch
//   NERVE_PITCH_SECRET — same value as NERVE's SUPABASE_WEBHOOK_SECRET.
//                        Signs with header `x-supabase-signature`.
//
// NERVE's pitch route now accepts either signature scheme. If both env
// vars are present we use the unified one; the legacy one is fallback for
// the gap window before deploys roll. The producer-side silent failure
// (pitch 401s after Phase B because operators only kept OUTCOME_INGEST_-
// SECRET in sync) is what motivated this change — see Lead Intelligence
// vs Sales Intelligence drift report 2026-05-19.
//
// Returns a result discriminator the caller can persist:
//   { ok: true, nervePitchId }
//   { ok: false, error }

export interface NervePitchPayload {
  id: string;
  business_name: string;
  business_type?: string | null;
  sector?: string | null;
  location?: string | null;
  lead_source?: string | null;
  demo_version?: string | null;
  outcome: string;
  contractor_id?: string | null;
  pitch_duration?: number | null;
  pitch_attempt_number?: number | null;
  consent_to_record: boolean;
  decision_maker_present?: boolean | null;
  demo_shown?: boolean | null;
  interest_level?: string | null;
  demo_reaction?: string | null;
  agreed_price?: number | null;
  payment_method?: string | null;
  best_followup_time?: string | null;
  agreed_next_step?: string | null;
  gut_feel_close_pct?: number | null;
  first_response_phrase?: string | null;
  competitor_mentioned?: string | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
  notes?: string | null;
  objections?: string[];
  date: string; // ISO-8601 of when the pitch happened
}

export type ForwardResult =
  | { ok: true; nervePitchId: string; qualityFlag: string }
  | { ok: false; error: string };

export async function forwardPitchToNerve(payload: NervePitchPayload): Promise<ForwardResult> {
  const baseUrl =
    process.env.NERVE_BASE_URL ?? 'https://nerve.salespatch.co.uk';
  const url =
    process.env.NERVE_PITCH_URL ?? `${baseUrl}/api/ingest/pitch`;

  const unifiedSecret = process.env.OUTCOME_INGEST_SECRET;
  const legacySecret = process.env.NERVE_PITCH_SECRET;

  if (!unifiedSecret && !legacySecret) {
    // Without a secret we can only succeed in dev with NERVE_WEBHOOK_ALLOW_UNSIGNED=true.
    // Never silently no-op — the caller must know forwarding is disabled.
    return { ok: false, error: 'no NERVE pitch secret configured (OUTCOME_INGEST_SECRET or NERVE_PITCH_SECRET)' };
  }

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (unifiedSecret) {
    const sig = crypto.createHmac('sha256', unifiedSecret).update(body).digest('hex');
    headers['X-Ingest-Signature'] = `sha256=${sig}`;
  }
  if (legacySecret) {
    const sig = crypto.createHmac('sha256', legacySecret).update(body).digest('hex');
    headers['x-supabase-signature'] = sig;
  }

  try {
    const res = await fetch(url, { method: 'POST', headers, body });

    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      pitchId?: string;
      qualityFlag?: string;
      error?: string;
    };

    if (!res.ok || json.error || !json.pitchId) {
      return {
        ok: false,
        error: json.error ?? `HTTP ${res.status}`,
      };
    }

    return {
      ok: true,
      nervePitchId: json.pitchId,
      qualityFlag: json.qualityFlag ?? 'unknown',
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
