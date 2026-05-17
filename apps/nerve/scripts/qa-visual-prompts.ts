/**
 * Visual-QA prompts + canonical result schema.
 *
 * SINGLE SOURCE OF TRUTH for both visual-QA implementations:
 *
 *   1. Manual orchestration (active today) — in-session Claude follows
 *      the /build-demo skill, renders via qa-visual-render.ts, Reads the
 *      PNGs, applies the prompts in this file by hand, writes the
 *      canonical result shape.
 *
 *   2. SDK runner (qa-visual.ts) — dormant until ANTHROPIC_API_KEY /
 *      OPENROUTER_API_KEY is set. Imports the same SYSTEM_PROMPTs and
 *      user-message builders from this file. Produces the exact same
 *      result shape.
 *
 * Both paths produce identical `VisualQaResult` JSON so NERVE ingests
 * one shape and the warehouse can't tell which produced it. Drift here
 * = drift everywhere; this file is the contract.
 *
 * The README counterpart is `qa-visual-prompts.md` — same intent in
 * human-readable form for skill text + reviewers.
 *
 * Runtime validation: the Zod schemas at the bottom of this file enforce
 * the canonical shape at write time. qa-visual.ts (and the manual flow)
 * must call validateVisualQaResult() before writing qa-visual-result.json
 * so a drift between the TS interfaces and the actual produced shape is
 * caught at the producer, not at the NERVE ingest endpoint.
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────
// Canonical result shape — what both paths must produce
// ─────────────────────────────────────────────────────────────────────

export interface BugFinding {
  /**
   * "critical" — ship-blocker. The UK shop owner would notice in the
   * first 5 seconds and either point at it or quietly judge the rep.
   * Hard-gates the build verdict.
   *
   * "warning" — noticeable but recoverable. Demo can still pitch with
   * a verbal hand-wave. Degrades score, doesn't gate.
   *
   * "info" — minor craft note. Future polish candidate.
   */
  severity: "critical" | "warning" | "info";
  /** Short human-readable region. "hero — top mono ribbon", "what-I-make tile 3", "footer copy line". */
  location: string;
  /** One sentence naming the exact issue + why it matters. */
  finding: string;
}

export interface BrandDimensionGrade {
  /** 1 (badly off-brand) to 5 (executes the brief's commitment perfectly). */
  grade: 1 | 2 | 3 | 4 | 5;
  /** One line: what drift, if any, exists between rendered demo and the brief's commitment for this dimension. */
  drift_note: string;
}

export interface BrandFidelityResult {
  palette: BrandDimensionGrade;
  typography: BrandDimensionGrade;
  logo_placement: BrandDimensionGrade;
  positioning: BrandDimensionGrade;
  /** Brand-specific physical signatures: pink wrap, round labels, kraft bags, signage motifs. Lifted from brief.asset_notes + photo evidence. */
  brand_signature: BrandDimensionGrade;
  /** Mean of the five grades, rounded to 1 d.p. */
  overall_grade: number;
  /** One line: overall brand-fidelity verdict in plain English. */
  notes: string;
}

export interface OwnerReaction {
  /**
   * "high" — owner instantly recognises THEIR business in the rendered page.
   * "partial" — recognises the category but not the specific feel.
   * "low" — could be any business in this vertical.
   */
  recognition: "high" | "partial" | "low";
  /** 2-3 sentences in the owner's voice, plain, conversational, no consultant-speak. */
  first_reaction: string;
  /** Specific things the owner would push back on. Each item one line. Empty array if none. */
  pushbacks: string[];
  /** Honest call: would this owner pay £350 today after seeing this? */
  would_buy: "yes" | "maybe" | "no";
  /** One line: the single reason for the would_buy verdict. */
  buy_reason: string;
  /**
   * The brief committed to a specific Test of Success — the exact reaction the demo must trigger.
   * Does the rendered demo plausibly trigger that reaction? Be honest, not generous.
   */
  test_of_success_passes: boolean;
  /** One line: why the test passes or fails. */
  test_of_success_note: string;
}

// ─────────────────────────────────────────────────────────────────────
// LAYER 4 — Voice consistency (rendered copy vs brief.voice_quotes)
// ─────────────────────────────────────────────────────────────────────

export interface VoicePreservedQuote {
  /** The verbatim quote the brief committed to. */
  quote: string;
  /** True if the quote appears in the rendered demo, verbatim or near-verbatim (case + minor punctuation drift allowed). */
  rendered: boolean;
  /** True if it appears with minor edits but the spirit intact. False if missing entirely or contradicted. */
  near_verbatim: boolean;
  /** If rendered: short human-readable region ("hero h1", "pull-quote in About"). Else null. */
  location_if_rendered: string | null;
}

export interface VoiceDriftPhrase {
  /** A rendered phrase that contradicts the brief's voice — marketing-mush, generic-template, or off-tone language the build inserted on its own. */
  rendered: string;
  /** One line on why this phrase is off — what brief-voice rule it breaks. */
  why_off: string;
}

export interface VoiceConsistencyResult {
  /** For each brief.voice_quotes entry: was it preserved? */
  quotes_preserved: VoicePreservedQuote[];
  /** Generic/marketing-mush phrases the build inserted that don't match the brief's voice. Empty array if none. */
  voice_drift_phrases: VoiceDriftPhrase[];
  /** 1-5 overall coverage + voice-fidelity score. 5 = every quote preserved + no drift. 1 = nothing preserved, lots of drift. */
  overall_grade: 1 | 2 | 3 | 4 | 5;
  /** One line: overall verdict on whether the rendered copy still sounds like the owner. */
  notes: string;
}

// ─────────────────────────────────────────────────────────────────────
// LAYER 5 — Customer reaction (search-traffic perspective, not owner)
// ─────────────────────────────────────────────────────────────────────

