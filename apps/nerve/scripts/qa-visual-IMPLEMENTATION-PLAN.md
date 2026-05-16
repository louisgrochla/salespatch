# Visual-QA implementation plan — full coverage of audit findings

This is the delivery plan for every issue surfaced by `qa-visual-AUDIT.md`. Work is sequenced into 10 PRs across three phases: **Foundation** (must-ship before anything else builds on the pipeline), **Detection** (cover the bug classes the audit found in the cohort), and **Leverage** (turn the QA into a build-time guardrail and competitive proof). Each PR is independently shippable, in dependency order.

Total engineering: **~48 hours** (~6 focused working days, or ~3 weeks at 1-2 PRs/week).

## Sequencing summary

```
Phase 1 — FOUNDATION         Phase 2 — DETECTION              Phase 3 — LEVERAGE
─────────────────────         ─────────────────────            ─────────────────────
PR-A  Renderer + schema ───┬─ PR-B  Layer 1 + dynamic ────┬─ PR-F  Auto-fix loop
                           │                              │
                           ├─ PR-C  Voice + customer ─────┤
                           │       + section grading      │
                           │                              │
                           ├─ PR-D  SDK robustness        │
                           │                              │
                           └─ PR-E  NERVE ingest route ───┴─ PR-G  Cohort baselines
                                                          │
                                                          ├─ PR-H  Photo quality
                                                          │
                                                          ├─ PR-I  A/B variants
                                                          │
                                                          └─ PR-J  Competitor compare
```

PR-A is the gate: nothing else ships until the foundation is reliable. PR-B through PR-E can ship in any order (no inter-dependency). PR-F requires PR-B (remedies map to detected bugs). PR-G requires PR-E (ingest must exist before baselines can be read).

---

## PHASE 1 — FOUNDATION

### PR-A — Renderer hardening + schema validation + drift test

**Scope:** Bullet-proof the pipeline before piling features on it. Fixes the workflow trap, makes the renderer deterministic, enforces contract integrity at write time and at code-review time.

**Audit issues addressed:**
- Workflow trap when scripts missing on a branch (audit finding A1)
- Renderer fragility — 1.2s `waitForTimeout` is network-flaky (audit finding C3)
- Single-viewport blind spot — no desktop render (audit finding A8)
- No schema-validation at write time (audit code-finding 8)
- No drift test between `.ts` and `.md` spec (audit code-finding 7)

**Files touched (in repo):**
- `apps/nerve/scripts/qa-visual-render.ts` — rewrite the wait logic; add desktop viewport; write `render-result.json`
- `apps/nerve/scripts/qa-visual-prompts.ts` — add `validateVisualQaResult(obj): obj is VisualQaResult` using a hand-rolled type guard (no new dep) OR import `zod` from `apps/nerve/node_modules` and add a `VisualQaResultSchema`
- `apps/nerve/scripts/qa-visual.ts` — call the validator before writing `qa-visual-result.json`, abort with diagnostics if shape drifted
- `apps/nerve/scripts/qa-visual-drift-test.ts` — NEW; counts prompt-name occurrences in `.ts` vs `.md`, fails CI if either is missing one
- `package.json` (root) — add `"qa-visual:drift-test"` npm script
- `.github/workflows/*.yml` — add the drift-test to the CI matrix
- `CHANGELOG/2026-05/2026-05-XX_NNN_qa_visual_foundation.md`

**Files touched (user-level skill, not in repo, document in CHANGELOG):**
- `~/.claude/commands/build-demo.md` — add `[ -f "$SCRIPT" ] || { echo "Visual-QA: skipped (script missing)"; exit 0; }` guard around the render step

**Code changes:**

```ts
// qa-visual-render.ts — replace fixed timeout with deterministic waits
await page.goto(url, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
// optional: 200ms grace for any post-fonts-ready paint
await page.waitForTimeout(200);

// also capture desktop viewport
const desktopCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const desktopPage = await desktopCtx.newPage();
await desktopPage.goto(url, { waitUntil: "networkidle" });
await desktopPage.evaluate(() => document.fonts.ready);
await desktopPage.waitForTimeout(200);
await desktopPage.screenshot({ path: join(outDir, "hero-desktop.png"),
                              clip: { x: 0, y: 0, width: 1280, height: 800 } });
await desktopPage.screenshot({ path: join(outDir, "full-desktop.png"),
                              fullPage: true });

// write render-result.json
const result = {
  ran_at: new Date().toISOString(),
  duration_ms: Date.now() - startedAt,
  mobile: { hero_path, full_path, hero_bytes, full_bytes, viewport: { width: 375, height: 812 }},
  desktop: { hero_path, full_path, hero_bytes, full_bytes, viewport: { width: 1280, height: 800 }},
  url, demo_path: htmlPath,
};
writeFileSync(join(outDir, "render-result.json"), JSON.stringify(result, null, 2));
```

