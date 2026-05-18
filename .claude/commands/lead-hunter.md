---
description: Find 2-3 new spec-site prospects in Aberdeen. Scans existing salespatch-demos folders to exclude what's already pitched, then web-searches for fresh leads matching the £350 single-file HTML pipeline. Outputs a ranked shortlist with verdict, evidence, and pitch angle. Run BEFORE /new-lead.
argument-hint: (optional) industry hint or neighbourhood, e.g. "barbers" or "Rosemount"
---

# Lead Hunter — Find new spec site prospects in Aberdeen

Your job is to find the user 2-3 new local businesses worth pitching a £350 spec website to. You have web search and access to the filesystem. Use both. The output is a ranked shortlist with verdict, evidence, and a one-line pitch angle for each.

If an argument was passed, treat it as a soft preference (an industry to favour, a neighbourhood to start in) — not a hard filter.

---

## Phase 0 — Exclusion scan (always run first, before any web search)

The user already has demos and research briefs for some businesses. Don't surface them again. Build the exclusion list from two sources before doing anything else.

### 0a — Local folder scan

1. List the contents of `~/Desktop/salespatch-demos/`. Each top-level folder is a slug for a lead already in the pipeline.
2. For each slug folder, also peek at `outputs/lead.json` and `outputs/brief.md` if the slug is ambiguous, to extract the canonical business name.
3. Slug rule: `bandit-bakery` → `Bandit Bakery`, `marios-deli-cafe` → `Mario's Deli & Café`. Open the JSON / MD if the slug doesn't decode cleanly.

### 0b — NERVE canonical identity consult (F1)

The local folder only knows about leads scaffolded on this machine. The NERVE warehouse holds the cross-machine pipeline state. Before recommending any candidate later, look it up against the canonical identity table.

For every promising candidate that survives discovery, run:

```bash
NAME_ENC=$(python3 -c "from urllib.parse import quote; print(quote('<Business Name>'))")
POSTCODE_ENC=$(python3 -c "from urllib.parse import quote; print(quote('<Postcode>'))")
~/.claude/scripts/nerve/get-ingest.sh /api/read/business-identity/lookup "name=$NAME_ENC&postcode=$POSTCODE_ENC"
```

If the JSON response has `"found": true`, treat it as if the business were already in `~/Desktop/salespatch-demos/`. The dedup is on normalised name + postcode, so "Noose & Needle" matches "noose-and-needle" and "The Bandit Bakery" matches "Bandit Bakery" — variations don't get past the filter.

If the response is `"found": false`, the candidate is fresh. Proceed.

If the helper fails (NERVE down, secret missing), fall back to the local folder scan alone and note the degraded check in the output.

### 0c — Print exclusion list

Combine both sources and print the exclusion list back before searching, in the form:

```
EXCLUDED (already pitched or in pipeline):
- Bandit Bakery (local: ~/Desktop/salespatch-demos/bandit-bakery/ · NERVE: bandit-bakery)
- GROUNDED (NERVE only: grounded)
- …
```

Treat this as a hard filter. Discard matches before they reach the shortlist.

---

## Phase 0.5 — NERVE vertical signal (free, optional)

Before any web search, pull what NERVE knows about each target vertical's close
performance. Skip cleanly if the helper or endpoints are unavailable — the rest
of the hunt still works.

For each of these verticals, run two queries:

```bash
for V in hospitality grooming health creative retail; do
  echo "--- $V ---"
  ~/.claude/scripts/nerve/get-ingest.sh /api/read/strategies "vertical=$V" 2>/dev/null
  ~/.claude/scripts/nerve/get-ingest.sh /api/read/lead-profiles/winning-features "vertical=$V" 2>/dev/null
done
```

Parse responses for each vertical:

- `strategies` — note any `status="champion"` entry. Champion exists means we have a design that closed; that's a strong signal the vertical is sellable.
- `winning-features` — if `data_available=true`, note `closed_count` and the median feature values. `closed_count >= 3` is meaningful signal; under 3 means insufficient data.

