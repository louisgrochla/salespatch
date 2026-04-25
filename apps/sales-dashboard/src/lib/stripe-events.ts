/**
 * Stripe webhook idempotency.
 *
 * Stripe retries the same event under flaky network conditions. Without a
 * dedup gate, contractors would be paid twice when a retry sneaks past.
 *
 * Strategy:
 *   1. claimStripeEvent — checks if the event was previously processed
 *      successfully (processed_at IS NOT NULL). If so → 'already_processed',
 *      caller skips and returns 200. Otherwise upsert the row and proceed.
 *   2. markStripeEventProcessed — set processed_at after the handler succeeds.
 *   3. Handler failures leave processed_at NULL — Stripe will retry, the
 *      retry will re-claim, and the handler runs again. No event is silently
 *      swallowed.
 *
 * Concurrency note: if two webhook deliveries for the same un-processed event
 * arrive simultaneously, both could process. In practice Stripe serialises
 * retries (~60s gap), so this is acceptable for the beta. If it becomes a
 * problem, switch to a row-level lock on a per-event-id key.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type ClaimResult = 'claimed' | 'already_processed';

export async function claimStripeEvent(
  supabase: SupabaseClient,
  eventId: string,
  eventType: string,
): Promise<ClaimResult> {
  const { data: existing, error: selectErr } = await supabase
    .from('stripe_events')
    .select('id, processed_at')
    .eq('id', eventId)
    .maybeSingle();

  if (selectErr) {
    throw new Error(`claimStripeEvent select failed: ${selectErr.message}`);
  }

  if (existing && existing.processed_at) {
    return 'already_processed';
  }

  // Either no row, or a row with processed_at IS NULL (prior failed attempt).
  // Upsert refreshes received_at; processing proceeds.
  const { error: upsertErr } = await supabase
    .from('stripe_events')
    .upsert(
      { id: eventId, type: eventType, received_at: new Date().toISOString() },
      { onConflict: 'id' },
    );

  if (upsertErr) {
    throw new Error(`claimStripeEvent upsert failed: ${upsertErr.message}`);
  }

  return 'claimed';
}

export async function markStripeEventProcessed(
  supabase: SupabaseClient,
  eventId: string,
): Promise<void> {
  const { error } = await supabase
    .from('stripe_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('id', eventId);
  if (error) {
    // Non-fatal — the event was processed; we just couldn't mark it.
    // A retry would no-op (the side effect already happened) UNLESS the
    // handler isn't itself idempotent. Webhook handlers must be idempotent
    // anyway (e.g. only flip lead to sold if not already sold).
    console.error(`[stripe-events] failed to mark processed ${eventId}:`, error.message);
  }
}
