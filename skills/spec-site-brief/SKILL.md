---
name: spec-site-brief
description: Research and brand-decode a UK local business (cafés, bakeries, barbers, butchers, florists, independent retailers, restaurants) for a personalised £350 spec-site sales pitch. Outputs a build-ready brief with verdict, brand intelligence, conversion diagnosis, pitch angle, and demo site blueprint. Use this whenever the user names a UK local business and provides photos (storefront, interior, products, Instagram screenshots, menus, packaging) and wants to assess it as a spec-site lead, build a demo for it, or produce a sales brief. Trigger on phrases like "spec brief", "demo brief", "lead research", "site pitch for [business]", "should I pitch [business]", "research [business] for a website", or any setup where the user is building a personalised website demo to walk into a UK shop and sell. Do NOT use this for non-UK businesses, large chains, franchises, or businesses that already have a modern functional site.
---

# Spec Site Brief

A research and design brief for a one-shot sales operation: walking into a UK local business with a personalised demo site already built and pitching it at £350. The brief feeds directly into a build prompt and a sales-tracking JSON, so it must be opinionated, decisive, and free of marketing fluff.

This skill runs in six phases (Phase 0 enrichment + Phase 1 verify + Phase 1.5 auto-grab supplementary photos + Phases 2–4 of the original brief). Do them in order. Do not skip Phase 1 — disqualifying weak leads early is the entire point.

---

## Phase 0 — Enrich (free, automated)

Before any research or analysis, run the local enrichment scripts. They fill structured fields that previously sat NULL on every brief (`years_trading`, `phone`, `email`, `website_url`, `lat`/`lng`, postcode admin context) using free public sources — OSM, postcodes.io, Companies House, HTTP probes. Everything they return is DATA, not opinion — never override a script output with a guess.

Save all enrichment outputs to a single file: `~/Desktop/salespatch-demos/[slug]/outputs/enrichment.json`. Subsequent phases read from it. Skip cleanly if any individual script errors — partial enrichment is fine.

Run these in sequence (each takes a few seconds):

```bash
LEAD_DIR="$HOME/Desktop/salespatch-demos/[slug]"
ENRICH="$HOME/.claude/scripts/enrich"
mkdir -p "$LEAD_DIR/outputs"

GEO=$(bash "$ENRICH/geocode.sh" "<full address from user input>" 2>/dev/null || echo '{}')
LAT=$(echo "$GEO" | python3 -c "import json,sys;print(json.load(sys.stdin).get('lat') or '')")
LNG=$(echo "$GEO" | python3 -c "import json,sys;print(json.load(sys.stdin).get('lng') or '')")

PC=$(bash "$ENRICH/postcode-info.sh" "<full postcode, e.g. AB15 8AH>" 2>/dev/null || echo '{}')

# Companies House — pass postcode so wrong-name matches are rejected.
CH=$(bash "$ENRICH/companies-house.sh" "<business name>" "<full postcode>" 2>/dev/null || echo '{}')

# OSM POI — only if we got coordinates.
if [ -n "$LAT" ] && [ -n "$LNG" ]; then
  OSM=$(bash "$ENRICH/osm-poi.sh" "<business name>" "$LAT" "$LNG" 2>/dev/null || echo '{"matched":false}')
else
  OSM='{"matched":false}'
fi

# Website probe — only if your search has found a candidate URL.
# Skip if there's no candidate.
WEB='{}'
if [ -n "<candidate website URL or empty>" ]; then
  WEB=$(bash "$ENRICH/website-probe.sh" "<candidate URL>" 2>/dev/null || echo '{}')
fi

python3 -c "
import json
out = {
  'geocode': $GEO,
  'postcode_info': $PC,
  'companies_house': $CH,
  'osm_poi': $OSM,
  'website_probe': $WEB,
  'enriched_at': '$(date -u +%Y-%m-%dT%H:%M:%SZ)',
}
with open('$LEAD_DIR/outputs/enrichment.json','w') as f:
  json.dump(out, f, indent=2)
print(json.dumps(out, indent=2))
"
```

Treat the outputs as authoritative for these fields:

| Field | From | When to use |
|---|---|---|
| `lat`, `lng` | `geocode.geocode.lat/lng` | Always, if geocode matched |
| `admin_district`, `admin_ward`, `region` | `postcode_info` | Always, if postcode matched |
| `years_trading` | `companies_house.years_trading` | Only if `companies_house.matched=true` AND `postcode_confirms_match=true`. Otherwise null. |
| `owner_name` | `companies_house.officers[0]` | Same gate as above. The Companies House sole-director name beats guessing from press. |
| `phone`, `email`, `website_url` | `osm_poi.phone/email/website` | If `osm_poi.matched=true`. OSM coverage is ~30%, so often null. |
| `website_status` | `website_probe` | When a candidate URL was probed. `reachable=true` + non-stub `platform` means **PASS verdict** (they have a working site). |

The verdict logic in Phase 1 gets a free win from this: if `website_probe.reachable=true` and `platform` is in `{squarespace, wix, shopify, wordpress, webflow, bigcommerce}` with a real title, you can short-circuit to PASS without any web searching.

---

## Phase 1 — Verify

Before any creative work, search the web and confirm:

- **Existing functional front door (30-second test).** Search `"[business name] [location] website"`, then visit every URL the operator's IG/FB bio/website footer/Google Business Profile links to. Apply this test to each:

  > Does a stranger Googling this business land on a URL where they can (a) see what the business does, (b) see photos of the work, (c) book or contact, in under 30 seconds without leaving that URL?

  If yes — the operator has a functional front door regardless of whose domain it's on. Decide which case applies:

  1. **Owned + functional** (their own domain hosts the page) → **PASS**. They already have what we sell.
  2. **Platform-hosted + functional** (a branded `*.mytreatwell.co.uk` / `*.booksy.com` / `*.fresha.com` / `*.square.site` / `*.squarespace-cdn.com` / similar vanity URL where the business name is in the subdomain, photos + services + booking all live on that one page) → **Tier 2 PROCEED**. They have a working front door but they don't *own* the URL. The pitch shifts from "fix your broken site" to "take back ownership of your URL with your own brand" — harder close. See "Tier 2 verdict shape" below.
  3. **Owned but broken / stub / Linktree / abandoned-Wix / Facebook-page-only / Yell-listing-only / Square-stub** → **Tier 1 PROCEED**. The classic broken-front-door case.
  4. **Owned + functional** as judged by `website_probe.reachable=true` AND `platform` in `{squarespace, wix, shopify, wordpress, webflow, bigcommerce}` AND a real title → **PASS** (the Phase 0 short-circuit; if the probe hit one of these and the page has real content, no further verification needed).

  The principle replaces the previous platform-enumeration rule. Trying to maintain a list of "not-a-website" platforms (Linktree, abandoned Wix, Facebook, Square stub) ages badly — new platforms launch, vanity subdomains evolve, the list rots. The 30-second test is platform-agnostic and ages well.

  Edge: if the operator has BOTH a broken owned domain (e.g. a dead `.me` from a previous attempt) AND a working platform-hosted page (e.g. a Treatwell vanity URL), the verdict is Tier 2 — the broken owned domain is a thin pitch hook but the underlying business *isn't* missing a front door. Note both states in the verdict_reasoning_trace.