```ts
// qa-visual.ts — schema validation before write
import { validateVisualQaResult } from "./qa-visual-prompts";
const ok = validateVisualQaResult(result);
if (!ok.valid) {
  console.error(`qa-visual: SCHEMA VIOLATION — ${ok.errors.join("; ")}`);
  process.exit(2);
}
writeFileSync(outPath, JSON.stringify(result, null, 2));
```

```ts
// qa-visual-drift-test.ts — minimal grep-based check
const ts = readFileSync(tsPath, "utf8");
const md = readFileSync(mdPath, "utf8");
const REQUIRED = [
  "BUGS_SYSTEM_PROMPT", "BRAND_FIDELITY_SYSTEM_PROMPT", "OWNER_REACTION_SYSTEM_PROMPT",
  "buildBugsUserMessage", "buildBrandFidelityUserMessage", "buildOwnerReactionUserMessage",
  "VisualQaResult", "BugFinding", "BrandFidelityResult", "OwnerReaction",
];
const missing = REQUIRED.filter(name => !ts.includes(name) || !md.includes(name));
if (missing.length) { console.error(`drift: ${missing.join(", ")}`); process.exit(1); }
```

**Validation:**
- Re-run render across all 14 cohort demos. Confirm desktop PNGs land at 1280×800 + reasonable sizes.
- Force a corrupt `qa-visual-result.json` (e.g. missing `bug_count`). Confirm the validator catches it before write.
- Edit `qa-visual-prompts.ts` to rename a constant. Run drift-test. Confirm it fails.

**Dependencies:** None. Foundation PR.

**Effort:** 4-5 hours.

**Risk:** Low. All changes are additive or replace fragile mechanisms with deterministic ones.

---

## PHASE 2 — DETECTION

### PR-B — Layer 1 expansion + hybrid dynamic-content honesty check

**Scope:** Catches the two highest-leverage bug classes the audit found cohort-wide: hardcoded "live" features and CTA hierarchy / status-as-CTA confusion.

**Audit issues addressed:**
- Hardcoded "live" features (noose-and-needle "Today · Wed 7 May", fable "OPEN TODAY · UNTIL 5PM") — credibility bombs (audit finding A2)
- Missing hero CTA (Cult of Coffee) — silently passes current Layer 1 (audit finding A3)
- CTA hierarchy collapse (noose-and-needle redundant, fable three competing) — no current dimension (audit finding A4)

**Files touched (in repo):**
- `apps/nerve/scripts/qa-visual-prompts.ts` — extend `BUGS_SYSTEM_PROMPT` with three new bug categories; add type literals to severity enum if needed
- `apps/nerve/scripts/qa-visual-prompts.md` — mirror the same additions
- `apps/nerve/scripts/qa-visual-dynamic.ts` — NEW; static-JS-scan that classifies dynamic-content candidates as wired or hardcoded
- `apps/nerve/scripts/qa-visual.ts` — pipe the dynamic-scan result into the Layer 1 user message as context; vision then compares against what it sees
- `CHANGELOG/2026-05/2026-05-XX_NNN_qa_visual_layer1_expansion.md`

**Files touched (skill):**
- `~/.claude/commands/build-demo.md` — instruct in-session Claude to run `qa-visual-dynamic.ts` before Layer 1 vision pass and include the output in the prompt context

**Code changes:**

```ts
// qa-visual-dynamic.ts — new file
import { readFileSync } from "node:fs";

interface DynamicScanResult {
  candidates: Array<{
    text: string;
    looks_live: boolean;       // text matches a "live" pattern (Today, OPEN UNTIL, BACK AT)
    is_dynamic: boolean;       // JS exists to compute it OR matches a known dynamic template
    severity_hint: "critical" | "warning" | "info";
  }>;
  has_date_logic: boolean;     // any of new Date / getDay / getDate / getHours
  has_time_logic: boolean;     // toLocaleTimeString / Intl.DateTimeFormat
}

const html = readFileSync(htmlPath, "utf8");
const liveLikePhrases = [
  /Today\s*[·•|]\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/gi,
  /OPEN\s+(?:TODAY|NOW)/gi,
  /BACK\s+(?:AT|TOMORROW|IN)\s+[0-9]/gi,
  /CLOSED\s*[·•|]\s*/gi,
  /\b(?:walk-ins?\s+from|fully\s+booked|free\s+from)\b/gi,
  /\b(?:items?\s+remaining|left\s+for\s+today|sold\s+out)/gi,
];
const dynamicMarkers = /new\s+Date\b|\.getDay\b|\.getDate\b|\.getHours\b|\.getMinutes\b|toLocaleTimeString|toLocaleDateString|Intl\.DateTimeFormat/g;
const hasDynamic = dynamicMarkers.test(html);
const candidates = liveLikePhrases.flatMap(re => Array.from(html.matchAll(re)).map(m => ({
  text: m[0],
  looks_live: true,
  is_dynamic: hasDynamic,  // crude — if any dynamic logic exists, assume the match is wired
  severity_hint: hasDynamic ? "info" : "critical",
})));
writeFileSync(outPath, JSON.stringify({ candidates, has_date_logic: hasDynamic, has_time_logic: hasDynamic }, null, 2));
```

