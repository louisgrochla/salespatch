# nerve — Vercel deploy fix: exclude scripts/ from tsc include

Hotfix for a broken Vercel deployment of `apps/nerve/` that started
at commit `1baa23e` (PR #93, visual-QA spike, merged 2026-05-16
22:36 UTC) and stayed broken for ~19 hours.

## What changed

- `apps/nerve/tsconfig.json` — added `"scripts"` to `exclude`. The
  scripts directory holds tsx-runtime CLI tools (the visual-QA
  pipeline, qa-demo heuristic, seed scripts, backfill walkers) that
  are NOT part of the Next.js bundle. Excluding them from tsc's
  include matches the actual deploy reality.

That's it — one line change.

## Why

Pre-1baa23e, `apps/nerve/scripts/` contained three tsx scripts
(`qa-demo.ts`, `seed-sl-mas-smoke.ts`, `backfill-business-identities.ts`)
that only depended on packages already in `apps/nerve/package.json`.

`1baa23e` added two new scripts that import `@playwright/test`:
- `apps/nerve/scripts/qa-visual-render.ts`
- `apps/nerve/scripts/qa-visual.ts`

`@playwright/test` lives in the **root** `package.json` devDeps,
not in `apps/nerve/`. Local typecheck passes because Node module
resolution walks UP from `apps/nerve/node_modules/` to the root
`node_modules/`. Vercel's build only installs `apps/nerve`'s deps
(this is not a workspaces repo — root `package.json` has no
`workspaces` field), so on Vercel the lookup fails.

`next build` runs `tsc --noEmit` over every `.ts` file matching
the tsconfig include glob (`**/*.ts`). That glob grabbed the
scripts/ subtree. tsc tried to resolve `@playwright/test`, failed,
build aborted. Deploy died.

Subsequent commits (the rest of the visual-QA implementation plan
— PR-A through PR-J) did not add Playwright dependencies anywhere
new, so the root cause was unchanged across the 19-hour window —
but PR-J added one more `@playwright/test`-importing script
(`qa-visual-competitors.ts`), reinforcing the same broken path.

`src/` doesn't import from `scripts/` (the comment at the top of
`apps/nerve/src/lib/sl-mas/qaVisualResultStore.ts` explicitly
documents this — wire-format types are redefined there rather
than imported to avoid pulling tsx-only scripts into the bundle).
Excluding `scripts/` from tsc is the matching change on the
typecheck side.

## How to verify

1. Locally:
   ```bash
   cd ~/Desktop/klaude-repo/apps/nerve
   npx tsc --noEmit
   ```
   Passes with the fix. Sanity check that no scripts/ files are
   in the compile set:
   ```bash
   npx tsc --listFiles --noEmit | grep "apps/nerve/scripts"
   ```
   Should produce zero output.

2. On Vercel: next deploy attempt against this branch should build
   cleanly. The previous failure mode was an unresolvable import
   of `@playwright/test` from `apps/nerve/scripts/qa-visual-*.ts`
   during the `next build` typecheck pass.

## Why not move @playwright/test into apps/nerve's deps

Considered and rejected. Adding `@playwright/test` (which pulls
~200MB of Chromium binaries) to nerve's deps would bloat every
Vercel deploy + every fresh nerve install. The scripts that use
Playwright run on operator machines (or the autumn Pi), not in
the Vercel runtime. Keeping the dep at the root + excluding
scripts/ from nerve's typecheck is the right factoring.

## Known issues

- Other tsx scripts in `apps/nerve/scripts/` (e.g. `qa-demo.ts`)
  are now also excluded from tsc. They're still type-checked when
  the root `tsc` runs against them, but not during `next build`.
  Acceptable — they're CLI tools, not part of the Next.js app.
- The root `npm run verify` (which already exists) continues to
  exercise the qa-visual-* scripts via the `qa-visual:drift-test`
  npm script. Type errors in scripts/ will still surface in
  pre-merge CI; they just won't break the nerve Vercel deploy.