**How to apply:**

- Verticals with a champion strategy + `closed_count >= 3` → **prioritize** in this hunt. These are proven targets.
- Verticals with `closed_count = 0` after multiple pitches → **deprioritize unless the user explicitly asked for them**. We've tried, they don't close.
- Verticals with no NERVE data yet → neutral, treat normally.

Surface what you pulled in one short paragraph at the top of the hunt output, e.g.:

> NERVE signal: champion strategy exists for `grooming` (heritage_green palette, n=3 close rate 100%). `hospitality` has 8 leads profiled, 0 closed — deprioritizing unless you call for cafés specifically. No data yet for `creative` or `health`.

This biases discovery; it does NOT replace the hard criteria. A `grooming` lead still needs to meet all six.

---

## The pipeline fit test (this defines what we can and can't sell)

The current build pipeline ships single-file HTML demos with inline, fakeable interactions. Every lead must be a business where the website job reduces to ONE OR MORE of these features:

- **MENU / DAILY DROP** — changing daily menu, sold-out tags, tomorrow's drop notification email signup
- **RESERVATIONS / PRE-ORDER** — reserve specific items for pickup, fakeable form → success state
- **BOOKINGS** — appointments, classes, treatments, tables — date picker + slot selector, fakeable success state
- **ENQUIRIES** — wholesale, catering, custom orders, consultations, mailto: forms
- **EVENTS / WORKSHOPS** — announce dates, capture interest, fakeable RSVP
- **PORTFOLIO / GALLERY** — artist work, transformations, room styling, project shots
- **HOURS / VISIT** — location, opening hours, contact
- **NEWSLETTER / DROP LIST** — email capture, fake-success pattern

Every feature above can be built without a backend, without a database, without integrating Stripe, a real booking calendar, or a real CMS.

**Hard disqualifiers** — businesses where the website's job requires infrastructure we don't build:

