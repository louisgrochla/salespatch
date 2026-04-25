/**
 * /paid/[leadId]  —  fallback thank-you if onboarding is skipped or errored.
 *
 * The Stripe success_url normally redirects straight to /onboarding/<leadId>.
 * This page is a soft landing for cases where:
 *   - onboarding throws and the customer is bounced here
 *   - the salesperson manually shares this URL with a paid customer
 *
 * Always shows a "✓ Paid" reassurance + a CTA to finish the onboarding
 * form (which is the actually-useful thing).
 */
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const INK = '#0F0E0C';
const CREAM = '#FAF8F5';
const SIGNAL = '#B8860B';

export default function PaidPage({ params }: { params: { leadId: string } }) {
  return (
    <div
      style={{
        margin: 0,
        padding: '32px 24px',
        background: CREAM,
        minHeight: '100dvh',
        color: INK,
        fontFamily:
          "'Inter Tight', -apple-system, BlinkMacSystemFont, sans-serif",
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 88,
          height: 88,
          borderRadius: 999,
          background: 'rgba(184,134,11,0.14)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 28,
          border: `1px solid rgba(184,134,11,0.35)`,
        }}
      >
        <span style={{ fontSize: 36, color: SIGNAL, lineHeight: 1 }}>✓</span>
      </div>

      <h1
        style={{
          margin: 0,
          fontSize: 40,
          fontWeight: 500,
          letterSpacing: '-0.03em',
          marginBottom: 12,
        }}
      >
        You\u2019re paid.
      </h1>

      <p
        style={{
          margin: 0,
          fontSize: 16,
          lineHeight: 1.55,
          color: 'rgba(15,14,12,0.65)',
          maxWidth: 360,
          marginBottom: 32,
        }}
      >
        Thanks for going live. We\u2019ll text you within 24 hours — but if
        you have a minute now, finish the setup form so we can start
        building.
      </p>

      <Link
        href={`/onboarding/${params.leadId}`}
        style={{
          padding: '14px 28px',
          background: INK,
          color: CREAM,
          borderRadius: 12,
          textDecoration: 'none',
          fontSize: 15,
          fontWeight: 500,
          letterSpacing: '-0.01em',
        }}
      >
        Finish setup →
      </Link>

      <p
        style={{
          marginTop: 32,
          fontSize: 12,
          color: 'rgba(15,14,12,0.4)',
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          letterSpacing: '0.06em',
        }}
      >
        Reference: {params.leadId}
      </p>
    </div>
  );
}
