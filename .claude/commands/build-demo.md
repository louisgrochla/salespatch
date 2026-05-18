---
description: Build a single self-contained HTML demo site from a spec-site-brief. Reads the brief and photos from ~/Desktop/salespatch-demos/[slug]/ and writes the demo back into the same folder. Run this immediately after the spec-site-brief skill produces a brief.
argument-hint: [business slug, e.g. "bandit-bakery" — or leave blank to use the most recent ~/Desktop/salespatch-demos/ folder]
---

# Spec Site Build — Demo Generation From Research Brief

You have just produced (or have access to) a research brief on a local UK business covering: verdict, business snapshot, brand intelligence, diagnosis, pitch angle, demo blueprint, and test of success. That brief is your only source of truth. Read it before you start. Do not search again, do not invent new facts, do not contradict the diagnosis.

## Locating the lead folder

Resolve the working folder in this order:

1. If `$ARGUMENTS` is a slug (e.g. `bandit-bakery`), use `~/Desktop/salespatch-demos/$ARGUMENTS/`.
2. If `$ARGUMENTS` is a path to a brief file, use the directory two levels up from it (the brief lives in `outputs/`).
3. If `$ARGUMENTS` is empty, list `~/Desktop/salespatch-demos/*/` and pick the most recently modified one.

From the lead folder, read:

- `outputs/brief.md` — the brief is your only source of truth.
- `photos/*` — every image in this folder. Use the Read tool on each one to actually look at them. Do not skip this step. The visual analysis decides where each photo goes in the demo.

If `outputs/brief.md` is missing, stop and tell the user to run the `spec-site-brief` skill first. If `photos/` is empty, build with placeholders but warn that the demo will need photos before it ships.

Your job now is to ship a single self-contained HTML file that turns that brief into a sellable demo site. One file, all CSS and JS inline, no build step, no framework, opens in any browser offline after first load.

---

## NERVE consultation (D1 — read before building)

Before doing anything else, consult NERVE for prior signal on what's working in this vertical. NERVE is the SL-MAS data warehouse; it knows what design combinations have closed for similar leads and what features the closed leads tended to have. This step is the read-side of the self-learning loop. Skip cleanly if any of the inputs are missing.

1. Determine the vertical. Prefer `outputs/brief.json` if present (`.vertical`); otherwise fall back to the brief.md's "Business snapshot" line. If both are missing, skip this whole section and proceed to Pre-flight.

2. Skip if `~/.claude/scripts/nerve/get-ingest.sh` is missing. The helper is the only thing that knows the HMAC secret. Don't reimplement it inline.

3. Fetch strategies for the vertical:
   ```
   ~/.claude/scripts/nerve/get-ingest.sh /api/read/strategies "vertical=<vertical>" 2>/dev/null
   ```
   Parse the JSON. Extract entries with `status="champion"` first, then `status="active"`. For each, note `parameters` (a `{key: value}` map of design dimensions) + `close_rate` + `sample_size`.

4. Fetch winning features for the vertical:
   ```
   ~/.claude/scripts/nerve/get-ingest.sh /api/read/lead-profiles/winning-features "vertical=<vertical>" 2>/dev/null
   ```
   Parse the JSON. If `data_available: true`, note `closed_count`, `median_instagram_followers`, `median_photo_count`, `median_google_rating`, `has_logo_rate`, `top_categories[0].category`. If `data_available: false`, note only `total_profiled` and move on.

5. Surface the read in your reasoning. Before locking the palette / typography / sections, write a single short paragraph that names what NERVE returned. Examples:
   - "NERVE: champion strategy for vertical=barber is `palette=heritage_green, typography=serif` (n=3, 100% close rate). Winning barbers had a median 1200 Instagram followers and 40 photos. I'll bias the palette + typography toward champion unless the brief explicitly contradicts."
   - "NERVE: no champion yet for vertical=florist (n=0 closed). Returning to brief as the only source of truth."

