'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Lead {
  id: string;
  business_name: string;
  business_type: string;
  postcode: string;
  phone: string;
  google_rating: number;
  google_review_count: number;
  status: 'new' | 'visited' | 'pitched' | 'sold' | 'rejected';
  has_demo_site: boolean;
  follow_up_date?: string;
  contact_name?: string;
  opening_hours: string[];
  services: string[];
}

interface Stats {
  queue: number;
  visited: number;
  pitched: number;
  sold: number;
  total_commission: number;
}

const FILTERS = ['all', 'new', 'visited', 'pitched', 'sold'] as const;
type Filter = typeof FILTERS[number];

// Brand tokens
const CREAM = 'rgb(248 244 238)';
const CREAM_DIM = 'rgb(210 200 185)';
const CREAM_MUTED = 'rgb(210 200 185 / 0.55)';
const SIGNAL = 'rgb(184 134 11)';
const BG_CARD = 'rgb(28 26 23)';
const BG_STRONG = 'rgb(30 28 25)';
const BG_HOVER = 'rgb(36 33 29)';
const LINE = 'rgb(255 255 255 / 0.08)';
const LINE2 = 'rgb(255 255 255 / 0.05)';

const DISPLAY_FONT = 'Geist, "Inter Tight", sans-serif';
const MONO_FONT = '"JetBrains Mono", ui-monospace, monospace';

