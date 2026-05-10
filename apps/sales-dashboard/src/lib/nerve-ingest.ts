import crypto from 'crypto';

// Sales-dashboard → NERVE ingest helper.
//
// Fire-and-forget POSTs to /api/ingest/* on nerve.salespatch.co.uk.
// Failure must NEVER bubble — Supabase/SQLite write is the source of
// truth, NERVE is a downstream mirror. The handlers that call this MUST
// catch + log; we don't throw.
//
// HMAC pattern matches the Phase A ingest convention:
//   header: X-Ingest-Signature: sha256=<hex>
//   secret: OUTCOME_INGEST_SECRET
//   body:   the raw JSON, signed verbatim
//
// Distinct from the pitch route's NERVE_PITCH_SECRET path — that endpoint
// pre-dates the unified Phase A secret. Migrating it is out of scope for
// B1; the lead-assignment event is the only thing this helper does today.

const NERVE_BASE_URL =
  process.env.NERVE_BASE_URL ?? 'https://nerve.salespatch.co.uk';
const TIMEOUT_MS = 4_000;

export type AssignmentStatus = 'new' | 'visited' | 'pitched' | 'sold' | 'rejected';

export type LeadAssignmentEventSource =
  | 'status_patch'
  | 'pitch_cascade'
  | 'supabase_poll'
  | 'backfill'
  | 'test';

export interface LeadAssignmentEventPayload {
  event_id: string;
  assignment_id: string;
  lead_id: string;
  user_id?: string | null;
  prev_status?: AssignmentStatus | null;
  status: AssignmentStatus;
  source?: LeadAssignmentEventSource;
  rejection_reason?: string | null;
  commission_amount_pence?: number | null;
  notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  metadata?: Record<string, unknown>;
  occurred_at: string; // ISO 8601
}

export interface NerveIngestResult {
  ok: boolean;
  status?: number;
  error?: string;
  body?: unknown;
}

/**
 * Build a stable event_id from assignment_id, status, and occurred_at.
 * Same status flipped at the same instant → same event_id → idempotent.
 * Colons stripped from the timestamp because event_ids appear in URLs.
 */
export function buildEventId(
  assignmentId: string,
  status: AssignmentStatus,
  occurredAtIso: string,
): string {
  const stamp = occurredAtIso.replace(/[:.]/g, '').replace(/[-]/g, '');
  return `${assignmentId}:${status}:${stamp}`;
}

/**
 * Post a lead-assignment event to NERVE. Returns a result object;
 * never throws. Callers should pattern-match `ok` and log the rest.
 *
 * Secret resolution is lazy so a Vercel deploy missing the env var
 * fails noisily on first invocation rather than at module load.
 */
export async function postLeadAssignmentEvent(
  payload: LeadAssignmentEventPayload,
): Promise<NerveIngestResult> {
  const secret = process.env.OUTCOME_INGEST_SECRET;
  if (!secret) {
    return {
      ok: false,
      error: 'OUTCOME_INGEST_SECRET not configured on sales-dashboard',
    };
  }

  const bodyJson = JSON.stringify(payload);
  const signature =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(bodyJson).digest('hex');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${NERVE_BASE_URL}/api/ingest/lead-assignment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Ingest-Signature': signature,
      },
      body: bodyJson,
      signal: controller.signal,
    });
    const respBody = await res.json().catch(() => undefined);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error:
          (respBody as { error?: string })?.error ?? `HTTP ${res.status}`,
        body: respBody,
      };
    }
    return { ok: true, status: res.status, body: respBody };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}
