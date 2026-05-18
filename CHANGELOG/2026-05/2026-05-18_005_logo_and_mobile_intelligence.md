# Logo background analysis + mobile text-wrap intelligence

**Date:** 2026-05-18
**Scope:** Two pipeline gaps caught in the lead-1 (Urban Cutz) audit:
(a) Logo source files arrive as JPEGs with white square backgrounds
even when the logo design is circular; the demo's dark hero shows the
white edge unless treated. (b) Hero ticker rows wrap awkwardly at the
mobile viewport because the build's default `gap: 2rem` doesn't switch
to a stacked layout below 420px. Both now flagged at brief decode time
+ at visual-QA time, with a build-side default fix for the ticker case.
**Branch:** `feat/logo-and-mobile-intelligence`
**Base branch:** `main`
**Depends on:** `chore/import-skills-into-repo` (PR #120 — puts skills
in the repo) and `feat/spec-brief-feature-opportunities` (PR #121 — the
`metadata` field extension precedent).

## What changed

### Brief side (capture)

- **Modified** `skills/spec-site-brief/SKILL.md` — Phase 2 "Logo /
  mascot" gains a required `Background analysis` block. Output lands at
  `brand-analysis.json.metadata.logo_background_analysis` with shape:
  `{ has_white_bg, needs_alpha_channel, suggested_treatment, rationale }`.
  `suggested_treatment` is one of `transparent_png | drop_shadow |
  wrapped_container | none`, each with a documented rubric tied to the
  logo's actual shape. Phase 4 schema example updated.

### Build side (consume + default mobile rule)

- **Modified** `.claude/commands/build-demo.md` — Pre-flight gains step
  6a reading `logo_background_analysis.suggested_treatment` and applying
  matching CSS (`wrapped_container` is the Urban-Cutz-style circular
  accent rim; `drop_shadow` is the "looks like a deliberate card"
  treatment; `transparent_png` surfaces as a warn-level operator
  action because CSS can't crop arbitrary shapes; `none` means no
  wrapper). Step 6b (feature inventory, from PR #121) renumbers.
  Mobile-first rule extended: any flex row with 3+ items must include
  `@media (max-width: 420px) { ... flex-direction: column; }` or
  equivalent, so the canonical ticker / ribbon / proof-strip pattern
  stops wrapping awkwardly at 375px by default.

### Visual-QA side (flag the patterns)

- **Modified** `apps/nerve/scripts/qa-visual-prompts.md` — Layer 1
  bug-category list grows to 10. New #9 (`logo_white_bg_on_dark_hero`)
  + new #10 (`text_wraps_awkwardly_at_mobile`) defined with explicit
  severity rubrics.
- **Modified** `apps/nerve/scripts/qa-visual-prompts.ts` — same two
  categories added to `BUGS_SYSTEM_PROMPT`. TS constants stay in sync
  with the .md per the producer-parity contract.

### Remedies side (deferred-or-fix)

- **Modified** `apps/nerve/scripts/qa-visual-remedies.ts`:
  - `BugPattern` enum gains `logo_white_bg_on_dark_hero` and
    `text_wraps_awkwardly_at_mobile`.
  - `inferPattern` adds keyword-based matching for each.
  - `remedyLogoWhiteBgOnDarkHero` returns null (unfixable in
    autofix — brief decode owns the treatment call because CSS can't
    inspect the source file's shape). The bug-flag still surfaces in
    the chat output so the operator knows to source an alpha PNG or
    re-run /spec-site-brief.
  - `remedyTextWrapsAwkwardlyAtMobile` injects an
    `@media (max-width: 420px) { .ticker { flex-direction: column;
    gap: 0.4rem; align-items: flex-start; } }` rule into the demo's
    inline stylesheet when (i) the demo uses a `.ticker` class and
    (ii) the rule isn't already present. Idempotent. Targets the
    canonical pattern only; differently-named rows surface as
    warn-level findings.

## Why

Urban Cutz (lead-1) shipped with both issues:

1. Its FB-export logo was a JPEG with the badge rendered on a white
   square; the dark hero rendered with a visible halo. We got lucky on
   the JPEG crop being tight enough that the issue was minor in
   practice, but the next lead with a wider JPEG-bg crop would have
   shipped a visibly broken hero.
2. The hero's `OPEN SEVEN DAYS · 10-8 EVERY DAY · WALK-INS WELCOME ·
   4.9★ ON BOOKSY ACROSS 516 REVIEWS` ticker wrapped onto four
   staggered lines at 375px because `gap: 2rem` doesn't degrade
   gracefully. The 10th category in Layer 1 makes this visible in
   future audits and the build-side default rule prevents it
   altogether for new demos.

Both issues land in the existing visual-QA Layer 1 (bugs) at warn
level by default — neither is severe enough to hard-gate. The brief
side is where the actual fix lives (logo treatment decided up front);
the autofix is a backstop for the mobile-wrap case where a
class-name-targeted patch is safe.

## Stack

- Markdown + TypeScript prompt updates only. No runtime / library /
  dependency changes.
- TS validation: `cd apps/nerve && npx tsc --noEmit` clean (zero
  errors introduced).

## Integrations

- Inbound: `brand-analysis.json.metadata.logo_background_analysis`
  reaches NERVE via the existing `/api/ingest/brand-analysis` endpoint
  (JSONB metadata, no validator change).
- Outbound: none.

## How to verify

```bash
# Re-link skills:
bash scripts/setup-skills.sh
```

End-to-end on a fresh lead with a white-bg JPEG logo:

1. /spec-site-brief → confirm `brand-analysis.json.metadata.logo_background_analysis`
   is populated. For a circular badge, expect `suggested_treatment:
   "wrapped_container"`.
2. /build-demo → confirm the logo `<img>` is wrapped in a
   `<span class="logo-wrap">` with the accent-coloured circular
   backstop. Open the rendered HTML at 375px — no white square
   visible on the dark hero.
3. Re-run the urban-cutz demo regression: at 375px, the hero ticker
   row should now stack vertically (one item per line) rather than
   wrapping onto staggered rows.
4. Trigger the autofix loop on a demo with a `.ticker` row that's
   wrapping awkwardly — confirm the `@media (max-width: 420px)` rule
   is injected and the next visual-QA pass shows the row stacked.
5. `cd apps/nerve && npx tsc --noEmit` — clean.

## Known issues

- The `wrapped_container` CSS works cleanly for circular badge logos
  but produces a visible "rim" effect that may not suit every brand.
  Operators with a strong opinion on this should pre-source an alpha
  PNG and set `suggested_treatment: "none"` in the brief.
- The mobile-wrap autofix targets the `.ticker` class only. Demos
  emitted with `.ribbon`, `.proof-strip`, `.live-strip`, etc. flag
  warn-level but don't auto-fix. A follow-up could broaden the
  targeting regex, but each broadening risks misfiring on rows that
  WANT to stay horizontal.
- Visual-QA category #9 (logo bg) is keyword-matched in `inferPattern`
  on `\blogo\b` + bg/edge/halo terminology. False-positive matching is
  unlikely but possible if a future finding mentions "logo edge" in a
  different context. Acceptable today.
