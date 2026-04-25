/**
 * /preview/[leadId] — customer-facing demo preview with sticky payment CTA.
 *
 * Public, no auth. Customer's phone lands here from the QR. Server-renders
 * the demo in an iframe + sticky bottom bar that links to Stripe Checkout.
 *
 * leadId here is the lead_assignment.id (named "leadId" to match the QR
 * URL contract documented in HANDOVER_PAYMENT_FLOW.md).
 *
 * Edge cases handled:
 *   - Already sold → "Paid · being built" state, no CTA bar
 *   - Active session expired → getOrCreateActiveSession refreshes
 *   - Demo URL missing → shows fallback message with the CTA still visible
 */
import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import { getOrCreateActiveSession } from '@/lib/payments';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

interface AssignmentRow {
  id: string;
  status: string;
  notes: string | null;
  sold_at: string | null;
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function loadAssignment(leadId: string): Promise<AssignmentRow | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('lead_assignments')
    .select('id, status, notes, sold_at')
    .eq('id', leadId)
    .maybeSingle();
  if (error) {
    console.error('[preview] assignment lookup error:', error.message);
    return null;
  }
  return data as AssignmentRow | null;
}

interface ParsedNotes {
  business_name: string;
  demo_site_domain: string | null;
}

function parseNotes(raw: string | null): ParsedNotes {
  if (!raw) return { business_name: 'your business', demo_site_domain: null };
  try {
    const n = JSON.parse(raw) as Record<string, unknown>;
    const businessName =
      typeof n.business_name === 'string' && n.business_name.trim()
        ? n.business_name
        : 'your business';
    let demoUrl =
      typeof n.demo_site_domain === 'string' && n.demo_site_domain.trim()
        ? n.demo_site_domain
        : null;
    // Defensive: trim leading double-protocol that's bitten the iOS QR before.
    if (demoUrl) demoUrl = demoUrl.replace(/^https?:\/\/(?=https?:\/\/)/, '');
    return { business_name: businessName, demo_site_domain: demoUrl };
  } catch {
    return { business_name: 'your business', demo_site_domain: null };
  }
}

export async function generateMetadata(
  { params }: { params: { leadId: string } },
): Promise<Metadata> {
  const a = await loadAssignment(params.leadId);
  const name = a ? parseNotes(a.notes).business_name : 'Site preview';
  return {
    title: `${name} — Preview`,
    robots: { index: false, follow: false },
  };
}

