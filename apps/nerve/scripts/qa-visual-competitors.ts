/**
 * Competitor comparison runner — renders top N competitor sites at the
 * same mobile viewport this demo was scored at and asks vision to
 * rank trust-at-glance across the cohort. The rep gets a door-ready
 * one-line takeaway ("you ranked #2 of 4, better than Anastasia and
 * Bauers, behind Flower Vogue's editorial polish").
 *
 * Input contract (`outputs/competitors.json` written by the
 * spec-site-brief skill in Phase 1 verify):
 *
 *   {
 *     "this_demo_name": "The Bouquet Bar",
 *     "competitors": [
 *       { "name": "Anastasia Florists", "url": "https://aflorists.com/" },
 *       { "name": "Flower Vogue",       "url": "https://www.flowervogueaberdeen.co.uk/" },
 *       { "name": "Bauers",             "url": "https://flowersbybauers.com/" }
 *     ]
 *   }
 *
 * Output: `outputs/qa-visual-competitor-comparison.json` matching
 * the `CompetitorCompareResult` schema, plus (when
 * `outputs/qa-visual-result.json` exists) a non-destructive in-place
 * patch attaching the result as `competitor_comparison` on the
 * canonical visual-QA result so NERVE ingests the comparison
 * alongside the rest of the QA pass.
 *
 * Failure isolation: per-URL renders are independently fault-tolerant.
 * A login wall / 4xx / timeout on competitor 3 doesn't break the
 * comparison — that entry lands with `rendered: false` and a
 * `render_failure_reason`, and the vision pass ranks only the
 * successfully-rendered subset.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... \
 *     npx tsx apps/nerve/scripts/qa-visual-competitors.ts <outputs_dir>
 *
 * Stdout: JSON matching CompetitorCompareResult.
 * Stderr: per-URL render progress + final summary.
 * Exit:   0 on success (including when some competitors failed to
 *         render), 1 when no competitors could be rendered or when
 *         the API key is missing.
 */

import Anthropic from "@anthropic-ai/sdk";
import { chromium, type Browser } from "@playwright/test";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import {
  COMPETITOR_COMPARE_SYSTEM_PROMPT,
  buildCompetitorCompareUserMessage,
  validateVisualQaResult,
  type CompetitorCompareResult,
  type VisualQaResult,
} from "./qa-visual-prompts";

const VIEWPORT = { width: 375, height: 812 };
const MODEL = "claude-haiku-4-5-20251001";
const RENDER_TIMEOUT_MS = 15000;
const PAINT_SETTLE_MS = 600;
const MAX_COMPETITORS = 5;

interface CompetitorInputEntry {
  name: string;
  url: string;
}

interface CompetitorsManifest {
  this_demo_name: string;
  competitors: CompetitorInputEntry[];
}

function loadApiKey(): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
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
    "ANTHROPIC_API_KEY not set. Skip the competitor comparison; the build still ships without it.",
  );
}

function sanitiseLabel(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "unnamed";
}

async function renderCompetitor(
  browser: Browser,
  url: string,
  outPath: string,
): Promise<{ ok: true; bytes: number } | { ok: false; reason: string }> {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
  });
  try {
    const page = await ctx.newPage();
    const response = await page.goto(url, {
      waitUntil: "networkidle",
      timeout: RENDER_TIMEOUT_MS,
    });
    if (!response) {
      return { ok: false, reason: "no response (likely network failure)" };
    }
    if (response.status() >= 400) {
      return { ok: false, reason: `HTTP ${response.status()}` };
    }
    await page
      .evaluate(() => (document as Document & { fonts: { ready: Promise<void> } }).fonts.ready)
      .catch(() => undefined);
    await page.waitForTimeout(PAINT_SETTLE_MS);
    await page.screenshot({ path: outPath, clip: { x: 0, y: 0, ...VIEWPORT } });
    return { ok: true, bytes: statSync(outPath).size };
  } catch (e) {
    const msg = (e as Error).message;
    if (/timeout/i.test(msg)) return { ok: false, reason: "render timeout (>15s)" };
    return { ok: false, reason: msg.slice(0, 160) };
  } finally {
    await ctx.close();
  }
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