6. Apply the bias. Champion `parameters` are **defaults** for the matching dimensions in the brief — the brief still wins on conflict (it has lead-specific intelligence the warehouse doesn't), but on dimensions the brief left soft or generic, prefer the champion choice. If the brief says "use dusty pink because the storefront sign is dusty pink", that overrides champion `palette`. If the brief just says "warm neutrals", and `palette=heritage_green` is champion, lean into heritage_green within the warm-neutrals constraint.

7. If `get-ingest.sh` returns non-2xx, print the failure once ("NERVE read returned HTTP <code> — proceeding without prior signal") and continue. Don't retry, don't fail the build.

---

## Pre-flight (do this first, every time)

1. If the brief's verdict is PASS, stop. Output one line confirming the pass and the reason. Do not build.

2. **Read the structured sidecars first.** If `outputs/brand-analysis.json` exists, it is the authoritative source for hex codes (`dominant_hex`/`neutral_hex`/`accent_hex`), fonts (`display_font`/`body_font`/`mono_font`), voice quotes (`voice_quotes[]`), positioning reference (`positioning_reference`), asset notes (`asset_notes[]`), and the `photo_roles` map. Do not re-parse those values out of brief.md prose — the sidecar is the structured commitment the brief made, brief.md is the human-readable summary. If the sidecar is missing (pre-sidecar lead), fall back to parsing brief.md.

3. Re-read the diagnosis from brief.md. The diagnosis is the emotional engine of the site. Every section either serves the diagnosis or earns its place by serving the close. If a section does neither, cut it.

4. Lock the brand intelligence from brand-analysis.json. Lock the colour palette to the hex codes given. Lock the typography to the Google Font choices given. Lock the aesthetic positioning reference. Do not reinterpret. The brief made these calls deliberately.

5. Re-read the test of success from brief.md. Pin it to the top of your reasoning. Every layout decision, every word of copy, every animation gets measured against whether it produces that reaction in the owner.

6a. **Read the logo treatment.** `brand-analysis.json.metadata.logo_background_analysis.suggested_treatment` is the brief's call about how the logo's source file (typically a white-square-background JPEG) needs to render on the demo's dark hero. Apply CSS at build time:

   - `transparent_png` — the build CANNOT fix this with CSS. Render the logo as-is and surface a warn-level note in the chat output: "Logo needs alpha PNG before pitching — current JPEG will show a visible white edge on the dark hero." Operator's job to swap the file.
   - `drop_shadow` — wrap or style the `<img>` so the white card looks intentional: `border-radius: 8px; box-shadow: 0 6px 18px rgba(0,0,0,0.35); padding: 6px; background: #fff`. Keeps the JPEG visible but presents it as a deliberate card.
   - `wrapped_container` — wrap the `<img>` in a `<span class="logo-wrap">` styled `display:inline-flex; align-items:center; justify-content:center; border-radius:50%; background: var(--accent); padding: 4px; aspect-ratio: 1/1;`. Inside, the logo `<img>` gets `border-radius: 50%; display: block; width: 100%; height: 100%; object-fit: cover;`. Hides the JPEG-square's edge for circular badge-style logos. The accent backstop also gives a small "rim" effect that looks intentional.
   - `none` — render the `<img>` directly with no extra container. Use this when the source is already alpha or the JPEG background happens to match the hero.

   When the field is absent (pre-logo-intelligence brief), default to `none` and rely on visual-QA to flag any issue.

6b. **Read the feature inventory.** `brand-analysis.json.metadata.existing_integrations` and `brand-analysis.json.metadata.feature_opportunities` are the brief's structured commitments about which third-party tools the demo MUST preserve and which features the diagnosis says the build should add. Two rules:

   - **`existing_integrations[]`** is non-negotiable. For every entry, the URL must appear in the demo. The `treatment` field decides how:
     - `embed` — render an iframe (Booksy/Treatwell/Fresha/OpenTable/etc) wired into a section. Fall back to a button linking to the URL if the provider blocks iframes (Booksy doesn't; some Fresha endpoints do).
     - `link` — surface as a CTA button or footer link. Don't wrap in an iframe.
     - `deep_link` — preserve the exact URL (don't substitute the provider's home).
     Skipping an entry is a build failure. If the brief listed Booksy and the demo has no Booksy CTA, the lead will think you replaced their booking layer and refuse the pitch.
   - **`feature_opportunities[]`** is suggestive. Priority 1 entries earn their own section unless the diagnosis directly contradicts; priority 2-3 may earn a smaller component (an email-capture strip, an enquiry mailto link, a portfolio-filter dropdown); priority 4-5 are nice-to-have, only build them if the blueprint already has room. Never propose a feature opportunity that conflicts with an existing integration — if Booksy is in `existing_integrations`, do NOT add `enquiry_form` for booking.

   If both arrays are absent (pre-feature-capture brief), fall back to the blueprint sections in brief.md as the only source of truth — the diagnosis-driven killer section still wins.

---

## Build contract

### Output

- One file: `~/Desktop/salespatch-demos/[slug]/outputs/demo.html`.
- Slug is the lead-folder name (already determined above).
- All CSS inline in `<style>`. All JS inline in `<script>`. Google Fonts CDN is the only permitted external resource. One OpenStreetMap iframe is permitted for the visit section.
- **Images: embed every photo as a base64 `data:image/...;base64,...` URI inline in the HTML.** This keeps the file portable for any demo platform (one self-contained file, no relative paths to break). Use the actual JPEG bytes from the photos folder. If no photos exist for a slot, fall back to a CSS gradient placeholder labelled `[ <type> photo · drop file here ]` in mono type.
- Page weight: photos make the file heavy by nature. Aim under 4 MB total. The brief's writing should still be lean.

### Code quality

- Vanilla HTML, CSS, JS. No frameworks, no libraries, no build tools.
- Semantic HTML. Proper landmark elements (`header`, `nav`, `main`, `section`, `footer`). One `h1`, descending heading hierarchy.
- Mobile-first responsive. Test mental model: 375px wide on a knackered iPhone in a busy café. Hero headline must remain legible and the primary CTA must be reachable without zoom.
- **Avoid awkward mobile text-wrap.** Multi-item flex rows (hero tickers, ticker strips, social-proof marquees, nav rows with 4+ items) must wrap predictably at the mobile viewport. Default rule: any flex row with 3+ items must include `@media (max-width: 420px) { .row-class { flex-direction: column; gap: 0.4rem; text-align: left; } }` (or equivalent stacked layout). Without this, the row's `gap: 2rem` desktop default wraps inconsistently at 375px and items land on three or four staggered lines. Tickers, ribbons, and meta strips are the canonical offenders.
- WCAG AA contrast on every text/background pair. The brief's hex palette has been chosen to pass. Verify.
- Keyboard navigable. Modals trap focus. Escape closes them. Forms have proper labels (visible or sr-only).
- Reduced-motion respected. Wrap any non-essential animation in `@media (prefers-reduced-motion: no-preference)`.
- No cookie banner, no analytics, no tracker scripts, no third-party fonts beyond Google Fonts. This is a hand-over file.

---

## Photo classification and placement

The brief already committed a role for each photo in `brand-analysis.json.photo_roles`. That map is the default — the brand decode picked these roles based on the same visual evidence you're about to look at, and the build's job is to execute the brief's commitment, not to re-litigate it.

Workflow:

1. Read `brand-analysis.json.photo_roles`. If missing or empty (pre-sidecar lead), classify from scratch using the table below.
2. Read each photo in `photos/` regardless. Placement decisions (grid span, hero pick, gallery order, which storefront photo gets the credibility-banner slot if there are two) still need visual judgment — the role map only commits *what kind of photo it is*, not *where exactly it goes*.
3. Override the brief's role only with reason. Valid reasons: the role is clearly wrong (e.g. brief said `product_close` but the file is actually a menu), or the role is `unused` but the photo set is so thin you need it. Record every override — it becomes drift metadata in the artefact.

Role enum and default placement:

| Role | What it looks like | Default placement |
|------|---------------------|---------------------|
| **logo** | Brand mark, often square, flat colour, no scene | Hero corner sticker (rotated), nav, footer |
| **storefront** | Exterior, signage visible, often with awards or badges overlaid | Full-bleed credibility banner directly after hero |
| **interior** | People at counter, plants, lived-in detail | Story / about section photo |
| **product_close** | Single dish, pastry, drink, item, well-lit | Bun / hero product feature, or gallery tile |
| **product_assortment** | Multiple items on a tray or shelf | Gallery tile |
| **menu** | Printed menu artwork, chalkboard, hand-painted card | Aside next to the relevant section (food menu, coffee menu) |
| **press** | Editorial quote with attribution, social-share style | Featured press tile |
| **lifestyle** | Item being held, used, served | Gallery tile, or alongside CTA |
| **unused** | Duplicate, off-brand, or contradicts positioning | Do not place |

Place every photo with a non-`unused` role somewhere intentional. If a section in the blueprint maps to a photo role, use the photo. Do not stack placeholders next to real photos. Do not use the same photo twice unless it is the brand logo.

If the photo set is sparse (e.g. only 2 photos), pick the highest-impact placements first: storefront credibility banner and one product hero. Skip the gallery section entirely rather than padding with placeholders.

If the photo set is rich (8+ photos), add a "today's bakes" or "the work" mosaic gallery between the diagnosis-driven killer section and the product hero. Use grid spans to give the most iconic photo a 3x2 feature tile.

Embed every photo using a small inline script step at build time: read the JPEG bytes, base64-encode them, and write `<img src="data:image/jpeg;base64,...">` into the HTML. If you have access to Bash, the simplest tool is a Python one-liner using `base64.b64encode`. Do not link to relative paths. Do not link to the original folder. The HTML must be self-contained.

## Variant mode (PR-I — opt-in)

Default flow produces ONE demo.html. **Variant mode** produces 2-3 hero variants instead, runs the full visual-QA pass against each, and ships the highest-scoring one. Opt-in because variant mode is roughly 3× the build effort + ~3× the QA cost — worth it when the brief lands on a vertical or business where the hero pattern matters disproportionately (e.g. visual-first verticals like florists / photographers / cake-makers).

When the operator invokes /build-demo with variant mode requested, produce three hero strategies into `outputs/variants/<LABEL>/`:

- **Variant A — text-on-solid-colour hero.** Hero is a solid-colour band (use the brief's dominant or accent hex). Photos appear below the fold in product tiles / lookbook. Best for brands whose IDENTITY is the dominant colour (e.g. Aldi-blue, Yves-Klein-blue, Hermès-orange) or where the photos vary too much to anchor one in the hero.
- **Variant B — text-beside-photo split hero.** Hero is a two-column split: copy + CTA on one side, hero photo on the other. Works at all viewport widths because text never overlaps photo. Safe default for verticals where the photo IS the brand (florist, bakery, food) but the text-over-photo pattern is risky.
- **Variant C — text-over-photo hero with strong overlay.** The current default. Full-bleed hero photo with text overlaid via a gradient scrim. Most editorial-feeling when it works; most prone to readability failures when the photo's tone varies (Bouquet Bar's PR-A bug was a Variant-C-style hero).

Each variant gets the same brief, same brand decode, same photos — only the hero pattern + immediate above-fold layout differs. Sections below the hero (about, lookbook, footer, etc.) are identical across variants.

After building all three, run the full visual-QA pass against each (Step 1 through Step 6 of the Visual-QA section, scoped to each `outputs/variants/<LABEL>/demo.html`). Each produces its own `outputs/variants/<LABEL>/qa-visual-result.json`.

Then run the selector:

```bash
npx tsx ~/Desktop/klaude-repo/apps/nerve/scripts/qa-visual-variant-selector.ts \
  ~/Desktop/salespatch-demos/[slug]/outputs
```

The selector writes `outputs/variant-selection.json` with the winner's label + score + per-variant breakdown + why each rejected variant lost. It does NOT copy the winner to `outputs/demo.html` — the skill does that as the final step:

```bash
WINNER=$(jq -r '.winner_label' ~/Desktop/salespatch-demos/[slug]/outputs/variant-selection.json)
cp ~/Desktop/salespatch-demos/[slug]/outputs/variants/$WINNER/demo.html \
   ~/Desktop/salespatch-demos/[slug]/outputs/demo.html
cp ~/Desktop/salespatch-demos/[slug]/outputs/variants/$WINNER/qa-visual-result.json \
   ~/Desktop/salespatch-demos/[slug]/outputs/qa-visual-result.json
```

Downstream stages (`lead-json`, demo-artefact ingest, autofix loop) operate on `outputs/demo.html` unchanged — they don't need to know variants happened.

**Scoring formula** (deterministic, documented in `apps/nerve/scripts/qa-visual-variant-selector.ts`):

| Component | Weight |
|---|---|
| `brand_fidelity.overall_grade` | 35% |
| mean of `section_grades` grades | 25% |
| `voice_consistency.overall_grade` | 15% |
| `owner_reaction.would_buy` (yes=5, maybe=3, no=1) | 10% |
| `customer_reaction.would_act` (yes=5, maybe=3, no=1) | 10% |
| `owner_reaction.test_of_success_passes` (true=5, false=1) | 5% |

All on 0-5 scale. Baseline-aware: when `baseline_comparison` is present and `baselines_available: true`, each above-baseline dimension adds +0.5 and each below-baseline subtracts -0.5 (capped at ±1.5 total).

**Hard-gate:** variants with `has_critical: true` are disqualified — UNLESS every variant has criticals, in which case the picker falls back to fewest-criticals and sets `hard_gate_bypassed: true` in the result. The skill should escalate hard-gate bypass to the human ("every variant has critical bugs; auto-shipping the least-broken — review before pitching").

**When to skip variant mode:** when the brief's diagnosis is text-led (e.g. "owned-audience gap" — the demo's job is the email capture, not the hero), one demo is fine. When the diagnosis is visual-trust-led (e.g. "discovery failure", "trust gap"), variant mode earns its cost.

## Section construction rules

**Strict-blueprint rule.** The brief committed to a specific list in `outputs/brief.json.blueprint_sections`. That list IS the structure of the demo. The build's job is to execute exactly those sections, in that order, with the intent each one specified — not to supplement with template defaults like "Welcome" / "Why choose us" / "Our story" / "Testimonials" / "FAQ" / "Newsletter signup" / generic services grids.

Concretely:

- **Build N sections, where N = `length(blueprint_sections)`.** No more, no fewer.
- **Section order matches the brief's order.** The brief decided this; the build doesn't re-rank.
- **Section names match the brief's `name` field** (use as the section's heading or aria-label so the warehouse can reconcile what was promised vs what shipped).
- **Section purpose is the brief's `intent` field** — the section must materially serve that intent. If the build can't honour the intent with the materials available (photos, voice quotes, integrations), surface the gap back to the operator in the chat output rather than substituting filler.