```ts
// qa-visual-prompts.ts — extend BUGS_SYSTEM_PROMPT
// (new categories appended; existing categories unchanged)

// 7. **Live-content honesty** — text that looks live (today's date, current
//    status, "back at HH:MM", artist availability, queue counters) must actually
//    be wired to a date/time API. The dynamic-content scan result is provided
//    in the user message; any "looks_live: true, is_dynamic: false" match is
//    a critical credibility bug: when the rep opens the demo on a different
//    day, the page will display stale state.
//
// 8. **CTA hierarchy** — the hero must have ONE primary CTA. Redundant pairs
//    (same label + style in nav and body) collapse hierarchy. Three or more
//    primary-weight CTAs competing in the same viewport dilutes attention.
//    Flag as warning unless the redundancy is duplicated text (e.g. nav +
//    body identical), which is critical.
//
// 9. **Status-as-CTA confusion** — the above-the-fold primary CTA must be a
//    tappable verb-led action ("Tell me what you need", "Book a chair",
//    "Find your artist"). A status badge ("CLOSED · BACK AT 8:30",
//    "Currently fully booked") is NOT a CTA. If the hero has no verb-led
//    action above the fold, flag as critical.
```

```ts
// extend buildBugsUserMessage to inject the dynamic scan
export function buildBugsUserMessage(opts: {
  businessName: string;
  viewportWidth: number;
  viewportHeight: number;
  dynamicScan?: DynamicScanResult;
}): string {
  const dynLines = opts.dynamicScan?.candidates.length
    ? `\n\nStatic JS-scan of this demo found the following "live-looking" elements:\n` +
      opts.dynamicScan.candidates.map(c =>
        `  - "${c.text}" — looks_live=${c.looks_live}, is_dynamic=${c.is_dynamic}, hint=${c.severity_hint}`
      ).join("\n")
    : "";
  return `Here are two screenshots of the ${opts.businessName} demo... ${dynLines}\n\nFlag visual bugs.`;
}
```

**Validation:**
- Run against the noose-and-needle demo. Confirm Layer 1 returns a critical bug for "Today · Wed 7 May".
- Run against the fable demo. Confirm critical bug for "OPEN TODAY · UNTIL 5PM".
- Run against cafe-100. Confirm NO critical bug because dynamic JS is detected (correct).
- Run against Cult of Coffee. Confirm critical bug for "above-the-fold CTA absent — status badge is not a CTA".
- Run against fable. Confirm warning for "three primary CTAs competing".

**Dependencies:** PR-A (renderer + schema). The new BugFinding categories may add severity strings — schema validator must permit them.

**Effort:** 6-8 hours.

**Risk:** Medium. The dynamic-scan is heuristic — could false-positive on demos with templated text the script can't tell apart from live text. Worth running against all 14 cohort demos to baseline before merging.

---

### PR-C — Layer 4 voice consistency + Layer 5 customer reaction + section-by-section grading

**Scope:** Three additions that close the qualitative-coverage gap. Voice fidelity catches build drift from the brief's verbatim language; customer reaction adds the search-traffic perspective; section grading addresses below-the-fold being under-graded.

**Audit issues addressed:**
- Voice drift not checked (audit finding A7)
- Below-the-fold under-graded (audit finding A5)
- Missing customer-perspective signal (audit proposal 8 / leverage)

**Files touched (in repo):**
- `apps/nerve/scripts/qa-visual-prompts.ts` — add `VOICE_CONSISTENCY_SYSTEM_PROMPT`, `CUSTOMER_REACTION_SYSTEM_PROMPT`, `SECTION_GRADING_SYSTEM_PROMPT`; add user-message builders; extend `VisualQaResult` interface with `voice_consistency`, `customer_reaction`, `section_grades`
- `apps/nerve/scripts/qa-visual-prompts.md` — mirror all three additions
- `apps/nerve/scripts/qa-visual-render.ts` — slice `full.png` into N section chunks (auto-detected via `<section>` element bounding boxes); write to `.qa-visual/sections/section-NN.png`
- `apps/nerve/scripts/qa-visual.ts` — add three new vision calls (cost: ~3 more Haiku calls, ~£0.015/demo total). Compose into the canonical `VisualQaResult`.
- `CHANGELOG/2026-05/2026-05-XX_NNN_qa_visual_layers_4_5_section.md`

**Files touched (skill):**
- `~/.claude/commands/build-demo.md` — extend the manual-flow instructions to run Layers 4 + 5 + section grading after Layers 1-3

**Code changes (schema extension):**