const STATUS_DOT: Record<Lead['status'], string> = {
  new: 'rgb(140 160 200)',
  visited: CREAM_DIM,
  pitched: 'rgb(220 150 80)',
  sold: SIGNAL,
  rejected: 'rgb(120 115 108)',
};

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    Promise.all([fetch('/api/stats'), fetch('/api/leads'), fetch('/api/auth/me')])
      .then(([s, l, u]) => Promise.all([s.json(), l.json(), u.json()]))
      .then(([s, l, u]) => {
        // Stats API returns new_count/visited_count/etc — map to the shape the UI wants
        const raw = s.data ?? s ?? {};
        setStats({
          queue: raw.queue ?? raw.new_count ?? 0,
          visited: raw.visited ?? raw.visited_count ?? 0,
          pitched: raw.pitched ?? raw.pitched_count ?? 0,
          sold: raw.sold ?? raw.sold_count ?? 0,
          total_commission: raw.total_commission ?? 0,
        });
        setLeads(
          (l.data ?? l ?? []).map((x: any) => ({
            ...x,
            id: x.id ?? x.assignment_id ?? x.lead_id,
            status: x.status ?? x.assignment_status,
          })),
        );
        setUserName(u.data?.name ?? '');
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = Array.isArray(leads)
    ? filter === 'all'
      ? leads
      : leads.filter((l) => l.status === filter)
    : [];

  const totalEarned = stats?.total_commission ?? (stats?.sold ?? 0) * 50;

  if (loading) {
    return (
      <div className="pt-24 text-center text-[13px]" style={{ color: CREAM_MUTED, fontFamily: MONO_FONT, letterSpacing: '0.12em' }}>
        LOADING…
      </div>
    );
  }

  return (
    <div className="py-10 page-enter">
      {/* ── Header row ── */}
      <div className="flex items-start justify-between mb-8 gap-6 flex-wrap">
        <div>
          <div
            className="text-[10.5px] uppercase mb-3"
            style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: SIGNAL }}
          >
            / Today
          </div>
          <h1
            className="text-[44px] leading-[1.04] tracking-[-0.03em] font-medium m-0"
            style={{ fontFamily: DISPLAY_FONT, color: CREAM }}
          >
            Leads on your <span style={{ color: SIGNAL }}>patch.</span>
          </h1>
          <p className="text-[14px] mt-3" style={{ color: CREAM_DIM }}>
            {leads.length} assigned · £{totalEarned.toLocaleString()} earned this month
          </p>
        </div>
        <div
          className="text-right text-[11px] uppercase"
          style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED }}
        >
          {userName && (
            <>
              {userName}
              <br />
            </>
          )}
          {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
      </div>

      {/* ── Stats ribbon ── */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 rounded-2xl overflow-hidden mb-10"
        style={{ background: BG_STRONG, border: `1px solid ${LINE}` }}
      >
        <StatCell label="Queue" value={stats?.queue ?? 0} />
        <StatCell label="Visited" value={stats?.visited ?? 0} />
        <StatCell label="Pitched" value={stats?.pitched ?? 0} />
        <StatCell label="Sold" value={stats?.sold ?? 0} accent />
      </div>

      {/* ── Filter tabs ── */}
      <div
        className="flex items-center gap-1 rounded-full p-1 mb-6 w-fit"
        style={{ background: BG_CARD, border: `1px solid ${LINE}` }}
      >
        {FILTERS.map((f) => {
          const count = f === 'all' ? leads.length : leads.filter((l) => l.status === f).length;
          const active = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-4 py-2 rounded-full text-[13px] capitalize transition-colors"
              style={{
                background: active ? SIGNAL : 'transparent',
                color: active ? 'white' : CREAM_DIM,
                fontWeight: active ? 500 : 400,
                fontFamily: active ? DISPLAY_FONT : undefined,
              }}
            >
              {f === 'all' ? 'All' : f}
              <span
                className="text-[11px] ml-1.5"
                style={{
                  fontFamily: MONO_FONT,
                  color: active ? 'rgb(255 255 255 / 0.7)' : CREAM_MUTED,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Leads table ── */}
      {filtered.length > 0 ? (
        <div className="rounded-2xl overflow-hidden" style={{ background: BG_STRONG, border: `1px solid ${LINE}` }}>
          {/* Header */}
          <div
            className="grid grid-cols-[1fr_110px_90px_110px_70px] gap-4 px-5 py-3 text-[10.5px] uppercase"
            style={{
              fontFamily: MONO_FONT,
              letterSpacing: '0.14em',
              color: CREAM_MUTED,
              borderBottom: `1px solid ${LINE}`,
            }}
          >
            <span>Business</span>
            <span>Location</span>
            <span>Rating</span>
            <span>Status</span>
            <span />
          </div>

          {/* Rows */}
          {filtered.map((lead, i) => (
            <div
              key={lead.id}
              onClick={() => router.push(`/lead/${lead.id}`)}
              className="grid grid-cols-[1fr_110px_90px_110px_70px] gap-4 px-5 py-4 cursor-pointer transition-colors group"
              style={{
                borderBottom: i === filtered.length - 1 ? 'none' : `1px solid ${LINE2}`,
                animation: `rowIn 0.3s ease-out ${i * 0.04}s both`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = BG_HOVER)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {/* Business */}
              <div className="min-w-0">
                <p
                  className="text-[15px] truncate transition-colors"
                  style={{ color: CREAM, fontFamily: DISPLAY_FONT, fontWeight: 500, letterSpacing: '-0.015em' }}
                >
                  {lead.business_name}
                </p>
                <p className="text-[12px] mt-0.5" style={{ color: CREAM_DIM }}>
                  {lead.business_type}
                </p>
              </div>

              {/* Location */}
              <p className="text-[13px] self-center" style={{ color: CREAM_DIM, fontFamily: MONO_FONT }}>
                {lead.postcode}
              </p>

              {/* Rating */}
              <p className="text-[13px] self-center" style={{ color: CREAM_DIM }}>
                {lead.google_rating > 0 ? (
                  <>
                    {lead.google_rating}{' '}
                    <span style={{ color: CREAM_MUTED, fontFamily: MONO_FONT, fontSize: 11 }}>
                      ({lead.google_review_count})
                    </span>
                  </>
                ) : (
                  '—'
                )}
              </p>

              {/* Status */}
              <div className="self-center">
                <span
                  className="inline-flex items-center gap-2 text-[11.5px] uppercase"
                  style={{
                    fontFamily: MONO_FONT,
                    letterSpacing: '0.1em',
                    color: STATUS_DOT[lead.status],
                  }}
                >
                  <span
                    className={`w-[7px] h-[7px] rounded-full ${lead.status === 'new' ? 'pulse-dot' : ''}`}
                    style={{ background: STATUS_DOT[lead.status] }}
                  />
                  {lead.status}
                </span>
              </div>

              {/* Actions */}
              <div className="self-center text-right">
                {lead.phone && (
                  <a
                    href={`tel:${lead.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-[12px] uppercase"
                    style={{ color: SIGNAL, fontFamily: MONO_FONT, letterSpacing: '0.12em' }}
                  >
                    Call
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="rounded-2xl p-14 text-center"
          style={{ background: BG_STRONG, border: `1px solid ${LINE}` }}
        >
          <div
            className="text-[10.5px] uppercase mb-3"
            style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: SIGNAL }}
          >
            / Queue is quiet
          </div>
          <p
            className="text-[22px] m-0"
            style={{ fontFamily: DISPLAY_FONT, color: CREAM, fontWeight: 500, letterSpacing: '-0.02em' }}
          >
            No leads yet.
          </p>
          <p className="text-[14px] mt-2" style={{ color: CREAM_DIM }}>
            They appear here as the system assigns them to your patch.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className="px-6 py-6"
      style={{
        borderRight: `1px solid ${LINE}`,
        borderBottom: `1px solid ${LINE}`,
      }}
    >
      <p
        className="text-[34px] leading-none tracking-[-0.03em] m-0"
        style={{
          fontFamily: DISPLAY_FONT,
          fontWeight: 500,
          color: accent && value > 0 ? SIGNAL : CREAM,
        }}
      >
        {value}
      </p>
      <p
        className="text-[10.5px] uppercase mt-2 m-0"
        style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED }}
      >
        {label}
      </p>
    </div>
  );
}
