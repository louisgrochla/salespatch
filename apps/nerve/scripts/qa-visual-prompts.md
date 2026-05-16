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
5. Above-the-fold CTA presence at 375×812
6. Form controls (label-input pairing, clipping, fields off-screen)

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

  "notes": "optional one-line global summary"
}
```

NERVE accepts this exact shape on `/api/ingest/qa-visual-result` regardless of `producer`. The warehouse cannot tell whether a manual or SDK run produced any given row — by design.

## Runtime validation

Both implementations must call `validateVisualQaResult(candidate)` (exported from `qa-visual-prompts.ts`) **before writing** the canonical result file. The Zod-backed validator checks:

- All required fields present with the right primitive types
- Enum fields match the documented literals (`severity ∈ {critical,warning,info}`, `recognition ∈ {high,partial,low}`, `would_buy ∈ {yes,maybe,no}`, `producer ∈ {manual_skill,sdk_runner}`)
- Brand-fidelity dimension grades are integers 1-5; `overall_grade` is a number 1-5
- Cross-field invariants: `bug_count === bugs.length`, `has_critical` iff any bug has severity=critical
- `ran_at` parses as ISO 8601

A schema violation aborts the write with a clear error message naming the offending field. This catches the producer composing a result by hand and forgetting a derived field (the most common drift source observed in early manual runs). The SDK runner (`qa-visual.ts`) exits with code 2 on validation failure; the manual flow surfaces the validator errors in the `/build-demo` chat output and writes nothing until the producer fixes them.

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
