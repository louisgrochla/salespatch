/**
 * /onboarding/[leadId]  —  customer PRE-payment 5-question form.
 *
 * Public, no auth. Customer arrives here from the "Go live now" button on
 * /preview/[leadId]. Each field auto-saves via POST /api/onboarding/[leadId]
 * (debounced 500ms) so a customer who bails mid-form leaves us their answers
 * even before they pay. The final step → Continue to payment redirects to
 * Stripe Checkout. Stripe success_url then lands on /paid/[leadId].
 *
 * If a customer revisits this URL after paying, we redirect to /paid (no
 * point editing the form post-purchase — the build kicks off in the webhook).
 *
 * Questions (locked 2026-04-25):
 *   1. Confirm contact (mobile to text on)
 *   2. Top 3 changes for day 1 (optional textarea)
 *   3. Photos — direct upload to Supabase Storage `customer-uploads`
 *   4. Domain — toggle: have one? → capture / no? → top 3 preferences
 *   5. Anything else? (optional)
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

const INK = '#0F0E0C';
const INK_SOFT = '#1A1814';
const CREAM = '#FAF8F5';
const CREAM_DIM = '#D4CFC4';
const CREAM_MUTED = '#9A9489';
const SIGNAL = '#B8860B';
const LINE = 'rgba(15,14,12,0.10)';

type StepKey = 'contact' | 'changes' | 'photos' | 'domain' | 'else';
const STEPS: StepKey[] = ['contact', 'changes', 'photos', 'domain', 'else'];

interface PhotoEntry {
  url: string;
  filename: string;
  uploaded_at: string;
}

interface Answers {
  contact_phone: string;
  top_changes: string;
  has_existing_domain: boolean | null;
  existing_domain: string;
  domain_preferences: string[];
  anything_else: string;
  photos: PhotoEntry[];
}

const EMPTY: Answers = {
  contact_phone: '',
  top_changes: '',
  has_existing_domain: null,
  existing_domain: '',
  domain_preferences: ['', '', ''],
  anything_else: '',
  photos: [],
};

const LABELS: Record<StepKey, { eyebrow: string; question: string; sub?: string }> = {
  contact: {
    eyebrow: '01 / 05',
    question: 'What\u2019s the best mobile to text you on?',
    sub: 'We\u2019ll send updates and check-ins here. We won\u2019t spam.',
  },
  changes: {
    eyebrow: '02 / 05',
    question: 'Top 3 things to change for day 1?',
    sub: 'Optional. Bigger asks come after launch — we want you live first.',
  },
  photos: {
    eyebrow: '03 / 05',
    question: 'Add photos of your business',
    sub: 'Storefront, products, food, a smiling face. Drop in as many as you like.',
  },
  domain: {
    eyebrow: '04 / 05',
    question: 'Do you already have a domain name?',
    sub: 'If not, we can buy one for you.',
  },
  else: {
    eyebrow: '05 / 05',
    question: 'Anything else we should know?',
    sub: 'Optional. 30-second cap.',
  },
};

export default function OnboardingPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params?.leadId as string;
  const [step, setStep] = useState<StepKey>('contact');
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate answers from server on mount so refresh + return-later works.
  useEffect(() => {
    if (!leadId) return;
    fetch(`/api/onboarding/${leadId}`)
      .then((r) => r.json())
      .then((j) => {
        const d = j.data;
        if (!d) return;
        setAnswers({
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
      })
      .catch(() => {
        // Silent — first-time customer has no row yet.
      });
  }, [leadId]);

  // Pre-warm the Stripe Checkout URL so the "Continue to payment" tap is
  // instant. If the customer has already paid, bounce to /paid.
  useEffect(() => {
    if (!leadId) return;
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
      .catch((err) => {
        console.error('checkout url fetch failed', err);
      });
  }, [leadId, router]);

  // Auto-save on any answer change. Debounced 500ms.
  const queueSave = (patch: Partial<Answers>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSavingState('saving');
    saveTimer.current = setTimeout(async () => {
      try {
        const body: Record<string, unknown> = {};
        if ('contact_phone' in patch) body.contact_phone = patch.contact_phone;
        if ('top_changes' in patch) body.top_changes = patch.top_changes;
        if ('anything_else' in patch) body.anything_else = patch.anything_else;
        if ('has_existing_domain' in patch)
          body.has_existing_domain = patch.has_existing_domain;
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

  const continueToPayment = async () => {
    setCheckoutLoading(true);
    setError(null);
    // Mark the form complete so we have a clean signal in the DB regardless
    // of whether the customer actually pays. Fire-and-forget — don't block
    // the redirect on it.
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
      setError('Checkout is not ready yet — please try again in a moment.');
      setCheckoutLoading(false);
      return;
    }
    window.location.href = url;
  };

  const back = () => {
    const i = STEPS.indexOf(step);
    if (i <= 0) return;
    setStep(STEPS[i - 1]);
  };

  return (
    <div
      style={{
        margin: 0,
        padding: 0,
        background: CREAM,
        minHeight: '100dvh',
        color: INK,
        fontFamily:
          "'Inter Tight', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: '20px 22px',
          borderBottom: `1px solid ${LINE}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <span
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 11,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: SIGNAL,
          }}
        >
          Setting up · {STEPS.indexOf(step) + 1}/{STEPS.length}
        </span>
        <SaveIndicator state={savingState} />
      </header>

      {/* Question card */}
      <main
        style={{
          flex: 1,
          padding: '32px 22px 64px',
          maxWidth: 560,
          width: '100%',
          marginLeft: 'auto',
          marginRight: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 11,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: CREAM_MUTED,
            marginBottom: 12,
          }}
        >
          {LABELS[step].eyebrow}
        </p>
        <h1
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 500,
            letterSpacing: '-0.025em',
            lineHeight: 1.18,
            color: INK,
            marginBottom: 8,
          }}
        >
          {LABELS[step].question}
        </h1>
        {LABELS[step].sub && (
          <p
            style={{
              margin: 0,
              fontSize: 14.5,
              lineHeight: 1.55,
              color: 'rgba(15,14,12,0.6)',
              marginBottom: 28,
            }}
          >
            {LABELS[step].sub}
          </p>
        )}

        {step === 'contact' && (
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="07…"
            value={answers.contact_phone}
            onChange={(e) => update('contact_phone', e.target.value)}
            style={inputStyle}
          />
        )}

        {step === 'changes' && (
          <textarea
            placeholder="e.g. swap the hero photo, add Sunday hours, change the colour…"
            rows={6}
            value={answers.top_changes}
            onChange={(e) => update('top_changes', e.target.value)}
            style={textareaStyle}
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
          <DomainPicker answers={answers} update={update} />
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

        {/* Action row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 32,
            gap: 12,
          }}
        >
          <button
            onClick={back}
            disabled={STEPS.indexOf(step) === 0}
            style={{
              ...ghostButtonStyle,
              opacity: STEPS.indexOf(step) === 0 ? 0.3 : 1,
              pointerEvents: STEPS.indexOf(step) === 0 ? 'none' : 'auto',
            }}
          >
            Back
          </button>
          {STEPS.indexOf(step) === STEPS.length - 1 ? (
            <button
              onClick={continueToPayment}
              disabled={checkoutLoading}
              style={{
                ...primaryButtonStyle,
                opacity: checkoutLoading ? 0.6 : 1,
                cursor: checkoutLoading ? 'wait' : 'pointer',
              }}
            >
              {checkoutLoading ? 'Opening checkout…' : 'Continue to payment →'}
            </button>
          ) : (
            <button onClick={advance} style={primaryButtonStyle}>
              Next →
            </button>
          )}
        </div>

        {error && (
          <p style={{ marginTop: 16, color: '#A8332B', fontSize: 13 }}>{error}</p>
        )}
      </main>
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
        fontSize: 11,
        letterSpacing: '0.10em',
        color: state === 'error' ? '#A8332B' : CREAM_MUTED,
      }}
    >
      {map[state]}
    </span>
  );
}

function DomainPicker({
  answers,
  update,
}: {
  answers: Answers;
  update: <K extends keyof Answers>(key: K, value: Answers[K]) => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <ToggleButton
          active={answers.has_existing_domain === true}
          onClick={() => update('has_existing_domain', true)}
          label="Yes, I have one"
        />
        <ToggleButton
          active={answers.has_existing_domain === false}
          onClick={() => update('has_existing_domain', false)}
          label="No, please buy one"
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
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: 'rgba(15,14,12,0.6)',
              marginBottom: 10,
            }}
          >
            Top 3 names you’d like, in order. We’ll buy the first available.
          </p>
          {[0, 1, 2].map((i) => (
            <input
              key={i}
              type="text"
              placeholder={`#${i + 1} ${['most-wanted', '', 'fallback'][i]}`.trim()}
              value={answers.domain_preferences[i] ?? ''}
              onChange={(e) => {
                const next = [...answers.domain_preferences];
                next[i] = e.target.value;
                update('domain_preferences', next);
              }}
              style={{ ...inputStyle, marginBottom: 10 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ToggleButton({
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
      onClick={onClick}
      style={{
        flex: 1,
        padding: '14px 16px',
        background: active ? INK : 'transparent',
        color: active ? CREAM : INK,
        border: `1px solid ${active ? INK : 'rgba(15,14,12,0.18)'}`,
        borderRadius: 12,
        fontSize: 15,
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.15s ease',
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
        style={{
          display: 'block',
          padding: '24px',
          background: 'rgba(15,14,12,0.04)',
          border: `1px dashed rgba(15,14,12,0.25)`,
          borderRadius: 14,
          textAlign: 'center',
          cursor: busy ? 'wait' : 'pointer',
          fontSize: 15,
          color: busy ? CREAM_MUTED : INK,
        }}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          disabled={busy}
          style={{ display: 'none' }}
        />
        {busy ? 'Uploading…' : '+ Add photos'}
      </label>

      {photos.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '20px 0 0', padding: 0, display: 'grid', gap: 8 }}>
          {photos.map((p) => (
            <li
              key={p.url}
              style={{
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontSize: 12,
                color: CREAM_MUTED,
                padding: '8px 12px',
                background: 'rgba(15,14,12,0.03)',
                borderRadius: 8,
              }}
            >
              ✓ {p.filename}
            </li>
          ))}
        </ul>
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
  border: `1px solid rgba(15,14,12,0.16)`,
  borderRadius: 12,
  outline: 'none',
  fontFamily: 'inherit',
  WebkitAppearance: 'none',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
  lineHeight: 1.55,
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '14px 24px',
  background: INK,
  color: CREAM,
  border: 'none',
  borderRadius: 12,
  fontSize: 15,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const ghostButtonStyle: React.CSSProperties = {
  padding: '14px 20px',
  background: 'transparent',
  color: INK,
  border: `1px solid rgba(15,14,12,0.18)`,
  borderRadius: 12,
  fontSize: 15,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

// Suppress unused-warning for INK_SOFT — kept for future hover states.
void INK_SOFT;
void CREAM_DIM;
