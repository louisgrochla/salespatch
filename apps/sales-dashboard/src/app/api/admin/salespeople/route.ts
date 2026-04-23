import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { validateAdminToken } from '@/lib/admin-auth';
import { hashPin } from '@/lib/auth';
import { findUserByName, createUser } from '@/lib/auth-db';
import { getSupabaseServer } from '@/lib/supabase';

function requireAdmin(req: NextRequest): NextResponse | null {
  const token = req.cookies.get('admin_token')?.value;
  if (!token || !validateAdminToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from('sales_users')
    .select('id, name, phone, area_postcode, active, created_at, last_active_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

/**
 * POST /api/admin/salespeople — create a new sales_user (a friend's account).
 * Body: { name, pin, area_postcode, phone?, email? }
 * Returns the created user so the admin can share the login credentials.
 */
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = (await req.json()) as {
    name?: string;
    pin?: string;
    area_postcode?: string;
    phone?: string;
    email?: string;
  };

  const name = body.name?.trim();
  const pin = body.pin?.trim();
  const area_postcode = body.area_postcode?.trim().toUpperCase();
  const phone = body.phone?.trim() || null;
  const email = body.email?.trim() || null;

  if (!name || name.length < 2) {
    return NextResponse.json({ error: 'Name must be at least 2 characters' }, { status: 400 });
  }
  if (!pin || !/^\d{4,6}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN must be 4–6 digits' }, { status: 400 });
  }
  if (!area_postcode || area_postcode.length < 2) {
    return NextResponse.json({ error: 'Postcode is required' }, { status: 400 });
  }

  const existing = await findUserByName(name);
  if (existing) {
    return NextResponse.json({ error: 'That name is already taken' }, { status: 409 });
  }

  const id = randomUUID();
  try {
    await createUser({
      id,
      name,
      pin_hash: hashPin(pin),
      phone,
      email,
      area_postcode,
    });
  } catch (err) {
    console.error('[admin/salespeople POST] create failed', err);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      id,
      name,
      phone,
      area_postcode,
      active: true,
      pin, // returned ONCE so admin can share it — not stored plaintext
    },
  });
}
