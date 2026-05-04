import { NextRequest, NextResponse } from 'next/server';
import { resolveUserFromRequest } from '@/lib/auth';
import { getSupabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// PATCH /api/leads/[id]/followup
//
// Schedule / clear a follow-up reminder on a lead assignment, plus
// optionally update the contact name/role. Originally used SQLite
// helpers which return empty on Vercel (ephemeral filesystem) — now
// goes straight to Supabase like every other lead-touching route.

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = resolveUserFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Auth required', code: 'AUTH_REQUIRED' }, { status: 401 });
  }

  let body: {
    follow_up_at?: string | null;
    follow_up_note?: string | null;
    contact_name?: string | null;
    contact_role?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const sb = getSupabaseServer();

  // Verify ownership.
  const { data: assignment, error: aErr } = await sb
    .from('lead_assignments')
    .select('id, user_id')
    .eq('id', params.id)
    .maybeSingle();
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
  if (!assignment) return NextResponse.json({ error: 'Lead not found', code: 'NOT_FOUND' }, { status: 404 });
  if (assignment.user_id !== auth.user_id) {
    return NextResponse.json({ error: 'Not your lead', code: 'FORBIDDEN' }, { status: 403 });
  }

  // Build patch — only include keys the client sent (allows clearing
  // by passing null explicitly).
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('follow_up_at' in body)   patch.follow_up_at   = body.follow_up_at   ?? null;
  if ('follow_up_note' in body) patch.follow_up_note = body.follow_up_note ?? null;
  if ('contact_name' in body)   patch.contact_name   = body.contact_name   ?? null;
  if ('contact_role' in body)   patch.contact_role   = body.contact_role   ?? null;

  if (Object.keys(patch).length === 1) {
    // Only updated_at — caller didn't actually pass anything.
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { error: uErr } = await sb
    .from('lead_assignments')
    .update(patch)
    .eq('id', params.id);
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
