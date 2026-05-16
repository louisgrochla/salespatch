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
  buildBugsUserMessage,
  buildBrandFidelityUserMessage,
  buildOwnerReactionUserMessage,
  validateVisualQaResult,
  type VisualQaResult,
  type BugFinding,
  type BrandFidelityResult,
  type OwnerReaction,
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

interface BriefSubset {
  business_name: string;
  business_type: string;
  address: string;
  owner_name: string | null;
  diagnosis: string;
  test_of_success: string;
  brief_id: string | null;
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

  return {
    brief: {
      business_name: brief.business_name,
      business_type: brief.business_type,
      address: brief.address,
      owner_name: brief.owner_name,
      diagnosis: brief.diagnosis,
      test_of_success: brief.test_of_success,
      brief_id: brief.brief_id,
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

async function callVision(
  client: Anthropic,
  systemPrompt: string,
  userMessage: string,
  heroB64: string,
  fullB64: string,
): Promise<string> {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: userMessage },
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: heroB64 },
          },
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: fullB64 },
          },
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

  const { brief, brand, artefactId, leadId } = loadContext(htmlPath);

  // ── LAYER 1: Bugs ───────────────────────────────────────────────────
  console.error(`qa-visual: layer 1 (bugs)...`);
  const bugsRaw = await callVision(
    client,
    BUGS_SYSTEM_PROMPT,
    buildBugsUserMessage({
      businessName: brief.business_name,
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
    }),
    heroB64,
    fullB64,
  );
  const bugsResult = parseJsonResponse<{ bugs: BugFinding[]; notes?: string }>(bugsRaw);

  // ── LAYER 2: Brand fidelity ─────────────────────────────────────────
  console.error(`qa-visual: layer 2 (brand fidelity)...`);
  const brandRaw = await callVision(
    client,
    BRAND_FIDELITY_SYSTEM_PROMPT,
    buildBrandFidelityUserMessage({
      businessName: brief.business_name,
      brandAnalysis: brand,
    }),
    heroB64,
    fullB64,
  );
  const brandResult = parseJsonResponse<BrandFidelityResult>(brandRaw);

  // ── LAYER 3: Owner reaction ─────────────────────────────────────────
  console.error(`qa-visual: layer 3 (owner reaction)...`);
  const reactionRaw = await callVision(
    client,
    OWNER_REACTION_SYSTEM_PROMPT,
    buildOwnerReactionUserMessage({
      businessName: brief.business_name,
      businessType: brief.business_type,
      address: brief.address,
      ownerName: brief.owner_name,
      diagnosis: brief.diagnosis,
      testOfSuccess: brief.test_of_success,
    }),
    heroB64,
    fullB64,
  );
  const reactionResult = parseJsonResponse<OwnerReaction>(reactionRaw);

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
    bugs: bugsResult.bugs,
    has_critical: bugsResult.bugs.some((b) => b.severity === "critical"),
    bug_count: bugsResult.bugs.length,
    brand_fidelity: brandResult,
    owner_reaction: reactionResult,
    notes: bugsResult.notes,
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
  const critCount = result.bugs.filter((b) => b.severity === "critical").length;
  const warnCount = result.bugs.filter((b) => b.severity === "warning").length;
  const infoCount = result.bugs.filter((b) => b.severity === "info").length;
  console.error(
    `qa-visual: bugs=${result.bug_count} ` +
      `(${critCount}c/${warnCount}w/${infoCount}i)` +
      (result.has_critical ? " HAS_CRITICAL" : "") +
      ` brand=${result.brand_fidelity.overall_grade.toFixed(1)}/5` +
      ` reaction=${result.owner_reaction.would_buy.toUpperCase()}` +
      ` recognition=${result.owner_reaction.recognition}` +
      ` test_pass=${result.owner_reaction.test_of_success_passes}`,
  );
  console.error(`qa-visual: result → ${outPath}`);

  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(`qa-visual: FAILED: ${(e as Error).message}`);
  process.exit(1);
});
