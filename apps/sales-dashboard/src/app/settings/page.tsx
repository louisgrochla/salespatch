'use client';

import { useState } from 'react';
import {
  Card,
  Section,
  PageHero,
  Eyebrow,
  Input,
  PrimaryButton,
  GhostButton,
  CREAM,
  CREAM_DIM,
  CREAM_MUTED,
  SIGNAL,
  BG_CARD,
  LINE,
  DISPLAY_FONT,
  MONO_FONT,
  ERR,
} from '@/lib/brand';

type SectionId = 'security' | 'area' | 'notifications' | 'payout' | 'contractor' | 'danger';

const SECTIONS: {
  id: SectionId;
  label: string;
  sub: string;
}[] = [
  { id: 'security', label: 'Security', sub: 'PIN, sessions, device access' },
  { id: 'area', label: 'Patch', sub: 'Postcodes you cover' },
  { id: 'notifications', label: 'Notifications', sub: 'How we nudge you about new leads' },
  { id: 'payout', label: 'Payouts', sub: 'Bank account, payout schedule' },
  { id: 'contractor', label: 'Contractor docs', sub: 'Right-to-work, agreement' },
  { id: 'danger', label: 'Close account', sub: 'Wipe your data, permanent' },
];

export default function SettingsPage() {
  const [open, setOpen] = useState<SectionId>('security');

  const [postcodes, setPostcodes] = useState('E8, E9, N16');
  const [emailNotif, setEmailNotif] = useState(true);
  const [pushNotif, setPushNotif] = useState(true);
  const [smsNotif, setSmsNotif] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<'bank' | 'manual'>('bank');

  return (
    <div className="py-10">
      <PageHero
        eyebrow="Settings"
        title="Your account,"
        accent="your way."
        sub="Tune how you work, when we contact you, and where your payouts land."
      />

      <div className="grid gap-4 md:grid-cols-[300px_minmax(0,1fr)]">
        {/* Side list */}
        <div className="flex flex-col gap-2">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setOpen(s.id)}
              className="text-left px-4 py-3.5 rounded-xl transition-colors"
              style={{
                background: open === s.id ? BG_CARD : 'transparent',
                border: open === s.id ? `1px solid ${LINE}` : '1px solid transparent',
                cursor: 'pointer',
              }}
            >
              <div
                className="text-[14.5px]"
                style={{
                  color: open === s.id ? CREAM : CREAM_DIM,
                  fontFamily: DISPLAY_FONT,
                  fontWeight: 500,
                  letterSpacing: '-0.015em',
                }}
              >
                {s.label}
              </div>
              <div className="text-[12.5px] mt-0.5" style={{ color: CREAM_MUTED }}>
                {s.sub}
              </div>
            </button>
          ))}
        </div>

        {/* Panel */}
        <div>
          {open === 'security' && (
            <Card padding="lg">
              <Eyebrow accent>Security</Eyebrow>
              <h2
                className="text-[24px] tracking-[-0.025em] font-medium m-0 mb-2"
                style={{ fontFamily: DISPLAY_FONT, color: CREAM }}
              >
                Change your PIN
              </h2>
              <p className="text-[14px] mb-6" style={{ color: CREAM_DIM }}>
                Your PIN is how you log in. Pick something memorable, not your birthday.
              </p>
              <Input label="Current PIN" type="password" placeholder="••••" maxLength={6} inputMode="numeric" />
              <Input label="New PIN" type="password" placeholder="••••" maxLength={6} inputMode="numeric" />
              <Input label="Confirm new PIN" type="password" placeholder="••••" maxLength={6} inputMode="numeric" />
              <div className="flex gap-3 mt-2">
                <PrimaryButton>Update PIN</PrimaryButton>
                <GhostButton>Cancel</GhostButton>
              </div>

              <div className="mt-10 pt-8" style={{ borderTop: `1px solid ${LINE}` }}>
                <Eyebrow>Active sessions</Eyebrow>
                <div className="grid gap-2">
                  <SessionRow device="Safari on iPhone" where="Hackney · this device" when="now" current />
                  <SessionRow device="Chrome on Mac" where="Hackney" when="2 days ago" />
                </div>
                <div className="mt-4">
                  <GhostButton size="sm">Sign out other sessions</GhostButton>
                </div>
              </div>
            </Card>
          )}

          {open === 'area' && (
            <Card padding="lg">
              <Eyebrow accent>Patch</Eyebrow>
              <h2
                className="text-[24px] tracking-[-0.025em] font-medium m-0 mb-2"
                style={{ fontFamily: DISPLAY_FONT, color: CREAM }}
              >
                Where do you walk?
              </h2>
              <p className="text-[14px] mb-6" style={{ color: CREAM_DIM }}>
                Comma-separated outward postcodes. We'll only assign you leads within these areas.
              </p>
              <Input
                label="Postcodes"
                value={postcodes}
                onChange={(e) => setPostcodes(e.target.value)}
                placeholder="E8, E9, N16"
                hint="Use outward codes only — E8 not E8 3BA."
              />
              <PrimaryButton>Save patch</PrimaryButton>
            </Card>
          )}

          {open === 'notifications' && (
            <Card padding="lg">
              <Eyebrow accent>Notifications</Eyebrow>
              <h2
                className="text-[24px] tracking-[-0.025em] font-medium m-0 mb-2"
                style={{ fontFamily: DISPLAY_FONT, color: CREAM }}
              >
                How should we reach you?
              </h2>
              <p className="text-[14px] mb-6" style={{ color: CREAM_DIM }}>
                New leads, follow-ups, payout confirmations — pick the channels you trust.
              </p>
              <Toggle label="Push notifications" sub="Instant — for new leads and pitch timers." value={pushNotif} onChange={setPushNotif} />
              <Toggle label="Email" sub="Daily digest and payout receipts." value={emailNotif} onChange={setEmailNotif} />
              <Toggle label="SMS" sub="Urgent follow-ups only. We don't spam." value={smsNotif} onChange={setSmsNotif} />
            </Card>
          )}

          {open === 'payout' && (
            <Card padding="lg">
              <Eyebrow accent>Payouts</Eyebrow>
              <h2
                className="text-[24px] tracking-[-0.025em] font-medium m-0 mb-2"
                style={{ fontFamily: DISPLAY_FONT, color: CREAM }}
              >
                Where your money goes
              </h2>
              <p className="text-[14px] mb-6" style={{ color: CREAM_DIM }}>
                £50 lands the moment an owner signs. Withdraw any time.
              </p>
              <div className="grid gap-3 md:grid-cols-2 mb-6">
                <MethodCard
                  label="Bank transfer"
                  sub="Faster Payments — usually same day."
                  active={payoutMethod === 'bank'}
                  onClick={() => setPayoutMethod('bank')}
                />
                <MethodCard
                  label="Manual request"
                  sub="Email us a payout request — for one-offs."
                  active={payoutMethod === 'manual'}
                  onClick={() => setPayoutMethod('manual')}
                />
              </div>
              {payoutMethod === 'bank' && (
                <>
                  <Input label="Account holder name" placeholder="Jane Smith" defaultValue="Demo Account" />
                  <Input label="Sort code" placeholder="04-00-04" maxLength={8} />
                  <Input label="Account number" placeholder="12345678" maxLength={8} inputMode="numeric" />
                  <PrimaryButton>Save bank details</PrimaryButton>
                </>
              )}
            </Card>
          )}

          {open === 'contractor' && (
            <Card padding="lg">
              <Eyebrow accent>Contractor docs</Eyebrow>
              <h2
                className="text-[24px] tracking-[-0.025em] font-medium m-0 mb-2"
                style={{ fontFamily: DISPLAY_FONT, color: CREAM }}
              >
                Right-to-work & agreement
              </h2>
              <p className="text-[14px] mb-6" style={{ color: CREAM_DIM }}>
                We verify your right to work before your first payout. Upload once, done for good.
              </p>
              <DocRow title="Right-to-work document" status="pending" />
              <DocRow title="Contractor agreement" status="signed" />
              <div className="mt-4 flex gap-3">
                <PrimaryButton>Upload document</PrimaryButton>
                <GhostButton href="/site/legal-contractor-agreement.html">Read agreement</GhostButton>
              </div>
            </Card>
          )}

          {open === 'danger' && (
            <Card padding="lg">
              <div
                className="text-[10px] uppercase mb-3"
                style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: ERR }}
              >
                / Danger zone
              </div>
              <h2
                className="text-[24px] tracking-[-0.025em] font-medium m-0 mb-2"
                style={{ fontFamily: DISPLAY_FONT, color: CREAM }}
              >
                Close your account
              </h2>
              <p className="text-[14px] mb-6" style={{ color: CREAM_DIM, lineHeight: 1.6 }}>
                Closes your account and wipes your data. Closed deals stay paid out. This can't be undone — email
                hello@salesflow.co first and we'll do it with you.
              </p>
              <button
                className="px-5 py-3 rounded-full text-[14px]"
                style={{ background: 'transparent', color: ERR, border: `1px solid ${ERR}`, fontWeight: 500 }}
              >
                Close account
              </button>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionRow({
  device,
  where,
  when,
  current = false,
}: {
  device: string;
  where: string;
  when: string;
  current?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between px-4 py-3 rounded-xl"
      style={{ background: BG_CARD, border: `1px solid ${LINE}` }}
    >
      <div>
        <div className="text-[14px]" style={{ color: CREAM, fontFamily: DISPLAY_FONT, fontWeight: 500 }}>
          {device}
        </div>
        <div className="text-[12px] mt-0.5" style={{ color: CREAM_MUTED, fontFamily: MONO_FONT, letterSpacing: '0.06em' }}>
          {where.toUpperCase()} · {when.toUpperCase()}
        </div>
      </div>
      {current && (
        <span
          className="text-[10px] uppercase px-2.5 py-1 rounded-full"
          style={{
            color: SIGNAL,
            background: 'rgb(184 134 11 / 0.1)',
            border: `1px solid rgb(184 134 11 / 0.3)`,
            fontFamily: MONO_FONT,
            letterSpacing: '0.12em',
          }}
        >
          This device
        </span>
      )}
    </div>
  );
}

