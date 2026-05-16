/**
 * Static-source scan for "live-looking" text in a built demo.html.
 *
 * Visual QA Layer 1 catches text-over-image readability bugs and broken
 * layouts. It cannot catch the **dynamic-content honesty bug class**:
 * text that looks live (current date, current status, queue counter)
 * but is actually hardcoded into the HTML and will display stale state
 * the moment the rep opens the demo on a different day.
 *
 * The audit found this is real and common: noose-and-needle's hero
 * shows "Today · Wed 7 May" + a six-artist availability list, all
 * hardcoded. Fable shows "OPEN TODAY · UNTIL 5PM" — hardcoded. Cafe-100
 * uses real `getDay()`/`getHours()` and updates correctly. Two-thirds
 * of the cohort's "live status" features are theatre.
 *
 * This script greps the demo for two things:
 *   1. PHRASES that look live (Today, OPEN UNTIL, BACK AT, walk-ins
 *      from, items remaining, sold out, currently fully booked, etc.)
 *   2. JS API calls that produce dynamic dates/times (new Date,
 *      .getDay, .getDate, .getHours, .toLocaleDateString,
 *      Intl.DateTimeFormat, etc.)
 *
 * Output candidates have:
 *   - text: the matched phrase
 *   - looks_live: true (we only emit live-looking matches)
 *   - is_dynamic: true if any JS date/time API exists in the file
 *   - severity_hint: "critical" if looks_live && !is_dynamic; "info"
 *     if looks_live && is_dynamic (looks live, plausibly wired —
 *     vision-side check still required to confirm)
 *
 * The dynamic-detection is intentionally crude: presence of ANY
 * date/time API in the file flips `is_dynamic` true for ALL candidates.
 * A precise per-phrase wiring check would require AST analysis and is
 * out of scope. The crude check is conservative: false negatives (we
 * miss a hardcoded phrase because the demo has unrelated dynamic
 * logic elsewhere) are rare and recoverable via the vision pass; false
 * positives (we flag a wired phrase as hardcoded) would generate
 * annoying noise, which crude-mode avoids.
 *
 * The output is consumed by `buildBugsUserMessage` in
 * `qa-visual-prompts.ts` and injected into the Layer 1 prompt as
 * additional context — vision then judges what it sees against what
 * the source actually wires.
 *
 * Usage:
 *   npx tsx apps/nerve/scripts/qa-visual-dynamic.ts <demo.html> [out_path]
 *
 * Default out_path: <demo.html dir>/.qa-visual/dynamic-scan.json
 *
 * Stdout: JSON matching DynamicScanResult.
 * Stderr: one-line summary.
 * Exit:   0 always (no candidates is fine; static demos exist).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";

export interface DynamicCandidate {
  text: string;
  looks_live: true;
  is_dynamic: boolean;
  severity_hint: "critical" | "info";
}

export interface DynamicScanResult {
  demo_path: string;
  scanned_at: string;
  has_date_logic: boolean;
  has_time_logic: boolean;
  candidates: DynamicCandidate[];
  /** Brief plain-English line for the Layer 1 prompt + the chat-output line. */
  summary: string;
}

/**
 * Phrases that LOOK live to a reasonable reader. Each regex matches
 * verbatim in the rendered HTML. Case-insensitive across the board
 * because demos vary on caps treatment.
 */
