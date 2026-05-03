import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { resolveUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/leads/[id]/pitch
//
// Accepts the post-pitch questionnaire payload from the iOS app and
// forwards it to NERVE /api/ingest/pitch (HMAC-signed). NERVE is the
// source of truth: schema validation, qualityFlag derivation, and
// pgvector embedding all happen there.
//
// Why no local persistence here:
//   - Vercel functions are ephemeral; SQLite isn't an option in prod
//   - Supabase mirroring would duplicate NERVE storage with no extra
//     value at launch — easy to add later if dashboard needs it
//   - NERVE already returns a quality_flag the iOS app can surface
//
// Side effects:
//   - lead_assignments.status cascaded to match the outcome
//   - sales_activity_log row written for audit
//
// On NERVE forward failure: 500 with the upstream error (iOS shows
// "queued for retry" toast).

const ALLOWED_OUTCOMES = new Set([
  'closed_now', 'closed_followup', 'follow_up', 'rejected', 'not_pitched',
]);

interface PitchBody {
  outcome: string;
  pitch_duration_seconds?: number | null;
  demo_version?: string | null;
  decision_maker_present?: boolean | null;
  demo_shown?: boolean | null;
  interest_level?: string | null;
  consent_to_record: boolean;
  demo_reaction?: string | null;
  agreed_price?: number | null;
  payment_method?: string | null;
  best_followup_time?: string | null;
  agreed_next_step?: string | null;
  objections?: string[];
  gut_feel_close_pct?: number | null;
  first_response_phrase?: string | null;
  competitor_mentioned?: string | null;
  notes?: string | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
  pitched_at?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = resolveUserFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Auth required', code: 'AUTH_REQUIRED' }, { status: 401 });
  }

  let body: PitchBody;
  try {
    body = (await req.json()) as PitchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.outcome || !ALLOWED_OUTCOMES.has(body.outcome)) {
    return NextResponse.json(
      { error: `Invalid outcome: ${body.outcome}`, code: 'BAD_OUTCOME' },
      { status: 400 },
    );
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // 1. Fetch the assignment + denormalised lead context for forwarding.
  const { data: assignment, error: aErr } = await sb
    .from('lead_assignments')
    .select(`
      id, user_id, lead_id, status,
      leads ( business_name, business_type, sector, postcode, source_method )
    `)
    .eq('id', params.id)
    .maybeSingle();

  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
  if (!assignment) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  if (assignment.user_id !== auth.user_id) {
    return NextResponse.json({ error: 'Not your lead', code: 'FORBIDDEN' }, { status: 403 });
  }

  const lead = (assignment.leads as unknown as Record<string, string | null> | null) ?? {};
  const businessName = (lead.business_name as string | null) ?? 'Unknown business';

  // 2. Compute pitch attempt # by counting prior NERVE-bound pitches.
  //    Cheaper to track on the iOS side via a counter, but doing it here
  //    means we don't trust the client.
  const { count: priorCount } = await sb
    .from('pitch_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', assignment.lead_id);
  const pitchAttemptNumber = (priorCount ?? 0) + 1;

  // 3. Build the NERVE payload.
  const pitchedAt = body.pitched_at ?? new Date().toISOString();
  const pitchId = crypto.randomUUID();

  const nervePayload = {
    id: pitchId,
    business_name: businessName,
    business_type: (lead.business_type as string | null) ?? null,
    sector: (lead.sector as string | null) ?? null,
    location: (lead.postcode as string | null) ?? null,
    lead_source: (lead.source_method as string | null) ?? null,
    demo_version: body.demo_version ?? null,
    outcome: body.outcome,
    contractor_id: auth.user_id,
    pitch_duration: body.pitch_duration_seconds ?? null,
    pitch_attempt_number: pitchAttemptNumber,
    consent_to_record: body.consent_to_record === true,
    decision_maker_present: body.decision_maker_present ?? null,
    demo_shown: body.demo_shown ?? null,
    interest_level: body.interest_level ?? null,
    demo_reaction: body.demo_reaction ?? null,
    agreed_price: body.agreed_price ?? null,
    payment_method: body.payment_method ?? null,
    best_followup_time: body.best_followup_time ?? null,
    agreed_next_step: body.agreed_next_step ?? null,
    gut_feel_close_pct: body.gut_feel_close_pct ?? null,
    first_response_phrase: body.first_response_phrase ?? null,
    competitor_mentioned: body.competitor_mentioned ?? null,
    gps_lat: body.gps_lat ?? null,
    gps_lng: body.gps_lng ?? null,
    notes: body.notes ?? null,
    objections: body.objections ?? [],
    date: pitchedAt,
  };

  // 4. Persist to Supabase pitch_attempts FIRST — beta resilience: even
  //    if NERVE is down we never lose the questionnaire payload. The
  //    raw_payload column carries the full body for retry. nerve_pitch_id
  //    + forwarded_at are populated below if the forward succeeds.
  const pitchedAtTs = pitchedAt;
  await sb.from('pitch_attempts').insert({
    id: pitchId,
    lead_id: assignment.lead_id,
    user_id: auth.user_id,
    assignment_id: params.id,
    outcome: body.outcome,
    raw_payload: nervePayload,
    pitched_at: pitchedAtTs,
  }).then(() => undefined, () => undefined);

  // 5. HMAC-sign and forward to NERVE. Failures don't bubble — the
  //    pitch_attempts row stays unforwarded for retry.
  const nerveUrl = process.env.NERVE_PITCH_URL ?? 'https://nerve.salespatch.co.uk/api/ingest/pitch';
  const nerveSecret = process.env.NERVE_PITCH_SECRET;

  let nerveJson: { ok?: boolean; pitchId?: string; qualityFlag?: string; error?: string } = {};
  let forwardOk = false;
  let forwardError: string | null = null;

  if (!nerveSecret) {
    forwardError = 'NERVE_PITCH_SECRET not configured';
  } else {
    const bodyJson = JSON.stringify(nervePayload);
    const signature = crypto.createHmac('sha256', nerveSecret).update(bodyJson).digest('hex');
    try {
      const nerveRes = await fetch(nerveUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-supabase-signature': signature },
        body: bodyJson,
      });
      nerveJson = await nerveRes.json().catch(() => ({}));
      if (nerveRes.ok && nerveJson.pitchId && !nerveJson.error) {
        forwardOk = true;
      } else {
        forwardError = nerveJson.error ?? `NERVE responded ${nerveRes.status}`;
      }
    } catch (e) {
      forwardError = `NERVE unreachable: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  if (forwardOk) {
    await sb
      .from('pitch_attempts')
      .update({
        nerve_pitch_id: nerveJson.pitchId,
        quality_flag: nerveJson.qualityFlag ?? null,
        forwarded_at: new Date().toISOString(),
        forward_error: null,
      })
      .eq('id', pitchId);
  } else {
    await sb
      .from('pitch_attempts')
      .update({ forward_error: forwardError })
      .eq('id', pitchId);
  }

  // 6. Cascade lead_assignments.status + record activity.
  const newStatus =
    body.outcome === 'closed_now' || body.outcome === 'closed_followup' ? 'sold' :
    body.outcome === 'rejected' ? 'rejected' :
    body.outcome === 'not_pitched' ? 'visited' :
    'pitched';

  await sb
    .from('lead_assignments')
    .update({
      status: newStatus,
      pitched_at: assignment.status === 'visited' ? pitchedAt : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id);

  await sb.from('sales_activity_log').insert({
    id: crypto.randomUUID(),
    user_id: auth.user_id,
    lead_id: assignment.lead_id,
    assignment_id: params.id,
    action: `pitch_${body.outcome}`,
    notes: JSON.stringify({ pitch_id: pitchId, nerve_pitch_id: nerveJson.pitchId, outcome: body.outcome }),
    location_lat: body.gps_lat ?? null,
    location_lng: body.gps_lng ?? null,
    created_at: new Date().toISOString(),
  });

  // Flat response (no `data:` envelope) — matches iOS APIClient.PitchResponse
  // shape and the mobile-api equivalent so a single iOS decoder works
  // against either backend. forwarded=false is the legitimate beta-
  // resilience case: the pitch is persisted in pitch_attempts but NERVE
  // forward failed; iOS shows a "queued" toast.
  return NextResponse.json({
    ok: true,
    pitch_id: pitchId,
    pitch_attempt_number: pitchAttemptNumber,
    forwarded: forwardOk,
    nerve_pitch_id: forwardOk ? nerveJson.pitchId : null,
    quality_flag: forwardOk ? (nerveJson.qualityFlag ?? 'unknown') : null,
    forward_error: forwardOk ? null : forwardError,
    new_status: newStatus,
  });
}
