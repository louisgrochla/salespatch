# lead-hunter — Path C for established Facebook-led operators

## What changed

- `~/.claude/commands/lead-hunter.md` (user-level, not in repo) —
  adds **Path C** as a third qualifying lane alongside A and B:
  - **3c. Owner-present** — same definition as Path B.
  - **4c. "Real business" evidence** — Companies House 3+ years
    trading PLUS at least ONE of: claimed Google Business Profile
    (review count IRRELEVANT, even zero is fine), active Facebook
    page (posted in last 90 days), local press mention, community-
    page recommendation, customer recommendation on other pages.
  - Path C does NOT require IG audience, Google review counts, or
    specific job-pain evidence. The qualifier is "this is a real
    business that's invisible to the next customer who isn't
    already a referral".
- **Pitch shape:** *"You've been on Aberdeen <area> for N years.
  You're on Facebook, you're on Google Maps. You're missing the
  layer in between — somewhere a new customer can verify you're
  real and remember you in a week. £350 starts that surface. The
  same URL stays live as we add your photos and story to the
  inside."*
- The "same URL personalises later" promise is technically
  supportable — the customer-facing wrapper at
  `salespatch.co.uk/preview/<lead_assignment_id>` iframes
  `salespatch.co.uk/api/demo-site/<slug>.html`. Re-uploading
  richer HTML at the same slug swaps the content without
  changing the URL the rep handed the owner.
- **Pick-one-path rule updated to specificity-wins:** Path B if
  there's evidence of a specific broken job → Path C if the
  business is established but invisibility is generic, not
  specific → Path A as the IG-led-indie residual.
- **Phase 1 signal queries** gain a Path C subsection: explicit
  Facebook-led + Companies-House-led search patterns. Path C
  candidates won't surface via Instagram-skewed queries.
- **Phase 2 verification step 2** now declares one of three paths
  with the specificity-wins rule applied.
- **Phase 3 output schema** gains a `Facebook:` field (required
  for Path C), a `Years trading:` field (required for Path C),
  and a `"Real business" evidence (Path C only):` block that
  cites Companies House + at least one other evidence type with
  URL.

## Why

User observation surfaced after the signal-led search hunt: the
`5,000+ IG OR 2,000+ recent posting` audience criterion filters
out a real category — established businesses that are successful
but haven't built an Instagram presence. The garden designer
making £80k a year from referrals. The 7-year cleaning company
expanding into commercial. The tradesperson moving upmarket.

Demographic thesis (user's framing, verbatim): *"its a easier
sell, we should not apply this to every one but its an example of
what market we could exceed in along side"* and *"facebook is
popular with alot of these businesses ... it opens us up to a
different clientele of older generation business who may convert
easier than gen z owners who think they have it worked out"*.

Gen Z operator with 15K IG says "we're fine, our audience is on
IG". Gen X / Boomer operator with Facebook + Google Maps says
"yeah, we know we should have a website, we just haven't gotten
round to it". The pitch lands easier on the second profile because
they're already mentally there.

The trade-off the user named directly: weaker first demo because
no Instagram brand data to decode, but the "same URL personalises
later" framing turns that into a sales advantage — "starter
website now, richer one without changing the URL as we add your
content".

## Stack
User-level Claude Code skill. No NERVE changes. No producer
scripts touched yet — the Facebook integration on the producer
side is a separate follow-up (PR β / γ per the planning thread).

## Integrations
None new in this PR. The Path C signal queries use existing
Google web search. The producer chain still scrapes IG even for
Path C candidates; the Facebook scraper integration is a follow-up
that needs an Apify Facebook actor wrapping (the old
`facebook-page.sh` HTTP-API stub is dead — same dead-pattern as
ig-profile.sh was before PR #80).

## How to verify

1. Run `/lead-hunter` — confirm the shortlist can include Path C
   candidates (e.g. a 5+ year garden designer with Facebook
   activity and no IG). If every candidate is Path A or B, the
   path-specific signal queries aren't being used.
2. The Phase 1 search output should cite Path C signal queries
   (`"Aberdeen" site:facebook.com small business`,
   `site:aberdeenbusinessnews.co.uk`, etc.) alongside the
   path-agnostic queries.
3. For any Path C candidate, the per-lead block must cite
   Companies House number + at least one other 4c evidence type
   with URL.
4. Specificity-wins rule check: a candidate with strong IG
   followers AND a specific broken job AND Facebook + Companies
   House should declare Path B (specific job wins) or A (if
   IG is the strongest single lever).

## Known issues

- Producer-side Facebook integration is NOT in this PR. Path C
  candidates surfaced today will still get their `/spec-site-brief`
  brand decode from Instagram (which they may not have). Brief
  output will be weaker for Path C until PR β lands. The "starter
  site, personalises later" framing covers the gap in the pitch.
- The "Path B vs Path C overlap" rule is judgement. The
  specificity-wins guidance is the right default but edge cases
  (e.g. a Path C candidate who happens to have one apologetic FB
  post about a missed enquiry) may go either way. Lean B if there's
  a specific cited job pain; lean C if the friction is generic.
- The "older demographic" tell in Path C confirmation is squishy.
  Avoid making it a hard rule — a 35-year-old garden designer
  with no IG and a strong Facebook page qualifies just as well as
  a 60-year-old one.
- The 11-query Path C signal set is opinionated and likely
  incomplete. Add more queries as new phrases predict good leads.