async function main(): Promise<void> {
  const [, , outputsDirArg] = process.argv;
  if (!outputsDirArg) {
    console.error("usage: qa-visual-competitors.ts <outputs_dir>");
    process.exit(1);
  }
  const outputsDir = resolve(outputsDirArg);
  if (!existsSync(outputsDir)) {
    console.error(`ERROR: ${outputsDir} not found`);
    process.exit(1);
  }
  const manifestPath = join(outputsDir, "competitors.json");
  if (!existsSync(manifestPath)) {
    console.error(
      `qa-visual-competitors: competitors.json not found at ${manifestPath} — skipping (spec-site-brief skill captures competitors in Phase 1 verify)`,
    );
    process.exit(0);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as CompetitorsManifest;
  if (!manifest.this_demo_name || !Array.isArray(manifest.competitors)) {
    console.error(`ERROR: competitors.json must have this_demo_name + competitors[]`);
    process.exit(1);
  }
  if (manifest.competitors.length === 0) {
    console.error(`qa-visual-competitors: no competitors in manifest — skipping`);
    process.exit(0);
  }

  // Need hero.png from the existing render to send as "this demo".
  const heroPath = join(outputsDir, ".qa-visual", "hero.png");
  if (!existsSync(heroPath)) {
    console.error(
      `ERROR: ${heroPath} not found — run qa-visual-render.ts first so we have a screenshot of this demo to compare against`,
    );
    process.exit(1);
  }

  const apiKey = loadApiKey();
  const client = new Anthropic({ apiKey });

  // Render each competitor with isolated failure recovery.
  const competitorDir = join(outputsDir, ".qa-visual", "competitors");
  mkdirSync(competitorDir, { recursive: true });
  const competitors = manifest.competitors.slice(0, MAX_COMPETITORS);
  console.error(
    `qa-visual-competitors: rendering ${competitors.length} competitor(s) at ${VIEWPORT.width}×${VIEWPORT.height}...`,
  );

  interface RenderedEntry {
    name: string;
    url: string;
    rendered: boolean;
    render_failure_reason: string | null;
    screenshot_path: string | null;
  }
  const rendered: RenderedEntry[] = [];

  const browser = await chromium.launch({ headless: true });
  try {
    for (const c of competitors) {
      const slug = sanitiseLabel(c.name);
      const outPath = join(competitorDir, `${slug}.png`);
      const result = await renderCompetitor(browser, c.url, outPath);
      if (result.ok) {
        console.error(
          `qa-visual-competitors:   ✓ ${c.name} (${result.bytes / 1024 | 0}KB)`,
        );
        rendered.push({
          name: c.name,
          url: c.url,
          rendered: true,
          render_failure_reason: null,
          screenshot_path: outPath,
        });
      } else {
        console.error(
          `qa-visual-competitors:   ✗ ${c.name} — ${result.reason}`,
        );
        rendered.push({
          name: c.name,
          url: c.url,
          rendered: false,
          render_failure_reason: result.reason,
          screenshot_path: null,
        });
      }
    }
  } finally {
    await browser.close();
  }

  const renderedCount = rendered.filter((r) => r.rendered).length;
  if (renderedCount === 0) {
    console.error(
      `qa-visual-competitors: every competitor render failed — no comparison possible`,
    );
    process.exit(1);
  }

  // Build the entries list. "This demo" is always entry 0. Then
  // every competitor in manifest order, both rendered and unrendered.
  // Vision call only attaches images for entries with screenshot_path
  // (this demo's hero.png + every successfully-rendered competitor).
  type PromptEntry = {
    name: string;
    url: string | null;
    is_this_demo: boolean;
    rendered: boolean;
    render_failure_reason: string | null;
    screenshot_path: string | null;
  };
  const entries: PromptEntry[] = [
    {
      name: manifest.this_demo_name,
      url: null,
      is_this_demo: true,
      rendered: true,
      render_failure_reason: null,
      screenshot_path: heroPath,
    },
    ...rendered.map((r) => ({
      name: r.name,
      url: r.url,
      is_this_demo: false,
      rendered: r.rendered,
      render_failure_reason: r.render_failure_reason,
      screenshot_path: r.screenshot_path,
    })),
  ];

  // Build vision-call image array — only rendered entries get an image,
  // and they must be in the SAME ORDER as listed in the user message.
  const userMessage = buildCompetitorCompareUserMessage({
    thisDemoName: manifest.this_demo_name,
    entries: entries.map((e) => ({
      name: e.name,
      url: e.url,
      is_this_demo: e.is_this_demo,
      rendered: e.rendered,
      render_failure_reason: e.render_failure_reason,
    })),
  });

  const images = entries
    .filter((e) => e.screenshot_path !== null)
    .map((e) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: "image/png" as const,
        data: readFileSync(e.screenshot_path!).toString("base64"),
      },
    }));

  console.error(
    `qa-visual-competitors: calling vision with ${images.length} screenshot(s)...`,
  );
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 3500,
    system: COMPETITOR_COMPARE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: userMessage }, ...images],
      },
    ],
  });

  const textBlock = msg.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("vision call returned no text block");
  }
  const result = parseJsonResponse<CompetitorCompareResult>(textBlock.text);

  // Write the sidecar.
  const sidecarPath = join(outputsDir, "qa-visual-competitor-comparison.json");
  writeFileSync(sidecarPath, JSON.stringify(result, null, 2));

  // Also patch the canonical qa-visual-result.json so NERVE ingests
  // the comparison alongside the rest of the visual-QA pass.
  const visualQaResultPath = join(outputsDir, "qa-visual-result.json");
  if (existsSync(visualQaResultPath)) {
    const raw = JSON.parse(readFileSync(visualQaResultPath, "utf8"));
    raw.competitor_comparison = result;
    const validation = validateVisualQaResult(raw);
    if (!validation.valid) {
      console.error(
        `qa-visual-competitors: WARN — patched qa-visual-result.json fails validation; writing sidecar only`,
      );
      for (const err of validation.errors) console.error(`  - ${err}`);
    } else {
      writeFileSync(visualQaResultPath, JSON.stringify(raw as VisualQaResult, null, 2));
      console.error(`qa-visual-competitors: patched ${visualQaResultPath}`);
    }
  }

  console.error(
    `qa-visual-competitors: this demo ranked #${result.this_demo_rank ?? "?"} of ${result.ranked_total} — ${result.takeaway}`,
  );
  console.error(`qa-visual-competitors: result → ${sidecarPath}`);

  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(`qa-visual-competitors: FAILED: ${(e as Error).message}`);
  process.exit(1);
});
