# build-demo — three-layer visual-QA pass (manual + SDK parity)

## What changed

- `apps/nerve/scripts/qa-visual-render.ts` (NEW, in-repo) — standalone
  Playwright renderer. Captures `hero.png` (above-the-fold at 375×812,
  iPhone 13 mini UA, 2× scale) and `full.png` (fullPage scroll) from a
  built `demo.html` into `outputs/.qa-visual/`. No API key required.
- `apps/nerve/scripts/qa-visual-prompts.ts` (NEW) — single source of
  truth for the three-layer visual-QA pass. Exports:
  - `BUGS_SYSTEM_PROMPT`, `BRAND_FIDELITY_SYSTEM_PROMPT`,
    `OWNER_REACTION_SYSTEM_PROMPT`
  - `buildBugsUserMessage`, `buildBrandFidelityUserMessage`,
    `buildOwnerReactionUserMessage` (user-message templates)
  - `BugFinding`, `BrandDimensionGrade`, `BrandFidelityResult`,
    `OwnerReaction`, `VisualQaResult` (TS interfaces — the contract
    NERVE will ingest against)
- `apps/nerve/scripts/qa-visual-prompts.md` (NEW) — human-readable
  mirror of the same spec. Read by the manual `/build-demo` flow today;
  used by reviewers and AI sessions to apply the prompts without
  parsing TypeScript. Drift between `.ts` and `.md` is forbidden; `.ts`
  is the executable canon.
- `apps/nerve/scripts/qa-visual.ts` (NEW, dormant SDK runner) — fully
  implemented three-layer Anthropic SDK runner. Imports
  prompts + interfaces from `qa-visual-prompts.ts`. Activates whenever
  `ANTHROPIC_API_KEY` is set (also reads from `apps/nerve/.env.local`).
  Produces the **identical** `VisualQaResult` JSON shape as the manual
  flow — NERVE cannot tell which producer ran any given row.
- `~/.claude/commands/build-demo.md` (user-level skill, not in repo) —
  added "Visual-QA pass (three-layer vision review)" section after the
  existing Auto-QA section. Instructs in-session Claude to render →
  Read both PNGs → load `brand-analysis.json` + `brief.json` for layer
  context → apply the three system prompts → compose `VisualQaResult`
  → write to `outputs/qa-visual-result.json` → POST to NERVE → log to
  `run.jsonl`. Output Format section gained one line for the visual-QA
  summary and hard-gate behaviour on `has_critical`.

## Why

The static `qa-demo.ts` heuristic regex passes the Bouquet Bar demo at
100/100 but is blind to the actual bug a UK shop owner would notice
within 5 seconds: white mono text "Bridge of Don · Aberdeen · since
2023" sitting on the upper third of the hero photo where the gradient
overlay is only ~37% opaque. WCAG-equivalent contrast is ~2:1, below
AA. The static pass cannot see the rendered pixels and so cannot catch
this entire bug class.

The user surfaced this in the same session that shipped the Bouquet Bar
demo. The right fix is real visual review, not more regex — and since
the cost of in-session Claude vision is £0 (subscription) while the
SDK runner is also trivial (~£0.005 per demo, three Haiku 4.5 vision
calls), the plan is to build both implementations now and switch
automatically when budget arrives.

Single specification, dual implementation. Both first-class. The
prompts, severity rubrics, grading rubrics, output schemas and NERVE
ingest contract are defined exactly once in `qa-visual-prompts.ts` and
mirrored to `qa-visual-prompts.md`. When the SDK runner activates, the
only behavioural difference is the `producer` field
(`"manual_skill"` vs `"sdk_runner"`) and the `model` field
(`"claude-in-session"` vs the Anthropic model id). Drift is impossible
by construction — both paths import the same prompt strings.

## Stack

- Playwright (`@playwright/test@1.58.2`, already in repo root for E2E
  tests). One headless Chromium render per QA, ~3 seconds.
- Anthropic SDK (`@anthropic-ai/sdk@0.32.1`, already in
  `apps/nerve/node_modules`). Three vision calls per QA when the runner
  is active.
- TypeScript constants + interfaces as the contract surface.
- Markdown mirror for human + skill-text reference.

## Integrations

- `outputs/.qa-visual/` — render output directory, sibling to
  `outputs/qa-result.json`.
- `outputs/qa-visual-result.json` — canonical `VisualQaResult` written
  by both implementations.
- `/api/ingest/qa-visual-result` (NERVE route, **not yet built** — POST
  currently returns 404 and is surfaced once + continued; future PR adds
  the route + Prisma model + ingest validation).
- `outputs/brand-analysis.json` — read for Layer 2 (brand fidelity)
  context: palette, fonts, logo description, positioning, asset_notes.
- `outputs/brief.json` — read for Layer 3 (owner reaction) context:
  business identity, diagnosis, test_of_success.
- `logs/run.jsonl` — new `stage="qa-visual"` log line per run.

## How to verify

1. Render any built demo:
   ```bash
   npx tsx ~/Desktop/klaude-repo/apps/nerve/scripts/qa-visual-render.ts \
     ~/Desktop/salespatch-demos/<slug>/outputs/demo.html
   ```
   Expect `outputs/.qa-visual/hero.png` + `outputs/.qa-visual/full.png`.
2. Manual flow: invoke `/build-demo` on a lead. Verify it captures the
   PNGs, applies the three layers per `qa-visual-prompts.md`, writes
   `outputs/qa-visual-result.json` matching the `VisualQaResult` TS
   interface, posts to NERVE (404 expected for now — surface and
   continue), logs `stage="qa-visual"` to `run.jsonl`, and surfaces the
   `Visual-QA: bugs=...` summary line in the chat output.
3. SDK parity: when `ANTHROPIC_API_KEY` is set, running
   `npx tsx apps/nerve/scripts/qa-visual.ts <demo.html>` should produce
   a `qa-visual-result.json` with identical schema and the
   `producer: "sdk_runner"` flag.
4. End-to-end validation against the Bouquet Bar demo (run as part of
   this PR) produced:
   `Visual-QA: bugs=3 (1c/1w/1i) HAS_CRITICAL brand=4.6/5 reaction=MAYBE recognition=high test_pass=True`
   — the critical bug is the exact hero readability failure the user
   surfaced, which the static QA missed despite scoring 100/100.

## Known issues

- The NERVE `/api/ingest/qa-visual-result` route does not exist yet.
  The skill text instructs the manual flow to surface the 404 once and
  continue. A follow-up PR adds the route + the Prisma `QaVisualResult`
  model so the warehouse can answer "do high-visual-QA demos close
  better?" alongside the static `qa_results` it already holds.
- The SDK runner is dormant until `ANTHROPIC_API_KEY` (or, in a follow-
  up PR, `OPENROUTER_API_KEY` with an OpenRouter base URL swap) is set.
  Until then the manual `/build-demo` flow is the only active producer.
  This is intentional — visual QA is shipping as in-session-only first;
  the SDK runner is shipped now so the parity contract is enforced from
  day one rather than retrofitted.
- The `post-ingest.sh` helper surfaces the full HTML 404 response body
  on a missing route, which clutters the chat output. Cosmetic; future
  helper-cleanup PR can trim the noise.
- Hard-gate behaviour (`has_critical` → FAIL verdict) lives in the
  `/build-demo` skill text rather than in code, so it depends on the
  in-session Claude actually obeying the spec. Once the SDK runner
  activates, the runner enforces the gate programmatically; until then,
  the skill text is the source of truth.