```ts
// qa-visual-prompts.ts
export interface VoiceConsistencyResult {
  /** brief.voice_quotes[] — which are present on the rendered page verbatim or near-verbatim */
  quotes_preserved: Array<{ quote: string; rendered: boolean; near_verbatim: boolean; location_if_rendered?: string }>;
  /** rendered phrases that contradict the brief's voice (marketing-mush, generic-template phrases) */
  voice_drift_phrases: Array<{ rendered: string; why_off: string }>;
  /** 1-5 overall coverage score */
  overall_grade: 1 | 2 | 3 | 4 | 5;
  notes: string;
}

export interface CustomerReaction {
  /** what's the customer's first impression in 3 seconds */
  first_glance: string;
  /** would they trust this enough to book/buy/visit? */
  trust_at_glance: "high" | "medium" | "low";
  /** would they take the primary action (book / enquire / order)? */
  would_act: "yes" | "maybe" | "no";
  /** the one question they would ask before acting */
  first_question: string;
  /** anything that would make them bounce */
  bounce_risks: string[];
  notes: string;
}

export interface SectionGrade {
  /** section index, 0 = hero, 1 = next section down, etc. */
  index: number;
  /** human label inferred from headings or content */
  label: string;
  /** design rhythm / whitespace / brand consistency 1-5 */
  grade: 1 | 2 | 3 | 4 | 5;
  /** one-line drift note */
  note: string;
}

export interface VisualQaResult {
  // ...existing fields...
  voice_consistency: VoiceConsistencyResult;
  customer_reaction: CustomerReaction;
  section_grades: SectionGrade[];
}
```

**Code changes (section slicing in renderer):**

```ts
// qa-visual-render.ts
const sectionBoxes = await page.evaluate(() => {
  return Array.from(document.querySelectorAll("section, footer, main > div")).map(el => {
    const r = el.getBoundingClientRect();
    return {
      label: el.id || el.querySelector("h2, h3")?.textContent?.trim().slice(0, 40) || "(unlabelled)",
      x: r.x, y: r.y + window.scrollY, width: r.width, height: r.height,
    };
  }).filter(b => b.height > 100 && b.width > 100);
});
const sectionsDir = join(outDir, "sections");
mkdirSync(sectionsDir, { recursive: true });
for (const [i, box] of sectionBoxes.entries()) {
  await page.screenshot({
    path: join(sectionsDir, `section-${String(i).padStart(2, "0")}.png`),
    clip: box,
  });
}
```

**Validation:**
- Bouquet Bar: confirm Layer 4 finds the 4 voice quotes from the brief (`Beautiful flowers for all occasions`, `DM to contact or enquire 🩷`, `Pastels with a pop`, `from everyone at The Bouquet Bar 🩷`) all preserved in the rendered demo, no drift phrases.
- Run customer reaction on the bouquet-bar — expect `would_act: maybe` or `yes`, `trust_at_glance: medium` or `high`.
- Confirm section_grades returns 6-8 entries (hero, enquire, what-i-make, lookbook, trust, how, about, visit, footer) with per-section design grades.

**Dependencies:** PR-A (renderer changes); soft-dependency on PR-B (shared `qa-visual.ts` orchestration code).

**Effort:** 7-8 hours.

**Risk:** Medium. Section slicing depends on the demos using semantic `<section>` elements consistently (they do, in the cohort). Customer-reaction prompt needs careful tuning to avoid genericness — first iteration may need a re-prompt.

---

### PR-D — SDK runner robustness

**Scope:** Production-grade error handling, cost flexibility, richer persona context. Targets the SDK runner's gaps surfaced by the code audit.

**Audit issues addressed:**
- SDK runner exits non-zero on layer failure, losing partial result (audit code-finding 2)
- `waitForTimeout(1200)` is fragile — already done in PR-A but the SDK runner needs to use the new render-result.json (audit code-finding 3)
- `max_tokens: 2000` too low for Layer 3 (audit code-finding 4)
- No retries on transient API failures (audit code-finding 6)
- No combined-mode for cost-conscious runs (audit code-finding 1)
- Persona context could be richer (audit code-finding 5)

**Files touched (in repo):**
- `apps/nerve/scripts/qa-visual.ts` — wrap each `callVision` in a retry-with-backoff helper; bump `max_tokens` to 3500; add `--combined` flag for single-call mode; write partial result on layer failure with `failed_layers: string[]`; pull richer persona context from `brief.enrichment.companies_house.officers` if available
- `apps/nerve/scripts/qa-visual-prompts.ts` — extend `buildOwnerReactionUserMessage` signature to accept richer persona fields; combined-mode prompt that asks for all three layers in one structured response
- `CHANGELOG/2026-05/2026-05-XX_NNN_qa_visual_sdk_robustness.md`

**Code changes:**

```ts
// qa-visual.ts — retry wrapper
async function callVisionWithRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 2): Promise<T> {
  let lastErr: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e as Error;
      const msg = lastErr.message;
      // Don't retry on 4xx
      if (/4\d{2}/.test(msg) && !/429/.test(msg)) throw e;
      console.error(`qa-visual: ${label} attempt ${attempt}/${maxAttempts} failed: ${msg.slice(0, 100)}`);
      if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastErr!;
}

// Partial result on failure
const failedLayers: string[] = [];
let bugs: BugFinding[] = [];
try { bugs = (await callVisionWithRetry(() => callBugLayer(), "bugs")).bugs; }
catch (e) { failedLayers.push("bugs"); console.error(`qa-visual: bugs layer failed permanently`); }

// ...same for brand_fidelity, owner_reaction, voice_consistency, customer_reaction, section_grades

const result: VisualQaResult = { /* ...with failed_layers in metadata... */ };
// always write what we have
writeFileSync(outPath, JSON.stringify(result, null, 2));
// exit 0 even if some layers failed — caller can check has_critical or failed_layers
process.exit(0);
```

