/**
 * POST /api/payments/create-checkout
 *
 * Salesperson-authenticated endpoint. Body: { lead_id: string } where lead_id
 * is the lead_assignment.id (named "lead_id" to match iOS terminology and the
 * customer-facing /preview/<id> URL).
 *
 * Returns the cached active Stripe Checkout session for this assignment, or
 * eagerly creates one if none exists. Eager-attribution: the session has
 * salesperson_id locked into Stripe metadata before the customer ever scans.
 *
 * IMPORTANT: This endpoint does NOT touch commission state. Commission only
 * accrues inside the webhook on checkout.session.completed with
 * payment_status='paid'. See lib/payments.ts for money model.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveUserFromRequest } from '@/lib/auth';
import { getOrCreateActiveSession, previewUrlFor } from '@/lib/payments';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function POST(req: NextRequest) {
  const auth = resolveUserFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Accept lead_id (preferred) or lead_assignment_id (explicit alias).
  const raw = body.lead_id ?? body.lead_assignment_id;
  const leadAssignmentId = typeof raw === 'string' ? raw : null;
  if (!leadAssignmentId) {
    return NextResponse.json(
      { error: 'Missing required field: lead_id' },
      { status: 400 },
    );
  }

  const supabase = getSupabase();

  // Authorisation: assignment must belong to the calling user.
  const { data: assignment, error: aErr } = await supabase
    .from('lead_assignments')
    .select('id, user_id, status')
    .eq('id', leadAssignmentId)
    .maybeSingle();
  if (aErr) {
    return NextResponse.json({ error: aErr.message }, { status: 500 });
  }
  if (!assignment) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }
  if (assignment.user_id !== auth.user_id) {
    return NextResponse.json({ error: 'Not your lead' }, { status: 403 });
  }
  if (assignment.status === 'sold') {
    return NextResponse.json(
      { error: 'Lead already sold' },
      { status: 409 },
    );
  }

  try {
    const session = await getOrCreateActiveSession(supabase, leadAssignmentId);
    return NextResponse.json({
      preview_url: previewUrlFor(leadAssignmentId),
      checkout_url: session.stripe_session_url,
      session_id: session.stripe_session_id,
      session_expires_at: session.expires_at,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create session';
    console.error('[payments/create-checkout] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
