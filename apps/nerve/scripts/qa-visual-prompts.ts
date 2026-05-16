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
    bugs: z.array(BugFindingSchema),
    has_critical: z.boolean(),
    bug_count: z.number().int().min(0),
    brand_fidelity: BrandFidelityResultSchema,
    owner_reaction: OwnerReactionSchema,
    notes: z.string().optional(),
  })
  // Cross-field invariants: catches the producer claiming bug_count or
  // has_critical that doesn't match the actual bugs array. Cheap insurance
  // against the producer composing a result file by hand and forgetting
  // to update one of the derived fields.
  .refine((r) => r.bug_count === r.bugs.length, {
    message: "bug_count must equal bugs.length",
    path: ["bug_count"],
  })
  .refine((r) => r.has_critical === r.bugs.some((b) => b.severity === "critical"), {
    message: "has_critical must be true iff any bug has severity=critical",
    path: ["has_critical"],
  });

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
