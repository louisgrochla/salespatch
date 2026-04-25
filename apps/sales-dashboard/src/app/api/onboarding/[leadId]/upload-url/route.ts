/**
 * /api/onboarding/[leadId]/upload-url  —  signed Supabase upload URL for photos.
 *
 * Body: { filename: string, content_type?: string }
 *
 * Returns: { upload_url: string, file_path: string, public_url: string }
 *
 * The customer uploads directly to Supabase Storage via the signed URL. The
 * frontend then POSTs to /api/onboarding/[leadId] with append_photo to record
 * the public URL on the response row.
 *
 * Pre-req: Supabase Storage bucket `customer-uploads` must exist (set up
 * via Supabase Dashboard once). Bucket can be private — the public_url uses
 * a signed download URL OR the bucket can be public and we use the public URL.
 * For the beta we recommend public bucket so contractors can view photos
 * inline in admin UI without re-signing.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const BUCKET = 'customer-uploads';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function safeFilename(raw: string): string {
  // Strip path traversal + reduce to alnum + a few safe chars.
  return raw
    .replace(/[\/\\]/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { leadId: string } },
) {
  const leadId = params.leadId;
  if (!leadId) return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });

  let body: { filename?: string; content_type?: string };
  try {
    body = (await req.json()) as { filename?: string; content_type?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const filename = typeof body.filename === 'string' ? safeFilename(body.filename) : null;
  if (!filename) {
    return NextResponse.json({ error: 'Missing filename' }, { status: 400 });
  }

  const supabase = getSupabase();
  // Confirm assignment exists.
  const { data: assignment, error: aErr } = await supabase
    .from('lead_assignments')
    .select('id')
    .eq('id', leadId)
    .maybeSingle();
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
  if (!assignment) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const filePath = `${leadId}/${Date.now()}_${filename}`;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(filePath);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Public URL assumes bucket is public-readable. If kept private, replace with
  // a signed download URL each time photos are read.
  const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(filePath).data.publicUrl;

  return NextResponse.json({
    upload_url: data.signedUrl,
    upload_token: data.token,
    file_path: filePath,
    public_url: publicUrl,
  });
}
