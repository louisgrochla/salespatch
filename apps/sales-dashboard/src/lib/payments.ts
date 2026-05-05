/**
 * Payment session management.
 *
 * Eager creation, lazy refresh: the salesperson taps "Take payment" → we
 * create a Stripe Checkout session immediately so contractor attribution
 * is locked into Stripe metadata. The session id is cached in
 * lead_payment_sessions so the customer's preview page can hand the same
 * session id back at scan time.
 *
 * Money model (locked 2026-05-05 — beta launch):
 *   - £299 setup, charged at checkout (mode='payment', save card off-session)
 *   - £25/mo recurring, subscription created server-side in the webhook
 *     after payment_status='paid', with trial_end = now + 30 days
 *   - Contractor commission = sales_users.commission_amount_pence (flat)
 *     paid only on confirmed checkout.session.completed (NOT at QR-gen)
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getStripe } from './stripe';

// Setup fee — read from env so beta pricing experiments don't need a code
// deploy. Set SETUP_FEE_PENCE on Vercel (e.g. 29900 = £299, 35000 = £350).
// Defaults to 29900 (the beta price) if unset.
const DEFAULT_SETUP_FEE_PENCE = 29900;
export function getSetupFeePence(): number {
  const raw = process.env.SETUP_FEE_PENCE;
  if (!raw) return DEFAULT_SETUP_FEE_PENCE;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 100 || n > 1_000_000) {
    // 100p (£1) min, 10000.00 max — refuse anything wild.
    console.warn(`[payments] Invalid SETUP_FEE_PENCE=${raw}, falling back to ${DEFAULT_SETUP_FEE_PENCE}`);
    return DEFAULT_SETUP_FEE_PENCE;
  }
  return n;
}

// Monthly recurring fee — also env-driven for beta tweaking. The recurring
// charge itself is governed by the Stripe Price ID (STRIPE_HOSTING_PRICE_ID)
// which is immutable in Stripe; this constant only controls the price
// displayed in the Checkout session line description and on the preview CTA.
// To actually change the amount Stripe charges, create a new Price in Stripe
// Dashboard and swap STRIPE_HOSTING_PRICE_ID.
const DEFAULT_MONTHLY_PENCE = 2500;
export function getMonthlyPence(): number {
  const raw = process.env.MONTHLY_PENCE;
  if (!raw) return DEFAULT_MONTHLY_PENCE;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 100 || n > 100_000) {
    console.warn(`[payments] Invalid MONTHLY_PENCE=${raw}, falling back to ${DEFAULT_MONTHLY_PENCE}`);
    return DEFAULT_MONTHLY_PENCE;
  }
  return n;
}

// Format pence as a "£X" / "£X.YY" string for UI use.
export function formatPenceAsPounds(pence: number): string {
  const pounds = pence / 100;
  return pounds === Math.floor(pounds) ? `£${pounds}` : `£${pounds.toFixed(2)}`;
}

// Legacy aliases for code that still references the constants directly.
// Prefer getSetupFeePence() / getMonthlyPence() at call sites — these only
// exist for backwards-compat with the webhook constant import.
export const SETUP_FEE_PENCE = DEFAULT_SETUP_FEE_PENCE;
export const MONTHLY_PENCE = DEFAULT_MONTHLY_PENCE;

// Stripe's max for mode='payment' Checkout Sessions is 24 hours.
// (mode='subscription' allows 7 days, but our flow is one-time + post-pay
// subscription create, so we're stuck on payment mode.) Pick 23h to leave
// a buffer; expired sessions get auto-refreshed by getOrCreateActiveSession
// the next time the preview page renders, so the customer never sees the seam.
const SESSION_EXPIRES_HOURS = 23;
const PUBLIC_BASE_URL = 'https://salespatch.co.uk';

export interface PaymentSessionRow {
  id: string;
  lead_assignment_id: string;
  stripe_session_id: string;
  stripe_session_url: string;
  expires_at: string;
  status: 'active' | 'expired' | 'completed';
  amount_setup_pence: number;
  amount_monthly_pence: number;
  created_at: string;
  completed_at: string | null;
}

export function previewUrlFor(leadAssignmentId: string): string {
  return `${PUBLIC_BASE_URL}/preview/${leadAssignmentId}`;
}

function paidUrlFor(leadAssignmentId: string): string {
  return `${PUBLIC_BASE_URL}/paid/${leadAssignmentId}?session_id={CHECKOUT_SESSION_ID}`;
}

export async function getActiveSessionForAssignment(
  supabase: SupabaseClient,
  leadAssignmentId: string,
): Promise<PaymentSessionRow | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('lead_payment_sessions')
    .select('*')
    .eq('lead_assignment_id', leadAssignmentId)
    .eq('status', 'active')
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getActiveSession: ${error.message}`);
  return (data as PaymentSessionRow | null) ?? null;
}

interface AssignmentForPayment {
  id: string;
  lead_id: string;
  user_id: string;
  status: string;
  notes: string | null;
}

async function loadAssignment(
  supabase: SupabaseClient,
  leadAssignmentId: string,
): Promise<AssignmentForPayment | null> {
  const { data, error } = await supabase
    .from('lead_assignments')
    .select('id, lead_id, user_id, status, notes')
    .eq('id', leadAssignmentId)
    .maybeSingle();
  if (error) throw new Error(`loadAssignment: ${error.message}`);
  return data as AssignmentForPayment | null;
}

function businessNameFromNotes(notes: string | null): string {
  if (!notes) return 'your business';
  try {
    const parsed = JSON.parse(notes) as Record<string, unknown>;
    const name = parsed.business_name;
    return typeof name === 'string' && name.trim() ? name : 'your business';
  } catch {
    return 'your business';
  }
}

export async function createCheckoutSessionForAssignment(
  supabase: SupabaseClient,
  leadAssignmentId: string,
): Promise<PaymentSessionRow> {
  const assignment = await loadAssignment(supabase, leadAssignmentId);
  if (!assignment) throw new Error(`Assignment not found: ${leadAssignmentId}`);
  if (assignment.status === 'sold') {
    throw new Error('Lead already sold — cannot create new session');
  }

  const businessName = businessNameFromNotes(assignment.notes);
  const stripe = getStripe();
  const expiresAtUnix = Math.floor(Date.now() / 1000) + SESSION_EXPIRES_HOURS * 60 * 60;

  // Resolve dynamic prices once per session create. Snapshot is stored on
  // the lead_payment_sessions row so historical price is recoverable even
  // if env vars change later.
  const setupPence = getSetupFeePence();
  const monthlyPence = getMonthlyPence();
  const monthlyDisplay = formatPenceAsPounds(monthlyPence);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_creation: 'always',
    expires_at: expiresAtUnix,
    line_items: [
      {
        price_data: {
          currency: 'gbp',
          unit_amount: setupPence,
          product_data: {
            name: `Website setup — ${businessName}`,
            description: `One-time setup fee. Includes first month of hosting & support. ${monthlyDisplay}/month thereafter, starting in 30 days. Cancel anytime, no commitment.`,
          },
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      // Save the card so the webhook can create a recurring subscription on it,
      // off-session, with a 30-day trial so the first recurring charge lands
      // exactly 30 days after the setup fee.
      setup_future_usage: 'off_session',
      metadata: {
        lead_assignment_id: assignment.id,
        salesperson_id: assignment.user_id,
        lead_id: assignment.lead_id,
      },
    },
    metadata: {
      lead_assignment_id: assignment.id,
      salesperson_id: assignment.user_id,
      lead_id: assignment.lead_id,
      monthly_pence: String(monthlyPence),
      setup_pence: String(setupPence),
    },
    // Onboarding now happens PRE-payment, so success_url goes straight to
    // /paid (a thank-you confirmation), not back through the form.
    success_url: paidUrlFor(assignment.id),
    cancel_url: previewUrlFor(assignment.id),
  });

  if (!session.url) {
    throw new Error('Stripe did not return a session URL');
  }
  if (!session.expires_at) {
    throw new Error('Stripe did not return an expires_at');
  }

  const rowId = `lps_${session.id}`;
  const { data: cached, error: cErr } = await supabase
    .from('lead_payment_sessions')
    .insert({
      id: rowId,
      lead_assignment_id: assignment.id,
      stripe_session_id: session.id,
      stripe_session_url: session.url,
      expires_at: new Date(session.expires_at * 1000).toISOString(),
      status: 'active',
      amount_setup_pence: setupPence,
      amount_monthly_pence: monthlyPence,
    })
    .select('*')
    .single();
  if (cErr) throw new Error(`cache insert: ${cErr.message}`);
  return cached as PaymentSessionRow;
}

export async function getOrCreateActiveSession(
  supabase: SupabaseClient,
  leadAssignmentId: string,
): Promise<PaymentSessionRow> {
  const existing = await getActiveSessionForAssignment(supabase, leadAssignmentId);
  if (existing) return existing;
  return createCheckoutSessionForAssignment(supabase, leadAssignmentId);
}