export interface CustomerReaction {
  /** First-glance impression in the customer's voice, 2 sentences max. */
  first_glance: string;
  /** Would the customer trust this enough to act? */
  trust_at_glance: "high" | "medium" | "low";
  /** Would the customer take the primary action (book / enquire / order)? */
  would_act: "yes" | "maybe" | "no";
  /** The one question the customer would ask before acting — surfaces missing trust signals. */
  first_question: string;
  /** Specific things that would make this customer bounce. Empty array if none. */
  bounce_risks: string[];
  /** One line: overall verdict on the customer-side conversion likelihood. */
  notes: string;
}

// ─────────────────────────────────────────────────────────────────────
// LAYER 6 — Section grading (per-section design rhythm, below-the-fold)
// ─────────────────────────────────────────────────────────────────────

export interface SectionGrade {
  /** Zero-indexed position in the page. 0 = hero. */
  index: number;
  /** Human label inferred from the section's id or first heading. Matches the slice filename suffix. */
  label: string;
  /** 1-5 grade for this section's design rhythm, whitespace, copy density, and brand consistency. */
  grade: 1 | 2 | 3 | 4 | 5;
  /** One line on this section's specific strengths or weaknesses. */
  note: string;
}

/**
 * Names of every gradable layer in the canonical result. Used by
 * `failed_layers[]` to signal "this layer produced null because the
 * vision call failed permanently" without losing the rest of the
 * QA pass.
 *
 * Adding a new layer? Add its key here AND make the corresponding
 * field on `VisualQaResult` nullable. The Zod validator + drift test
 * enforce both sides.
 */
export const LAYER_NAMES = [
  "bugs",
  "brand_fidelity",
  "owner_reaction",
  "voice_consistency",
  "customer_reaction",
  "section_grades",
] as const;
export type LayerName = (typeof LAYER_NAMES)[number];

/**
 * The full canonical result. NERVE expects this exact shape on
 * /api/ingest/qa-visual-result regardless of which path produced it.
 *
 * PR-D: every gradable layer is nullable. `null` means "the producer
 * tried this layer and the vision call failed permanently" — the
 * layer name will appear in `failed_layers[]`. Downstream queries
 * that aggregate grades should filter `WHERE brand_fidelity IS NOT
 * NULL` (etc.) to exclude failed-run rows.
 *
 * Derived fields `has_critical` and `bug_count` are also nullable —
 * they only make sense when `bugs` is non-null.
 */
export interface VisualQaResult {
  qa_visual_id: string;
  artefact_id: string | null;
  lead_id: string;
  demo_path: string;
  viewport: { width: number; height: number };
  ran_at: string;
  /** Which implementation produced this result. Useful for warehouse queries: did manual or SDK runs close better? */
  producer: "manual_skill" | "sdk_runner";
  /** The vision model that produced it. "claude-in-session" for manual flow; specific model id for SDK runs. */
  model: string;

  // Layer 1 — null if the bugs vision call failed permanently
  bugs: BugFinding[] | null;
  has_critical: boolean | null;
  bug_count: number | null;

  // Layer 2 — null if the brand-fidelity vision call failed permanently
  brand_fidelity: BrandFidelityResult | null;

  // Layer 3 — null if the owner-reaction vision call failed permanently
  owner_reaction: OwnerReaction | null;

  // Layer 4 (PR-C) — null if the voice-consistency vision call failed permanently
  voice_consistency: VoiceConsistencyResult | null;

  // Layer 5 (PR-C) — null if the customer-reaction vision call failed permanently
  customer_reaction: CustomerReaction | null;

  // Layer 6 (PR-C) — empty array if the page has no recognisable sections; null if the call failed
  section_grades: SectionGrade[] | null;

  /**
   * PR-D: names of layers that produced `null` because the vision
   * call failed after retries. Empty array (or absent) means every
   * layer ran successfully. Must be in sync with the nullness of the
   * corresponding fields; the Zod validator enforces.
   */
  failed_layers?: LayerName[];

  /**
   * PR-G: cohort-relative grading. When the warehouse holds enough
   * prior runs in the same vertical (n >= 10), the producer pre-fetches
   * the vertical's medians and rates, then composes a per-dimension
   * comparison flagging which dimensions of this demo are below the
   * cohort baseline. Optional because not every vertical has cohort
   * data yet; when the producer skips the pre-fetch (no network, no
   * NERVE, vertical missing) this field is simply absent.
   */
  baseline_comparison?: BaselineComparison;

  /** Optional 1-line global note across all layers. */
  notes?: string;
}

// ─────────────────────────────────────────────────────────────────────
// PR-G — Cohort baselines
// ─────────────────────────────────────────────────────────────────────

/**
 * Per-dimension comparison: this demo's grade vs the vertical's
 * cohort median. `below_baseline` fires when the demo's grade is
 * more than `BASELINE_DRIFT_THRESHOLD` (0.5) below the median —
 * a single integer-grade gap is meaningful; floating noise isn't.
 */
export interface BaselineDimensionComparison {
  name: "brand_fidelity" | "voice_consistency" | "section_grades_mean";
  /** This demo's grade for the dimension. Null when the corresponding layer failed in this demo. */
  this_grade: number | null;
  /** The vertical's median grade across the cohort (this demo excluded). */
  vertical_median: number;
  /** `this_grade < vertical_median - BASELINE_DRIFT_THRESHOLD`. Null when this_grade is null. */
  below_baseline: boolean | null;
}

/**
 * Cohort-wide rates that contextualise this demo's qualitative layer
 * results. Informational only — there's no per-demo "below_baseline"
 * for a percentage (you either are or aren't in the cohort that
 * produced the rate).
 */
