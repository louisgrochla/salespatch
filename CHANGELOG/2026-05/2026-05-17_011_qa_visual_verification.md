# 2026-05-17 — Visual-QA verification report

## What changed
- **New:** `apps/nerve/scripts/qa-visual-VERIFICATION.md` — head-to-head
  report comparing the pre-PR visual-QA spike (PR #93) against the
  shipped system (PRs A–J + #104 hotfix) using the same 14-demo cohort
  the 2026-05-16 audit examined.
- **New (cohort artifacts, not committed — under `~/Desktop/salespatch-demos/`):**
  - `the-bouquet-bar/outputs/qa-visual-result.pre-pr.json` — pre-PR
    result preserved as regression baseline (was the canonical file,
    backed up before re-running).
  - `qa-visual-result.json` × 5 (Bouquet Bar, noose-and-needle,
    the-cult-of-coffee, fable, cafe-100) — new post-PR manual-flow
    results with `producer: "manual_skill"`, all 6 layers populated,
    all schema-valid.
  - `.qa-visual/dynamic-scan.json` × 14 — mechanical dynamic-content
    scans across the full cohort.
  - `.qa-visual/{hero,desktop-hero,full,desktop-full}.png` × 5 +
    `.qa-visual/sections/section-*.png` × 41 — renderer artifacts for
    the 5 named cases.

## Why
The handoff at `handoff.md` flagged the verification report as the
single next concrete task after the 10-PR visual-QA arc shipped. The
goal was to verify *bug by bug* that the new system catches what the
old one missed without losing the one bug the old one already caught.

## Stack
- TypeScript / tsx scripts under `apps/nerve/scripts/`
- Playwright (renderer)
- Zod (schema validation)
- The new BUGS_SYSTEM_PROMPT / VOICE_CONSISTENCY_SYSTEM_PROMPT /
  SECTION_GRADING_SYSTEM_PROMPT etc. shipped across PRs A–J.

## Integrations
- None new. All work happened against existing files plus the
  `~/Desktop/salespatch-demos/` cohort folders (out-of-repo).

## How to verify
Read `apps/nerve/scripts/qa-visual-VERIFICATION.md` end-to-end. The
report's mechanical-checks section lists every command that can be
re-run (drift test, dynamic scans, renderer, schema validation). The
4-condition "did it work?" summary at the top is the high-level read.

## Known issues
- One bonus hardcoded-live demo surfaced (the-tartan-pig, not in the
  original audit cohort) that may want a re-build before being shown.
  Tracked in section 5 of the verification report; not in scope for
  this changelog.
- SDK-runner end-to-end behaviour is not tested in this verification
  — by design, per the trip-wire in the handoff (no API budget,
  dormant runner). Manual flow is the test surface.
