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
 */

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

/**
 * The full canonical result. NERVE expects this exact shape on
 * /api/ingest/qa-visual-result regardless of which path produced it.
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

  // Layer 1
  bugs: BugFinding[];
  has_critical: boolean;
  bug_count: number;

  // Layer 2
  brand_fidelity: BrandFidelityResult;

  // Layer 3
  owner_reaction: OwnerReaction;

  /** Optional 1-line global note across all three layers. */
  notes?: string;
}

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

5. **Above-the-fold CTA** — at 375×812 (iPhone 13 mini), is the primary call-to-action visible without scrolling? If no, flag as critical.

6. **Form controls** — labels disconnected from inputs, select chevrons clipped by container, fields off-screen at this width.

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
 * Build the user-side message for Layer 1.
 * The SDK call sends this as the user message; the manual flow follows it as the spec.
 */
export function buildBugsUserMessage(opts: {
  businessName: string;
  viewportWidth: number;
  viewportHeight: number;
}): string {
  return `Here are two screenshots of the ${opts.businessName} demo rendered at ${opts.viewportWidth}×${opts.viewportHeight} (iPhone 13 mini). The first is the above-the-fold hero crop. The second is the full-page scroll.

Flag visual bugs only. No aesthetic judgement, no brand commentary, no opinions on copy quality — those are scored in separate layers.`;
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
 */
export function buildOwnerReactionUserMessage(opts: {
  businessName: string;
  businessType: string;
  address: string;
  ownerName?: string | null;
  diagnosis: string;
  testOfSuccess: string;
}): string {
  const persona = opts.ownerName
    ? `You are ${opts.ownerName}, the owner of ${opts.businessName}`
    : `You are the owner of ${opts.businessName}`;
  return `${persona}, a ${opts.businessType} in ${opts.address}.

The brief diagnosed the conversion problem this demo must solve as:
> ${opts.diagnosis}

The brief committed that if the demo is good, your reaction will be:
> ${opts.testOfSuccess}

The rep has put their phone in front of you and is showing you the two screenshots below. React.`;
}