```ts
// combined-mode prompt — single call returns all layers as one structured response
export const COMBINED_SYSTEM_PROMPT = `You are running a comprehensive visual-QA pass on a UK spec website. Apply all five layers of analysis in one structured response: bugs, brand_fidelity, owner_reaction, voice_consistency, customer_reaction. Use the same rubrics and schemas defined for each layer individually. Return ONE JSON object with all five layer outputs as top-level keys.`;
```

**Validation:**
- Force a network failure mid-run (block Anthropic via firewall). Confirm partial result file is written with `failed_layers: ["bugs"]` populated.
- Test `--combined` flag: confirm one Haiku call returns all five layer outputs in one JSON object, schema-validated.
- Confirm retry fires on simulated 429.
- Confirm cost difference: combined-mode ~£0.005, three-call mode ~£0.015.

**Dependencies:** PR-A (schema), PR-C (extended schema with Layer 4/5).

**Effort:** 3-4 hours.

**Risk:** Low. Pure SDK-runner internal changes; no external contract changes.

---

### PR-E — NERVE ingest route + Prisma model

**Scope:** Unblock the warehouse. Currently `POST /api/ingest/qa-visual-result` returns 404, which means every visual-QA finding sits in local files only. This PR adds the route, the Prisma model, the migration, and backfills the existing local files.

**Audit issues addressed:**
- NERVE `/api/ingest/qa-visual-result` returns 404 (audit code-finding A1 known issue)
- Without ingest, no cohort-baseline work possible (audit dependency for PR-G)

**Files touched (in repo):**
- `apps/nerve/prisma/schema.prisma` — add `QaVisualResult` model mirroring the `VisualQaResult` TS interface
- `apps/nerve/prisma/migrations/<datetime>_add_qa_visual_result.sql` — new migration
- `apps/nerve/src/app/api/ingest/qa-visual-result/route.ts` — POST handler, HMAC verification (mirror of `qa-result/route.ts` pattern), Zod-validate against `VisualQaResultSchema`, upsert on `qa_visual_id` natural key
- `apps/nerve/src/app/api/read/qa-visual/by-lead/route.ts` — GET handler `/api/read/qa-visual/by-lead?lead_id=<slug>` to fetch all visual-QA runs for a lead (for the operator UI)
- `apps/nerve/scripts/qa-visual.ts` — update the POST step to expect 200, surface a clean message on failure
- `apps/nerve/scripts/qa-visual-backfill.ts` — NEW; walks `~/Desktop/salespatch-demos/*/outputs/qa-visual-result.json` and POSTs each
- `CHANGELOG/2026-05/2026-05-XX_NNN_qa_visual_nerve_ingest.md`

**Files touched (skill):**
- `~/.claude/commands/build-demo.md` — update the manual-flow text to remove the "expect 404, continue" caveat once this PR ships

**Code changes (Prisma model):**

```prisma
model QaVisualResult {
  id                   String   @id @default(cuid())
  qa_visual_id         String   @unique
  artefact_id          String?
  lead_id              String
  demo_path            String?
  viewport_width       Int
  viewport_height      Int
  ran_at               DateTime
  producer             String   // "manual_skill" | "sdk_runner"
  model                String

  bugs                 Json     // BugFinding[]
  has_critical         Boolean
  bug_count            Int

  brand_fidelity       Json     // BrandFidelityResult
  owner_reaction       Json     // OwnerReaction
  voice_consistency    Json?    // VoiceConsistencyResult (PR-C)
  customer_reaction    Json?    // CustomerReaction (PR-C)
  section_grades       Json?    // SectionGrade[] (PR-C)
  failed_layers        Json?    // string[] (PR-D)

  notes                String?
  created_at           DateTime @default(now())

  @@index([lead_id, ran_at])
  @@index([artefact_id])
  @@index([has_critical])
}
```

**Validation:**
- Run the backfill script against existing local `qa-visual-result.json` files. Confirm each lands as a row in NERVE.
- POST the Bouquet Bar `qa-visual-result.json` to the new route. Expect HTTP 200 + inserted id.
- POST a malformed payload. Expect HTTP 400 + clear validation error.
- GET `/api/read/qa-visual/by-lead?lead_id=the-bouquet-bar`. Expect the recently-posted row.

**Dependencies:** PR-A (schema). Independent of PR-B/C/D in terms of pipeline behaviour.

**Effort:** 3 hours.

**Risk:** Low. Mirrors existing `qa-result` ingest pattern; Prisma migration is additive.

---

## PHASE 3 — LEVERAGE

