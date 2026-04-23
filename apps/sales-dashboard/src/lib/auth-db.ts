/**
 * Dual-mode user DB helpers.
 *
 * - Vercel / production: Supabase (when NEXT_PUBLIC_SUPABASE_URL is set).
 * - Local dev / Pi: SQLite via better-sqlite3 (shared mission-control.db).
 *
 * The rest of the authenticated API (/api/auth/me, /api/leads, /api/stats)
 * still uses SQLite directly — in production those routes will need their own
 * Supabase equivalent before the dashboard works end-to-end on Vercel. This
 * module is the minimum surface to make signup + login + demo work in both
 * modes so the app deploys cleanly and local dev keeps functioning.
 */

import { queryOne, run } from './db';
import { getSupabaseServer } from './supabase';

export interface SalesUserRow {
  id: string;
  name: string;
  pin_hash: string;
  email: string | null;
  phone: string | null;
  area_postcode: string | null;
  commission_rate: number;
  active: boolean;
  device_type?: string | null;
  last_active_at?: string | null;
  created_at?: string;
}

export function isSupabaseMode(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export async function findUserByName(name: string): Promise<SalesUserRow | null> {
  if (isSupabaseMode()) {
    const sb = getSupabaseServer();
    const { data } = await sb
      .from('sales_users')
      .select('id, name, pin_hash, email, phone, area_postcode, commission_rate, active, device_type, last_active_at, created_at')
      .ilike('name', name)
      .maybeSingle();
    if (!data) return null;
    return normaliseRow(data);
  }
  const row = queryOne<Record<string, unknown>>(
    `SELECT id, name, pin_hash, email, phone, area_postcode, commission_rate, active, device_type, last_active_at, created_at
       FROM sales_users WHERE LOWER(name) = LOWER(?)`,
    name,
  );
  return row ? normaliseRow(row) : null;
}

export async function createUser(input: {
  id: string;
  name: string;
  pin_hash: string;
  phone?: string | null;
  email?: string | null;
  area_postcode: string;
  commission_rate?: number;
}): Promise<void> {
  const payload = {
    id: input.id,
    name: input.name,
    pin_hash: input.pin_hash,
    phone: input.phone ?? null,
    email: input.email ?? null,
    area_postcode: input.area_postcode,
    commission_rate: input.commission_rate ?? 0.1,
    active: true,
    device_type: 'web' as const,
  };

  if (isSupabaseMode()) {
    const sb = getSupabaseServer();
    const { error } = await sb.from('sales_users').insert(payload);
    if (error) throw new Error(`Supabase insert failed: ${error.message}`);
    return;
  }

  run(
    `INSERT INTO sales_users
       (id, name, pin_hash, email, phone, area_postcode, commission_rate, active, device_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    payload.id,
    payload.name,
    payload.pin_hash,
    payload.email,
    payload.phone,
    payload.area_postcode,
    payload.commission_rate,
    payload.active ? 1 : 0,
    payload.device_type,
  );
}

export async function updateUserPinHash(userId: string, pinHash: string): Promise<void> {
  if (isSupabaseMode()) {
    const sb = getSupabaseServer();
    await sb.from('sales_users').update({ pin_hash: pinHash, active: true }).eq('id', userId);
    return;
  }
  run('UPDATE sales_users SET pin_hash = ?, active = 1 WHERE id = ?', pinHash, userId);
}

export async function touchLastActive(userId: string): Promise<void> {
  try {
    if (isSupabaseMode()) {
      const sb = getSupabaseServer();
      await sb.from('sales_users').update({ last_active_at: new Date().toISOString() }).eq('id', userId);
      return;
    }
    run("UPDATE sales_users SET last_active_at = datetime('now') WHERE id = ?", userId);
  } catch (e) {
    // Non-fatal — don't block login/signup on a timestamp update
    console.warn('[auth-db] touchLastActive failed:', e);
  }
}

// Normalise SQLite ints and Supabase booleans to the same shape.
function normaliseRow(row: Record<string, unknown>): SalesUserRow {
  return {
    id: row.id as string,
    name: row.name as string,
    pin_hash: row.pin_hash as string,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    area_postcode: (row.area_postcode as string | null) ?? null,
    commission_rate: typeof row.commission_rate === 'number' ? row.commission_rate : 0.1,
    active: row.active === true || row.active === 1,
    device_type: (row.device_type as string | null) ?? null,
    last_active_at: (row.last_active_at as string | null) ?? null,
    created_at: (row.created_at as string | undefined) ?? undefined,
  };
}
