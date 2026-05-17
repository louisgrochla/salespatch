/**
 * Auto-fix remedy library for visual-QA critical bugs.
 *
 * Each remedy is a PURE FUNCTION over the demo HTML — given a critical
 * BugFinding, it returns either the modified HTML (string) or `null`
 * if the bug can't be auto-fixed safely. The orchestrator
 * (`qa-visual-autofix.ts`) walks every critical bug, looks up the
 * matching remedy via `inferPattern`, and accumulates fixes onto the
 * HTML in order.
 *
 * Design principles:
 *
 * 1. **Conservative.** A bad auto-fix is worse than no fix — it makes
 *    the rep believe a problem is solved when it isn't. Every remedy
 *    here must either fix the specific bug it claims to or return
 *    null. Half-fixes that leave the bug visible are forbidden.
 *
 * 2. **Idempotent.** Re-running a remedy on its own output must be a
 *    no-op (or, at worst, equivalent). The orchestrator runs up to 3
 *    iterations; idempotency prevents drift across iterations.
 *
 * 3. **Localised.** A remedy that edits the hero gradient must not
 *    touch the lookbook section's CSS. Each remedy targets a single
 *    CSS rule or HTML element, identified by class/id selectors that
 *    the build process is known to emit.
 *
 * 4. **Source-of-truth aware.** Build-time choices (gradient stops,
 *    CTA copy, status badges) live in the generated HTML/CSS. A remedy
 *    that tries to patch the build's prompt itself is out of scope —
 *    that's PR-F.2 (auto-improve build prompts) territory, not PR-F.1.
 *
 * Each remedy is tagged with its `BugPattern` so the autofix script
 * can report which fixes were applied vs which bugs were unfixable.
 * Unfixable bugs flow back into the chat output unchanged — the rep
 * still gets a heads-up, the demo just doesn't auto-correct.
 */

import type { BugFinding } from "./qa-visual-prompts";

export type BugPattern =
  | "text_over_image_low_contrast"
  | "missing_above_fold_cta"
  | "redundant_cta_pair"
  | "status_as_cta"
  | "live_content_hardcoded"
  | "unknown";

export interface RemedyResult {
  pattern: BugPattern;
  applied: boolean;
  /** Short message for the chat output / log line. */
  message: string;
}

export interface AutofixSummary {
  bugs_attempted: number;
  fixes_applied: Array<{ pattern: BugPattern; location: string; message: string }>;
  unfixable_bugs: Array<{ pattern: BugPattern; location: string; finding: string; reason: string }>;
}

// ─────────────────────────────────────────────────────────────────────
// Pattern inference — maps a BugFinding to a remedy key
// ─────────────────────────────────────────────────────────────────────

/**
 * Identify the bug pattern from a finding's location + finding text.
 * Returns "unknown" when no remedy is known. The matching is
 * keyword-based on the rendered prose because vision output is
 * structured-prose, not classified labels.
 *
 * Order matters: more specific patterns first (live_content_hardcoded
 * before status_as_cta, because "CLOSED · BACK AT 8:30" matches both
 * but the hardcoded-live remedy is the right call when it applies).
 */
