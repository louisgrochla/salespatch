'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
interface Lead {
  assignment_id: string;
  assignment_status: 'new' | 'visited' | 'pitched' | 'sold' | 'rejected';
  assigned_at: string;
  lead_id: string;

  business_name: string;
  business_type: string | null;
  address: string | null;
  postcode: string | null;
  phone: string | null;
  email: string | null;
  website_url: string | null;

  google_rating: number | null;
  google_review_count: number | null;
  has_website: boolean;
  website_quality_score: number | null;

  description: string | null;
  services: string[];
  pain_points: string[];
  opening_hours: string[];
  best_reviews: Array<{ author: string; rating: number; text: string }>;

  brand_colours: Record<string, string> | null;
  hero_headline: string | null;
  cta_text: string | null;
  trust_badges: string[];
  avoid_topics: string[];

  demo_site_domain: string | null;
  demo_site_qa_score: number | null;
  has_demo_site: boolean;

  follow_up_at: string | null;
  follow_up_note: string | null;
  contact_name: string | null;
  contact_role: string | null;
  commission_amount: number | null;

  visited_at: string | null;
  pitched_at: string | null;
  sold_at: string | null;
}

// -----------------------------------------------------------------------------
// Brand tokens (match AppShell + apply page)
// -----------------------------------------------------------------------------
const CREAM = 'rgb(248 244 238)';
const CREAM_DIM = 'rgb(210 200 185)';
const CREAM_MUTED = 'rgb(210 200 185 / 0.55)';
const SIGNAL = 'rgb(184 134 11)';
const SIGNAL_DIM = 'rgb(184 134 11 / 0.6)';
const BG_CARD = 'rgb(28 26 23)';
const BG_STRONG = 'rgb(30 28 25)';
const BG_HOVER = 'rgb(36 33 29)';
const LINE = 'rgb(255 255 255 / 0.08)';
const LINE2 = 'rgb(255 255 255 / 0.05)';

const DISPLAY_FONT = 'Geist, "Inter Tight", sans-serif';
const MONO_FONT = '"JetBrains Mono", ui-monospace, monospace';

