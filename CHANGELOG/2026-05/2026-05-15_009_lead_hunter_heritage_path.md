# lead-hunter — alternative Path B for heritage owner-operators

## What changed

- `~/.claude/commands/lead-hunter.md` (user-level, not in repo) —
  restructured the Hard Criteria section into:
  - **Universal criteria** (1, 2, 5, 6) — pipeline fit, no working
    site, owner-led, Aberdeen geography
  - **Path A — IG-led indie** (the existing bias surfaced as one of
    two paths). 5,000+ IG OR 2,000+ recent posting; 4.5★ with 80+
    reviews (or 30+ for under-12-months). Pitch shape: "your audience
    is locked inside Instagram."
  - **Path B — Heritage owner-operator** (new). 5+ years on a real
    high-street shopfront; owner-present signal via Companies House
    director match, press feature, or named on signage. Pitch shape:
    "your customers love you but the next generation Googles
    everything."
  - Phase 1 Discovery gains a Path B tells section with explicit
    search queries (`"family run" Aberdeen <trade>`, `site:yell.com`,
    `"<trade> Aberdeen since"`) and surface confirmers (landline,
    painted signage, Companies House incorporation date pre-2015).
  - Phase 2 Verification gains a "declare the path" step and an
    "active operating + no transition" step (catches the kind of
    disqualifier Candy's Dream Cake just surfaced — owners handing
    over the business).
  - Phase 3 Output's per-lead block gains a `Path:` field and a
    `Years trading:` field. Field requirements differ by path
    (Google numbers REQUIRED for A, nice-to-have for B; IG REQUIRED
    for A, minimal-or-none fine for B; named owner REQUIRED for B,
    nice-to-have for A).

## Why

The previous criteria were a filter for one shape of business: a modern
indie with 5,000+ Instagram followers and 80+ Google reviews. That
implicitly rejected an entire pitchable category — high-street
owner-operators who've been trading for 20+ years on Holburn Street and
never bothered with a website because the phone has always rung.

Two hunts in a row hit the limit of the IG-led-indie pool:
- Hunt 1 (2026-05-15 morning) — produced Blackbird Bakery and nothing
  else strong enough.
- Hunt 2 (2026-05-15 evening) — produced Candy's Dream Cake (which then
  failed a transition check) and disqualified candidates with sites
  (Sandie Ritchie, StudioBe, Mara, Monty's, SugarBird, Red Robin Records,
  Cookie Cult, Bakers + Baristas, ceramics studio, jewellers).

The user-side observation (verbatim): "the searching is to bias indie
small places, theres so many industries we could walk into, we should be
focusing on business where the owner maylikley be in or even be in at
all". That's a criteria-design point, not a pick-better-leads point —
which is why this PR patches the criteria rather than running a third
hunt.

The transition check (Phase 2 step 5) is a secondary win surfaced by the
same chain run: Blackbird's chain test caught Candy's transition in
Phase 1.5 IG scrape, but only because PR #3 bumped resultsLimit from 25
to 50. Catching it earlier in `/lead-hunter` saves wasted brief-writing
on a business that won't be there in two weeks.

## Stack
User-level Claude Code skill. No NERVE changes. No producer scripts
touched.

## Integrations
None new. The path declaration on lead-profile.json is implicit (Path A
leads will have IG/Google fields populated; Path B leads will have
years_trading + owner_name populated) — no schema change needed.

## How to verify

1. Run `/lead-hunter` with no argument. Expected: skill output should
   include at least one Path B candidate alongside the Path A
   candidates, OR explicitly note that the search returned no Path B
   candidates with a one-line rationale.
2. Run `/lead-hunter "butcher"` or `/lead-hunter "framing"`. Expected:
   Path B queries (`"family run"`, `site:yell.com`, `Press and Journal`)
   should fire and the shortlist should contain Path B candidates.
3. On any candidate that's been trading 5+ years, confirm the `Path:`
   field declares B and the `Years trading:` field is populated.
4. On any candidate where IG announces a transition ("handing over", "new
   owners"), confirm the Phase 2 step 5 check catches it and the
   candidate is PASSed rather than shortlisted.

## Known issues

- The split is binary today (A or B). Real businesses sometimes sit on
  the line — a 25-year-trading butcher with 8,000 IG followers (very
  rare in Aberdeen but possible). The skill instructs "declare Path A
  in that case because IG is the stronger lever"; the alternative would
  be a `mixed` path with both pitch shapes, but adding a third path
  before we have any Path B leads is premature.
- The 5-year trading threshold for Path B is judgement. Aberdeen has
  shops that have been there 3 years and feel heritage; others have been
  there 50 years and feel modern. The skill leans on the surface
  signals (landline, painted signage, Companies House date) rather than
  treating the 5-year line as absolute. Worth revisiting after a few
  Path B candidates ship.
- Path B brief writing + demo design will likely need adjustments
  downstream — the existing brand-decode aesthetics in
  `/spec-site-brief` Phase 2 are biased toward modern positioning
  references (Aimé Leon Dore, Margot Henderson). Heritage positioning
  references (Old British corner-shop, William Morris-era, traditional
  butcher's signage) exist in the skill but haven't been exercised.
  First Path B lead through the chain will surface what needs adjusting
  in `/spec-site-brief` and `/build-demo`.
