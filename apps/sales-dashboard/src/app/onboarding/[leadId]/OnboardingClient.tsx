/**
 * /onboarding/[leadId] — bottom-sheet form rendered over a peek of the demo.
 *
 * Editorial tactile sheet: warm cream gradient, gold (SIGNAL) primary CTA,
 * pill controls, motion between steps, soft backdrop-blur top pill. Demo
 * iframe sits behind, dimmed and slightly blurred so it stays a backdrop and
 * doesn't compete with the form for focus.
 *
 * Auto-saves every change debounced 500ms. "Continue to payment" pre-warms
 * the Stripe Checkout URL on mount and redirects on click.
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const INK = '#0F0E0C';
const CREAM = '#FAF8F5';
const CREAM_WARM = '#F3EDE3';
const CREAM_MUTED = '#9A9489';
const SIGNAL = '#B8860B';
const SIGNAL_DEEP = '#8E6608';
const LIVE_GREEN = '#3D9E5F';
const TAKEN_RED = '#A8332B';
const LINE = 'rgba(15,14,12,0.08)';

type StepKey = 'contact' | 'changes' | 'photos' | 'domain' | 'else';
const STEPS: StepKey[] = ['contact', 'changes', 'photos', 'domain', 'else'];

// Mirrors server-side regex in /api/onboarding/[leadId]/route.ts. We use it
// to gate UI hints (e.g. "check your spam folder") so they only appear once
// the customer has typed something the server will actually accept.
function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

interface PhotoEntry {
  url: string;
  filename: string;
  uploaded_at: string;
}

interface Answers {
  contact_email: string;
  contact_phone: string;
  top_changes: string;
  has_existing_domain: boolean | null;
  existing_domain: string;
  domain_preferences: string[];
  anything_else: string;
  photos: PhotoEntry[];
}

const EMPTY: Answers = {
  contact_email: '',
  contact_phone: '',
  top_changes: '',
  has_existing_domain: null,
  existing_domain: '',
  domain_preferences: ['', '', ''],
  anything_else: '',
  photos: [],
};

const LABELS: Record<
  StepKey,
  { eyebrow: string; question: string; emphasis?: string; sub?: string; glyph: string }
> = {
  contact: {
    eyebrow: '01 / 05',
    question: 'Where can we',
    emphasis: 'reach you?',
    sub: 'Email for your launch confirmation, mobile for the occasional text. We won’t spam either.',
    glyph: '✶',
  },
  changes: {
    eyebrow: '02 / 05',
    question: 'Any',
    emphasis: 'first-day tweaks?',
    sub: 'All optional. Tap what comes to mind. Anything bigger you can email us during the build.',
    glyph: '✦',
  },
  photos: {
    eyebrow: '03 / 05',
    question: 'Bring your business',
    emphasis: 'to life.',
    sub: 'Storefront, products, food, a smiling face. Add as many as you like, or skip and send later.',
    glyph: '◐',
  },
  domain: {
    eyebrow: '04 / 05',
    question: 'Where will',
    emphasis: 'people find you?',
    sub: 'If you don’t have a domain yet, we’ll buy one for you. You can change your mind any time before launch.',
    glyph: '◊',
  },
  else: {
    eyebrow: '05 / 05',
    question: 'Anything else',
    emphasis: 'we should know?',
    sub: 'Optional. 30 seconds, max. After this you can pay and we start the build.',
    glyph: '✺',
  },
};

const COMMON_CHANGES = [
  'Bigger photos',
  'Different colours',
  'Add menu',
  'Update hours',
  'Different fonts',
  'Add booking',
  'Show prices',
  'Mention awards',
];

interface Props {
  leadId: string;
  businessName: string;
  demoUrl: string | null;
}

export default function OnboardingClient({ leadId, businessName, demoUrl }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<StepKey>('contact');
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  // Sheet height — collapsed shows the demo as a backdrop, expanded gives
  // the customer more room to type without losing the demo entirely. Tap
  // the drag handle to toggle. Auto-expands when an input gets focus on
  // mobile so the keyboard doesn't shove fields out of view.
  const [expanded, setExpanded] = useState(false);
  // Returning-visitor banner: shown if the initial GET shows the customer
  // has already saved at least one answer. Dismissable. Reassures them
  // their progress is still here so they don't redo what they already did.
  const [resumed, setResumed] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/api/onboarding/${leadId}`)
      .then((r) => r.json())
      .then((j) => {
        const d = j.data;
        if (!d) return;
        setAnswers({
          contact_email: d.contact_email ?? '',
          contact_phone: d.contact_phone ?? '',
          top_changes: d.top_changes ?? '',
          has_existing_domain: d.has_existing_domain,
          existing_domain: d.existing_domain ?? '',
          domain_preferences:
            Array.isArray(d.domain_preferences) && d.domain_preferences.length > 0
              ? [...d.domain_preferences, '', '', ''].slice(0, 3)
              : ['', '', ''],
          anything_else: d.anything_else ?? '',
          photos: Array.isArray(d.photos) ? d.photos : [],
        });
        // If they'd saved at least one answer, this is a return visit.
        // Show the resumed banner so they know their progress is here.
        const hasProgress =
          (d.contact_email && d.contact_email.length > 0) ||
          (d.contact_phone && d.contact_phone.length > 0) ||
          (d.top_changes && d.top_changes.length > 0) ||
          (d.existing_domain && d.existing_domain.length > 0) ||
          (Array.isArray(d.domain_preferences) && d.domain_preferences.length > 0) ||
          (d.anything_else && d.anything_else.length > 0) ||
          (Array.isArray(d.photos) && d.photos.length > 0);
        if (hasProgress) setResumed(true);
      })
      .catch(() => undefined);
  }, [leadId]);

  useEffect(() => {
    fetch('/api/payments/customer-checkout-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j.already_paid) {
          router.replace(`/paid/${leadId}`);
          return;
        }
        if (typeof j.checkout_url === 'string') setCheckoutUrl(j.checkout_url);
      })
      .catch((err) => console.error('checkout url fetch failed', err));
  }, [leadId, router]);

  const queueSave = (patch: Partial<Answers>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSavingState('saving');
    saveTimer.current = setTimeout(async () => {
      try {
        const body: Record<string, unknown> = {};
        if ('contact_email' in patch) body.contact_email = patch.contact_email;
        if ('contact_phone' in patch) body.contact_phone = patch.contact_phone;
        if ('top_changes' in patch) body.top_changes = patch.top_changes;
        if ('anything_else' in patch) body.anything_else = patch.anything_else;
        if ('has_existing_domain' in patch) body.has_existing_domain = patch.has_existing_domain;
        if ('existing_domain' in patch) body.existing_domain = patch.existing_domain;
        if ('domain_preferences' in patch) {
          body.domain_preferences = patch.domain_preferences?.filter((s) => s.trim().length > 0);
        }
        const res = await fetch(`/api/onboarding/${leadId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? 'save failed');
        setSavingState('saved');
        setTimeout(() => setSavingState('idle'), 1200);
      } catch (err) {
        setSavingState('error');
        setError(err instanceof Error ? err.message : 'Save failed');
      }
    }, 500);
  };

  const update = <K extends keyof Answers>(key: K, value: Answers[K]) => {
    setAnswers((prev) => {
      const next = { ...prev, [key]: value };
      queueSave({ [key]: value } as unknown as Partial<Answers>);
      return next;
    });
  };

  const advance = () => {
    const i = STEPS.indexOf(step);
    if (i < 0 || i >= STEPS.length - 1) return;
    setStep(STEPS[i + 1]);
  };

  const back = () => {
    const i = STEPS.indexOf(step);
    if (i <= 0) return;
    setStep(STEPS[i - 1]);
  };

  const continueToPayment = async () => {
    setCheckoutLoading(true);
    setError(null);
    fetch(`/api/onboarding/${leadId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mark_completed: true }),
    }).catch(() => undefined);

    let url = checkoutUrl;
    if (!url) {
      try {
        const res = await fetch('/api/payments/customer-checkout-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_id: leadId }),
        });
        const j = await res.json();
        if (j.already_paid) {
          router.replace(`/paid/${leadId}`);
          return;
        }
        url = typeof j.checkout_url === 'string' ? j.checkout_url : null;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start checkout');
        setCheckoutLoading(false);
        return;
      }
    }
    if (!url) {
      setError('Checkout is not ready yet — try again in a moment.');
      setCheckoutLoading(false);
      return;
    }
    window.location.href = url;
  };

  const stepIndex = STEPS.indexOf(step);
  const isLastStep = stepIndex === STEPS.length - 1;
  const progressPct = ((stepIndex + 1) / STEPS.length) * 100;

  return (
    <div
      style={{
        margin: 0,
        padding: 0,
        minHeight: '100dvh',
        height: '100dvh',
        background: INK,
        position: 'relative',
        overflow: 'hidden',
        fontFamily:
          "'Inter Tight', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
      }}
    >
      <style>{KEYFRAMES_CSS}</style>

      {demoUrl ? (
        <iframe
          src={demoUrl}
          title={`${businessName} — preview`}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          style={{
            position: 'absolute',
            inset: 0,
            border: 0,
            width: '100%',
            height: '100dvh',
            display: 'block',
            pointerEvents: 'none',
            filter: 'saturate(0.78)',
          }}
        />
      ) : null}

      {/* Veil over the demo so the sheet isn't fighting the demo for focus */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(15,14,12,0) 0%, rgba(15,14,12,0.16) 30%, rgba(15,14,12,0.55) 90%)',
          pointerEvents: 'none',
        }}
      />

      {/* Top business pill */}
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
          zIndex: 20,
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
              background: SIGNAL,
              display: 'inline-block',
              boxShadow: `0 0 8px ${SIGNAL}`,
            }}
          />
          Setting up
        </span>
      </div>

      {/* Bottom sheet */}
      <section
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          height: expanded ? 'min(92dvh, 880px)' : 'min(74dvh, 660px)',
          background: `linear-gradient(180deg, ${CREAM} 0%, ${CREAM_WARM} 100%)`,
          color: INK,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          boxShadow:
            '0 -2px 0 rgba(184,134,11,0.18), 0 -22px 56px rgba(15,14,12,0.42)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10,
          animation: 'sheetIn 520ms cubic-bezier(0.22, 1, 0.36, 1) both',
          transition: 'height 360ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* Drag handle — also a tap-target to expand/collapse the sheet.
            Larger hit area than the visible bar so it works on a phone. */}
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          aria-label={expanded ? 'Shrink sheet' : 'Expand sheet'}
          aria-expanded={expanded}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            paddingTop: 10,
            paddingBottom: 6,
            flexShrink: 0,
            background: 'transparent',
            border: 0,
            cursor: 'pointer',
            width: '100%',
            // Slightly bigger hit zone without changing the visual.
            minHeight: 28,
          }}
        >
          <span
            style={{
              width: 38,
              height: 4,
              borderRadius: 2,
              background: 'rgba(15,14,12,0.22)',
              transition: 'background 200ms',
            }}
          />
          <span
            style={{
              fontSize: 9.5,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: 'rgba(15,14,12,0.42)',
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              lineHeight: 1,
              transition: 'opacity 200ms',
            }}
          >
            {expanded ? '⌄ tap for less room' : '⌃ tap for more room'}
          </span>
        </button>

        {/* Progress bar */}
        <div
          style={{
            height: 3,
            margin: '8px 22px 0',
            background: 'rgba(15,14,12,0.06)',
            borderRadius: 2,
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progressPct}%`,
              background: `linear-gradient(90deg, ${SIGNAL}, ${SIGNAL_DEEP})`,
              boxShadow: `0 0 12px ${SIGNAL}66`,
              transition: 'width 320ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          />
        </div>

        {/* Returning-visitor banner. Only renders when initial load detects
            saved answers. Dismissable so it doesn't sit there forever. */}
        {resumed && (
          <div
            style={{
              margin: '10px 22px 0',
              padding: '10px 12px',
              background: 'rgba(61,158,95,0.08)',
              border: '1px solid rgba(61,158,95,0.28)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: LIVE_GREEN,
                flexShrink: 0,
                boxShadow: `0 0 6px ${LIVE_GREEN}88`,
              }}
            />
            <span
              style={{
                fontSize: 12.5,
                lineHeight: 1.4,
                color: 'rgba(15,14,12,0.78)',
                flex: 1,
              }}
            >
              <strong style={{ color: INK, fontWeight: 600 }}>Welcome back.</strong>{' '}
              Everything you entered last time is saved. Pick up wherever feels right.
            </span>
            <button
              type="button"
              onClick={() => setResumed(false)}
              aria-label="Dismiss"
              style={{
                background: 'transparent',
                border: 0,
                padding: '2px 6px',
                cursor: 'pointer',
                color: 'rgba(15,14,12,0.45)',
                fontSize: 14,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* Always-visible info strip. Three compact chips that frame the
            offer + reassurance. Sets expectations so the form feels like a
            speed-up, not a gate before payment. */}
        <InfoStrip />

        {/* Eyebrow row */}
        <header
          style={{
            padding: '12px 22px 6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: SIGNAL,
            }}
          >
            <span
              style={{
                fontFamily: "'Inter Tight', sans-serif",
                fontSize: 14,
                color: SIGNAL,
                lineHeight: 1,
              }}
            >
              {LABELS[step].glyph}
            </span>
            Step {stepIndex + 1} of {STEPS.length}
          </span>
          <SaveIndicator state={savingState} />
        </header>

        {/* Scrollable question content. We auto-expand the sheet on focus
            of any descendant input so the iOS keyboard doesn't squash the
            field the customer is typing into. */}
        <main
          onFocusCapture={(e) => {
            const tag = (e.target as HTMLElement).tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') setExpanded(true);
          }}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px 22px 18px',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div
            key={step}
            style={{ animation: 'stepIn 360ms cubic-bezier(0.22, 1, 0.36, 1) both' }}
          >
            <h1
              style={{
                margin: '6px 0 0',
                fontSize: 28,
                fontWeight: 500,
                letterSpacing: '-0.03em',
                lineHeight: 1.12,
                color: INK,
              }}
            >
              {LABELS[step].question}
              {LABELS[step].emphasis && (
                <>
                  <br />
                  <span
                    style={{
                      fontStyle: 'italic',
                      fontWeight: 400,
                      color: SIGNAL_DEEP,
                    }}
                  >
                    {LABELS[step].emphasis}
                  </span>
                </>
              )}
            </h1>
            {LABELS[step].sub && (
              <p
                style={{
                  margin: '10px 0 22px',
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: 'rgba(15,14,12,0.62)',
                }}
              >
                {LABELS[step].sub}
              </p>
            )}

            {step === 'contact' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <EmailInput
                  value={answers.contact_email}
                  onChange={(v) => update('contact_email', v)}
                />
                {looksLikeEmail(answers.contact_email) && (
                  <p
                    style={{
                      margin: '-4px 4px 0',
                      fontSize: 12.5,
                      lineHeight: 1.55,
                      color: 'rgba(15,14,12,0.55)',
                      letterSpacing: '0.005em',
                    }}
                  >
                    We&rsquo;ll send a quick hello to that inbox. If you don&rsquo;t
                    see it within a minute, check your spam or junk folder.
                  </p>
                )}
                <PhoneInput
                  value={answers.contact_phone}
                  onChange={(v) => update('contact_phone', v)}
                />
              </div>
            )}

            {step === 'changes' && (
              <ChangesPicker
                value={answers.top_changes}
                onChange={(v) => update('top_changes', v)}
              />
            )}

            {step === 'photos' && (
              <PhotoUploader
                leadId={leadId}
                photos={answers.photos}
                onChange={(photos) => setAnswers((p) => ({ ...p, photos }))}
                onError={(msg) => setError(msg)}
              />
            )}

            {step === 'domain' && (
              <DomainPicker
                answers={answers}
                update={update}
                businessName={businessName}
              />
            )}

            {step === 'else' && (
              <textarea
                placeholder="Optional…"
                rows={5}
                value={answers.anything_else}
                onChange={(e) => update('anything_else', e.target.value)}
                style={textareaStyle}
              />
            )}

            {error && (
              <p style={{ marginTop: 16, color: '#A8332B', fontSize: 13 }}>{error}</p>
            )}
          </div>
        </main>

        {/* Action row — pills float over the cream sheet, no toolbar bar
            behind them. A short fade-out gradient handles content that
            scrolls behind the pills so it never reads as overlap.

            Two rows:
              1. [Back] ............ [Next] (primary CTA per step)
              2.    "Or pay £299 now and share details later"  (centered link)
            The secondary link is hidden on the final step where the
            primary Next button is already the pay CTA. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '8px 18px calc(env(safe-area-inset-bottom) + 8px)',
            flexShrink: 0,
            // Soft cream-to-cream fade at the top so any form content
            // scrolling behind the pills dissolves rather than collides.
            // No solid bar, no border line.
            background:
              `linear-gradient(180deg, rgba(243,237,227,0) 0%, ${CREAM_WARM} 38%)`,
            paddingTop: 22,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <button
              onClick={back}
              disabled={stepIndex === 0}
              style={{
                ...ghostButtonStyle,
                opacity: stepIndex === 0 ? 0.3 : 1,
                pointerEvents: stepIndex === 0 ? 'none' : 'auto',
              }}
              className="oc-press"
            >
              ← Back
            </button>
            {isLastStep ? (
              <button
                onClick={continueToPayment}
                disabled={checkoutLoading}
                className="oc-press"
                style={{
                  ...primaryButtonStyle,
                  opacity: checkoutLoading ? 0.6 : 1,
                  cursor: checkoutLoading ? 'wait' : 'pointer',
                }}
              >
                {checkoutLoading ? 'Opening checkout…' : 'Pay £299 · start the build →'}
              </button>
            ) : (
              <button onClick={advance} className="oc-press" style={primaryButtonStyle}>
                Next →
              </button>
            )}
          </div>

          {/* Secondary "pay now, share details later" link. Centered text
              link, gold-deep underline. Hidden on the last step. */}
          {!isLastStep && (
            <div
              style={{
                textAlign: 'center',
                fontSize: 12,
                color: 'rgba(15,14,12,0.50)',
                letterSpacing: '0.005em',
                lineHeight: 1.4,
              }}
            >
              <button
                onClick={continueToPayment}
                disabled={checkoutLoading}
                style={{
                  background: 'transparent',
                  border: 0,
                  padding: 0,
                  font: 'inherit',
                  color: SIGNAL_DEEP,
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                  cursor: checkoutLoading ? 'wait' : 'pointer',
                  letterSpacing: 'inherit',
                }}
              >
                {checkoutLoading
                  ? 'Opening checkout…'
                  : 'Or pay £299 now and share details later'}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// InfoStrip — three short, always-visible reassurances at the top of the
// sheet. Reframes the form as "speed us up" rather than "gate before pay".
// Content order is deliberate: timeline first (we move fast), price second
// (transparent + low), edit-anytime last (de-risk the decision).
// ---------------------------------------------------------------------------

function InfoStrip() {
  const items: Array<{ glyph: string; label: string; sub: string }> = [
    { glyph: '◐', label: 'Live in 7 days', sub: 'from payment' },
    { glyph: '✶', label: '£299 today', sub: 'then £25/mo from day 30' },
    { glyph: '✦', label: 'Tweak anytime', sub: 'just email us' },
  ];
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        margin: '12px 22px 0',
        padding: '8px 4px',
        background: 'rgba(184,134,11,0.05)',
        border: '1px solid rgba(184,134,11,0.18)',
        borderRadius: 12,
        flexShrink: 0,
      }}
    >
      {items.map((it, i) => (
        <div
          key={it.label}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1,
            padding: '4px 6px',
            borderLeft: i === 0 ? 'none' : '1px solid rgba(184,134,11,0.16)',
            textAlign: 'center',
          }}
        >
          <span
            style={{
              fontSize: 14,
              color: SIGNAL,
              lineHeight: 1,
              marginBottom: 2,
            }}
          >
            {it.glyph}
          </span>
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              color: INK,
              letterSpacing: '-0.005em',
              lineHeight: 1.15,
            }}
          >
            {it.label}
          </span>
          <span
            style={{
              fontSize: 9.5,
              color: 'rgba(15,14,12,0.55)',
              lineHeight: 1.15,
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              letterSpacing: '0.02em',
            }}
          >
            {it.sub}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SaveIndicator({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  const map = {
    idle: '',
    saving: 'Saving…',
    saved: '✓ Saved',
    error: '⚠ Save failed',
  };
  if (!map[state]) return null;
  return (
    <span
      style={{
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 10,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        color: state === 'error' ? '#A8332B' : CREAM_MUTED,
        animation: state === 'saving' ? 'pulse 1.2s ease-in-out infinite' : undefined,
      }}
    >
      {map[state]}
    </span>
  );
}

function EmailInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        background: CREAM,
        border: `1px solid rgba(15,14,12,0.14)`,
        borderRadius: 16,
        padding: 4,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
      }}
    >
      <span
        style={{
          padding: '12px 14px',
          fontSize: 15,
          fontFamily: 'inherit',
          color: 'rgba(15,14,12,0.65)',
          flexShrink: 0,
          borderRight: `1px solid rgba(15,14,12,0.10)`,
          letterSpacing: '0.02em',
        }}
      >
        ✉
      </span>
      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="you@yourbusiness.co.uk"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1,
          padding: '12px 14px',
          fontSize: 18,
          color: INK,
          background: 'transparent',
          border: 0,
          outline: 'none',
          fontFamily: 'inherit',
          letterSpacing: '0.01em',
          fontWeight: 500,
        }}
      />
    </div>
  );
}

function PhoneInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const formatted = useMemo(() => formatUkPhone(value), [value]);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        background: CREAM,
        border: `1px solid rgba(15,14,12,0.14)`,
        borderRadius: 16,
        padding: 4,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
      }}
    >
      <span
        style={{
          padding: '12px 14px',
          fontSize: 15,
          fontFamily: 'inherit',
          color: 'rgba(15,14,12,0.65)',
          flexShrink: 0,
          borderRight: `1px solid rgba(15,14,12,0.10)`,
          letterSpacing: '0.02em',
        }}
      >
        🇬🇧 +44
      </span>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        placeholder="07712 345678"
        value={formatted}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1,
          padding: '12px 14px',
          fontSize: 18,
          color: INK,
          background: 'transparent',
          border: 0,
          outline: 'none',
          fontFamily: 'inherit',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.06em',
          fontWeight: 500,
        }}
      />
    </div>
  );
}

function formatUkPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)} ${digits.slice(5)}`;
}

function ChangesPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { selected, freeText } = useMemo(() => splitChanges(value), [value]);

  const toggleChip = (chip: string) => {
    const isOn = selected.includes(chip);
    const nextSel = isOn ? selected.filter((c) => c !== chip) : [...selected, chip];
    onChange(joinChanges(nextSel, freeText));
  };

  const updateFree = (txt: string) => {
    onChange(joinChanges(selected, txt));
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 16,
        }}
      >
        {COMMON_CHANGES.map((chip) => (
          <Chip
            key={chip}
            label={chip}
            active={selected.includes(chip)}
            onClick={() => toggleChip(chip)}
          />
        ))}
      </div>
      <textarea
        placeholder="Anything else specific? (optional)"
        rows={3}
        value={freeText}
        onChange={(e) => updateFree(e.target.value)}
        style={textareaStyle}
      />
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="oc-chip"
      style={{
        padding: '9px 14px',
        borderRadius: 9999,
        fontSize: 13.5,
        fontWeight: 500,
        fontFamily: 'inherit',
        cursor: 'pointer',
        background: active ? INK : CREAM,
        color: active ? CREAM : INK,
        border: `1px solid ${active ? INK : 'rgba(15,14,12,0.16)'}`,
        boxShadow: active
          ? '0 6px 14px rgba(15,14,12,0.16)'
          : '0 1px 0 rgba(255,255,255,0.6) inset',
        transition: 'transform 140ms ease, box-shadow 140ms ease, background 140ms ease',
      }}
    >
      <span
        style={{
          color: active ? SIGNAL : 'rgba(15,14,12,0.55)',
          fontWeight: 600,
          marginRight: 4,
          display: 'inline-block',
          width: 10,
        }}
      >
        {active ? '✓' : '+'}
      </span>
      {label}
    </button>
  );
}