- **Google rating and review count.** If under 20 reviews, flag it. The pitch cannot lean on Google social proof.
- **Google Maps canonical URL.** When the Google rating search surfaces the Google Maps listing, capture the canonical URL with the CID embedded (`https://www.google.com/maps/place/<name>/data=!4m2!3m1!1s<hex>:<hex>`). Phase 1.5 consumes this to pull Business Profile photos — the storefront and interior shots IG can't surface. If only a search URL is found, capture that too; the photos actor accepts both.
- **Google review recency aggregates.** Once a Google Maps URL is in hand, call `mcp__apify__call-actor` with `compass/Google-Maps-Reviews-Scraper` and:
  ```json
  {
    "startUrls": [{"url": "<canonical Google Maps URL>"}],
    "maxReviews": 200,
    "reviewsSort": "newest",
    "language": "en",
    "reviewsOrigin": "google",
    "personalData": false
  }
  ```
  Cost: $0.00045 per review. A typical lead with <50 lifetime reviews costs ≈ £0.02; cap of 200 protects against runaway cost on big-name places. `personalData: false` keeps reviewer details out — we only need timestamps. Save the items array to `$LEAD_DIR/.cache/gmaps-reviews.json` then compute three aggregates with a one-shot Python snippet:

  ```bash
  python3 << 'PY' > "$LEAD_DIR/.cache/google-review-recency.json"
  import json, datetime as dt
  from pathlib import Path
  items = json.load(open(Path.home() / "Desktop/salespatch-demos/<slug>/.cache/gmaps-reviews.json"))
  now = dt.datetime.now(dt.timezone.utc)
  stamps = [dt.datetime.fromisoformat(i["publishedAtDate"].replace("Z","+00:00"))
            for i in items if i.get("publishedAtDate")]
  if not stamps:
      print(json.dumps({"google_last_review_at": None, "google_reviews_last_30d": None, "google_reviews_last_90d": None}))
  else:
      total = len(items)
      hit_cap = total >= 200  # honest-null contract: if we hit the maxReviews cap, the 30d/90d counts may be lower bounds
      window_days = (now - min(stamps)).days
      out = {
          "google_last_review_at": max(stamps).isoformat().replace("+00:00", "Z"),
          "google_reviews_last_30d": (
              sum(1 for s in stamps if (now - s).days <= 30)
              if (window_days >= 30 and not hit_cap) else None
          ),
          "google_reviews_last_90d": (
              sum(1 for s in stamps if (now - s).days <= 90)
              if (window_days >= 90 and not hit_cap) else None
          ),
      }
      print(json.dumps(out))
  PY
  ```

  Carry these three values into Phase 4's `lead-profile.json` schema at the top level: `google_last_review_at`, `google_reviews_last_30d`, `google_reviews_last_90d`. They're queryable columns on `lead_profiles` (per migration 20_google_review_recency).

  Same honest-null contract as IG: if the scrape window is shorter than the trailing-N-day window (e.g. only 30 days of reviews available and we want the 90-day count), write null rather than an undercount. Skip the whole block silently if no Google Maps URL was found — `google_last_review_at` and friends stay null.
- **Facebook page URL.** Capture the canonical Facebook URL (`https://www.facebook.com/<slug>/` or numeric `https://www.facebook.com/<id>/`) wherever it surfaces — IG bio link, Google Business Profile "Social profiles" section, existing-website footer, or a targeted `"<business> <area> facebook"` search. Phase 1.5 consumes it for the Apify Facebook scrapers (page metadata + recent posts), which is the **primary** photo + brand source for Path C leads (Facebook-led operators with thin/absent IG) and a useful fallback for Path A/B leads when IG is sparse. If no URL surfaces, leave it null and the FB block in 1.5 silently skips. Do not invent a URL by guessing the slug — confirm it resolves to the right business.
- **Instagram presence.** Confirm handle, follower count, post frequency. Strong IG plus no website is the ideal target.
- **Bio CTA type.** Read the Instagram bio (and Google Business Profile if relevant) and classify the primary call-to-action as exactly one of these values. Capture it as `bio_cta_type` on the lead-profile.json. The route validator hard-rejects anything outside this list.
  - `call` — bio leads with a phone number, "call us", or explicitly discourages DMs (e.g. Blackbird Bakery: "No DMs (Call us/ pop into the Bakery)")
  - `dm` — bio says "DM to book", "@ us for...", or otherwise routes everything through Instagram messages
  - `link_in_bio` — bio routes to Linktree, beacons, milkshake, or any link-aggregator (typically because they have multiple things to link out to)
  - `fresha` — bio's primary link points to Fresha
  - `booksy` — bio's primary link points to Booksy
  - `treatwell` — bio's primary link points to Treatwell
  - `website` — bio's primary link is a working website URL
  - `none` — no CTA at all; bio is just a description or branding line
  If two CTAs are present, pick the primary by inferring intent: the one the owner WANTS customers to use, not just the one that's bigger. Blackbird's bio mentions both "Call us" and a Facebook link — the call is the primary because the owners explicitly discourage DMs. When in genuine doubt, prefer the higher-friction option (`call` over `dm`, `dm` over `link_in_bio`) because that's where the booking *actually happens* and the demo's "fixable friction" diagnosis will land hardest.
- **Owner name(s)** if discoverable through press, Companies House, or bios. Do not fabricate. Null is fine.
- **Years trading** or founding story if covered by local press.
- **Any awards, guides, or certifications** (Good Food Guide, Michelin Bib, Best of [City], industry awards, trade press features).

If something disqualifies the lead — modern site, closed business, chain franchise, dormant social — say so plainly and stop. Do not waste the rep's time being polite.

The reason this phase comes first: a demo built for a business that already has a working site is wasted effort. The pitch only lands when the business knows their current online presence is the bottleneck.

### Capture top competitors (PR-J — opt-in competitor comparison in /build-demo)

Before closing Phase 1, capture the top 3-5 competitor URLs the customer would see if they searched Google for this lead's vertical + neighbourhood. These power the optional competitor comparison step in `/build-demo` (PR-J) which renders each competitor at the same mobile viewport this demo will be scored at and asks vision to rank trust-at-glance — the rep gets a door-ready one-line takeaway.

Write `~/Desktop/salespatch-demos/[slug]/outputs/competitors.json`:

```json
{
  "this_demo_name": "<business name>",
  "competitors": [
    { "name": "<display name>", "url": "<full https:// URL>" },
    { "name": "<display name>", "url": "<full https:// URL>" }
  ]
}
```

Aim for 3-5 competitors. Pick the ones that would actually appear on page 1 of a Google search for the lead's vertical in their area (run the search yourself and capture the top organic results that are real businesses, not Yell-style directories or chains). When the search surfaces fewer than 3 real competitors, write what you have; `/build-demo` handles short cohorts. Skip the manifest entirely when no real competitors surface (mobile-only operators with no local SEO context — the comparison wouldn't be meaningful).

`/build-demo` reads this file in Step 1.8; when absent, the competitor comparison is skipped silently.

---

## Phase 2 — Analyse

Read the photos like a brand designer. Do not describe them. Decode them.

### Colour palette

Extract real hex codes. Identify three roles:

- **Dominant colour** — what the shopfront, packaging, or signage actually IS (not what you think it should be).
- **Workhorse neutral** — the cream, off-white, charcoal, or paper tone everything sits on.
- **Accent colour** — the one they use for emphasis: signage flourishes, menu boards, sale tags, CTA stickers.

Note the ratio. Most LLMs guess balanced palettes. Real brands are lopsided. A 70/20/10 split where the dominant colour swallows everything is closer to reality than a tidy 33/33/33. Capture the lopsidedness.

### Typography

Name the typographic voices in play:

- Display serif, hand-painted signage, mono menu, gothic logotype, condensed sans, slab, etc.

Suggest 2–3 Google Fonts that match each voice, with weights. If a brand element cannot be reproduced in CSS (custom logotype, hand-drawn mark, irregular spacing that is part of the identity), say so and mark it as an SVG or image asset to lift directly from the photos.

### Logo / mascot

Describe what is there in enough detail that it could be reproduced as inline SVG or pulled as a transparent PNG. Note if it is clean-vector or hand-imperfect. The imperfection matters — perfect Bezier curves on a hand-drawn mark will read as fake.

**Background analysis (required).** Examine the source file for the logo (typically `fb_<slug>_logo.jpg` from the Facebook page scrape, or an Instagram profile picture). Most of these arrive as JPEGs with a *coloured* or *white* square background even when the logo design itself is circular or transparent. On a dark hero or coloured CTA strip, that background will render as a visible square edge around the logo. Decide which treatment the build should apply and commit it as `logo_background_analysis` in `brand-analysis.json.metadata`:

```json
{
  "has_white_bg": <bool — is the JPEG's background white/near-white?>,
  "needs_alpha_channel": <bool — would the demo look noticeably better with an alpha PNG?>,
  "suggested_treatment": "transparent_png | drop_shadow | wrapped_container | none",
  "rationale": "<one line — what you saw in the source>"
}
```

`suggested_treatment` rubric:
- **`transparent_png`** — the logo design is irregular (non-circular, non-square shape with sharp edges) and the white JPEG-square will visibly clash with the hero. The build cannot fix this with CSS alone; flag it for the operator to source an alpha PNG before pitching.
- **`drop_shadow`** — the logo design is dark on white, and the white JPEG-square reads as a deliberate "card" treatment. A subtle shadow + corner radius on the `<img>` makes it look intentional.
- **`wrapped_container`** — the logo design is circular (badge-style, like Urban Cutz) and the white JPEG-square is the only artefact. Wrapping the `<img>` in a circular accent-coloured container (`border-radius: 50%; background: var(--accent); padding: 4px`) hides the square edge while letting the badge breathe.
- **`none`** — the logo is already alpha or the background colour happens to match the hero (e.g. black logo on black JPEG-bg over a black hero).

The build will read `suggested_treatment` and apply matching CSS. Without it, the build guesses based on file extension (PNG = trust alpha, JPEG = assume coloured-bg) which gets it right ~60% of the time but the other 40% of leads ship with visible white squares on a dark hero. The brief decode is the right place to make this call because it has the source file in hand.

### Voice and tone

Pull verbatim language from menus, captions, and any press quotes. How do they actually talk?

- Lowercase or uppercase?
- Profane or polite?
- Confident or self-deprecating?
- Mock-formal, dry, warm, deadpan?

Quote the lines to preserve in the demo word-for-word. The demo's authenticity hinges on the owner reading their own words back.

### Aesthetic positioning

Name a reference. Pick one. Do not hedge.

- Aimé Leon Dore drop-culture site
- Margot Henderson editorial-warmth site
- Brutalist Berlin coffee site
- Old British corner-shop site
- Faux-vintage Americana
- Y2K maximalism
- Minimal Scandi-minimal
- 90s Italian trattoria

The demo's identity comes from this commitment. If two directions are viable, pick one and explain why. The reason hedging is worse than being wrong: vague briefs produce vague demos, and a vague demo cannot win a £350 pitch.

If the photos contradict each other (clean modern interior vs chaotic Instagram aesthetic), name the contradiction and choose which side the demo commits to. Brands have multiple voices. The demo only gets one.

**Capture the alternatives.** Privately track which 1-2 other references you considered and why you rejected each. These don't go into the brief.md prose — they land in `outputs/brief.json`'s `metadata.positioning_alternatives_considered` so the AI layer can later learn what doesn't fit this vertical, not just what does.

### Photo role mapping

You've already read every photo to extract brand intelligence. Before closing Phase 2, commit a placement role for each file in `photos/` so `/build-demo` doesn't re-classify from scratch. The map lands in `brand-analysis.json.photo_roles` and becomes the build's default — the build can still override with reason, but unless it does, the brief's call ships. Without this map, the build re-decides every photo and may drift from the brand decode (wrong photo picked as logo, atmosphere shot used as credibility banner, hero product chosen against the brief's positioning).

Use exactly one of these enum values per photo. Role names mirror the build-demo placement table.

- `logo` — brand mark, flat colour, no scene. Default placement: hero corner sticker, nav, footer.
- `storefront` — exterior, signage visible. Default placement: full-bleed credibility banner after hero.
- `interior` — atmosphere, lived-in detail, people at counter. Default placement: story / about section.
- `product_close` — single dish, drink, item, well-lit. Default placement: product hero or top gallery tile.
- `product_assortment` — multiple items on tray or shelf. Default placement: gallery tile.
- `menu` — printed menu artwork, chalkboard, hand-painted card. Default placement: aside next to the relevant section.
- `press` — editorial quote / social-share graphic. Default placement: press tile.
- `lifestyle` — item being held, used, served. Default placement: gallery tile or alongside CTA.
- `unused` — duplicate, off-brand, contradicts the chosen positioning, or sparse-set leftover.

If a photo could be two roles, pick the one that serves the diagnosis (e.g. for a "demand exceeds capture" diagnosis, lean product_close over interior; for "trust gap", lean storefront over product). The build will respect your call.

### Feature inventory

Before closing Phase 2, capture two structured lists about features. The split matters: one tells `/build-demo` what to preserve from the customer's existing setup, the other tells it what the diagnosis would benefit from adding. Without these the build either drops a working booking layer or invents a feature the owner doesn't want.

**`existing_integrations[]`** — third-party tools the customer already uses that the demo MUST surface (not replace). Booksy, Fresha, Treatwell, Square, MailChimp, Squarespace blog, an Eventbrite event page, a working Stripe checkout, an existing OpenTable page. Each entry:

```json
{
  "name": "Booksy",
  "type": "booking | reservation | payment | newsletter | event | gallery | catalogue | other",
  "url": "https://urbancutz21.booksy.com/",
  "treatment": "embed | link | deep_link",
  "evidence": "IG bio link points here; was the link in their Linktree"
}
```

`treatment` rules of thumb: a fakeable success state (booking flow, reservation form) wants `embed` so the rep doesn't have to send the customer to another tab. A simple URL that needs to stay alive (the customer's existing Square shop, their MailChimp signup page) wants `link`. A deep-link to a specific resource (a single Booksy service page rather than the home) wants `deep_link`. **No invention.** Only list integrations Phase 1 actually surfaced — IG bio link, Google Business "Social profiles", the existing-website footer, the FB page's `website` / `websites[]` field. If you didn't verify it exists, don't include it.

**`feature_opportunities[]`** — features the business doesn't currently have but the diagnosis says they could measurably benefit from. Capped at 4 entries (more than that means the diagnosis is fuzzy). Each entry:

```json
{
  "feature": "email_drop_list | enquiry_form | portfolio_filter | price_anchor | newsletter | event_calendar | wholesale_path | gallery_grid | live_status | other",
  "rationale": "<one line — must be traceable back to brief facts; the test of success is part of the chain>",
  "priority": 1
}
```

Priority is 1-5 where 1 is "the demo needs this section to make the test_of_success land" and 5 is "nice to have, only if the brief's blueprint already accommodates it". The build will give priority-1 entries their own section; priority-2 and 3 may earn placement; priority-4 and 5 surface as suggestions, not sections.