If the build feels the urge to add a section the brief didn't list — STOP. The brief is the source of truth. Either:
- The blueprint was insufficient (a brief failure, not a build failure — flag back to /spec-site-brief), or
- The extra section is the build's own templatey instinct trying to assert itself. Resist it.

The only universal sections the build adds without a brief entry are the **nav** and the **footer** — they're chrome, not content. Everything between nav and footer is exclusively the brief's blueprint.

### Why this rule replaces the old "standard pattern"

The previous version of this skill listed a "standard pattern" of nine sections (HERO / SOCIAL PROOF / DIAGNOSIS-DRIVEN / PRODUCT / STORY / PRESS / WHOLESALE / VISIT / FOOTER) with examples and instructions for each. Even with "adapt, don't follow blindly" framing, the catalogue trained the build toward shipping that pattern by default. Every demo trended toward the same nine sections regardless of the brief's actual blueprint. The result was templatey demos that swapped names + photos + colours but kept the same skeleton.

Removing the catalogue forces the build to construct each section from scratch using the brief's `intent` text, not a template. The diversity of demos increases; the time-to-template-detection by operators decreases.

### Per-section construction

For each blueprint entry, before writing markup:

- Read the brief's `intent` literally. What is the section supposed to *do* for the diagnosis?
- What's the one specific fact from the brief that makes this section obviously THIS business and not a generic same-vertical version?
- What is the tap target — what action does the visitor imagine taking?
- What materials does the brief give you (photos, voice quotes, integrations)? If the materials don't cover the intent, the section gets a smaller scope, not invented filler.

Then build the section's markup. No reaching for the old pattern.

### Banned mobile-hero copy patterns (statically detectable)

To avoid the canonical templatey hero patterns, the build must NOT produce any of these in the hero h1 or sub-line:

- `<Place name> <noun>, made for <X>` (e.g. "Aberdeen nails, made for repeat visits")
- `Where <adjective> meets <adjective>` (e.g. "Where craft meets care")
- Rule-of-three nouns separated by `·` or `,` with no specific facts (e.g. "Quality. Craft. Care.")
- "The place for <category>" / "Your <category> destination"
- "We believe in <X>" / "At <business>, we..."

These are AI tells. The hero must reference a fact only this business has — a year, a number, a location detail, a verbatim caption line.

### Interactions

- **Reservation modal** (if diagnosis is capture-driven): item name in title, date picker, qty selector, name, email, confirm button. Fake submission — show a success state in the brand's voice. No backend.
- **Email capture** (if diagnosis is audience-driven): single field, inline button, success state replaces form. Believable subscriber count below. Never round numbers. "2,847" beats "3,000".
- **Hover states**: 2px lift, scale 1.02, accent shadow appearing. No glow, no gradient shift, no neon. The brand decides whether motion is welcome.
- **Marquee**: 30s loop, infinite, no pause on hover.
- **Live tickers**: items-remaining counter that decreases occasionally via setInterval. Subtle, not theatrical. Stops at 3.
- **Section transitions**: hard cuts. No fade-in-on-scroll unless the brand brief specifically asks for editorial softness.

---

## Copywriting contract

- British English. Colour, organisation, favourite, kerb, queue.
- No em-dashes anywhere. Spaced hyphens, periods, or commas.
- No exclamation marks anywhere.
- Banned vocabulary: unlock, leverage, transform, elevate, seamless, bespoke (unless literally bespoke), curated, journey, vibrant, nestled, passionate, dedicated, premium, world-class.
- Banned openers: "Welcome to [name], where..." / "At [name], we believe..." / "Discover [name]..." Burn these on sight.
- Match the voice the brief captured. If they swear in their press coverage, the press tile preserves it. If they write lowercase on Instagram, the demo writes lowercase.
- Specifics over adjectives. "Sells out by 11:42am" beats "very popular." "Pete and Sarah, baking since 4am" beats "passionate family-run team." Quote real numbers from the brief.
- Voice consistency: pick one (confident-deadpan, warm-editorial, punk-direct, refined-quiet) and hold it across every string. The brief named the aesthetic. Match the copy to it.

---

