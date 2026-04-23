'use client';

import { useEffect, useState } from 'react';
import {
  Card,
  Section,
  PageHero,
  Eyebrow,
  Row,
  StatCell,
  PrimaryButton,
  GhostButton,
  EmptyState,
  CREAM,
  CREAM_DIM,
  CREAM_MUTED,
  SIGNAL,
  BG_CARD,
  BG_STRONG,
  LINE,
  LINE2,
  DISPLAY_FONT,
  MONO_FONT,
} from '@/lib/brand';

interface PayoutHistoryRow {
  id: string;
  amount: number;
  business: string;
  date: string;
  status: 'available' | 'paid' | 'pending';
}

export default function PayoutsPage() {
  const [loading, setLoading] = useState(true);
  const [totalCommission, setTotalCommission] = useState(0);
  const [history, setHistory] = useState<PayoutHistoryRow[]>([]);

  useEffect(() => {
    Promise.all([fetch('/api/stats'), fetch('/api/leads')])
      .then(([s, l]) => Promise.all([s.json(), l.json()]))
      .then(([s, l]) => {
        const tot = s.data?.total_commission ?? s.total_commission ?? 0;
        setTotalCommission(tot);

        // Build history from sold leads
        const sold = ((l.data ?? l ?? []) as any[]).filter((x) => x.assignment_status === 'sold');
        const rows: PayoutHistoryRow[] = sold.map((x) => ({
          id: x.assignment_id,
          amount: x.commission_amount ?? 50,
          business: x.business_name,
          date: x.sold_at ?? x.assigned_at,
          status: 'available',
        }));
        setHistory(rows);
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

  const available = history.reduce((a, r) => a + (r.status === 'available' ? r.amount : 0), 0);
  const paidTotal = history.reduce((a, r) => a + (r.status === 'paid' ? r.amount : 0), 0);

  return (
    <div className="py-10">
      <PageHero
        eyebrow="Payouts"
        title="Your wallet,"
        accent="your move."
        sub="Every close lands here the moment the owner signs. Withdraw any time — we'll send it to your bank within the hour."
      />

      {/* Wallet hero */}
      <Card padding="lg" accent className="mb-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Eyebrow accent>Available balance</Eyebrow>
            <p
              className="m-0 text-[64px] leading-none tracking-[-0.04em]"
              style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, color: CREAM }}
            >
              <span style={{ color: SIGNAL }}>£</span>
              {available.toLocaleString()}
            </p>
            <p className="m-0 mt-3 text-[13px]" style={{ color: CREAM_DIM, fontFamily: MONO_FONT, letterSpacing: '0.08em' }}>
              {history.filter((r) => r.status === 'available').length} close{history.filter((r) => r.status === 'available').length === 1 ? '' : 's'} waiting to withdraw
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <PrimaryButton size="lg">Withdraw £{available}</PrimaryButton>
            <GhostButton size="lg" href="/settings">Bank details</GhostButton>
          </div>
        </div>
      </Card>

      {/* Stat ribbon */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 rounded-2xl overflow-hidden mb-10"
        style={{ background: BG_STRONG, border: `1px solid ${LINE}` }}
      >
        <StatCell label="Lifetime earned" value={totalCommission.toLocaleString()} prefix="£" accent />
        <StatCell label="Paid out" value={paidTotal.toLocaleString()} prefix="£" />
        <StatCell label="This month" value={history.filter(isThisMonth).reduce((a, r) => a + r.amount, 0).toLocaleString()} prefix="£" />
        <StatCell label="Closes" value={history.length} />
      </div>

      {/* History */}
      <Section eyebrow="Every close" title="Payout history">
        {history.length > 0 ? (
          <Card padding="none">
            <div
              className="grid grid-cols-[1fr_120px_110px_100px] gap-4 px-5 py-3 text-[10.5px] uppercase"
              style={{
                fontFamily: MONO_FONT,
                letterSpacing: '0.14em',
                color: CREAM_MUTED,
                borderBottom: `1px solid ${LINE}`,
              }}
            >
              <span>Deal</span>
              <span>When</span>
              <span>Status</span>
              <span>Amount</span>
            </div>
            {history.map((r, i) => (
              <div
                key={r.id}
                className="grid grid-cols-[1fr_120px_110px_100px] gap-4 px-5 py-4"
                style={{ borderBottom: i === history.length - 1 ? 'none' : `1px solid ${LINE2}` }}
              >
                <div>
                  <p
                    className="m-0 text-[14.5px]"
                    style={{ color: CREAM, fontFamily: DISPLAY_FONT, fontWeight: 500, letterSpacing: '-0.015em' }}
                  >
                    + {r.business} · close
                  </p>
                </div>
                <span className="text-[12.5px] self-center" style={{ color: CREAM_DIM, fontFamily: MONO_FONT, letterSpacing: '0.04em' }}>
                  {formatDate(r.date)}
                </span>
                <PayoutStatus status={r.status} />
                <span
                  className="text-[18px] self-center text-right"
                  style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, color: SIGNAL, letterSpacing: '-0.02em' }}
                >
                  +£{r.amount}
                </span>
              </div>
            ))}
          </Card>
        ) : (
          <EmptyState
            eyebrow="Nothing here yet"
            title="Your wallet is empty."
            sub="Close your first deal — the £50 lands here the moment the owner signs."
          />
        )}
      </Section>

      {/* Schedule + notes */}
      <div className="grid gap-6 md:grid-cols-2 mt-10">
        <Card padding="lg">
          <Eyebrow accent>Payout schedule</Eyebrow>
          <p
            className="m-0 mb-4 text-[18px]"
            style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, color: CREAM, letterSpacing: '-0.02em' }}
          >
            Any time, same day
          </p>
          <p className="m-0 text-[13.5px]" style={{ color: CREAM_DIM, lineHeight: 1.6 }}>
            Tap <b>Withdraw</b> and we send it via Faster Payments. Typically in your account within the hour; always
            the same day.
          </p>
        </Card>
        <Card padding="lg">
          <Eyebrow accent>No clawback</Eyebrow>
          <p
            className="m-0 mb-4 text-[18px]"
            style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, color: CREAM, letterSpacing: '-0.02em' }}
          >
            What you earn, you keep
          </p>
          <p className="m-0 text-[13.5px]" style={{ color: CREAM_DIM, lineHeight: 1.6 }}>
            Client cancels next month? Not your problem — your £50 stays paid. Churn is on us, not you.
          </p>
        </Card>
      </div>
    </div>
  );
}

function PayoutStatus({ status }: { status: PayoutHistoryRow['status'] }) {
  const tone =
    status === 'available'
      ? { c: SIGNAL, label: 'Available' }
      : status === 'paid'
      ? { c: CREAM_DIM, label: 'Paid' }
      : { c: 'rgb(220 150 80)', label: 'Pending' };
  return (
    <div
      className="inline-flex items-center gap-1.5 self-center text-[10.5px] uppercase"
      style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: tone.c }}
    >
      <span className="w-[6px] h-[6px] rounded-full" style={{ background: tone.c }} />
      {tone.label}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase();
}

function isThisMonth(r: PayoutHistoryRow) {
  const d = new Date(r.date);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}