### PR-F — Auto-fix loop in /build-demo

**Scope:** Turn visual QA from "report card" into "guardrail". When Layer 1 flags `severity=critical`, `/build-demo` attempts a known-good remedy, re-renders, re-runs QA. Closed-loop quality.

**Audit issues addressed:**
- Visual QA currently surfaces critical bugs but doesn't fix them (audit proposal 10 / leverage)

**Files touched (in repo):**
- `apps/nerve/scripts/qa-visual-remedies.ts` — NEW; pure-functional library of known-good fixes per bug pattern. Each remedy takes (`htmlString, bugFinding`) and returns updated `htmlString` or null if unfixable.
- `apps/nerve/scripts/qa-visual-autofix.ts` — NEW; orchestration script. Reads `qa-visual-result.json`, iterates over critical bugs, applies matching remedies, writes new `demo.html`, returns count of fixes applied.
- `CHANGELOG/2026-05/2026-05-XX_NNN_qa_visual_autofix_loop.md`

**Files touched (skill):**
- `~/.claude/commands/build-demo.md` — after the visual-QA pass, if `has_critical`, run `qa-visual-autofix.ts` → re-render → re-run visual QA. Loop max 3 iterations or until `has_critical: false`.

**Initial remedy library (extensible):**

```ts
// qa-visual-remedies.ts
type BugPattern =
  | "text_over_image_low_contrast"
  | "missing_above_fold_cta"
  | "redundant_cta_pair"
  | "status_as_cta"
  | "live_content_hardcoded";

const REMEDIES: Record<BugPattern, (html: string, bug: BugFinding) => string | null> = {
  text_over_image_low_contrast: (html, bug) => {
    // Find hero gradient overlay declarations and bump the top opacity stop
    return html.replace(
      /linear-gradient\(180deg,\s*rgba\(([^)]+),\s*0\.0?[0-2]\)\s+0%/g,
      "linear-gradient(180deg, rgba($1, 0.40) 0%"
    );
  },
  missing_above_fold_cta: (html, bug) => {
    // Insert a default CTA after the hero h1 if none exists in hero
    const heroH1Match = html.match(/<section[^>]*class="[^"]*hero[^"]*"[\s\S]*?<\/h1>/);
    if (!heroH1Match) return null;
    return html.replace(
      heroH1Match[0],
      heroH1Match[0] + '\n  <a class="cta" href="#enquire">Get in touch →</a>'
    );
  },
  live_content_hardcoded: (html, bug) => {
    // Wrap hardcoded "today" strings in <script> that renders current date
    // Or: remove the "Today" framing entirely, keep just the static schedule
    return html.replace(/Today\s*[·•|]\s*\w+\s+\d+\s+\w+/gi, "This week");
  },
  redundant_cta_pair: (html, bug) => {
    // Strip duplicate hero CTA if it matches nav CTA text exactly
    // Implementation reads bug.location to determine which to drop
    return null; // first iteration: log only, no auto-fix
  },
  status_as_cta: (html, bug) => null, // requires brief content; auto-fix unsafe
};

export function applyRemedies(html: string, bugs: BugFinding[]): { html: string; applied: string[]; unfixable: string[] } {
  let current = html;
  const applied: string[] = [];
  const unfixable: string[] = [];
  for (const bug of bugs.filter(b => b.severity === "critical")) {
    const pattern = inferPattern(bug);
    const remedy = pattern ? REMEDIES[pattern] : null;
    if (!remedy) { unfixable.push(bug.location); continue; }
    const next = remedy(current, bug);
    if (next === null) { unfixable.push(bug.location); continue; }
    current = next;
    applied.push(`${pattern}@${bug.location}`);
  }
  return { html: current, applied, unfixable };
}
```

```bash
# Skill text — auto-fix loop
ITER=0
while [ $ITER -lt 3 ]; do
  RESULT=$(jq -r '.has_critical' "$LEAD_DIR/outputs/qa-visual-result.json")
  [ "$RESULT" = "false" ] && break
  npx tsx apps/nerve/scripts/qa-visual-autofix.ts "$LEAD_DIR/outputs/demo.html"
  # autofix overwrites demo.html
  npx tsx apps/nerve/scripts/qa-visual-render.ts "$LEAD_DIR/outputs/demo.html"
  # re-run visual QA manually or via SDK
  # ...
  ITER=$((ITER+1))
done
```

**Validation:**
- Run on the Bouquet Bar demo unmodified. Expect critical-bug detected → remedy applied (gradient bumped) → re-render → critical-bug gone.
- Force-create a demo with a hardcoded "Today · Wed 7 May" string. Expect remedy → "This week" replacement → critical-bug gone.
- Force-create a demo with no above-fold CTA. Expect remedy → default CTA inserted.
- Confirm max-3-iteration cap fires if a bug is unfixable.

**Dependencies:** PR-B (the bug patterns must exist as detected categories first).

**Effort:** 6-8 hours.