export function inferPattern(bug: BugFinding): BugPattern {
  const text = `${bug.location} ${bug.finding}`.toLowerCase();

  // Live-content hardcoded (Layer 1 category #7)
  if (
    /\bhardcoded\b|\bwill (read|display|show) stale\b|\bbaked in\b/.test(text) &&
    /\b(today|live|date|status|wed|thu|fri|sat|sun|mon|tue|wed)\b/.test(text)
  ) {
    return "live_content_hardcoded";
  }

  // Status-as-CTA confusion (Layer 1 category #5)
  if (
    /\bstatus(?:\s+badge)?\b|\bno (primary )?(action|cta)\b|\bonly a status\b/.test(text) &&
    /\b(hero|above[- ]?the[- ]?fold)\b/.test(text)
  ) {
    return "status_as_cta";
  }

  // CTA hierarchy collapse — redundant pair (Layer 1 category #6)
  if (
    /\bredundant\b|\bduplicate\b|\bsame\b.*\b(cta|button|action)\b|\b(cta|button)\b.*\btwice\b/.test(text) &&
    /\b(nav|navigation|hero)\b/.test(text)
  ) {
    return "redundant_cta_pair";
  }

  // Missing above-fold CTA (Layer 1 category #5, no-CTA variant)
  if (
    /\bno (primary )?(cta|action|tappable)\b|\bcta absent\b|\bmissing.*\b(cta|action)\b/.test(text) &&
    /\b(hero|above[- ]?the[- ]?fold)\b/.test(text)
  ) {
    return "missing_above_fold_cta";
  }

  // Text-over-image readability (Layer 1 category #1)
  if (
    /\b(contrast|readab(?:le|ility))\b/.test(text) &&
    /\b(text|h1|heading|mono|ribbon|overlay|gradient|photo|image)\b/.test(text)
  ) {
    return "text_over_image_low_contrast";
  }

  return "unknown";
}

// ─────────────────────────────────────────────────────────────────────
// Individual remedies
// ─────────────────────────────────────────────────────────────────────

/**
 * Bump the hero gradient overlay's top opacity stop. The most common
 * /build-demo hero pattern uses something like:
 *
 *   linear-gradient(180deg, rgba(R,G,B,0.10) 0%, rgba(R,G,B,0.55) 80%, ...)
 *
 * The 0.10 at the top stop is what fails — text overlaid on the top of
 * the hero photo sees ~37% opacity by the time the gradient interpolates
 * to where the live ribbon sits (y≈400/812). Bumping the top stop to
 * 0.45 raises the floor across the whole top half of the hero.
 *
 * Idempotent — once the top stop is ≥ 0.40, the regex no longer matches,
 * so re-runs are no-ops.
 */
function remedyTextOverImageLowContrast(html: string): string | null {
  // Match linear-gradient with a low top-stop opacity (0.00-0.39).
  // Capture R,G,B groups so we preserve the build's chosen colour.
  const re = /linear-gradient\(\s*180deg\s*,\s*rgba\(\s*([^,)]+)\s*,\s*([^,)]+)\s*,\s*([^,)]+)\s*,\s*0?\.[0-3]\d?\)\s+0%/g;
  let count = 0;
  const fixed = html.replace(re, (_match, r, g, b) => {
    count++;
    return `linear-gradient(180deg, rgba(${r}, ${g}, ${b}, 0.45) 0%`;
  });
  return count > 0 ? fixed : null;
}

/**
 * Strip "Today · Wed 7 May" framing from a hardcoded live-status
 * block. The build's pattern is something like:
 *
 *   <span class="label">Today · Wed 7 May</span>
 *
 * The remedy replaces "Today · Wed N <Month>" with "This week" so the
 * block stops claiming to be today-specific when it can't be. Owner
 * still sees the artist availability list — which is also stale, but
 * the most credibility-destroying string (the date) is neutralised.
 *
 * Better-but-out-of-scope: wrap the list in a real <script> that pulls
 * the current date. That requires writing JS into a sealed file and
 * coordinating with the build's existing scripts — too risky for the
 * autofix loop. The "This week" framing is honest about the demo
 * being static while not actively lying about the date.
 *
 * Idempotent — once "Today" is gone, the regex no longer matches.
 */
function remedyLiveContentHardcoded(html: string): string | null {
  const re = /\bToday\s*[·•|]\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*/gi;
  let count = 0;
  const fixed = html.replace(re, () => {
    count++;
    return "This week";
  });
  // Also catch "OPEN TODAY · UNTIL 5PM" patterns — replace with the
  // schedule-shaped framing.
  const re2 = /\bOPEN\s+TODAY\s*[·•|]\s*UNTIL\s+\d{1,2}\s*(?:AM|PM)?/gi;
  const fixed2 = fixed.replace(re2, () => {
    count++;
    return "Check the schedule";
  });
  return count > 0 ? fixed2 : null;
}

