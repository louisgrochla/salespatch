# spec-site-brief + lead-hunter — functional-front-door principle

**Date:** 2026-05-18
**Scope:** Second of six structural skill changes from the lead-2 audit.
Replaces the platform-enumeration rules ("not a Linktree, not an
abandoned Wix...", "Booksy/Treatwell pages are NOT websites") with a
single principle-based check: the 30-second test. Catches Treatwell
vanity URLs today, every future platform automatically.
**Branch:** `feat/skill-functional-front-door-principle`
**Base branch:** `main`
**Pairs with:** `feat/skill-positioning-solo-operator-track` (PR #124)
+ the upcoming `feat/skill-pitch-tier-verdict` which formalises Tier 2.

## What changed

### `skills/spec-site-brief/SKILL.md` Phase 1

Replaced the "modern functional site (not a Linktree, not an abandoned
Wix from 2018, not a Facebook page, not a Square stub)" enumeration
with a four-case verdict table built on the **30-second test**:

> Does a stranger Googling this business land on a URL where they can
> (a) see what the business does, (b) see photos of the work, (c)
> book or contact, in under 30 seconds without leaving that URL?

Cases:

1. **Owned + functional** → **PASS** (no pitch).
2. **Platform-hosted + functional** (branded vanity URL on Treatwell /
   Booksy / Fresha / Square / similar) → **Tier 2 PROCEED**. Pitch is
   "take back ownership of your URL", not "fix your broken site".
3. **Owned but broken / stub / Linktree / Facebook-page-only / Yell
   only / Square stub** → **Tier 1 PROCEED**. Classic broken-front-door.
4. The Phase 0 short-circuit (website_probe.reachable + recognised
   platform + real title) unchanged.

Edge case explicit: operator with BOTH a broken owned domain AND a
working platform-hosted page is Tier 2. The broken owned domain is a
thin pitch hook; the underlying business *isn't* missing a front door.

### `.claude/commands/lead-hunter.md` Phase 2

Replaced "a Booksy or Treatwell booking page is NOT a website for our
purposes. Still pitchable." with the same 30-second test applied at
the shortlist stage. Candidates now get `Front-door tier: [Tier 1 |
Tier 2 | PASS]` in the shortlist so the rep knows the pitch shape
before walking in.

## Why

The lead-2 (Annie's Nails) audit caught the platform-enumeration rule
failing: `anniesnailsandbeauty.mytreatwell.co.uk` is a branded vanity
URL that passes the 30-second test (photos + services + reviews +
booking all on one page, business name in the subdomain), but the
enumeration rules said "Treatwell ≠ website, still pitchable". The
pitch then went out as Tier 1 ("fix your broken front door") when the
real shape is Tier 2 ("you have a working front door on Treatwell's
domain; we offer to give you one on yours") — a harder close.

The platform enumeration approach ages badly: every new booking platform
needs the list updated, and operator behaviour on each platform varies.
The 30-second test ages well because it grades the URL on what the
operator's customer actually experiences, not on which platform they
used to build it.

## Stack

- Markdown only — pure skill-prompt edits.
- No new fields on existing JSONB schemas (Tier 2 verdict semantics
  land in the next PR, `feat/skill-pitch-tier-verdict`).
- Backwards-compatible — when the Tier 2 verdict ships, leads briefed
  with the old enumeration rules continue to be classified by their
  recorded verdict; only new briefs adopt the new check.

## Integrations

- Inbound: nothing changes for the producer side. The skill output is
  prose that informs the brief.
- Outbound: `/lead-hunter` shortlist now carries `Front-door tier:`
  per candidate. `/spec-site-brief` reads this if the candidate was
  hunted; otherwise applies the test itself.
- Pairs cleanly with PR #124 (positioning Track B) — the rules
  reinforce each other: Track B operators are often Tier 2 (their
  platform vanity URL IS their de facto website), and Track A
  operators are often Tier 1 (broken owned domain or no domain at all).

## How to verify

```bash
bash scripts/setup-skills.sh   # symlinks should already be in place
```

End-to-end:

1. Run `/lead-hunter` on Aberdeen. For each candidate that surfaces,
   confirm the shortlist line includes `Front-door tier: [Tier 1 |
   Tier 2 | PASS]`. Spot-check: a candidate with a branded `*.booksy.com`
   in their IG bio should be Tier 2.
2. Run `/spec-site-brief` on a fresh candidate. If their primary online
   surface is a branded Treatwell vanity URL with no working owned
   domain, expect the verdict to be Tier 2 PROCEED with a "take back
   ownership of your URL" pitch.
3. Re-running on Urban Cutz (lead-1) should still produce Tier 1
   PROCEED — they had no functional front door of any kind.
4. Re-running on Annie's Nails (lead-2) should now produce Tier 2
   PROCEED, naming the Treatwell vanity URL as the functional front
   door and the dead `.me` as a secondary pitch hook only.

## Known issues

- The Tier 2 verdict semantics aren't yet plumbed through to
  `/lead-json` (different pitch script per tier). That's the next PR,
  `feat/skill-pitch-tier-verdict`. Until then, Tier 2 briefs share the
  Tier 1 lead-json shape with a warning in the chat output.
- The `Front-door tier:` field in shortlist output is prompt-only —
  the warehouse doesn't yet have a column to query by tier. Could be
  added as a lead-profile.json metadata field in a follow-up.
- Existing leads have no tier classification. They build cleanly via
  the existing PROCEED path; only new briefs adopt the tier.
