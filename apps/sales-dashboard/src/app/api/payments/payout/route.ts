import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStripe } from '@/lib/stripe';

const COMMISSION_GBP = 5000; // £50 in pence

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { salesperson_id, demo_id } = body;

    if (!salesperson_id) {
      return NextResponse.json({ error: 'Missing required field: salesperson_id' }, { status: 400 });
    }

    const stripe = getStripe();
    const supabase = getSupabase();

    const { data: sp } = await supabase
      .from('salesperson_metrics')
      .select('stripe_connect_id, display_name')
      .eq('id', salesperson_id)
      .single();

    if (!sp?.stripe_connect_id) {
      return NextResponse.json({ error: 'Salesperson has no Stripe Connect account.' }, { status: 400 });
    }

    const transfer = await stripe.transfers.create({
      amount: COMMISSION_GBP,
      currency: 'gbp',
      destination: sp.stripe_connect_id,
      metadata: { salesperson_id, demo_id: demo_id ?? '', type: 'sale_commission' },
    });

    await supabase.from('cost_log').insert({
      service: 'stripe',
      amount_gbp: COMMISSION_GBP / 100,
      description: `Commission payout to ${sp.display_name ?? salesperson_id}`,
      metadata: { transfer_id: transfer.id, salesperson_id, demo_id: demo_id ?? null },
    });

    return NextResponse.json({ transfer_id: transfer.id, amount_gbp: COMMISSION_GBP / 100 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[payments/payout] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
