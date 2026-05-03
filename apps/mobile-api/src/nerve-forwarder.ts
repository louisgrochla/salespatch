import crypto from 'crypto';

// Forwards a structured pitch row from mobile-api → NERVE
// /api/ingest/pitch. Body is HMAC-SHA256 signed with the same shared
// secret pattern Supabase webhooks use, so NERVE's existing auth path
// works unchanged.
//
// Configuration:
//   NERVE_PITCH_URL    — full endpoint, default https://nerve.salespatch.co.uk/api/ingest/pitch
//   NERVE_PITCH_SECRET — same value as NERVE's SUPABASE_WEBHOOK_SECRET
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
  const url =
    process.env.NERVE_PITCH_URL ??
    'https://nerve.salespatch.co.uk/api/ingest/pitch';
  const secret = process.env.NERVE_PITCH_SECRET;

  if (!secret) {
    // Without a secret we can only succeed in dev with NERVE_WEBHOOK_ALLOW_UNSIGNED=true.
    // Never silently no-op — the caller must know forwarding is disabled.
    return { ok: false, error: 'NERVE_PITCH_SECRET not configured' };
  }

  const body = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-supabase-signature': signature,
      },
      body,
    });

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
