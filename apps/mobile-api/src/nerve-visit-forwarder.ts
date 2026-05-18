import crypto from 'crypto';

// Fire-and-forget producer for NERVE `POST /api/ingest/visit-event`
// (R9). Mirrors a single SP visit event into NERVE Postgres so the
// /leads ops view + RAG vault stay populated without depending on
// Supabase being reachable from Vercel.
//
// Contract — apps/nerve/src/app/api/ingest/visit-event/route.ts:
//   Header:  X-Ingest-Signature: sha256=<hex of HMAC-SHA256(raw body)>
//   Secret:  OUTCOME_INGEST_SECRET (shared with the other Phase B
//            endpoints).
//   Idempotent on `event_id` — retries collapse onto the same row.
//
// Configuration:
//   NERVE_VISIT_EVENT_URL — full endpoint, default
//     https://nerve.salespatch.co.uk/api/ingest/visit-event
//   OUTCOME_INGEST_SECRET — HMAC shared secret. When missing, the
//     forwarder no-ops silently (treat NERVE mirroring as best-effort
//     and never block the local write).

export type VisitEventType = 'arrived' | 'departed' | 'pitched' | 'feedback';

export interface NerveVisitEventPayload {
  event_id: string;
  assignment_id: string;
  lead_id: string;
  user_id: string;
  type: VisitEventType;
  duration_minutes?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  feedback?: string | null;
  rating?: number | null;
  metadata?: Record<string, unknown>;
  occurred_at: string; // ISO 8601
}

/** Build the canonical event_id NERVE keys on. */
export function buildVisitEventId(
  assignmentId: string,
  type: VisitEventType,
  occurredAt: string,
): string {
  return `${assignmentId}:${type}:${occurredAt.replace(/[:.]/g, '')}`;
}

/**
 * Fire-and-forget. Returns the promise so callers may attach a `.catch`
 * for logging, but it should never be awaited on the request path —
 * NERVE mirroring is best-effort and must not block the SP.
 */
export function forwardVisitEventToNerve(
  payload: NerveVisitEventPayload,
): Promise<void> {
  const url =
    process.env.NERVE_VISIT_EVENT_URL ??
    'https://nerve.salespatch.co.uk/api/ingest/visit-event';
  const secret = process.env.OUTCOME_INGEST_SECRET;

  if (!secret) {
    // Not configured — silently no-op. The local SQLite write is the
    // source of truth; NERVE mirroring catches up via backfill if
    // operators choose to wire one up later.
    return Promise.resolve();
  }

  const body = JSON.stringify(payload);
  const signature = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex')}`;

  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Ingest-Signature': signature,
    },
    body,
  })
    .then(() => undefined)
    .catch((e) => {
      console.error('[nerve-visit-forwarder] forward failed:', e);
    });
}