function splitChanges(raw: string): { selected: string[]; freeText: string } {
  if (!raw) return { selected: [], freeText: '' };
  const lines = raw.split('\n').map((l) => l.trim());
  const selected: string[] = [];
  const free: string[] = [];
  for (const line of lines) {
    const stripped = line.replace(/^[—•·-]\s*/, '').trim();
    if (!stripped) continue;
    if (COMMON_CHANGES.includes(stripped)) selected.push(stripped);
    else free.push(stripped);
  }
  return { selected, freeText: free.join('\n') };
}

function joinChanges(selected: string[], freeText: string): string {
  const parts: string[] = [];
  for (const s of selected) parts.push(`— ${s}`);
  const f = freeText.trim();
  if (f) parts.push(f);
  return parts.join('\n');
}

type AvailabilityStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available' }
  | { state: 'taken' }
  | { state: 'unknown'; reason?: string };

function useDomainAvailability(domain: string | null, debounceMs = 0): AvailabilityStatus {
  const [status, setStatus] = useState<AvailabilityStatus>({ state: 'idle' });

  useEffect(() => {
    if (!domain) {
      setStatus({ state: 'idle' });
      return;
    }
    let cancelled = false;
    setStatus({ state: 'checking' });
    const timer = setTimeout(() => {
      fetch(`/api/domain-availability?domain=${encodeURIComponent(domain)}`)
        .then((r) => r.json())
        .then((j: { available: boolean | null; checked: boolean; reason?: string }) => {
          if (cancelled) return;
          if (!j.checked || j.available === null) {
            setStatus({ state: 'unknown', reason: j.reason });
          } else if (j.available) {
            setStatus({ state: 'available' });
          } else {
            setStatus({ state: 'taken' });
          }
        })
        .catch(() => {
          if (!cancelled) setStatus({ state: 'unknown' });
        });
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [domain, debounceMs]);

  return status;
}

function looksLikeDomain(s: string): boolean {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(s.trim());
}

function DomainPicker({
  answers,
  update,
  businessName,
}: {
  answers: Answers;
  update: <K extends keyof Answers>(key: K, value: Answers[K]) => void;
  businessName: string;
}) {
  const suggestions = useMemo(() => suggestDomains(businessName), [businessName]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <SegmentButton
          active={answers.has_existing_domain === true}
          onClick={() => update('has_existing_domain', true)}
          label="I have one"
        />
        <SegmentButton
          active={answers.has_existing_domain === false}
          onClick={() => update('has_existing_domain', false)}
          label="Buy one for me"
        />
      </div>

      {answers.has_existing_domain === true && (
        <input
          type="text"
          inputMode="url"
          placeholder="example.co.uk"
          value={answers.existing_domain}
          onChange={(e) => update('existing_domain', e.target.value)}
          style={inputStyle}
        />
      )}

      {answers.has_existing_domain === false && (
        <div>
          {suggestions.length > 0 && (
            <>
              <p
                style={{
                  margin: '0 0 10px',
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: CREAM_MUTED,
                }}
              >
                Suggestions for {businessName}
              </p>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  marginBottom: 18,
                }}
              >
                {suggestions.map((s) => (
                  <DomainSuggestion
                    key={s}
                    domain={s}
                    active={answers.domain_preferences.includes(s)}
                    onToggle={() => {
                      const cur = answers.domain_preferences.filter((x) => x.trim().length > 0);
                      const isOn = cur.includes(s);
                      const next = isOn
                        ? [...cur.filter((x) => x !== s), '', '', ''].slice(0, 3)
                        : [...cur, s, '', '', ''].slice(0, 3);
                      update('domain_preferences', next);
                    }}
                  />
                ))}
              </div>
            </>
          )}
          <p
            style={{
              margin: '0 0 10px',
              fontSize: 12.5,
              color: 'rgba(15,14,12,0.6)',
            }}
          >
            Or write your top three — we’ll buy the first available.
          </p>
          {[0, 1, 2].map((i) => (
            <ManualDomainInput
              key={i}
              index={i}
              value={answers.domain_preferences[i] ?? ''}
              onChange={(v) => {
                const next = [...answers.domain_preferences];
                next[i] = v;
                update('domain_preferences', next);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DomainSuggestion({
  domain,
  active,
  onToggle,
}: {
  domain: string;
  active: boolean;
  onToggle: () => void;
}) {
  const status = useDomainAvailability(domain);
  const isTaken = status.state === 'taken';
  const isAvailable = status.state === 'available';
  const isChecking = status.state === 'checking';

  const disabled = isTaken;

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      className="oc-press"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 16px',
        background: active ? INK : CREAM,
        color: active ? CREAM : INK,
        border: `1px solid ${active ? INK : isTaken ? 'rgba(168,51,43,0.25)' : 'rgba(15,14,12,0.14)'}`,
        borderRadius: 14,
        fontFamily: 'inherit',
        fontSize: 15,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        boxShadow: active
          ? '0 6px 16px rgba(15,14,12,0.18)'
          : '0 1px 0 rgba(255,255,255,0.6) inset',
        transition: 'all 160ms ease',
      }}
    >
      <span
        style={{
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          letterSpacing: '0.01em',
          fontSize: 14,
          textDecoration: isTaken ? 'line-through' : 'none',
          textDecorationColor: TAKEN_RED,
          flexShrink: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {domain}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <AvailabilityBadge status={status} compact onDark={active} />
        {!disabled && (
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: active ? SIGNAL : isAvailable ? 'rgba(61,158,95,0.14)' : 'rgba(15,14,12,0.06)',
              color: active ? INK : isAvailable ? LIVE_GREEN : 'rgba(15,14,12,0.5)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 700,
              opacity: isChecking ? 0.5 : 1,
            }}
          >
            {active ? '✓' : '+'}
          </span>
        )}
      </span>
    </button>
  );
}

function ManualDomainInput({
  index,
  value,
  onChange,
}: {
  index: number;
  value: string;
  onChange: (v: string) => void;
}) {
  const trimmed = value.trim().toLowerCase();
  const targetDomain = looksLikeDomain(trimmed) ? trimmed : null;
  const status = useDomainAvailability(targetDomain, 600);

  return (
    <div style={{ position: 'relative', marginBottom: 8 }}>
      <input
        type="text"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        placeholder={`#${index + 1} ${['most-wanted', '', 'fallback'][index]}`.trim()}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...inputStyle,
          paddingRight: 110,
          fontFamily: targetDomain
            ? "'JetBrains Mono', ui-monospace, monospace"
            : (inputStyle.fontFamily as string | undefined),
        }}
      />
      {targetDomain && (
        <span
          style={{
            position: 'absolute',
            right: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
          }}
        >
          <AvailabilityBadge status={status} />
        </span>
      )}
    </div>
  );
}

function AvailabilityBadge({
  status,
  compact = false,
  onDark = false,
}: {
  status: AvailabilityStatus;
  compact?: boolean;
  onDark?: boolean;
}) {
  if (status.state === 'idle') return null;
  let bg = 'rgba(15,14,12,0.06)';
  let fg = 'rgba(15,14,12,0.55)';
  let label = '';
  let dot: string | null = null;
  if (status.state === 'checking') {
    label = compact ? '' : 'Checking…';
    fg = onDark ? 'rgba(250,248,245,0.55)' : 'rgba(15,14,12,0.5)';
    bg = onDark ? 'rgba(250,248,245,0.10)' : 'rgba(15,14,12,0.06)';
  } else if (status.state === 'available') {
    label = 'Available';
    fg = LIVE_GREEN;
    bg = 'rgba(61,158,95,0.12)';
    dot = LIVE_GREEN;
  } else if (status.state === 'taken') {
    label = 'Taken';
    fg = TAKEN_RED;
    bg = 'rgba(168,51,43,0.10)';
    dot = TAKEN_RED;
  } else {
    label = compact ? '' : '—';
    fg = 'rgba(15,14,12,0.4)';
  }

  if (compact && status.state === 'checking') {
    return (
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: onDark ? 'rgba(250,248,245,0.4)' : 'rgba(15,14,12,0.25)',
          display: 'inline-block',
          animation: 'pulse 1.0s ease-in-out infinite',
        }}
      />
    );
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 9px',
        borderRadius: 9999,
        background: bg,
        color: fg,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
      }}
    >
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: dot,
            display: 'inline-block',
          }}
        />
      )}
      {label}
    </span>
  );
}