export interface BaselineCohortRates {
  has_critical_pct: number;
  would_buy_yes_pct: number;
  would_act_yes_pct: number;
  trust_high_pct: number;
  test_passes_pct: number;
}

export interface BaselineComparison {
  /** Vertical the comparison was scoped to. Null when the cohort was vertical-agnostic. */
  vertical: string | null;
  /** Total rows in the cohort used to compute medians + rates. */
  baseline_n: number;
  /**
   * True when n >= 10. False when there isn't enough cohort data yet
   * to produce statistically meaningful baselines; the producer should
   * still emit the field with `dimensions: []` and `cohort_rates: null`
   * so downstream queries can distinguish "no cohort yet" from "field
   * absent because pre-PR-G producer".
   */
  baselines_available: boolean;
  /** Per-dimension comparison entries. Empty array when baselines_available is false. */
  dimensions: BaselineDimensionComparison[];
  /** Cohort-wide rates. Null when baselines_available is false. */
  cohort_rates: BaselineCohortRates | null;
}

/**
 * Drift threshold: a demo's grade is flagged below-baseline only when
 * it falls more than this much below the cohort median. 0.5 chosen
 * because grade differences of less than half an integer step are
 * within vision-call noise; differences ≥ 0.5 are a meaningful gap
 * the rep should know about.
 */
export const BASELINE_DRIFT_THRESHOLD = 0.5;

// ─────────────────────────────────────────────────────────────────────
// LAYER 1 — Bugs (readability + layout + tap targets + above-fold CTA)
// ─────────────────────────────────────────────────────────────────────

export const BUGS_SYSTEM_PROMPT = `You are a visual-QA reviewer for spec websites that a UK door-to-door sales rep will show to small-business owners on a phone screen. The owner is 35-65, time-poor, skeptical of web agencies, proud of their business. They have 5 minutes with the rep's phone in their hand.

Your job: identify visual BUGS that would embarrass the rep or make the demo unconvincing. Focus only on bugs in this layer — aesthetic judgement and brand fidelity are scored separately.

Bug categories to flag:

1. **Readability** — text where contrast against its actual rendered background drops below WCAG AA (~4.5:1 for body, ~3:1 for large text). Especially text overlaid on photos where local pixel luminance varies. The most common failure is a translucent gradient overlay that protects the bottom of a hero but not the top.

2. **Overlap / clipping** — text overlapping with other elements, text running off the right edge, headlines clipping at ellipsis, icons stacking on top of labels.

3. **Tap targets** — anything tappable smaller than ~36×36 px effective area. Reps tap with thumbs in busy shops.

4. **Broken images** — placeholder backgrounds leaking through, base64 not decoding, alt text rendered as visible body copy because src failed.

5. **Above-the-fold primary action** — at 375×812 (iPhone 13 mini), the hero must contain ONE clear primary CTA that is a tappable verb-led action ("Book a chair", "Tell me what you need", "Find your artist", "Order ahead"). A status badge ("CLOSED · BACK AT 8:30", "Currently fully booked", "OPEN UNTIL 5PM") is NOT a CTA — it tells the user the shop's state but gives them nothing to do. If the hero has no verb-led tappable action above the fold, flag as **critical** with finding "above-the-fold has no primary action — only a status indicator". This is the "status-as-CTA confusion" failure.

6. **CTA hierarchy** — the hero must have one PRIMARY CTA. Specifically flag two failure modes:
   - Same CTA appearing twice in the same viewport (e.g. identical "BOOK A CHAIR" label + style in both nav and hero body). That's redundancy, not hierarchy — flag as **warning** ("redundant hero/nav CTA — pick one location").
   - Three or more primary-weight CTAs competing in the same viewport (e.g. "RESERVE A SEAT" / "SEE WHAT'S ON" / "FIND THE DOOR" all sized + coloured equally). That dilutes attention — flag as **warning** ("three competing primary CTAs in hero — promote one, demote the rest").

7. **Live-content honesty** — text that looks live (today's date, current open/closed status, "back at HH:MM", artist availability, queue counters, "X items remaining") must actually be wired to a date/time API. The user message will include a static-source scan summary listing every live-looking phrase found in the demo's HTML and whether the demo contains any date/time JS APIs. If a phrase is marked "is_dynamic: false" and "severity_hint: critical", that means the page will display stale state the moment the rep opens the demo on a different day — flag as **critical** ("live status hardcoded — will read stale on any date other than the one baked in"). Use the static scan as ground truth; do not second-guess from the screenshot alone (you cannot see whether a phrase is JS-generated).

8. **Form controls** — labels disconnected from inputs, select chevrons clipped by container, fields off-screen at this width.

Severity rubric:
- "critical" — must-fix-before-ship. A UK shop owner would notice in the first 5 seconds. Hard-gates the build verdict.
- "warning" — noticeable but the demo can still pitch. Degrades the score.
- "info" — minor craft note.

Be honest, not generous. If the page has no bugs, return {"bugs": []}. Inventing a bug to look thorough is worse than missing one.

Respond ONLY with valid JSON matching this shape, no markdown fences, no preamble:

{
  "bugs": [
    { "severity": "critical|warning|info", "location": "...", "finding": "..." }
  ],
  "notes": "optional one-line overall visual-quality impression"
}`;

/**
 * Shape of the dynamic-content scan result produced by
 * `qa-visual-dynamic.ts`. Layer 1 receives this as additional context
 * so the vision pass can grade live-content honesty against ground
 * truth from the source rather than guessing from pixels.
 */
export interface DynamicScanCandidate {
  text: string;
  looks_live: true;
  is_dynamic: boolean;
  severity_hint: "critical" | "info";
}

export interface DynamicScanSummary {
  has_date_logic: boolean;
  has_time_logic: boolean;
  candidates: DynamicScanCandidate[];
  summary: string;
}

