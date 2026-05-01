import { createHash, createHmac, randomUUID } from 'crypto';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { queryOne, run } from './db';
import type { AuthPayload, SalesUser } from './types';

const SD_SECRET = process.env.SD_SECRET || 'sales-dashboard-dev-secret-change-in-production';
const COOKIE_NAME = 'sd_session';
const TOKEN_EXPIRY_DAYS = 30;

// ---------------------------------------------------------------------------
// PIN Hashing
// ---------------------------------------------------------------------------

export function hashPin(pin: string): string {
  return createHash('sha256').update(`${SD_SECRET}:${pin}`).digest('hex');
}

// ---------------------------------------------------------------------------
// Token Creation & Validation
// ---------------------------------------------------------------------------

export function createToken(payload: AuthPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', SD_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function validateToken(token: string): AuthPayload | null {
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;

  const expectedSig = createHmac('sha256', SD_SECRET).update(data).digest('base64url');
  if (sig !== expectedSig) return null;

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString()) as AuthPayload;
    if (payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Resolve User — checks cookie first, then Bearer header (mobile)
// ---------------------------------------------------------------------------

export function resolveUserFromRequest(req: NextRequest): AuthPayload | null {
  // 1. Try cookie (web)
  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (cookie) {
    const payload = validateToken(cookie);
    if (payload) return payload;
  }

  // 2. Try Bearer token (mobile)
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7);
    const payload = validateToken(token);
    if (payload) return payload;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Server Component helper — reads from cookies()
// ---------------------------------------------------------------------------

export function getSessionUser(): AuthPayload | null {
  const cookieStore = cookies();
  const cookie = cookieStore.get(COOKIE_NAME)?.value;
  if (!cookie) return null;
  return validateToken(cookie);
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export function loginUser(name: string, pin: string): { user: SalesUser; token: string } | null {
  const pinHash = hashPin(pin);

  const row = queryOne<Record<string, unknown>>(
    'SELECT * FROM sales_users WHERE name = ? AND pin_hash = ? AND active = 1',
    name, pinHash,
  );

  if (!row) return null;

  const user: SalesUser = {
    id: row.id as string,
    name: row.name as string,
    email: row.email as string | null,
    phone: row.phone as string | null,
    area_postcode: row.area_postcode as string | null,
    commission_rate: (row.commission_rate as number) ?? 0.1,
    commission_amount_pence:
      typeof row.commission_amount_pence === 'number' ? row.commission_amount_pence : null,
    active: true,
    device_type: (row.device_type as SalesUser['device_type']) ?? null,
    last_active_at: row.last_active_at as string | null,
    created_at: row.created_at as string,
  };

  const exp = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_DAYS * 24 * 60 * 60;
  const token = createToken({ user_id: user.id, name: user.name, exp });

  // Update last active
  run('UPDATE sales_users SET last_active_at = datetime(\'now\') WHERE id = ?', user.id);

  return { user, token };
}

// ---------------------------------------------------------------------------
// Cookie management
// ---------------------------------------------------------------------------

export function setSessionCookie(token: string): void {
  const cookieStore = cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: TOKEN_EXPIRY_DAYS * 24 * 60 * 60,
    path: '/',
  });
}

export function clearSessionCookie(): void {
  const cookieStore = cookies();
  cookieStore.delete(COOKIE_NAME);
}

// ---------------------------------------------------------------------------
// Create a sales user (admin utility)
// ---------------------------------------------------------------------------

export function createSalesUser(
  name: string,
  pin: string,
  opts?: { email?: string; phone?: string; area_postcode?: string; commission_rate?: number },
): SalesUser {
  const id = randomUUID();
  const pinHash = hashPin(pin);

  run(
    `INSERT INTO sales_users (id, name, pin_hash, email, phone, area_postcode, commission_rate)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id, name, pinHash, opts?.email ?? null, opts?.phone ?? null,
    opts?.area_postcode ?? null, opts?.commission_rate ?? 0.1,
  );

  return {
    id,
    name,
    email: opts?.email ?? null,
    phone: opts?.phone ?? null,
    area_postcode: opts?.area_postcode ?? null,
    commission_rate: opts?.commission_rate ?? 0.1,
    // Falls back to the DB default (15000) on the next /api/auth/me read.
    commission_amount_pence: null,
    active: true,
    device_type: null,
    last_active_at: null,
    created_at: new Date().toISOString(),
  };
}
