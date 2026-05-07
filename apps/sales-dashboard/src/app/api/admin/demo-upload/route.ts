import { NextRequest, NextResponse } from 'next/server';
import { validateAdminToken } from '@/lib/admin-auth';
import { getSupabaseServer } from '@/lib/supabase';

const BUCKET = 'demo-sites';
// 25 MB ceiling on the bucket — current largest demo is ~5 MB; keep headroom
// without blessing arbitrarily huge uploads.
const FILE_SIZE_LIMIT = 25 * 1024 * 1024;

/**
 * POST /api/admin/demo-upload
 *
 * Mints a signed upload URL so the browser can PUT the demo HTML straight to
 * Supabase Storage, bypassing Vercel's 4.5 MB serverless body limit.
 *
 * JSON body:
 *   filename     — the demo HTML filename (used for slug fallback + extension check)
 *   slug?        — optional explicit slug; if omitted, derived from filename
 *
 * Returns { slug, path, signed_url, token, public_url }.
 */
export async function POST(req: NextRequest) {
  const token = req.cookies.get('admin_token')?.value;
  if (!token || !validateAdminToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { filename?: unknown; slug?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected JSON body' }, { status: 400 });
  }

  const filename = typeof body.filename === 'string' ? body.filename.trim() : '';
  const rawSlug = typeof body.slug === 'string' ? body.slug.trim() : '';

  if (!filename) {
    return NextResponse.json({ error: 'filename is required' }, { status: 400 });
  }
  if (!/\.html?$/i.test(filename)) {
    return NextResponse.json({ error: 'Expected an .html file' }, { status: 400 });
  }

  const slug =
    slugify(rawSlug || stripExt(filename)) ||
    `demo-${Date.now().toString(36)}`;
  const path = `${slug}.html`;

  const sb = getSupabaseServer();

  // Ensure the bucket exists (idempotent). Pass fileSizeLimit so the bucket
  // is created with explicit headroom on first ever call.
  try {
    await sb.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: FILE_SIZE_LIMIT,
    });
  } catch (_) {
    // Already exists — ignore.
  }

  const { data: signed, error: signErr } = await sb.storage
    .from(BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (signErr || !signed) {
    console.error('[demo-upload] signed url failed', signErr);
    return NextResponse.json(
      { error: `Couldn't mint upload URL: ${signErr?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({
    data: {
      slug,
      path,
      signed_url: signed.signedUrl,
      token: signed.token,
      public_url: pub.publicUrl,
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