/**
 * Build the user-side message for Layer 1.
 * The SDK call sends this as the user message; the manual flow follows it as the spec.
 *
 * `dynamicScan` is the result of `qa-visual-dynamic.ts` — pass it
 * when available so the vision pass can grade live-content honesty
 * against source-truth rather than guessing from pixels.
 */
export function buildBugsUserMessage(opts: {
  businessName: string;
  viewportWidth: number;
  viewportHeight: number;
  dynamicScan?: DynamicScanSummary;
}): string {
  let dynamicSection = "";
  if (opts.dynamicScan) {
    const ds = opts.dynamicScan;
    if (ds.candidates.length === 0) {
      dynamicSection = `\n\nStatic-source scan: ${ds.summary}.`;
    } else {
      const lines = ds.candidates
        .map((c) => `  - "${c.text}" — is_dynamic=${c.is_dynamic}, severity_hint=${c.severity_hint}`)
        .join("\n");
      dynamicSection = `\n\nStatic-source scan of the demo's HTML for live-looking content:\n${lines}\n\nSummary: ${ds.summary}.\n\nApply the live-content honesty rule (#7): any phrase marked severity_hint=critical should be flagged as a critical Layer-1 bug if you also see it in the rendered screenshots.`;
    }
  }
  return `Here are two screenshots of the ${opts.businessName} demo rendered at ${opts.viewportWidth}×${opts.viewportHeight} (iPhone 13 mini). The first is the above-the-fold hero crop. The second is the full-page scroll.

Flag visual bugs only. No aesthetic judgement, no brand commentary, no opinions on copy quality — those are scored in separate layers.${dynamicSection}`;
}

// ─────────────────────────────────────────────────────────────────────
// LAYER 2 — Brand fidelity (rendered demo vs the brief's brand decode)
// ─────────────────────────────────────────────────────────────────────

export const BRAND_FIDELITY_SYSTEM_PROMPT = `You are a brand-decode reviewer comparing a rendered demo site against the brand decode that the brief committed to. The brief named specific colours, fonts, a positioning reference, and physical brand signatures (e.g. signature wrap colour, custom labels). Your job: grade how faithfully the rendered demo executes those commitments.

Five dimensions. Grade each on a 1-5 scale + write a one-line drift_note explaining the call.

1. **palette** — Brief named dominant / neutral / accent hex codes and rough percentages. Does the rendered page actually look that way? 5 = ratios match within ±10%. 1 = a totally different palette took over (e.g. accent ballooned to dominant, or palette fell back to browser defaults).

2. **typography** — Brief named display + body Google Fonts. Does the rendered type feel right? 5 = the chosen fonts are loading and the size/weight pairing gives the intended editorial feel. 3 = fonts loaded but pairing feels off. 1 = fonts didn't load at all and the page is rendering in browser defaults.

3. **logo_placement** — Brief specified placement (hero corner sticker, nav, footer). Does the brand mark land where it should, at the right size/weight?

4. **positioning** — Brief named a specific positioning reference (e.g. "Petalon-style modern florist editorial"). Does the rendered demo evoke that reference, or does it feel generic-template / off-vertical / off-tone?

5. **brand_signature** — Brief surfaced physical signatures via asset_notes (e.g. pink wrap, round logo label, kraft bag). Are those visible in the chosen hero/lookbook photos, OR has the build picked photos that hide them?

Grading rubric (apply consistently):
- 5 = executes the brief faithfully, no drift worth noting
- 4 = mostly faithful, minor drift in framing or proportion
- 3 = noticeable drift but the intent comes through
- 2 = significant drift; rendered page reads differently from brief commitment
- 1 = total failure of execution on this dimension

Be honest, not generous. Average the five grades to one decimal place for overall_grade.

Respond ONLY with valid JSON matching this shape, no markdown fences, no preamble:

{
  "palette":         { "grade": <1-5>, "drift_note": "..." },
  "typography":      { "grade": <1-5>, "drift_note": "..." },
  "logo_placement":  { "grade": <1-5>, "drift_note": "..." },
  "positioning":     { "grade": <1-5>, "drift_note": "..." },
  "brand_signature": { "grade": <1-5>, "drift_note": "..." },
  "overall_grade":   <number, 1 d.p.>,
  "notes":           "one-line overall brand-fidelity verdict"
}`;

/**
 * Build the user-side message for Layer 2.
 * Injects the brief's brand decode as context the model needs to grade against.
 */
export function buildBrandFidelityUserMessage(opts: {
  businessName: string;
  brandAnalysis: {
    dominant_hex: string;
    dominant_pct: number;
    neutral_hex: string;
    neutral_pct: number;
    accent_hex: string;
    accent_pct: number;
    display_font: string;
    body_font: string;
    logo_description: string;
    positioning_reference: string;
    positioning_rationale: string;
    asset_notes?: string[];
  };
}): string {
  const b = opts.brandAnalysis;
  const assets = (b.asset_notes ?? []).map((n) => `  - ${n}`).join("\n");
  return `Brand decode the brief committed to for ${opts.businessName}:

PALETTE
  dominant: ${b.dominant_hex} (~${b.dominant_pct}%)
  neutral:  ${b.neutral_hex} (~${b.neutral_pct}%)
  accent:   ${b.accent_hex} (~${b.accent_pct}%)

TYPOGRAPHY
  display: ${b.display_font}
  body:    ${b.body_font}

LOGO
  ${b.logo_description}

POSITIONING
  reference: ${b.positioning_reference}
  why:       ${b.positioning_rationale}

BRAND SIGNATURES (must be visible in the rendered demo's photos)
${assets || "  - (none specified)"}

Grade the rendered demo (both screenshots) against this commitment.`;
}