/**
 * Status-as-CTA: no safe auto-fix. The remedy would have to invent a
 * verb-led action ("Get in touch", "Book now") and decide where to
 * route it — both require brief context (the right action depends on
 * the diagnosis: enquire-led / call-led / book-led). Surface as
 * unfixable so the rep / builder makes the call manually.
 */
function remedyStatusAsCta(_html: string): string | null {
  return null;
}

/**
 * Missing above-fold CTA: similar problem to status-as-CTA. Inserting
 * a default CTA without knowing the brief's preferred action would
 * routinely produce wrong calls (e.g. "Book now" on a florist who
 * takes DM enquiries). Defer until PR-G's brief-aware autofix.
 */
function remedyMissingAboveFoldCta(_html: string): string | null {
  return null;
}

/**
 * Redundant CTA pair: the safer move is to LEAVE the body CTA (which
 * the user can see scrolling) and trim the nav CTA, which is duplicate
 * weight in the same viewport. But identifying which exact <a> in the
 * nav is the redundant one without a real DOM parser is fragile — and
 * stripping the wrong one could leave the nav empty. Defer.
 */
function remedyRedundantCtaPair(_html: string): string | null {
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Public orchestration entry point
// ─────────────────────────────────────────────────────────────────────

/**
 * Walk every critical bug in `bugs`, look up the matching remedy via
 * `inferPattern`, and apply each fix in turn. Returns the updated HTML
 * and a summary recording what was fixed vs what stayed unfixable.
 *
 * The caller (`qa-visual-autofix.ts`) writes the new HTML back to
 * demo.html and re-runs the visual-QA pass. If the bug count drops to
 * zero, ship the fixed demo. If some critical bugs remain unfixable,
 * surface them in the chat output and let the human decide.
 */
export function applyRemedies(
  html: string,
  bugs: BugFinding[],
): { html: string; summary: AutofixSummary } {
  const criticals = bugs.filter((b) => b.severity === "critical");
  const summary: AutofixSummary = {
    bugs_attempted: criticals.length,
    fixes_applied: [],
    unfixable_bugs: [],
  };

  let current = html;
  for (const bug of criticals) {
    const pattern = inferPattern(bug);
    let next: string | null = null;
    let remedyName: string;
    switch (pattern) {
      case "text_over_image_low_contrast":
        next = remedyTextOverImageLowContrast(current);
        remedyName = "bump hero gradient top-stop to 0.45";
        break;
      case "live_content_hardcoded":
        next = remedyLiveContentHardcoded(current);
        remedyName = "strip 'Today · <day>' framing to 'This week'";
        break;
      case "status_as_cta":
        next = remedyStatusAsCta(current);
        remedyName = "(no safe auto-fix — needs brief context)";
        break;
      case "missing_above_fold_cta":
        next = remedyMissingAboveFoldCta(current);
        remedyName = "(no safe auto-fix — needs brief context)";
        break;
      case "redundant_cta_pair":
        next = remedyRedundantCtaPair(current);
        remedyName = "(no safe auto-fix — risks breaking nav)";
        break;
      default:
        remedyName = "(no remedy registered for this pattern)";
        next = null;
    }

    if (next === null) {
      summary.unfixable_bugs.push({
        pattern,
        location: bug.location,
        finding: bug.finding,
        reason: remedyName,
      });
    } else if (next === current) {
      // Remedy matched the pattern but found nothing to change (the
      // HTML was already in the fixed state). Treat as no-op success
      // rather than unfixable — the bug is going to clear on re-QA
      // and adding noise to unfixable_bugs would over-report.
      summary.fixes_applied.push({
        pattern,
        location: bug.location,
        message: `${remedyName} (no change — already fixed)`,
      });
    } else {
      current = next;
      summary.fixes_applied.push({
        pattern,
        location: bug.location,
        message: remedyName,
      });
    }
  }

  return { html: current, summary };
}
