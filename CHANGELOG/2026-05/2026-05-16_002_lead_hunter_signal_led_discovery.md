# lead-hunter — signal-led discovery in Phase 1

## What changed

- `~/.claude/commands/lead-hunter.md` (user-level, not in repo) —
  Phase 1 Discovery rewritten to lead with **signal-shaped** search
  queries (path-agnostic) instead of **vertical-shaped** queries.
  Specifically:
  - "Target industries (broad — pick anything that fits the
    pipeline)" renamed to **"Pipeline-fit reference (background,
    NOT a search target list)"**. Same content, recontextualised
    as a sanity-check after a candidate surfaces, not as a search
    seed.
  - Phase 1 opening rewritten with explicit "the trap to avoid"
    framing: vertical-led searches re-plough the same field every
    hunt; signal-led searches surface variety.
  - New **"Signal-led search queries (path-agnostic, primary lane)"**
    section listing 11 concrete query patterns that do NOT contain
    a trade name:
    - `"Aberdeen" "fully booked" instagram`
    - `"Aberdeen" "DM to enquire" OR "DM for prices" instagram`
    - `"Aberdeen" "sorry for the late reply" instagram`
    - `"Aberdeen" "we don't have a website" OR "no website but"`
    - `"Aberdeen" inurl:linktr.ee OR inurl:beacons.ai OR inurl:milkshake.app`
    - `"Aberdeen" "commissions by DM"` etc.
    - Plus three press / community archive queries (Aberdeen
      Inspired, Aberdeen Business News, P&J small-business beat)
  - Path A tells / Path B tells subsections recharacterised as
    **verification** signals — applied AFTER a signal-led search
    surfaces a name, not as search seeds themselves.
  - New **"When signal searches don't surface enough leads"**
    fallback: if path-agnostic queries produce fewer than 2
    candidates, run ONE targeted trade query — but pick a vertical
    that's NOT in the existing pipeline. Bias the fallback toward
    diversification, not re-ploughing.
  - Removed the "Verticals to target for Path B" list that
    previously seeded the vertical-led trap.

## Why

Four hunts in this session, every shortlist a variation on the same
theme: cake bakers, tattoo studios, the occasional barber. User
observation (verbatim): *"given our search results only seem to pick
the same kind of business, we cant genrelise kind of business types
in search, it has to be adhere to what we want"*.

That diagnosis is correct, and the bias was upstream of the criteria
— the criteria filter never got a chance to see anything outside the
trade Google ranks for. Each hunt asked Google "what tattoo studios
exist in Aberdeen" and got back the same 30 names; the criteria
filter just picked the strongest of those 30. The lead-hunter never
saw the dog trainer, the piano teacher, the upholsterer, the garden
designer, the framer, the chiropodist — all of whom might pass the
criteria.

The fix is to invert the search direction. Instead of
`Aberdeen <trade> <signal>`, search `Aberdeen <signal>` and let the
trade emerge from the result. A query like
`"Aberdeen" "fully booked" instagram` surfaces every owner-operator
in Aberdeen posting that phrase regardless of trade. Variety is the
point. The criteria filter still does its job — it just operates on
a more diverse candidate pool.

## Stack
User-level Claude Code skill. No NERVE changes. No producer
scripts touched. No new dependencies — signal-led searches use the
existing Google web search.

## Integrations
None. The Apify Maps batch option was considered (per the
conversation that surfaced this patch) but explicitly deferred:
- Cost £5-£10 per Aberdeen sweep
- Adds a third Apify dependency on top of IG-scraper and
  reviews-scraper
- The signal-led Google approach should be tested first; the Maps
  batch can layer on later if variety still feels narrow.

## How to verify

1. Run `/lead-hunter` — the shortlist should include leads from at
   least one trade NOT represented in the existing pipeline (current
   pipeline is heavy on cafés / cake bakers / tattoo studios /
   barbers — so a new hunt should ideally surface candidates outside
   those four trades).
2. The Phase 1 output / reasoning should cite signal-led search
   queries (`"Aberdeen" "fully booked"`, etc.), not vertical-led
   queries (`"Aberdeen tattoo studio"`).
3. Path B verification still works — surfaced candidates must have
   visible-broken-website-job evidence cited from posts / reviews /
   press.
4. The fallback trade-query step should NEVER repeat a trade already
   in the pipeline. If the fallback fires for "cake maker" again,
   the skill is regressing.

## Known issues

- Signal-led searches sometimes produce false positives — "fully
  booked" Aberdeen results can include real hospitality reservations,
  not just operator pain. Phase 2 verification (step 4 reading
  recent posts / reviews) is the catch-net.
- Geographic precision varies: some queries pull Aberdeen-tagged
  posts from accounts based elsewhere. The path-agnostic queries
  include explicit `"Aberdeen"` quotation; that helps but isn't
  perfect.
- The signal queries are biased toward operators who POST about
  their pain publicly. Quiet owner-operators who feel friction but
  don't talk about it on Instagram won't surface. That's a known
  blind spot — the rep's at-the-door judgement is the catch.
- The 11-query starter set is opinionated and likely incomplete.
  Future hunts should surface new signal queries when an unexpected
  phrase predicts a good lead — add them here as the corpus grows.
