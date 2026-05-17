/**
 * Visual-QA SDK runner — three-layer vision pass against a built demo.html.
 *
 * Producer parity: this runner produces the exact same `VisualQaResult`
 * shape as the manual /build-demo flow. The single source of truth for
 * prompts + schema is `qa-visual-prompts.ts`; both this runner and the
 * skill text read from there.
 *
 * Currently dormant — gated on env-var presence with a clean skip. The
 * /build-demo skill's manual orchestration is the active path until
 * ANTHROPIC_API_KEY or OPENROUTER_API_KEY is present.
 *
 * Pipeline:
 *   1. Render demo.html headless at 375×812 via qa-visual-render.ts
 *      (or accept an existing .qa-visual/ render directory).
 *   2. Load brand-analysis.json + brief.json from the demo's outputs/
 *      sibling for layer-2/3 context.
 *   3. Three Anthropic SDK vision calls (one per layer).
 *   4. Compose into the canonical VisualQaResult shape and write to
 *      outputs/qa-visual-result.json.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... npx tsx apps/nerve/scripts/qa-visual.ts \
 *     ~/Desktop/salespatch-demos/<slug>/outputs/demo.html
 *
 * On failure (network / parse / api key missing), exits non-zero and
 * writes nothing. The /build-demo skill's manual flow is the fallback.
 */

import Anthropic from "@anthropic-ai/sdk";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename, join } from "node:path";
import {
  BUGS_SYSTEM_PROMPT,
  BRAND_FIDELITY_SYSTEM_PROMPT,
  OWNER_REACTION_SYSTEM_PROMPT,
  VOICE_CONSISTENCY_SYSTEM_PROMPT,
  CUSTOMER_REACTION_SYSTEM_PROMPT,
  SECTION_GRADING_SYSTEM_PROMPT,
  buildBugsUserMessage,
  buildBrandFidelityUserMessage,
  buildOwnerReactionUserMessage,
  buildVoiceConsistencyUserMessage,
  buildCustomerReactionUserMessage,
  buildSectionGradingUserMessage,
  validateVisualQaResult,
  BASELINE_DRIFT_THRESHOLD,
  type VisualQaResult,
  type BugFinding,
  type BrandFidelityResult,
  type OwnerReaction,
  type VoiceConsistencyResult,
  type CustomerReaction,
  type SectionGrade,
  type DynamicScanSummary,
  type BaselineComparison,
  type BaselineDimensionComparison,
} from "./qa-visual-prompts";

const VIEWPORT = { width: 375, height: 812 };
const MODEL = "claude-haiku-4-5-20251001";

function loadApiKey(): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  // Fallback: source from apps/nerve/.env.local if present
  const envPaths = [
    resolve(__dirname, "../.env.local"),
    resolve(process.cwd(), "apps/nerve/.env.local"),
  ];
  for (const p of envPaths) {
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(
      /^ANTHROPIC_API_KEY=["']?([^"'\n]+)["']?/m,
    );
    if (m && m[1] && m[1].length > 10) return m[1];
  }
  throw new Error(
    "ANTHROPIC_API_KEY not set. Skip the SDK runner; the /build-demo manual visual-QA flow is the active path.",
  );
}

function ensureRender(htmlPath: string): { heroPath: string; fullPath: string } {
  const outputsDir = dirname(htmlPath);
  const qaDir = join(outputsDir, ".qa-visual");
  const heroPath = join(qaDir, "hero.png");
  const fullPath = join(qaDir, "full.png");

  if (existsSync(heroPath) && existsSync(fullPath)) {
    return { heroPath, fullPath };
  }

  console.error("qa-visual: invoking qa-visual-render.ts...");
  const renderScript = resolve(__dirname, "qa-visual-render.ts");
  const result = spawnSync("npx", ["tsx", renderScript, htmlPath, qaDir], {
    stdio: ["inherit", "pipe", "inherit"],
  });
  if (result.status !== 0) {
    throw new Error(`qa-visual-render.ts failed (exit ${result.status})`);
  }
  return { heroPath, fullPath };
}

const NERVE_BASE_URL =
  process.env.NERVE_BASE_URL ?? "https://nerve.salespatch.co.uk";