## Failure modes to avoid

- Generic bakery / barber / florist template that could swap in any other business of the same type. If you could change the name and photos and use it elsewhere, it failed.
- Balanced colour palette. The brief said one colour dominates. Make it dominate ~70% of viewport real estate. Accent shocks, doesn't share.
- Stock-photo energy from gradient placeholders. The placeholders should look intentional, not lazy. Use the brand colours.
- Soft shadows, rounded-corner-everywhere, purple-pink gradients, centered-everything layouts. These are AI tells. Earn every soft edge.
- "Modern minimal" as a default when the brief asked for something with personality. Minimalism is a choice, not a fallback.
- Five-section sites when the diagnosis only needed three. Length is not depth.
- Forgetting the mobile experience. The owner WILL open this on their phone in front of customers. Test it mentally at 375px.

---

## Logging

After the file is written, append one JSON line to `~/Desktop/salespatch-demos/[slug]/logs/run.jsonl`:

```
{"ts":"<ISO 8601 UTC>","stage":"build-demo","slug":"<slug>","photo_count":<int>,"size_kb":<int>,"output":"outputs/demo.html"}
```

This builds an audit trail across the operation. Do not skip it.

## NERVE ingest (write the demo artefact into the SL-MAS data warehouse)

After the local file is written and the build-demo log line is appended, also flow the artefact into NERVE Postgres so the AI layer can query past demos directly. Fire-and-forget — if the post fails the local file is still source of truth and `/build-demo` can be re-run. Skip the step entirely if `~/.claude/scripts/nerve/post-ingest.sh` is missing (degrades cleanly).

If `outputs/brief.json` exists from a prior `spec-site-brief` run, parse it for the `brief_id`, `vertical`, `business_name`, and pull `aesthetic_positioning` + `dominant_hex` from `outputs/brand-analysis.json` if that exists too. The mirrored fields let NERVE answer queries like "show me every Sang-Bleu-style demo" without joining tables.

Write the artefact sidecar at `~/Desktop/salespatch-demos/[slug]/outputs/demo-artefact.json`:

```json
{
  "artefact_id": "<slug>-demo-<iso_no_colons>",
  "lead_id": "<slug>",
  "brief_id": "<from outputs/brief.json if present, else null>",
  "business_name": "<from brief.json or fall back to brief.md section 2>",
  "vertical": "<from brief.json>",
  "html_inline": "<the full content of outputs/demo.html, escaped as JSON string>",
  "photo_count": <int — same value you logged in run.jsonl>,
  "aesthetic_positioning": "<from brand-analysis.json if present>",
  "dominant_hex": "<from brand-analysis.json if present>",
  "source": "manual_skill",
  "metadata": {
    "size_kb": <int>,
    "build_demo_session": "<the same iso stamp>",
    "design_rationale": "<one short paragraph, 2-5 sentences. WHY the build made the calls it did — not WHAT the diagnosis said. Mention the choices that wouldn't be obvious from the rendered HTML alone: why 8 gallery tiles instead of 4, why hero-bg interior instead of storefront, why the diagnosis-driven section landed second instead of first, what alternative the build considered and rejected. Required when verdict=PROCEED.>",
    "photo_classifications": {
      "<filename>": {
        "role": "<final role used in the demo: logo|storefront|interior|product_close|product_assortment|menu|press|lifestyle|unused>",
        "brief_role": "<role from brand-analysis.json.photo_roles, or null if absent>",
        "drift": "<true if role differs from brief_role, false otherwise>"
      }
    },
    "photos_unused_count": <int — photos in the folder that didn't make the demo>,
    "layout_decisions": {
      "hero_photo_filenames": ["<filename>", "<filename>"],
      "hero_roles": ["<role>", "<role>"],
      "gallery_order_filenames": ["<filename>", "<filename>", "..."],
      "featured_tile_filename": "<filename or null>",
      "credibility_banner_filename": "<filename or null>"
    },
    "nerve_consult_summary": {
      "strategies_returned_count": <int>,
      "champion_strategy_id": "<id from /api/read/strategies or null>",
      "champion_dimensions_applied": ["<dimension>", "..."],
      "brief_overrode_dimensions": ["<dimension>", "..."],
      "winning_features_available": <bool>,
      "winning_features_closed_count": <int>,
      "no_signal_reason": "<null on success, else 'helper_missing'|'http_<code>'|'no_champion'|'data_unavailable'>"
    }
  },
  "generated_at": "<same ISO 8601 UTC as the run.jsonl ts>"
}
```

### What goes in the metadata.photo_classifications map

For every file in `photos/`, record three things: the final role used in the demo, the role the brief assigned in `brand-analysis.json.photo_roles` (or `null` if absent), and a `drift` boolean that is true when they differ. Use exactly one of the enum roles (logo, storefront, interior, product_close, product_assortment, menu, press, lifestyle, unused).

The drift flag is the learning signal. It captures cases where the brief made a call and the build had to override it — and lets the AI layer learn "for vertical=barber, brief.product_close → demo.product_close survives 95% of the time, but brief.interior → demo.storefront overrides happen 40% of the time" — which tells us the brief's interior/storefront discrimination is unreliable for that vertical. Without recording `brief_role` and `drift`, only the final-state is queryable and the override signal is lost.

If the brief had no `photo_roles` map (pre-sidecar lead), set `brief_role` to `null` and `drift` to `false` for every photo — no override is being recorded, just a from-scratch classification.

### What goes in the metadata.layout_decisions map

`photo_roles` answers *what kind of photo* a file is; `photo_classifications.drift` answers *did the build override the brief*. Neither answers *where in the layout the photo ended up*. The five fields below capture the placement decisions so the warehouse can answer questions like "for vertical=barber, does product_close-as-hero close better than storefront-as-hero?" without parsing the rendered HTML.

- **`hero_photo_filenames`** — ordered list of every photo embedded in the hero section. Length 1 for a single-photo hero, length 2-4 for a stacked or collage hero. The first entry is the primary (most prominent) photo. Empty array if the hero uses CSS-only / placeholder graphics.

- **`hero_roles`** — parallel array to `hero_photo_filenames`, listing the role of each hero photo (e.g. `["product_close", "product_close", "product_close"]` for a three-cake hero stack; `["storefront"]` for a single full-bleed exterior hero). Lengths must match.

- **`gallery_order_filenames`** — every photo placed in the main gallery / portfolio section, in render order. The order matters: tile 1 is the visual anchor and the brief writer's most-important call. If no gallery section was built (sparse-photo-set leads), use an empty array.

- **`featured_tile_filename`** — if the gallery uses a grid-span pattern where one photo gets a 3x2 (or otherwise larger) feature tile, the filename of that anchor photo. `null` if the gallery is uniform tiles.

- **`credibility_banner_filename`** — the full-bleed storefront / credibility banner photo placed directly after the hero. `null` if the section was skipped (no storefront photo, or the brief's diagnosis didn't call for one).

Together these fields capture *the layout decisions the model made beyond role assignment*. The AI layer learns three things from them at scale:

