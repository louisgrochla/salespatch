import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStripe } from '@/lib/stripe';

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
    const { salesperson_id, email, display_name } = body;

    if (!salesperson_id || !email) {
      return NextResponse.json({ error: 'Missing required fields: salesperson_id, email' }, { status: 400 });
    }

    const stripe = getStripe();
    const supabase = getSupabase();

    const { data: sp } = await supabase
      .from('salesperson_metrics')
      .select('stripe_connect_id')
      .eq('id', salesperson_id)
      .single();

    let connectAccountId = sp?.stripe_connect_id;

    if (!connectAccountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'GB',
        email,
        capabilities: { transfers: { requested: true } },
        business_type: 'individual',
        metadata: { display_name: display_name ?? '' },
      });
      connectAccountId = account.id;

      await supabase
        .from('salesperson_metrics')
        .update({ stripe_connect_id: connectAccountId })
        .eq('id', salesperson_id);
    }

    const origin = req.headers.get('origin') ?? 'http://localhost:4300';
    const link = await stripe.accountLinks.create({
      account: connectAccountId,
      type: 'account_onboarding',
      return_url: `${origin}/settings/payout-setup?complete=true`,
      refresh_url: `${origin}/settings/payout-setup?refresh=true`,
    });

    return NextResponse.json({ url: link.url, connect_account_id: connectAccountId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[payments/connect] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