const LIVE_PHRASE_PATTERNS: RegExp[] = [
  // "Today · Wed 7 May" / "Today | Mon 15 Aug"
  /Today\s*[·•|]\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b[^<>"\n]{0,30}/gi,
  // "OPEN TODAY", "OPEN NOW", "OPEN UNTIL <time>"
  /\bOPEN\s+(?:TODAY|NOW|UNTIL\s+[0-9])/gi,
  // "BACK AT 8:30", "BACK TOMORROW", "BACK IN 20"
  /\bBACK\s+(?:AT|TOMORROW|IN)\s+\S{1,6}/gi,
  // "CLOSED · BACK AT..." (the CLOSED half on its own is usually a status badge)
  /\bCLOSED\b\s*[·•|]\s*\S{2,30}/gi,
  // Artist availability tells common to barbers / studios / salons
  /\bwalk-ins?\s+from\s+\S+/gi,
  /\bfully\s+booked\b/gi,
  /\bfree\s+from\s+\S+/gi,
  // Bakery / café demand-driven tells
  /\b\d+\s+(?:items?|left|spaces?)\s+(?:remaining|left|available)/gi,
  /\bsold\s+out\b/gi,
  /\bcurrently\s+fully\s+booked\b/gi,
  // Generic "today's specials" / "today's bakes" etc.
  /\btoday'?s\s+(?:specials?|bakes?|drops?|menu|menu)\b/gi,
];

/**
 * JS APIs that produce dynamic dates/times. If ANY appear in the file,
 * we assume the demo has some live wiring and downgrade the severity
 * hint for live-looking phrases from "critical" to "info" — leaving
 * the final judgement to the vision pass which can see whether the
 * specific phrase matches the rendered DOM.
 */
const DYNAMIC_DATE_TIME_API: RegExp =
  /new\s+Date\s*\(|\.getDay\s*\(|\.getDate\s*\(|\.getMonth\s*\(|\.getFullYear\s*\(|\.getHours\s*\(|\.getMinutes\s*\(|toLocaleDateString|toLocaleTimeString|Intl\.DateTimeFormat/;

function scan(html: string, demoPath: string): DynamicScanResult {
  const hasDynamic = DYNAMIC_DATE_TIME_API.test(html);
  const seen = new Set<string>();
  const candidates: DynamicCandidate[] = [];

  for (const re of LIVE_PHRASE_PATTERNS) {
    for (const match of html.matchAll(re)) {
      // Strip any HTML markup that bled into the match (e.g. capturing
      // through </span> when the phrase wraps a child element), normalise
      // whitespace, and clip overly long matches.
      const text = match[0]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
      if (!text || seen.has(text.toLowerCase())) continue;
      seen.add(text.toLowerCase());
      candidates.push({
        text,
        looks_live: true,
        is_dynamic: hasDynamic,
        severity_hint: hasDynamic ? "info" : "critical",
      });
    }
  }

  const hardcoded = candidates.filter((c) => !c.is_dynamic).length;
  const wired = candidates.filter((c) => c.is_dynamic).length;
  let summary: string;
  if (candidates.length === 0) {
    summary = "no live-looking content found in the demo source";
  } else if (hasDynamic) {
    summary = `${candidates.length} live-looking phrase(s); date/time JS APIs present, candidates likely wired (vision pass should still confirm per-phrase)`;
  } else {
    summary = `${hardcoded} live-looking phrase(s); NO date/time JS APIs found, phrases are hardcoded — critical credibility risk when rep opens demo on a different day`;
  }

  return {
    demo_path: demoPath,
    scanned_at: new Date().toISOString(),
    has_date_logic: hasDynamic,
    has_time_logic: hasDynamic, // crude mode treats both as a single signal
    candidates,
    summary,
  };
}

function main(): void {
  const [, , htmlPathArg, outPathArg] = process.argv;
  if (!htmlPathArg) {
    console.error("usage: qa-visual-dynamic.ts <demo.html> [out_path]");
    process.exit(1);
  }
  const htmlPath = resolve(htmlPathArg);
  if (!existsSync(htmlPath)) {
    console.error(`ERROR: ${htmlPath} not found`);
    process.exit(1);
  }
  const outPath = resolve(
    outPathArg ?? join(dirname(htmlPath), ".qa-visual", "dynamic-scan.json"),
  );
  mkdirSync(dirname(outPath), { recursive: true });

  const html = readFileSync(htmlPath, "utf8");
  const result = scan(html, htmlPath);
  writeFileSync(outPath, JSON.stringify(result, null, 2));

  console.error(`qa-visual-dynamic: ${result.summary}`);
  console.error(`qa-visual-dynamic: result → ${outPath}`);
  console.log(JSON.stringify(result));
}

main();
