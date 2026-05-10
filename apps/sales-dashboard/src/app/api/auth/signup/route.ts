import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { hashPin, createToken } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { findUserByName, createUser } from '@/lib/auth-db';
import {
  buildSalespersonEventId,
  postSalespersonEvent,
} from '@/lib/nerve-ingest';

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

    const existing = await findUserByName(name);
    if (existing) {
      return NextResponse.json({ error: 'That name is already taken' }, { status: 409 });
    }

    const id = randomUUID();
    const pin_hash = hashPin(pin);

    try {
      await createUser({ id, name, pin_hash, email, phone, area_postcode });
    } catch (dbErr) {
      console.error('Signup: insert failed', dbErr);
      return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
    }

    // B3: mirror the signup to NERVE for the per-SP timeline. Fire-and-
    // forget; the account is already created, the token is already issued,
    // NERVE failure must not surface to the new SP.
    const signupAt = new Date().toISOString();
    postSalespersonEvent({
      event_id: buildSalespersonEventId(id, 'signup', signupAt),
      user_id: id,
      type: 'signup',
      display_name: name,
      area_postcode,
      source: 'signup_handler',
      metadata: { has_email: !!email, has_phone: !!phone },
      occurred_at: signupAt,
    }).then((r) => {
      if (!r.ok) {
        console.warn('[nerve-ingest] signup event failed:', r.error);
      }
    });

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
