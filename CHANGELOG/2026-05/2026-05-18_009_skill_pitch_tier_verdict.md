# spec-site-brief + lead-json — pitch-tier verdict (Tier 1 / Tier 2 / PASS)

**Date:** 2026-05-18
**Scope:** Third of six structural skill changes from the lead-2 audit.
Makes the Tier 2 verdict from `feat/skill-functional-front-door-principle`
(PR #125) load-bearing across the pipeline: the brief carries
`verdict_tier`, `/lead-json` produces a tier-aware pitch, the warehouse
gets a queryable dimension.
**Branch:** `feat/skill-pitch-tier-verdict`
**Base branch:** `main`
**Depends on:** PR #124 (positioning track) + PR #125 (functional-front-door
principle). Tier 2 is the load-bearing output of #125; this PR teaches
the rest of the pipeline how to handle it.

## What changed

### `skills/spec-site-brief/SKILL.md` Phase 4

- **Section 1 VERDICT** now distinguishes three shapes:
  - `PROCEED Tier 1` — classic broken-front-door
  - `PROCEED Tier 2` — operator has a working platform-hosted front
    door; pitch is "take back ownership of your URL"
  - `PASS` — owned + functional, no pitch
- Added "Tier 2 verdict shape" rule. Tier 2 briefs MUST capture
  `functional_front_door_url`, `functional_front_door_platform`, and
  optionally `broken_owned_domain` (when the operator has both a working
  platform front AND a broken owned domain). The hook framing,
  demo positioning, and expected close rate all differ from Tier 1.
- brief.json schema gains: `verdict_tier`, `functional_front_door_url`,
  `functional_front_door_platform`, `broken_owned_domain`.

### `.claude/commands/lead-json.md`

- **Grounding rule 5b** added: Tier-aware pitch shape. /lead-json reads
  `outputs/brief.json.verdict_tier` and adjusts:
  - **Tier 1** pitch leads with *absence* ("you have no website").
  - **Tier 2** pitch leads with *dependency* ("your Treatwell front
    works; what's missing is your own URL"). Mandatory specific_objection:
    "I already have Treatwell/Booksy/Fresha" with a response that does
    NOT replace the platform — the demo wraps it via `embed` treatment.
- pitch-brief.json metadata grows: `verdict_tier`,
  `functional_front_door_url`, `functional_front_door_platform`. The
  warehouse can now JOIN close-rate by tier.

## Why

PR #125 introduced Tier 2 as a Phase 1 verdict but the rest of the
pipeline still treated all PROCEED briefs as Tier 1 — same pitch shape,
same hook framing, same close. Annie's Nails (lead-2) shipped a Tier 1
pitch when the real case was Tier 2: she has a working
`anniesnailsandbeauty.mytreatwell.co.uk` already, and her "broken front
door" is a thin pitch hook. The pitch she actually needs is "take back
ownership of your URL", which has different opener language, a different
expected close rate, and at least one mandatory objection script the
Tier 1 pitch doesn't include.

Making the tier load-bearing through /lead-json closes the loop. The
warehouse gains a queryable dimension (close-rate by tier) which the
eventual closed-pitch-outcome model needs to learn "Tier 2 grooming
leads close at X% vs Tier 1 grooming at Y%".

## Stack

- Markdown only — pure skill-prompt edits.
- No new fields on existing JSONB columns (all new fields land in
  `SiteBrief.metadata` and `PitchBrief.metadata` JSONB which are
  already flexible).
- Backwards-compatible: existing leads without `verdict_tier` default
  to Tier 1 behaviour in /lead-json. New leads adopt the tier.

## Integrations

- `/spec-site-brief` writes `verdict_tier` + Tier 2 metadata to
  `outputs/brief.json` + `BrandAnalysis.metadata` via the existing
  `/api/ingest/site-brief` endpoint (no validator change).
- `/lead-json` reads `verdict_tier` from `brief.json` and writes the
  same fields to `pitch-brief.json.metadata`. POSTs unchanged.
- The eventual close-rate-by-tier query: `SELECT verdict_tier,
  COUNT(*) FILTER (WHERE outcome='closed') / COUNT(*) FROM site_briefs
  JOIN pitch_outcomes USING (lead_id) GROUP BY 1` (NERVE has the
  underlying tables; this is the dimension that PR #123 was missing).

## How to verify

```bash
bash scripts/setup-skills.sh   # symlinks should already be in place
```

End-to-end:

1. Run `/spec-site-brief` on a Treatwell-vanity-URL lead. Expect:
   - `verdict_tier: "tier_2"` in brief.json
   - `functional_front_door_url` populated with the Treatwell vanity URL
   - VERDICT section reads "PROCEED Tier 2 — works out of X; pitch is take-back-ownership"
2. Run `/lead-json` on the same lead. Expect:
   - `description` mentions the Tier 2 framing ("Treatwell is her booking, this gives her an owned brand layer")
   - At least one specific_objection captures the "I already have Treatwell" objection with a non-replacing response
   - `metadata.verdict_tier: "tier_2"` on the pitch-brief.json ingest
3. Run `/spec-site-brief` on a Tier 1 lead (e.g. Urban Cutz re-brief):
   - `verdict_tier: "tier_1"`, no functional_front_door fields
   - /lead-json pitch shape unchanged from the existing pattern
4. POST to `/api/ingest/site-brief` + `/api/ingest/pitch-brief` →
   HTTP 200 in both tier cases (no validator change).

## Known issues

- The warehouse-side query "close rate by tier" needs a tier_1 baseline
  and tier_2 baseline before it produces meaningful numbers — n=0 for
  both today. The dimension is captured; the analysis waits on data.
- /build-demo doesn't yet differentiate behaviour by tier. The follow-up
  is to make Tier 2 builds default to wrapping the existing platform
  front (e.g. via iframe or a "Book on Treatwell" CTA prominent in the
  hero) rather than rebuilding the booking surface. Logged for a
  future PR.
- The `Front-door tier:` line in /lead-hunter shortlist output (PR #125)
  doesn't yet feed automatically into /spec-site-brief. The operator
  has to re-derive the tier in Phase 1. A short follow-up could plumb
  this via a shortlist-file written by /lead-hunter that /spec-site-brief
  reads.