export default async function PreviewPage({
  params,
}: {
  params: { leadId: string };
}) {
  const assignment = await loadAssignment(params.leadId);
  if (!assignment) notFound();

  const { business_name, demo_site_domain } = parseNotes(assignment.notes);

  // Already paid → don't show the CTA. Customer might have scanned twice
  // or shared the link with their partner.
  if (assignment.status === 'sold') {
    return <PaidState businessName={business_name} demoUrl={demo_site_domain} />;
  }

  // Get or create the active checkout session for this assignment.
  // This is the same session the salesperson's QR-gen call cached, refreshed
  // lazily if the cached one expired. Customer never sees the seam.
  let checkoutUrl: string | null = null;
  try {
    const sb = getSupabase();
    const session = await getOrCreateActiveSession(sb, assignment.id);
    checkoutUrl = session.stripe_session_url;
  } catch (err) {
    console.error('[preview] session create/fetch failed:', err);
    // Render the demo anyway — better to show something than 500.
  }

  return <PreviewWithCTA businessName={business_name} demoUrl={demo_site_domain} checkoutUrl={checkoutUrl} />;
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

const INK = '#0F0E0C';
const CREAM = '#FAF8F5';
const CREAM_DIM = '#D4CFC4';
const SIGNAL = '#B8860B';

function PreviewWithCTA({
  businessName,
  demoUrl,
  checkoutUrl,
}: {
  businessName: string;
  demoUrl: string | null;
  checkoutUrl: string | null;
}) {
  return (
    <div
      style={{
        margin: 0,
        padding: 0,
        background: CREAM,
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <main
        style={{
          flex: 1,
          // Reserve room for the sticky CTA + iOS home indicator.
          paddingBottom: 'calc(72px + env(safe-area-inset-bottom))',
          background: CREAM,
        }}
      >
        {demoUrl ? (
          <iframe
            src={demoUrl}
            title={`${businessName} — preview`}
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            style={{
              border: 0,
              width: '100%',
              height: 'calc(100dvh - 72px - env(safe-area-inset-bottom))',
              display: 'block',
            }}
          />
        ) : (
          <DemoMissingFallback businessName={businessName} />
        )}
      </main>

      {checkoutUrl ? (
        <a
          href={checkoutUrl}
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            paddingTop: 16,
            paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
            paddingLeft: 20,
            paddingRight: 20,
            background: INK,
            color: CREAM,
            fontFamily:
              "'Inter Tight', -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: 16,
            fontWeight: 500,
            textAlign: 'center',
            textDecoration: 'none',
            letterSpacing: '-0.01em',
            borderTop: `1px solid rgba(250, 248, 245, 0.08)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            transition: 'background 0.18s ease',
          }}
        >
          <span>
            Go live now · <span style={{ color: SIGNAL }}>£350 setup, then £25/mo</span>
          </span>
          <span style={{ color: SIGNAL, fontSize: 18, lineHeight: 1 }}>→</span>
        </a>
      ) : (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            padding: 'calc(16px + env(safe-area-inset-bottom)) 20px 16px',
            background: INK,
            color: CREAM_DIM,
            fontFamily:
              "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 12,
            textAlign: 'center',
            letterSpacing: '0.06em',
            borderTop: `1px solid rgba(250, 248, 245, 0.08)`,
          }}
        >
          Checkout is being prepared — refresh in a moment.
        </div>
      )}
    </div>
  );
}

function PaidState({ businessName, demoUrl }: { businessName: string; demoUrl: string | null }) {
  return (
    <div
      style={{
        margin: 0,
        padding: 0,
        background: CREAM,
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <main
        style={{
          flex: 1,
          paddingBottom: 'calc(72px + env(safe-area-inset-bottom))',
        }}
      >
        {demoUrl ? (
          <iframe
            src={demoUrl}
            title={`${businessName} — preview`}
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            style={{
              border: 0,
              width: '100%',
              height: 'calc(100dvh - 72px - env(safe-area-inset-bottom))',
              display: 'block',
            }}
          />
        ) : (
          <DemoMissingFallback businessName={businessName} />
        )}
      </main>
      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          paddingTop: 16,
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
          paddingLeft: 20,
          paddingRight: 20,
          background: INK,
          color: CREAM,
          fontFamily:
            "'Inter Tight', -apple-system, BlinkMacSystemFont, sans-serif",
          fontSize: 15,
          fontWeight: 500,
          textAlign: 'center',
          letterSpacing: '-0.01em',
          borderTop: `1px solid rgba(250, 248, 245, 0.08)`,
        }}
      >
        <span style={{ color: SIGNAL }}>✓ Paid</span> — your real site is being built. We'll text you within 24h.
      </div>
    </div>
  );
}

function DemoMissingFallback({ businessName }: { businessName: string }) {
  return (
    <div
      style={{
        padding: '64px 24px',
        textAlign: 'center',
        color: INK,
        fontFamily:
          "'Inter Tight', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 24,
          fontWeight: 500,
          letterSpacing: '-0.02em',
          marginBottom: 12,
        }}
      >
        Your site for {businessName}
      </p>
      <p
        style={{
          margin: 0,
          fontSize: 15,
          color: 'rgba(15,14,12,0.6)',
          lineHeight: 1.55,
          maxWidth: 360,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        Tap below to go live. We'll have it on the web within a week, with
        all your photos, hours, and reviews.
      </p>
    </div>
  );
}
