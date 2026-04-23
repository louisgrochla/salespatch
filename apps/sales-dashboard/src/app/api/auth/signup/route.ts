import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { queryOne, run } from '@/lib/db';
import { hashPin, createToken } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';

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
      return NextResponse.json({ error: 'PIN must be 4-6 digits' }, { status: 400 });
    }
    if (!area_postcode || area_postcode.length < 2) {
      return NextResponse.json({ error: 'Area postcode is required' }, { status: 400 });
    }

    // Uniqueness check — name is UNIQUE in the SQLite schema
    const existing = queryOne<{ id: string }>(
      'SELECT id FROM sales_users WHERE LOWER(name) = LOWER(?)',
      name,
    );
    if (existing) {
      return NextResponse.json({ error: 'That name is already taken' }, { status: 409 });
    }

    const id = randomUUID();
    const pin_hash = hashPin(pin);

    try {
      run(
        `INSERT INTO sales_users
           (id, name, pin_hash, email, phone, area_postcode, commission_rate, active, device_type)
         VALUES (?, ?, ?, ?, ?, ?, 0.1, 1, 'web')`,
        id,
        name,
        pin_hash,
        email,
        phone,
        area_postcode,
      );
    } catch (dbErr) {
      console.error('Signup: insert failed', dbErr);
      return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
    }

    const exp = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_DAYS * 24 * 60 * 60;
    const token = createToken({ user_id: id, name, exp });

    const response = NextResponse.json({
      data: {
        user: { id, name, phone, email, area_postcode, commission_rate: 0.1, active: true },
        token,
      },
    });

    response.cookies.set('sd_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: TOKEN_EXPIRY_DAYS * 24 * 60 * 60,
    });

    return response;
  } catch (err) {
    console.error('Signup route crashed:', err);
    return NextResponse.json(
      { error: 'Something went wrong creating your account. Please try again.', code: 'INTERNAL' },
      { status: 500 },
    );
  }
}