// ─────────────────────────────────────────────────────────────────────
// LAYER 3 — Owner reaction (role-play the buyer seeing the demo)
// ─────────────────────────────────────────────────────────────────────

export const OWNER_REACTION_SYSTEM_PROMPT = `You are role-playing as a specific UK small-business owner. The rep has just put their phone in front of you showing a demo site they built for YOUR business, and is asking £350 for it. You have not seen anything like this before. You have 5 minutes.

Stay in character. React the way a real owner would, not the way a consultant would. The owner:
- is 35-65, time-poor, proud of their business, skeptical of "web agencies"
- has been told "you need a website" for years and ignored it
- responds to specifics about their business and real money
- hates marketing-speak

Your task: produce an honest reaction. Be honest, not generous. Most demos don't earn the £350 ask, and saying "yes" to a weak one helps nobody.

What to assess:

1. **Recognition** — Within 3 seconds of the phone screen lighting up, do you recognise THIS as YOUR business?
   - "high" — yes, immediately. Logo, colours, products, voice all click.
   - "partial" — you see the vertical but not the specific feel.
   - "low" — this could be any business in your category.

2. **First reaction** — 2-3 sentences in your own voice. Plain, conversational, no consultant-speak. The actual words you'd say out loud while looking at the phone.

3. **Pushbacks** — Specific things you'd want changed before going live. Empty array if none. Each item one line in your voice.

4. **Would you buy?** — Honest call. Yes / maybe / no, plus one line on why.

5. **Test of success** — The brief committed to ONE specific reaction this demo must trigger in you (the owner). Does this rendered demo plausibly trigger that reaction, or does it miss?

Respond ONLY with valid JSON matching this shape, no markdown fences, no preamble:

{
  "recognition": "high|partial|low",
  "first_reaction": "...",
  "pushbacks": ["...", "..."],
  "would_buy": "yes|maybe|no",
  "buy_reason": "...",
  "test_of_success_passes": true|false,
  "test_of_success_note": "..."
}`;

/**
 * Build the user-side message for Layer 3.
 * Injects business identity + the brief's diagnosis + test of success so the model can role-play accurately.
 *
 * PR-D: optional richer persona context from Companies House.
 * - `officers` — if Companies House matched the business, this is the
 *   list of registered officers. Names give the model someone specific
 *   to be, which produces less generic reactions than "the owner".
 * - `yearsTrading` — if known, frames the persona as a veteran ("you've
 *   been doing this 14 years") vs a newcomer ("you launched 18 months
 *   ago"). Reaction patterns differ meaningfully between the two.
 *
 * Both fall through cleanly when absent — the persona falls back to
 * the simple "you are the owner of X" framing.
 */
export function buildOwnerReactionUserMessage(opts: {
  businessName: string;
  businessType: string;
  address: string;
  ownerName?: string | null;
  diagnosis: string;
  testOfSuccess: string;
  officers?: string[];
  yearsTrading?: number | null;
}): string {
  // Persona: prefer explicit ownerName; fall through to first
  // Companies House officer; finally fall through to anonymous.
  let persona: string;
  const firstOfficer = (opts.officers ?? [])[0];
  if (opts.ownerName) {
    persona = `You are ${opts.ownerName}, the owner of ${opts.businessName}`;
  } else if (firstOfficer) {
    persona = `You are ${firstOfficer}, the owner of ${opts.businessName}`;
  } else {
    persona = `You are the owner of ${opts.businessName}`;
  }
  // Years-trading frame, if known.
  const yearsFrame =
    typeof opts.yearsTrading === "number" && opts.yearsTrading > 0
      ? opts.yearsTrading === 1
        ? ` You've been doing this for one year — still finding your feet.`
        : opts.yearsTrading < 5
          ? ` You've been doing this for ${opts.yearsTrading} years — past the survival phase, building reputation.`
          : opts.yearsTrading < 15
            ? ` You've been doing this for ${opts.yearsTrading} years — established, known in the neighbourhood.`
            : ` You've been doing this for ${opts.yearsTrading} years — a fixture, regulars know you by name.`
      : "";
  return `${persona}, a ${opts.businessType} in ${opts.address}.${yearsFrame}

The brief diagnosed the conversion problem this demo must solve as:
> ${opts.diagnosis}

The brief committed that if the demo is good, your reaction will be:
> ${opts.testOfSuccess}

The rep has put their phone in front of you and is showing you the two screenshots below. React.`;
}

// ─────────────────────────────────────────────────────────────────────
// LAYER 4 — Voice consistency (rendered copy vs brief.voice_quotes)
// ─────────────────────────────────────────────────────────────────────