- Online product sales (clothing, vinyl, books, candles, prints)
- Stock catalogue with variants and inventory tracking
- Real-time availability syncing (live restaurant table booking that has to actually work, real haircut calendar that has to sync with the barber's diary)
- Membership portals, login systems, customer dashboards
- Subscription billing, recurring payments

The fakeable-success pattern is the boundary. If the demo can show the flow with a "you're booked / you're in / we'll be in touch" success state and the owner's existing process picks up from there — we can sell it. If the demo NEEDS to actually transact for it to be useful — we can't.

---

## Pipeline-fit reference (background, NOT a search target list)

The lists below tell you *what we can sell to* — they exist to sanity-check a candidate after they surface, not to seed search queries. Do NOT search "Aberdeen butcher", "Aberdeen tattoo studio" etc. — Google's ranking surfaces the same 30 names every hunt and you end up re-ploughing the same field.

Verticals where the £350 pitch *can* land (background):

- **Food & drink** — independent cafés, bakeries, brunch spots, coffee bars, dessert and pastry shops, ramen and bao counters, plant-based cafés, ice cream and gelato specialists, juice bars, matcha bars
- **Grooming & personal care** — independent barbers, hair salons, nail salons and nail bars, brow and lash studios, aesthetics clinics, spa and massage rooms
- **Health & fitness** — yoga studios, pilates studios, boutique gyms, climbing walls, sauna and ice bath spaces, sports therapy clinics, physio practices
- **Creative services** — tattoo studios, piercing studios, photographers' studios (bookings, not print sales), small recording studios
- **Venues & events** — small wedding venues, private dining rooms, supper clubs, cookery schools, art studios offering workshops, pottery studios
- **Specialist retail that's really a service** — florists (consultations and weddings, not online stem sales), bike workshops (servicing not selling), framing shops, watch repair

The list is illustrative, not exhaustive. The test isn't "is it on the list" — it's "does the pipeline fit test pass and the criteria pass". Surface businesses through signal-led searches (Phase 1 below), THEN check them against this list.

---

## Hard criteria — two qualifying paths

The criteria below recognise that two genuinely different shapes of business both fit our pitch: a modern indie whose audience is locked in Instagram, AND a high-street owner-operator who's been there 30 years and never had reason to bother with a website. Different pitches, same £350. The old criteria implicitly biased toward the first shape and silently filtered out the second. This split fixes that.

Every lead must meet **criteria 1, 2, 5, 6 (universal)** plus EITHER **Path A** or **Path B**.

### Universal criteria

1. **Pipeline fit** — passes the test above. No e-commerce. No real-time transactional infrastructure required.
2. **No existing functional website.** Linktrees, dead Wix pages, "Coming Soon" placeholders, Yell-only listings, and Facebook-only setups are acceptable. A working Squarespace, WordPress site, or any site with a real booking flow or contact form is a hard pass.
5. **Owner-led.** A named individual or couple or family who makes decisions, not a chain or franchise or committee. If the owner name can't be found in research, flag it as a risk but don't auto-disqualify.
6. **Aberdeen or immediate commuter belt.** City centre, Rosemount, Holburn, West End, Old Aberdeen, the Beach, Torry. Cults, Peterculter, Bridge of Don, Westhill if the lead is exceptional.

### Path A — IG-led indie

The shape the original criteria assumed. Modern brand, audience locked in social, dead/no website. Visual operator (cake bakery, tattoo studio, brow artist, brunch spot, florist with editorial Instagram).

- **3a. Strong owned audience.** 5,000+ Instagram followers OR 2,000+ with consistent recent posting (something in the last two weeks). For service businesses (barbers, tattoo studios), TikTok or strong Booksy / Treatwell ratings can substitute for follower count.
- **4a. Strong Google presence.** 4.5★ with at least 80 reviews. For very new businesses (under 12 months), relax to 4.5★ with 30 reviews if they're trending fast.

Pitch shape: *"Your audience is locked inside Instagram, Google can't see you. This fixes that without touching your phone."*

### Path B — Owner-present, real website job

The operator whose service has a concrete *job* a website does that the phone alone does badly — booking calendar, portfolio for high-value custom work, custom-enquiry intake, event capture, wholesale gate. Owner is reachable at the shop most days but they're losing real revenue today to operators who have these jobs handled online.

This is NOT "heritage operator" or "long-trading". A 60-year fishmonger fails this path because nobody Googles fishmongers, no competitor with a website is eating their lunch, and the customer base is stable. They have no website job a £350 site solves. Pitching them is asking them to pay for a solution to a problem they don't have. Same logic disqualifies traditional butchers, cobblers, hardware shops, fishmongers, and most owner-operator high-street retail where the customer just walks in or doesn't.

What qualifies for Path B:

- **3b. Owner-present and reachable.** Single location (not a chain or multi-site). Owner-operator or family-led. Names of decision-makers can be found in research. Realistic chance the owner is behind the counter / on the floor when the rep walks in.
- **4b. Visibly broken website job.** At least ONE of the eight pipeline-fit features (BOOKINGS / RESERVATIONS / ENQUIRIES / EVENTS / PORTFOLIO / NEWSLETTER) is currently handled by phone or DM and is *demonstrably* friction. Surface evidence required: "books out two weeks ahead by DM and posts apology stories when they miss enquiries", "portfolio is buried 3,000 posts deep on IG and customers ask for examples by email", "queue out the door every Saturday with no waitlist", "wholesale enquiries via personal Facebook because there's no business email path". If the only evidence is "no website exists" — that's not enough. The owner has to be feeling the pain.

Pitch shape: *"This specific job — your [bookings / portfolio / wholesale enquiries] — is broken for you today. £350 fixes it. Here's what the fix looks like."*

Verticals where Path B realistically applies:

- Wedding photographers / event photographers (portfolio + enquiry intake)
- Custom cake / event cake makers (portfolio + custom orders)
- Florists doing event work alongside walk-ins (consultations + portfolio)
- Tattoo studios with strong DM-led booking (artist gallery + booking funnel)
- Brow / lash / aesthetics artists (booking + before/after gallery)
- Caterers (enquiry intake for events)
- Wedding venues / private dining rooms (capacity + dates + enquiry)
- Pet groomers / dog trainers (booking + portfolio)
- Bespoke jewellers / custom makers (portfolio + commission enquiry)

Verticals where Path B almost always FAILS (heritage retail with no website job):

- Traditional fishmongers, butchers (fresh produce, walk-in-only customer)
- Hardware / ironmongers (transactional, walk-in)
- Cobblers / shoe repair (drop-off + collect, no online job)
- Bakers selling loaves / pies (not made-to-order celebration cakes)
- Newsagents / tobacconists / dry cleaners (no portfolio / no booking)

If the only signal you have for a candidate is "old shop on the high street with no website", that's not Path B. Walk past.

### Path C — Established, Facebook-led, low-IG

The operator who's been trading for years, runs an active Facebook page, has a claimed Google Business Profile, and uses Instagram either not at all or as a token presence. Typically Gen X / Boomer demographic. They know they should have a website and just haven't. They DON'T have the "we're fine on Instagram" objection that Path A operators raise. Easier conversion than the IG-led indie because the bar is lower — anything we offer is an upgrade from zero.

Path C does NOT require IG audience size, Google review counts, or specific job-pain evidence. The qualifying evidence is "this is a real business that's invisible to the next customer who isn't already a referral".

- **3c. Owner-present and reachable.** Same as Path B — single location, owner-operator or family-led, decision-maker identifiable.
- **4c. "Real business" evidence — Companies House 3+ years trading AND at least ONE of:**
  - Google Business Profile claimed with address verified (review count IRRELEVANT, including zero)
  - Active Facebook page (posted in last 90 days)
  - Local press mention (P&J, Aberdeen Business News, Aberdeen Inspired, Northsound Radio)
  - Community-page mention (Rosemount & Mile End, neighbourhood FB groups, "Best of Aberdeen" editorial lists)
  - Customer recommendations on OTHER pages naming them by name

Pitch shape: *"You've been on Aberdeen <area> for N years. You're on Facebook, you're on Google Maps. You're missing the layer in between — somewhere a new customer can verify you're real and remember you in a week. £350 starts that surface. The same URL stays live as we add your photos and story to the inside."*

The "same URL personalises later" promise is technically supportable — the customer-facing wrapper at `salespatch.co.uk/preview/<lead_assignment_id>` iframes `salespatch.co.uk/api/demo-site/<slug>.html`. Re-uploading richer HTML at the same slug swaps the content without changing the URL the rep gave the owner. Real promise.

Verticals that often fit Path C (reference, NOT search targets): garden designers, mobile beauty / hair / aesthetics services, driving instructors, private tutors / piano teachers, tradespeople (electricians / plumbers / joiners doing residential + commercial), small accountants / bookkeepers, wedding officiants / celebrants, dog walkers / pet sitters, mobile car valeters, home cleaners, multi-trade handypersons, language tutors, photographers serving older clientele, vintage furniture restorers, locksmiths. Older demographic, established trade, light-touch online presence.

### Pick one path per lead

A lead may surface signals from multiple paths. Apply the **specificity-wins** rule:

1. **Path B** if there's surface evidence of a specific broken website job (missed bookings, queue chaos, portfolio depth, "sorry for the late reply" posts). The pitch is sharper at the door because it names the exact pain.
2. **Path C** if the business qualifies as established (Path C's 3+ years + evidence) but the friction is generic invisibility, not a specific documented pain. The pitch leans on the "same URL personalises later" framing.
3. **Path A** if neither — modern IG-led indie with strong audience and Google numbers but no specific job pain.

Genuine 3-way overlap is rare. A 12-year garden designer with 15K IG, missed-DM apologies, AND a P&J feature — declare A, because the IG audience is the strongest single lever. State the path explicitly in the shortlist output so the rep knows which pitch to lead with at the door.

---

## Phase 1 — Discovery (signal-led, not vertical-led)

**The trap to avoid:** searching by industry ("Aberdeen tattoo studio", "Aberdeen cake maker", "Aberdeen butcher") surfaces the same 30 names every hunt. Google's ranking is stable, the indie pool by trade is small, and you end up re-ploughing the same field. Every session that hunts this way produces the same shortlist. Don't do it.

**The approach:** hunt for the SIGNAL, let the trade emerge from the result. A query like `"Aberdeen" "fully booked" instagram` surfaces every owner-operator in Aberdeen posting that phrase, regardless of trade — barbers, hairdressers, private chefs, dog groomers, tattoo artists, piano teachers, sourdough bakers, garden designers. Variety is the point.

For each candidate that surfaces from a signal search, capture: name, address, postcode, Google rating, review count, what they primarily do. Skip any candidate already on the exclusion list. Then sanity-check against the pipeline-fit list above — if they don't sell anything our pipeline can build for, drop them and move on. The trade is incidental; the friction is the qualifier.

### Signal-led search queries (path-agnostic, primary lane)

Run a mix of these. Each surfaces different shapes of owner-operator without committing to a vertical upfront. None of these contain a trade name — that's the whole point.

- `"Aberdeen" "fully booked" instagram` — turning customers away, no waitlist
- `"Aberdeen" "next available" "September" OR "October" OR "November"` — long lead times with no booking calendar
- `"Aberdeen" "DM to enquire" OR "DM for prices" instagram` — explicit DM-only intake
- `"Aberdeen" "book by DM" OR "to book please DM" instagram` — explicit DM-only booking
- `"Aberdeen" "sorry for the late reply" instagram` — operator's own pain
- `"Aberdeen" "we don't have a website" OR "no website but"` — explicit absence + customer compensation
- `"Aberdeen" inurl:linktr.ee OR inurl:beacons.ai OR inurl:milkshake.app` — link-aggregator-only operators (we know we need a site, we settled for this)
- `"Aberdeen" "commissions by DM" OR "custom orders by DM"` — portfolio-led services with no enquiry surface
- `"Aberdeen Inspired" small business feature` — Aberdeen Inspired's editorial beat surfaces variety the trade-led searches miss
- `"Aberdeen Business News" feature small business` — local business press archives, same variety
- `site:pressandjournal.co.uk Aberdeen "no website" OR "Instagram only"` — P&J's small-business beat, variety surface

Stack TWO or THREE of these per hunt. Each pulls a different slice. The intersection is candidates worth verifying.

### Path C signal queries (Facebook-led, no-IG operators)

The path-agnostic queries above already surface some Path C candidates, but explicit Facebook-led + Companies-House-led queries help. These hunt the older / established demographic the IG-skewed primary lane misses:

- `"Aberdeen" site:facebook.com small business` — Aberdeen-tagged Facebook business pages
- `"Aberdeen" "find us on Facebook" OR "follow us on Facebook"` — operators who explicitly route to FB as primary
- `"Aberdeen" "established" "years" facebook` — long-trading operators on Facebook
- `site:google.com/maps Aberdeen "claimed" small business` — claimed Google Business Profiles
- `"Aberdeen Inspired" feature service business` — variety surface via local editorial
- `site:pressandjournal.co.uk Aberdeen "small business" feature` — P&J's small-biz beat
- `site:aberdeenbusinessnews.co.uk Aberdeen <neighbourhood>` — Aberdeen Business News covers Path C operators regularly
- `"Aberdeen" "trading since" OR "in business since" facebook` — explicit years-trading signal

Don't use Instagram tells to disqualify Path C candidates. A Facebook page with 800 likes and weekly posts is a fine Path C qualifier even with zero Instagram presence.

### Tells that confirm a candidate (after signal-led search surfaces them)

Once a signal-led search returns a name, look at their actual presence to confirm. Tells are for verification, not for seeding new searches.

**Path A confirmation** — modern IG-led indie:

- "Book via DM" in their Instagram bio
- Linktree pointing only to Booksy / Treatwell / Fresha / Square
- "Call to book" with no online option in bio
- Press coverage that links to Instagram instead of a website
- 5,000+ IG followers OR 2,000+ with consistent recent posting

**Path B confirmation** — owner-present with broken website job:

- Their last 30 IG posts include "fully booked", "sold out by 11am", "back next week" — demand they can't capture
- Multiple recent posts apologising for missed DMs / late replies
- Their portfolio for high-value work (weddings, custom commissions, events) is buried 1,000+ posts deep on Instagram with no categorisation
- A press feature or review explicitly mentions "you have to message them on Instagram to book" or "their website is just a Facebook page"
- Google reviews include phrases like "took ages to get a reply" or "couldn't find their menu / price list"
- They post recurring "events" or "workshops" with no central listing — every event needs a fresh post
- Their phone hours are limited and customers complain about reachability

**Path C confirmation** — established + Facebook-led + low-IG:

- Companies House shows 3+ years of trading with a verified director match
- Facebook page is active (post in last 90 days), has a few hundred to a few thousand likes
- Instagram is either non-existent or a token presence (<500 followers or <30 posts)
- Google Business Profile is claimed: photo of the shopfront, hours, phone number set, even if review count is low or zero
- Press has mentioned them (P&J, Aberdeen Inspired, Aberdeen Business News, Northsound) OR they appear in community-page recommendations
- The operator demographic is visibly older — owner's photo / about-us copy / posting style reads Gen X or Boomer, not Gen Z

**What is NOT a tell:**

- "Old shop, no website" — heritage alone is not a website job. Most heritage retail (fishmongers, butchers, hardware shops) has no website job and the owner won't pay. This applies across all three paths.
- "Landline phone number" — irrelevant to the website-job test on its own.
- "Companies House pre-2015 incorporation" — irrelevant for Path A and Path B. For Path C it's part of the 3+ years criterion but only when combined with the active Facebook / claimed Google profile evidence.

### When signal searches don't surface enough leads

If the path-agnostic queries above produce fewer than 2 candidates after 3-4 query stacks, *then* fall back to one targeted trade query — but pick a trade that hasn't been worked in the exclusion list. Look at what verticals are already in `~/Desktop/salespatch-demos/` and explicitly hunt OUTSIDE them. If the pipeline is heavy on cafés and tattoo studios (current state), the trade-fallback query should target something completely orthogonal — e.g. piano teachers, dog trainers, garden designers, picture framers (if they DO have a website job, see Path B disqualifiers above), wedding venues. The fallback should diversify, not re-plough.

---

## Phase 2 — Verification (the cull)

For every candidate that survives discovery, before recommending them:

1. **Website status.** Search `"[business name] [postcode] website"`. If a real working site comes up — pass. Note: a Booksy or Treatwell booking page is NOT a website for our purposes. It serves the booking job but gives them no brand home, no portfolio, no story, no email capture. Still pitchable.
2. **Declare the path.** Decide whether this lead fits Path A, Path B, or Path C. Apply the **specificity-wins** rule:
   - **Path B** if there's surface evidence of a specific broken website job. The pitch names the exact pain. Verify 3b (owner-present) AND 4b (cited surface evidence of the broken job).
   - **Path C** if the business qualifies as established but the friction is generic invisibility, not specific documented pain. Verify 3c (owner-present) AND 4c (Companies House 3+ years AND at least one of the evidence types — claimed Google profile, active Facebook, press mention, community recommendation).
   - **Path A** if neither — modern IG-led indie. Verify 3a (IG follower threshold) AND 4a (Google rating + review count).
   "No website exists" is never enough on its own — every path needs its own qualifying evidence.
3. **Identify the owner.** Press coverage, P&J features, Companies House, interviews, or named reviews. Required for both paths.
4. **Read the most recent reviews / press coverage** to capture: the conversion problem, signature service or product, brand voice, and anything useful for the pitch angle. For Path B candidates, also scan the operator's own recent Instagram posts for explicit friction language ("sorry for the late reply", "fully booked again", "DM to enquire") that confirms the website job is broken.
5. **Active operating + no transition.** Scan the most recent Instagram posts and / or Google reviews for language like "handing over", "new owners", "thank you for [N] years", "final week", "closing down". A transition in flight is a hard PASS even if every other criterion is met. The Phase 1.5 IG scrape in `/spec-site-brief` will catch this too, but cheaper to catch here.
6. **Confirm pipeline fit.** Does the website's real job reduce to the fakeable-success pattern? If their core need is online product sales or real-time inventory, drop them.

Most candidates will fail this stage. That's fine. Be ruthless. A shortlist of 2 strong leads beats a shortlist of 5 mediocre ones.

---

## Phase 3 — Output

Deliver, in this exact order:

1. **Exclusion list** — names already in the pipeline, printed back so the user can verify the filesystem scan worked.

2. **Search summary** — one line on what was searched and roughly how many candidates were considered before culling. Mention the industries covered.

3. **Ranked shortlist** — 2 to 3 leads, ordered strongest first. Aim for diversity across both INDUSTRY and PATH when the pool allows it — three Path A cafés is less useful than one Path A café + one Path B butcher + one Path A barber. For each lead:

   ```
   ## [Business Name]
   - Path: [A — IG-led indie | B — Broken website job | C — Established, Facebook-led, low-IG]
   - Industry / what they do
   - Address, postcode
   - Google: [rating] from [count] reviews    (required for A; nice-to-have for B; "claimed profile, count irrelevant" is fine for C)
   - Instagram: [handle], [followers] followers    (required for A; "minimal / none" is fine for B and C)
   - Facebook: [page name], [page likes] likes, last posted [date]    (required for C; nice-to-have for A and B)
   - Years trading: [N years, since YYYY]    (required for C; nice-to-have for A and B)
   - Owner: [name(s)]    (required for all paths — don't surface a candidate with "owner unknown")
   - Existing site: [none / Linktree / Facebook-only / Yell-only / Booksy / "coming soon"]
   - Pipeline-fit features: [which of the 8 fakeable features their site would need]
   - Broken website job (Path B only): [the specific job + cited surface evidence — post URLs, review quotes, press quotes]
   - "Real business" evidence (Path C only): [list the 4c evidence types that apply with citations — "Companies House SC123456 trading since 2017", "Aberdeen Inspired feature March 2024 [link]", "Facebook page 1,200 likes, posted three days ago"]
   - Diagnosis (one sentence): the conversion problem £350 fixes
   - Pitch angle (one sentence, ≤ 25 words): the line to lead with    (use the appropriate path's pitch shape)
   ```

   Cite sources for every factual claim — Google rating, review count, follower count, owner name, press quotes, years trading. For Path B leads, the broken-website-job evidence must cite specific posts / reviews / press quotes by URL. For Path C leads, the "real business" evidence must cite Companies House number + at least one other evidence type with URL.

4. **Risk notes** — for each lead, one line on what could kill the sale. Anti-tech owner, partnered booking platform that locks them in, owner's nephew already builds sites, big chain coming nearby, etc.

5. **Recommended order of visit** — given the addresses, suggest the walking loop or order that makes sense if the user is doing all 2-3 in one morning.

6. **Next step** — remind the user that the chosen lead can now be scaffolded with `/new-lead "[Business Name]"`.

---

## Rules of engagement

- British English. No em-dashes. No exclamation marks. No marketing-mush vocabulary.
- Specifics over adjectives. "Books out two weeks ahead" beats "very popular." Quote real numbers, real reviews, real press.
- Do not fabricate. If a follower count, owner name, or rating can't be verified, mark it unknown.
- Do not recommend a business without verifying the website status. The whole pipeline depends on this filter being clean.
- If fewer than 2 leads survive verification, say so plainly and suggest a wider search — different industry, different neighbourhood, relaxed criteria.
- Be opinionated about ranking. A vague "all three are good" answer is useless at the door. Pick a winner and defend it.

Begin with the exclusion scan.
