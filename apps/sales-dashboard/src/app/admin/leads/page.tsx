'use client';

import { useEffect, useState } from 'react';
import {
  PageHero,
  Card,
  Section,
  Eyebrow,
  Input,
  Textarea,
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
  area_postcode: string | null;
}

interface LeadRow {
  id: string;
  user_id: string;
  status: string;
  assigned_at: string;
  notes: string | null;
}

export default function AdminLeadsPage() {
  const [users, setUsers] = useState<Salesperson[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);

  // Form state
  const [userId, setUserId] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [address, setAddress] = useState('');
  const [postcode, setPostcode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [googleRating, setGoogleRating] = useState('');
  const [googleReviews, setGoogleReviews] = useState('');
  const [description, setDescription] = useState('');
  const [heroHeadline, setHeroHeadline] = useState('');
  const [ctaText, setCtaText] = useState('');
  const [services, setServices] = useState('');
  const [painPoints, setPainPoints] = useState('');
  const [openingHours, setOpeningHours] = useState('');
  const [trustBadges, setTrustBadges] = useState('');
  const [avoidTopics, setAvoidTopics] = useState('');
  const [demoDomain, setDemoDomain] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [brandPrimary, setBrandPrimary] = useState('');
  const [brandAccent, setBrandAccent] = useState('');

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Drop-zone state
  const [dropActive, setDropActive] = useState(false);
  const [dropMsg, setDropMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedDemoUrl, setUploadedDemoUrl] = useState<string | null>(null);

  const load = () => {
    fetch('/api/admin/salespeople').then((r) => r.json()).then((d) => setUsers(d.data ?? []));
    fetch('/api/admin/leads').then((r) => r.json()).then((d) => setLeads(d.data ?? []));
  };
  useEffect(load, []);

  const reset = () => {
    setBusinessName('');
    setBusinessType('');
    setAddress('');
    setPostcode('');
    setPhone('');
    setEmail('');
    setWebsiteUrl('');
    setGoogleRating('');
    setGoogleReviews('');
    setDescription('');
    setHeroHeadline('');
    setCtaText('');
    setServices('');
    setPainPoints('');
    setOpeningHours('');
    setTrustBadges('');
    setAvoidTopics('');
    setDemoDomain('');
    setContactName('');
    setContactRole('');
    setBrandPrimary('');
    setBrandAccent('');
  };

  // Fill form state from a parsed JSON brief (shape below).
  const applyBrief = (raw: unknown, filename?: string) => {
    if (!raw || typeof raw !== 'object') {
      setDropMsg({ kind: 'err', text: 'Expected a JSON object at the top level.' });
      return;
    }
    const b = raw as Record<string, unknown>;
    const s = (k: string) => (typeof b[k] === 'string' ? (b[k] as string) : '');
    const n = (k: string) => (b[k] == null ? '' : String(b[k]));
    const joinLines = (v: unknown): string => {
      if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x.trim()).join('\n');
      if (typeof v === 'string') return v;
      return '';
    };
    const joinCsv = (v: unknown): string => {
      if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x.trim()).join(', ');
      if (typeof v === 'string') return v;
      return '';
    };

    if (b.user_id && typeof b.user_id === 'string') setUserId(b.user_id);
    setBusinessName(s('business_name'));
    setBusinessType(s('business_type'));
    setAddress(s('address'));
    setPostcode(s('postcode').toUpperCase());
    setPhone(s('phone'));
    setEmail(s('email'));
    setWebsiteUrl(s('website_url'));
    setGoogleRating(n('google_rating'));
    setGoogleReviews(n('google_review_count'));
    setDescription(s('description'));
    setHeroHeadline(s('hero_headline'));
    setCtaText(s('cta_text'));
    setServices(joinLines(b.services));
    setPainPoints(joinLines(b.pain_points));
    setOpeningHours(joinLines(b.opening_hours));
    setTrustBadges(joinCsv(b.trust_badges));
    setAvoidTopics(joinCsv(b.avoid_topics));
    setDemoDomain(s('demo_site_domain'));
    setContactName(s('contact_name'));
    setContactRole(s('contact_role'));
    const brand = b.brand_colours as Record<string, string> | undefined;
    if (brand && typeof brand === 'object') {
      setBrandPrimary(brand.primary ?? '');
      setBrandAccent(brand.accent ?? '');
    }

    setDropMsg({
      kind: 'ok',
      text: `Filled from ${filename ?? 'brief'} · ${s('business_name') || 'unnamed'}`,
    });
  };

  const handleFiles = async (files: FileList | File[]) => {
    setDropMsg(null);
    const arr = Array.from(files);
    const jsonFile = arr.find((f) => /\.json$/i.test(f.name));
    const htmlFile = arr.find((f) => /\.html?$/i.test(f.name));

    // Parse JSON first (we may need business_name as the upload slug)
    let briefBusinessName = '';
    if (jsonFile) {
      try {
        const text = await jsonFile.text();
        const parsed = JSON.parse(text);
        applyBrief(parsed, jsonFile.name);
        if (parsed && typeof parsed === 'object' && typeof (parsed as any).business_name === 'string') {
          briefBusinessName = (parsed as any).business_name;
        }
      } catch {
        setDropMsg({ kind: 'err', text: `Couldn't parse ${jsonFile.name}. Is it valid JSON?` });
        return;
      }
    }

    // Upload HTML demo if present
    if (htmlFile) {
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append('file', htmlFile);
        const slugSource = briefBusinessName || businessName || stripExt(htmlFile.name);
        if (slugSource) fd.append('slug', slugSource);
        const res = await fetch('/api/admin/demo-upload', { method: 'POST', body: fd });
        const body = await res.json();
        if (!res.ok) {
          setDropMsg({ kind: 'err', text: body.error ?? `Upload failed (${res.status})` });
        } else {
          const url = body.data.public_url as string;
          setUploadedDemoUrl(url);
          setDemoDomain(url); // stash on the lead payload
          setDropMsg({
            kind: 'ok',
            text:
              (jsonFile ? `Filled from ${jsonFile.name} · ` : '') +
              `Uploaded ${htmlFile.name} (${body.data.size_kb} KB)`,
          });
        }
      } catch (err) {
        setDropMsg({ kind: 'err', text: 'Network error uploading demo.' });
      } finally {
        setUploading(false);
      }
    }

    if (!jsonFile && !htmlFile) {
      setDropMsg({ kind: 'err', text: 'Drop a .json brief or an .html demo (or both).' });
    }
  };

  const stripExt = (filename: string) => filename.replace(/\.[^.]+$/, '');

  const handleCreate = async () => {
    setError('');
    setSuccess('');
    if (!userId) return setError('Pick a contractor to assign this lead to.');
    if (businessName.trim().length < 2) return setError('Business name is required.');

    const brand_colours = brandPrimary || brandAccent
      ? { primary: brandPrimary || undefined, accent: brandAccent || undefined }
      : null;

    setCreating(true);
    const res = await fetch('/api/admin/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        business_name: businessName,
        business_type: businessType,
        address,
        postcode,
        phone,
        email,
        website_url: websiteUrl,
        google_rating: googleRating,
        google_review_count: googleReviews,
        description,
        hero_headline: heroHeadline,
        cta_text: ctaText,
        services,       // comma/newline separated
        pain_points: painPoints,
        opening_hours: openingHours,
        trust_badges: trustBadges,
        avoid_topics: avoidTopics,
        demo_site_domain: demoDomain,
        contact_name: contactName,
        contact_role: contactRole,
        brand_colours,
      }),
    });
    const body = await res.json();
    setCreating(false);
    if (!res.ok) {
      setError(body.error ?? `Couldn't create lead (${res.status})`);
      return;
    }
    const uName = users.find((u) => u.id === userId)?.name ?? 'contractor';
    setSuccess(`Assigned "${body.data?.business_name}" to ${uName}.`);
    reset();
    load();
  };

  return (
    <div className="py-10">
      <PageHero
        eyebrow="Leads"
        title="Hand out"
        accent="a lead."
        sub="Fill in the business details. The richer you make it, the better the contractor's pitch card looks. Only Name + Contractor are required — everything else is optional polish."
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Form */}
        <Card padding="lg">
          <Eyebrow accent>New lead</Eyebrow>

          <div className="mb-5">
            <div
              className="text-[10.5px] uppercase mb-2"
              style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED }}
            >
              Assign to *
            </div>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-[15px] outline-none"
              style={{
                background: BG_CARD,
                border: `1px solid ${LINE}`,
                color: userId ? CREAM : CREAM_MUTED,
                fontFamily: 'inherit',
              }}
            >
              <option value="">— pick a contractor —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} {u.area_postcode ? `· ${u.area_postcode}` : ''}
                </option>
              ))}
            </select>
          </div>

          <SubHead label="Business basics" />
          <Input label="Business name *" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Mario's Deli" />
          <div className="grid md:grid-cols-2 gap-4">
            <Input label="Business type" value={businessType} onChange={(e) => setBusinessType(e.target.value)} placeholder="Italian deli & cafe" />
            <Input label="Postcode (outward)" value={postcode} onChange={(e) => setPostcode(e.target.value.toUpperCase())} placeholder="E8" />
          </div>
          <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="142 Wilton Way, London E8 3BA" />
          <div className="grid md:grid-cols-2 gap-4">
            <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+44 20 7249 0214" />
            <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@example.co.uk" />
          </div>
          <Input label="Existing website URL" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://their-old-site.co.uk" />
          <div className="grid md:grid-cols-2 gap-4">
            <Input label="Google rating" value={googleRating} onChange={(e) => setGoogleRating(e.target.value)} placeholder="4.7" type="number" />
            <Input label="Google review count" value={googleReviews} onChange={(e) => setGoogleReviews(e.target.value)} placeholder="184" type="number" />
          </div>

          <SubHead label="The brief" />
          <Textarea label="Short description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Family-run since 1994. Strong local following…" />
          <div className="grid md:grid-cols-2 gap-4">
            <Input label="Hero headline" value={heroHeadline} onChange={(e) => setHeroHeadline(e.target.value)} placeholder="Fresh from the counter." />
            <Input label="CTA text" value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder="Order ahead →" />
          </div>

          <SubHead label="Talking hooks (one per line)" />
          <Textarea label="Services offered" value={services} onChange={(e) => setServices(e.target.value)} rows={3} placeholder={'Handmade sandwiches\nItalian coffee\nCatering'} />
          <Textarea label="Pain points / pitch hooks" value={painPoints} onChange={(e) => setPainPoints(e.target.value)} rows={3} placeholder={'No website — customers only find them via Instagram\nCan\'t take pre-orders — queue turns people away'} />
          <Textarea label="Opening hours" value={openingHours} onChange={(e) => setOpeningHours(e.target.value)} rows={3} placeholder={'Mon–Fri 7:00–18:00\nSat 8:00–17:00\nSun closed'} />

          <SubHead label="Optional polish" />
          <Textarea label="Trust badges" value={trustBadges} onChange={(e) => setTrustBadges(e.target.value)} rows={2} placeholder={'Est. 1994, Family-owned, Hackney favourite'} hint="Comma or newline separated." />
          <Textarea label="Don't-mention topics" value={avoidTopics} onChange={(e) => setAvoidTopics(e.target.value)} rows={2} placeholder="Franchising, chain comparisons" />
          <div className="grid md:grid-cols-2 gap-4">
            <Input label="Contact person" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Mario Gallinaro" />
            <Input label="Their role" value={contactRole} onChange={(e) => setContactRole(e.target.value)} placeholder="Owner" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Input label="Brand primary hex" value={brandPrimary} onChange={(e) => setBrandPrimary(e.target.value)} placeholder="#B8860B" />
            <Input label="Brand accent hex" value={brandAccent} onChange={(e) => setBrandAccent(e.target.value)} placeholder="#3C2820" />
          </div>
          <Input label="Demo site domain" value={demoDomain} onChange={(e) => setDemoDomain(e.target.value)} placeholder="marios-deli.shop" />

          {error && (
            <p className="text-[13px] mb-4" style={{ color: ERR }}>
              {error}
            </p>
          )}
          {success && (
            <p className="text-[13px] mb-4" style={{ color: SIGNAL }}>
              ✓ {success}
            </p>
          )}

          <div className="flex gap-3 mt-2">
            <PrimaryButton onClick={handleCreate} disabled={creating}>
              {creating ? 'Sending…' : 'Hand out lead →'}
            </PrimaryButton>
            <GhostButton onClick={reset}>Clear form</GhostButton>
          </div>
        </Card>

        {/* Live preview + drop zone */}
        <div className="flex flex-col gap-5">
          <Card padding="lg">
            <Eyebrow accent>What they'll see</Eyebrow>
            <div
              className="rounded-xl p-5 mt-2"
              style={{
                background:
                  brandPrimary && brandAccent
                    ? `linear-gradient(135deg, ${brandPrimary}, ${brandAccent})`
                    : 'linear-gradient(135deg, rgb(184 134 11), rgb(60 40 25))',
                minHeight: 160,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <p
                className="m-0 text-[22px]"
                style={{
                  fontFamily: DISPLAY_FONT,
                  fontWeight: 500,
                  color: 'white',
                  letterSpacing: '-0.025em',
                  textShadow: '0 1px 16px rgb(0 0 0 / 0.3)',
                }}
              >
                {heroHeadline || 'Hero headline here'}
              </p>
              {ctaText && (
                <span
                  className="mt-3 px-3 py-1.5 rounded-full text-[12px] inline-block w-fit"
                  style={{ background: 'rgb(20 20 19 / 0.85)', color: 'white' }}
                >
                  {ctaText}
                </span>
              )}
            </div>
            <div className="mt-4">
              <p
                className="m-0 text-[20px]"
                style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, color: CREAM, letterSpacing: '-0.02em' }}
              >
                {businessName || 'Business name'}
              </p>
              <p className="m-0 text-[13px] mt-1" style={{ color: CREAM_DIM }}>
                {[businessType, postcode].filter(Boolean).join(' · ') || 'Type · Postcode'}
              </p>
              {description && (
                <p className="mt-3 text-[13px]" style={{ color: CREAM_DIM, lineHeight: 1.55 }}>
                  {description}
                </p>
              )}
            </div>
          </Card>

          {/* JSON brief drop zone */}
          <label
            htmlFor="brief-file"
            onDragOver={(e) => {
              e.preventDefault();
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDropActive(false);
              if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
            }}
            className="rounded-2xl p-6 text-center cursor-pointer transition-colors"
            style={{
              background: dropActive ? 'rgb(184 134 11 / 0.08)' : BG_CARD,
              border: `2px dashed ${dropActive ? SIGNAL : 'rgb(255 255 255 / 0.12)'}`,
              display: 'block',
            }}
          >
            <div
              className="text-[10.5px] uppercase mb-3"
              style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: SIGNAL }}
            >
              / Claude Desktop handoff
            </div>
            <p
              className="text-[16px] m-0 mb-1"
              style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, color: CREAM, letterSpacing: '-0.015em' }}
            >
              Drop the brief + demo site
            </p>
            <p className="text-[12.5px] m-0" style={{ color: CREAM_DIM, lineHeight: 1.55 }}>
              JSON fills the form. HTML uploads and becomes the live demo link. Drop both at
              once, or <span style={{ color: SIGNAL, textDecoration: 'underline' }}>click to browse</span>.
            </p>
            <input
              id="brief-file"
              type="file"
              accept=".json,.html,.htm,application/json,text/html"
              multiple
              onChange={(e) => {
                if (e.target.files?.length) handleFiles(e.target.files);
                e.target.value = '';
              }}
              style={{ display: 'none' }}
            />
            {uploading && (
              <p
                className="text-[11.5px] uppercase mt-3 mb-0"
                style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED }}
              >
                Uploading demo…
              </p>
            )}
            {dropMsg && !uploading && (
              <p
                className="text-[12.5px] mt-3 mb-0"
                style={{
                  color: dropMsg.kind === 'ok' ? SIGNAL : ERR,
                  fontFamily: MONO_FONT,
                  letterSpacing: '0.04em',
                }}
              >
                {dropMsg.kind === 'ok' ? '✓ ' : '✗ '}
                {dropMsg.text}
              </p>
            )}
            {uploadedDemoUrl && (
              <a
                href={uploadedDemoUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[11px] mt-2 inline-block"
                style={{
                  fontFamily: MONO_FONT,
                  letterSpacing: '0.08em',
                  color: SIGNAL,
                  textDecoration: 'underline',
                  wordBreak: 'break-all',
                }}
              >
                Open uploaded demo ↗
              </a>
            )}
          </label>

          {/* Schema hint */}
          <Card padding="md">
            <div
              className="text-[10px] uppercase mb-2"
              style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED }}
            >
              Ask Claude Desktop for this shape
            </div>
            <pre
              className="text-[11px] m-0 overflow-auto"
              style={{ fontFamily: MONO_FONT, color: CREAM_DIM, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}
            >{`{
  "business_name": "Mario's Deli",
  "business_type": "Italian deli & cafe",
  "address": "142 Wilton Way, London E8 3BA",
  "postcode": "E8",
  "phone": "+44 20 7249 0214",
  "email": "owner@example.co.uk",
  "website_url": "https://existing-site.co.uk",
  "google_rating": 4.7,
  "google_review_count": 184,
  "description": "Short paragraph on what they do…",
  "hero_headline": "Fresh from the counter.",
  "cta_text": "Order ahead →",
  "services": ["…", "…"],
  "pain_points": ["…", "…"],
  "opening_hours": ["Mon–Fri 7:00–18:00", "…"],
  "trust_badges": ["Est. 1994", "Family-owned"],
  "avoid_topics": ["Franchising"],
  "contact_name": "Mario",
  "contact_role": "Owner",
  "brand_colours": { "primary": "#B8860B", "accent": "#3C2820" },
  "demo_site_domain": "marios-deli.shop"
}`}</pre>
          </Card>
        </div>
      </div>

      <Section eyebrow="All leads" title="What you've handed out" className="mt-16">
        {leads.length === 0 ? (
          <EmptyState
            eyebrow="Nothing yet"
            title="No leads yet."
            sub="Fill in the form and press 'Hand out lead'. It drops into the contractor's dashboard immediately."
          />
        ) : (
          <Card padding="none">
            <div
              className="grid grid-cols-[1fr_160px_120px_100px] gap-4 px-5 py-3 text-[10.5px] uppercase"
              style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED, borderBottom: `1px solid ${LINE}` }}
            >
              <span>Business</span>
              <span>Contractor</span>
              <span>Assigned</span>
              <span>Status</span>
            </div>
            {leads.map((l, i) => {
              const n = safeParse(l.notes, {} as any);
              const contractor = users.find((u) => u.id === l.user_id)?.name ?? l.user_id.slice(0, 8);
              return (
                <div
                  key={l.id}
                  className="grid grid-cols-[1fr_160px_120px_100px] gap-4 px-5 py-3.5"
                  style={{ borderBottom: i === leads.length - 1 ? 'none' : `1px solid ${LINE2}` }}
                >
                  <div>
                    <p
                      className="m-0 text-[14.5px]"
                      style={{ color: CREAM, fontFamily: DISPLAY_FONT, fontWeight: 500 }}
                    >
                      {n.business_name ?? 'Unknown'}
                    </p>
                    <p className="m-0 text-[12px]" style={{ color: CREAM_DIM }}>
                      {n.business_type ?? '—'}
                    </p>
                  </div>
                  <span className="text-[13px] self-center" style={{ color: CREAM_DIM }}>
                    {contractor}
                  </span>
                  <span
                    className="text-[12px] self-center"
                    style={{ color: CREAM_MUTED, fontFamily: MONO_FONT, letterSpacing: '0.04em' }}
                  >
                    {formatDate(l.assigned_at)}
                  </span>
                  <span
                    className="self-center text-[11px] uppercase"
                    style={{
                      fontFamily: MONO_FONT,
                      letterSpacing: '0.14em',
                      color: statusColour(l.status),
                    }}
                  >
                    {l.status}
                  </span>
                </div>
              );
            })}
          </Card>
        )}
      </Section>
    </div>
  );
}

function SubHead({ label }: { label: string }) {
  return (
    <div
      className="text-[10px] uppercase mt-6 mb-3"
      style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: SIGNAL }}
    >
      / {label}
    </div>
  );
}

function safeParse<T>(v: string | null, fallback: T): T {
  if (!v) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase();
}

function statusColour(status: string): string {
  if (status === 'new') return 'rgb(140 160 200)';
  if (status === 'visited') return CREAM_DIM;
  if (status === 'pitched') return 'rgb(220 150 80)';
  if (status === 'sold') return SIGNAL;
  return CREAM_MUTED;
}
