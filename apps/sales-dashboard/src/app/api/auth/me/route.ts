import { NextRequest, NextResponse } from 'next/server';
import { resolveUserFromRequest } from '@/lib/auth';
import { findUserById } from '@/lib/auth-db';
import type { SalesUser } from '@/lib/types';

export async function GET(req: NextRequest) {
  const auth = resolveUserFromRequest(req);
  if (!auth) {
    return NextResponse.json(
      { error: 'Not authenticated', code: 'AUTH_REQUIRED' },
      { status: 401 },
    );
  }

  const row = await findUserById(auth.user_id);
  if (!row) {
    return NextResponse.json(
      { error: 'User not found', code: 'USER_NOT_FOUND' },
      { status: 404 },
    );
  }

  const user: SalesUser = {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    area_postcode: row.area_postcode,
    commission_rate: row.commission_rate,
    commission_amount_pence: row.commission_amount_pence,
    active: row.active,
    device_type: (row.device_type as SalesUser['device_type']) ?? null,
    last_active_at: row.last_active_at ?? null,
    created_at: row.created_at ?? '',
  };

  return NextResponse.json({ data: user });
}