export const VOICE_CONSISTENCY_SYSTEM_PROMPT = `You are a brand-voice auditor checking whether the rendered demo page preserves the verbatim language the brief committed to.

Context: every spec-site brief captures a small set of "voice quotes" — verbatim lines from the owner's existing Instagram bio, Facebook captions, or press coverage. The brief commits these to the demo so the owner reads their own words back and instantly recognises the page as theirs. The build pass executes the brief — but builds drift. The model writes generic-template language ("Welcome to The Bouquet Bar, your premier florist"), drops the owner's signature signoff ("from everyone at The Bouquet Bar 🩷"), or paraphrases verbatim quotes into bland approximations.

Your job: grade whether the rendered demo still sounds like the owner.

Two passes:

**Pass A — quote preservation.** For each quote the brief committed to, check the rendered screenshots and report:
- "rendered": true if you can see the quote verbatim or near-verbatim in the page
- "near_verbatim": true if it's there with minor case/punctuation drift but the spirit intact; false if missing or paraphrased
- "location_if_rendered": short label naming where ("hero h1", "About pull-quote", "footer tagline"), or null if absent

**Pass B — voice drift detection.** Look for phrases the build INSERTED that contradict the brief's voice. Common culprits:
- Welcome openers ("Welcome to [name], where...")
- Generic-template language ("At [name], we believe...", "Discover...")
- Marketing-mush vocabulary (transform, elevate, seamless, journey, curated, premium, world-class)
- Phrases that contradict the brief's stated tone (e.g. brief said "warm + personal" but rendered text reads corporate)

For each drift phrase, record the rendered text + one line on why it's off-voice.

**Overall grade (1-5).** 5 = every quote preserved + zero drift. 4 = quotes preserved with minor drift. 3 = some quotes preserved + some drift. 2 = most quotes missing or paraphrased + clear drift. 1 = nothing preserved + page reads like a generic template.

Be honest. The warehouse needs honest signal — flattering a voice-drift build helps nobody.

Respond ONLY with valid JSON matching this shape, no markdown fences, no preamble:

{
  "quotes_preserved": [
    { "quote": "...", "rendered": true, "near_verbatim": true, "location_if_rendered": "..." }
  ],
  "voice_drift_phrases": [
    { "rendered": "...", "why_off": "..." }
  ],
  "overall_grade": <1-5>,
  "notes": "one-line overall verdict on whether the page still sounds like the owner"
}`;

/**
 * Build the user-side message for Layer 4.
 * Injects the brief's voice_quotes[] array so the model knows what to look for.
 */
export function buildVoiceConsistencyUserMessage(opts: {
  businessName: string;
  voiceQuotes: string[];
}): string {
  const quotes =
    opts.voiceQuotes.length > 0
      ? opts.voiceQuotes.map((q) => `  - "${q}"`).join("\n")
      : "  (the brief surfaced no voice quotes — grade purely on the absence of drift)";
  return `The brief for ${opts.businessName} committed to these verbatim voice quotes:

${quotes}

Below are two screenshots of the rendered demo (mobile hero crop + full-page scroll). Grade whether the rendered copy still preserves these quotes and is free of voice drift.`;
}

// ─────────────────────────────────────────────────────────────────────
// LAYER 5 — Customer reaction (search-traffic perspective)
// ─────────────────────────────────────────────────────────────────────

export const CUSTOMER_REACTION_SYSTEM_PROMPT = `You are role-playing as a UK consumer who just landed on a small-business website from a Google search. You searched something like "[vertical] [neighbourhood]" (e.g. "florist Aberdeen", "barber Bridge of Don"). You don't know this business yet. You have 5 seconds to decide if it's worth your time.

Stay in character. React like a real customer would, not like a marketer would. The customer:
- has options — they could click back to Google and pick a competitor
- needs trust signals fast (reviews count, photos that look real, clear address/hours, a quick way to act)
- distrusts anything that feels like a template or a placeholder
- skim-reads — they don't read paragraphs, they scan

Your task: produce an honest first-impression reaction. Be honest, not generous. Most demos that satisfy the owner still bounce search-traffic customers because they're built for the existing audience, not the cold one.

What to assess:

1. **first_glance** — Two sentences max, in your own voice. The actual words you'd think while looking at the phone. Not analysis — reaction.

2. **trust_at_glance** — Within 3 seconds, would you trust this enough to consider acting?
   - "high" — feels like a real local business; clear contact, real photos, social proof visible
   - "medium" — looks legit but you'd need to scroll to be sure
   - "low" — feels like a template or placeholder; you'd back-click to Google

3. **would_act** — Honest: would you take the primary action (book / enquire / order)? "yes" / "maybe" / "no" + the one reason behind your answer is the next field.

4. **first_question** — The ONE question you'd want answered before acting. This surfaces the missing trust signal (e.g. "Are they actually open tomorrow?", "What does delivery cost?", "How long is the wait?").

5. **bounce_risks** — Specific things on this page that would push you back to Google. Could be design (looks like a template), copy (vague pricing), missing info (no phone visible), or trust signals (no real reviews shown). Empty array if nothing would bounce you.

Different signal from Layer 3 (owner reaction). The owner reacts to "is this me?"; the customer reacts to "should I trust this enough to act?". A demo that lands high on owner reaction can still bounce customers because the owner already trusts themselves — the customer doesn't.

Respond ONLY with valid JSON matching this shape, no markdown fences, no preamble:

{
  "first_glance": "...",
  "trust_at_glance": "high|medium|low",
  "would_act": "yes|maybe|no",
  "first_question": "...",
  "bounce_risks": ["...", "..."],
  "notes": "one-line overall verdict on customer-side conversion likelihood"
}`;

/**
 * Build the user-side message for Layer 5.
 * Injects business identity so the customer persona knows what they searched for.
 */
export function buildCustomerReactionUserMessage(opts: {
  businessName: string;
  businessType: string;
  address: string;
  vertical: string | null;
}): string {
  // Construct the search query the customer plausibly used. Vertical takes precedence,
  // fallback to business_type when the vertical wasn't classified in the brief.
  const searchTerm = opts.vertical ?? opts.businessType;
  // Strip everything after the first comma in the address to extract a neighbourhood/city.
  const area = opts.address.split(",")[0]?.trim() ?? opts.address;
  return `You just searched Google for "${searchTerm} ${area}". You clicked the result for ${opts.businessName} and the screenshots below loaded.

You've never heard of this business before. React.`;
}

// ─────────────────────────────────────────────────────────────────────
// LAYER 6 — Section grading (per-section design rhythm)
// ─────────────────────────────────────────────────────────────────────

