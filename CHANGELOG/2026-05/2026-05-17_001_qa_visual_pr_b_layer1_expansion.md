# qa-visual — PR-B Layer 1 expansion + hybrid dynamic-content honesty check

Second of the 10 PRs from `qa-visual-IMPLEMENTATION-PLAN.md`. Stacks on
PR-A (#94, merged).

## What changed

- `apps/nerve/scripts/qa-visual-dynamic.ts` (in-repo, NEW) —
  static-source scan that greps a built demo.html for two things:
  - "Live-looking" phrases the eye reads as dynamic (e.g. `Today · Wed 7 May`,
    `OPEN TODAY`, `BACK AT 8:30`, `walk-ins from 12`, `sold out`,
    `8 spaces left`, `today's bakes`)
  - Presence of any date/time JS API in the source
    (`new Date`, `.getDay`, `.getDate`, `.getHours`,
    `toLocaleDateString`, `Intl.DateTimeFormat`, etc.)

  Crude classification: if any date/time API exists in the file, all
  live-looking matches get `severity_hint: "info"` (likely wired, vision
  pass should confirm). If NO API exists, every match gets
  `severity_hint: "critical"` (hardcoded — will read stale on any date
  other than the one baked in). Output lands at
  `outputs/.qa-visual/dynamic-scan.json` matching `DynamicScanSummary`.
- `apps/nerve/scripts/qa-visual-prompts.ts` —
  - `BUGS_SYSTEM_PROMPT` extended from 6 to 8 bug categories. Three are
    new (status-as-CTA confusion, CTA hierarchy collapse, live-content
    honesty); the others are reworded.
  - New TS interfaces `DynamicScanSummary` and `DynamicScanCandidate`
    so callers know the shape `buildBugsUserMessage` expects.
  - `buildBugsUserMessage` signature extended with an optional
    `dynamicScan` parameter; when provided, the candidate list + summary
    are injected into the user message verbatim so Layer 1 vision can
    grade live-content honesty against source ground-truth.
- `apps/nerve/scripts/qa-visual-prompts.md` — mirrors all of the above:
  bug-category list grows from 6 to 8, new "Static-source scan input"
  section documents the wire format, the rubric updates, and how
  `buildBugsUserMessage` consumes the input.
- `apps/nerve/scripts/qa-visual.ts` — gains a `runDynamicScan` helper
  that spawns `qa-visual-dynamic.ts` as a subprocess before Layer 1 and
  threads the result through `buildBugsUserMessage`. ~50ms overhead per
  run, no API spend.
- `apps/nerve/scripts/qa-visual-drift-test.ts` — `DynamicScanSummary`
  added to `REQUIRED_SYMBOLS` so future drift on the dynamic-scan
  surface gets caught.
- `~/.claude/commands/build-demo.md` (user-level, not in repo) — new
  "Step 1.5 — run the static-source dynamic-content scan" between the
  render and the PNG-read steps, plus an updated Layer 1 input note
  pointing in-session Claude at the new `dynamic-scan.json` file.

## Why

The audit (`apps/nerve/scripts/qa-visual-AUDIT.md` finding A2) identified
"hardcoded live features" as the highest-leverage bug class the visual-QA
v1 missed. Two-thirds of the cohort's "live status" hero elements turned
out to be theatre:

| Demo | "Live" claim in hero | Actually dynamic? |
|---|---|---|
| noose-and-needle | `Today · Wed 7 May` + 6-artist availability list | NO — hardcoded |
| fable | `OPEN TODAY · UNTIL 5PM` + `8 spaces left` | NO — hardcoded |
| cafe-100 | `CLOSED · BACK AT 8:30` | YES — `getDay()` + `getHours()` |

The rep opens noose-and-needle's demo on Friday 17 May, the owner sees
"Today · Wed 7 May", credibility detonates in three seconds. Visual QA
alone couldn't catch this — the screenshot looks perfect.

The hybrid approach (vision + static-source scan) is the right tool:
the scan is cheap and deterministic (it knows whether the source has
date/time JS), the vision pass knows whether the live-looking phrase
is actually visible in the rendered DOM. Combining them gives a
high-confidence verdict no single channel could produce.

Layer 1's other two new categories address audit findings A3 and A4:
- **Status-as-CTA confusion** (audit A3) — Cult of Coffee's hero has
  no primary CTA at all; only a "CLOSED · BACK TOMORROW 8:30" status
  badge. The previous prompt's "above-the-fold CTA" check could be
  satisfied by ANY visible button-like element; the new wording requires
  the action to be verb-led.
- **CTA hierarchy collapse** (audit A4) — noose-and-needle has the same
  "FIND YOUR ARTIST →" CTA twice (nav + hero body) with identical label
  and styling; fable has three primary-weight CTAs competing. Neither
  was a grade-able dimension before; the new prompt names both as
  warnings.

## Stack

- TypeScript + Node `fs` + Node `child_process` (already in repo).
- No new runtime deps.
- The scan is intentionally crude (presence of any date/time API
  flips `is_dynamic` true for all matches). A precise per-phrase wiring
  check would require AST analysis and is out of scope. Crude mode is
  conservative: false positives (flagging a wired phrase as hardcoded)
  would generate noise, which crude-mode avoids. False negatives (we
  miss a hardcoded phrase because the demo has unrelated date logic
  elsewhere) are rare and recoverable via the vision pass.

## Integrations

- Subprocess spawn of `qa-visual-dynamic.ts` from `qa-visual.ts` and
  from the manual flow's Step 1.5. Same `npx tsx` pattern as the
  existing `qa-visual-render.ts` invocation.
- Reads `outputs/.qa-visual/dynamic-scan.json` written by the scan.
- Layer 1 user message gains an optional "Static-source scan" block.
- No NERVE schema change. The new bug categories are still
  `severity ∈ {critical,warning,info}` so existing `BugFindingSchema`
  validates them unchanged.

## How to verify

1. Type-check + drift-test:
   ```bash
   cd ~/Desktop/klaude-repo
   npx tsc --noEmit --strict apps/nerve/scripts/qa-visual-*.ts
   npm run qa-visual:drift-test
   ```
   Expect zero output from tsc; drift-test reports `OK — all 13 required
   symbols present in both files`.

2. Dynamic scan against the audit's cohort predictions:
   ```bash
   npx tsx apps/nerve/scripts/qa-visual-dynamic.ts \
     ~/Desktop/salespatch-demos/noose-and-needle/outputs/demo.html
   ```
   Expect: `5 live-looking phrase(s); NO date/time JS APIs found,
   phrases are hardcoded — critical credibility risk...`. Five
   `severity_hint: "critical"` candidates: `Today · Wed 7 May`,
   `walk-ins from 12`, `walk-ins from the`, `fully booked`,
   `free from 14:30`.

3. False-positive guard: same script against `cafe-100/outputs/demo.html`.
   Expect: `3 live-looking phrase(s); date/time JS APIs present,
   candidates likely wired...`. All 3 candidates `severity_hint: "info"`.

4. Empty-case guard: `the-bouquet-bar/outputs/demo.html` — expect zero
   candidates, summary `no live-looking content found in the demo source`.

5. Manual-flow validation: invoke the new Layer 1 prompt (per
   `qa-visual-prompts.md`) on the noose-and-needle hero PNG with the
   dynamic-scan injected. Expect a critical bug for the hardcoded
   status block AND a warning for the redundant `FIND YOUR ARTIST →`
   CTA pair — both bugs the spike's Layer 1 prompt missed.

## Known issues

- The "walk-ins from the" candidate on noose-and-needle is a regex
  artefact (the pattern matched a separate body-copy phrase, not an
  actual availability indicator). Doesn't change the verdict — the
  scan is over-eager, not under-eager — but worth noting. Future
  refinement could tighten the regex or post-filter against the
  rendered DOM.
- `is_dynamic` is a single boolean for the entire file, not per-phrase.
  A demo that uses `new Date()` somewhere unrelated would incorrectly
  flip all hardcoded "live-looking" phrases to `severity_hint: "info"`.
  Mitigation: the Layer 1 prompt instructs vision to confirm each
  per-phrase against the rendered screenshot; the crude scan only
  downgrades severity, never upgrades.
- The manual flow's Step 1.5 is a new step; in-session Claude needs to
  remember to run it before reading the PNGs. The skill text now
  documents this explicitly but adherence depends on the model
  following the spec. The SDK runner enforces it programmatically
  (the scan runs before the Layer 1 vision call unconditionally).
- The dynamic-scan output is intentionally NOT part of the canonical
  `VisualQaResult` schema — it's a pipeline-stage intermediate, not a
  warehouse artefact. The Layer 1 `bugs[]` already capture the
  outcome (which live-content phrases got flagged); adding the raw
  scan would duplicate the signal.
