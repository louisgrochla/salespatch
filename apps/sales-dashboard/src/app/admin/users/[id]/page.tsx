'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Card,
  Section,
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
  AMBER,
  BG_CARD,
  BG_STRONG,
  BG_HOVER,
  LINE,
  LINE2,
  DISPLAY_FONT,
  MONO_FONT,
  ERR,
} from '@/lib/brand';

interface UserStats {
  total_assigned: number;
  new: number;
  visited: number;
  pitched: number;
  sold: number;
  rejected: number;
  total_commission: number;
  avg_days_to_close: number | null;
  close_rate_pct: number | null;
  last_activity_at: string | null;
}

interface RecentLead {
  assignment_id: string;
  lead_id: string;
  status: 'new' | 'visited' | 'pitched' | 'sold' | 'rejected';
  assigned_at: string;
  visited_at: string | null;
  pitched_at: string | null;
  sold_at: string | null;
  rejected_at: string | null;
  follow_up_at: string | null;
  commission_amount: number | null;
  business_name: string;
  business_type: string | null;
  postcode: string | null;
  google_rating: number | null;
}

interface ActivityEvent {
  action: string;
  business_name: string;
  at: string;
  color: 'cream' | 'amber' | 'signal' | 'muted';
}

interface SoldPayout {
  assignment_id: string;
  business_name: string;
  sold_at: string | null;
  commission_amount_pence: number;
  payout_status: 'pending' | 'paid_out' | 'failed';
  payout_transfer_id: string | null;
  payout_paid_out_at: string | null;
  payout_failed_at: string | null;
  payout_failure_reason: string | null;
}

interface UserDetail {
  user: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    area_postcode: string | null;
    commission_rate: number;
    commission_amount_pence: number | null;
    stripe_connect_id: string | null;
    active: boolean;
    device_type: string | null;
    created_at: string;
    last_active_at: string | null;
  };
  stats: UserStats;
  recent_leads: RecentLead[];
  sold_payouts: SoldPayout[];
  recent_activity: ActivityEvent[];
}

const STATUS_COLOR: Record<RecentLead['status'], string> = {
  new: 'rgb(140 160 200)',
  visited: CREAM_DIM,
  pitched: AMBER,
  sold: SIGNAL,
  rejected: 'rgb(120 115 108)',
};

