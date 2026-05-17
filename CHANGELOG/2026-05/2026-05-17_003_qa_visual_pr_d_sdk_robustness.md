# qa-visual — PR-D SDK runner robustness (retries, partial writes, richer persona)

Fourth of the 10 PRs from `qa-visual-IMPLEMENTATION-PLAN.md`. Addresses
the code-level findings from `qa-visual-AUDIT.md` and turns the SDK
runner from "exit on any failure" into "produce a documented partial
result whenever possible".

## What changed

- `apps/nerve/scripts/qa-visual.ts`:
  - NEW `withRetry()` helper. One retry-with-backoff for transient
    failures (network resets, 5xx, 429 rate limits). Fail fast on 4xx
    other than 429 (bad request, auth — no point retrying).
  - NEW `tryLayer()` wrapper that calls `withRetry`; on permanent
    failure appends the layer name to `failedLayers[]` and returns
    null. Caller writes the partial result rather than aborting.
  - All six layer calls (Bugs / Brand fidelity / Owner reaction /
    Voice / Customer / Section grading) refactored to go through
    `tryLayer`. Each returns `T | null`; the result composer wires
    nulls into the canonical shape with matching `failed_layers[]`.
  - Stderr summary line gained graceful-degradation rendering: failed
    layer fields surface as `bugs=(failed)`, `brand=(failed)`, etc.,
    with `failed_layers=[...]` suffix when any layer failed.
  - Owner-reaction call site gained two new persona inputs:
    `officers` (from `metadata.enrichment.companies_house.officers`)
    and `yearsTrading` (from `years_trading`). `loadContext()` pulls
    both with safe fallthrough.
- `apps/nerve/scripts/qa-visual-prompts.ts`:
  - NEW `LAYER_NAMES` const + `LayerName` type — source of truth for
    what can appear in `failed_layers[]`.
  - `VisualQaResult` interface: every gradable layer field made
    nullable (`bugs`, `has_critical`, `bug_count`, `brand_fidelity`,
    `owner_reaction`, `voice_consistency`, `customer_reaction`,
    `section_grades`). New optional `failed_layers?: LayerName[]`.
  - `VisualQaResultSchema` Zod: matching nullable schema fields +
    new `LayerNameSchema` enum + new cross-field `.refine` enforcing
    `failed_layers` ↔ layer-nullness exact match. The existing
    `bug_count === bugs.length` and `has_critical iff any critical`
    refines now skip cleanly when `bugs === null`.
  - `buildOwnerReactionUserMessage()` signature gains optional
    `officers` + `yearsTrading` params. Persona generation prefers
    explicit `ownerName`, falls through to first officer, finally to
    anonymous "you are the owner". When years are known, the prompt
    frames tenure ("doing this for 9 years — established, known in
    the neighbourhood"). Falls through cleanly when absent.
- `apps/nerve/scripts/qa-visual-prompts.md`:
  - New "Schema bump in PR-D" callout documenting the nullable layer
    fields + `failed_layers` contract.
  - "Runtime validation" section updated with the new validator rule.
  - NEW "Partial results + retry (PR-D)" section explaining the
    withRetry / tryLayer pattern and the manual-flow producer rule.
- `apps/nerve/scripts/qa-visual-drift-test.ts`:
  - `REQUIRED_SYMBOLS` grows from 22 to 24 (`failed_layers`,
    `LAYER_NAMES`).
- `~/.claude/commands/build-demo.md` (user-level skill, not in repo):
  - Step 4 callout for the partial-result contract — manual flow
    must null + list, not invent sentinel grades.

## Why

Audit code-findings 2-6 from `qa-visual-AUDIT.md`:

- **Code-finding 2** — SDK runner exited non-zero on any layer
  failure, losing every other layer's output. Now: tryLayer writes a
  partial result with documented `failed_layers[]` and exits 0.
  A transient 429 on Layer 4 no longer destroys the bugs / brand /
  reaction signal from Layers 1-3.
- **Code-finding 4** — `max_tokens` already bumped to 3500 in PR-C
  for Layer 3 (which sometimes ran over). Retained in PR-D's
  `callVision`.
- **Code-finding 5** — owner persona was the bare "you are the
  owner of X" string. Now pulls Companies House officer name (when
  matched) and years-trading int (when matched) into a richer
  persona frame. Both fall through cleanly.
- **Code-finding 6** — no retries on transient API failures. Now:
  one retry with 1.5s backoff for 5xx / 429 / network; immediate
  fail for 4xx-not-429.

Combined-mode flag (audit code-finding 1) was scoped into this PR
but deferred. The cost saving (~6x fewer calls per demo, ~£0.02 →
~£0.003) is real but the focus loss from packing all six layers into
one structured-output response would dilute Layer 6 (section grading
sends N images and benefits most from focused attention). Better
revisit after PR-G (cohort baselines) gives us a way to measure
whether combined-mode degrades grade quality vs separated calls.

## Stack

- TypeScript + Anthropic SDK + Zod (all already in repo, no new deps)
- Pure error-handling + schema work; no new runtime infrastructure

## Integrations

- `loadContext()` now reads `brief.metadata.enrichment.companies_house`
  per the spec-site-brief skill's output shape. Reads `officers[]` and
  `years_trading` (number). Both fall through cleanly when missing.
- Partial-result write path lands the same `outputs/qa-visual-result.json`
  the full-result path does — just with documented nulls. NERVE ingest
  endpoint (when PR-E ships) accepts both.
- Stderr summary format changed: failed layer fields render
  `bugs=(failed)` etc., with `failed_layers=[bugs,brand_fidelity]`
  suffix. `/build-demo` skill's Output Format line tolerates either
  format.

## How to verify

1. Type-check + drift test:
   ```bash
   cd ~/Desktop/klaude-repo
   npx tsc --noEmit --strict apps/nerve/scripts/qa-visual-*.ts
   npm run qa-visual:drift-test
   ```
   Expect zero tsc output; drift-test reports
   `OK — all 24 required symbols present in both files`.

2. Schema validator smoke test (exercised in-PR):
   - Full result with no failures → validates
   - One layer null + listed in failed_layers → validates
   - Layer null but NOT listed → `failed_layers must match exactly...`
   - Layer present but listed in failed_layers → same error
   - bugs null + has_critical not null → cross-field error
   - Multiple layers failed → validates if listed correctly

3. Manual partial-write test (when an API key is available):
   - Run `qa-visual.ts` against a demo with the Anthropic SDK
     temporarily blocked (firewall, or `ANTHROPIC_BASE_URL` pointed
     at a 503). Confirm:
     - One layer fails → its field is null + failed_layers populated
     - Other layers succeed → their fields are full results
     - Stderr summary shows `(failed)` for the bad layer + the
       failed_layers suffix
     - Exit code 0 (not non-zero)

## Known issues

- The combined-mode flag was deferred (see "Why" section above) —
  could revisit after PR-G (cohort baselines) gives us a way to
  measure quality degradation.
- The richer owner persona currently sees `officers` as a flat
  array of name strings. The spec-site-brief skill stores them as
  objects in some cases (`{name, role}`). `loadContext()` defensively
  filters to strings only; the object-shape case loses role data.
  Future refinement: support both shapes.
- Retries are single-shot. Two consecutive 429s with no other
  recovery time will still fail. Production SDK use should layer in
  a more sophisticated backoff (e.g. `Retry-After` header
  honouring); the current 1.5s × attempt backoff is good enough for
  the dormant-runner phase.
- The manual flow can't easily simulate a layer failure (in-session
  Claude either produces output or doesn't). The validator-side
  enforcement is the only safety net for the manual path's partial
  results.