export const SECTION_GRADING_SYSTEM_PROMPT = `You are a design-rhythm reviewer scoring each section of a demo page individually. The renderer has sliced the mobile fullPage screenshot into per-section PNGs (one per <section>, <footer>, or <main > div> with meaningful bounding box). You'll receive the slices in DOM order with their labels.

Your job: grade each section on a 1-5 scale for design rhythm, whitespace, copy density, and brand consistency. Two sentences per section: one line of grade reasoning.

This layer addresses the audit gap: Layers 1-3 are hero-biased and treat the full-page screenshot as a sanity check. Below-the-fold sections get hand-waved. Many cohort demos have a strong hero and a weak About / Visit / Footer that the rep can't pre-empt because no one graded them.

Grading rubric (apply consistently):
- 5 — this section feels intentional, well-paced, and clearly belongs to this brand
- 4 — solid execution with minor rhythm/density quibbles
- 3 — functional but unmemorable; reads as competent default
- 2 — noticeably weaker than the rest of the page (awkward whitespace, copy density off, brand drift)
- 1 — broken-feeling section that pulls the whole page down

For the per-section "note" field: one specific line on what works or what doesn't. NOT generic ("looks good"). Concrete ("dense paragraph block in the About — eyes glaze before reaching the pull-quote").

The "index" field MUST match the index in the slice filename (0 = first slice, 1 = second, etc.). The "label" field should mirror the label in the slice filename so the warehouse can join slices back to their grade.

Respond ONLY with valid JSON matching this shape, no markdown fences, no preamble:

{
  "section_grades": [
    { "index": 0, "label": "hero", "grade": 5, "note": "..." },
    { "index": 1, "label": "enquire", "grade": 4, "note": "..." }
  ]
}`;

/**
 * Build the user-side message for Layer 6.
 * Lists the section labels in render order so the model knows what it's about to see.
 */
export function buildSectionGradingUserMessage(opts: {
  businessName: string;
  sectionLabels: string[];
}): string {
  if (opts.sectionLabels.length === 0) {
    return `The ${opts.businessName} demo has no recognisable sections (no <section>, <footer>, or <main > div> elements with meaningful bounding boxes). Return {"section_grades": []}.`;
  }
  const list = opts.sectionLabels
    .map((l, i) => `  ${String(i).padStart(2, "0")} — ${l}`)
    .join("\n");
  return `The ${opts.businessName} demo's mobile fullPage screenshot has been sliced into ${opts.sectionLabels.length} per-section PNGs, in DOM order:

${list}

The slices follow this message, one image per section in the order above. Grade each on the 1-5 rubric.`;
}

// ─────────────────────────────────────────────────────────────────────
// Runtime validation (Zod) — guards every write to qa-visual-result.json
// ─────────────────────────────────────────────────────────────────────

/**
 * The Zod schemas mirror the TS interfaces above 1-to-1. They exist for
 * runtime validation at the producer side (both manual flow and SDK
 * runner call validateVisualQaResult before writing) so a schema drift
 * is caught at write time, not at the NERVE ingest endpoint.
 *
 * The `_typeParity` const below uses TypeScript's structural typing to
 * compile-error if the Zod-inferred shape and the hand-written
 * interfaces drift. If you add a field to one, you'll get a compile
 * error pointing at the other.
 */

export const BugSeverity = z.enum(["critical", "warning", "info"]);

export const BugFindingSchema = z.object({
  severity: BugSeverity,
  location: z.string().min(1),
  finding: z.string().min(1),
});

export const BrandGradeValue = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const BrandDimensionGradeSchema = z.object({
  grade: BrandGradeValue,
  drift_note: z.string().min(1),
});

export const BrandFidelityResultSchema = z.object({
  palette: BrandDimensionGradeSchema,
  typography: BrandDimensionGradeSchema,
  logo_placement: BrandDimensionGradeSchema,
  positioning: BrandDimensionGradeSchema,
  brand_signature: BrandDimensionGradeSchema,
  overall_grade: z.number().min(1).max(5),
  notes: z.string().min(1),
});

export const OwnerReactionSchema = z.object({
  recognition: z.enum(["high", "partial", "low"]),
  first_reaction: z.string().min(1),
  pushbacks: z.array(z.string().min(1)),
  would_buy: z.enum(["yes", "maybe", "no"]),
  buy_reason: z.string().min(1),
  test_of_success_passes: z.boolean(),
  test_of_success_note: z.string().min(1),
});

// ── Layer 4 (PR-C) ──────────────────────────────────────────────────

export const VoicePreservedQuoteSchema = z.object({
  quote: z.string().min(1),
  rendered: z.boolean(),
  near_verbatim: z.boolean(),
  location_if_rendered: z.string().nullable(),
});

export const VoiceDriftPhraseSchema = z.object({
  rendered: z.string().min(1),
  why_off: z.string().min(1),
});

export const VoiceConsistencyResultSchema = z.object({
  quotes_preserved: z.array(VoicePreservedQuoteSchema),
  voice_drift_phrases: z.array(VoiceDriftPhraseSchema),
  overall_grade: BrandGradeValue,
  notes: z.string().min(1),
});

// ── Layer 5 (PR-C) ──────────────────────────────────────────────────

export const CustomerReactionSchema = z.object({
  first_glance: z.string().min(1),
  trust_at_glance: z.enum(["high", "medium", "low"]),
  would_act: z.enum(["yes", "maybe", "no"]),
  first_question: z.string().min(1),
  bounce_risks: z.array(z.string().min(1)),
  notes: z.string().min(1),
});

// ── Layer 6 (PR-C) ──────────────────────────────────────────────────

export const SectionGradeSchema = z.object({
  index: z.number().int().min(0),
  label: z.string().min(1),
  grade: BrandGradeValue,
  note: z.string().min(1),
});

// ── PR-G — Cohort baselines ─────────────────────────────────────────