function suggestDomains(businessName: string): string[] {
  const slug = businessName
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug || slug === 'your-business') return [];
  return [`${slug}.co.uk`, `${slug}.com`, `the${slug}.co.uk`];
}

function SegmentButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="oc-press"
      style={{
        flex: 1,
        padding: '14px 16px',
        background: active ? INK : CREAM,
        color: active ? CREAM : INK,
        border: `1px solid ${active ? INK : 'rgba(15,14,12,0.14)'}`,
        borderRadius: 14,
        fontSize: 15,
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'inherit',
        boxShadow: active
          ? '0 6px 16px rgba(15,14,12,0.16)'
          : '0 1px 0 rgba(255,255,255,0.6) inset',
        transition: 'all 160ms ease',
      }}
    >
      {label}
    </button>
  );
}

function PhotoUploader({
  leadId,
  photos,
  onChange,
  onError,
}: {
  leadId: string;
  photos: PhotoEntry[];
  onChange: (next: PhotoEntry[]) => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const urlRes = await fetch(`/api/onboarding/${leadId}/upload-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, content_type: file.type }),
        });
        const j = await urlRes.json();
        if (!urlRes.ok) throw new Error(j.error ?? 'upload-url failed');

        const upRes = await fetch(j.upload_url, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });
        if (!upRes.ok) throw new Error('Upload failed');

        const recordRes = await fetch(`/api/onboarding/${leadId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            append_photo: {
              url: j.public_url,
              filename: file.name,
              content_type: file.type,
            },
          }),
        });
        if (!recordRes.ok) throw new Error('Record save failed');
        const data = await recordRes.json();
        if (data?.data?.photos) onChange(data.data.photos);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <label
        htmlFor="photo-input"
        className="oc-press"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '28px 20px',
          background:
            'linear-gradient(180deg, rgba(184,134,11,0.05) 0%, rgba(184,134,11,0.10) 100%)',
          border: `1.5px dashed rgba(184,134,11,0.40)`,
          borderRadius: 18,
          textAlign: 'center',
          cursor: busy ? 'wait' : 'pointer',
          fontSize: 15,
          color: busy ? CREAM_MUTED : INK,
          transition: 'all 160ms ease',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: SIGNAL,
            color: CREAM,
            fontSize: 20,
            boxShadow: `0 8px 22px ${SIGNAL}55`,
            animation: busy ? 'pulse 1.2s ease-in-out infinite' : undefined,
          }}
        >
          {busy ? '⌛' : '＋'}
        </span>
        <span style={{ fontWeight: 500, marginTop: 2 }}>
          {busy ? 'Uploading…' : 'Add photos'}
        </span>
        <span style={{ fontSize: 12, color: CREAM_MUTED }}>
          JPG, PNG, HEIC — pick as many as you like
        </span>
        <input
          id="photo-input"
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          disabled={busy}
          style={{ display: 'none' }}
        />
      </label>

      {photos.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(82px, 1fr))',
            gap: 8,
            marginTop: 14,
          }}
        >
          {photos.map((p) => (
            <div
              key={p.url}
              style={{
                position: 'relative',
                aspectRatio: '1 / 1',
                borderRadius: 12,
                overflow: 'hidden',
                background: 'rgba(15,14,12,0.06)',
                border: `1px solid ${LINE}`,
                boxShadow: '0 2px 6px rgba(15,14,12,0.08)',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.filename}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  fontSize: 16,
  color: INK,
  background: CREAM,
  border: `1px solid rgba(15,14,12,0.14)`,
  borderRadius: 14,
  outline: 'none',
  fontFamily: 'inherit',
  WebkitAppearance: 'none',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
  lineHeight: 1.55,
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '14px 22px',
  background: `linear-gradient(180deg, ${SIGNAL} 0%, ${SIGNAL_DEEP} 100%)`,
  color: INK,
  border: 'none',
  borderRadius: 9999,
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: '-0.01em',
  cursor: 'pointer',
  fontFamily: 'inherit',
  boxShadow: `0 8px 22px ${SIGNAL}55, inset 0 1px 0 rgba(255,255,255,0.4)`,
  transition: 'transform 140ms ease, box-shadow 160ms ease',
};

const ghostButtonStyle: React.CSSProperties = {
  padding: '10px 14px',
  background: 'transparent',
  color: 'rgba(15,14,12,0.7)',
  border: `1px solid rgba(15,14,12,0.14)`,
  borderRadius: 9999,
  fontSize: 13.5,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'all 140ms ease',
};

const KEYFRAMES_CSS = `
  @keyframes sheetIn {
    from { transform: translateY(40px); opacity: 0; }
    to   { transform: translateY(0); opacity: 1; }
  }
  @keyframes stepIn {
    from { transform: translateY(8px); opacity: 0; }
    to   { transform: translateY(0); opacity: 1; }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  .oc-press { transition: transform 120ms ease, box-shadow 160ms ease, background 160ms ease, color 160ms ease; }
  .oc-press:active:not(:disabled) { transform: scale(0.97); }
  .oc-press:hover:not(:disabled) { transform: translateY(-1px); }
  .oc-chip { transition: transform 140ms ease, box-shadow 160ms ease, background 160ms ease, color 160ms ease; }
  .oc-chip:active:not(:disabled) { transform: scale(0.94); }
`;
