'use client';

import { useState } from 'react';
import {
  Card,
  Section,
  PageHero,
  Eyebrow,
  StatCell,
  PrimaryButton,
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

interface Referral {
  id: string;
  name: string;
  joined: string;
  status: 'pending' | 'active' | 'churned';
  closes: number;
  earned: number;
}

const MOCK: Referral[] = [
  { id: '1', name: 'Tomi A.', joined: '2 weeks ago', status: 'active', closes: 14, earned: 140 },
  { id: '2', name: 'Kenji L.', joined: '3 weeks ago', status: 'active', closes: 9, earned: 90 },
  { id: '3', name: 'Priya M.', joined: '1 week ago', status: 'pending', closes: 0, earned: 0 },
  { id: '4', name: 'Alex R.', joined: '1 month ago', status: 'active', closes: 22, earned: 220 },
];

export default function ReferralsPage() {
  const [copied, setCopied] = useState(false);
  const [data] = useState<Referral[]>(MOCK);

  const code = 'DEMO-HACKNEY-4X';
  const link = `salesflow.co/r/${code}`;

  const totalEarned = data.reduce((a, r) => a + r.earned, 0);
  const activeCount = data.filter((r) => r.status === 'active').length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`https://${link}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <div className="py-10">
      <PageHero
        eyebrow="Referrals"
        title="Bring a mate,"
        accent="earn on every close."
        sub="You get £10 for every deal your referrals close, for as long as they're on the platform. No cap."
      />

      <div
        className="grid grid-cols-2 md:grid-cols-4 rounded-2xl overflow-hidden mb-10"
        style={{ background: BG_STRONG, border: `1px solid ${LINE}` }}
      >
        <StatCell label="Referred" value={data.length} />
        <StatCell label="Active" value={activeCount} />
        <StatCell label="Total closes" value={data.reduce((a, r) => a + r.closes, 0)} />
        <StatCell label="Earned from referrals" value={totalEarned.toLocaleString()} prefix="£" accent />
      </div>

      <Card padding="lg" accent className="mb-10">
        <Eyebrow accent>Your invite link</Eyebrow>
        <p
          className="text-[22px] m-0 mb-2"
          style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, color: CREAM, letterSpacing: '-0.02em' }}
        >
          Share this link. Everyone wins.
        </p>
        <p className="text-[14px] mb-6" style={{ color: CREAM_DIM, lineHeight: 1.6 }}>
          Your friend gets fast-tracked through the application. You get £10 for every close they make — paid the
          same day as their commission.
        </p>
        <div
          className="flex items-center gap-3 p-1.5 pl-5 rounded-full mb-4 flex-wrap"
          style={{ background: BG_CARD, border: `1px solid ${LINE}` }}
        >
          <span className="flex-1 min-w-0 truncate" style={{ fontFamily: MONO_FONT, color: CREAM, letterSpacing: '0.05em' }}>
            {link}
          </span>
          <PrimaryButton size="sm" onClick={copy}>
            {copied ? '✓ Copied' : 'Copy link'}
          </PrimaryButton>
        </div>
        <div className="flex items-center gap-2 text-[12px]" style={{ color: CREAM_MUTED, fontFamily: MONO_FONT, letterSpacing: '0.12em' }}>
          <span>CODE</span>
          <span style={{ color: SIGNAL }}>{code}</span>
        </div>
      </Card>

      <Section eyebrow="People you've referred" title="Your network">
        {data.length > 0 ? (
          <Card padding="none">
            <div
              className="grid grid-cols-[1fr_120px_100px_110px] gap-4 px-5 py-3 text-[10.5px] uppercase"
              style={{
                fontFamily: MONO_FONT,
                letterSpacing: '0.14em',
                color: CREAM_MUTED,
                borderBottom: `1px solid ${LINE}`,
              }}
            >
              <span>Name</span>
              <span>Joined</span>
              <span>Closes</span>
              <span>Earned</span>
            </div>
            {data.map((r, i) => (
              <div
                key={r.id}
                className="grid grid-cols-[1fr_120px_100px_110px] gap-4 px-5 py-4"
                style={{ borderBottom: i === data.length - 1 ? 'none' : `1px solid ${LINE2}` }}
              >
                <div>
                  <p
                    className="m-0 text-[14.5px]"
                    style={{ color: CREAM, fontFamily: DISPLAY_FONT, fontWeight: 500, letterSpacing: '-0.015em' }}
                  >
                    {r.name}
                  </p>
                  <StatusPill status={r.status} />
                </div>
                <span className="text-[13px] self-center" style={{ color: CREAM_DIM }}>
                  {r.joined}
                </span>
                <span className="text-[13px] self-center" style={{ color: CREAM_DIM, fontFamily: MONO_FONT }}>
                  {r.closes}
                </span>
                <span
                  className="text-[14px] self-center"
                  style={{ fontFamily: DISPLAY_FONT, color: r.earned > 0 ? SIGNAL : CREAM_DIM, fontWeight: 500 }}
                >
                  £{r.earned}
                </span>
              </div>
            ))}
          </Card>
        ) : (
          <EmptyState
            eyebrow="No referrals yet"
            title="Your network lives here."
            sub="Share the link above — when they close their first deal, you'll see them in this table."
          />
        )}
      </Section>

      <Section eyebrow="How it works" title="The maths" className="mt-14">
        <div className="grid gap-4 md:grid-cols-3">
          <StepCard n="01" title="You share your link" sub="DMs, texts, a pinned post — however your mate sees it." />
          <StepCard n="02" title="They apply & get approved" sub="Right-to-work in the UK is the gate. That's it." />
          <StepCard n="03" title="You earn £10 per close" sub="Forever. No tier, no clawback, no sunset." />
        </div>
      </Section>
    </div>
  );
}

function StepCard({ n, title, sub }: { n: string; title: string; sub: string }) {
  return (
    <Card padding="lg">
      <div
        className="text-[10.5px] uppercase mb-4"
        style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: SIGNAL }}
      >
        {n}
      </div>
      <p
        className="text-[18px] m-0 mb-2"
        style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, color: CREAM, letterSpacing: '-0.02em' }}
      >
        {title}
      </p>
      <p className="text-[13.5px] m-0" style={{ color: CREAM_DIM, lineHeight: 1.55 }}>
        {sub}
      </p>
    </Card>
  );
}

function StatusPill({ status }: { status: Referral['status'] }) {
  const tone =
    status === 'active'
      ? { c: SIGNAL, label: 'Active' }
      : status === 'pending'
      ? { c: 'rgb(220 150 80)', label: 'Pending' }
      : { c: CREAM_MUTED, label: 'Churned' };
  return (
    <div
      className="inline-flex items-center gap-1.5 mt-1 text-[10.5px] uppercase"
      style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: tone.c }}
    >
      <span className="w-[6px] h-[6px] rounded-full" style={{ background: tone.c }} />
      {tone.label}
    </div>
  );
}