**Hard rules:**

- Both lists may be empty. Don't pad — if the customer has nothing to integrate and the diagnosis fits in their existing surfaces, both can be `[]`.
- Every `feature_opportunities` rationale must trace back to a fact captured in Phase 1 or Phase 3 (the diagnosis). Inventing a "we recommend you add a loyalty programme" because it sounds good fails this check.
- Existing integrations override matching opportunities. If they have Booksy, don't propose `enquiry_form` as a substitute for booking — the booking job is solved.
- Both lists land in `brand-analysis.json` (and downstream NERVE) under the `metadata` field — see Phase 4 schema. No new ingest-side validation needed; the build skill is the consumer.

---

## Phase 3 — Diagnose

Identify the real conversion problem. Most businesses do not need "a website." They need ONE specific thing a website does for them. Pick the sharpest one:

- **Demand exceeds capture** — sells out, queue out the door, no pre-order or reservation system.
- **Owned-audience gap** — big Instagram, no email list, platform-dependent.
- **Booking friction** — DM-based bookings, missed enquiries, no calendar.
- **Wholesale or B2B invisibility** — no enquiry path for cafés, restaurants, weddings, corporate clients.
- **Discovery failure** — great place, invisible on Google, walk-bys do not know what is inside.
- **Trust gap** — legit business, no online proof, customers hesitate.

State the diagnosis in one sentence. This becomes the emotional engine of the demo and the lead line for the pitch. Build the rest of the site around it.

If you cannot pick one with conviction, the lead is weak. Say so.

The reason for committing to a single diagnosis: a demo site that tries to solve everything sells nothing. The pitch lands when the rep names the owner's most painful daily friction in one sentence and shows the fix on screen.

**Capture the alternatives.** For every diagnosis you considered seriously and rejected, record one line on why. "Owned-audience gap — rejected because IG is sub-2k, too small to anchor the pitch on capture." Track 1-3 of these silently. They land in `outputs/brief.json`'s `metadata.diagnosis_alternatives_considered`, not in brief.md. This is how the warehouse builds a corpus of "what's NOT the bottleneck for vertical=X" — currently every rejected diagnosis vanishes after the chat closes.

---

## Phase 1.5 — Auto-grab supplementary photos (free, automated)

By this point you have:
- Manually-dropped Instagram photos in `photos/` (from the user, before invoking the skill)
- `enrichment.json.geocode.lat/lng` from Phase 0
- Whatever Fresha URL, existing website URL, and Instagram handle Phase 0/1 surfaced

Auto-fetch the rest now, before brand decode — these photos need to be on disk
when Phase 2 reads `photos/`. Run only what we have inputs for; skip cleanly
otherwise. Each helper writes prefixed filenames so they don't collide with
the manually-dropped IG photos.

```bash
LEAD_DIR="$HOME/Desktop/salespatch-demos/[slug]"
PHOTOS="$LEAD_DIR/photos"
SCRIPTS="$HOME/.claude/scripts/grab-photos"
mkdir -p "$LEAD_DIR/.cache"

# Fresha — only if Phase 1 found a Fresha URL.
if [ -n "<fresha_url_from_phase_1>" ]; then
  bash "$SCRIPTS/grab-fresha.sh" "<fresha_url>" "$PHOTOS" 2>&1
fi

# Street-level — only if Phase 0 geocoding produced lat/lng AND a Mapillary
# token is set in the user's env.
if [ -n "<lat_from_phase_0>" ] && [ -n "<lng_from_phase_0>" ] && [ -n "${MAPILLARY_ACCESS_TOKEN:-}" ]; then
  bash "$SCRIPTS/grab-google.sh" "<lat>,<lng>" "$PHOTOS" 2>&1
fi
```

### Google Maps photos (via Apify MCP)

For brick-and-mortar businesses, Google Business Profile is the photo source IG can't replace. Owners upload exterior + interior shots there that they rarely cross-post to IG (e.g. Blackbird Bakery posts cakes on IG, posts the shopfront on Google). This is the only way to fill the `storefront` / `interior` photo roles for businesses that lead with product on social.

Run **before** the Instagram block so any duplicates the IG scrape would have grabbed land with prefixed filenames first. Skip silently if no Google Maps URL can be surfaced — the wrapper bails cleanly on empty input.

Three steps, all run by you (the assistant), not by a shell wrapper:

1. Resolve the Google Maps URL. In priority order:
   - The canonical URL with CID, if Phase 1 web search surfaced one (it usually does — search results include `https://www.google.com/maps/place/<name>/data=!4m2!3m1!1s<hex>:<hex>`).
   - As fallback, `https://www.google.com/maps/place/<URL-encoded-business-name>+<URL-encoded-address>`. The actor resolves search-style URLs reasonably well but can return empty if the place is ambiguous.

   If neither path produces a URL, skip this block.

2. Call `mcp__apify__call-actor` with:
   - `actor`: `"solidcode/google-maps-photos-scraper"`
   - `input`:
     ```json
     {
       "placeUrls": ["<canonical or fallback URL>"],
       "photoCategories": ["all"],
       "maxPhotosPerPlace": 12,
       "imageSize": "large",
       "language": "en",
       "concurrentPlaces": 1
     }
     ```
   - `previewOutput`: leave default (true) — the preview is the data; no need to round-trip `get-actor-output` unless the items array is truncated.

   Cost: $0.0005 per photo + $0.00005 actor start ≈ £0.005 per lead at the 12-photo cap. Trivial.

   The response is one item per place with a nested `photos[]` array. Each photo has `imageUrl`, `photoId`, `category` (one of `by_owner` / `vibe` / `menu` / `food_and_drink` / `latest` / `street_and_360` / `videos`), `uploadedByOwner` boolean, dimensions, and `uploadDate`. The actor's `photosCount` and `totalPhotosAvailable` tell you how much was capped — useful signal for "this place has 4,000+ photos vs only 8".

3. Save the items array to `$LEAD_DIR/.cache/gmaps-items.json` then run the downloader:

   ```bash
   bash ~/.claude/scripts/apify/google-maps.sh "<slug>" "$PHOTOS" "$LEAD_DIR/.cache/gmaps-items.json"
   ```

   Files land as `gmaps_<slug>_<photoIdShort>.jpg` where `photoIdShort` is the first 12 chars of the Google photo ID (with the boilerplate `AF1QipP` prefix stripped). The wrapper:
   - Accepts both the place-wrapper shape and a flat photos array
   - Dedupes by `photoId` (the actor can return the same photo under multiple category labels)
   - Logs `google-maps: N photo(s) -> <dest>` to stderr

   If the wrapper exits 1 (no photos saved), surface the error once and continue — the IG photos and any manually-dropped photos are still enough to run Phase 2.

When you assign `photo_roles` in Phase 2's photo role mapping, treat `category=by_owner` photos as the most reliable for `logo` / `storefront` / `interior` / `product_close` decisions — they're the bakery's own framing. `category=vibe` photos are typically interior shots from customers. `category=menu` is exactly what it says and rarely useful for non-food verticals.

### Facebook page + posts (via Apify MCP)

For Path C operators (Facebook-led, low-IG), Facebook IS the brand. Their cover photo is the storefront framing, their post stream is the catalogue, their cadence proves they're trading. Skipping this source on a Path C lead means running brand decode on whatever scraps Google + Mapillary surfaced. For Path A and B leads it's also a useful fallback when IG is thin.

