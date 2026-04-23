import { NextRequest, NextResponse } from 'next/server';
import { validateAdminToken } from '@/lib/admin-auth';
import { getSupabaseServer } from '@/lib/supabase';

const BUCKET = 'demo-sites';

/**
 * POST /api/admin/demo-upload
 *
 * Multipart body:
 *   file         — the demo HTML file
 *   slug?        — optional custom slug; if omitted, derived from filename
 *
 * Uploads the HTML to Supabase Storage at `{slug}.html` and returns
 * { slug, public_url } so the admin UI can stash the URL on the lead.
 * Safe to reuse the same slug — the upload uses upsert.
 */
export async function POST(req: NextRequest) {
  const token = req.cookies.get('admin_token')?.value;
  if (!token || !validateAdminToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get('file') as File | null;
  const rawSlug = (form.get('slug') as string | null)?.trim();

  if (!file) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }
  if (!/\.html?$/i.test(file.name)) {
    return NextResponse.json({ error: 'Expected an .html file' }, { status: 400 });
  }

  const slug =
    slugify(rawSlug || stripExt(file.name)) ||
    `demo-${Date.now().toString(36)}`;

  const sb = getSupabaseServer();

  const buf = Buffer.from(await file.arrayBuffer());
  const path = `${slug}.html`;

  // Ensure the bucket exists (idempotent).
  try {
    await sb.storage.createBucket(BUCKET, { public: true });
  } catch (_) {
    // Already exists — ignore.
  }

  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, {
    contentType: 'text/html; charset=utf-8',
    upsert: true,
  });
  if (upErr) {
    console.error('[demo-upload] upload failed', upErr);
    return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });
  }

  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({
    data: {
      slug,
      path,
      public_url: data.publicUrl,
      size_kb: Math.round(buf.length / 1024),
    },
  });
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/\.html?$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
function stripExt(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}
