# Visual-QA prompts — single specification

This document describes the visual-QA pass that runs on every built demo.html. It exists in two implementations that must produce **identical output**:

1. **Manual orchestration** (active today) — in-session Claude follows the `/build-demo` skill, applies the prompts in this document by hand, writes `qa-visual-result.json` in the canonical shape.
2. **SDK runner** (`qa-visual.ts`) — dormant on env-var presence; when ANTHROPIC_API_KEY or OPENROUTER_API_KEY arrives, the same SYSTEM_PROMPTs and user-message templates run through the Anthropic SDK without code changes anywhere downstream.

The TypeScript source of truth is `apps/nerve/scripts/qa-visual-prompts.ts`. This `.md` is the human-readable mirror, intended for reviewers and for skill-text reference. **If the two ever drift, the `.ts` wins** (it's what NERVE will see).

## Pipeline

```
demo.html
   │
   ▼
qa-visual-render.ts  ──→  .qa-visual/hero.png  (375×812, above-the-fold)
                          .qa-visual/full.png  (375×wide, fullPage scroll)
   │
   ▼
LAYER 1: Bugs               (no extra context)
LAYER 2: Brand fidelity     (+ brand-analysis.json subset)
LAYER 3: Owner reaction     (+ brief.json: business, diagnosis, test_of_success)
   │
   ▼
qa-visual-result.json  ──→  /api/ingest/qa-visual-result
                            run.jsonl stage="qa-visual"
                            stderr summary surfaced in /build-demo output
```

Both implementations produce one `VisualQaResult` object per demo. The TS interface lives in `qa-visual-prompts.ts`.

## Why three layers

Static QA (the existing `qa-demo.ts` heuristic) covers technical hygiene — landmarks, alt text, em-dashes, banned vocab. It cannot see the rendered page. Visual QA layers everything the static pass can't:

- **Layer 1 (Bugs)** is the only way to catch text-over-image readability failures, tap-target sizes at the actual viewport, above-the-fold CTA absence, and broken-image rendering. Static analysis can't see pixels.
- **Layer 2 (Brand fidelity)** is the only way to verify that the page rendered the brand decode the brief committed to. The brief picked colours, fonts, a positioning reference; the build executed them. Did it land? Static analysis can read the CSS but can't grade whether `Cormorant Garamond` actually conveys "Petalon-style editorial warmth".
- **Layer 3 (Owner reaction)** is the only way to test whether the demo earns the £350 ask. Role-plays the buyer seeing the demo cold for the first time. Surfaces pushbacks the build couldn't predict.

Each layer answers a different question. Combining them into one pass dilutes attention; running them separately keeps each focused.

## Layer 1 — Bugs

**System prompt:** `BUGS_SYSTEM_PROMPT` in `qa-visual-prompts.ts`.

**User message:** `buildBugsUserMessage({ businessName, viewportWidth, viewportHeight })`.

**Inputs:** hero.png + full.png. No additional context.

**Output schema (BugFinding[] + notes):**

```json
{
  "bugs": [
    {
      "severity": "critical|warning|info",
      "location": "hero — top mono ribbon",
      "finding": "Light text over light pink rose petals; contrast ~1.5:1, below WCAG AA."
    }
  ],
  "notes": "Lower hero reads cleanly; the gradient overlay only protects the bottom."
}
```

**Severity rubric:**
- `critical` — UK shop owner would notice in the first 5 seconds. **Hard-gates the build verdict.**
- `warning` — noticeable but the demo can still pitch.
- `info` — minor craft note.

**Bug categories enumerated in the prompt:**
1. Readability (text over images, WCAG AA < 4.5:1 for body / 3:1 for large)
2. Overlap / clipping
3. Tap targets (≥ 36×36 px)
4. Broken images
5. Above-the-fold primary action — must be a verb-led tappable CTA, NOT a status badge ("CLOSED · BACK AT 8:30"). Status-as-CTA confusion = critical.
6. CTA hierarchy — same CTA in nav + hero body = warning (redundancy); three or more primary-weight CTAs in hero = warning (dilution).
7. Live-content honesty — text that looks live (date, status, queue counter) must actually be wired to a date/time JS API. The static-source scan output (see below) tells the model which phrases are hardcoded; mismatch = critical.
8. Form controls (label-input pairing, clipping, fields off-screen)
9. **Logo background on dark hero** — when the logo image is a JPEG with a white or coloured square background and the hero behind it is a contrasting colour (dark on light or vice versa), the JPEG-square shows as a visible rectangular halo around the logo. Flag as **warning** when visible; **critical** when the halo is the most distracting element above the fold.
10. **Mobile text-wrap** — multi-item rows (hero tickers / ribbons / nav rows / social-proof strips) wrapping onto 3+ lines at the mobile viewport because the flex container has `gap: 1.5rem+` with no `flex-direction: column` fall-back at narrow widths. The result reads as broken even when each item individually is legible. Flag as **warning** if it's in the hero or above the fold; **info** if it's lower in the page.

**Static-source scan input.** Before Layer 1 runs, `qa-visual-dynamic.ts` greps the demo's HTML for phrases that look live ("Today · Wed 7 May", "OPEN UNTIL 5PM", "BACK AT 8:30", "walk-ins from 12", "sold out", "8 spaces left", "today's specials") and separately checks whether the demo contains any date/time JS APIs (`new Date`, `.getDay`, `.getHours`, `toLocaleDateString`, `Intl.DateTimeFormat`, etc.). The result lands at `outputs/.qa-visual/dynamic-scan.json` with the `DynamicScanSummary` shape (defined in `qa-visual-prompts.ts`):

```json
{
  "has_date_logic": true,
  "has_time_logic": true,
  "candidates": [
    { "text": "Today · Wed 7 May", "looks_live": true, "is_dynamic": false, "severity_hint": "critical" }
  ],
  "summary": "5 live-looking phrase(s); NO date/time JS APIs found, phrases are hardcoded — critical credibility risk when rep opens demo on a different day"
}
```

`buildBugsUserMessage({ ..., dynamicScan })` injects the candidate list and summary into the user message. The Layer 1 vision pass then judges each visible live-looking phrase against this ground-truth: phrases marked `is_dynamic: false` get flagged critical; phrases marked `is_dynamic: true` get an info-level note that vision should confirm matches the rendered DOM. The dynamic-detection is intentionally crude (presence of ANY date/time API flips `is_dynamic` true for all candidates) — a precise per-phrase wiring check would require AST analysis and is out of scope. The crude check is conservative: false positives (flagging a wired phrase as hardcoded) would generate annoying noise, which crude-mode avoids.

## Layer 2 — Brand fidelity

**System prompt:** `BRAND_FIDELITY_SYSTEM_PROMPT` in `qa-visual-prompts.ts`.

**User message:** `buildBrandFidelityUserMessage({ businessName, brandAnalysis })` — injects the brand decode from `outputs/brand-analysis.json`.

**Inputs:** hero.png + full.png + the brand decode subset (dominant/neutral/accent hex + pct, display/body font, logo_description, positioning_reference, positioning_rationale, asset_notes).

**Output schema (BrandFidelityResult):** Each of the five dimensions is a `BrandDimensionGrade` (1-5 integer + drift_note string) per the TS interface.

```json
{
  "palette":         { "grade": 4, "drift_note": "..." },
  "typography":      { "grade": 5, "drift_note": "..." },
  "logo_placement":  { "grade": 5, "drift_note": "..." },
  "positioning":     { "grade": 4, "drift_note": "..." },
  "brand_signature": { "grade": 3, "drift_note": "..." },
  "overall_grade":   4.2,
  "notes":           "Page reads as the warm-grey editorial the brief committed to."
}
```

**Dimensions:**

| Dimension | What's being graded |
|---|---|
| `palette` | Dominant / neutral / accent hex + ratio match between rendered page and brief commitment |
| `typography` | Display + body fonts loaded as specified; pairing reads as intended editorial feel |
| `logo_placement` | Mark appears where the brief said (hero corner sticker, nav, footer), at intended size/weight |
| `positioning` | Rendered page evokes the brief's named positioning reference vs feeling generic-template |
| `brand_signature` | Physical signatures from `asset_notes` (pink wrap, custom labels, kraft bags) visible in chosen photos |

**Grading rubric (apply consistently across both implementations):**
- `5` — executes the brief faithfully, no drift worth noting
- `4` — mostly faithful, minor drift in framing or proportion
- `3` — noticeable drift but the intent comes through
- `2` — significant drift; rendered page reads differently from brief commitment
- `1` — total failure of execution on this dimension

`overall_grade` = arithmetic mean of the five grades, rounded to one decimal place.

## Layer 3 — Owner reaction

**System prompt:** `OWNER_REACTION_SYSTEM_PROMPT` in `qa-visual-prompts.ts`.

**User message:** `buildOwnerReactionUserMessage({ businessName, businessType, address, ownerName, diagnosis, testOfSuccess })`.

**Inputs:** hero.png + full.png + business identity from `outputs/brief.json` (business_name, business_type, address, owner_name if known, diagnosis, test_of_success).

**Output schema (OwnerReaction):**

```json
{
  "recognition": "high|partial|low",
  "first_reaction": "2-3 sentences in the owner's actual voice",
  "pushbacks": ["thing they'd want changed", "..."],
  "would_buy": "yes|maybe|no",
  "buy_reason": "one line",
  "test_of_success_passes": true,
  "test_of_success_note": "one line on why"
}
```

**Persona instructions baked into the prompt:**
- 35-65, time-poor, proud of business, skeptical of "web agencies"
- has been told "you need a website" for years and ignored it
- responds to specifics about their business and real money
- hates marketing-speak

**Honest, not generous.** Most demos don't earn the £350 ask. Saying yes to a weak one helps nobody — the warehouse needs honest signal so the AI layer can learn which patterns close vs which limp.

**Test of success** — every brief commits to one specific reaction line ("wait, that's my pink wrap" / "how did you know we sell out by lunchtime?"). The owner-reaction prompt receives that line and grades whether the rendered demo plausibly triggers it.

## Layer 4 — Voice consistency (PR-C)

**System prompt:** `VOICE_CONSISTENCY_SYSTEM_PROMPT` in `qa-visual-prompts.ts`.

**User message:** `buildVoiceConsistencyUserMessage({ businessName, voiceQuotes })`.

**Inputs:** hero.png + full.png + the brief's `voice_quotes[]` array (lifted from `outputs/brand-analysis.json` first, then `outputs/brief.json` as fallback).

**Output schema (VoiceConsistencyResult):**

```json
{
  "quotes_preserved": [
    { "quote": "Beautiful flowers for all occasions", "rendered": true, "near_verbatim": true, "location_if_rendered": "hero h1" },
    { "quote": "DM to contact or enquire 🩷", "rendered": false, "near_verbatim": false, "location_if_rendered": null }
  ],
  "voice_drift_phrases": [
    { "rendered": "Welcome to our premier flower experience", "why_off": "generic-template opener; brief said warm + personal, this reads corporate" }
  ],
  "overall_grade": 4,
  "notes": "Most quotes preserved; one minor opener drift in the About section."
}
```

**Two-pass grading:**
1. **Quote preservation** — for each `brief.voice_quotes[]` entry, did the build keep it verbatim or near-verbatim, and where? Verbatim = exact match. Near-verbatim = minor case/punctuation drift but the spirit intact. Missing = build dropped or paraphrased it.
2. **Voice drift detection** — phrases the build INSERTED that contradict the brief's voice. Common culprits: welcome-openers ("Welcome to..."), marketing-mush vocab (transform/elevate/seamless/journey/curated/premium/world-class), generic templates.

**Grading rubric (apply consistently):**
- `5` — every quote preserved + zero drift
- `4` — quotes preserved with minor drift
- `3` — some quotes preserved + some drift
- `2` — most quotes missing or paraphrased + clear drift
- `1` — nothing preserved + page reads like a generic template

## Layer 5 — Customer reaction (PR-C)

**System prompt:** `CUSTOMER_REACTION_SYSTEM_PROMPT` in `qa-visual-prompts.ts`.

**User message:** `buildCustomerReactionUserMessage({ businessName, businessType, address, vertical })`.

**Inputs:** hero.png + full.png + the lead's identity from `outputs/brief.json` (business_name, business_type, address, vertical).

**Output schema (CustomerReaction):**

```json
{
  "first_glance": "Looks like a real local florist, not a template. The hero photo is clearly a real bouquet.",
  "trust_at_glance": "high",
  "would_act": "maybe",
  "first_question": "What's the minimum order and how long does delivery take?",
  "bounce_risks": ["No prices visible anywhere"],
  "notes": "Trust is high; would convert with one visible price or starting-from line."
}
```

**Persona instructions baked into the prompt:**
- UK consumer who landed from a Google search ("[vertical] [neighbourhood]")
- doesn't know this business yet, has competitor options one back-click away
- needs trust signals fast — reviews, real photos, clear contact, quick way to act
- distrusts template-feel
- skim-reads, 5 seconds to decide

**Different signal from Layer 3.** Owner reaction grades "is this me?". Customer reaction grades "should I trust this enough to act?". A demo that lands high on owner reaction can still bounce search-traffic customers because the owner already trusts themselves; the cold customer doesn't.

## Layer 6 — Section grading (PR-C)

**System prompt:** `SECTION_GRADING_SYSTEM_PROMPT` in `qa-visual-prompts.ts`.

**User message:** `buildSectionGradingUserMessage({ businessName, sectionLabels })`.

**Inputs:** per-section slice PNGs (one per `<section>`, `<footer>`, or `<main > div>` with meaningful bounding box) captured by `qa-visual-render.ts` and listed in `render-result.json.sections[]`. The slices are sent in DOM order, one image per section.

**Output schema (SectionGrade[]):**

```json
{
  "section_grades": [
    { "index": 0, "label": "hero", "grade": 5, "note": "Clean rhythm, photo + headline + CTA stack feels intentional" },
    { "index": 1, "label": "enquire", "grade": 4, "note": "Form is well-paced but the heading sits awkwardly close to the field labels" },
    { "index": 5, "label": "how", "grade": 3, "note": "Three-step grid is generic; numbers feel large for the supporting copy" },
    { "index": 8, "label": "footer", "grade": 4, "note": "Dark footer balanced; tagline + logo + links rhythm works" }
  ]
}
```

**Grading rubric (apply consistently):**
- `5` — intentional, well-paced, clearly on-brand
- `4` — solid with minor rhythm/density quibbles
- `3` — functional but unmemorable, reads as competent default
- `2` — noticeably weaker than the rest (awkward whitespace, copy density off, brand drift)
- `1` — broken-feeling section pulling the whole page down

**Why per-section.** Layers 1-3 are hero-biased. Below-the-fold sections get hand-waved by Layer 1's "above-the-fold" framing. Many cohort demos have a strong hero and a weak About / Visit / Footer that nobody scored. Per-section grading surfaces those weak sections so the rep can pre-empt them at the pitch ("the About is a placeholder; we'll fill it in with your story").

**Renderer dependency.** `qa-visual-render.ts` slices `full.png` into per-section PNGs via element-handle screenshots (which auto-scroll). Slices land at `.qa-visual/sections/section-NN-<label>.png`. The label is derived from the element's `id` OR its first `<h2>`/`<h3>` text, sanitised to a-z0-9-. If no recognisable sections exist, the slice list is empty and Layer 6 emits `"section_grades": []` rather than erroring.

## Canonical result file

The full per-demo result, written to `outputs/qa-visual-result.json`:

```json
{
  "qa_visual_id": "<slug>-qa-visual-<iso_no_colons>",
  "artefact_id": "<slug>-demo-<iso_no_colons-from-demo-artefact>",
  "lead_id": "<slug>",
  "demo_path": "/abs/path/to/demo.html",
  "viewport": { "width": 375, "height": 812 },
  "ran_at": "2026-05-16T18:42:00Z",
  "producer": "manual_skill" | "sdk_runner",
  "model": "claude-in-session" | "claude-haiku-4-5-20251001" | ...,

  "bugs": [...],
  "has_critical": false,
  "bug_count": 3,

  "brand_fidelity": {...},

  "owner_reaction": {...},

  "voice_consistency": {...},     // PR-C — Layer 4
  "customer_reaction": {...},     // PR-C — Layer 5
  "section_grades": [...],        // PR-C — Layer 6 (empty array if no sections)

  "baseline_comparison": {...},        // PR-G — cohort-relative grading (optional)
  "photo_quality": {...} | null,       // PR-H — opt-in per-photo grading (optional + nullable)
  "competitor_comparison": {...} | null, // PR-J — opt-in competitor ranking (optional + nullable)

  "notes": "optional one-line global summary"
}
```

NERVE accepts this exact shape on `/api/ingest/qa-visual-result` regardless of `producer`. The warehouse cannot tell whether a manual or SDK run produced any given row — by design.

> **Schema bump in PR-C:** the three new top-level fields (`voice_consistency`, `customer_reaction`, `section_grades`) are REQUIRED. Pre-PR-C `qa-visual-result.json` files (the v1 spike's output) won't validate against the new schema — re-run the visual-QA pass to refresh.

> **Schema bump in PR-D:** every gradable layer field (`bugs`, `brand_fidelity`, `owner_reaction`, `voice_consistency`, `customer_reaction`, `section_grades`) is now **nullable**. `null` means the producer attempted the layer and the vision call failed permanently after retries. The optional `failed_layers[]` array lists every layer name that produced null — its contents MUST match the layer-field nullness exactly (the validator enforces). Downstream queries that aggregate grades should filter `WHERE brand_fidelity IS NOT NULL` (etc.) to exclude failed-run rows from averages.
>
> When the `bugs` layer fails, its derived `has_critical` and `bug_count` MUST also be null. The cross-field invariants only apply when `bugs` is non-null.
>
> The TS const `LAYER_NAMES` (in `qa-visual-prompts.ts`) is the source of truth for what can appear in `failed_layers[]`. Adding a new layer? Add its key to that constant + make the corresponding field nullable + add it to the drift test's required-symbols list.

> **Schema bump in PR-G:** new optional top-level `baseline_comparison` field. Producers fetch the vertical's cohort baseline via `GET /api/read/qa-visual/baselines?vertical=X` at the start of each run, then attach a `BaselineComparison` to the canonical result. The field is OPTIONAL (absent on pre-PR-G producers) but, when present, must conform to `BaselineComparisonSchema`. See "Cohort baselines (PR-G)" below.

> **Schema bump in PR-H:** new opt-in top-level `photo_quality` field. Per-photo grading on focus/composition/lighting/role_fit. Gated default-off (cost: ~£0.075/demo at 15 photos). Field has three states: absent (producer didn't request), null (requested + vision failed), populated (requested + succeeded). NOT part of `failed_layers[]` — gated by request, not by failure-recovery. See "Photo quality (PR-H — opt-in)" below.

> **Schema bump in PR-J:** new opt-in top-level `competitor_comparison` field. Renders top N competitor sites + asks vision to comparatively rank trust-at-glance. Gated on `outputs/competitors.json` being present (captured by the spec-site-brief skill). Same three-state pattern as `photo_quality`. See "Competitor comparison (PR-J — opt-in)" below.

## Runtime validation

Both implementations must call `validateVisualQaResult(candidate)` (exported from `qa-visual-prompts.ts`) **before writing** the canonical result file. The Zod-backed validator checks:

- All required fields present with the right primitive types
- Enum fields match the documented literals (`severity ∈ {critical,warning,info}`, `recognition ∈ {high,partial,low}`, `would_buy ∈ {yes,maybe,no}`, `producer ∈ {manual_skill,sdk_runner}`, `trust_at_glance ∈ {high,medium,low}`, `would_act ∈ {yes,maybe,no}`)
- Brand-fidelity, voice-consistency, and section grades are integers 1-5; brand-fidelity `overall_grade` is a number 1-5
- Cross-field invariants: `bug_count === bugs.length`, `has_critical` iff any bug has severity=critical (only when `bugs` is non-null)
- PR-D: nullness of every gradable layer field matches `failed_layers[]` exactly. A producer that nulls a layer without listing it (silently hides failure) OR lists it without nulling (sends sentinel data labelled as good) is rejected with a clear error.
- `ran_at` parses as ISO 8601

A schema violation aborts the write with a clear error message naming the offending field. This catches the producer composing a result by hand and forgetting a derived field (the most common drift source observed in early manual runs). The SDK runner (`qa-visual.ts`) exits with code 2 on validation failure; the manual flow surfaces the validator errors in the `/build-demo` chat output and writes nothing until the producer fixes them.

## Partial results + retry (PR-D)

The SDK runner (`qa-visual.ts`) wraps each layer's vision call in `withRetry`: one retry-with-backoff for transient failures (network resets, 5xx, 429 rate limits); fail fast on 4xx other than 429. When a layer fails after retries, the runner sets that layer's field to `null`, appends the layer name to `failed_layers[]`, and continues to the next layer. The result file is written with documented partial coverage rather than the runner aborting and losing every other layer's output.

The manual flow (in-session Claude via `/build-demo` skill) doesn't have transient API failures — Claude either produces a layer output or doesn't. The producer-side rule is still the same: a layer that you couldn't produce honestly (e.g. the brief is missing `voice_quotes[]` so Layer 4 has nothing to grade) MUST be nulled + listed in `failed_layers`. Inventing a sentinel grade to pad the field is forbidden; the validator now refuses to write such results.

## Cohort baselines (PR-G)

`baseline_comparison` turns each demo's grades into a cohort-relative reading. Producer fetches `GET /api/read/qa-visual/baselines?vertical=<X>` at the start of a run (read-only, no HMAC). Composes the result via `composeBaselineComparison()` after the layer calls land.

The `BaselineComparison` shape (TS interfaces: `BaselineComparison`, `BaselineDimensionComparison`, `BaselineCohortRates`):

```json
{
  "vertical": "retail",
  "baseline_n": 15,
  "baselines_available": true,
  "dimensions": [
    { "name": "brand_fidelity",      "this_grade": 4.0, "vertical_median": 4.3, "below_baseline": false },
    { "name": "voice_consistency",   "this_grade": 4,   "vertical_median": 4.0, "below_baseline": false },
    { "name": "section_grades_mean", "this_grade": 4.5, "vertical_median": 4.0, "below_baseline": false }
  ],
  "cohort_rates": {
    "has_critical_pct":   12.5,
    "would_buy_yes_pct":  45.0,
    "would_act_yes_pct":  60.0,
    "trust_high_pct":     55.0,
    "test_passes_pct":    70.0
  }
}
```

Drift threshold: `BASELINE_DRIFT_THRESHOLD` (currently 0.5). A dimension's `below_baseline` fires only when `this_grade < vertical_median - 0.5` — single-grade integer gaps are meaningful; floating noise within ±0.5 isn't. When the corresponding layer failed in this demo (Layer 2/4/6 produced null), `this_grade` is null AND `below_baseline` is null — vision-call failure means we don't know, not below baseline.

Below-cohort sample size (n < 10): producer still attaches `baseline_comparison` with `baselines_available: false`, empty `dimensions`, null `cohort_rates`. This lets downstream queries distinguish "no cohort yet for this vertical" from "pre-PR-G producer" (where the field is absent entirely). The Zod validator enforces: `baselines_available: true` REQUIRES `cohort_rates !== null`; `false` REQUIRES empty `dimensions` AND null `cohort_rates`.

Network failure on the baselines pre-fetch: producer treats null response as "no cohort yet" — `baseline_comparison` is still attached, just with `baselines_available: false` and `baseline_n: 0`. Visual-QA run continues uninterrupted; cohort comparison is a nice-to-have, not a blocker.

Owner-reaction (Layer 3) accepts richer persona context when available — Companies House `officers[]` (the spec-site-brief skill's enrichment) gives the model a specific name to be ("You are Sharon, the owner of..."), and `years_trading_int` frames the persona's tenure ("you've been doing this for 9 years — established, known in the neighbourhood"). Both fall through cleanly when absent. The persona richness affects only the role-play voice, not the output schema.

## Photo quality (PR-H — opt-in)

**System prompt:** `PHOTO_QUALITY_SYSTEM_PROMPT` in `qa-visual-prompts.ts`.

**User message:** `buildPhotoQualityUserMessage({ businessName, photos })` — lists each photo's index + alt + optional role assignment so the model knows what it's about to grade.

`photo_quality` grades every `<img data:image>` embedded in the demo on four dimensions: focus / composition / lighting / role_fit (1-5 each), plus an `overall` arithmetic mean and a one-line `note` per photo. Result also surfaces `mean_overall` across the photo set and `weakest_photo_index` so the rep / builder can see at a glance which photo drags the set down.

**Gated default-off.** Per-photo grading is the most expensive layer to run — at ~£0.005 per image with Haiku 4.5 vision, a 15-photo demo runs ~£0.075 vs the ~£0.02 baseline for the other six layers. Producers opt in explicitly:
- **SDK runner:** pass `--with-photo-grades` to `qa-visual.ts`
- **Manual flow:** invoke the photo-quality step from `/build-demo` (see skill text)

**Not part of `LAYER_NAMES`.** Photo quality is gated by request, not by failure-recovery. The `photo_quality` field has three states:
- **absent** — producer didn't request it (never tried). Most common today.
- **null** — producer requested it AND the vision call failed permanently.
- **populated** — producer requested it AND the call succeeded.

`failed_layers[]` does NOT include `photo_quality` even when null. The producer-side schema distinguishes absent/null/populated via Zod's `optional + nullable`.

**Photo extraction.** The SDK runner pulls embedded photos from the demo HTML via regex over `<img src="data:image/...;base64,...">` tags. Default cap is `MAX_PHOTOS_TO_GRADE = 15` (cost predictability). Captures `alt` attribute when present; grades each photo in DOM order. Larger demos get truncated with a note in `result.photo_quality.notes`.

**Output shape (`PhotoQualityResult` + `PhotoQualityGrade`):**

```json
{
  "photo_quality": {
    "photos": [
      {
        "index": 0,
        "alt": "A hand-tied bouquet of sunflower, hot pink roses, peonies...",
        "focus_grade": 5,
        "composition_grade": 4,
        "lighting_grade": 5,
        "role_fit_grade": 5,
        "overall": 4.8,
        "note": "Strong hero — sharp focus, intentional framing, the pink wrap reads instantly"
      },
      {
        "index": 1,
        "alt": null,
        "focus_grade": 3,
        "composition_grade": 3,
        "lighting_grade": 2,
        "role_fit_grade": 3,
        "overall": 2.8,
        "note": "Underlit interior shot; subject hard to read on a phone screen"
      }
    ],
    "mean_overall": 3.8,
    "weakest_photo_index": 1,
    "notes": "Hero is editorial-grade; second photo drags the set down"
  }
}
```

**Cross-field invariants** enforced by Zod:
- `overall` MUST equal the arithmetic mean of the four sub-grades to 1 d.p. (catches the producer composing a grade block by hand and forgetting to recompute the mean after editing a sub-grade).
- `weakest_photo_index` MUST point at an existing photo OR be `null` when `photos: []`.

## Competitor comparison (PR-J — opt-in)

**System prompt:** `COMPETITOR_COMPARE_SYSTEM_PROMPT` in `qa-visual-prompts.ts`.

**User message:** `buildCompetitorCompareUserMessage({ thisDemoName, entries })` — lists every entry (this demo + each competitor) with rendered/failed status so the model knows what to expect among the screenshots.

`competitor_comparison` renders the top N competitor sites for the lead's vertical at the same 375×812 mobile viewport this demo was scored at, then runs a comparative-trust vision call. Output is a ranked list + per-entry rationale + one-line takeaway the rep can quote at the door ("you ranked #2 of 4 — better than Anastasia and Bauers, behind Flower Vogue's editorial polish").

**Opt-in trigger:** activates when `outputs/competitors.json` exists (the spec-site-brief skill captures competitor URLs in Phase 1 verify; this layer activates when that capture happened). When the manifest is absent, the layer is skipped entirely and the field stays absent on the result.

**`competitors.json` shape** (written by spec-site-brief):

```json
{
  "this_demo_name": "The Bouquet Bar",
  "competitors": [
    { "name": "Anastasia Florists", "url": "https://aflorists.com/" },
    { "name": "Flower Vogue",       "url": "https://www.flowervogueaberdeen.co.uk/" }
  ]
}
```

**Failure isolation:** per-URL renders are independently fault-tolerant. A login wall / 4xx / timeout / network error on competitor 3 doesn't break the comparison — that entry lands with `rendered: false` and a `render_failure_reason`, and the vision pass ranks only the successfully-rendered subset. `MAX_COMPETITORS = 5` caps the cohort for cost predictability; `RENDER_TIMEOUT_MS = 15000` caps each render.

**Output shape (`CompetitorCompareResult` + `CompetitorEntry`):**

```json
{
  "competitor_comparison": {
    "entries": [
      { "name": "Flower Vogue",    "url": "https://...", "is_this_demo": false, "rendered": true,  "render_failure_reason": null,      "trust_at_glance": 5, "rank": 1, "why": "Editorial-grade hero, clear pricing, real reviews visible" },
      { "name": "The Bouquet Bar", "url": null,          "is_this_demo": true,  "rendered": true,  "render_failure_reason": null,      "trust_at_glance": 4, "rank": 2, "why": "Strong brand, warm tone, clear enquiry path" },
      { "name": "Anastasia",       "url": "https://...", "is_this_demo": false, "rendered": true,  "render_failure_reason": null,      "trust_at_glance": 3, "rank": 3, "why": "Functional but feels dated" },
      { "name": "Bauers",          "url": "https://...", "is_this_demo": false, "rendered": false, "render_failure_reason": "HTTP 403", "trust_at_glance": null, "rank": null, "why": "Could not load to compare" }
    ],
    "this_demo_rank": 2,
    "ranked_total": 3,
    "takeaway": "Ranked #2 of 3 — beats Anastasia for warmth, loses to Flower Vogue on editorial polish.",
    "notes": "1 of 4 competitors (Bauers) was behind a 403 wall."
  }
}
```

**Cross-field invariants** enforced by Zod:
- Exactly one entry must have `is_this_demo: true`.
- When `rendered: true`, `render_failure_reason` must be null AND `trust_at_glance` + `rank` must be set.
- When `rendered: false`, `render_failure_reason` must be set AND `trust_at_glance` + `rank` must both be null.
- `ranked_total` must equal the count of entries with `rendered: true`.
- `this_demo_rank` must match the rank of the `is_this_demo` entry (or null when that entry failed to render).

**Door-ready takeaway:** the `takeaway` field is the headline the rep can quote. Honest — if this demo ranks last, the takeaway says so. Reps need to know if they're walking in with a weak hand.

## Producer parity contract

Adding a field, changing severity rubrics, changing grade ranges, renaming a layer — any change to the schema or rubric **must** land in `qa-visual-prompts.ts` AND in this `.md` in the same commit. Both implementations consume from those two artefacts. Drift = silent NERVE-warehouse contamination.

When the SDK runner ships, the only difference between the two paths is:

| Concern | Manual | SDK |
|---|---|---|
| Who applies the prompt to the image | In-session Claude via Read | Anthropic SDK vision call |
| Cost per run | £0 (subscription) | ~£0.005 (Haiku) |
| Latency | ~30 sec (Claude reasoning) | ~10 sec (one round-trip per layer) |
| `producer` field in result | `"manual_skill"` | `"sdk_runner"` |
| `model` field in result | `"claude-in-session"` | model id (e.g. `"claude-haiku-4-5-20251001"`) |

Everything else — prompts, output shape, severity rubric, dimensions, NERVE ingest, run.jsonl logging — is identical.
