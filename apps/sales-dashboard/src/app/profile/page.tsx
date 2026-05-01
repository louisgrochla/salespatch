'use client';

import { useEffect, useState } from 'react';
import {
  Card,
  Section,
  PageHero,
  Eyebrow,
  Row,
  StatCell,
  GhostButton,
  PrimaryButton,
  CREAM,
  CREAM_DIM,
  CREAM_MUTED,
  SIGNAL,
  BG_STRONG,
  LINE,
  LINE2,
  DISPLAY_FONT,
  MONO_FONT,
} from '@/lib/brand';

interface UserMe {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  area_postcode: string | null;
  commission_rate: number;
  commission_amount_pence: number | null;
  created_at: string;
  last_active_at: string | null;
}

interface ActivityRow {
  action: string;
  at: string;
  business?: string;
}

export default function ProfilePage() {
  const [me, setMe] = useState<UserMe | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetch('/api/auth/me'), fetch('/api/stats'), fetch('/api/leads')])
      .then(([u, s, l]) => Promise.all([u.json(), s.json(), l.json()]))
      .then(([u, s, l]) => {
        setMe(u.data ?? null);
        setStats(s.data ?? s);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div
        className="pt-24 text-center text-[13px]"
        style={{ color: CREAM_MUTED, fontFamily: MONO_FONT, letterSpacing: '0.14em' }}
      >
        LOADING…
      </div>
    );
  }

  const name = me?.name ?? 'Contractor';
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const joined = me?.created_at ? new Date(me.created_at) : null;
  const totalCommission = stats?.total_commission ?? stats?.data?.total_commission ?? 0;
  const soldCount = stats?.sold_count ?? stats?.sold ?? 0;
  const totalAssigned = stats?.total_assigned ?? 0;
  const closeRate = totalAssigned > 0 ? Math.round((soldCount / totalAssigned) * 100) : 0;

  const activity: ActivityRow[] = [
    { action: 'Closed deal', business: "Vinyl Hollow", at: '7 days ago' },
    { action: 'Pitched', business: 'The Well Bakery', at: '1 day ago' },
    { action: 'Visited', business: "Rosa's Barbers", at: '1 day ago' },
    { action: 'Assigned', business: "Mario's Deli", at: 'today' },
  ];

  return (
    <div className="py-10">
      <PageHero eyebrow="Profile" title="Your patch," accent="your record." />

      {/* Identity card */}
      <Card padding="lg" className="mb-10">
        <div className="flex items-center gap-5 flex-wrap">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              background: 'rgb(184 134 11 / 0.12)',
              border: `1px solid rgb(184 134 11 / 0.35)`,
              color: SIGNAL,
              fontFamily: DISPLAY_FONT,
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: '-0.02em',
            }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="m-0 text-[28px] leading-tight"
              style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, color: CREAM, letterSpacing: '-0.025em' }}
            >
              {name}
            </p>
            <p
              className="m-0 mt-1 text-[12px] uppercase"
              style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED }}
            >
              {me?.area_postcode ? `Patch · ${me.area_postcode}` : 'Patch · TBC'}
              {joined && (
                <>
                  {' '}· Joined {joined.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                </>
              )}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <GhostButton href="/settings">Edit profile</GhostButton>
            <PrimaryButton href="/payouts">View payouts</PrimaryButton>
          </div>
        </div>
      </Card>

      {/* Performance ribbon */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 rounded-2xl overflow-hidden mb-10"
        style={{ background: BG_STRONG, border: `1px solid ${LINE}` }}
      >
        <StatCell label="Leads assigned" value={totalAssigned} />
        <StatCell label="Deals closed" value={soldCount} accent />
        <StatCell label="Close rate" value={`${closeRate}%`} />
        <StatCell label="Total earned" value={totalCommission.toLocaleString()} prefix="£" accent />
      </div>

      {/* Two column: Contact + Recent activity */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card padding="lg">
          <Eyebrow accent>Contact</Eyebrow>
          <div className="grid gap-4">
            <Row label="Phone" value={me?.phone ?? '—'} />
            <Row label="Email" value={me?.email ?? '—'} />
            <Row label="Patch postcode" value={me?.area_postcode ?? '—'} mono />
            <Row
              label="Commission"
              value={`£${Math.round((me?.commission_amount_pence ?? 15000) / 100)} per close`}
            />
          </div>
        </Card>

        <Card padding="lg">
          <Eyebrow accent>Recent activity</Eyebrow>
          <ul className="m-0 p-0 list-none grid gap-3">
            {activity.map((a, i) => (
              <li
                key={i}
                className="flex items-center gap-4 pb-3"
                style={{ borderBottom: i === activity.length - 1 ? 'none' : `1px solid ${LINE2}` }}
              >
                <span
                  className="text-[10.5px] uppercase min-w-[90px]"
                  style={{
                    fontFamily: MONO_FONT,
                    letterSpacing: '0.14em',
                    color: a.action === 'Closed deal' ? SIGNAL : CREAM_DIM,
                  }}
                >
                  {a.action}
                </span>
                <span className="flex-1 text-[14px]" style={{ color: CREAM, fontFamily: DISPLAY_FONT, fontWeight: 500 }}>
                  {a.business ?? '—'}
                </span>
                <span className="text-[11.5px]" style={{ color: CREAM_MUTED, fontFamily: MONO_FONT, letterSpacing: '0.08em' }}>
                  {a.at.toUpperCase()}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
