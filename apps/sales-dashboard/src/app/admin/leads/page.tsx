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

  // Sales-brief extensions (new Claude Desktop fields)
  const [hook, setHook] = useState('');
  const [opener, setOpener] = useState('');
  const [demoMoments, setDemoMoments] = useState('');
  const [closeScript, setCloseScript] = useState('');
  const [nextVisitReason, setNextVisitReason] = useState('');
  const [specificObjections, setSpecificObjections] = useState<Array<{ objection: string; response: string }>>([]);

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
    setHook('');
    setOpener('');
    setDemoMoments('');
    setCloseScript('');
    setNextVisitReason('');
    setSpecificObjections([]);
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

    // Sales-brief extensions
    setHook(s('hook'));
    setOpener(s('opener'));
    setCloseScript(s('close_script'));
    setNextVisitReason(s('next_visit_reason'));
    setDemoMoments(joinLines(b.demo_moments));
    const objs = Array.isArray(b.specific_objections) ? b.specific_objections : [];
    setSpecificObjections(
      objs
        .filter((x: unknown) => x && typeof x === 'object')
        .map((x: any) => ({
          objection: String(x.objection ?? '').trim(),
          response: String(x.response ?? '').trim(),
        }))
        .filter((p: { objection: string }) => p.objection.length > 0),
    );

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
        // Sales-brief extensions
        hook,
        opener,
        demo_moments: demoMoments,
        close_script: closeScript,
        next_visit_reason: nextVisitReason,
        specific_objections: specificObjections.filter((p) => p.objection.trim().length > 0),
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

          <SubHead label="Sales brief" />
          <Input label="Hook (≤18 words)" value={hook} onChange={(e) => setHook(e.target.value)} placeholder="Amy runs monthly book clubs that fill up — every booking goes through DMs and she turns people away." />
          <Textarea label="Opener — exact first line at the door (≤30 words)" value={opener} onChange={(e) => setOpener(e.target.value)} rows={2} placeholder="Hi, is Amy in? I'm Kevin. I noticed Fable's got 5.0 from 60 reviews and I thought you'd want to see something we built." />
          <Textarea label="Demo moments (one per line, ≤14 words each)" value={demoMoments} onChange={(e) => setDemoMoments(e.target.value)} rows={3} placeholder={'Tap Events — show Amy she can take book-club bookings here.\nScroll to hours — point out the Sunday discrepancy.\nTap Buy Gift Cards — live on their custom domain.'} />
          <Textarea label="Close script (≤40 words)" value={closeScript} onChange={(e) => setCloseScript(e.target.value)} rows={2} placeholder="It's £299 and we can have it live by Friday. I can take a card number now or come back Thursday — which works?" />
          <Textarea label="Next-visit reason (≤25 words)" value={nextVisitReason} onChange={(e) => setNextVisitReason(e.target.value)} rows={2} placeholder="Fine. Can I drop back Thursday — by then I'll have the live search-ranking numbers for 'bookshop Aberdeen' to show you." />

          <div
            className="text-[10px] uppercase mt-6 mb-3"
            style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: SIGNAL }}
          >
            / Specific objections
          </div>
          {specificObjections.length === 0 && (
            <p className="text-[12.5px] mb-3" style={{ color: CREAM_MUTED }}>
              None added yet. Drop the JSON brief or add pairs manually.
            </p>
          )}
          {specificObjections.map((pair, idx) => (
            <div key={idx} className="grid md:grid-cols-2 gap-3 mb-3">
              <Input
                label={`Objection ${idx + 1}`}
                value={pair.objection}
                onChange={(e) => {
                  const next = [...specificObjections];
                  next[idx] = { ...next[idx], objection: e.target.value };
                  setSpecificObjections(next);
                }}
                placeholder="Instagram is working fine for me"
              />
              <Textarea
                label="Response"
                value={pair.response}
                onChange={(e) => {
                  const next = [...specificObjections];
                  next[idx] = { ...next[idx], response: e.target.value };
                  setSpecificObjections(next);
                }}
                rows={2}
                placeholder="Fair. How many DMs did you miss last weekend? A site takes bookings while you sleep."
              />
            </div>
          ))}
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setSpecificObjections([...specificObjections, { objection: '', response: '' }])}
              className="px-4 py-2 rounded-full text-[12px]"
              style={{ background: 'transparent', color: CREAM_DIM, border: `1px solid ${LINE}`, cursor: 'pointer' }}
            >
              + Add objection
            </button>
            {specificObjections.length > 0 && (
              <button
                type="button"
                onClick={() => setSpecificObjections(specificObjections.slice(0, -1))}
                className="px-4 py-2 rounded-full text-[12px]"
                style={{ background: 'transparent', color: CREAM_MUTED, border: `1px solid ${LINE}`, cursor: 'pointer' }}
              >
                Remove last
              </button>
            )}
          </div>

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

          {/* Handoff prompt for Claude Desktop */}
          <HandoffPromptCard />

          {/* Schema hint */}
          <Card padding="md">
            <div
              className="text-[10px] uppercase mb-2"
              style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED }}
            >
              JSON schema
            </div>
            <pre
              className="text-[11px] m-0 overflow-auto"
              style={{ fontFamily: MONO_FONT, color: CREAM_DIM, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}
            >{`{
  "business_name": "Fable",
  "business_type": "Speciality coffee & bookshop",
  "address": "…",
  "postcode": "AB10 1XL",
  "phone": "+44 …",
  "email": "…",
  "website_url": null,
  "google_rating": 5.0,
  "google_review_count": 60,
  "contact_name": "Amy",
  "contact_role": "Owner",
  "demo_site_domain": "fable-aberdeen.shop",
  "opening_hours": ["Mon-Fri 08:00-18:00", "…"],

  // sales brief — these fields drive the closer
  "hook": "One-sentence sharpest reason. ≤18 words.",
  "opener": "Exact first line at the door. ≤30 words.",
  "pain_points": ["3–5 concrete problems a £299 site fixes"],
  "demo_moments": ["Tap Events — show book-club bookings"],
  "specific_objections": [
    { "objection": "Instagram works fine", "response": "Fair. How many DMs…" }
  ],
  "close_script": "It's £299 and we can have it live by Friday…",
  "next_visit_reason": "Drop back Thursday — I'll have search-ranking numbers.",

  // structured content
  "services": [], "trust_badges": [], "avoid_topics": [],
  "best_reviews": [{ "author": "", "rating": 5, "text": "" }],

  // demo-gen only (optional)
  "description": null, "hero_headline": null, "cta_text": null,
  "brand_colours": { "primary": "#…", "accent": "#…" }
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

const HANDOFF_PROMPT = `You are a senior B2B sales strategist specialising in website sales to UK small & independent businesses. You've been handed research on a single local business. Your job is to turn that research into a tactical pitch brief that a door-to-door salesperson will use on their phone to close a £299 website sale.

Your output is a single JSON object — nothing else. No preamble, no markdown fences, no commentary. Just the JSON, ready for me to paste into the admin upload.

────────────────────────────────────────
CONTEXT FOR YOUR WRITING
────────────────────────────────────────
The salesperson is NOT a digital-marketing expert. They're a gig-economy rep walking into a deli / barber / café / florist / bookshop etc. with their phone. They have 90 seconds to get inside the door, 5 minutes to show a demo site we've already built for this business, and one shot at the close.

The buyer is the owner — usually 35–65, skeptical of "web agencies", proud of their business, time-poor. They've had Instagram since 2014 and it "works fine". They hate being sold to. They respond to:
  • Specifics about their business (prove you researched)
  • Real money (lost customers, not "engagement")
  • Honesty (admit when Instagram is enough; sell when it's not)
  • Short sentences
  • Zero jargon

────────────────────────────────────────
TONE RULES (apply to every string field)
────────────────────────────────────────
- British English (colour, organisation, favourite).
- No em-dashes in strings. Use a period, comma, or — if you must — a hyphen with spaces.
- No exclamation marks. Ever.
- No "unlock", "leverage", "synergy", "seamless", "game-changing", "transform".
- No "I hope this helps" / "Let me know" / any AI tells.
- Write like a sharp friend who runs a corner-shop agency, not a SaaS brochure.
- Every sentence should survive a skeptical owner reading it aloud without cringing.

────────────────────────────────────────
OUTPUT SHAPE (return ALL keys; use null for unknowns)
────────────────────────────────────────

{
  "user_id": "REPLACE_WITH_SALESPERSON_UUID",

  // IDENTITY — match exactly what's on Google / their sign
  "business_name": "",
  "business_type": "",         // short human label, e.g. "Speciality coffee & bookshop"
  "address": "",
  "postcode": "",              // UK format, uppercase, e.g. "AB10 1XL"
  "phone": null,               // include country code if known
  "email": null,
  "website_url": null,         // existing site if any
  "google_rating": null,       // number 0.0-5.0
  "google_review_count": null, // integer

  // ASSIGNMENT META
  "contact_name": null,        // owner/manager first name if known — e.g. "Amy"
  "contact_role": null,        // e.g. "Owner", "Manager", "Founder"

  // DEMO
  "demo_site_domain": "",      // the subdomain of the demo we built, e.g. "fable-aberdeen.shop"

  // HOURS — one line per day or grouped days, mono-readable
  "opening_hours": [
    "Mon-Fri 08:00-18:00",
    "Sat 09:00-17:00",
    "Sun closed"
  ],

  // ─── SALES BRIEF (this is where the closing power lives) ────────────

  // HOOK — the single sharpest reason THIS business needs a site.
  // One sentence, ≤ 18 words. Specific to their situation, not generic.
  // BAD:  "They need a professional online presence."
  // GOOD: "Amy runs monthly book clubs that fill up — every booking
  //        goes through DMs and she turns people away."
  "hook": "",

  // PAIN POINTS — 3 to 5 concrete problems a £299 site fixes for THIS
  // business. Each one ≤ 16 words. Name a behaviour, not an abstraction.
  // BAD:  "Poor online visibility"
  // GOOD: "Lunch queue turns walk-ins away; no way to pre-order."
  "pain_points": [
    "",
    "",
    ""
  ],

  // OPENER — the EXACT first line the rep says walking in.
  // ≤ 30 words. Include the business's name. Must sound like a human,
  // not a script. Lead with a fact that proves research.
  // BAD:  "Hi, I'm Kevin, I'm here to talk about websites!"
  // GOOD: "Hi, is Amy in? I'm Kevin. I noticed Fable's got 5.0 from 60
  //        reviews and I thought you'd want to see something we built."
  "opener": "",

  // DEMO MOMENTS — 3 specific things to tap/point out when showing the
  // demo, each ≤ 14 words. Tied to what matters for this owner.
  // BAD:  "The home page"
  // GOOD: "Tap Events — show Amy she can take book-club bookings here."
  "demo_moments": [
    "",
    "",
    ""
  ],

  // SPECIFIC OBJECTIONS — 3 to 4 objections THIS owner is most likely to
  // raise, with a response. Not the generic 4 (those are fallbacks in
  // the app). Use what the research tells you about them.
  // Each objection ≤ 12 words, each response ≤ 28 words.
  "specific_objections": [
    {
      "objection": "",
      "response": ""
    },
    {
      "objection": "",
      "response": ""
    },
    {
      "objection": "",
      "response": ""
    }
  ],

  // CLOSE — the exact ask. ≤ 40 words. Ask for the sale directly. Name
  // the price. Offer one concrete next step. No "think about it".
  // BAD:  "Would you be interested in hearing more?"
  // GOOD: "It's £299 and we can have it live by Friday. I can take a
  //        card number now or come back Thursday — which works?"
  "close_script": "",

  // NEXT VISIT — if they say no today, the one reason to come back.
  // ≤ 25 words. Must be value for THEM, not a guilt trip.
  // BAD:  "I'll pop back next week."
  // GOOD: "Fine. Can I drop back Thursday — by then I'll have the live
  //        search ranking numbers for 'bookshop Aberdeen' to show you."
  "next_visit_reason": "",

  // EXISTING STRUCTURED FIELDS (still rendered on iOS)
  "services": [],              // 3-6 string items
  "trust_badges": [],          // 3-5 credibility signals, e.g. "Est. 1994"
  "best_reviews": [            // 2-3 quoted reviews
    { "author": "", "rating": 5, "text": "" }
  ],
  "avoid_topics": [],          // 1-3 things NOT to mention

  // OPTIONAL — used by the demo generator, not iOS
  "description": null,
  "hero_headline": null,
  "cta_text": null,
  "pain_points_extended": null,
  "brand_colours": null
}

────────────────────────────────────────
GROUNDING RULES (hard)
────────────────────────────────────────
1. Every fact must be traceable to the research you were given. If you don't know something, use null. Never fabricate numbers, dates, names, awards, or reviews.
2. If the business has <20 Google reviews, do not lean on Google in the opener — pick a different hook.
3. If there's no phone in the research, \`phone\` is null. Don't guess.
4. If the research implies the owner is anti-tech or anti-digital, the hook and opener must acknowledge it (e.g. "I know you've done fine on word-of-mouth for 20 years, but…").
5. If the business already has a modern site, you don't have a sale. In that case, output \`"hook": "PASS — existing site at <url> is already functional."\` and set pain_points/opener/close_script/etc. to null.
6. UK compliance: do not include GDPR/cookie-banner talk in the pitch. That's our job at fulfilment, not the rep's.

────────────────────────────────────────
RESEARCH YOU'VE BEEN GIVEN
────────────────────────────────────────
<paste the business research / demo site URL / screenshots here>

────────────────────────────────────────
Return ONLY the JSON object. Begin now.`;

function HandoffPromptCard() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(HANDOFF_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  return (
    <Card accent padding="lg">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div
          className="text-[10.5px] uppercase"
          style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: SIGNAL }}
        >
          / Claude Desktop prompt
        </div>
        <button
          onClick={copy}
          className="px-4 py-2 rounded-full text-[12px] transition-colors"
          style={{
            background: copied ? SIGNAL : CREAM,
            color: copied ? 'white' : 'rgb(20 20 19)',
            border: 'none',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {copied ? '✓ Copied' : 'Copy prompt'}
        </button>
      </div>
      <p
        className="text-[16px] m-0 mb-2"
        style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, color: CREAM, letterSpacing: '-0.015em' }}
      >
        Paste at the end of your research chat.
      </p>
      <p className="text-[12.5px] m-0" style={{ color: CREAM_DIM, lineHeight: 1.55 }}>
        After Claude Desktop finishes researching the business and designing the demo, paste this prompt. It'll output
        two files in the exact format this page expects — drop them back in above.
      </p>
    </Card>
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
