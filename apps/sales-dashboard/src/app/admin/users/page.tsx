'use client';

import { useEffect, useState } from 'react';
import {
  PageHero,
  Card,
  Section,
  Eyebrow,
  Input,
  PrimaryButton,
  GhostButton,
  EmptyState,
  CREAM,
  CREAM_DIM,
  CREAM_MUTED,
  SIGNAL,
  BG_CARD,
  LINE,
  LINE2,
  DISPLAY_FONT,
  MONO_FONT,
  ERR,
} from '@/lib/brand';

interface Salesperson {
  id: string;
  name: string;
  phone: string | null;
  area_postcode: string | null;
  active: boolean;
  created_at: string;
  last_active_at?: string | null;
}

interface JustCreated {
  name: string;
  pin: string;
  area_postcode: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<Salesperson[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [pin, setPin] = useState(randomPin());
  const [postcode, setPostcode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [justCreated, setJustCreated] = useState<JustCreated | null>(null);

  const load = () => {
    fetch('/api/admin/salespeople')
      .then((r) => r.json())
      .then((d) => {
        setUsers(d.data ?? []);
        setLoading(false);
      });
  };

  useEffect(load, []);

  const handleCreate = async () => {
    setError('');
    if (name.trim().length < 2) return setError('Name needs 2+ characters.');
    if (!/^\d{4,6}$/.test(pin)) return setError('PIN must be 4–6 digits.');
    if (postcode.trim().length < 2) return setError('Postcode is required.');

    setCreating(true);
    const res = await fetch('/api/admin/salespeople', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        pin,
        area_postcode: postcode.trim().toUpperCase(),
        phone: phone.trim() || null,
        email: email.trim() || null,
      }),
    });
    const body = await res.json();
    setCreating(false);
    if (!res.ok) {
      setError(body.error ?? `Couldn't create (${res.status})`);
      return;
    }
    setJustCreated({ name: name.trim(), pin, area_postcode: postcode.trim().toUpperCase() });
    setName('');
    setPin(randomPin());
    setPostcode('');
    setPhone('');
    setEmail('');
    load();
  };

  return (
    <div className="py-10">
      <PageHero
        eyebrow="Contractors"
        title="Create"
        accent="logins."
        sub="Every friend you want in the field needs an account. Fill this in once, hand them the PIN, they log in at /site/login.html."
      />

      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Create form */}
        <Card padding="lg">
          <Eyebrow accent>New contractor</Eyebrow>
          <p className="text-[14px] mb-6" style={{ color: CREAM_DIM }}>
            Name + PIN are what they'll use to log in. Postcode is their patch.
          </p>

          <Input
            label="Full name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
          />
          <div className="flex items-end gap-3 mb-4">
            <div className="flex-1">
              <Input
                label="PIN (4–6 digits) *"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="1234"
                inputMode="numeric"
                maxLength={6}
              />
            </div>
            <button
              type="button"
              onClick={() => setPin(randomPin())}
              className="mb-4 px-4 py-3 rounded-xl text-[12px] uppercase"
              style={{
                fontFamily: MONO_FONT,
                letterSpacing: '0.14em',
                color: CREAM_DIM,
                border: `1px solid ${LINE}`,
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              Regenerate
            </button>
          </div>
          <Input
            label="Area postcode *"
            value={postcode}
            onChange={(e) => setPostcode(e.target.value.toUpperCase())}
            placeholder="E8"
            maxLength={5}
          />
          <Input
            label="Phone (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+44 7700 900000"
            type="tel"
          />
          <Input
            label="Email (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            type="email"
          />

          {error && (
            <p className="text-[13px] mb-4" style={{ color: ERR }}>
              {error}
            </p>
          )}

          <div className="flex items-center gap-3">
            <PrimaryButton onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating…' : 'Create account →'}
            </PrimaryButton>
            {justCreated && (
              <span
                className="text-[11px] uppercase"
                style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: SIGNAL }}
              >
                ✓ {justCreated.name} created
              </span>
            )}
          </div>
        </Card>

        {/* Just-created credentials callout */}
        <div>
          {justCreated ? (
            <Card accent padding="lg">
              <Eyebrow accent>Share with your contractor</Eyebrow>
              <p
                className="text-[20px] m-0 mb-4"
                style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, color: CREAM, letterSpacing: '-0.02em' }}
              >
                Here's their login.
              </p>
              <p className="text-[13.5px] mb-5" style={{ color: CREAM_DIM, lineHeight: 1.6 }}>
                Copy these details and send them to {justCreated.name}. This PIN is shown once — we only store a hash.
              </p>
              <CredRow label="Login URL" value={`${typeof window !== 'undefined' ? window.location.origin : ''}/site/login.html`} />
              <CredRow label="Name" value={justCreated.name} />
              <CredRow label="PIN" value={justCreated.pin} accent />
              <CredRow label="Patch" value={justCreated.area_postcode} mono />
              <div className="mt-5 flex gap-2 flex-wrap">
                <PrimaryButton
                  size="sm"
                  onClick={() => {
                    const text = `You're in! Log in at ${window.location.origin}/site/login.html with:\n\nName: ${justCreated.name}\nPIN: ${justCreated.pin}`;
                    navigator.clipboard?.writeText(text);
                  }}
                >
                  Copy message
                </PrimaryButton>
                <GhostButton size="sm" onClick={() => setJustCreated(null)}>
                  Dismiss
                </GhostButton>
              </div>
            </Card>
          ) : (
            <Card padding="lg">
              <Eyebrow>How this works</Eyebrow>
              <ol className="m-0 pl-5 text-[14px]" style={{ color: CREAM_DIM, lineHeight: 1.7 }}>
                <li>Fill in the form on the left.</li>
                <li>We create a real contractor account.</li>
                <li>You copy the name + PIN and send to your friend.</li>
                <li>They log in at <code style={{ color: SIGNAL, fontFamily: MONO_FONT }}>/site/login.html</code> and land in their dashboard.</li>
                <li>You assign leads to them from the <a href="/admin/leads" style={{ color: SIGNAL }}>Leads</a> tab.</li>
              </ol>
            </Card>
          )}
        </div>
      </div>

      <Section eyebrow="All contractors" title="The bench" className="mt-16">
        {loading ? (
          <p
            className="text-[12px] uppercase"
            style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED }}
          >
            Loading…
          </p>
        ) : users.length === 0 ? (
          <EmptyState
            eyebrow="No one yet"
            title="Bench is empty."
            sub="Create your first contractor above. Anyone you add appears here."
          />
        ) : (
          <Card padding="none">
            <div
              className="grid grid-cols-[1fr_140px_160px_120px_90px] gap-4 px-5 py-3 text-[10.5px] uppercase"
              style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED, borderBottom: `1px solid ${LINE}` }}
            >
              <span>Name</span>
              <span>Postcode</span>
              <span>Phone</span>
              <span>Joined</span>
              <span>Status</span>
            </div>
            {users.map((u, i) => (
              <div
                key={u.id}
                className="grid grid-cols-[1fr_140px_160px_120px_90px] gap-4 px-5 py-3.5"
                style={{ borderBottom: i === users.length - 1 ? 'none' : `1px solid ${LINE2}` }}
              >
                <span className="text-[14.5px]" style={{ color: CREAM, fontFamily: DISPLAY_FONT, fontWeight: 500 }}>
                  {u.name}
                </span>
                <span className="text-[13px]" style={{ color: CREAM_DIM, fontFamily: MONO_FONT }}>
                  {u.area_postcode ?? '—'}
                </span>
                <span className="text-[13px]" style={{ color: CREAM_DIM, fontFamily: MONO_FONT }}>
                  {u.phone ?? '—'}
                </span>
                <span
                  className="text-[12px]"
                  style={{ color: CREAM_MUTED, fontFamily: MONO_FONT, letterSpacing: '0.04em' }}
                >
                  {formatDate(u.created_at)}
                </span>
                <span
                  className="text-[11px] uppercase"
                  style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: u.active ? SIGNAL : CREAM_MUTED }}
                >
                  {u.active ? 'Active' : 'Paused'}
                </span>
              </div>
            ))}
          </Card>
        )}
      </Section>
    </div>
  );
}

function CredRow({
  label,
  value,
  accent,
  mono,
}: {
  label: string;
  value: string;
  accent?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 py-2.5 px-4 rounded-xl" style={{ background: BG_CARD, border: `1px solid ${LINE}` }}>
      <span
        className="text-[10.5px] uppercase"
        style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED }}
      >
        {label}
      </span>
      <span
        className="text-[14px] break-all text-right"
        style={{
          fontFamily: mono || accent ? MONO_FONT : DISPLAY_FONT,
          color: accent ? SIGNAL : CREAM,
          fontWeight: accent ? 500 : 400,
          letterSpacing: accent ? '0.08em' : undefined,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase();
}

function randomPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}
