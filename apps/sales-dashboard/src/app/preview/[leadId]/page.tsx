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
import {
  getSetupFeePence,
  getMonthlyPence,
  formatPenceAsPounds,
} from '@/lib/payments';
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
    const rawDomain =
      typeof n.demo_site_domain === 'string' && n.demo_site_domain.trim()
        ? n.demo_site_domain.trim()
        : null;
    return { business_name: businessName, demo_site_domain: resolveDemoUrl(rawDomain) };
  } catch {
    return { business_name: 'your business', demo_site_domain: null };
  }
}

/**
 * Resolve `notes.demo_site_domain` to an iframe-able URL. The field can be:
 *   - a slug like "third-circle-coffee" → routed through /api/demo-site/<slug>
 *     (server-side proxy that fetches from Supabase Storage; serves under our
 *     own origin so the iframe doesn't hit X-Frame-Options issues)
 *   - a Supabase Storage URL like
 *     "https://<proj>.supabase.co/storage/v1/object/public/demo-sites/<slug>.html"
 *     → extract the slug and route through the proxy. Supabase serves these
 *     with `content-type: text/plain`, which makes the browser display the
 *     raw HTML as text instead of rendering it. The proxy rewrites the
 *     content-type to `text/html`.
 *   - any other full URL like "https://example.com/site.html" → used as-is
 *   - the doubled-protocol bug "https://https://..." → strip leading dup
 *   - null/empty → null (preview page falls back to a friendly message)
 */
function resolveDemoUrl(raw: string | null): string | null {
  if (!raw) return null;
  // Strip leading doubled protocol (historic iOS bug).
  const v = raw.replace(/^https?:\/\/(?=https?:\/\/)/, '');
  // Supabase Storage URL — pull the slug and route through our proxy so the
  // content-type comes back as text/html.
  const supabaseMatch = v.match(
    /^https?:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/demo-sites\/([^/?#]+?)(?:\.html)?(?:[?#].*)?$/i,
  );
  if (supabaseMatch) {
    return `/api/demo-site/${encodeURIComponent(supabaseMatch[1])}`;
  }
  if (/^https?:\/\//i.test(v)) return v;
  // Slug — route through our proxy.
  return `/api/demo-site/${encodeURIComponent(v)}`;
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

  // No Stripe round-trip on this page — the CTA links to /onboarding/<id>
  // first (5-question form), which then redirects to Stripe Checkout when
  // the customer hits "Continue to payment".
  const setupLabel = formatPenceAsPounds(getSetupFeePence());
  const monthlyLabel = formatPenceAsPounds(getMonthlyPence());

  return (
    <PreviewWithCTA
      businessName={business_name}
      demoUrl={demo_site_domain}
      onboardingHref={`/onboarding/${assignment.id}`}
      setupLabel={setupLabel}
      monthlyLabel={monthlyLabel}
    />
  );
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

const INK = '#0F0E0C';
const CREAM = '#FAF8F5';
const SIGNAL = '#B8860B';
const LIVE_GREEN = '#3D9E5F';

function PreviewWithCTA({
  businessName,
  demoUrl,
  onboardingHref,
  setupLabel,
  monthlyLabel,
}: {
  businessName: string;
  demoUrl: string | null;
  onboardingHref: string;
  setupLabel: string;
  monthlyLabel: string;
}) {
  return (
    <div
      style={{
        margin: 0,
        padding: 0,
        background: CREAM,
        minHeight: '100dvh',
        position: 'relative',
        overflow: 'hidden',
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
            height: '100dvh',
            display: 'block',
          }}
        />
      ) : (
        <DemoMissingFallback businessName={businessName} />
      )}

      <BusinessLivePill businessName={businessName} />

      <FloatingCTAButton
        href={onboardingHref}
        setupLabel={setupLabel}
        monthlyLabel={monthlyLabel}
      />
    </div>
  );
}

function BusinessLivePill({ businessName }: { businessName: string }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top) + 12px)',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        padding: '8px 14px',
        background: 'rgba(15, 14, 12, 0.62)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: 9999,
        border: '1px solid rgba(250, 248, 245, 0.08)',
        zIndex: 10,
        fontFamily:
          "'Inter Tight', -apple-system, BlinkMacSystemFont, sans-serif",
        pointerEvents: 'none',
        maxWidth: 'calc(100vw - 32px)',
      }}
    >
      <span
        style={{
          color: CREAM,
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          lineHeight: 1.1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '60vw',
        }}
      >
        {businessName}
      </span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 10,
          color: 'rgba(250, 248, 245, 0.55)',
          lineHeight: 1,
        }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: LIVE_GREEN,
            display: 'inline-block',
            boxShadow: `0 0 6px ${LIVE_GREEN}`,
          }}
        />
        Live
      </span>
    </div>
  );
}

function FloatingCTAButton({
  href,
  setupLabel,
  monthlyLabel,
}: {
  href: string;
  setupLabel: string;
  monthlyLabel: string;
}) {
  return (
    <a
      href={href}
      style={{
        position: 'fixed',
        right: 16,
        bottom: 'calc(env(safe-area-inset-bottom) + 36px)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 18px 12px 20px',
        background: 'rgba(15, 14, 12, 0.58)',
        backdropFilter: 'blur(14px) saturate(140%)',
        WebkitBackdropFilter: 'blur(14px) saturate(140%)',
        color: CREAM,
        textDecoration: 'none',
        borderRadius: 16,
        fontFamily:
          "'Inter Tight', -apple-system, BlinkMacSystemFont, sans-serif",
        letterSpacing: '-0.01em',
        boxShadow:
          '0 10px 28px rgba(15, 14, 12, 0.32), 0 1px 2px rgba(15, 14, 12, 0.18)',
        border: '1px solid rgba(250, 248, 245, 0.10)',
        zIndex: 10,
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.1 }}>
          Go live now
        </span>
        <span
          style={{
            fontSize: 11,
            color: SIGNAL,
            letterSpacing: '0.02em',
            lineHeight: 1.1,
          }}
        >
          {setupLabel} setup · then {monthlyLabel}/mo
        </span>
      </span>
      <span
        style={{
          color: SIGNAL,
          fontSize: 18,
          lineHeight: 1,
          fontWeight: 500,
        }}
      >
        →
      </span>
    </a>
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
        position: 'relative',
        overflow: 'hidden',
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
            height: '100dvh',
            display: 'block',
          }}
        />
      ) : (
        <DemoMissingFallback businessName={businessName} />
      )}

      <BusinessLivePill businessName={businessName} />

      <div
        style={{
          position: 'fixed',
          right: 16,
          bottom: 'calc(env(safe-area-inset-bottom) + 36px)',
          padding: '12px 18px',
          background: 'rgba(15, 14, 12, 0.58)',
          backdropFilter: 'blur(14px) saturate(140%)',
          WebkitBackdropFilter: 'blur(14px) saturate(140%)',
          color: CREAM,
          borderRadius: 9999,
          fontFamily:
            "'Inter Tight', -apple-system, BlinkMacSystemFont, sans-serif",
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          border: '1px solid rgba(250, 248, 245, 0.10)',
          boxShadow:
            '0 10px 28px rgba(15, 14, 12, 0.32), 0 1px 2px rgba(15, 14, 12, 0.18)',
          zIndex: 10,
          maxWidth: 'calc(100vw - 32px)',
        }}
      >
        <span style={{ color: SIGNAL }}>✓ Paid</span> — building your site. We'll text you within 24h.
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
