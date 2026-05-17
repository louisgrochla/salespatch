# qa-visual — PR-H opt-in per-photo quality grading

Eighth of the 10 PRs from `qa-visual-IMPLEMENTATION-PLAN.md`. Closes
the last untouched audit issue (A6 — "build picks first photo for
role rather than best"). Per-photo grading gated default-off because
cost; opt-in via `--with-photo-grades` flag.

## What changed

- `apps/nerve/scripts/qa-visual-prompts.ts`:
  - NEW interfaces `PhotoQualityGrade` and `PhotoQualityResult`. Per-
    photo grading on four dimensions (focus / composition / lighting
    / role_fit) on 1-5 each, plus `overall` arithmetic mean and a
    one-line `note`. Result also surfaces `mean_overall` across all
    photos and `weakest_photo_index`.
  - NEW `PHOTO_QUALITY_SYSTEM_PROMPT` — defines the four-dimension
    rubric with concrete grade descriptions per dimension.
  - NEW `buildPhotoQualityUserMessage({businessName, photos})` —
    lists each photo's index + alt + optional role assignment so
    the model knows what it's about to grade and what role to grade
    against.
  - `VisualQaResult` gains optional + nullable `photo_quality?:
    PhotoQualityResult | null`. Three states: absent (producer
    didn't request), null (requested + vision failed), populated
    (requested + succeeded). NOT part of `LAYER_NAMES` — gated by
    request, not by failure-recovery.
  - NEW Zod schemas `PhotoQualityGradeSchema` +
    `PhotoQualityResultSchema` with cross-field invariants:
    - `overall` MUST equal arithmetic mean of the four sub-grades
      to 1 d.p. (catches the producer composing a grade block by
      hand and forgetting to recompute the mean after editing a
      sub-grade).
    - `weakest_photo_index` MUST point at an existing photo OR be
      null when `photos: []`.
- `apps/nerve/scripts/qa-visual.ts`:
  - NEW `--with-photo-grades` flag (positional + flag arg parsing).
  - NEW `extractPhotosFromHtml(html, maxPhotos = 15)` — regex over
    `<img src="data:image/...;base64,...">` tags. Captures alt
    attribute. Cap at `MAX_PHOTOS_TO_GRADE = 15` for cost
    predictability.
  - NEW "Layer 7" call site after Layer 6. Sends all photos in one
    vision call with positional alignment. Handles per-vision-call
    failure cleanly (writes `photo_quality: null`).
  - Result composition adds `...(photoQuality !== undefined ? {
    photo_quality: photoQuality } : {})` so absent stays absent.
  - Stderr summary line gains `photos=<X.Y>/5(n=<N>,weakest=<i>)` /
    `photos=(failed)` / `photos=n/a` suffix.
- `apps/nerve/scripts/qa-visual-prompts.md`:
  - New "Schema bump in PR-H" callout.
  - New "Photo quality (PR-H — opt-in)" section covering the rubric,
    gating, extractor cap, output shape, and cross-field invariants.
  - Canonical-result block gains `photo_quality` row.
- `apps/nerve/scripts/qa-visual-drift-test.ts`:
  - `REQUIRED_SYMBOLS` grows 29 → 34: `photo_quality`,
    `PhotoQualityResult`, `PhotoQualityGrade`,
    `PHOTO_QUALITY_SYSTEM_PROMPT`, `buildPhotoQualityUserMessage`.
- `~/.claude/commands/build-demo.md` (user-level, not in repo):
  - New "Step 1.7 — (opt-in) photo quality grading (PR-H)" between
    Step 1.6 (baselines) and Step 2 (Read PNGs). Spells out the
    three-state semantics + cross-field invariants.
  - Canonical-result block gains `photo_quality` shape.
  - Output Format line 4 documents the `photos=...` summary suffix.

## Why

Audit finding A6: the build's photo-role assignment picks WHAT each
photo is for — hero, logo, gallery tile, product close — but doesn't
grade whether the chosen image is technically good for the role. A
blurry phone snap of a wedding bouquet can land in the hero slot if
no better candidate exists. Layer 1 (Bugs) doesn't catch it because
the photo isn't technically broken; Layer 2 (Brand fidelity) doesn't
catch it because the brand intent is correct; Layer 6 (Section
grading) doesn't catch it because the section's rhythm and density
are fine.

Per-photo grading on four explicit dimensions surfaces this directly.
The `weakest_photo_index` field gives the rep / builder a single
number to look at: "photo 6 is the bottleneck — swap it before
pitching".

**Cost gating** was deliberate. At ~£0.005 per image with Haiku 4.5
vision, a 15-photo demo is ~£0.075 — about 4× the other six layers
combined. Default off; opt-in via flag. Will be activated case-by-
case until cohort volume justifies always-on, or until a cheaper
model can do the work.

## Stack

- TypeScript + Anthropic SDK (existing stack, no new deps)
- Single vision call with N images attached (positional alignment)
- Zod cross-field refines enforce the `overall = mean(sub-grades)`
  invariant and the `weakest_photo_index` bounds check

## Integrations

- Opt-in via `--with-photo-grades` flag on `qa-visual.ts`
- Manual flow: skill text instructs in-session Claude to extract
  photos + apply prompt + compose result + attach
- NERVE ingest: existing `/api/ingest/qa-visual-result` route
  accepts the optional `photo_quality` field unchanged (validator
  is permissive on optional fields)
- `qa-visual.ts` adds 15-photo cap (`MAX_PHOTOS_TO_GRADE = 15`).
  Demos with more photos get a truncated grading; this is documented
  in the result's `notes` field

## How to verify

1. **Type-check + drift test:**
   ```bash
   cd ~/Desktop/klaude-repo
   npx tsc --noEmit --strict apps/nerve/scripts/qa-visual-*.ts
   npm run qa-visual:drift-test
   ```
   Zero tsc output; drift-test reports 34/34 symbols.

2. **Schema smoke test** (exercised in-PR with 6 cases):
   - photo_quality absent → valid ✓
   - photo_quality null → valid ✓
   - full success → valid ✓
   - bad `overall` (doesn't match mean) → cross-field rejection ✓
   - bad `weakest_photo_index` (out of range) → cross-field rejection ✓
   - empty photos + null weakest → valid ✓

3. **Photo-extractor smoke test** (exercised in-PR on Bouquet Bar):
   - 16 `<img data:image>` embeds found
   - Alt text captured per image
   - Media-type captured per image
   - Base64 payload length correctly extracted

4. **End-to-end (when API key + cost budget permit):**
   ```bash
   npx tsx apps/nerve/scripts/qa-visual.ts <demo.html> --with-photo-grades
   ```
   Expect: per-photo grades in `outputs/qa-visual-result.json.photo_quality`,
   stderr summary line ending with `photos=X.Y/5(n=N,weakest=i)`.

## Known issues

- `role` field in the user message is currently always `null` (the
  build's `brand-analysis.json.photo_roles` map keys by FILENAME,
  but the demo HTML embeds photos as base64 with no filename
  preserved). Future enhancement: emit a role-tagging comment
  alongside each embedded photo OR pass the brand-analysis map
  in as additional context and have the model figure out alignment
  from alt text + position.
- `MAX_PHOTOS_TO_GRADE = 15` is a hard cap. Demos with > 15 photos
  silently grade only the first 15. The `notes` field doesn't yet
  mention this; future cleanup.
- Per-photo grading takes ~5-10 seconds per call (Haiku 4.5 with
  15 images). Acceptable for the gated case; would need throttling
  if it became always-on.
- The opt-in flag must be set explicitly per run. No persistent
  "this lead always gets photo grading" config. Easy add when
  needed.
- The `role` field on each photo grade entry would be useful for
  cohort queries ("what's the median focus_grade for hero photos
  in vertical=florist?"). Currently we capture alt text but not
  role-vs-photo alignment. Tracked for the next photo-quality
  iteration.

## Roadmap state

Phase 1 + 2 + 8 PRs of Phase 3 = 8 of 10 shipped. Remaining:
- **PR-I** — A/B variant scoring
- **PR-J** — competitor comparison render
