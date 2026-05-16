/**
 * Standalone Playwright render for the visual-QA spike.
 *
 * Captures two screenshots from a built demo.html and writes them to a
 * known output dir. The vision pass is decoupled — it can be the
 * SDK call in qa-visual.ts, OR (during this spike) Claude reading the
 * PNGs directly in the conversation to validate the prompt + render
 * quality before we wire up the API.
 *
 * Usage:
 *   npx tsx apps/nerve/scripts/qa-visual-render.ts <demo.html> [out_dir]
 *
 * Output:
 *   <out_dir>/hero.png   — above-the-fold crop at 375×812
 *   <out_dir>/full.png   — fullPage scroll
 *
 * If out_dir is omitted, defaults to <demo.html dir>/.qa-visual/
 */

import { chromium } from "@playwright/test";
import { mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const VIEWPORT = { width: 375, height: 812 };

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

  console.error(
    `qa-visual-render: rendering ${htmlPath} at ${VIEWPORT.width}×${VIEWPORT.height}...`,
  );
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
    });
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(htmlPath).toString(), { waitUntil: "load" });
    await page.waitForTimeout(1200); // let Google Fonts + sticker animation settle

    const heroPath = join(outDir, "hero.png");
    await page.screenshot({
      path: heroPath,
      clip: { x: 0, y: 0, ...VIEWPORT },
    });

    const fullPath = join(outDir, "full.png");
    await page.screenshot({ path: fullPath, fullPage: true });

    console.error(`qa-visual-render: wrote ${heroPath}`);
    console.error(`qa-visual-render: wrote ${fullPath}`);
    console.log(JSON.stringify({ hero: heroPath, full: fullPath }));
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(`qa-visual-render: FAILED: ${(e as Error).message}`);
  process.exit(1);
});
