/**
 * /onboarding/[leadId] — bottom-sheet form rendered over a peek of the demo.
 *
 * The demo iframe sits behind the sheet so the customer can still see what
 * they're buying while filling in the form. Sheet is ~62% of viewport height
 * and scrollable internally.
 *
 * Auto-saves every change debounced 500ms. "Continue to payment" pre-warms
 * the Stripe Checkout URL on mount and redirects on click.
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const INK = '#0F0E0C';
const CREAM = '#FAF8F5';
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
    question: 'Best mobile to text you on?',
    sub: 'Updates and check-ins only. We won’t spam.',
  },
  changes: {
    eyebrow: '02 / 05',
    question: 'Any first-day tweaks?',
    sub: 'Tap any that apply, or write your own. We’ll handle bigger asks after launch.',
  },
  photos: {
    eyebrow: '03 / 05',
    question: 'Add photos of your business',
    sub: 'Storefront, products, food, a smiling face. As many as you like.',
  },
  domain: {
    eyebrow: '04 / 05',
    question: 'Got a domain already?',
    sub: 'If not, we’ll buy one for you.',
  },
  else: {
    eyebrow: '05 / 05',
    question: 'Anything else we should know?',
    sub: 'Optional. 30 seconds, max.',
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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate answers from server on mount (resume if customer returns later).
  useEffect(() => {
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
      .catch(() => undefined);
  }, [leadId]);

  // Pre-warm Stripe Checkout URL. Bounce to /paid if already sold.
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
      {/* Demo iframe — peeks above the sheet. Pointer events disabled so taps
          fall through to the sheet drag area if user reaches up there. */}
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
          }}
        />
      ) : null}

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
              background: '#3D9E5F',
              display: 'inline-block',
              boxShadow: '0 0 6px #3D9E5F',
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
          height: 'min(72dvh, 640px)',
          background: CREAM,
          color: INK,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          boxShadow: '0 -18px 48px rgba(15,14,12,0.36)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10,
        }}
      >
        {/* Drag handle */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            paddingTop: 10,
            paddingBottom: 6,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: 'rgba(15,14,12,0.18)',
            }}
          />
        </div>

        {/* Header: progress bar + step label + save indicator */}
        <header
          style={{
            padding: '6px 22px 14px',
            borderBottom: `1px solid ${LINE}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              height: 3,
              background: 'rgba(15,14,12,0.08)',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progressPct}%`,
                background: SIGNAL,
                transition: 'width 220ms ease',
              }}
            />
          </div>
          <div
            style={{
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
              Setting up · {stepIndex + 1}/{STEPS.length}
            </span>
            <SaveIndicator state={savingState} />
          </div>
        </header>

        {/* Scrollable question content */}
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 22px 16px',
            WebkitOverflowScrolling: 'touch',
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
              marginBottom: 10,
            }}
          >
            {LABELS[step].eyebrow}
          </p>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 500,
              letterSpacing: '-0.025em',
              lineHeight: 1.18,
              color: INK,
              marginBottom: 6,
            }}
          >
            {LABELS[step].question}
          </h1>
          {LABELS[step].sub && (
            <p
              style={{
                margin: 0,
                fontSize: 14,
                lineHeight: 1.5,
                color: 'rgba(15,14,12,0.6)',
                marginBottom: 22,
              }}
            >
              {LABELS[step].sub}
            </p>
          )}

          {step === 'contact' && (
            <PhoneInput
              value={answers.contact_phone}
              onChange={(v) => update('contact_phone', v)}
            />
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
        </main>

        {/* Action row pinned to sheet bottom */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px 22px calc(env(safe-area-inset-bottom) + 16px)',
            borderTop: `1px solid ${LINE}`,
            flexShrink: 0,
            background: CREAM,
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
          >
            Back
          </button>
          {isLastStep ? (
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
      </section>
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

/** UK phone — formats "07712 345678" while typing. */
function PhoneInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const formatted = useMemo(() => formatUkPhone(value), [value]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span
        style={{
          padding: '14px 12px',
          background: 'rgba(15,14,12,0.05)',
          border: `1px solid rgba(15,14,12,0.16)`,
          borderRadius: 12,
          fontSize: 16,
          fontFamily: 'inherit',
          color: 'rgba(15,14,12,0.55)',
          flexShrink: 0,
        }}
      >
        🇬🇧 UK
      </span>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        placeholder="07712 345678"
        value={formatted}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }}
      />
    </div>
  );
}

function formatUkPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)} ${digits.slice(5)}`;
}

/** Chip-picker for common changes plus a free-text "more" field.
 * Stored as a single string in `top_changes` — chips serialise to lines
 * starting "— " so we can re-split on hydrate. */
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
          marginBottom: 14,
        }}
      >
        {COMMON_CHANGES.map((chip) => {
          const active = selected.includes(chip);
          return (
            <button
              key={chip}
              type="button"
              onClick={() => toggleChip(chip)}
              style={{
                padding: '8px 14px',
                borderRadius: 9999,
                fontSize: 13.5,
                fontWeight: 500,
                fontFamily: 'inherit',
                cursor: 'pointer',
                background: active ? INK : 'transparent',
                color: active ? CREAM : INK,
                border: `1px solid ${active ? INK : 'rgba(15,14,12,0.18)'}`,
                transition: 'all 0.12s ease',
              }}
            >
              {active ? '✓ ' : '+ '}
              {chip}
            </button>
          );
        })}
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
      <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
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
          {suggestions.length > 0 && (
            <>
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: CREAM_MUTED,
                  marginBottom: 8,
                }}
              >
                Suggestions
              </p>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                {suggestions.map((s) => {
                  const active = answers.domain_preferences.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        const cur = answers.domain_preferences.filter((x) => x.trim().length > 0);
                        if (active) {
                          const next = [...cur.filter((x) => x !== s), '', '', ''].slice(0, 3);
                          update('domain_preferences', next);
                        } else {
                          const next = [...cur, s, '', '', ''].slice(0, 3);
                          update('domain_preferences', next);
                        }
                      }}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 9999,
                        fontSize: 13.5,
                        fontWeight: 500,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        background: active ? INK : 'transparent',
                        color: active ? CREAM : INK,
                        border: `1px solid ${active ? INK : 'rgba(15,14,12,0.18)'}`,
                      }}
                    >
                      {active ? '✓ ' : '+ '}
                      {s}
                    </button>
                  );
                })}
              </div>
            </>
          )}
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

function suggestDomains(businessName: string): string[] {
  const slug = businessName
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug || slug === 'your-business') return [];
  return [`${slug}.co.uk`, `${slug}.com`, `the${slug}.co.uk`];
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
      type="button"
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
        transition: 'all 0.12s ease',
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
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '24px 20px',
          background: 'rgba(15,14,12,0.04)',
          border: `1.5px dashed rgba(15,14,12,0.25)`,
          borderRadius: 14,
          textAlign: 'center',
          cursor: busy ? 'wait' : 'pointer',
          fontSize: 15,
          color: busy ? CREAM_MUTED : INK,
        }}
      >
        <span style={{ fontSize: 26, lineHeight: 1 }}>{busy ? '⌛' : '📷'}</span>
        <span style={{ fontWeight: 500 }}>{busy ? 'Uploading…' : 'Tap to add photos'}</span>
        <span style={{ fontSize: 12, color: CREAM_MUTED }}>JPG, PNG, HEIC — multiple OK</span>
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
            gridTemplateColumns: 'repeat(auto-fill, minmax(86px, 1fr))',
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
                borderRadius: 10,
                overflow: 'hidden',
                background: 'rgba(15,14,12,0.06)',
                border: `1px solid ${LINE}`,
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
  padding: '14px 22px',
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
  padding: '14px 18px',
  background: 'transparent',
  color: INK,
  border: `1px solid rgba(15,14,12,0.18)`,
  borderRadius: 12,
  fontSize: 15,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
