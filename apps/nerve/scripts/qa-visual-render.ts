/**
 * Standalone Playwright render for the visual-QA pipeline.
 *
 * Renders demo.html at TWO viewports:
 *   - Mobile (375×812, iPhone 13 mini, 2× scale, real mobile UA)
 *   - Desktop (1280×800)
 *
 * Captures four screenshots per run:
 *   <out_dir>/hero.png           — mobile above-the-fold crop (375×812)
 *   <out_dir>/full.png           — mobile fullPage scroll
 *   <out_dir>/desktop-hero.png   — desktop above-the-fold crop (1280×800)
 *   <out_dir>/desktop-full.png   — desktop fullPage scroll
 *
 * Also writes:
 *   <out_dir>/render-result.json — timings, paths, byte sizes, viewports
 *
 * Wait strategy (replaces the previous fragile fixed 1.2s timeout):
 *   1. waitUntil: "networkidle"        — Playwright settles network activity
 *   2. document.fonts.ready            — Google Fonts have finished loading
 *   3. 200ms paint-settle grace        — for any post-fonts layout shift
 *
 * The two-viewport capture closes the desktop-pivot blind spot the audit
 * surfaced — owners often pull out a laptop after the rep's pitch lands.
 *
 * Usage:
 *   npx tsx apps/nerve/scripts/qa-visual-render.ts <demo.html> [out_dir]
 *
 * Stdout: JSON matching render-result.json contents (callers can parse).
 * Stderr: human-readable per-step progress + final summary line.
 * Exit:   0 on success, 1 on render failure.
 *
 * If out_dir is omitted, defaults to <demo.html dir>/.qa-visual/
 */

import { chromium, type Browser, type Page } from "@playwright/test";
import { mkdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const MOBILE_VIEWPORT = { width: 375, height: 812 };
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const PAINT_SETTLE_MS = 200;

interface ViewportRenderResult {
  viewport: { width: number; height: number };
  hero_path: string;
  full_path: string;
  hero_bytes: number;
  full_bytes: number;
  duration_ms: number;
}

interface RenderResult {
  ran_at: string;
  demo_path: string;
  url: string;
  out_dir: string;
  total_duration_ms: number;
  mobile: ViewportRenderResult;
  desktop: ViewportRenderResult;
}

async function settleFonts(page: Page): Promise<void> {
  await page.evaluate(
    () => (document as Document & { fonts: { ready: Promise<void> } }).fonts.ready,
  );
  await page.waitForTimeout(PAINT_SETTLE_MS);
}

async function captureViewport(
  browser: Browser,
  url: string,
  viewport: { width: number; height: number },
  outDir: string,
  prefix: string,
  isMobile: boolean,
): Promise<ViewportRenderResult> {
  const startedAt = Date.now();
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: isMobile ? 2 : 1,
    hasTouch: isMobile,
    isMobile,
    userAgent: isMobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1"
      : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  });
  try {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await settleFonts(page);

    const heroPath = join(outDir, `${prefix}hero.png`);
    await page.screenshot({ path: heroPath, clip: { x: 0, y: 0, ...viewport } });

    const fullPath = join(outDir, `${prefix}full.png`);
    await page.screenshot({ path: fullPath, fullPage: true });

    return {
      viewport,
      hero_path: heroPath,
      full_path: fullPath,
      hero_bytes: statSync(heroPath).size,
      full_bytes: statSync(fullPath).size,
      duration_ms: Date.now() - startedAt,
    };
  } finally {
    await ctx.close();
  }
}

async function main(): Promise<void> {
  const [, , htmlPathArg, outDirArg] = process.argv;
  if (!htmlPathArg) {
    console.error("usage: qa-visual-render.ts <demo.html> [out_dir]");
    process.exit(1);
  }
  const htmlPath = resolve(htmlPathArg);
  if (!existsSync(htmlPath)) {
    console.error(`ERROR: ${htmlPath} not found`);
    process.exit(1);
  }
  const outDir = resolve(outDirArg ?? join(dirname(htmlPath), ".qa-visual"));
  mkdirSync(outDir, { recursive: true });

  const url = pathToFileURL(htmlPath).toString();
  const overallStart = Date.now();
  console.error(`qa-visual-render: rendering ${htmlPath}`);

  const browser = await chromium.launch({ headless: true });
  try {
    console.error(
      `qa-visual-render: mobile ${MOBILE_VIEWPORT.width}×${MOBILE_VIEWPORT.height}...`,
    );
    const mobile = await captureViewport(
      browser,
      url,
      MOBILE_VIEWPORT,
      outDir,
      "",
      true,
    );
    console.error(
      `qa-visual-render:   hero=${(mobile.hero_bytes / 1024).toFixed(0)}KB full=${(mobile.full_bytes / 1024).toFixed(0)}KB (${mobile.duration_ms}ms)`,
    );

    console.error(
      `qa-visual-render: desktop ${DESKTOP_VIEWPORT.width}×${DESKTOP_VIEWPORT.height}...`,
    );
    const desktop = await captureViewport(
      browser,
      url,
      DESKTOP_VIEWPORT,
      outDir,
      "desktop-",
      false,
    );
    console.error(
      `qa-visual-render:   hero=${(desktop.hero_bytes / 1024).toFixed(0)}KB full=${(desktop.full_bytes / 1024).toFixed(0)}KB (${desktop.duration_ms}ms)`,
    );

    const result: RenderResult = {
      ran_at: new Date().toISOString(),
      demo_path: htmlPath,
      url,
      out_dir: outDir,
      total_duration_ms: Date.now() - overallStart,
      mobile,
      desktop,
    };

    const resultPath = join(outDir, "render-result.json");
    writeFileSync(resultPath, JSON.stringify(result, null, 2));
    console.error(
      `qa-visual-render: ${resultPath} (${result.total_duration_ms}ms total)`,
    );

    console.log(JSON.stringify(result));
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(`qa-visual-render: FAILED: ${(e as Error).message}`);
  process.exit(1);
});