function Toggle({
  label,
  sub,
  value,
  onChange,
}: {
  label: string;
  sub: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className="flex items-center justify-between px-5 py-4 rounded-xl mb-3"
      style={{ background: BG_CARD, border: `1px solid ${LINE}` }}
    >
      <div className="min-w-0 pr-4">
        <div className="text-[14.5px]" style={{ color: CREAM, fontFamily: DISPLAY_FONT, fontWeight: 500 }}>
          {label}
        </div>
        <div className="text-[12.5px] mt-0.5" style={{ color: CREAM_DIM }}>
          {sub}
        </div>
      </div>
      <button
        onClick={() => onChange(!value)}
        className="w-12 h-7 rounded-full flex-shrink-0 transition-colors relative"
        style={{ background: value ? SIGNAL : 'rgb(255 255 255 / 0.1)', cursor: 'pointer', border: 0 }}
      >
        <span
          className="absolute top-0.5 w-6 h-6 rounded-full transition-all"
          style={{
            background: 'white',
            left: value ? 'calc(100% - 26px)' : 2,
            boxShadow: '0 1px 3px rgb(0 0 0 / 0.3)',
          }}
        />
      </button>
    </div>
  );
}

function MethodCard({
  label,
  sub,
  active,
  onClick,
}: {
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left p-4 rounded-xl transition-colors"
      style={{
        background: active ? 'rgb(184 134 11 / 0.1)' : BG_CARD,
        border: `1px solid ${active ? SIGNAL : LINE}`,
        cursor: 'pointer',
      }}
    >
      <div className="text-[14.5px]" style={{ color: CREAM, fontFamily: DISPLAY_FONT, fontWeight: 500 }}>
        {label}
      </div>
      <div className="text-[12.5px] mt-0.5" style={{ color: CREAM_DIM }}>
        {sub}
      </div>
    </button>
  );
}

function DocRow({ title, status }: { title: string; status: 'pending' | 'signed' | 'verified' }) {
  const tone = status === 'pending' ? { c: 'rgb(220 150 80)', t: 'Awaiting upload' } : { c: SIGNAL, t: status === 'signed' ? 'Signed' : 'Verified' };
  return (
    <div
      className="flex items-center justify-between px-4 py-3.5 rounded-xl mb-2"
      style={{ background: BG_CARD, border: `1px solid ${LINE}` }}
    >
      <span style={{ color: CREAM, fontFamily: DISPLAY_FONT, fontWeight: 500 }}>{title}</span>
      <span
        className="text-[11px] uppercase px-2.5 py-1 rounded-full"
        style={{ color: tone.c, border: `1px solid ${tone.c}`, fontFamily: MONO_FONT, letterSpacing: '0.12em' }}
      >
        {tone.t}
      </span>
    </div>
  );
}