1. Which `role` typically wins the hero slot for a given vertical (signal for the autumn Pi composer's defaults).
2. Whether multi-photo heroes (stacked, layered, collage) close better than single-photo heroes — answered by `length(hero_photo_filenames)` grouped by close outcome.
3. Whether the credibility-banner pattern measurably helps when a storefront photo is available — answered by `credibility_banner_filename IS NOT NULL` joined against close outcomes.

`metadata.layout_decisions` lives inside the JSONB `metadata` column, so adding fields here never needs a schema migration. If a section in the brief's blueprint was skipped entirely, the relevant field should still be present and set to `null` or `[]` rather than omitted — the analytics queries assume presence.

### What goes in the metadata.nerve_consult_summary

Filled from the NERVE consultation step earlier in the skill. Even when NERVE returns no signal, record *why*:
- `strategies_returned_count`: total entries returned (sum of champion + active + new), `0` if the helper failed
- `champion_strategy_id`: the `id` of the winning champion if one existed, else `null`
- `champion_dimensions_applied`: list of dimension names ("palette", "typography", "sections", ...) where the champion `parameters` shaped the build
- `brief_overrode_dimensions`: list of dimensions where the brief had a specific call that won over a champion suggestion
- `winning_features_available`: `true` if `/api/read/lead-profiles/winning-features` returned `data_available: true`
- `winning_features_closed_count`: the `closed_count` figure if available, else `0`
- `no_signal_reason`: one of `null` (success), `"helper_missing"`, `"http_<code>"`, `"no_champion"` (helper worked but vertical has no champion yet), `"data_unavailable"` (winning-features had no closed-pitch corpus)

Together these capture *which dimensions of the build are evidence-driven vs craft-driven on this particular run*. When F4 wraps the skill in the agent SDK, this metadata is what lets the agent grade its own bias decisions against subsequent close-rate outcomes.

Then post via the helper. The HTML payload is large so the helper streams the file rather than echoing it into shell argv:

```
~/.claude/scripts/nerve/post-ingest.sh /api/ingest/demo-artefact ~/Desktop/salespatch-demos/[slug]/outputs/demo-artefact.json >/dev/null
```

If the helper returns non-2xx (typically 400 if the html exceeded 4MB, 401 if the secret rotated, 503 if the secret is missing), surface the failure once in the chat output (eg "NERVE demo-artefact post returned HTTP 400 — file is on disk; check size and re-run"). Do not retry inline.

Then append one line to run.jsonl:

```
{"ts":"<same ISO>","stage":"nerve-ingest","slug":"<slug>","artefact_id":"<the artefact_id>","posted":["demo-artefact"]}
```

The id derivation rule mirrors the spec-site-brief skill: use the same UTC ISO timestamp (without colons or fractional seconds) as the build-demo run. Example: `noose-and-needle-demo-2026-05-10T193045Z`.

## Auto-QA pass (A5 producer — runs after the artefact ingest)

After the demo artefact has been posted, run the heuristic QA script over `outputs/demo.html` so the warehouse can answer "do high-QA demos close better?". Today's `qa_results` table has been wired since A5 but had no producer; this is the producer for the manual-skill path. The autumn Pi siteQaAgent will eventually replace it with a heavier check (headless render, real WCAG contrast, Lighthouse).

Skip the step entirely if `~/Desktop/klaude-repo/apps/nerve/scripts/qa-demo.ts` is missing or if the helper at `~/.claude/scripts/nerve/post-ingest.sh` is missing (both degrade cleanly — the artefact is already on disk and posted).

Run the QA script with the same `<artefact_id>` you committed above and pipe stdout into the helper:

```bash
ARTEFACT_ID="<slug>-demo-<iso_no_colons>"      # same as the artefact ingest above
RAN_AT="<same ISO 8601 UTC>"                   # same as run.jsonl ts

npx tsx ~/Desktop/klaude-repo/apps/nerve/scripts/qa-demo.ts \
  ~/Desktop/salespatch-demos/[slug]/outputs/demo.html \
  "$ARTEFACT_ID" \
  "<slug>" \
  "$RAN_AT" \
  | tee ~/Desktop/salespatch-demos/[slug]/outputs/qa-result.json \
  | ~/.claude/scripts/nerve/post-ingest.sh /api/ingest/qa-result - >/dev/null
```

The script writes its JSON payload to stdout (captured to `outputs/qa-result.json` for audit) and a one-line summary to stderr (e.g. `QA: 86/100 PASS (html=25/25 a11y=20/25 photos=25/25 copy=16/25, 3 issues)`). Capture the stderr line and surface it in the chat output below.

If the helper returns non-2xx, surface the failure once (`NERVE qa-result post returned HTTP <code>`). Do not retry inline.

Then append one final line to run.jsonl:

```
{"ts":"<same ISO>","stage":"qa","slug":"<slug>","qa_id":"<artefact_id>-qa-<iso_no_colons>","score":<int>,"passed":<bool>,"issues":<int>,"posted":["qa-result"]}
```

## Visual-QA pass (three-layer vision review — runs after the static QA)

Static QA covers technical hygiene but cannot see the rendered page. The visual-QA pass adds three layers the static check is blind to:

- **Layer 1 — Bugs**: readability of text on photos, overlap/clipping, tap-target sizes at 375px, broken images, above-the-fold CTA presence. Catches text-over-image contrast failures the regex pass cannot see. Hard-gates the build verdict via `has_critical`.
- **Layer 2 — Brand fidelity**: grades the rendered page against the brand decode the brief committed to (palette, typography, logo placement, positioning, brand signatures) on a 1-5 scale per dimension. Surfaces drift between what the brief specified and what the build executed.
- **Layer 3 — Owner reaction**: role-plays the UK shop-owner buyer seeing the demo cold on the rep's phone. Produces honest recognition, first reaction, pushbacks, would-buy verdict, and a pass/fail on the brief's `test_of_success`.

The single source of truth for prompts + output schema is `apps/nerve/scripts/qa-visual-prompts.ts` (TypeScript constants and TS interfaces) with a human-readable mirror at `apps/nerve/scripts/qa-visual-prompts.md`. Both this manual flow AND the dormant SDK runner (`apps/nerve/scripts/qa-visual.ts`, activates when `ANTHROPIC_API_KEY` is set) consume from those files and produce the **identical** `VisualQaResult` JSON shape. NERVE cannot tell which producer ran any given row — by design.

### Step 1 — render

Guard first — skip the entire visual-QA stage cleanly if the renderer script is missing (e.g. running the skill from a branch that hasn't merged the visual-QA infrastructure yet). The artefact and static QA are already on disk and posted, so degrading cleanly is acceptable:

```bash
RENDER_SCRIPT="$HOME/Desktop/klaude-repo/apps/nerve/scripts/qa-visual-render.ts"
if [ ! -f "$RENDER_SCRIPT" ]; then
  echo "Visual-QA: skipped (qa-visual-render.ts not found at $RENDER_SCRIPT)"
  # Surface this in the chat output as the Visual-QA line; continue to the
  # final Output Format step. Do NOT block the build.
  exit 0
fi

npx tsx "$RENDER_SCRIPT" ~/Desktop/salespatch-demos/[slug]/outputs/demo.html
```

Writes four screenshots (mobile + desktop, hero + full) plus `outputs/.qa-visual/render-result.json` with timings and byte sizes. Mobile capture (375×812) is the rep's iPhone reference; desktop capture (1280×800) closes the laptop-pivot blind spot for when the owner asks "can I see it on my computer?" after the pitch lands.

The wait strategy is `networkidle` + `document.fonts.ready` + 200ms paint-settle grace (deterministic) rather than a fixed timeout — Google Fonts and any post-fonts layout shift have settled before the screenshot fires.

### Step 1.5 — run the static-source dynamic-content scan

Before reading the PNGs, run the dynamic-content scan against the demo's HTML. This is the ground-truth input Layer 1 uses to grade live-content honesty (whether a "Today · Wed 7 May" / "OPEN UNTIL 5PM" / "BACK AT 8:30" string is actually wired to JS date logic or hardcoded). The scan is deterministic, ~50ms, no API spend.

```bash
DYN_SCRIPT="$HOME/Desktop/klaude-repo/apps/nerve/scripts/qa-visual-dynamic.ts"
if [ -f "$DYN_SCRIPT" ]; then
  npx tsx "$DYN_SCRIPT" ~/Desktop/salespatch-demos/[slug]/outputs/demo.html
fi
```

Writes `outputs/.qa-visual/dynamic-scan.json` matching the `DynamicScanSummary` shape. Read it in Step 3 and inject the candidates list + summary into the Layer 1 user message per `buildBugsUserMessage`.

If the script is missing (running from a branch that hasn't merged PR-B), continue without the dynamic-scan input — Layer 1 falls back to pixel-only judgment for live-content honesty (less accurate but doesn't block the flow).

### Step 1.6 — fetch cohort baselines (PR-G)

After the dynamic scan, fetch the vertical's cohort baseline from NERVE. Read-only, no HMAC. Use the brief's `vertical` (from `outputs/brief.json`):

```bash
VERT=$(jq -r '.vertical // empty' ~/Desktop/salespatch-demos/[slug]/outputs/brief.json)
if [ -n "$VERT" ]; then
  ~/.claude/scripts/nerve/get-ingest.sh "/api/read/qa-visual/baselines?vertical=$VERT" \
    > ~/Desktop/salespatch-demos/[slug]/outputs/.qa-visual/baselines.json
fi
```

The response is a `BaselineSummary` (see `qa-visual-prompts.md` § Cohort baselines). Fields: `total_n`, `baselines_available`, `medians`, `cohort_rates`. When `baselines_available: false` (n < 10), still proceed — composer attaches the empty-shape `baseline_comparison` so downstream queries distinguish "no cohort yet" from "pre-PR-G producer".

Network failure / 5xx / missing helper → continue without baselines. Composer treats null fetch as "no cohort yet" and emits the same empty-shape comparison.

### Step 1.7 — (opt-in) photo quality grading (PR-H)

Gated default-off. Per-photo grading is the most expensive layer to run (~£0.075 per demo at 15 photos vs ~£0.02 baseline). Skip this step unless the operator explicitly invokes with photo grading enabled. When enabled:

1. Extract every `<img src="data:image/...;base64,...">` from the demo HTML. Capture the alt text. Cap at 15 photos.
2. Read each embedded photo. (The base64 in the HTML is what the vision model needs.)
3. Apply `PHOTO_QUALITY_SYSTEM_PROMPT` (from `qa-visual-prompts.md`) per `buildPhotoQualityUserMessage({businessName, photos})` to grade each photo on focus/composition/lighting/role_fit (1-5 each) + a one-line note.
4. Compose `PhotoQualityResult`: `photos[]` (per-grade), `mean_overall` (arithmetic mean across photos), `weakest_photo_index` (lowest overall), `notes` (set-wide verdict).
5. Attach to `qa-visual-result.json` as the `photo_quality` field. **State semantics:**
   - Field absent → producer didn't request it (skipped step entirely)
   - Field present + null → producer requested it AND the vision call failed
   - Field present + populated → success

Cross-field invariants enforced by validator: each photo's `overall` MUST equal the mean of its four sub-grades to 1 d.p.; `weakest_photo_index` MUST point at an existing photo (or null if `photos: []`).

### Step 1.8 — (opt-in) competitor comparison (PR-J)

Activates when `outputs/competitors.json` exists (the spec-site-brief skill captures competitor URLs in Phase 1 verify). When the manifest is present and an API key is available, run the competitor comparison script:

```bash
COMP_SCRIPT="$HOME/Desktop/klaude-repo/apps/nerve/scripts/qa-visual-competitors.ts"
COMP_MANIFEST="$HOME/Desktop/salespatch-demos/[slug]/outputs/competitors.json"
if [ -f "$COMP_SCRIPT" ] && [ -f "$COMP_MANIFEST" ]; then
  npx tsx "$COMP_SCRIPT" ~/Desktop/salespatch-demos/[slug]/outputs
fi
```

The script renders each competitor URL at 375×812 (graceful per-URL failure for timeouts / login walls / 4xx — those entries land as `rendered: false` but the comparison still proceeds with the rendered subset). It sends N+1 screenshots (this demo + competitors) to a comparative-trust vision call and writes `outputs/qa-visual-competitor-comparison.json` PLUS patches `outputs/qa-visual-result.json` with the result attached as `competitor_comparison`.

When the script ran, surface the `takeaway` line in the chat output (it's door-ready prose the rep can quote). When this demo ranked #1, lean on it in the pitch; when it ranked last, the takeaway tells the rep that and they can prepare a brief-led pitch instead of a comparison-led one.

Skip silently when:
- `competitors.json` doesn't exist (the brief didn't capture competitors)
- `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` isn't set (no vision available)
- Every competitor URL fails to render (the comparison would be empty)

### Step 2 — Read PNGs

Use the Read tool on `hero.png` and `full.png`. Look at them. The hero crop is the high-risk surface (above-the-fold readability + first-impression brand fidelity); the full-page scroll covers the rest.

If `outputs/.qa-visual/sections/` exists (PR-C onwards), Read each section PNG too — they're inputs for Layer 6 (section grading).

### Step 3 — apply the six layers

**Read `apps/nerve/scripts/qa-visual-prompts.md` first.** It documents the system prompts, output schemas, and rubrics. The TS constants in `qa-visual-prompts.ts` are the executable form (what the SDK runner will use); the `.md` is the readable form for this manual flow.

For each layer, apply the documented prompt to the screenshots + the documented context inputs, and produce the documented output shape. Stay strict — the schemas are not suggestions, they are the contract NERVE ingests against. Severity rubrics and grading rubrics from the .md must be applied consistently.

Layer-specific inputs to load before applying each prompt:

- **Layer 1** (Bugs) — read `outputs/.qa-visual/dynamic-scan.json` (from Step 1.5) and inject as the `dynamicScan` field per the `buildBugsUserMessage` signature in `qa-visual-prompts.ts`. The Layer 1 prompt's category #7 (live-content honesty) and category #5/#6 (status-as-CTA / CTA hierarchy) rely on this input. Without it, fall back to pixel-only judgment.
- **Layer 2** (Brand fidelity) — read `outputs/brand-analysis.json`. Inject the palette, typography, logo description, positioning reference, and asset_notes per the `buildBrandFidelityUserMessage` signature.
- **Layer 3** (Owner reaction) — read `outputs/brief.json`. Inject business_name, business_type, address, owner_name (if known), diagnosis, and test_of_success per the `buildOwnerReactionUserMessage` signature.
- **Layer 4** (Voice consistency, PR-C) — read `outputs/brand-analysis.json` for `voice_quotes[]` (fall back to `outputs/brief.json` if absent). Inject as the `voiceQuotes` field per `buildVoiceConsistencyUserMessage`. The prompt grades whether the rendered demo preserves the brief's verbatim language and is free of marketing-mush drift.
- **Layer 5** (Customer reaction, PR-C) — read `outputs/brief.json` for business_name, business_type, address, vertical. Inject per `buildCustomerReactionUserMessage`. Role-plays a UK consumer who landed from a Google search — different signal from Layer 3 (which role-plays the owner). The customer reacts to "should I trust this enough to act?" not "is this me?".
- **Layer 6** (Section grading, PR-C) — load the per-section PNGs from `outputs/.qa-visual/sections/` plus the section label list from `outputs/.qa-visual/render-result.json.sections[]`. Inject the labels per `buildSectionGradingUserMessage`. Send the section PNGs in DOM order. If no sections were detected, emit `section_grades: []` and skip the vision call.

Honest, not generous. The warehouse needs honest signal; flattering a weak demo helps nobody.

### Step 4 — compose and write the canonical result

Compose all three layer outputs into the canonical `VisualQaResult` shape (defined in `qa-visual-prompts.ts`):

```json
{
  "qa_visual_id": "<slug>-qa-visual-<iso_no_colons>",
  "artefact_id": "<slug>-demo-<iso_no_colons-from-demo-artefact>",
  "lead_id": "<slug>",
  "demo_path": "/abs/path/to/demo.html",
  "viewport": { "width": 375, "height": 812 },
  "ran_at": "<ISO 8601 UTC>",
  "producer": "manual_skill",
  "model": "claude-in-session",
  "bugs": [ { "severity": "...", "location": "...", "finding": "..." } ],
  "has_critical": <bool>,
  "bug_count": <int>,
  "brand_fidelity": {
    "palette": { "grade": <1-5>, "drift_note": "..." },
    "typography": { ... },
    "logo_placement": { ... },
    "positioning": { ... },
    "brand_signature": { ... },
    "overall_grade": <number, 1 d.p.>,
    "notes": "..."
  },
  "owner_reaction": {
    "recognition": "high|partial|low",
    "first_reaction": "...",
    "pushbacks": ["..."],
    "would_buy": "yes|maybe|no",
    "buy_reason": "...",
    "test_of_success_passes": <bool>,
    "test_of_success_note": "..."
  },
  "voice_consistency": {
    "quotes_preserved": [
      { "quote": "...", "rendered": true, "near_verbatim": true, "location_if_rendered": "hero h1" }
    ],
    "voice_drift_phrases": [
      { "rendered": "...", "why_off": "..." }
    ],
    "overall_grade": <1-5>,
    "notes": "..."
  },
  "customer_reaction": {
    "first_glance": "...",
    "trust_at_glance": "high|medium|low",
    "would_act": "yes|maybe|no",
    "first_question": "...",
    "bounce_risks": ["..."],
    "notes": "..."
  },
  "section_grades": [
    { "index": 0, "label": "hero", "grade": <1-5>, "note": "..." }
  ],
  "baseline_comparison": {
    "vertical": "<brief.vertical or null>",
    "baseline_n": <total cohort size from baselines.json>,
    "baselines_available": <true if n>=10 else false>,
    "dimensions": [
      { "name": "brand_fidelity",      "this_grade": <this demo's overall_grade or null>,           "vertical_median": <from baselines.medians>, "below_baseline": <true if this < median - 0.5> },
      { "name": "voice_consistency",   "this_grade": <this demo's overall_grade or null>,           "vertical_median": <...>,                    "below_baseline": <...> },
      { "name": "section_grades_mean", "this_grade": <mean of this demo's section_grades or null>, "vertical_median": <...>,                    "below_baseline": <...> }
    ],
    "cohort_rates": {
      "has_critical_pct":  <...>,
      "would_buy_yes_pct": <...>,
      "would_act_yes_pct": <...>,
      "trust_high_pct":    <...>,
      "test_passes_pct":   <...>
    }
  },
  "photo_quality": null | {
    "photos": [
      {
        "index": <0..N-1>,
        "alt": "<image alt or null>",
        "focus_grade": <1-5>,
        "composition_grade": <1-5>,
        "lighting_grade": <1-5>,
        "role_fit_grade": <1-5>,
        "overall": <mean to 1 d.p.>,
        "note": "<one line>"
      }
    ],
    "mean_overall": <mean across photos>,
    "weakest_photo_index": <int or null>,
    "notes": "<one-line set-wide verdict>"
  },
  "competitor_comparison": null | {
    "entries": [
      {
        "name": "<this demo or competitor name>",
        "url": "<URL or null>",
        "is_this_demo": <true|false>,
        "rendered": <true|false>,
        "render_failure_reason": "<reason or null>",
        "trust_at_glance": <1-5 or null>,
        "rank": <1..N or null>,
        "why": "<one line>"
      }
    ],
    "this_demo_rank": <N or null>,
    "ranked_total": <int>,
    "takeaway": "<one-line door-ready sentence>",
    "notes": "<one-line cohort note>"
  },
  "notes": "optional one-line global summary"
}
```

**Baseline-comparison composition rules (PR-G):**
- If `baselines.json` was fetched and `baselines_available: true` — emit all three `dimensions`. `this_grade` is null when the corresponding layer failed in this demo (Layer 2/4/6 null). `below_baseline` is null when `this_grade` is null. `cohort_rates` is the response's `cohort_rates` verbatim.
- If `baselines.json` was fetched and `baselines_available: false` (n < 10) — emit `baselines_available: false`, `dimensions: []`, `cohort_rates: null`.
- If the fetch failed / skipped entirely — same as above but with `baseline_n: 0`.
- Drift threshold is 0.5 (single-grade integer gap). Below that is vision-call noise.

Write to `outputs/qa-visual-result.json`.

**Validate before write.** The shape above is also enforced at runtime by the Zod-backed `validateVisualQaResult()` exported from `apps/nerve/scripts/qa-visual-prompts.ts`. Cross-field invariants — `bug_count === bugs.length`, `has_critical` iff any bug has severity=critical (when bugs is non-null), and the PR-D rule that `failed_layers[]` must match the null layer fields exactly — are easy to get wrong when composing the JSON by hand; the validator catches them with named-field errors. If the validator returns `{valid: false}`, fix the offending field and re-compose; do NOT write a known-invalid file (it'll get rejected at the NERVE ingest endpoint anyway and contaminate run.jsonl in the meantime).

**PR-D — partial results.** Every gradable layer field (`bugs`, `brand_fidelity`, `owner_reaction`, `voice_consistency`, `customer_reaction`, `section_grades`) is nullable. If a layer can't be produced honestly (e.g. brief is missing `voice_quotes[]` so Layer 4 has nothing to grade), set that field to `null` AND append the layer name to a `failed_layers: [...]` top-level array. Both pieces are required for partial results — the validator refuses to write a result that nulls a field without listing it (silent failure) or lists a layer without nulling its field (sentinel data labelled as good). Inventing a placeholder grade to pad a field is forbidden — the warehouse needs honest signal.

### Step 5 — POST to NERVE

```
~/.claude/scripts/nerve/post-ingest.sh /api/ingest/qa-visual-result ~/Desktop/salespatch-demos/[slug]/outputs/qa-visual-result.json >/dev/null
```

Expect HTTP 200 with `{"qa_visual_id", "inserted": true|false, "id", "has_critical", "failed_layers"}`. `inserted=false` is fine — it means this `qa_visual_id` already lived in the warehouse (replay-safe by design). If the endpoint returns a non-2xx (401 = HMAC secret rotated; 400 = schema violation the producer-side validator should have caught; 503 = secret missing), surface the response body once and continue. Local file is still the source of truth and the backfill script (`apps/nerve/scripts/qa-visual-backfill.ts`) can re-post later.

### Step 6 — log

Append one line to run.jsonl:

```
{"ts":"<same ISO>","stage":"qa-visual","slug":"<slug>","qa_visual_id":"<the qa_visual_id>","bug_count":<int>,"has_critical":<bool>,"brand_overall":<number>,"would_buy":"<yes|maybe|no>","test_pass":<bool>,"posted":["qa-visual-result"]}
```

### Hard-gate behaviour

If `has_critical` is `true`, the overall build verdict flips to FAIL even if the static QA passed. **Run the autofix loop (next section) before surfacing the critical finding**; if any critical bugs remain unfixable after 3 iterations, the Output Format must lead with the remaining critical finding(s) and the swap-list shrinks to one item: "fix the critical visual-QA finding before pitching this demo".

The `would_buy: "no"` verdict does NOT hard-gate — it is qualitative signal for the warehouse, not a blocker. The rep can still walk in with a "no" demo; the warehouse will learn from the eventual outcome.

### Autofix loop (PR-F — runs only if has_critical)

When `has_critical` is `true`, attempt to auto-correct the demo before giving up. Closed-loop: apply known-good HTML remedies → re-render → re-run visual QA → repeat until no critical bugs remain or hit the iteration cap.

Skip the entire loop if `~/Desktop/klaude-repo/apps/nerve/scripts/qa-visual-autofix.ts` is missing.

```bash
AUTOFIX="$HOME/Desktop/klaude-repo/apps/nerve/scripts/qa-visual-autofix.ts"
[ -f "$AUTOFIX" ] || { echo "Visual-QA-Autofix: skipped (script missing)"; }

ITER=0
MAX_ITER=3
while [ -f "$AUTOFIX" ] && [ $ITER -lt $MAX_ITER ]; do
  HAS_CRIT=$(jq -r '.has_critical // false' \
    "$HOME/Desktop/salespatch-demos/[slug]/outputs/qa-visual-result.json")
  [ "$HAS_CRIT" = "false" ] && break

  # Apply remedies (writes updated demo.html in place)
  npx tsx "$AUTOFIX" "$HOME/Desktop/salespatch-demos/[slug]/outputs/demo.html"

  # Re-render the now-updated demo
  npx tsx ~/Desktop/klaude-repo/apps/nerve/scripts/qa-visual-render.ts \
    "$HOME/Desktop/salespatch-demos/[slug]/outputs/demo.html"

  # Re-run static-source dynamic-content scan
  if [ -f ~/Desktop/klaude-repo/apps/nerve/scripts/qa-visual-dynamic.ts ]; then
    npx tsx ~/Desktop/klaude-repo/apps/nerve/scripts/qa-visual-dynamic.ts \
      "$HOME/Desktop/salespatch-demos/[slug]/outputs/demo.html"
  fi

  # Re-run visual QA — Read both PNGs again + reapply the six layers
  # per Step 3 above + compose + validate + write qa-visual-result.json.
  # In-session Claude does this manually; the SDK runner reruns qa-visual.ts.

  # Log this iteration
  ITER_NUM=$((ITER + 1))
  printf '{"ts":"%s","stage":"qa-visual-autofix","slug":"<slug>","iteration":%s,"fixes_applied":%s,"unfixable":%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ITER_NUM" "<int>" "<int>" \
    >> "$HOME/Desktop/salespatch-demos/[slug]/logs/run.jsonl"

  ITER=$((ITER + 1))
done
```

The autofix script (`qa-visual-autofix.ts`) is a single-pass HTML transformation — it reads the most recent `qa-visual-result.json`, walks every critical bug, looks up a matching remedy in `qa-visual-remedies.ts`, and writes the updated `demo.html` back. The skill text owns the iteration.

**Currently registered remedies** (extend as new bug patterns surface):
- `text_over_image_low_contrast` → bumps the hero linear-gradient's top-stop opacity to 0.45 (most common Layer 1 failure)
- `live_content_hardcoded` → strips "Today · <Day> <N> <Month>" and "OPEN TODAY · UNTIL <H>PM" framings, replaces with "This week" / "Check the schedule" (PR-B class)
- `status_as_cta`, `missing_above_fold_cta`, `redundant_cta_pair` → currently unfixable. Inserting / removing CTAs requires brief-aware context that's out of scope for a pure HTML transform. The autofix surfaces these as unfixable so the human decides.

**Iteration cap:** 3. If `has_critical` is still true after 3 iterations, the remaining critical bugs are either unfixable by the registered remedies OR a remedy is firing but vision keeps finding new bugs. Either way, exit the loop and surface the remaining bugs in the Output Format.

**Idempotency:** every remedy in the library is a no-op when its target pattern is already in the fixed state. Re-running autofix on its own output is safe.

**Final write:** the autofixed demo.html overwrites the original. The pre-autofix version is gone — if you need to inspect what changed, git diff against the last commit before /build-demo ran. (The `demo-artefact.json` posted to NERVE in the earlier ingest step still references the pre-autofix HTML; a future PR could re-post a post-autofix artefact, but for now the warehouse view of the artefact is the as-built version.)

**Capture iterations into qa-visual-result.metadata.** Each iteration the autofix runs, the script's stdout is an `AutofixSummary` JSON shape (`{ bugs_attempted, fixes_applied, unfixable_bugs }`). Capture it in the NEXT visual-QA result that gets POSTed:

```jsonc
{
  // ...other QaVisualResult fields...
  "metadata": {
    "autofix_history": [
      {
        "iteration": 1,
        "ran_at": "<ISO timestamp>",
        "summary": { /* AutofixSummary JSON */ }
      },
      // iteration 2, 3, ...
    ]
  }
}
```

The array accumulates across iterations: the QA result POSTed after iteration 1 has one entry; after iteration 2, two entries; etc. The `Embedding` of the QaVisualResult (PR 2) doesn't include this array — it's structurally queryable via `/api/read/lead-bundle` and the leads UI, so embedding the prose form would be redundant. The value is in giving the eventual closed-pitch-outcome model a clean "which remedies fired, for which bugs, on which leads" signal.

When the autofix iteration loop is skipped entirely (no critical bugs in iteration 0), the field stays absent — `metadata.autofix_history` is only present when at least one autofix ran.

## Output format

After the build, output exactly this, in this order:

1. `✓ Built ~/Desktop/salespatch-demos/[slug]/outputs/demo.html — [filesize]KB ([photo_count] photos embedded)`
2. One line summarising the NERVE consultation: `NERVE: <champion summary or "no signal">`. If a champion biased the build, name the dimensions. If no champion existed, say so. If the helper was missing or failed, say "NERVE: skipped (<reason>)".
3. One line surfacing the auto-QA result: the stderr summary line from qa-demo.ts verbatim, e.g. `QA: 86/100 PASS (html=25/25 a11y=20/25 photos=25/25 copy=16/25, 3 issues)`. If QA was skipped, say `QA: skipped (<reason>)`.
4. One line surfacing the visual-QA result, format: `Visual-QA: bugs=<N> (<c>c/<w>w/<i>i)[ HAS_CRITICAL] brand=<X.Y>/5 voice=<X>/5 owner=<YES|MAYBE|NO> customer=<YES|MAYBE|NO> trust=<high|medium|low> sections=<X.Y>/5 (n=<N>) test_pass=<true|false> baselines=<on_par|below|n/a>(n=<N>)[<below dims>][ photos=<X.Y>/5(n=<N>,weakest=<i>)][ vs_competitors=#<rank>/<total>]`. The `photos=` and `vs_competitors=` segments only appear when those opt-in steps ran. Example with both: `... photos=3.8/5(n=15,weakest=6) vs_competitors=#2/4`. If visual-QA was skipped, say `Visual-QA: skipped (<reason>)`. If `HAS_CRITICAL`, the next two lines list the critical findings verbatim from the `bugs` array with the suggested fix.
   When `competitor_comparison` is present, ALSO surface the `takeaway` field on its own line — door-ready prose the rep can quote.
5. Two sentences naming what you committed to (aesthetic direction plus the one diagnosis-driven feature that makes this demo's case).
6. Three things the owner will need to swap before going live (live booking integration, real phone number, anything the photos couldn't supply). If `HAS_CRITICAL` from visual-QA, this list shrinks to one item: "fix the critical visual-QA finding before pitching".
7. One pitch line the rep can use at the door, drawn from the diagnosis. Under 25 words.
8. One line: `Run /lead-json to generate the admin lead-card payload.`

No preamble. No "I hope this helps." No summary of the brief. They already wrote it.

Build it.