export const BaselineDimensionComparisonSchema = z.object({
  name: z.enum(["brand_fidelity", "voice_consistency", "section_grades_mean"]),
  this_grade: z.number().min(1).max(5).nullable(),
  vertical_median: z.number().min(1).max(5),
  below_baseline: z.boolean().nullable(),
});

export const BaselineCohortRatesSchema = z.object({
  has_critical_pct: z.number().min(0).max(100),
  would_buy_yes_pct: z.number().min(0).max(100),
  would_act_yes_pct: z.number().min(0).max(100),
  trust_high_pct: z.number().min(0).max(100),
  test_passes_pct: z.number().min(0).max(100),
});

export const BaselineComparisonSchema = z
  .object({
    vertical: z.string().nullable(),
    baseline_n: z.number().int().min(0),
    baselines_available: z.boolean(),
    dimensions: z.array(BaselineDimensionComparisonSchema),
    cohort_rates: BaselineCohortRatesSchema.nullable(),
  })
  // Cross-field: when baselines_available is false, dimensions must be
  // empty and cohort_rates must be null. The reverse is also enforced
  // (available + populated, unavailable + empty).
  .refine(
    (b) =>
      b.baselines_available
        ? b.cohort_rates !== null
        : b.dimensions.length === 0 && b.cohort_rates === null,
    {
      message:
        "baselines_available=true requires cohort_rates !== null; baselines_available=false requires dimensions=[] and cohort_rates=null",
      path: ["baselines_available"],
    },
  );

// ── Canonical result ────────────────────────────────────────────────

export const LayerNameSchema = z.enum(LAYER_NAMES);

export const VisualQaResultSchema = z
  .object({
    qa_visual_id: z.string().min(1),
    artefact_id: z.string().nullable(),
    lead_id: z.string().min(1),
    demo_path: z.string().min(1),
    viewport: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
    ran_at: z.string().datetime(),
    producer: z.enum(["manual_skill", "sdk_runner"]),
    model: z.string().min(1),
    // PR-D: every gradable layer is nullable. null = vision call failed permanently.
    bugs: z.array(BugFindingSchema).nullable(),
    has_critical: z.boolean().nullable(),
    bug_count: z.number().int().min(0).nullable(),
    brand_fidelity: BrandFidelityResultSchema.nullable(),
    owner_reaction: OwnerReactionSchema.nullable(),
    voice_consistency: VoiceConsistencyResultSchema.nullable(),
    customer_reaction: CustomerReactionSchema.nullable(),
    section_grades: z.array(SectionGradeSchema).nullable(),
    failed_layers: z.array(LayerNameSchema).optional(),
    baseline_comparison: BaselineComparisonSchema.optional(),
    notes: z.string().optional(),
  })
  // Cross-field invariants. Skip the bug_count/has_critical checks
  // when bugs is null (the bugs layer failed; derived fields must also
  // be null per the "nullness in sync with failed_layers" rule).
  .refine(
    (r) => r.bugs === null ? r.bug_count === null : r.bug_count === r.bugs.length,
    {
      message: "bug_count must equal bugs.length (or both null if bugs layer failed)",
      path: ["bug_count"],
    },
  )
  .refine(
    (r) =>
      r.bugs === null
        ? r.has_critical === null
        : r.has_critical === r.bugs.some((b) => b.severity === "critical"),
    {
      message: "has_critical must be true iff any bug has severity=critical (or both null if bugs layer failed)",
      path: ["has_critical"],
    },
  )
  // PR-D: nullness of layer fields must match failed_layers exactly.
  // A producer that nulls a layer but forgets to add it to failed_layers
  // hides the failure; one that adds a name to failed_layers without
  // nulling the field is sending sentinel data labelled as good.
  .refine(
    (r) => {
      const failed = new Set(r.failed_layers ?? []);
      const checks: Array<[LayerName, unknown]> = [
        ["bugs", r.bugs],
        ["brand_fidelity", r.brand_fidelity],
        ["owner_reaction", r.owner_reaction],
        ["voice_consistency", r.voice_consistency],
        ["customer_reaction", r.customer_reaction],
        ["section_grades", r.section_grades],
      ];
      for (const [name, value] of checks) {
        if (failed.has(name) && value !== null) return false;
        if (!failed.has(name) && value === null) return false;
      }
      return true;
    },
    {
      message:
        "failed_layers must match exactly the set of nullable layer fields that are null",
      path: ["failed_layers"],
    },
  );

/**
 * Validate a candidate VisualQaResult. Returns either `{valid: true,
 * data}` (data is the parsed/normalised value) or `{valid: false, errors}`
 * (errors is a flat list of human-readable messages).
 *
 * Call this before every writeFileSync of qa-visual-result.json — both
 * in the SDK runner and in any future programmatic producer. The
 * manual /build-demo flow obeys the same schema by spec; this validator
 * is the safety net for when the spec drifts from the implementation.
 */
export function validateVisualQaResult(
  input: unknown,
): { valid: true; data: z.infer<typeof VisualQaResultSchema> } | { valid: false; errors: string[] } {
  const parsed = VisualQaResultSchema.safeParse(input);
  if (parsed.success) return { valid: true, data: parsed.data };
  const errors = parsed.error.issues.map(
    (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
  );
  return { valid: false, errors };
}

/**
 * Compile-time drift guard. If you add a field to the TS interfaces
 * above without adding it to the Zod schemas (or vice versa), this
 * assignment fails to type-check.
 *
 * Reading: "the Zod-inferred shape must be assignable to the hand-written
 * VisualQaResult interface". Bidirectional check via the two intersection
 * lines.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _typeParityForwards: VisualQaResult = {} as z.infer<typeof VisualQaResultSchema>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _typeParityBackwards: z.infer<typeof VisualQaResultSchema> = {} as VisualQaResult;
