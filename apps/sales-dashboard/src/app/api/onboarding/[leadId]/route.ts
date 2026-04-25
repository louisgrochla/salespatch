/**
 * /api/onboarding/[leadId]  —  upsert customer onboarding answers.
 *
 * Public, no auth. Anyone with the leadId URL can fill the form (which is
 * the design — Stripe redirects the customer here post-payment with that
 * URL). Form auto-saves on every keystroke, debounced client-side.
 *
 * Body shape — any subset of the columns:
 *   {
 *     contact_phone?: string,
 *     top_changes?: string,
 *     has_existing_domain?: boolean,
 *     existing_domain?: string,
 *     domain_preferences?: string[],
 *     anything_else?: string,
 *     append_photo?: { url: string, filename: string, content_type?: string },
 *     mark_completed?: true,
 *   }
 *
 * Returns the latest persisted row.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

interface PhotoEntry {
  url: string;
  filename: string;
  content_type?: string;
  uploaded_at: string;
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function trimOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function arrayOfStrings(v: unknown, max: number): string[] | null {
  if (!Array.isArray(v)) return null;
  const cleaned = v
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .slice(0, max);
  return cleaned;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { leadId: string } },
) {
  const leadId = params.leadId;
  if (!leadId) {
    return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Confirm assignment exists. Don't gate on status='sold' — Stripe might
  // redirect before our webhook lands, and a few seconds of "open before sold"
  // is fine for capturing answers (the row is keyed on the same lead_id).
  const { data: assignment, error: aErr } = await supabase
    .from('lead_assignments')
    .select('id')
    .eq('id', leadId)
    .maybeSingle();
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
  if (!assignment) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  // Build the upsert payload. Only allow whitelisted fields.
  const update: Record<string, unknown> = { lead_assignment_id: leadId };
  if ('contact_phone' in body) update.contact_phone = trimOrNull(body.contact_phone);
  if ('top_changes' in body) update.top_changes = trimOrNull(body.top_changes);
  if ('anything_else' in body) update.anything_else = trimOrNull(body.anything_else);
  if ('existing_domain' in body) update.existing_domain = trimOrNull(body.existing_domain);
  if (typeof body.has_existing_domain === 'boolean') {
    update.has_existing_domain = body.has_existing_domain;
  }
  if ('domain_preferences' in body) {
    const prefs = arrayOfStrings(body.domain_preferences, 5);
    update.domain_preferences = prefs && prefs.length > 0 ? prefs : null;
  }
  if (body.mark_completed === true) {
    update.completed_at = new Date().toISOString();
  }

  // Photo append: read existing array, push, write back.
  if (body.append_photo && typeof body.append_photo === 'object') {
    const p = body.append_photo as Record<string, unknown>;
    const url = trimOrNull(p.url);
    const filename = trimOrNull(p.filename);
    if (url && filename) {
      const { data: existing } = await supabase
        .from('lead_onboarding_responses')
        .select('photos')
        .eq('lead_assignment_id', leadId)
        .maybeSingle();
      const current = (existing?.photos as PhotoEntry[] | undefined) ?? [];
      const next: PhotoEntry[] = [
        ...current,
        {
          url,
          filename,
          content_type: typeof p.content_type === 'string' ? p.content_type : undefined,
          uploaded_at: new Date().toISOString(),
        },
      ];
      update.photos = next;
    }
  }

  const { data, error } = await supabase
    .from('lead_onboarding_responses')
    .upsert(update, { onConflict: 'lead_assignment_id' })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { leadId: string } },
) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('lead_onboarding_responses')
    .select('*')
    .eq('lead_assignment_id', params.leadId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? null });
}