/**
 * PR-G: pre-fetch cohort baselines for the lead's vertical from the
 * /api/read/qa-visual/baselines NERVE endpoint. Read-only call, no
 * HMAC needed. Returns null on any failure (network down, endpoint
 * missing, vertical unknown) — the caller treats null as "no cohort
 * yet" and emits an empty baseline_comparison so downstream queries
 * can still distinguish that case from "pre-PR-G producer".
 */
async function fetchBaselineSummary(
  vertical: string | null,
): Promise<{
  total_n: number;
  baselines_available: boolean;
  medians: {
    brand_fidelity: number | null;
    voice_consistency: number | null;
    section_grades_mean: number | null;
  } | null;
  cohort_rates: BaselineComparison["cohort_rates"];
} | null> {
  const params = vertical ? `?vertical=${encodeURIComponent(vertical)}` : "";
  const url = `${NERVE_BASE_URL}/api/read/qa-visual/baselines${params}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(
        `qa-visual: baselines fetch returned ${res.status} — proceeding without cohort comparison`,
      );
      return null;
    }
    const data = (await res.json()) as {
      total_n: number;
      baselines_available: boolean;
      medians: {
        brand_fidelity: number | null;
        voice_consistency: number | null;
        section_grades_mean: number | null;
      } | null;
      cohort_rates: BaselineComparison["cohort_rates"];
    };
    return data;
  } catch (e) {
    console.error(
      `qa-visual: baselines fetch failed (${(e as Error).message}) — proceeding without cohort comparison`,
    );
    return null;
  }
}

/**
 * PR-G: compose the baseline_comparison field from this demo's results
 * and the pre-fetched cohort baseline. Pure function — no IO.
 *
 * When the cohort hasn't reached n>=10 yet, returns the
 * baselines_available: false shape with empty dimensions and null
 * cohort_rates. Producers should still attach this so downstream
 * queries can distinguish "no cohort yet" from "pre-PR-G producer".
 *
 * When a layer failed in this demo (null), the corresponding
 * dimension's this_grade is null AND below_baseline is null. The
 * vision-call failure doesn't mean the demo is below baseline; it
 * means we don't know.
 */
function composeBaselineComparison(opts: {
  vertical: string | null;
  baselineSummary: Awaited<ReturnType<typeof fetchBaselineSummary>>;
  thisBrandFidelity: BrandFidelityResult | null;
  thisVoiceConsistency: VoiceConsistencyResult | null;
  thisSectionGrades: SectionGrade[] | null;
}): BaselineComparison {
  const { vertical, baselineSummary } = opts;
  if (!baselineSummary || !baselineSummary.baselines_available) {
    return {
      vertical,
      baseline_n: baselineSummary?.total_n ?? 0,
      baselines_available: false,
      dimensions: [],
      cohort_rates: null,
    };
  }
  const medians = baselineSummary.medians!; // guaranteed by baselines_available=true contract
  const dimensions: BaselineDimensionComparison[] = [];

  if (medians.brand_fidelity !== null) {
    const thisGrade = opts.thisBrandFidelity?.overall_grade ?? null;
    dimensions.push({
      name: "brand_fidelity",
      this_grade: thisGrade,
      vertical_median: medians.brand_fidelity,
      below_baseline:
        thisGrade === null
          ? null
          : thisGrade < medians.brand_fidelity - BASELINE_DRIFT_THRESHOLD,
    });
  }
  if (medians.voice_consistency !== null) {
    const thisGrade = opts.thisVoiceConsistency?.overall_grade ?? null;
    dimensions.push({
      name: "voice_consistency",
      this_grade: thisGrade,
      vertical_median: medians.voice_consistency,
      below_baseline:
        thisGrade === null
          ? null
          : thisGrade < medians.voice_consistency - BASELINE_DRIFT_THRESHOLD,
    });
  }
  if (medians.section_grades_mean !== null) {
    const thisMean =
      opts.thisSectionGrades && opts.thisSectionGrades.length > 0
        ? opts.thisSectionGrades.reduce((sum, s) => sum + s.grade, 0) /
          opts.thisSectionGrades.length
        : null;
    dimensions.push({
      name: "section_grades_mean",
      this_grade: thisMean,
      vertical_median: medians.section_grades_mean,
      below_baseline:
        thisMean === null
          ? null
          : thisMean < medians.section_grades_mean - BASELINE_DRIFT_THRESHOLD,
    });
  }
  return {
    vertical,
    baseline_n: baselineSummary.total_n,
    baselines_available: true,
    dimensions,
    cohort_rates: baselineSummary.cohort_rates,
  };
}

/**
 * Run the static-source dynamic-content scan (PR-B). Spawns
 * qa-visual-dynamic.ts as a subprocess; reads the result back from
 * .qa-visual/dynamic-scan.json. The scan is deterministic + fast
 * (~50ms), so we always run it fresh rather than cache.
 */
function runDynamicScan(htmlPath: string): DynamicScanSummary {
  const outputsDir = dirname(htmlPath);
  const qaDir = join(outputsDir, ".qa-visual");
  const scanPath = join(qaDir, "dynamic-scan.json");

  const dynamicScript = resolve(__dirname, "qa-visual-dynamic.ts");
  const result = spawnSync("npx", ["tsx", dynamicScript, htmlPath, scanPath], {
    stdio: ["inherit", "pipe", "inherit"],
  });
  if (result.status !== 0) {
    throw new Error(`qa-visual-dynamic.ts failed (exit ${result.status})`);
  }
  const raw = JSON.parse(readFileSync(scanPath, "utf8"));
  return {
    has_date_logic: raw.has_date_logic,
    has_time_logic: raw.has_time_logic,
    candidates: raw.candidates,
    summary: raw.summary,
  };
}

interface BriefSubset {
  business_name: string;
  business_type: string;
  address: string;
  owner_name: string | null;
  diagnosis: string;
  test_of_success: string;
  brief_id: string | null;
  vertical: string | null;
  /** Voice quotes the brief committed to preserving in the demo (Layer 4 input). */
  voice_quotes: string[];
  /** PR-D: Companies House officers (if matched) — enriches Layer 3 owner persona. */
  officers: string[];
  /** PR-D: Years trading as int (if matched) — enriches Layer 3 owner persona. */
  years_trading_int: number | null;
}

interface BrandAnalysisSubset {
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
  /** Voice quotes — lives on brand-analysis.json per the spec-site-brief skill. Brief.json may also carry these. */
  voice_quotes?: string[];
}

interface SectionSlice {
  index: number;
  label: string;
  path: string;
}

function loadContext(htmlPath: string): {
  brief: BriefSubset;
  brand: BrandAnalysisSubset;
  artefactId: string | null;
  leadId: string;
} {
  const outputsDir = dirname(htmlPath);
  const briefPath = join(outputsDir, "brief.json");
  const brandPath = join(outputsDir, "brand-analysis.json");
  const artefactPath = join(outputsDir, "demo-artefact.json");

  if (!existsSync(briefPath)) {
    throw new Error(`brief.json not found at ${briefPath} — cannot run layer 3`);
  }
  if (!existsSync(brandPath)) {
    throw new Error(`brand-analysis.json not found at ${brandPath} — cannot run layer 2`);
  }
  const brief = JSON.parse(readFileSync(briefPath, "utf8"));
  const brand = JSON.parse(readFileSync(brandPath, "utf8"));
  const artefact = existsSync(artefactPath)
    ? JSON.parse(readFileSync(artefactPath, "utf8"))
    : null;

  // Voice quotes can live on either brief.json (Layer 4 input per the
  // spec-site-brief skill) OR brand-analysis.json. Prefer brand-analysis
  // (Phase 2 of the brief skill writes voice_quotes there) and fall
  // back to brief if absent.
  const voiceQuotes: string[] = Array.isArray(brand.voice_quotes)
    ? brand.voice_quotes
    : Array.isArray(brief.voice_quotes)
      ? brief.voice_quotes
      : [];

  // PR-D: pull enrichment context for richer Layer 3 persona.
  // metadata.enrichment.companies_house lives on brief.json per the
  // spec-site-brief skill. Fall through cleanly when absent.
  const enrichment = brief.metadata?.enrichment ?? {};
  const ch = enrichment.companies_house ?? {};
  const officers: string[] = Array.isArray(ch.officers)
    ? ch.officers.map((o: unknown) => (typeof o === "string" ? o : "")).filter(Boolean)
    : [];
  const yearsTradingInt: number | null =
    typeof ch.years_trading === "number" ? ch.years_trading : null;

  return {
    brief: {
      business_name: brief.business_name,
      business_type: brief.business_type,
      address: brief.address,
      owner_name: brief.owner_name,
      diagnosis: brief.diagnosis,
      test_of_success: brief.test_of_success,
      brief_id: brief.brief_id,
      vertical: brief.vertical ?? null,
      voice_quotes: voiceQuotes,
      officers,
      years_trading_int: yearsTradingInt,
    },
    brand: {
      dominant_hex: brand.dominant_hex,
      dominant_pct: brand.dominant_pct,
      neutral_hex: brand.neutral_hex,
      neutral_pct: brand.neutral_pct,
      accent_hex: brand.accent_hex,
      accent_pct: brand.accent_pct,
      display_font: brand.display_font,
      body_font: brand.body_font,
      logo_description: brand.logo_description,
      positioning_reference: brand.positioning_reference,
      positioning_rationale: brand.positioning_rationale,
      asset_notes: brand.asset_notes,
    },
    artefactId: artefact?.artefact_id ?? null,
    leadId: brief.lead_id,
  };
}

function parseJsonResponse<T>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch (e) {
    throw new Error(
      `model returned unparseable JSON: ${(e as Error).message}\nRaw: ${cleaned.slice(0, 500)}`,
    );
  }
}

/**
 * Wrap a vision-call promise with single-retry-with-backoff for
 * transient API failures (network resets, 5xx, 429 rate limits). 4xx
 * other than 429 are non-recoverable — fail fast.
 *
 * Returns the result on success. Throws after `maxAttempts` failures.
 * Caller-side: catch and append the layer name to `failed_layers`
 * rather than aborting the whole run.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 2,
): Promise<T> {
  let lastErr: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e as Error;
      const msg = lastErr.message;
      // Anthropic SDK surfaces status in the message. 4xx (non-429) is
      // a permanent error — bad request, auth, etc. Don't waste a retry.
      const is4xxNon429 = /\b4(?:0[0-46-9]|1\d|2[0-7])\b/.test(msg) && !/\b429\b/.test(msg);
      if (is4xxNon429) {
        console.error(`qa-visual: ${label} attempt ${attempt} failed (no retry): ${msg.slice(0, 120)}`);
        throw e;
      }
      console.error(`qa-visual: ${label} attempt ${attempt}/${maxAttempts} failed: ${msg.slice(0, 120)}`);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }
  throw lastErr ?? new Error(`${label} failed with no error captured`);
}

/**
 * Attempt a layer's vision call with retry; on permanent failure,
 * return null + push the layer name to `failedLayers`. Caller decides
 * what to do with the null (write it to qa-visual-result.json as-is,
 * documenting the partial result).
 */
async function tryLayer<T>(
  fn: () => Promise<T>,
  layerName: string,
  failedLayers: string[],
): Promise<T | null> {
  try {
    return await withRetry(fn, layerName);
  } catch (e) {
    console.error(`qa-visual: ${layerName} FAILED PERMANENTLY: ${(e as Error).message.slice(0, 160)}`);
    failedLayers.push(layerName);
    return null;
  }
}

async function callVision(
  client: Anthropic,
  systemPrompt: string,
  userMessage: string,
  imageB64s: string[],
): Promise<string> {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 3500,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: userMessage },
          ...imageB64s.map((data) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: "image/png" as const, data },
          })),
        ],
      },
    ],
  });
  const text = msg.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("vision call returned no text block");
  }
  return text.text;
}

/**
 * Load the per-section slice paths from the renderer's
 * render-result.json. Returns empty array if the file is missing
 * (running against a demo rendered by a pre-PR-C renderer) or if the
 * renderer detected no sections.
 */
function loadSectionSlices(htmlPath: string): SectionSlice[] {
  const renderResultPath = join(dirname(htmlPath), ".qa-visual", "render-result.json");
  if (!existsSync(renderResultPath)) return [];
  try {
    const raw = JSON.parse(readFileSync(renderResultPath, "utf8"));
    if (!Array.isArray(raw.sections)) return [];
    return raw.sections
      .filter((s: { path?: string }) => typeof s.path === "string" && existsSync(s.path))
      .map((s: { index: number; label: string; path: string }) => ({
        index: s.index,
        label: s.label,
        path: s.path,
      }));
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const [, , htmlPathArg] = process.argv;
  if (!htmlPathArg) {
    console.error("usage: qa-visual.ts <demo.html>");
    process.exit(1);
  }

  const htmlPath = resolve(htmlPathArg);
  if (!existsSync(htmlPath)) {
    console.error(`ERROR: ${htmlPath} not found`);
    process.exit(1);
  }

  const apiKey = loadApiKey();
  const client = new Anthropic({ apiKey });

  const { heroPath, fullPath } = ensureRender(htmlPath);
  const heroB64 = readFileSync(heroPath).toString("base64");
  const fullB64 = readFileSync(fullPath).toString("base64");
  console.error(
    `qa-visual: rendered (hero=${(heroB64.length / 1024).toFixed(0)}KB b64, full=${(fullB64.length / 1024).toFixed(0)}KB b64)`,
  );

  // Run the static-source dynamic-content scan before Layer 1 so the
  // bugs prompt has ground-truth on which "live-looking" phrases are
  // wired vs hardcoded. Cheap, deterministic, no API spend.
  const dynamicScan = runDynamicScan(htmlPath);
  console.error(`qa-visual: dynamic-scan — ${dynamicScan.summary}`);

  const { brief, brand, artefactId, leadId } = loadContext(htmlPath);

  // Load per-section slices (PR-C). If the renderer was pre-PR-C or the
  // page has no sections, sectionSlices is [] and Layer 6 emits an empty
  // section_grades array.
  const sectionSlices = loadSectionSlices(htmlPath);
  console.error(`qa-visual: sections=${sectionSlices.length}`);

  // PR-G: pre-fetch cohort baselines for the lead's vertical. Read-only
  // fetch, ~50ms when the warehouse responds. Null on any failure — the
  // composer treats null as "no cohort yet" and emits an empty
  // baseline_comparison so downstream queries can still distinguish
  // that case from "pre-PR-G producer".
  const baselineSummary = await fetchBaselineSummary(brief.vertical);
  if (baselineSummary) {
    console.error(
      `qa-visual: baselines — n=${baselineSummary.total_n}` +
        (baselineSummary.baselines_available ? "" : " (below n=10 threshold)"),
    );
  }

  // PR-D: each layer call goes through tryLayer, which retries once on
  // transient failures and records permanent failures in failedLayers[]
  // rather than aborting the whole run. A partial result with documented
  // failed layers is more useful than a missing file when one API call
  // hits a 429 we can't recover from.
  const failedLayers: string[] = [];

  // ── LAYER 1: Bugs ───────────────────────────────────────────────────
  console.error(`qa-visual: layer 1 (bugs)...`);
  const bugsResult = await tryLayer(
    async () => {
      const raw = await callVision(
        client,
        BUGS_SYSTEM_PROMPT,
        buildBugsUserMessage({
          businessName: brief.business_name,
          viewportWidth: VIEWPORT.width,
          viewportHeight: VIEWPORT.height,
          dynamicScan,
        }),
        [heroB64, fullB64],
      );
      return parseJsonResponse<{ bugs: BugFinding[]; notes?: string }>(raw);
    },
    "bugs",
    failedLayers,
  );

  // ── LAYER 2: Brand fidelity ─────────────────────────────────────────
  console.error(`qa-visual: layer 2 (brand fidelity)...`);
  const brandResult = await tryLayer(
    async () => {
      const raw = await callVision(
        client,
        BRAND_FIDELITY_SYSTEM_PROMPT,
        buildBrandFidelityUserMessage({
          businessName: brief.business_name,
          brandAnalysis: brand,
        }),
        [heroB64, fullB64],
      );
      return parseJsonResponse<BrandFidelityResult>(raw);
    },
    "brand_fidelity",
    failedLayers,
  );

  // ── LAYER 3: Owner reaction ─────────────────────────────────────────
  console.error(`qa-visual: layer 3 (owner reaction)...`);
  const reactionResult = await tryLayer(
    async () => {
      const raw = await callVision(
        client,
        OWNER_REACTION_SYSTEM_PROMPT,
        buildOwnerReactionUserMessage({
          businessName: brief.business_name,
          businessType: brief.business_type,
          address: brief.address,
          ownerName: brief.owner_name,
          diagnosis: brief.diagnosis,
          testOfSuccess: brief.test_of_success,
          // PR-D: richer persona — enrichment.companies_house.officers (if matched) and years_trading
          officers: brief.officers,
          yearsTrading: brief.years_trading_int,
        }),
        [heroB64, fullB64],
      );
      return parseJsonResponse<OwnerReaction>(raw);
    },
    "owner_reaction",
    failedLayers,
  );

  // ── LAYER 4: Voice consistency (PR-C) ───────────────────────────────
  console.error(`qa-visual: layer 4 (voice consistency, ${brief.voice_quotes.length} quotes)...`);
  const voiceResult = await tryLayer(
    async () => {
      const raw = await callVision(
        client,
        VOICE_CONSISTENCY_SYSTEM_PROMPT,
        buildVoiceConsistencyUserMessage({
          businessName: brief.business_name,
          voiceQuotes: brief.voice_quotes,
        }),
        [heroB64, fullB64],
      );
      return parseJsonResponse<VoiceConsistencyResult>(raw);
    },
    "voice_consistency",
    failedLayers,
  );

  // ── LAYER 5: Customer reaction (PR-C) ───────────────────────────────
  console.error(`qa-visual: layer 5 (customer reaction)...`);
  const customerResult = await tryLayer(
    async () => {
      const raw = await callVision(
        client,
        CUSTOMER_REACTION_SYSTEM_PROMPT,
        buildCustomerReactionUserMessage({
          businessName: brief.business_name,
          businessType: brief.business_type,
          address: brief.address,
          vertical: brief.vertical,
        }),
        [heroB64, fullB64],
      );
      return parseJsonResponse<CustomerReaction>(raw);
    },
    "customer_reaction",
    failedLayers,
  );

  // ── LAYER 6: Section grading (PR-C) ─────────────────────────────────
  let sectionGrades: SectionGrade[] | null = [];
  if (sectionSlices.length > 0) {
    console.error(`qa-visual: layer 6 (section grading, ${sectionSlices.length} slices)...`);
    const sectionImagesB64 = sectionSlices.map((s) =>
      readFileSync(s.path).toString("base64"),
    );
    const sectionParsed = await tryLayer(
      async () => {
        const raw = await callVision(
          client,
          SECTION_GRADING_SYSTEM_PROMPT,
          buildSectionGradingUserMessage({
            businessName: brief.business_name,
            sectionLabels: sectionSlices.map((s) => s.label),
          }),
          sectionImagesB64,
        );
        return parseJsonResponse<{ section_grades: SectionGrade[] }>(raw);
      },
      "section_grades",
      failedLayers,
    );
    sectionGrades = sectionParsed?.section_grades ?? null;
  } else {
    console.error(`qa-visual: layer 6 (section grading) — skipped, no slices`);
    // No sections in the page is structurally different from "layer
    // failed". Stay as [] (valid empty case), don't add to failedLayers.
  }

  // ── Compose canonical result ────────────────────────────────────────
  const ranAt = new Date().toISOString();
  const ranAtNoColons = ranAt.replace(/[:.]/g, "");
  const result: VisualQaResult = {
    qa_visual_id: `${leadId}-qa-visual-${ranAtNoColons}`,
    artefact_id: artefactId,
    lead_id: leadId,
    demo_path: htmlPath,
    viewport: VIEWPORT,
    ran_at: ranAt,
    producer: "sdk_runner",
    model: MODEL,
    bugs: bugsResult?.bugs ?? null,
    has_critical: bugsResult ? bugsResult.bugs.some((b) => b.severity === "critical") : null,
    bug_count: bugsResult?.bugs.length ?? null,
    brand_fidelity: brandResult,
    owner_reaction: reactionResult,
    voice_consistency: voiceResult,
    customer_reaction: customerResult,
    section_grades: sectionGrades,
    ...(failedLayers.length > 0 ? { failed_layers: failedLayers as VisualQaResult["failed_layers"] } : {}),
    // PR-G: per-demo comparison against the cohort baseline (when available).
    // Always present so downstream queries can distinguish "no cohort yet"
    // (baselines_available: false, dimensions: []) from "pre-PR-G producer"
    // (field absent entirely).
    baseline_comparison: composeBaselineComparison({
      vertical: brief.vertical,
      baselineSummary,
      thisBrandFidelity: brandResult,
      thisVoiceConsistency: voiceResult,
      thisSectionGrades: sectionGrades,
    }),
    notes: bugsResult?.notes,
  };

  // Guard: validate the canonical shape BEFORE writing. A schema drift
  // here would silently contaminate the warehouse — catch it at the
  // producer with a clear error message instead.
  const validation = validateVisualQaResult(result);
  if (!validation.valid) {
    console.error(`qa-visual: SCHEMA VIOLATION — refusing to write`);
    for (const err of validation.errors) console.error(`  - ${err}`);
    process.exit(2);
  }

  const outPath = join(dirname(htmlPath), "qa-visual-result.json");
  writeFileSync(outPath, JSON.stringify(result, null, 2));

  // ── Stderr summary mirrors the /build-demo skill's surface ──────────
  // PR-D: any nullable layer field renders as "(failed)" in the summary
  // line so the caller can spot a partial run at a glance.
  const bugsStr = result.bugs === null
    ? `bugs=(failed)`
    : (() => {
        const critCount = result.bugs.filter((b) => b.severity === "critical").length;
        const warnCount = result.bugs.filter((b) => b.severity === "warning").length;
        const infoCount = result.bugs.filter((b) => b.severity === "info").length;
        return `bugs=${result.bug_count} (${critCount}c/${warnCount}w/${infoCount}i)${result.has_critical ? " HAS_CRITICAL" : ""}`;
      })();
  const brandStr = result.brand_fidelity === null
    ? `brand=(failed)`
    : `brand=${result.brand_fidelity.overall_grade.toFixed(1)}/5`;
  const voiceStr = result.voice_consistency === null
    ? `voice=(failed)`
    : `voice=${result.voice_consistency.overall_grade}/5`;
  const ownerStr = result.owner_reaction === null
    ? `owner=(failed)`
    : `owner=${result.owner_reaction.would_buy.toUpperCase()}`;
  const customerStr = result.customer_reaction === null
    ? `customer=(failed) trust=(failed)`
    : `customer=${result.customer_reaction.would_act.toUpperCase()} trust=${result.customer_reaction.trust_at_glance}`;
  const sectionsStr = result.section_grades === null
    ? `sections=(failed)`
    : result.section_grades.length === 0
      ? `sections=n/a (n=0)`
      : `sections=${(result.section_grades.reduce((a, s) => a + s.grade, 0) / result.section_grades.length).toFixed(1)}/5 (n=${result.section_grades.length})`;
  const testPassStr = result.owner_reaction === null
    ? `test_pass=(failed)`
    : `test_pass=${result.owner_reaction.test_of_success_passes}`;
  const failedStr =
    result.failed_layers && result.failed_layers.length > 0
      ? ` failed_layers=[${result.failed_layers.join(",")}]`
      : "";
  // PR-G: surface below-baseline dimensions in the chat-output summary.
  const baselineStr = (() => {
    const bc = result.baseline_comparison;
    if (!bc) return "";
    if (!bc.baselines_available) return ` baselines=n/a(n=${bc.baseline_n})`;
    const below = bc.dimensions.filter((d) => d.below_baseline === true);
    if (below.length === 0)
      return ` baselines=on_par(n=${bc.baseline_n})`;
    return ` baselines=below(n=${bc.baseline_n})[${below.map((d) => d.name).join(",")}]`;
  })();
  console.error(
    `qa-visual: ${bugsStr} ${brandStr} ${voiceStr} ${ownerStr} ${customerStr} ${sectionsStr} ${testPassStr}${failedStr}${baselineStr}`,
  );
  console.error(`qa-visual: result → ${outPath}`);

  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(`qa-visual: FAILED: ${(e as Error).message}`);
  process.exit(1);
});