const STATUS_COLOR: Record<Lead['assignment_status'], string> = {
  new: 'rgb(140 160 200)',
  visited: CREAM_DIM,
  pitched: 'rgb(220 150 80)',
  sold: SIGNAL,
  rejected: 'rgb(120 115 108)',
};

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/leads/${id}`)
      .then((r) => r.json().then((j) => ({ status: r.status, body: j })))
      .then(({ status, body }) => {
        if (cancelled) return;
        if (status === 404) {
          setNotFound(true);
        } else if (body.data) {
          setLead(body.data);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

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

  if (notFound || !lead) {
    return (
      <div className="py-16">
        <button
          onClick={() => router.push('/dashboard')}
          className="text-[13px] mb-6"
          style={{ color: SIGNAL, fontFamily: MONO_FONT, letterSpacing: '0.12em' }}
        >
          ← BACK TO LEADS
        </button>
        <div
          className="rounded-2xl p-14 text-center"
          style={{ background: BG_STRONG, border: `1px solid ${LINE}` }}
        >
          <p style={{ fontFamily: DISPLAY_FONT, fontSize: 22, fontWeight: 500, color: CREAM }}>
            Lead not found.
          </p>
          <p className="mt-2 text-[14px]" style={{ color: CREAM_DIM }}>
            It may have been reassigned, or the link is stale.
          </p>
        </div>
      </div>
    );
  }

  const since = relTime(lead.assigned_at);
  const statusColor = STATUS_COLOR[lead.assignment_status];

  return (
    <div className="py-8 pb-32 page-enter">
      {/* ── Back ── */}
      <button
        onClick={() => router.push('/dashboard')}
        className="text-[11px] mb-6 inline-flex items-center gap-2 hover:opacity-80 transition-opacity"
        style={{ color: CREAM_MUTED, fontFamily: MONO_FONT, letterSpacing: '0.14em' }}
      >
        ← BACK TO LEADS
      </button>

      {/* ── Hero row ── */}
      <div className="flex items-start justify-between gap-6 mb-10 flex-wrap">
        <div className="min-w-0 flex-1">
          <div
            className="inline-flex items-center gap-2 mb-3 text-[10.5px] uppercase"
            style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: statusColor }}
          >
            <span
              className="w-[7px] h-[7px] rounded-full"
              style={{ background: statusColor }}
            />
            {lead.assignment_status}
            <span style={{ color: CREAM_MUTED }}>· ASSIGNED {since.toUpperCase()}</span>
            {lead.assignment_status === 'sold' && lead.commission_amount && (
              <span style={{ color: SIGNAL }}>· +£{lead.commission_amount} EARNED</span>
            )}
          </div>
          <h1
            className="text-[52px] leading-[1.02] tracking-[-0.035em] font-medium m-0"
            style={{ fontFamily: DISPLAY_FONT, color: CREAM }}
          >
            {lead.business_name}
          </h1>
          <p className="text-[15px] mt-3" style={{ color: CREAM_DIM }}>
            {[lead.business_type, lead.address].filter(Boolean).join(' · ')}
          </p>
        </div>

        {/* Rating block */}
        {lead.google_rating != null && lead.google_rating > 0 && (
          <div
            className="rounded-2xl px-6 py-5 min-w-[180px]"
            style={{ background: BG_STRONG, border: `1px solid ${LINE}` }}
          >
            <div
              className="text-[10.5px] uppercase mb-2"
              style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED }}
            >
              Google rating
            </div>
            <div className="flex items-baseline gap-2">
              <span
                style={{
                  fontFamily: DISPLAY_FONT,
                  fontSize: 34,
                  fontWeight: 500,
                  letterSpacing: '-0.03em',
                  color: CREAM,
                  lineHeight: 1,
                }}
              >
                {lead.google_rating.toFixed(1)}
              </span>
              <span style={{ color: SIGNAL, fontSize: 18 }}>★</span>
            </div>
            <div
              className="mt-1 text-[11px]"
              style={{ fontFamily: MONO_FONT, color: CREAM_MUTED, letterSpacing: '0.08em' }}
            >
              {lead.google_review_count ?? 0} reviews
            </div>
          </div>
        )}
      </div>

      {/* ── Description (if present) ── */}
      {lead.description && (
        <div
          className="mb-10 rounded-2xl p-6"
          style={{
            background: 'rgb(184 134 11 / 0.08)',
            border: `1px solid rgb(184 134 11 / 0.25)`,
            borderLeft: `3px solid ${SIGNAL}`,
          }}
        >
          <div
            className="text-[10px] uppercase mb-2"
            style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: SIGNAL }}
          >
            / The brief
          </div>
          <p className="text-[15px] leading-[1.55] m-0" style={{ color: CREAM }}>
            {lead.description}
          </p>
        </div>
      )}

      {/* ── Two-column grid ── */}
      <div className="grid gap-8" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}>
        {/* LEFT — the pitch */}
        <div className="flex flex-col gap-8 min-w-0">
          {/* Pain points / talking hooks */}
          {lead.pain_points.length > 0 && (
            <Section title="What to say at the door" eyebrow="Pitch hooks">
              <div className="grid gap-3">
                {lead.pain_points.map((p, i) => (
                  <PitchCard key={i} index={i + 1} text={p} />
                ))}
              </div>
            </Section>
          )}

          {/* Demo site preview */}
          {lead.has_demo_site && lead.demo_site_domain && (
            <Section title="Their site, ready to show" eyebrow="Demo preview">
              <div
                className="rounded-2xl overflow-hidden"
                style={{ background: BG_STRONG, border: `1px solid ${LINE}` }}
              >
                <div
                  className="flex items-center gap-3 px-5 py-3"
                  style={{
                    borderBottom: `1px solid ${LINE}`,
                    fontFamily: MONO_FONT,
                    fontSize: 11,
                    color: CREAM_MUTED,
                  }}
                >
                  <span className="flex gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: 'rgb(255 255 255 / 0.12)' }} />
                    <span className="w-2 h-2 rounded-full" style={{ background: 'rgb(255 255 255 / 0.12)' }} />
                    <span className="w-2 h-2 rounded-full" style={{ background: 'rgb(255 255 255 / 0.12)' }} />
                  </span>
                  <span
                    className="flex-1 px-3 py-1 rounded-full"
                    style={{ background: BG_CARD, border: `1px solid ${LINE2}`, letterSpacing: '0.04em' }}
                  >
                    🔒 {lead.demo_site_domain}
                  </span>
                  {lead.demo_site_qa_score != null && (
                    <span style={{ color: SIGNAL, letterSpacing: '0.12em' }}>
                      QA {lead.demo_site_qa_score}/100
                    </span>
                  )}
                </div>
                <div
                  className="h-[260px] flex flex-col items-center justify-center gap-4 p-8"
                  style={{
                    background:
                      lead.brand_colours?.primary
                        ? `linear-gradient(135deg, ${lead.brand_colours.primary}, ${lead.brand_colours.accent ?? lead.brand_colours.primary})`
                        : 'linear-gradient(135deg, rgb(184 134 11), rgb(60 40 25))',
                  }}
                >
                  {lead.hero_headline && (
                    <p
                      className="text-center m-0"
                      style={{
                        fontFamily: DISPLAY_FONT,
                        fontSize: 32,
                        fontWeight: 500,
                        letterSpacing: '-0.025em',
                        color: 'white',
                        textShadow: '0 2px 24px rgb(0 0 0 / 0.3)',
                      }}
                    >
                      {lead.hero_headline}
                    </p>
                  )}
                  {lead.cta_text && (
                    <span
                      className="px-5 py-2.5 rounded-full text-[13px]"
                      style={{ background: 'rgb(20 20 19 / 0.85)', color: 'white', fontWeight: 500 }}
                    >
                      {lead.cta_text}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-3 flex gap-3 flex-wrap">
                <a
                  href={`https://${lead.demo_site_domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-5 py-3 rounded-full text-[14px] inline-flex items-center gap-2"
                  style={{ background: CREAM, color: 'rgb(20 20 19)', fontWeight: 500 }}
                >
                  Open full preview →
                </a>
                <button
                  className="px-5 py-3 rounded-full text-[14px] inline-flex items-center gap-2"
                  style={{ background: 'transparent', color: CREAM, border: `1px solid ${LINE}` }}
                >
                  Copy share link
                </button>
              </div>
            </Section>
          )}

          {/* Services */}
          {lead.services.length > 0 && (
            <Section title="What they offer" eyebrow="Services">
              <div className="flex flex-wrap gap-2">
                {lead.services.map((s, i) => (
                  <span
                    key={i}
                    className="px-3.5 py-2 rounded-full text-[13px]"
                    style={{ background: BG_CARD, border: `1px solid ${LINE}`, color: CREAM_DIM }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Best reviews */}
          {lead.best_reviews.length > 0 && (
            <Section title="What customers say" eyebrow="Best reviews">
              <div className="grid gap-3">
                {lead.best_reviews.map((r, i) => (
                  <div
                    key={i}
                    className="rounded-2xl p-5"
                    style={{ background: BG_STRONG, border: `1px solid ${LINE}` }}
                  >
                    <p
                      className="m-0 text-[15px] leading-[1.55]"
                      style={{ fontFamily: DISPLAY_FONT, color: CREAM, fontWeight: 400 }}
                    >
                      &ldquo;{r.text}&rdquo;
                    </p>
                    <p
                      className="mt-3 text-[11px] uppercase"
                      style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED }}
                    >
                      {r.author} · {'★'.repeat(r.rating)}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Brand colours */}
          {lead.brand_colours && Object.keys(lead.brand_colours).length > 0 && (
            <Section title="Their palette" eyebrow="Brand colours">
              <div className="flex gap-3 flex-wrap">
                {Object.entries(lead.brand_colours).map(([name, hex]) => (
                  <div
                    key={name}
                    className="flex items-center gap-3 rounded-full pl-1 pr-4 py-1"
                    style={{ background: BG_CARD, border: `1px solid ${LINE}` }}
                  >
                    <span
                      className="w-9 h-9 rounded-full"
                      style={{ background: hex, border: `1px solid ${LINE}` }}
                    />
                    <div>
                      <div
                        className="text-[10px] uppercase"
                        style={{ fontFamily: MONO_FONT, letterSpacing: '0.12em', color: CREAM_MUTED }}
                      >
                        {name}
                      </div>
                      <div
                        className="text-[12px]"
                        style={{ fontFamily: MONO_FONT, color: CREAM }}
                      >
                        {hex}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Avoid topics */}
          {lead.avoid_topics.length > 0 && (
            <Section title="Don't mention" eyebrow="Tread carefully">
              <ul className="m-0 pl-0 list-none grid gap-2">
                {lead.avoid_topics.map((t, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 text-[14px]"
                    style={{ color: CREAM_DIM }}
                  >
                    <span style={{ color: 'rgb(220 150 80)', marginTop: 2 }}>⚠</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        {/* RIGHT — the facts */}
        <div className="flex flex-col gap-5 min-w-0">
          {/* Contact card */}
          <InfoCard>
            <Eyebrow>Contact</Eyebrow>
            <div className="grid gap-3">
              {lead.phone && (
                <InfoRow
                  label="Phone"
                  value={
                    <a
                      href={`tel:${lead.phone}`}
                      style={{ color: SIGNAL, textDecoration: 'none' }}
                    >
                      {lead.phone}
                    </a>
                  }
                />
              )}
              {lead.email && (
                <InfoRow
                  label="Email"
                  value={
                    <a
                      href={`mailto:${lead.email}`}
                      style={{ color: SIGNAL, textDecoration: 'none' }}
                    >
                      {lead.email}
                    </a>
                  }
                />
              )}
              {lead.address && (
                <InfoRow
                  label="Address"
                  value={
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(lead.address)}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: SIGNAL, textDecoration: 'none' }}
                    >
                      {lead.address}
                    </a>
                  }
                />
              )}
              {lead.postcode && !lead.address && (
                <InfoRow label="Postcode" value={lead.postcode} mono />
              )}
              {lead.website_url && (
                <InfoRow
                  label="Current site"
                  value={
                    <a
                      href={lead.website_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: SIGNAL, textDecoration: 'none' }}
                    >
                      {lead.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </a>
                  }
                />
              )}
              {!lead.has_website && (
                <InfoRow
                  label="Current site"
                  value={<span style={{ color: 'rgb(220 150 80)' }}>No website ✶</span>}
                />
              )}
            </div>
          </InfoCard>

          {/* Contact person */}
          {(lead.contact_name || lead.contact_role) && (
            <InfoCard>
              <Eyebrow>Who to ask for</Eyebrow>
              <p
                className="m-0 text-[18px]"
                style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, color: CREAM, letterSpacing: '-0.02em' }}
              >
                {lead.contact_name ?? 'Whoever is behind the counter'}
              </p>
              {lead.contact_role && (
                <p className="m-0 mt-1 text-[13px]" style={{ color: CREAM_DIM }}>
                  {lead.contact_role}
                </p>
              )}
            </InfoCard>
          )}

          {/* Opening hours */}
          {lead.opening_hours.length > 0 && (
            <InfoCard>
              <Eyebrow>Opening hours</Eyebrow>
              <ul className="m-0 pl-0 list-none grid gap-1.5">
                {lead.opening_hours.map((h, i) => (
                  <li
                    key={i}
                    className="text-[13px]"
                    style={{ fontFamily: MONO_FONT, color: CREAM_DIM, letterSpacing: '0.02em' }}
                  >
                    {h}
                  </li>
                ))}
              </ul>
            </InfoCard>
          )}

          {/* Follow-up */}
          {lead.follow_up_at && (
            <InfoCard accent>
              <Eyebrow accent>Follow up</Eyebrow>
              <p
                className="m-0 text-[18px]"
                style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, color: CREAM, letterSpacing: '-0.02em' }}
              >
                {formatDate(lead.follow_up_at)}
              </p>
              {lead.follow_up_note && (
                <p className="m-0 mt-2 text-[13px] leading-[1.55]" style={{ color: CREAM_DIM }}>
                  {lead.follow_up_note}
                </p>
              )}
            </InfoCard>
          )}

          {/* Trust badges */}
          {lead.trust_badges.length > 0 && (
            <InfoCard>
              <Eyebrow>Trust signals</Eyebrow>
              <div className="flex flex-wrap gap-2">
                {lead.trust_badges.map((b, i) => (
                  <span
                    key={i}
                    className="px-3 py-1.5 rounded-full text-[12px]"
                    style={{ background: BG_CARD, border: `1px solid ${LINE}`, color: CREAM_DIM }}
                  >
                    {b}
                  </span>
                ))}
              </div>
            </InfoCard>
          )}

          {/* Timeline */}
          <InfoCard>
            <Eyebrow>Timeline</Eyebrow>
            <ul className="m-0 pl-0 list-none grid gap-2.5">
              <TimelineItem label="Assigned" at={lead.assigned_at} done />
              <TimelineItem label="Visited" at={lead.visited_at} done={!!lead.visited_at} />
              <TimelineItem label="Pitched" at={lead.pitched_at} done={!!lead.pitched_at} />
              <TimelineItem label="Sold" at={lead.sold_at} done={!!lead.sold_at} accent />
            </ul>
          </InfoCard>
        </div>
      </div>

      {/* ── Sticky action bar ── */}
      <ActionBar status={lead.assignment_status} />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Building blocks
// -----------------------------------------------------------------------------
function Section({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div
        className="text-[10.5px] uppercase mb-2"
        style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: SIGNAL }}
      >
        / {eyebrow}
      </div>
      <h2
        className="text-[22px] tracking-[-0.025em] font-medium m-0 mb-4"
        style={{ fontFamily: DISPLAY_FONT, color: CREAM }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function InfoCard({
  children,
  accent = false,
}: {
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: accent ? 'rgb(184 134 11 / 0.08)' : BG_STRONG,
        border: accent ? '1px solid rgb(184 134 11 / 0.3)' : `1px solid ${LINE}`,
      }}
    >
      {children}
    </div>
  );
}

function Eyebrow({
  children,
  accent = false,
}: {
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className="text-[10px] uppercase mb-3"
      style={{
        fontFamily: MONO_FONT,
        letterSpacing: '0.14em',
        color: accent ? SIGNAL : CREAM_MUTED,
      }}
    >
      {children}
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <div
        className="text-[10px] uppercase mb-1"
        style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED }}
      >
        {label}
      </div>
      <div
        className="text-[14px] break-words"
        style={{ color: CREAM, fontFamily: mono ? MONO_FONT : undefined }}
      >
        {value}
      </div>
    </div>
  );
}

function PitchCard({ index, text }: { index: number; text: string }) {
  return (
    <div
      className="rounded-xl p-4 flex gap-4"
      style={{
        background: BG_STRONG,
        border: `1px solid ${LINE}`,
        borderLeft: `3px solid ${SIGNAL}`,
      }}
    >
      <div
        className="text-[12px] pt-0.5"
        style={{ fontFamily: MONO_FONT, color: SIGNAL, letterSpacing: '0.1em', minWidth: 24 }}
      >
        0{index}
      </div>
      <p className="m-0 text-[14.5px] leading-[1.55]" style={{ color: CREAM }}>
        {text}
      </p>
    </div>
  );
}

function TimelineItem({
  label,
  at,
  done,
  accent = false,
}: {
  label: string;
  at: string | null;
  done: boolean;
  accent?: boolean;
}) {
  return (
    <li className="flex items-center gap-3">
      <span
        className="w-[9px] h-[9px] rounded-full flex-shrink-0"
        style={{
          background: done ? (accent ? SIGNAL : CREAM) : 'transparent',
          border: done ? 'none' : `1.5px solid ${LINE}`,
        }}
      />
      <span
        className="text-[13px] flex-1"
        style={{ color: done ? CREAM : CREAM_MUTED }}
      >
        {label}
      </span>
      {at && (
        <span
          className="text-[11px]"
          style={{ fontFamily: MONO_FONT, color: CREAM_MUTED, letterSpacing: '0.04em' }}
        >
          {relTime(at)}
        </span>
      )}
    </li>
  );
}

function ActionBar({ status }: { status: Lead['assignment_status'] }) {
  // Which action is the natural next step for this status?
  const primary =
    status === 'new' ? 'Mark visited' :
    status === 'visited' ? 'Start pitch' :
    status === 'pitched' ? 'Mark sold' :
    status === 'sold' ? 'View payout' :
    'Reassign';

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 backdrop-blur-xl"
      style={{
        background: 'rgb(20 20 19 / 0.92)',
        borderTop: `1px solid ${LINE}`,
      }}
    >
      <div className="max-w-[1240px] mx-auto px-6 md:px-8 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div
          className="text-[11px] uppercase hidden md:block"
          style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED }}
        >
          / Status actions
        </div>
        <div className="flex items-center gap-2 flex-wrap ml-auto">
          <ActionButton label="Add note" ghost />
          <ActionButton label="Set follow-up" ghost />
          <ActionButton label="Reject" ghost muted />
          <ActionButton label={primary} primary />
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  primary,
  ghost,
  muted,
}: {
  label: string;
  primary?: boolean;
  ghost?: boolean;
  muted?: boolean;
}) {
  return (
    <button
      className="px-4 py-2.5 rounded-full text-[13px] transition-colors"
      style={{
        background: primary ? CREAM : 'transparent',
        color: primary ? 'rgb(20 20 19)' : muted ? CREAM_MUTED : CREAM,
        border: primary ? 'none' : `1px solid ${ghost ? LINE : SIGNAL}`,
        fontWeight: primary ? 500 : 400,
      }}
    >
      {label}
    </button>
  );
}

// -----------------------------------------------------------------------------
// Utils
// -----------------------------------------------------------------------------
function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diffSec = Math.floor((Date.now() - t) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const days = Math.floor(diffSec / 86400);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) return `Today · ${d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' })}`;
  if (sameDay(d, tomorrow)) return `Tomorrow · ${d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' })}`;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