**When to run:** whenever a Facebook URL was surfaced in Phase 1. The trigger is "did we find a URL" — not "what path is this". The cost is ~£0.17 per lead and a Path A indie often has an under-cared-for FB page that still yields a logo and a few cover/post photos worth lifting. Skip silently if no URL was captured.

When the lead is Path C, run this block BEFORE the Instagram block — the FB cover/profile photos are the more reliable owner-curated source and should land first so any IG photos layer on top with their own filename prefix.

Five steps, all run by you (the assistant), not by a shell wrapper:

1. Call `mcp__apify__call-actor` with:
   - `actor`: `"apify/facebook-pages-scraper"`
   - `input`:
     ```json
     {
       "startUrls": [{"url": "<canonical Facebook page URL>"}]
     }
     ```
   - `previewOutput`: leave default (true) — single-page payload fits inline.

   Cost: $0.01 per page (BRONZE tier). One call per lead.

   The response is a single-element list with the page object. Useful fields: `pageName`, `likes`, `followers`, `intro`, `info[]`, `categories`, `category`, `address`, `phone`, `email`, `website` / `websites[]`, `instagram[]`, `profilePictureUrl`, `coverPhotoUrl`, `creation_date`, `ratingOverall`, `ratingCount`. These fill enrichment gaps and become the Path C verdict's evidence (e.g. "Facebook page since 2014, 1,012 likes, 34 ratings averaging 4.8").

2. Save the page payload to `$LEAD_DIR/.cache/fb-page.json` then run the page-photo downloader:

   ```bash
   bash ~/.claude/scripts/apify/facebook-page.sh "<slug>" "$PHOTOS" "$LEAD_DIR/.cache/fb-page.json"
   ```

   Files land as `fb_<slug>_logo.jpg` (from `profilePictureUrl`) and `fb_<slug>_cover.jpg` (from `coverPhotoUrl`). The wrapper accepts both list and single-object shapes, logs `facebook-page: N photo(s) -> <dest>` to stderr, and exits 1 cleanly if both URLs are missing.

3. Call `mcp__apify__call-actor` with:
   - `actor`: `"apify/facebook-posts-scraper"`
   - `input`:
     ```json
     {
       "startUrls": [{"url": "<canonical Facebook page URL>"}],
       "resultsLimit": 50,
       "captionText": false
     }
     ```
   - `previewOutput`: leave default (true). The response includes a `datasetId`. The inline `items` array is a preview and is often capped before you see all 50 — **do not** use it directly. Grab the `datasetId`.

   Cost: $0.001 actor start + $0.004 per post. 50 posts ≈ £0.17 per lead. The 50 cap mirrors IG and buys reliable 90-day coverage for active operators.

4. Call `mcp__apify__get-dataset-items` with:
   - `datasetId`: from step 3
   - `fields`: `"postId,time,timestamp,text,likes,shares,comments,media,attachments"`
   - `clean`: `true`

   Save the `items` array (not the wrapping object) to `$LEAD_DIR/.cache/fb-posts.json`. Easiest path: pipe the saved MCP response through `jq '.items' > "$LEAD_DIR/.cache/fb-posts.json"`. Then run the post-photo downloader:

   ```bash
   bash ~/.claude/scripts/apify/facebook-posts.sh "<slug>" "$PHOTOS" "$LEAD_DIR/.cache/fb-posts.json"
   ```

   Files land as `fb_<slug>_<postIdShort>[_n].jpg` (`postIdShort` = last 12 alphanumeric chars of `postId`). The wrapper handles multi-photo posts (carousel) by writing `_1`, `_2`, etc. Set `FB_SKIP_VIDEOS=1` beforehand to drop video posts entirely (default keeps the cover frame, same as the IG wrapper).

