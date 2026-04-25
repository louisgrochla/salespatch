'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  Section,
  PageHero,
  Eyebrow,
  Chip,
  EmptyState,
  CREAM,
  CREAM_DIM,
  CREAM_MUTED,
  SIGNAL,
  BG_CARD,
  BG_STRONG,
  BG_HOVER,
  LINE,
  LINE2,
  DISPLAY_FONT,
  MONO_FONT,
} from '@/lib/brand';

interface Lead {
  assignment_id: string;
  lead_id: string;
  business_name: string;
  business_type: string | null;
  postcode: string | null;
  phone: string | null;
  address: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  assignment_status: 'new' | 'visited' | 'pitched' | 'sold' | 'rejected';
}

const STATUS_COLOR: Record<Lead['assignment_status'], string> = {
  new: 'rgb(140 160 200)',
  visited: CREAM_DIM,
  pitched: 'rgb(220 150 80)',
  sold: SIGNAL,
  rejected: 'rgb(120 115 108)',
};

const FILTERS = ['all', 'new', 'visited', 'pitched'] as const;

export default function MapPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/leads')
      .then((r) => r.json())
      .then((j) => {
        setLeads((j.data ?? j ?? []).map((x: any) => x));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => (filter === 'all' ? leads : leads.filter((l) => l.assignment_status === filter)),
    [leads, filter],
  );

  // Group by postcode outward
  const areas = useMemo(() => {
    const byPc = new Map<string, Lead[]>();
    for (const l of filtered) {
      const pc = l.postcode ?? '—';
      const arr = byPc.get(pc) ?? [];
      arr.push(l);
      byPc.set(pc, arr);
    }
    return Array.from(byPc.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

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

  return (
    <div className="py-10">
      <PageHero
        eyebrow="Map"
        title="Your patch,"
        accent="drawn out."
        sub="Grouped by postcode so you can plan your walk. Tap an area to dive in, or a lead for the full brief."
        right={
          <>
            {filtered.length} LEAD{filtered.length === 1 ? '' : 'S'}
            <br />
            IN VIEW
          </>
        }
      />

      {/* Filter strip */}
      <div
        className="flex items-center gap-1 rounded-full p-1 mb-8 w-fit"
        style={{ background: BG_CARD, border: `1px solid ${LINE}` }}
      >
        {FILTERS.map((f) => {
          const count = f === 'all' ? leads.length : leads.filter((l) => l.assignment_status === f).length;
          return (
            <Chip key={f} active={filter === f} onClick={() => setFilter(f)} count={count}>
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </Chip>
          );
        })}
      </div>

      {/* Map visual — stylised for now; real Leaflet integration comes later */}
      <Card padding="none" className="mb-10 overflow-hidden" style={{ minHeight: 340 }}>
        <div
          className="relative"
          style={{
            minHeight: 340,
            backgroundImage:
              'linear-gradient(rgb(255 255 255 / 0.04) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.04) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            backgroundColor: BG_STRONG,
          }}
        >
          {/* Pins */}
          {filtered.slice(0, 12).map((l, i) => {
            const col = 2 + (i % 6) * 14 + (i % 3) * 2;
            const row = 15 + Math.floor(i / 6) * 30 + (i % 2) * 8;
            return (
              <button
                key={l.assignment_id}
                onClick={() => router.push(`/lead/${l.assignment_id}`)}
                className="absolute"
                style={{ left: `${col}%`, top: `${row}%`, cursor: 'pointer', background: 'transparent', border: 0 }}
              >
                <span
                  className="block rounded-full"
                  style={{
                    width: 14,
                    height: 14,
                    background: STATUS_COLOR[l.assignment_status],
                    boxShadow: `0 0 0 4px rgb(20 20 19), 0 0 0 5px ${STATUS_COLOR[l.assignment_status]}`,
                  }}
                />
                {l.assignment_status === 'new' && (
                  <span
                    className="block absolute rounded-full animate-ping"
                    style={{
                      width: 14,
                      height: 14,
                      top: 0,
                      left: 0,
                      background: STATUS_COLOR[l.assignment_status],
                      opacity: 0.4,
                    }}
                  />
                )}
              </button>
            );
          })}

          {/* Map attribution / hint */}
          <div
            className="absolute bottom-4 left-4 text-[10px] uppercase"
            style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED }}
          >
            / Schematic · Full map coming
          </div>
          <div
            className="absolute bottom-4 right-4 flex items-center gap-3 text-[10px] uppercase"
            style={{ fontFamily: MONO_FONT, letterSpacing: '0.12em', color: CREAM_MUTED }}
          >
            <LegendDot c={STATUS_COLOR.new} label="New" />
            <LegendDot c={STATUS_COLOR.visited} label="Visited" />
            <LegendDot c={STATUS_COLOR.pitched} label="Pitched" />
            <LegendDot c={STATUS_COLOR.sold} label="Sold" />
          </div>
        </div>
      </Card>

      {/* Areas */}
      <Section eyebrow="By postcode" title="Areas on your walk">
        {areas.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {areas.map(([pc, pins]) => (
              <Card key={pc} padding="none">
                <div
                  className="flex items-baseline justify-between px-5 py-4"
                  style={{ borderBottom: `1px solid ${LINE}` }}
                >
                  <span
                    className="text-[22px]"
                    style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, color: CREAM, letterSpacing: '-0.025em' }}
                  >
                    {pc}
                  </span>
                  <span
                    className="text-[11px] uppercase"
                    style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED }}
                  >
                    {pins.length} lead{pins.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div>
                  {pins.map((l, i) => (
                    <button
                      key={l.assignment_id}
                      onClick={() => router.push(`/lead/${l.assignment_id}`)}
                      className="w-full text-left px-5 py-3 flex items-center gap-3 transition-colors"
                      style={{
                        background: 'transparent',
                        border: 0,
                        cursor: 'pointer',
                        borderBottom: i === pins.length - 1 ? 'none' : `1px solid ${LINE2}`,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = BG_HOVER)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span
                        className="w-[9px] h-[9px] rounded-full flex-shrink-0"
                        style={{ background: STATUS_COLOR[l.assignment_status] }}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className="m-0 text-[14px] truncate"
                          style={{ color: CREAM, fontFamily: DISPLAY_FONT, fontWeight: 500 }}
                        >
                          {l.business_name}
                        </p>
                        <p className="m-0 text-[12px]" style={{ color: CREAM_DIM }}>
                          {l.business_type ?? '—'}
                          {l.google_rating ? ` · ★ ${l.google_rating}` : ''}
                        </p>
                      </div>
                      <span
                        className="text-[11px] uppercase"
                        style={{
                          fontFamily: MONO_FONT,
                          letterSpacing: '0.14em',
                          color: STATUS_COLOR[l.assignment_status],
                        }}
                      >
                        {l.assignment_status}
                      </span>
                    </button>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            eyebrow="Nothing in view"
            title="No leads match that filter."
            sub="Try flipping to All, or check back — new leads land throughout the day."
          />
        )}
      </Section>
    </div>
  );
}

function LegendDot({ c, label }: { c: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-[7px] h-[7px] rounded-full" style={{ background: c }} />
      {label}
    </span>
  );
}
