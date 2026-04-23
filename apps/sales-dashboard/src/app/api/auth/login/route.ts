import { NextRequest, NextResponse } from 'next/server';
import { queryOne, run } from '@/lib/db';
import { hashPin, createToken } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import type { SalesUser } from '@/lib/types';

const TOKEN_EXPIRY_DAYS = 30;

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many requests, please try again later', code: 'RATE_LIMITED' },
        { status: 429 },
      );
    }

    const body = (await req.json()) as { name?: string; pin?: string };
    if (!body.name || !body.pin) {
      return NextResponse.json(
        { error: 'Name and PIN are required', code: 'MISSING_FIELDS' },
        { status: 400 },
      );
    }

    const name = body.name.trim();
    const pin = body.pin.trim();
    const pinHash = hashPin(pin);

    const row = queryOne<Record<string, unknown>>(
      `SELECT id, name, email, phone, area_postcode, commission_rate, device_type, last_active_at, created_at, active
         FROM sales_users
        WHERE LOWER(name) = LOWER(?) AND pin_hash = ? AND active = 1`,
      name,
      pinHash,
    );

    if (!row) {
      return NextResponse.json(
        { error: 'Invalid name or PIN', code: 'INVALID_CREDENTIALS' },
        { status: 401 },
      );
    }

    // Bump last_active_at
    try {
      run("UPDATE sales_users SET last_active_at = datetime('now') WHERE id = ?", row.id);
    } catch (e) {
      // Non-fatal — log and continue
      console.warn('[Auth] Failed to update last_active_at', e);
    }

    const user: SalesUser = {
      id: row.id as string,
      name: row.name as string,
      email: (row.email as string | null) ?? null,
      phone: (row.phone as string | null) ?? null,
      area_postcode: (row.area_postcode as string | null) ?? null,
      commission_rate: (row.commission_rate as number) ?? 0.1,
      active: !!row.active,
      device_type: (row.device_type as SalesUser['device_type']) ?? null,
      last_active_at: (row.last_active_at as string | null) ?? null,
      created_at: row.created_at as string,
    };

    const exp = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_DAYS * 24 * 60 * 60;
    const token = createToken({ user_id: user.id, name: user.name, exp });

    const response = NextResponse.json({ data: { user, token } });
    response.cookies.set('sd_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: TOKEN_EXPIRY_DAYS * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('[Auth] Login error:', err);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