export default function AdminUserDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // Action state
  const [resetPinValue, setResetPinValue] = useState('');
  const [resetPinResult, setResetPinResult] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // Commission editing
  const [commissionPounds, setCommissionPounds] = useState<string>('');
  const [commissionSaved, setCommissionSaved] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/salespeople/${id}`);
    if (res.status === 404) {
      setErr('User not found.');
      setLoading(false);
      return;
    }
    const json = await res.json();
    if (!res.ok) {
      setErr(json.error ?? 'Failed to load.');
      setLoading(false);
      return;
    }
    setData(json.data);
    // Default the editable input to whatever's in the DB (or 150 if null).
    const pence = json.data?.user?.commission_amount_pence ?? 15000;
    setCommissionPounds(String(Math.round(pence) / 100));
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, [id]);

  const saveCommission = async () => {
    const pounds = parseFloat(commissionPounds);
    if (!Number.isFinite(pounds) || pounds < 0 || pounds > 1000) {
      setErr('Commission must be £0–£1000.');
      return;
    }
    const pence = Math.round(pounds * 100);
    setActionBusy(true);
    const res = await fetch(`/api/admin/salespeople/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commission_amount_pence: pence }),
    });
    setActionBusy(false);
    if (!res.ok) {
      const j = await res.json();
      setErr(j.error ?? 'Save failed.');
      return;
    }
    setCommissionSaved(true);
    setTimeout(() => setCommissionSaved(false), 2000);
    load();
  };

  const toggleActive = async () => {
    if (!data) return;
    setActionBusy(true);
    await fetch(`/api/admin/salespeople/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !data.user.active }),
    });
    setActionBusy(false);
    load();
  };

  // Per-row payout state — busy: in-flight, message keyed by assignment_id.
  const [payoutBusyId, setPayoutBusyId] = useState<string | null>(null);
  const [payoutMessage, setPayoutMessage] = useState<{ id: string; kind: 'ok' | 'err'; text: string } | null>(null);

  const payOut = async (assignmentId: string) => {
    if (!data) return;
    if (!data.user.stripe_connect_id) {
      setPayoutMessage({
        id: assignmentId,
        kind: 'err',
        text: 'Salesperson hasn’t finished Stripe Connect setup.',
      });
      return;
    }
    if (
      !window.confirm(
        'Send this commission via Stripe? This is real money — make sure the sale is genuine.',
      )
    ) {
      return;
    }
    setPayoutBusyId(assignmentId);
    setPayoutMessage(null);
    try {
      const res = await fetch('/api/payments/payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_assignment_id: assignmentId }),
      });
      const j = await res.json();
      if (!res.ok) {
        setPayoutMessage({
          id: assignmentId,
          kind: 'err',
          text: j.error ?? 'Payout failed',
        });
      } else {
        setPayoutMessage({
          id: assignmentId,
          kind: 'ok',
          text: `Paid £${(j.amount_pence / 100).toFixed(2)} · ${j.transfer_id}`,
        });
        load();
      }
    } catch (e) {
      setPayoutMessage({
        id: assignmentId,
        kind: 'err',
        text: e instanceof Error ? e.message : 'Network error',
      });
    } finally {
      setPayoutBusyId(null);
    }
  };

  const resetPin = async () => {
    if (!/^\d{4,6}$/.test(resetPinValue)) {
      setErr('PIN must be 4–6 digits.');
      return;
    }
    setActionBusy(true);
    const res = await fetch(`/api/admin/salespeople/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: resetPinValue }),
    });
    setActionBusy(false);
    const j = await res.json();
    if (!res.ok) {
      setErr(j.error ?? 'Reset failed.');
      return;
    }
    setResetPinResult(resetPinValue);
    setResetPinValue('');
    load();
  };

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

  if (err || !data) {
    return (
      <div className="py-16">
        <button
          onClick={() => router.push('/admin/users')}
          className="text-[11px] mb-6"
          style={{ color: SIGNAL, fontFamily: MONO_FONT, letterSpacing: '0.12em' }}
        >
          ← BACK TO BENCH
        </button>
        <EmptyState eyebrow="Lookup failed" title={err || 'User not found.'} />
      </div>
    );
  }

  const { user, stats, recent_leads, sold_payouts, recent_activity } = data;
  const pendingPayouts = (sold_payouts ?? []).filter((p) => p.payout_status === 'pending');
  const totalPendingPence = pendingPayouts.reduce((a, p) => a + p.commission_amount_pence, 0);
  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="py-10">
      {/* Back */}
      <button
        onClick={() => router.push('/admin/users')}
        className="text-[11px] mb-6 inline-flex items-center gap-2"
        style={{ color: CREAM_MUTED, fontFamily: MONO_FONT, letterSpacing: '0.14em' }}
      >
        ← BACK TO BENCH
      </button>

      {/* Identity hero */}
      <Card padding="lg" className="mb-10">
        <div className="flex items-start gap-5 flex-wrap">
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
            <div
              className="text-[10.5px] uppercase mb-1"
              style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: SIGNAL }}
            >
              Contractor
            </div>
            <p
              className="m-0 text-[36px] leading-tight"
              style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, color: CREAM, letterSpacing: '-0.03em' }}
            >
              {user.name}
            </p>
            <p
              className="m-0 mt-1 text-[12px] uppercase"
              style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED }}
            >
              {user.area_postcode ?? 'Patch · TBC'}
              {' · '}Joined {formatDate(user.created_at)}
              {user.last_active_at ? ` · Last active ${relTime(user.last_active_at)}` : ' · Never logged in'}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <span
              className="px-3 py-1.5 rounded-full text-[11px] uppercase self-start"
              style={{
                fontFamily: MONO_FONT,
                letterSpacing: '0.14em',
                color: user.active ? SIGNAL : CREAM_MUTED,
                background: user.active ? 'rgb(184 134 11 / 0.1)' : BG_CARD,
                border: `1px solid ${user.active ? 'rgb(184 134 11 / 0.3)' : LINE}`,
              }}
            >
              {user.active ? '● Active' : '○ Paused'}
            </span>
            <GhostButton onClick={toggleActive}>
              {user.active ? 'Pause account' : 'Reactivate'}
            </GhostButton>
          </div>
        </div>
      </Card>

      {/* Performance ribbon */}
      <div
        className="grid grid-cols-2 md:grid-cols-5 rounded-2xl overflow-hidden mb-10"
        style={{ background: BG_STRONG, border: `1px solid ${LINE}` }}
      >
        <StatCell label="Assigned" value={stats.total_assigned} />
        <StatCell label="Visited" value={stats.visited + stats.pitched + stats.sold + stats.rejected} />
        <StatCell label="Sold" value={stats.sold} accent />
        <StatCell label="Close rate" value={stats.close_rate_pct != null ? `${stats.close_rate_pct}%` : '—'} />
        <StatCell label="Earned" value={stats.total_commission.toLocaleString()} prefix="£" accent />
      </div>

      {/* Two columns */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* LEFT — leads + activity */}
        <div className="flex flex-col gap-8 min-w-0">
          {/* Status breakdown */}
          <Section eyebrow="Pipeline" title="Where their leads stand">
            <Card padding="lg">
              <StatusBreakdown stats={stats} />
            </Card>
          </Section>

          {/* Recent leads */}
          <Section eyebrow="Last 12" title="Recent leads">
            {recent_leads.length === 0 ? (
              <EmptyState
                eyebrow="No leads yet"
                title="They haven't been handed any leads."
                sub="Hand one out from /admin/leads — they'll see it on their dashboard immediately."
              />
            ) : (
              <Card padding="none">
                <div
                  className="grid grid-cols-[1fr_90px_110px_90px] gap-4 px-5 py-3 text-[10.5px] uppercase"
                  style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED, borderBottom: `1px solid ${LINE}` }}
                >
                  <span>Business</span>
                  <span>Postcode</span>
                  <span>Status</span>
                  <span>When</span>
                </div>
                {recent_leads.map((l, i) => (
                  <div
                    key={l.assignment_id}
                    onClick={() => router.push(`/lead/${l.assignment_id}`)}
                    className="grid grid-cols-[1fr_90px_110px_90px] gap-4 px-5 py-3.5 cursor-pointer transition-colors"
                    style={{ borderBottom: i === recent_leads.length - 1 ? 'none' : `1px solid ${LINE2}` }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = BG_HOVER)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div className="min-w-0">
                      <p
                        className="m-0 text-[14.5px] truncate"
                        style={{ color: CREAM, fontFamily: DISPLAY_FONT, fontWeight: 500, letterSpacing: '-0.015em' }}
                      >
                        {l.business_name}
                      </p>
                      <p className="m-0 text-[12px]" style={{ color: CREAM_DIM }}>
                        {l.business_type ?? '—'}
                      </p>
                    </div>
                    <span className="text-[13px] self-center" style={{ color: CREAM_DIM, fontFamily: MONO_FONT }}>
                      {l.postcode ?? '—'}
                    </span>
                    <span
                      className="self-center text-[11px] uppercase"
                      style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: STATUS_COLOR[l.status] }}
                    >
                      ● {l.status}
                    </span>
                    <span
                      className="text-[12px] self-center"
                      style={{ color: CREAM_MUTED, fontFamily: MONO_FONT, letterSpacing: '0.06em' }}
                    >
                      {relTime(latestEvent(l)) ?? '—'}
                    </span>
                  </div>
                ))}
              </Card>
            )}
          </Section>

          {/* Payouts */}
          <Section
            eyebrow="Money"
            title={
              pendingPayouts.length > 0
                ? `Owed: £${(totalPendingPence / 100).toFixed(2)} across ${pendingPayouts.length} sale${pendingPayouts.length === 1 ? '' : 's'}`
                : 'Payouts'
            }
          >
            {!user.stripe_connect_id && pendingPayouts.length > 0 && (
              <Card padding="md" className="mb-3">
                <p className="text-[13px] m-0" style={{ color: AMBER }}>
                  ⚠ This contractor hasn’t finished Stripe Connect onboarding —
                  payouts will fail until they do. Have them open the
                  <span style={{ fontFamily: MONO_FONT }}> Settings → Payout setup </span>
                  link in the iOS app.
                </p>
              </Card>
            )}
            {(sold_payouts ?? []).length === 0 ? (
              <EmptyState
                eyebrow="Nothing sold yet"
                title="No commissions to pay out."
                sub="Once a sale closes, it'll show here with a Pay button."
              />
            ) : (
              <Card padding="none">
                <div
                  className="grid grid-cols-[1fr_90px_120px_140px] gap-4 px-5 py-3 text-[10.5px] uppercase"
                  style={{
                    fontFamily: MONO_FONT,
                    letterSpacing: '0.14em',
                    color: CREAM_MUTED,
                    borderBottom: `1px solid ${LINE}`,
                  }}
                >
                  <span>Sale</span>
                  <span>Amount</span>
                  <span>State</span>
                  <span style={{ textAlign: 'right' }}>Action</span>
                </div>
                {(sold_payouts ?? []).map((p, i) => {
                  const last = i === (sold_payouts ?? []).length - 1;
                  const isPending = p.payout_status === 'pending';
                  const isPaid = p.payout_status === 'paid_out';
                  const isFailed = p.payout_status === 'failed';
                  const stateColor = isPaid ? SIGNAL : isFailed ? ERR : AMBER;
                  const stateLabel = isPaid ? '✓ Paid' : isFailed ? '⚠ Failed' : '● Pending';
                  const showMsg = payoutMessage && payoutMessage.id === p.assignment_id;
                  const busy = payoutBusyId === p.assignment_id;
                  return (
                    <div
                      key={p.assignment_id}
                      className="grid grid-cols-[1fr_90px_120px_140px] gap-4 px-5 py-3.5 items-center"
                      style={{ borderBottom: last ? 'none' : `1px solid ${LINE2}` }}
                    >
                      <div className="min-w-0">
                        <p
                          className="m-0 text-[14.5px] truncate"
                          style={{
                            color: CREAM,
                            fontFamily: DISPLAY_FONT,
                            fontWeight: 500,
                            letterSpacing: '-0.015em',
                          }}
                        >
                          {p.business_name}
                        </p>
                        <p
                          className="m-0 text-[11px]"
                          style={{
                            color: CREAM_MUTED,
                            fontFamily: MONO_FONT,
                            letterSpacing: '0.06em',
                          }}
                        >
                          Sold {relTime(p.sold_at) ?? '—'}
                          {p.payout_paid_out_at && ` · paid ${relTime(p.payout_paid_out_at)}`}
                        </p>
                        {showMsg && (
                          <p
                            className="m-0 mt-1 text-[11.5px]"
                            style={{
                              color: payoutMessage.kind === 'ok' ? SIGNAL : ERR,
                              fontFamily: MONO_FONT,
                              letterSpacing: '0.04em',
                            }}
                          >
                            {payoutMessage.text}
                          </p>
                        )}
                        {isFailed && p.payout_failure_reason && !showMsg && (
                          <p
                            className="m-0 mt-1 text-[11.5px]"
                            style={{ color: ERR, fontFamily: MONO_FONT, letterSpacing: '0.04em' }}
                          >
                            {p.payout_failure_reason}
                          </p>
                        )}
                      </div>
                      <span
                        className="text-[13px]"
                        style={{
                          color: CREAM,
                          fontFamily: MONO_FONT,
                          letterSpacing: '0.04em',
                        }}
                      >
                        £{(p.commission_amount_pence / 100).toFixed(2)}
                      </span>
                      <span
                        className="text-[11px] uppercase"
                        style={{
                          fontFamily: MONO_FONT,
                          letterSpacing: '0.14em',
                          color: stateColor,
                        }}
                      >
                        {stateLabel}
                      </span>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        {isPaid ? (
                          <span
                            className="text-[11px] uppercase"
                            style={{
                              fontFamily: MONO_FONT,
                              letterSpacing: '0.12em',
                              color: CREAM_MUTED,
                            }}
                          >
                            {p.payout_transfer_id?.slice(-8) ?? '—'}
                          </span>
                        ) : (
                          <PrimaryButton
                            onClick={() => payOut(p.assignment_id)}
                            disabled={busy || !user.stripe_connect_id}
                          >
                            {busy
                              ? 'Sending…'
                              : isFailed
                                ? `Retry · £${(p.commission_amount_pence / 100).toFixed(0)}`
                                : `Pay · £${(p.commission_amount_pence / 100).toFixed(0)}`}
                          </PrimaryButton>
                        )}
                      </div>
                    </div>
                  );
                })}
              </Card>
            )}
          </Section>

          {/* Activity timeline */}
          <Section eyebrow="Activity" title="Recent timeline">
            {recent_activity.length === 0 ? (
              <p className="text-[14px]" style={{ color: CREAM_DIM }}>
                Nothing yet.
              </p>
            ) : (
              <Card padding="lg">
                <ul className="m-0 p-0 list-none grid gap-3">
                  {recent_activity.map((a, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-4 pb-3"
                      style={{ borderBottom: i === recent_activity.length - 1 ? 'none' : `1px solid ${LINE2}` }}
                    >
                      <span
                        className="text-[10.5px] uppercase min-w-[88px]"
                        style={{
                          fontFamily: MONO_FONT,
                          letterSpacing: '0.14em',
                          color:
                            a.color === 'signal'
                              ? SIGNAL
                              : a.color === 'amber'
                              ? AMBER
                              : a.color === 'muted'
                              ? CREAM_MUTED
                              : CREAM_DIM,
                        }}
                      >
                        {a.action}
                      </span>
                      <span
                        className="flex-1 text-[14px] truncate"
                        style={{ color: CREAM, fontFamily: DISPLAY_FONT, fontWeight: 500 }}
                      >
                        {a.business_name}
                      </span>
                      <span
                        className="text-[11.5px]"
                        style={{ color: CREAM_MUTED, fontFamily: MONO_FONT, letterSpacing: '0.06em' }}
                      >
                        {relTime(a.at)?.toUpperCase() ?? '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </Section>
        </div>

        {/* RIGHT — identity + actions */}
        <div className="flex flex-col gap-5 min-w-0">
          <Card padding="lg">
            <Eyebrow accent>Identity</Eyebrow>
            <div className="grid gap-4">
              <Row label="Name" value={user.name} />
              <Row label="Phone" value={user.phone ?? '—'} mono />
              <Row label="Email" value={user.email ?? '—'} />
              <Row label="Patch postcode" value={user.area_postcode ?? '—'} mono />
              <Row label="Device" value={user.device_type ?? 'Not signed in yet'} />
              <Row label="Joined" value={formatDate(user.created_at)} mono />
              <Row label="Last active" value={user.last_active_at ? `${relTime(user.last_active_at)} · ${formatDate(user.last_active_at)}` : 'Never'} mono />
              {stats.avg_days_to_close != null && (
                <Row label="Avg days to close" value={`${stats.avg_days_to_close} days`} mono />
              )}
            </div>
          </Card>

          <Card padding="lg">
            <Eyebrow accent>Commission</Eyebrow>
            <p className="text-[13px] mb-4" style={{ color: CREAM_DIM, lineHeight: 1.55 }}>
              Flat amount paid to this contractor per confirmed sale (£299 setup
              charge). Applied at the moment Stripe confirms payment — never on
              QR scan.
            </p>
            <div className="flex gap-2 items-stretch mb-3">
              <div
                className="px-3 flex items-center text-[16px]"
                style={{
                  background: BG_CARD,
                  border: `1px solid ${LINE}`,
                  borderRight: 'none',
                  borderRadius: '12px 0 0 12px',
                  color: CREAM_DIM,
                }}
              >
                £
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={commissionPounds}
                onChange={(e) =>
                  setCommissionPounds(e.target.value.replace(/[^0-9.]/g, '').slice(0, 7))
                }
                placeholder="150"
                className="flex-1 px-3 py-3 text-[16px] outline-none"
                style={{
                  background: BG_CARD,
                  border: `1px solid ${LINE}`,
                  borderRadius: '0 12px 12px 0',
                  color: CREAM,
                  fontFamily: MONO_FONT,
                }}
              />
            </div>
            <PrimaryButton
              onClick={saveCommission}
              disabled={actionBusy || commissionPounds === ''}
            >
              {actionBusy ? 'Saving…' : commissionSaved ? '✓ Saved' : 'Update commission'}
            </PrimaryButton>
            <p
              className="text-[11.5px] mt-3"
              style={{ color: CREAM_MUTED, fontFamily: MONO_FONT, letterSpacing: '0.06em' }}
            >
              Currently {user.commission_amount_pence != null
                ? `£${(user.commission_amount_pence / 100).toFixed(2)}`
                : '£150.00 (default)'}{' '}
              per sale.
            </p>
          </Card>

          <Card padding="lg">
            <Eyebrow accent>Reset PIN</Eyebrow>
            <p className="text-[13px] mb-4" style={{ color: CREAM_DIM, lineHeight: 1.55 }}>
              Issue a new login PIN for this contractor. Old PIN stops working immediately.
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={resetPinValue}
              onChange={(e) => setResetPinValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="New PIN (4–6 digits)"
              className="w-full rounded-xl px-4 py-3 text-[15px] outline-none mb-3"
              style={{ background: BG_CARD, border: `1px solid ${LINE}`, color: CREAM, fontFamily: 'inherit' }}
            />
            <PrimaryButton onClick={resetPin} disabled={actionBusy || resetPinValue.length < 4}>
              {actionBusy ? 'Saving…' : 'Reset PIN'}
            </PrimaryButton>
            {resetPinResult && (
              <div
                className="mt-4 px-4 py-3 rounded-xl"
                style={{ background: 'rgb(184 134 11 / 0.1)', border: `1px solid rgb(184 134 11 / 0.35)` }}
              >
                <div
                  className="text-[10px] uppercase mb-1"
                  style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: SIGNAL }}
                >
                  New PIN — share once
                </div>
                <span
                  className="text-[20px]"
                  style={{ fontFamily: MONO_FONT, color: SIGNAL, letterSpacing: '0.12em' }}
                >
                  {resetPinResult}
                </span>
              </div>
            )}
            {err && (
              <p className="text-[12.5px] mt-3" style={{ color: ERR }}>
                {err}
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatusBreakdown({ stats }: { stats: UserStats }) {
  const total = Math.max(1, stats.total_assigned);
  const rows: Array<{ label: string; value: number; color: string }> = [
    { label: 'New', value: stats.new, color: 'rgb(140 160 200)' },
    { label: 'Visited', value: stats.visited, color: CREAM_DIM },
    { label: 'Pitched', value: stats.pitched, color: AMBER },
    { label: 'Sold', value: stats.sold, color: SIGNAL },
    { label: 'Rejected', value: stats.rejected, color: 'rgb(120 115 108)' },
  ];
  return (
    <ul className="m-0 p-0 list-none grid gap-3">
      {rows.map((r) => {
        const pct = (r.value / total) * 100;
        return (
          <li key={r.label} className="grid grid-cols-[100px_1fr_50px] gap-3 items-center">
            <span
              className="text-[11px] uppercase"
              style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: r.color }}
            >
              {r.label}
            </span>
            <div
              className="h-[8px] rounded-full overflow-hidden"
              style={{ background: 'rgb(255 255 255 / 0.06)' }}
            >
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: r.color }} />
            </div>
            <span
              className="text-[13px] text-right"
              style={{ fontFamily: MONO_FONT, color: r.value > 0 ? CREAM : CREAM_MUTED, letterSpacing: '0.04em' }}
            >
              {r.value}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function latestEvent(l: RecentLead): string | null {
  return l.sold_at ?? l.pitched_at ?? l.visited_at ?? l.rejected_at ?? l.assigned_at;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function relTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diffSec = Math.floor((Date.now() - t) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const days = Math.floor(diffSec / 86400);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
