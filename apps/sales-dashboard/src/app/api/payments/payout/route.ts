/**
 * POST /api/payments/payout
 *
 * Admin-only. Body: { lead_assignment_id }.
 *
 * Pays out the salesperson commission for a single sold assignment via
 * Stripe Connect transfer (platform balance → salesperson's Connect account).
 * Reads the commission amount from the assignment row (set by the webhook
 * when the sale closed); never trusts the client.
 *
 * Idempotent in two layers:
 *   1. The DB row's `payout_status='paid_out'` short-circuits a re-attempt.
 *   2. The Stripe transfer uses idempotency_key=`payout:<assignment_id>` so
 *      even if our DB update lost (network, crash) Stripe won't double-bill.
 *
 * Failure modes write `payout_status='failed'` + `payout_failure_reason`
 * so the admin can retry after fixing the underlying issue (e.g. salesperson
 * finishes Connect onboarding).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminToken } from '@/lib/admin-auth';
import { getStripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function requireAdmin(req: NextRequest): NextResponse | null {
  const token = req.cookies.get('admin_token')?.value;
  if (!token || !validateAdminToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const leadAssignmentId =
    typeof body.lead_assignment_id === 'string' ? body.lead_assignment_id : null;
  if (!leadAssignmentId) {
    return NextResponse.json(
      { error: 'Missing required field: lead_assignment_id' },
      { status: 400 },
    );
  }

  const supabase = getSupabase();

  // Pull the assignment + the salesperson's Stripe Connect account in one go.
  const { data: assignment, error: aErr } = await supabase
    .from('lead_assignments')
    .select(
      'id, status, user_id, commission_amount_pence, payout_status, payout_transfer_id, sales_users!inner(id, name, stripe_connect_id)',
    )
    .eq('id', leadAssignmentId)
    .maybeSingle();

  if (aErr) {
    return NextResponse.json({ error: aErr.message }, { status: 500 });
  }
  if (!assignment) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }
  if (assignment.status !== 'sold') {
    return NextResponse.json(
      { error: `Assignment is ${assignment.status}, not sold` },
      { status: 409 },
    );
  }
  if (assignment.payout_status === 'paid_out') {
    return NextResponse.json(
      {
        error: 'Already paid out',
        payout_transfer_id: assignment.payout_transfer_id,
        payout_status: 'paid_out',
      },
      { status: 409 },
    );
  }

  const sp = (assignment.sales_users as unknown) as {
    id: string;
    name: string | null;
    stripe_connect_id: string | null;
  } | null;
  if (!sp?.stripe_connect_id) {
    return NextResponse.json(
      {
        error:
          'Salesperson has no Stripe Connect account — they need to finish onboarding first',
      },
      { status: 400 },
    );
  }

  const commissionPence = assignment.commission_amount_pence;
  if (typeof commissionPence !== 'number' || commissionPence <= 0) {
    return NextResponse.json(
      { error: 'Assignment has no commission amount on file' },
      { status: 400 },
    );
  }

  const stripe = getStripe();

  let transferId: string | null = null;
  try {
    const transfer = await stripe.transfers.create(
      {
        amount: commissionPence,
        currency: 'gbp',
        destination: sp.stripe_connect_id,
        metadata: {
          lead_assignment_id: leadAssignmentId,
          salesperson_id: sp.id,
          type: 'sale_commission',
        },
        description: `SalesFlow commission · ${sp.name ?? sp.id}`,
      },
      { idempotencyKey: `payout:${leadAssignmentId}` },
    );
    transferId = transfer.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe transfer failed';
    console.error('[payments/payout] transfer error:', message);

    await supabase
      .from('lead_assignments')
      .update({
        payout_status: 'failed',
        payout_failed_at: new Date().toISOString(),
        payout_failure_reason: message.slice(0, 500),
      })
      .eq('id', leadAssignmentId);

    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Mark paid. The .eq('payout_status', 'pending') gate stops a race-condition
  // double-pay (two admin tabs hitting the button at once); the second one's
  // update affects 0 rows, but Stripe's idempotency_key already prevented a
  // duplicate transfer above so we just return success either way.
  const { error: uErr } = await supabase
    .from('lead_assignments')
    .update({
      payout_status: 'paid_out',
      payout_transfer_id: transferId,
      payout_paid_out_at: new Date().toISOString(),
      payout_failed_at: null,
      payout_failure_reason: null,
    })
    .eq('id', leadAssignmentId)
    .neq('payout_status', 'paid_out');

  if (uErr) {
    console.error('[payments/payout] db update error:', uErr.message);
    // Stripe transfer succeeded but DB update failed — surface so admin
    // can re-poll. Stripe idempotency makes a retry safe.
    return NextResponse.json(
      { warning: 'Transfer made but DB update failed', transfer_id: transferId },
      { status: 207 },
    );
  }

  // Best-effort cost log (existing convention, non-blocking).
  await supabase
    .from('cost_log')
    .insert({
      service: 'stripe',
      amount_gbp: commissionPence / 100,
      description: `Commission payout to ${sp.name ?? sp.id}`,
      metadata: {
        transfer_id: transferId,
        salesperson_id: sp.id,
        lead_assignment_id: leadAssignmentId,
      },
    })
    .then(() => undefined, () => undefined);

  return NextResponse.json({
    transfer_id: transferId,
    amount_pence: commissionPence,
    amount_gbp: commissionPence / 100,
    payout_status: 'paid_out',
  });
}
