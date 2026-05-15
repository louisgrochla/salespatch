# lead-hunter — refine Path B from "heritage operator" to "broken website job"

## What changed

- `~/.claude/commands/lead-hunter.md` (user-level, not in repo) —
  Path B redefined from "heritage owner-operator (5+ years on a real
  shopfront)" to "owner-present operator with a concrete website
  job that's visibly broken". Same path number, completely
  different qualifier:
  - **3b** changed from "trading 5+ years on a real high-street
    shopfront" to "owner-present and reachable" (single location,
    owner-operator, decision-makers named).
  - **4b** changed from "owner-present signal (Companies House
    director match / press feature / named on signage)" to "visibly
    broken website job — at least one of the eight pipeline-fit
    features is currently handled by phone or DM and is
    demonstrably causing friction, with surface evidence required".
  - Phase 1 Path B tells rewritten: search queries shift from
    heritage signals (`"family run"`, `site:yell.com`,
    `"<trade> Aberdeen since"`) to friction signals (`"book by DM"`,
    `"fully booked"`, `"sorry for the late reply"`, `"enquiries via"`).
    Tells shift from "painted signage / landline / Companies House
    pre-2015" to "operator's own posts apologising for missed DMs",
    "buried portfolio", "Google review complaints about
    reachability".
  - Phase 2 verification step 2 updated: Path B requires naming the
    specific broken job with evidence, not just "no website".
  - Phase 3 output schema dropped `Years trading:` and added
    `Broken website job (Path B only):` requiring the specific job
    + surface evidence (cited posts / reviews / press).
  - Explicit list of verticals that FAIL Path B (traditional
    fishmongers, butchers, ironmongers, cobblers, newsagents) so
    future runs don't repeat the Creel Fish Shop class of
    recommendation.

## Why

PR #88 (yesterday's commit) added Path B as "heritage owner-operator
who's been on the high street 30 years and never bothered with a
website". The first heritage hunt surfaced The Creel Fish Shop /
D Nicoll Fishmongers — 60+ years on Rosemount Place, owner present,
landline-only, no social media, perfect heritage profile.

User feedback (verbatim): *"a butcher and a fish shop are very
unlikley to pay for a website, realistcally no one is checker them
and seo means nothing too them"*.

That's correct. The heritage filter found owner-present operators
but missed the deeper test: will the owner actually pay £350? For
a 60-year fishmonger, the answer is no, because:

1. Nobody Googles fishmongers — the customer isn't there to capture
2. No competitor with a website is eating their lunch
3. Customer base is stable; word-of-mouth has worked for 60 years
4. There's no booking job, no portfolio job, no enquiry funnel job
   that a website does better than the phone
5. The £350 is a pure cost with no revenue lever

Same logic disqualifies traditional butchers, ironmongers,
hardware shops, cobblers, dry cleaners, newsagents. The "heritage
high-street shape" almost always fails the will-pay test.

The refined Path B filters on two stacked conditions:
- Owner-present and reachable at the door (keeps the original
  intent of finding decision-makers in person)
- A specific website JOB that's currently broken AND the owner
  feels the pain ("sorry for the late reply" / "fully booked again"
  / "DM to enquire" in their own posts)

A wedding photographer drowning in DM enquiries passes both
filters. A 60-year fishmonger fails the second.

## Stack
User-level Claude Code skill. No NERVE changes. No producer
scripts touched.

## Integrations
None. Out-of-repo skill change only; this commit is the in-repo
CHANGELOG record.

## How to verify

1. Run `/lead-hunter` — the shortlist should not include any
   candidate whose entire signal is "old shop, no website".
2. For any Path B candidate surfaced, confirm the per-lead block
   names the specific broken job + cites surface evidence
   (post URL, review quote, press article).
3. Re-run a hunt biased to verticals that previously surfaced
   (butchers, fishmongers, ironmongers). Expect the skill to skip
   them with rationale or surface zero matches in that category.
4. Run a hunt biased toward Path B's correct verticals (wedding
   photographers, custom cake makers, event florists, tattoo
   studios). Expect viable Path B candidates with named jobs.

## Known issues

- Path B's "evidence of friction" requires the operator to post
  about their own pain. Some operators are too polite to do this
  publicly. We'll miss them. The user's manual judgement at the
  door is the catch-net for that — the skill biases toward leads
  the rep can verify before walking in.
- The list of "verticals that FAIL Path B" is illustrative not
  exhaustive. Edge cases will surface in real hunts. Surface them
  in the changelog when they do; we don't try to enumerate the
  full negative space upfront.
- PR #88 is now effectively superseded for Path B's definition,
  but its Phase 2 verification step 5 (active operating + no
  transition) and Phase 3 output's `Path:` field both still
  apply. This PR is an iteration on #88, not a revert.
