# qa-visual — PR-F autofix loop (closed-loop quality on critical bugs)

Sixth of the 10 PRs from `qa-visual-IMPLEMENTATION-PLAN.md`. Turns
visual QA from "report card" into "guardrail". When Layer 1 flags
`severity=critical`, `/build-demo` now attempts a known-good remedy,
re-renders, re-runs QA, and loops up to 3 times before giving up.

## What changed

- `apps/nerve/scripts/qa-visual-remedies.ts` (NEW) — pure-functional
  library mapping bug patterns to known-good HTML fixes. Pattern
  inference via keyword matching on `bug.location + bug.finding`
  (the structured-prose vision output). Each remedy is a
  `(html, bug) => string | null` that returns null when the bug
  can't be auto-fixed safely. Currently registered remedies:
  - `text_over_image_low_contrast` → bumps the hero
    `linear-gradient(180deg, rgba(R,G,B,0.0X) 0%, ...)` top-stop
    opacity to 0.45. The most common Layer 1 failure across the
    cohort (Bouquet Bar's hero ribbon is the canonical example).
  - `live_content_hardcoded` → strips "Today · Wed N May" + "OPEN
    TODAY · UNTIL Hpm" framings, replaces with "This week" /
    "Check the schedule". Addresses the noose-and-needle / fable
    credibility bombs from PR-B.
  - `status_as_cta`, `missing_above_fold_cta`, `redundant_cta_pair`
    → registered but currently unfixable. Inserting / removing
    CTAs requires brief context (the right action depends on the
    diagnosis); defer until a brief-aware autofix arrives. Surface
    as unfixable so the human decides.
- `apps/nerve/scripts/qa-visual-autofix.ts` (NEW) — single-pass
  orchestrator. Reads `qa-visual-result.json`, walks critical bugs,
  applies matching remedies via `applyRemedies()`, writes updated
  `demo.html` back. Returns `AutofixSummary` JSON with
  `bugs_attempted` / `fixes_applied[]` / `unfixable_bugs[]`. Does
  NOT re-render or re-run QA — that's the skill's iteration loop.
- `~/.claude/commands/build-demo.md` (user-level, not in repo) — new
  "Autofix loop (PR-F — runs only if has_critical)" section in the
  Visual-QA pass block. Skill text owns the iteration (max 3),
  logs each iteration to `run.jsonl` with stage="qa-visual-autofix".
  Skill `[ -f $AUTOFIX ]` guard around the loop so it degrades
  cleanly when running from a branch missing the scripts. The
  Hard-gate behaviour section updated to run the autofix loop
  BEFORE surfacing critical bugs to the rep.

## Why

The audit's "Visual QA catches but doesn't fix" gap (proposal 10).
Visual QA was producing accurate critical-bug findings as of PR-B
but the build pipeline had no closed-loop recovery — every critical
bug shipped to the rep as "fix this manually before pitching".

The most common critical bug across the cohort is hero text-over-
image low contrast: it's a single CSS gradient stop tweak. Building
that as a one-line remedy + putting it in a loop means the demo
SHIPS clean instead of shipping flawed-with-a-warning. The rep
walks into the shop with a passing demo, not a failing one + a
caveat.

Conservative scope on first cut: only ship remedies for bugs where
the fix is deterministic and brief-context-free. Status-as-CTA and
missing-CTA both need the brief to know what action to insert ("Book
a chair" / "Tell me what you need" / "Call us") — fixing them
without that context would auto-correct one bug into a worse one.
PR-G or a follow-up brief-aware autofix can extend the library
once cohort baselines exist.

## Stack

- TypeScript, no new runtime deps.
- Pure HTML string transformations (regex-based replacements over
  the build's known CSS / markup patterns). Idempotent: every remedy
  is a no-op when its target is already in the fixed state.
- Iteration loop lives in the skill text (the source of truth for
  pipeline orchestration). Autofix script is a stateless transform.

## Integrations

- Reads `<demo>/outputs/qa-visual-result.json` (canonical
  `VisualQaResult` shape from PR-D).
- Reads + writes `<demo>/outputs/demo.html`. Overwrites in place;
  pre-autofix version is gone (git diff against last commit if you
  need to compare).
- Logs `stage="qa-visual-autofix"` per iteration to
  `<demo>/logs/run.jsonl`.
- Re-render uses `qa-visual-render.ts` (PR-A + PR-C).
- Re-QA uses `qa-visual.ts` (SDK runner — dormant) or the manual
  flow re-applying the six layers per the skill text.
- The `demo-artefact.json` posted to NERVE before the autofix loop
  still references the pre-autofix HTML. Future enhancement: re-
  post a post-autofix artefact so the warehouse sees the as-shipped
  version. Out of scope for PR-F.

## How to verify

1. **Type-check + drift test:**
   ```bash
   cd ~/Desktop/klaude-repo
   npx tsc --noEmit --strict apps/nerve/scripts/qa-visual-*.ts
   npm run qa-visual:drift-test
   ```
   Zero tsc output; drift-test reports 24/24 symbols.

2. **Pattern inference smoke test** (exercised in-PR with 5 cases):
   - hero contrast bug → text_over_image_low_contrast ✓
   - hardcoded today date → live_content_hardcoded ✓
   - status-as-CTA → status_as_cta ✓
   - redundant CTA → redundant_cta_pair ✓
   - totally unrelated bug → unknown ✓

3. **Gradient remedy** (exercised in-PR on Bouquet Bar demo):
   Pre: `linear-gradient(180deg, rgba(42,39,36,0.10) 0%, ...)`
   Post: `linear-gradient(180deg, rgba(42, 39, 36, 0.45) 0%, ...)`
   ✓ Confirmed via grep before + after; demo restored from backup.

4. **Live-content remedy** (exercised in-PR on synthetic markup):
   Pre: `<span>Today · Wed 7 May</span><div>OPEN TODAY · UNTIL 5PM</div>`
   Post: `<span>This week</span><div>Check the schedule</div>`
   ✓ Two replacements in one pass; idempotent.

5. **Idempotency** (exercised in-PR):
   Running gradient remedy on already-fixed CSS → 0 fixes applied,
   1 unfixable (correctly reports the bug as not present rather
   than silently no-op).

## Known issues

- Three of five registered patterns are intentionally unfixable
  (`status_as_cta`, `missing_above_fold_cta`, `redundant_cta_pair`)
  pending brief-aware autofix. They still surface in the autofix
  summary so the rep knows what's left.
- The autofix overwrites `demo.html` in place. No backup. Pre-fix
  version is only recoverable from git history (the file is
  generated, not committed, so practical recovery means re-running
  `/build-demo` from scratch).
- The `demo-artefact.json` posted to NERVE earlier in the build
  flow references the pre-autofix HTML. NERVE's view of the artefact
  is the "as-built" version; the as-shipped version (after autofix)
  exists only locally. Out of scope to re-post.
- Pattern inference is keyword-based, not classified. A vision
  finding worded in an unusual way might miss the regex and fall to
  `unknown`. The fix is to add more regex disjunctions as new
  phrasings surface; the failure mode is conservative (unknown =
  unfixable = surface to human), not destructive.
- The iteration loop is in the skill text rather than the autofix
  script. This means the loop relies on in-session Claude (or the
  SDK runner) actually re-running render + QA between iterations.
  The script could embed the loop and be more self-contained, but
  splitting it keeps the autofix testable as a pure transform.
- Re-render after autofix re-runs ALL six vision-QA layers — costs
  ~£0.02 per iteration when the SDK runner is active. Three
  iterations + the initial run = ~£0.08 worst case. Still trivial
  vs the £350 sale; flagged for autumn budgeting.