**Risk:** Medium-high. Auto-modifying generated HTML is delicate. First iteration ships with a small, conservative remedy library and explicit `unfixable` reporting — better to report a critical bug honestly than to half-fix it and lie.

---

### PR-G — Cohort baselines + relative grading

**Scope:** Turn QA from absolute to relative. Once N ≥ 10 closed demos exist per vertical, NERVE returns vertical-level baselines. Each new demo's visual QA gets a `baseline_comparison` block flagging dimensions below median.

**Audit issues addressed:**
- All grading is currently absolute; can't say "your typography is below average for this vertical" (audit proposal 12)

**Files touched (in repo):**
- `apps/nerve/src/app/api/read/qa-visual/baselines/route.ts` — GET `/api/read/qa-visual/baselines?vertical=X`. Returns median grades per Layer-2 dimension, % with critical bugs, etc., across all rows for that vertical.
- `apps/nerve/scripts/qa-visual.ts` — fetch baselines for the demo's vertical before running layers; pass baselines as additional context to Layer 2 brand-fidelity prompt ("the vertical median palette grade is 4.3 — grade this one against that").
- `apps/nerve/scripts/qa-visual-prompts.ts` — extend `VisualQaResult` with `baseline_comparison: { dimension, this_grade, vertical_median, below_baseline } []`.
- `CHANGELOG/2026-05/2026-05-XX_NNN_qa_visual_baselines.md`

**Validation:**
- After ingest-backfill (PR-E) populates ≥ 5 demos per vertical, hit the baselines endpoint, confirm median calculations.
- Run visual QA on a new demo, confirm `baseline_comparison` block is populated.
- Confirm `below_baseline: true` fires for a dimension scoring below the vertical median.

**Dependencies:** PR-E (ingest must exist). Soft-dependency on accumulating ≥ 10 demos before baselines become meaningful — until then the endpoint returns `{baselines_available: false}` and the visual QA continues without the comparison.

**Effort:** 4-5 hours.

**Risk:** Low. Read-only addition; degrades cleanly when no baseline data exists.

---

### PR-H — Photo quality grading

**Scope:** For each `<img>` in the demo, vision rates focus/composition/lighting/role-suitability on 1-5. Catches the "blurry phone snap as hero" failure mode.

**Audit issues addressed:**
- Build picks first photo for role rather than best (audit finding A6)

**Files touched (in repo):**
- `apps/nerve/scripts/qa-visual-prompts.ts` — add `PHOTO_QUALITY_SYSTEM_PROMPT`, `buildPhotoQualityUserMessage`, `PhotoQualityResult` interface (array of `{filename, role, focus_grade, composition_grade, lighting_grade, role_fit_grade, overall, note}`)
- `apps/nerve/scripts/qa-visual.ts` — extract every photo from the demo HTML (base64 decode), feed to a new Layer-6 vision call
- `apps/nerve/scripts/qa-visual-prompts.md` — mirror
- `CHANGELOG/2026-05/2026-05-XX_NNN_qa_visual_photo_quality.md`

**Validation:**
- Run against Bouquet Bar demo. Expect 15 per-photo grades. Hero (`fb_the-bouquet-bar_cover.jpg`) should score highly on composition + role fit; some FB-scraped post photos may score lower on focus.
- Run against a demo with a known weak photo. Confirm low grade.

**Dependencies:** PR-A (renderer + foundation). Independent of other PRs.

**Effort:** 4-5 hours.

**Risk:** Medium. Sending 15+ images per QA increases call cost (~£0.05 per demo if each photo is its own call) — should batch or use a single multi-image prompt. Mitigation: per-photo grading is gated behind a `--with-photo-grades` flag, off by default.

---

### PR-I — A/B variant scoring

**Scope:** `/build-demo` optionally produces 2-3 hero variants (different positioning approaches, palette emphasis, photo selection). Visual QA scores each. Build ships the winner.

**Audit issues addressed:**
- Currently one demo per brief, no iteration on the hero where 80% of conversion lives (audit proposal 13)

**Files touched (in repo):**
- `apps/nerve/scripts/qa-visual-variant-selector.ts` — NEW; takes 2-3 candidate demo.html paths, runs visual QA on each, returns the winner with the score breakdown
- `CHANGELOG/2026-05/2026-05-XX_NNN_qa_visual_ab_variants.md`

**Files touched (skill):**
- `~/.claude/commands/build-demo.md` — add an optional "variant mode" step: instead of building one demo, build 2-3 with different hero approaches, then run the variant selector

**Variant strategies for v1:**
- Variant A: text-on-solid-colour hero (no photo)
- Variant B: text-beside-photo split hero
- Variant C: text-over-photo hero with strong overlay (the current default)

**Validation:**
- Build all 3 variants for the Bouquet Bar brief. Confirm visual QA scores each. Confirm the winner is selected by combined score: `(brand_fidelity*2 + owner_reaction_to_numeric + (10 - critical_bug_count*10)) / (other_two_averaged)`.
- Manually verify the winner is the strongest demo of the three.

**Dependencies:** PR-A, PR-B, PR-C, PR-D (full QA pipeline). Soft-dependency on PR-G (baselines) for relative scoring.