5. **Compute post-recency aggregates from the same dataset.** Mirror the IG pattern. Three values, derived in one snippet over the cached files:

   - `fb_last_post_at` = `max(item.time for item in items)`
   - `fb_posts_last_90d` = `count(items with time > now - 90d)` — `null` if scrape window < 90 days (honest-null contract, same as IG)
   - `fb_likes` = page payload's `likes` field (not derived from posts — it's the page-level metric)

   ```bash
   python3 << 'PY' > "$LEAD_DIR/.cache/fb-recency.json"
   import json, datetime as dt
   from pathlib import Path
   slug = "<slug>"
   base = Path.home() / f"Desktop/salespatch-demos/{slug}/.cache"
   posts = json.load(open(base / "fb-posts.json")) if (base / "fb-posts.json").exists() else []
   page_raw = json.load(open(base / "fb-page.json")) if (base / "fb-page.json").exists() else {}
   page = page_raw[0] if isinstance(page_raw, list) and page_raw else (page_raw if isinstance(page_raw, dict) else {})
   now = dt.datetime.now(dt.timezone.utc)
   stamps = []
   for p in posts:
       t = p.get("time")
       if not t: continue
       try:
           stamps.append(dt.datetime.fromisoformat(t.replace("Z", "+00:00")))
       except Exception:
           continue
   if not stamps:
       out = {"fb_last_post_at": None, "fb_posts_last_90d": None, "fb_likes": page.get("likes")}
   else:
       window_days = (now - min(stamps)).days
       out = {
           "fb_last_post_at": max(stamps).isoformat().replace("+00:00", "Z"),
           "fb_posts_last_90d": sum(1 for s in stamps if (now - s).days <= 90) if window_days >= 90 else None,
           "fb_likes": page.get("likes"),
       }
   print(json.dumps(out))
   PY
   ```

   Carry these three values into Phase 4's `lead-profile.json` schema under `metadata.fb_url`, `metadata.fb_last_post_at`, `metadata.fb_posts_last_90d`, `metadata.fb_likes`. They're not yet first-class columns on `lead_profiles` — a future PR will promote them with a NERVE migration mirroring `ig_post_recency` (PR #83). For now `metadata` is the queryable surface.

When you assign `photo_roles` in Phase 2, treat `fb_<slug>_logo.jpg` as the highest-priority `logo` candidate (it's the page's chosen avatar) and `fb_<slug>_cover.jpg` as a strong `storefront` candidate when the actual storefront is missing from Google Maps. Post photos are typically `product_close` / `product_assortment` / `lifestyle` — assess on merit per the standard role rules.

If any FB MCP call errors (rate-limit, page private, page not found), surface the error once and continue — Google Maps + Mapillary + IG (if any) are still enough to run Phase 2 and the FB metadata fields stay null.

### Instagram (via Apify MCP)

If an Instagram handle is known for the business (from Phase 0 website
probe, Phase 1 search results, manually-dropped IG screenshots, or the
user's prompt), pull recent posts via the Apify MCP scraper. **Skip
silently if no handle is known** — never invent one.

Three steps, all run by you (the assistant), not by a shell wrapper:

1. Call `mcp__apify__apify--instagram-scraper` with:
   - `directUrls`: `["https://www.instagram.com/<handle>/"]`
   - `resultsType`: `"posts"`
   - `resultsLimit`: `50` (≈ £0.10 per lead at $2.30/1000 results). The bump from 25 to 50 buys reliable 90-day post coverage for active accounts — without it, very active bakeries / barbers post enough that 25 posts span only 30 days and the `ig_posts_last_90d` aggregate undercounts.
   - `addParentData`: `false`

   The response includes a `datasetId`. The inline `items` array is a
   preview and is often capped before you see all 25 — **do not** use it
   directly. Grab the `datasetId`.

2. Call `mcp__apify__get-dataset-items` with:
   - `datasetId`: the value from step 1
   - `fields`: `"type,shortCode,displayUrl,images"`
   - `clean`: `true`

   Then save the `items` array (not the wrapping object) to
   `$LEAD_DIR/.cache/ig-items.json`. Easiest path: pipe the saved MCP
   response through `jq '.items' > "$LEAD_DIR/.cache/ig-items.json"`.

3. Run the downloader, which filters and saves photos:

   ```bash
   bash ~/.claude/scripts/apify/ig-profile.sh "<handle>" "$PHOTOS" "$LEAD_DIR/.cache/ig-items.json"
   ```

   Files land as `ig_<handle>_<shortcode>[_n].jpg`. The wrapper handles:
   Sidecar → every carousel image; Image → displayUrl; Video → cover frame
   (still a real photo of the business's work). Set `IG_SKIP_VIDEOS=1`
   beforehand if you want video posts dropped entirely.

4. **Compute post-recency aggregates from the same dataset.** Each item
   has a `timestamp` field (ISO 8601). Before moving on, derive three
   values and stash them for the lead-profile.json payload:

   - `ig_last_post_at` = `max(item.timestamp for item in items)`
   - `ig_posts_last_90d` = `count(items with timestamp > now - 90d)`
   - `ig_posts_per_month_median` = bucket items by `YYYY-MM`, count per
     bucket, return the median count across buckets

   Easiest implementation is a one-shot Python snippet over the same
   `.cache/ig-items.json` you just saved:

   ```bash
   python3 << 'PY' > "$LEAD_DIR/.cache/ig-recency.json"
   import json, statistics, datetime as dt
   from pathlib import Path
   items = json.load(open(Path.home() / "Desktop/salespatch-demos/<slug>/.cache/ig-items.json"))
   now = dt.datetime.now(dt.timezone.utc)
   stamps = [dt.datetime.fromisoformat(i["timestamp"].replace("Z","+00:00"))
             for i in items if i.get("timestamp")]
   if not stamps:
       print(json.dumps({"ig_last_post_at": None, "ig_posts_last_90d": None, "ig_posts_per_month_median": None}))
   else:
       buckets = {}
       for s in stamps:
           key = s.strftime("%Y-%m")
           buckets[key] = buckets.get(key, 0) + 1
       window_days = (now - min(stamps)).days
       out = {
           "ig_last_post_at": max(stamps).isoformat().replace("+00:00","Z"),
           "ig_posts_last_90d": sum(1 for s in stamps if (now - s).days <= 90) if window_days >= 90 else None,
           "ig_posts_per_month_median": statistics.median(buckets.values()),
       }
       print(json.dumps(out))
   PY
   ```

   `ig_posts_last_90d` is intentionally `null` when the scraped window
   spans fewer than 90 days — the alternative is an under-counted
   lower-bound that downstream queries can't distinguish from a real
   value. Better honest null than misleading number.

   Carry these three values into Phase 4's `lead-profile.json` schema:
   `ig_last_post_at`, `ig_posts_last_90d`, `ig_posts_per_month_median`
   at the top level. They're now queryable columns on `lead_profiles`
   (per migration 19_ig_post_recency).

If the MCP tool errors (auth expired, rate-limit, profile private),
surface the error once and continue — the manually-dropped photos are
still enough to run Phase 2 and the three recency fields stay null.

### Logging

Append a log line for each source actually run (fresha, google, ig):

```json
{"ts":"<ISO>","stage":"grab-photos","source":"ig","count":<N>,"slug":"<slug>"}
```

If a helper errors, surface it once and continue — partial photos are still
useful.

After Phase 1.5 completes, Phase 2 reads the full `photos/` folder (manual IG
+ auto Fresha + auto Mapillary + auto Google Maps + auto Facebook + auto
Apify IG) and produces brand intelligence on all of it.

---

## Phase 3.5 — Consult NERVE learning-context (optional)

Before writing the brief, pull recent decisions + insights NERVE has accumulated for this agent. The endpoint is fire-and-forget — if it 404s or times out, proceed without it.

```bash
~/.claude/scripts/nerve/get-ingest.sh /api/read/decisions/learning-context "agent_id=spec-site-brief&limit=10" 2>/dev/null
```

If `total_decisions > 0` and the success_rate is meaningful, scan `recent_decisions` for any that touch this vertical / postcode area and let them bias your verdict and pitch angle. Surface what you used in `metadata.learning_context_applied`. If the response is empty (we haven't ingested any decisions yet for this agent), skip silently.

---

## Phase 4 — Output

Deliver in this exact order. No preamble, no summary, no postscript.

### 1. VERDICT

One line. PROCEED or PASS, with reason.

Examples:

- `PROCEED — strong IG (16.9K), no site, 4.9 from 270 reviews, Good Food Guide listed.`
- `PASS — modern functional site already live at examplebakery.com.`

### 2. BUSINESS SNAPSHOT

- Name
- Address and postcode
- Owner (if known, else null)
- Google rating and review count
- Instagram handle and followers
- Years trading (if known)
- Awards, guides, press hits — with sources cited

### 3. BRAND INTELLIGENCE

The colour, type, logo, voice, and aesthetic positioning analysis from Phase 2. Concrete. Decisive. No hedging.

Format:

```
COLOUR
- Dominant: #XXXXXX (~70%)
- Neutral: #XXXXXX (~20%)
- Accent: #XXXXXX (~10%)

TYPE
- Display: [voice] → [Google Font(s)], weights X/Y
- Body: [voice] → [Google Font], weight X
- Mono/menu: [Google Font], weight X
- [Asset note if anything must be lifted from photos]

LOGO / MASCOT
- [Description detailed enough for SVG reproduction]
- [Clean-vector / hand-imperfect / asset-only]

VOICE
- [Adjective adjective adjective]
- Verbatim lines to preserve:
  > "[exact quote 1]"
  > "[exact quote 2]"

POSITIONING
- [Single named reference, one sentence on why]
```

### 4. THE DIAGNOSIS

The one-sentence conversion problem from Phase 3, plus 2–3 secondary problems that fall under it.

### 5. THE PITCH ANGLE

One line the rep can lead with at the door. Specific to this business. Prove research happened. No openers that could apply to any business on the high street.

Bad: `"I think a website could really help your business."`
Good: `"You sold out by 11:42 yesterday. The 200 people who saw the empty case never come back. This fixes that."`

### 6. DEMO SITE BLUEPRINT

Sections in priority order, with one sentence each on what that section needs to do for THIS business. No generic template structure. Earn every section.

Example shape (do not copy, generate fresh):

```
1. Hero — [headline approach + what it must say in 8 words or less]
2. Today's drop / live status — [why this section, what data it shows]
3. [Section 3] — [reason]
...
```

### 7. THE TEST OF SUCCESS

One line. If the owner sees this and their reaction is not `[specific reaction]`, the demo failed. Make the reaction concrete to them.

Examples:

- `"That's literally what we say on Instagram."`
- `"How did you know we sell out by lunchtime?"`
- `"Wait, this looks like us."`

---

## Rules of engagement

- **British English throughout.** Colour, organisation, favourite, recognise, analyse, etc.
- **No em-dashes.** Use periods, commas, or spaced hyphens. The em-dash is the most reliable AI-writing tell and it kills the credibility of the brief.
- **No marketing-mush vocabulary.** Banned words: unlock, leverage, transform, elevate, seamless, bespoke (unless it is literally bespoke, e.g. a tailor), curated, journey, empower, robust, holistic, synergy.
- **No exclamation marks.**
- **Specifics beat adjectives.** "Sells out by 11:42am" beats "very popular." Quote real numbers, real reviews, real press. If you do not have a number, do not invent one.
- **If a fact is not in the research, mark it null or unknown.** Never fabricate awards, quotes, founding dates, or owner names. The pitch dies the moment the rep says something the owner knows is wrong.
- **Be opinionated.** Hedging is worse than being wrong. If two aesthetic directions are viable, pick one and explain why. The user would rather argue with a strong call than untangle a vague one.
- **The output feeds into a build prompt and a sales JSON.** Treat it as scaffolding for those, not standalone copy. Keep section headers consistent so downstream parsing works.

---

## Required input

The user will provide:

- **Business name**
- **Location** (city or area, ideally with postcode if known)
- **Photos** — storefront, interior, products, Instagram screenshots, menu cards, packaging. Any combination. Read every photo.
- **Optional context** — owner is anti-tech, the rep has been a customer for years, they just won an award, etc.

### Where the photos live

The standard workflow uses a per-business lead folder scaffolded by the `/new-lead` command:

```
~/Desktop/salespatch-demos/[slug]/
  photos/    <-- the user drops images here
  outputs/   <-- brief.md, demo.html, lead.json land here
  logs/      <-- run.jsonl for training and audit
```

Before running this skill:

1. Convert the business name to a slug (lowercase-hyphenated, no punctuation).
2. Look for `~/Desktop/salespatch-demos/[slug]/photos/`. If it exists, read every image in that folder using the Read tool. That is the photo input.
3. If the folder does not exist, ask the user to run `/new-lead "<business name>"` first, drop their photos into the resulting folder, then re-invoke the skill. Do not run Phase 2 without photos. Brand intelligence without visual input is guesswork.

If the user pastes images directly into the chat instead, that is fine too. The folder is the preferred path because it persists across sessions and feeds the rest of the pipeline.

### Where to save the brief

After producing the brief, write it to `~/Desktop/salespatch-demos/[slug]/outputs/brief.md` so `/build-demo` and `/lead-json` can read it without re-pasting. Use the same markdown structure that you output in chat. Include the seven section headers verbatim.

### Logging

After saving the brief, append one JSON line to `~/Desktop/salespatch-demos/[slug]/logs/run.jsonl`:

```
{"ts":"<ISO 8601 UTC>","stage":"brief","slug":"<slug>","photo_count":<int>,"verdict":"<PROCEED|PASS>","brief_chars":<int>,"output":"outputs/brief.md"}
```

This builds a training corpus and audit trail across hundreds of demos. Do not skip it.

### NERVE ingest (write the brief into the SL-MAS data warehouse)

After the local files exist and the brief log line is appended, also flow the structured data into NERVE Postgres so the AI layer can query historical briefs. This step is fire-and-forget — if the network is down, the local files are still source of truth and the skill can be re-run later to backfill.

Skip this step entirely if the verdict is PASS (no brief means nothing to ingest) or if `~/.claude/scripts/nerve/post-ingest.sh` is missing (degrades cleanly).

Generate three structured sidecars from the brief content you just wrote, save them next to brief.md, then POST each via the helper. The sidecars are also useful for `/build-demo` and `/lead-json` downstream — they don't have to re-parse the markdown.

**1. `outputs/brief.json`** — full brief structured for the `SiteBrief` schema.

```json
{
  "brief_id": "<slug>-<iso_no_colons>",
  "lead_id": "<slug>",
  "business_name": "<exactly as in section 2 of the brief>",
  "business_type": "<from the brief>",
  "vertical": "<one of: hospitality | grooming | health | creative | retail | other>",
  "postcode": "<outward postcode only, e.g. AB10>",
  "address": "<full address from snapshot>",
  "owner_name": "<owner if known, else null>",
  "verdict": "PROCEED",
  "verdict_reason": "<the one-liner from section 1>",
  "google_rating": <number or null>,
  "google_review_count": <integer or null>,
  "instagram_handle": "<handle without @ or null>",
  "instagram_followers": <integer or null>,
  "years_trading": "<free-form, e.g. 'since 2014' or '~9 months' or null>",
  "awards_press": ["<each verbatim citation>"],
  "diagnosis": "<the one-sentence Phase 4 diagnosis>",
  "pitch_angle": "<the Phase 5 line for the door>",
  "test_of_success": "<the Phase 7 recognition reaction>",
  "blueprint_sections": [
    { "name": "<section name>", "intent": "<one-sentence intent>" }
  ],
  "brief_markdown": "<the entire brief.md content verbatim>",
  "source": "manual_skill",
  "metadata": {
    "diagnosis_alternatives_considered": [
      { "diagnosis": "<rejected diagnosis>", "why_rejected": "<one line>" }
    ],
    "positioning_alternatives_considered": [
      { "reference": "<rejected positioning reference>", "why_rejected": "<one line>" }
    ],
    "verdict_reasoning_trace": "<the chain of evidence that produced PROCEED/PASS — what specifically tipped it>",
    "enrichment": "<paste the FULL contents of outputs/enrichment.json from Phase 0 here as a nested object — geocode, postcode_info, companies_house, osm_poi, website_probe>",
    "learning_context_applied": "<short note on what Phase 3.5 decisions/insights actually influenced this brief, or null if none>"
  },
  "generated_at": "<ISO 8601 UTC, same as the run.jsonl ts>"
}
```

The three metadata fields are the reasoning trace: what you considered and rejected, not just what won. These never appear in brief.md (the rep doesn't need them), but they're what the AI layer needs to learn "stop suggesting owned-audience gap for sub-2k IG bakeries" without re-running every brief. Required fields when the verdict is PROCEED; for PASS, only `verdict_reasoning_trace` is required (the others can be empty arrays).

**2. `outputs/brand-analysis.json`** — Phase 2 structured for `BrandAnalysis`.

```json
{
  "analysis_id": "<slug>-brand-<iso_no_colons>",
  "lead_id": "<slug>",
  "brief_id": "<same brief_id as above>",
  "dominant_hex": "#XXXXXX",
  "dominant_pct": <0-100>,
  "neutral_hex": "#XXXXXX",
  "neutral_pct": <0-100>,
  "accent_hex": "#XXXXXX",
  "accent_pct": <0-100>,
  "display_font": "<Google Font name>",
  "display_fallback": "<serif|sans-serif|monospace>",
  "body_font": "<Google Font name>",
  "body_fallback": "<serif|sans-serif|monospace>",
  "mono_font": "<Google Font name or null>",
  "mono_fallback": "<monospace or null>",
  "logo_description": "<the LOGO/MASCOT description verbatim>",
  "logo_kind": "<clean_vector | hand_imperfect | asset_only>",
  "voice_adjectives": ["<adjective>", "<adjective>", "<adjective>"],
  "voice_quotes": ["<verbatim line 1>", "<verbatim line 2>"],
  "positioning_reference": "<the one named reference, e.g. 'Sang Bleu London editorial'>",
  "positioning_rationale": "<the one-line why>",
  "asset_notes": ["<each asset that must be lifted from photos>"],
  "photo_roles": {
    "<filename as it appears in photos/>": "<one of: logo|storefront|interior|product_close|product_assortment|menu|press|lifestyle|unused>"
  },
  "analysis_markdown": "<Phase 2 section verbatim>",
  "source": "manual_skill",
  "metadata": {
    "existing_integrations": [
      {
        "name": "<e.g. Booksy>",
        "type": "<booking|reservation|payment|newsletter|event|gallery|catalogue|other>",
        "url": "<full https URL>",
        "treatment": "<embed|link|deep_link>",
        "evidence": "<one line — where Phase 1 saw it>"
      }
    ],
    "feature_opportunities": [
      {
        "feature": "<email_drop_list|enquiry_form|portfolio_filter|price_anchor|newsletter|event_calendar|wholesale_path|gallery_grid|live_status|other>",
        "rationale": "<one line — must trace back to brief facts>",
        "priority": <1-5>
      }
    ],
    "logo_background_analysis": {
      "has_white_bg": <bool>,
      "needs_alpha_channel": <bool>,
      "suggested_treatment": "<transparent_png|drop_shadow|wrapped_container|none>",
      "rationale": "<one line>"
    }
  },
  "analyzed_at": "<same ISO 8601 UTC>"
}
```

`existing_integrations` and `feature_opportunities` both default to `[]`. `logo_background_analysis` is required (set `suggested_treatment: "none"` for already-alpha PNGs). See "Feature inventory" + "Logo / mascot" in Phase 2 for capture rules.

**3. `outputs/lead-profile.json`** — business snapshot for `LeadProfile`.

```json
{
  "lead_id": "<slug>",
  "business_name": "<as in brief>",
  "business_type": "<as in brief>",
  "vertical": "<same vertical as above>",
  "postcode": "<outward only>",
  "address": "<full address>",
  "phone": "<from enrichment.osm_poi.phone if matched, else E.164 if known from research, else null>",
  "email": "<from enrichment.osm_poi.tags.email if present, else null>",
  "website_url": "<from enrichment.website_probe.url if reachable AND platform is in the SMB-platform list, else null>",
  "google_rating": <number or null>,
  "google_review_count": <integer or null>,
  "google_last_review_at": "<ISO 8601 from Phase 1 review-recency aggregate, or null>",
  "google_reviews_last_30d": "<integer from Phase 1 review-recency aggregate, or null if window/cap constraint>",
  "google_reviews_last_90d": "<integer from Phase 1 review-recency aggregate, or null if window/cap constraint>",
  "instagram_handle": "<without @ or null>",
  "instagram_followers": <integer or null>,
  "instagram_post_count": <integer or null>,
  "bio_cta_type": "<one of: call | dm | link_in_bio | fresha | booksy | treatwell | website | none>",
  "ig_last_post_at": "<ISO 8601 from Phase 1.5 recency aggregate, or null>",
  "ig_posts_last_90d": "<integer from Phase 1.5 recency aggregate, or null if scrape window < 90 days>",
  "ig_posts_per_month_median": "<float from Phase 1.5 recency aggregate, or null>",
  "qualifier_verdict": "qualified",
  "qualification_reasons": ["<the verdict_reason from the brief>"],
  "metadata": {
    "source_brief_id": "<the same brief_id>",
    "lat": "<from enrichment.geocode.lat or null>",
    "lng": "<from enrichment.geocode.lng or null>",
    "admin_district": "<from enrichment.postcode_info.admin_district or null>",
    "admin_ward": "<from enrichment.postcode_info.admin_ward or null>",
    "company_number": "<from enrichment.companies_house.company_number if matched, else null>",
    "years_trading_int": "<from enrichment.companies_house.years_trading if matched AND postcode_confirms_match, else null>",
    "officers": "<from enrichment.companies_house.officers if matched, else []>",
    "fb_url": "<canonical Facebook page URL captured in Phase 1, or null>",
    "fb_likes": "<integer from Phase 1.5 fb-recency.json or null>",
    "fb_last_post_at": "<ISO 8601 from Phase 1.5 fb-recency.json or null>",
    "fb_posts_last_90d": "<integer from Phase 1.5 fb-recency.json, or null if scrape window < 90 days>"
  },
  "profiled_at": "<same ISO 8601 UTC>"
}
```

After writing all three files, run three `bash` commands using the helper. Each is fire-and-forget — pipe stdout to /dev/null but let stderr surface so an HTTP 401 / 503 is visible.

```
~/.claude/scripts/nerve/post-ingest.sh /api/ingest/site-brief      ~/Desktop/salespatch-demos/[slug]/outputs/brief.json         >/dev/null
~/.claude/scripts/nerve/post-ingest.sh /api/ingest/brand-analysis  ~/Desktop/salespatch-demos/[slug]/outputs/brand-analysis.json >/dev/null
~/.claude/scripts/nerve/post-ingest.sh /api/ingest/lead-profile    ~/Desktop/salespatch-demos/[slug]/outputs/lead-profile.json   >/dev/null
```

Then append one more line to run.jsonl:

```
{"ts":"<same ISO>","stage":"nerve-ingest","slug":"<slug>","brief_id":"<the brief_id>","analysis_id":"<the analysis_id>","posted":["site-brief","brand-analysis","lead-profile"]}
```

If any of the three posts returns non-2xx, do not retry inline. Surface the failure once in the chat output (e.g. "NERVE site-brief post returned HTTP 503 — local file is the source of truth, re-run the skill to retry") and continue. The skill is replay-safe: re-invoking it on the same lead reuses the same brief_id (because `<slug>-<iso_no_colons>` is derived from the slug + the *current* run, not the brief content) — so a backfill creates a NEW row rather than re-attempting the same insert. That is intentional. Each rerun is a new audit-traceable iteration.

The id derivation rule: use the same UTC ISO timestamp (without colons or fractional seconds) you stamped into the run.jsonl ts. Example: `noose-and-needle-2026-05-10T182642Z` for the brief_id, `noose-and-needle-brand-2026-05-10T182642Z` for the analysis_id.

---

## What good looks like

A successful brief reads like it was written by someone who walked into the shop yesterday, sat down with a coffee, and wrote up what they saw. Specific. Lived-in. Decisive. The rep should be able to read it once on the bus to the shop and walk in knowing exactly what to say.

A failed brief reads like a generic template with the business name plugged in. Hedged colour palettes, three "potential directions" for the aesthetic, marketing-school diagnosis ("they would benefit from improved digital presence"). Bin it and start again.

---

## After the brief

Once the brief is delivered (and the verdict is PROCEED), close with one line:

> Ready to build. Run `/build-demo [slug]` to ship the HTML, then `/lead-json [slug]` to generate the lead-card payload.

### The full pipeline

1. `/new-lead "<business name>"` → scaffolds `~/Desktop/salespatch-demos/[slug]/{photos,outputs,logs}/` and opens the photos folder in Finder.
2. User drags photos into `~/Desktop/salespatch-demos/[slug]/photos/`.
3. `spec-site-brief` skill (this) → reads photos, writes brief to `outputs/brief.md`, writes structured sidecars `outputs/brief.json` + `outputs/brand-analysis.json` + `outputs/lead-profile.json`, posts each to NERVE Postgres, logs to `logs/run.jsonl`.
4. `/build-demo [slug]` → reads brief and photos, embeds photos as base64, writes single-file demo to `outputs/demo.html`, logs to `logs/run.jsonl`.
5. `/lead-json [slug]` → reads brief and demo, writes admin payload to `outputs/lead.json`, then assembles `~/Desktop/salespatch-demos/[slug]/submit/{[slug].html, [slug].json}` and opens it in Finder. The submit folder is the final artifact: drag those two files into the admin "New lead" form and you're done.

Every stage stays in the same folder. The `logs/run.jsonl` file accumulates one line per stage and forms a per-business audit trail and training corpus. The NERVE ingest in step 3 also flows the structured brief + brand analysis + lead profile into Postgres so the AI layer can query history across every demo built to date.

Do not auto-build or auto-generate JSON. The user controls when to ship each stage.