**Effort:** 7-9 hours.

**Risk:** Medium. The 2x+ build effort + 3x QA cost per demo is significant. Worth gating behind a flag and measuring whether it actually moves close rate before making default.

---

### PR-J — Competitor comparison render

**Scope:** `/spec-site-brief` already surfaces top competitor URLs. PR-J adds a step: render those competitors at 375x812, run a comparative trust-judgment vision pass, return a "your demo vs competitor median" score the rep can show at the door.

**Audit issues addressed:**
- Visual QA judges each demo in isolation; no competitive proof point (audit proposal 15)

**Files touched (in repo):**
- `apps/nerve/scripts/qa-visual-competitors.ts` — NEW; takes a list of competitor URLs, renders each at 375×812, sends N+1 screenshots (this demo + competitors) to a new comparative-trust vision call, returns ranked output
- `apps/nerve/scripts/qa-visual-prompts.ts` — add `COMPETITOR_COMPARE_SYSTEM_PROMPT`, `CompetitorCompareResult` interface
- `CHANGELOG/2026-05/2026-05-XX_NNN_qa_visual_competitor_compare.md`

**Files touched (skill):**
- `~/.claude/commands/spec-site-brief.md` — already surfaces competitor URLs in Phase 1 verify; new section instructs in-session Claude to save them to `outputs/competitors.json`
- `~/.claude/commands/build-demo.md` — after standard visual QA, optionally invoke `qa-visual-competitors.ts` if `outputs/competitors.json` exists

**Validation:**
- For Bouquet Bar (competitors: Anastasia, Bauers, Flower Vogue), confirm renderer captures all four at 375×812.
- Vision pass returns ranked trust judgment with the demo placed in the ranking.
- Add the rank to the `/build-demo` chat output: "Visual-QA: this demo ranked #2 of 4 (Anastasia #1)" — honest signal, not always flattering.

**Dependencies:** PR-A (renderer). Soft-dependency on `/spec-site-brief` already capturing competitor URLs (currently inconsistent — may need brief skill update first).

**Effort:** 5-6 hours.

**Risk:** Low-medium. Some competitor sites may be slow to load or behind login walls — needs graceful failure for unrenderable URLs.

---

## Out of scope for this plan

Audit-mentioned items deferred indefinitely (or until cohort signal demands them):
- **Performance metrics** (LCP/CLS/TTI from Playwright) — useful long-term, doesn't move first-impression close rate
- **Form-submission simulation** — manual test step exists; low value
- **Cross-browser render** (Safari, Firefox) — Chromium covers the vast majority of pitch-time devices
- **Real WCAG luminance math via axe-core** — vision is currently good enough at "obviously failing" vs "obviously fine"
- **Demo-to-final drift tracker** — useful only after fulfilment volume picks up

---

## Dependency graph (full)

```
PR-A (foundation)
  ├─ PR-B (Layer 1 + dynamic)
  │   └─ PR-F (auto-fix loop)
  ├─ PR-C (voice + customer + section)
  ├─ PR-D (SDK robustness)        (soft-depends on PR-C schema)
  ├─ PR-E (NERVE ingest)
  │   └─ PR-G (baselines)
  ├─ PR-H (photo quality)
  ├─ PR-I (A/B variants)          (depends on PR-A through PR-D)
  └─ PR-J (competitor compare)
```

## Effort summary

| PR | Phase | Effort | Cumulative |
|----|-------|--------|------------|
| PR-A | Foundation | 4-5h | 5h |
| PR-B | Detection | 6-8h | 13h |
| PR-C | Detection | 7-8h | 21h |
| PR-D | Detection | 3-4h | 25h |
| PR-E | Detection | 3h | 28h |
| PR-F | Leverage | 6-8h | 36h |
| PR-G | Leverage | 4-5h | 41h |
| PR-H | Leverage | 4-5h | 46h |
| PR-I | Leverage | 7-9h | 55h |
| PR-J | Leverage | 5-6h | 61h |

Foundation + Detection (PR-A through PR-E) = **~28 hours**. That covers every issue surfaced by the audit. Everything beyond is leverage.

## Recommended cadence

**Week 1:** PR-A → PR-B → PR-C
- Ship the foundation, the highest-leverage bug detection, and the qualitative-coverage expansion.

**Week 2:** PR-D → PR-E
- SDK robustness + NERVE ingest. After PR-E lands, every visual-QA finding flows into the warehouse and the cohort-baseline work becomes possible.

**Week 3 onwards:** Leverage PRs based on observed pain. PR-F (auto-fix) is the natural next step if `has_critical` keeps firing on new demos. PR-G (baselines) becomes valuable after ~10 closed demos in any vertical. PR-I (A/B variants) and PR-J (competitor compare) are pitch-time-impact bets — ship when close rate plateaus and we need new levers.

After PR-A through PR-E ship, every issue surfaced by `qa-visual-AUDIT.md` is closed. Leverage PRs are choices, not fixes.
