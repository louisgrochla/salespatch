# NERVE-as-SL-MAS — Master Roadmap

> **Living document.** Source of truth for the NERVE-as-data-warehouse +
> self-learning multi-agent system buildout. Updated as work lands. Committed
> to main so any Claude Code session pulling latest sees the current state.

---

## North Star

NERVE becomes:

1. **The complete data warehouse** — every operationally interesting event from sales-dashboard, mobile-api, the Pi runtime, the iOS app, Stripe, Supabase, and the founder's manual workflow lands in NERVE Postgres. Nothing dies on the Pi or in a log file.
2. **The graphical interface** for the entire SL-MAS — replaces Mission Control's inline HTML dashboard as the operator + founder surface. Lead viewers, pipeline runner, queue, payments, all native NERVE pages.
3. **The substrate that lets the AI layer query history meaningfully** — when the next Claude-powered agent is invoked, it has the full corpus of decisions, outcomes, briefs, demos, brand analyses, pitch transcripts, and intermediate states to ground its choices in.

The **"self"** in self-learning is unlocked when (3) is complete: agents read NERVE before they act, and write everything they did back to NERVE. Today the read-side and the write-side are mostly disconnected. This roadmap closes that gap.

---

## How to use this document

**For a Claude Code session picking up work:**

1. `git pull origin main` — get latest roadmap state
2. Find a task with `Status: not started` and an empty `Owner:` field
3. Claim it with a single commit:
   ```
   git add NERVE-ROADMAP.md
   git commit -m "claim: <TASK_ID> for session <YOUR_SESSION_ID>"
   git push
   ```
   (or via a PR if main is protected)
4. Do the work in a feature branch
5. Open PR. The PR description should include `Closes <TASK_ID>` so the merge can flip the checkbox
6. After merge, update this doc in a follow-up commit (or via `/finish`):
   - Flip `- [ ]` to `- [x]`
   - Set `Status: complete (commit <SHA>)`
   - Move task summary line to "Done log" at bottom

**Conflict handling:** if two sessions claim the same task simultaneously, the second push hits a merge conflict. Loser rebases, picks a different task. No coordination needed beyond git.

**Conventions:**

- Tasks are intentionally **independent + small** — one owner, one PR, one merge.
- Each task lists `Acceptance:` so it's clear when "done" means done.
- Each task lists `Files:` to suggest what's likely to change. Not binding.
- `Depends on:` declares hard prerequisites. A task with unmet deps shouldn't be claimed yet.

---

## Status Snapshot

_Last updated: 2026-05-10 (Phase A + D1 + D2 + B1 + B2 + B3 complete)_

- Live: https://nerve.salespatch.co.uk/pipeline ✓
- Postgres SL-MAS schema: 16 tables migrated (8 base + composer_iterations + lead_profiles + spend_ledger + site_briefs + brand_analyses + demo_artefacts + qa_results + lead_assignment_events + stripe_events + salesperson_events)
- **Phase A complete** — 7 Tier 1 ingest endpoints live + verified in prod via `scripts/nerve/simulate-ingest.sh`: composer-iteration, lead-profile, spend, site-brief, brand-analysis, demo-artefact, qa-result
- **D1 live** — `/api/read/strategies` + `/api/read/lead-profiles/winning-features` HMAC-signed read endpoints in prod; build-demo skill consults both before generating (first read-side of the self-learning loop)
- **D2 substrate ready** — `/api/read/decisions/learning-context` HMAC-signed read endpoint in prod; `NerveLearningClient` on Pi runtime side ready to drop into `withLearning(...)` via `options.contextSource` when the autumn pipeline restarts. 7/7 learning tests pass.
- **B1 live** — `/api/ingest/lead-assignment` HMAC-signed funnel event ingest in prod; sales-dashboard producers wired in both status-flipping handlers.
- **B2 live** — `/api/ingest/stripe-event` HMAC-signed payment event ingest in prod; sales-dashboard payment webhook fans out every signature-verified Stripe event to NERVE.
- **B3 live** — `/api/ingest/salesperson-event` HMAC-signed SP lifecycle event ingest in prod; producers wired in signup, payments-connect, and admin profile-edit handlers. Per-SP timeline (signup → connect → profile_update → deactivated etc.) now queryable from NERVE.
- Producers wired today: tools/workbench (A1), outreach pipeline (A6 via spendReporter at 4 call sites), spec-site-brief skill (A2 + A4), build-demo skill (A3 + D1 read-bias), sales-dashboard status + pitch (B1), sales-dashboard payment webhook (B2), sales-dashboard signup + payments-connect + admin (B3)
- Producers awaiting wiring: Pi siteQaAgent (A5 — agent doesn't exist yet, manual posts work); autumn pipeline (D2 contextSource swap)
- Pi runtime: dropped from data path, parked for autumn agents
- Open phases: B (B4 remaining), C (Tier 3 archival), D (D3 parked far-future), E (MC retirement)
- Tasks open: 7
- Tasks complete: 38 (see Done log)

---

## Phase A — Tier 1 data capture (decision-relevant)

> Each of these closes a hole where signal currently dies. Highest leverage for the eventual AI layer.

### A1 — Composer Workbench saves to NERVE

- **Status:** complete (PR #41, merged 2026-05-10)
- **Owner:** feat/a1-composer-iterations
- **Goal:** Every "save" in `tools/workbench/` writes a `composer_iteration` row to NERVE Postgres with the HTML, prompt, response, and lead context.
- **Why:** Founder's manual edits are pure signal — captured nowhere today.
- **Files:**
  - `tools/workbench/server.ts` (add fetch to NERVE on save handler)
  - `apps/nerve/prisma/schema.prisma` (new `ComposerIteration` model)
  - `apps/nerve/src/app/api/ingest/composer-iteration/route.ts` (HMAC POST)
  - `apps/nerve/src/lib/sl-mas/composerIterations.ts` (Prisma store)
- **Acceptance:** Saving a workbench iteration creates a row queryable in NERVE with all editable fields preserved. Idempotent on `iteration_id` (slug + timestamp).
- **Depends on:** none.
- **Estimated effort:** 2–3 hours.

### A2 — Site briefs + brand analysis ingest

- **Status:** complete (PR #43, merged 2026-05-10)
- **Owner:** _(merged)_
- **Goal:** Every site brief generated (manual `/build-demo` skill OR Pi `brief-generator-agent`) lands in NERVE with the full markdown body + structured fields. Brand analysis (palette/fonts/asset inventory) lands in NERVE alongside.
- **Files:**
  - `apps/nerve/prisma/schema.prisma` (new `SiteBrief`, `BrandAnalysis` models)
  - `apps/nerve/src/app/api/ingest/site-brief/route.ts`
  - `apps/nerve/src/app/api/ingest/brand-analysis/route.ts`
  - Skill SKILL.md update (skill writes brief.json + brand.json + posts to NERVE on `/build-demo` completion via the admin uploader)
  - For Pi: `src/agents/outreach/briefGenerator.ts` posts to NERVE after writing local file (autumn enablement)
- **Acceptance:** A `/build-demo` run produces a `site_briefs` row + `brand_analyses` row queryable by lead_id.
- **Depends on:** A1 pattern (HMAC ingest endpoints) for consistency.
- **Estimated effort:** 4–6 hours.

### A3 — Demo HTML artefacts ingest

- **Status:** complete (PR #46, merged 2026-05-10)
- **Owner:** _(merged)_
- **Goal:** Every generated demo HTML (manual or Pi-composer) saved to NERVE as a `DemoArtefact` row, JSONB inline.
- **Files:**
  - `apps/nerve/prisma/schema.prisma` (new `DemoArtefact` model)
  - `apps/nerve/src/app/api/ingest/demo-artefact/route.ts`
  - Hook into existing admin uploader at `apps/sales-dashboard/src/app/api/admin/demo-upload`
  - Hook on Pi `siteComposerAgent.ts` post-render
- **Acceptance:** The HTML for any demo can be retrieved via `/api/demo-artefacts/{lead_id}`. Inline storage; ~50–500KB per row is fine.
- **Depends on:** A2 (brief should reference the demo it produced).
- **Estimated effort:** 3 hours.

### A4 — Lead profile snapshots ingest

- **Status:** complete (PR #40, merged 2026-05-10)
- **Owner:** feat/a4-lead-profiles
- **Goal:** Whenever a lead is profiled (Pi `lead-profiler-agent` OR manual research via spec-site-brief), the structured profile (Instagram followers, photo count, hours, review summary, website screenshot URL) lands in NERVE.
- **Files:**
  - `apps/nerve/prisma/schema.prisma` (extend `LeadRecord` or new `LeadProfile` model)
  - `apps/nerve/src/app/api/ingest/lead-profile/route.ts`
  - Pi `leadProfilerAgent.ts` posts on completion
- **Acceptance:** Each lead has a queryable profile row with both Tier-1 facts (vertical, postcode, has_website) and richer structured signals (followers, reviews, photos).
- **Depends on:** none (independent of A1–A3).
- **Estimated effort:** 3–4 hours.

### A5 — Site QA results ingest

- **Status:** complete (PR #47, merged 2026-05-10)
- **Owner:** _(merged)_
- **Goal:** QA results from `siteQaAgent` (HTML validity, contrast, accessibility, score) land in NERVE keyed by demo_artefact_id.
- **Files:**
  - `apps/nerve/prisma/schema.prisma` (new `QaResult` model)
  - `apps/nerve/src/app/api/ingest/qa-result/route.ts`
  - Pi `siteQaAgent.ts` posts after run
- **Acceptance:** `SELECT lead_id, score FROM qa_results JOIN ... WHERE pitch_outcome='closed'` answers "do high-QA demos close better?".
- **Depends on:** A3 (FK to demo_artefact).
- **Estimated effort:** 2 hours.

### A6 — API spend ledger ingest

- **Status:** complete (PR #42, merged 2026-05-10)
- **Owner:** feat/a6-spend-ledger
- **Goal:** Each external API call (OpenRouter, Apify, Google Places) writes a `spend_ledger` row to NERVE with provider, cost_usd, run_id, agent_id, tokens.
- **Files:**
  - `apps/nerve/prisma/schema.prisma` (new `SpendLedger` model)
  - `apps/nerve/src/app/api/ingest/spend/route.ts`
  - Wrap fetch helpers in `src/agents/outreach/aiComposer.ts`, `brandIntelligence.ts`, `aiBrief.ts` to log to NERVE on each call
- **Acceptance:** Total summer spend per lead, per agent, per provider is queryable from NERVE alone.
- **Depends on:** none.
- **Estimated effort:** 3 hours.

---

## Phase B — Tier 2 supporting context

### B1 — Sales-dashboard `lead_assignments` status timeline → NERVE

- **Status:** complete (PR #53, merged 2026-05-10)
- **Owner:** _(merged)_
- **Goal:** Every status flip on `lead_assignments` (Supabase) mirrors to a `LeadAssignmentEvent` row in NERVE.
- **Files shipped:**
  - `apps/nerve/prisma/schema.prisma` + migration `12_lead_assignment_events` — new `LeadAssignmentEvent` model with derived `transition` column and indexes on `(assignment_id, occurred_at)`, `(lead_id, occurred_at)`, `(user_id, occurred_at)`, `(status, occurred_at)`, `(transition)`
  - `apps/nerve/src/lib/sl-mas/leadAssignmentEventStore.ts` — ingest + timeline / per-lead / per-SP / per-transition read helpers
  - `apps/nerve/src/app/api/ingest/lead-assignment/route.ts` — HMAC-signed POST, validates `AssignmentStatus` set, bounds-checks GPS + commission
  - `apps/sales-dashboard/src/lib/nerve-ingest.ts` — `postLeadAssignmentEvent` helper (fire-and-forget, 4s timeout, Phase A HMAC pattern)
  - `apps/sales-dashboard/src/app/api/leads/[id]/{status,pitch}/route.ts` — producers wired in both status-flipping handlers (sources: `status_patch`, `pitch_cascade`)
  - `scripts/nerve/simulate-ingest.sh` — extended with `visited → pitched → sold` three-event sweep
- **Verified:** three-event sweep on prod returned HTTP 200 with correct `transition` strings (`new→visited`, `visited→pitched`, `pitched→sold`).
- **Real data prerequisite:** set `OUTCOME_INGEST_SECRET` on the sales-dashboard Vercel project (same value as NERVE). Without it the helper returns `ok:false` and the status flip succeeds anyway, but no events flow.
- **Depends on:** none.
- **Estimated effort:** 2–3 hours.

### B2 — Stripe payment events → NERVE

- **Status:** complete (PR #55, merged 2026-05-10)
- **Owner:** _(merged)_
- **Goal:** Stripe webhook events (checkout.session.completed, customer.subscription.created, invoice.payment_succeeded, etc.) land in NERVE.
- **Files shipped:**
  - `apps/nerve/prisma/schema.prisma` + migration `13_stripe_events` — `StripeEvent` model with full `body_json` JSONB + denormalised business keys (assignment_id, salesperson_id, customer_id, session_id, subscription_id, payment_intent_id, invoice_id, amount_total_pence, currency, payment_status). Indexes: `stripe_event_id` unique + `(type, occurred_at)` + `(assignment_id, occurred_at)` + `(customer_id, occurred_at)` + session_id + subscription_id + payment_intent_id.
  - `apps/nerve/src/lib/sl-mas/stripeEventStore.ts` — idempotent ingest + per-assignment / per-customer / per-session / by-type read helpers
  - `apps/nerve/src/app/api/ingest/stripe-event/route.ts` — HMAC POST, validates required fields + bounds
  - `apps/sales-dashboard/src/lib/nerve-ingest.ts` — extracted shared `postSigned()` helper; new `postStripeEvent` + `buildStripeEventPayload` (duck-typed extraction across all Stripe resource types)
  - `apps/sales-dashboard/src/app/api/payments/webhook/route.ts` — fans out **before** local dispatch so even crashed handlers still trace to NERVE
  - `scripts/nerve/simulate-ingest.sh` — extended with synthetic `checkout.session.completed` probe
- **Verified:** full 11-endpoint simulate-ingest sweep on prod returned HTTP 200, including the new `stripe-event` probe with all denormalised keys populated.
- **Depends on:** none.
- **Estimated effort:** 2 hours.

### B3 — Salesperson signup + profile changes → NERVE

- **Status:** complete (PR #57, merged 2026-05-10)
- **Owner:** _(merged)_
- **Goal:** Signup events, profile edits, and onboarding completions write to NERVE.
- **Files shipped:**
  - `apps/nerve/prisma/schema.prisma` + migration `14_salesperson_events` — `SalespersonEvent` model with generic shape (type + denormalised fields + JSONB metadata) matching the B1/B2 template
  - `apps/nerve/src/lib/sl-mas/salespersonEventStore.ts` — ingest + timeline / per-user / by-type read helpers
  - `apps/nerve/src/app/api/ingest/salesperson-event/route.ts` — HMAC POST
  - `apps/sales-dashboard/src/lib/nerve-ingest.ts` — `postSalespersonEvent` + `buildSalespersonEventId`
  - Three handlers wired: `auth/signup` (type=signup), `payments/connect` (type=stripe_connect_created on first account creation), `admin/salespeople/[id]` (derived type from the diff: pin_reset / deactivated / reactivated / profile_update, with `metadata.fields` naming which columns moved)
  - `scripts/nerve/simulate-ingest.sh` — extended with signup + stripe_connect_created probes
- **Verified:** full 13-endpoint simulate-ingest sweep on prod returned HTTP 200, including both salesperson-event probes.
- **Depends on:** none.
- **Estimated effort:** 2 hours.

### B4 — Onboarding form responses (post-sale) → NERVE

- **Status:** not started
- **Owner:** _(unclaimed)_
- **Goal:** When a closed lead completes the onboarding form, those responses land in NERVE keyed by lead_id.
- **Files:**
  - `apps/nerve/prisma/schema.prisma` (new `OnboardingResponse` model)
  - sales-dashboard onboarding submission handler posts
- **Acceptance:** Onboarding answers queryable per lead.
- **Depends on:** none.
- **Estimated effort:** 2 hours.

---

## Phase C — Tier 3 archival

### C1 — Agent run trace mirror → NERVE

- **Status:** not started
- **Owner:** _(unclaimed)_
- **Goal:** Every Pi `pipeline_node_run` row mirrors to a `PipelineNodeRun` row on NERVE on completion. Includes attempts, error, duration_ms, input_summary, output_summary.
- **Files:**
  - `apps/nerve/prisma/schema.prisma` (new model)
  - `apps/nerve/src/app/api/ingest/agent-run/route.ts`
  - Pi `src/pipeline/engine.ts` posts after each `executeNode` settles
- **Acceptance:** Full DAG run history queryable from NERVE without touching Pi.
- **Depends on:** none.
- **Estimated effort:** 3–4 hours.

### C2 — Notifications + alerts mirror → NERVE

- **Status:** not started
- **Owner:** _(unclaimed)_
- **Goal:** Pi notifications (budget exceeded, approval required, etc.) post to NERVE.
- **Files:**
  - `apps/nerve/prisma/schema.prisma` (new `Notification` model — careful naming vs existing)
  - Pi `notificationStore.append` fans out to NERVE
- **Acceptance:** Notification log visible in NERVE.
- **Depends on:** none.
- **Estimated effort:** 2 hours.

### C3 — Approval gate events → NERVE

- **Status:** not started
- **Owner:** _(unclaimed)_
- **Goal:** Every approval request + decision (accepted/denied/expired) lands in NERVE.
- **Files:**
  - `apps/nerve/prisma/schema.prisma` (new `ApprovalEvent` model)
  - Pi `mission-control/api/lead/tasks/[id]/approval-*` and corresponding endpoints fan out
- **Acceptance:** Audit trail of approvals queryable.
- **Depends on:** C1 (FK to node_run).
- **Estimated effort:** 2 hours.

---

## Phase D — Self-learning loop (the actual feedback)

### D1 — `/build-demo` skill consults NERVE strategies + lead profiles

- **Status:** complete (PR #49, merged 2026-05-10)
- **Owner:** _(merged)_
- **Goal:** Before generating, the `/build-demo` skill fetches NERVE strategies + winning-feature aggregates for the vertical. Skill markdown is updated to bias toward champion combinations.
- **Files shipped:**
  - `apps/nerve/middleware.ts` — `api/read` exempted from founder gate
  - `apps/nerve/src/app/api/read/strategies/route.ts` — HMAC-signed GET, sorted by lifecycle priority
  - `apps/nerve/src/app/api/read/lead-profiles/winning-features/route.ts` — HMAC-signed GET, returns medians/rates/top-categories
  - `apps/nerve/src/lib/sl-mas/winningFeatures.ts` — join logic over `lead_profiles` × `pitch_log` on normalised business name
  - `~/.claude/scripts/nerve/get-ingest.sh` — companion to post-ingest.sh, signs the canonical query string
  - `~/.claude/commands/build-demo.md` — new "NERVE consultation" section + output line
- **Verified:** `~/.claude/scripts/nerve/get-ingest.sh /api/read/strategies "vertical=barber"` returned the heritage_green/trophy_bar/book_now combo (n=3, close_rate=1.0). Cafe + bakery also return real strategies. Winning-features returns `data_available:false` for all verticals (lead_profiles table sparse) — the "no signal yet" path is exercised.
- **Depends on:** A1, A2, A4 (so the data is rich enough for the skill to consume).
- **Estimated effort:** 4–6 hours including testing.

### D2 — `withLearning()` queries NERVE Postgres on autumn pipeline restart

- **Status:** complete (PR #51, merged 2026-05-10) — substrate ready, autumn-swap deferred until Pi pipeline restarts
- **Owner:** _(merged)_
- **Goal:** When the auto pipeline runs again, `withLearning()` reads prior decisions+outcomes from NERVE (not Pi SQLite) when injecting context into agent prompts.
- **Files shipped:**
  - `apps/nerve/src/lib/sl-mas/learningContext.ts` — `buildLearningContextForAgent()` mirroring the Pi-side shape
  - `apps/nerve/src/app/api/read/decisions/learning-context/route.ts` — HMAC-signed GET (matches D1's `api/read/*` pattern)
  - `src/learning/contextFormat.ts` — pure formatter extracted from `DecisionStore` so both sources produce bit-identical prompt sections
  - `src/learning/nerveLearningClient.ts` — `NerveLearningClient` drop-in read source for Pi `withLearning(...)`
  - `src/learning/learningAgent.ts` — `LearningContextSource` interface + `options.contextSource` opt-in + safe fallback to local store on remote read failure
  - `src/tests/nerveLearningClient.test.ts` — 3 tests covering wire signing, payload mapping, and the fallback path
- **Verified:** prod endpoint returns the expected shape for all seven autumn agent IDs (all empty today — Pi is parked, no decisions logged yet). Local test suite 7/7. The chosen architecture is REST over HMAC (reuses `OUTCOME_INGEST_SECRET`) rather than a thin Prisma client on Pi — avoids putting prod `DATABASE_URL` on a Raspberry Pi.
- **Autumn swap:** one block in `src/index.ts` enables it when the pipeline wakes up (block documented in PR #51).
- **Depends on:** A1–A6 + B1 (NERVE has enough data to be worth querying). Note: shipped ahead of B1 because the substrate doesn't need rich data to be ready — it returns clean empty shapes today and will become useful as decisions accumulate.
- **Estimated effort:** 1 day.

### D3 — Trained-critic LoRA pipeline (Q4 2026 / 2027)

- **Status:** parked
- **Owner:** _(unclaimed, far future)_
- **Goal:** Train a CLIP+LoRA critic on n>200 outcomes. Hot-swap into `ModelRegistry`.
- **Depends on:** A3 (demo HTML for screenshots) + n>200 closed/rejected outcomes.

---

## Phase E — MC graphical retirement

> NERVE replaces Mission Control's inline HTML dashboard one panel at a time. MC stays live as fallback during the transition; retired wholesale at the end.

### E1 — NERVE lead viewer page (parity with MC `/api/jobs` + lead detail)

- **Status:** not started
- **Owner:** _(unclaimed)_
- **Goal:** `/leads/<id>` page in NERVE matches MC's lead-detail surface. Inline brief, brand analysis, demo preview, pitch history.
- **Files:** `apps/nerve/src/app/(app)/leads/[id]/page.tsx`
- **Acceptance:** Founder can do everything they do in MC's lead viewer in NERVE.
- **Depends on:** A1, A2, A3, A4 (data must be ingested).
- **Estimated effort:** 1 day.

### E2 — NERVE pipeline runner (parity with MC scheduler studio)

- **Status:** not started
- **Owner:** _(unclaimed)_
- **Goal:** Trigger and monitor pipeline runs from NERVE. Replaces MC's "Run Job" UI.
- **Files:** `apps/nerve/src/app/(app)/pipeline/runs/page.tsx` + new ingest/control endpoints
- **Depends on:** C1.
- **Estimated effort:** 1–2 days.

### E3 — NERVE post queue (parity with MC post queue panel)

- **Status:** not started
- **Owner:** _(unclaimed)_
- **Goal:** Approve/dispatch queue items from NERVE.
- **Depends on:** A1.
- **Estimated effort:** 4–6 hours.

### E4 — Retire MC inline HTML

- **Status:** not started
- **Owner:** _(unclaimed)_
- **Goal:** Once E1–E3 reach parity, strip the inline HTML from `MissionControlServer.renderHtml()`. Keep only API routes (other apps still call them).
- **Depends on:** E1, E2, E3.
- **Estimated effort:** 2 hours.

### E5 — Retire MC API routes (Phase 5 destruction)

- **Status:** not started
- **Owner:** _(unclaimed)_
- **Goal:** Delete `src/orchestrator/orchestrator.ts`, `src/agents/codeAgent.ts`, `src/agents/opsAgent.ts`, `src/caller/callerModel.ts`. Remove MC chat console.
- **Depends on:** E4.
- **Estimated effort:** 4 hours.

---

## Done log

> Tasks land here when their checkbox flips. Most recent at top.

- **2026-05-10** PR #57 merged: B3 — salesperson lifecycle events ingest. Third Tier 2 stream. `salesperson_events` table (migration 14) with generic event shape; HMAC-signed `/api/ingest/salesperson-event` route; producers in signup handler, payments-connect, and admin profile-edit (with diff-derived event type). Per-SP timeline now queryable from NERVE.
- **2026-05-10** PR #55 merged: B2 — Stripe webhook events ingest. Second Tier 2 stream. `stripe_events` table (migration 13) with full `body_json` JSONB + denormalised business keys; HMAC-signed `/api/ingest/stripe-event` route; sales-dashboard payment webhook fans out before local dispatch (even crashed handlers trace to NERVE); shared `postSigned()` helper extracted from B1 plumbing. Closed pitches with confirmed payment now joinable from the warehouse.
- **2026-05-10** PR #53 merged: B1 — lead-assignment funnel events ingest. First Tier 2 stream. `lead_assignment_events` table (migration 12) with derived `transition` column; HMAC-signed `/api/ingest/lead-assignment` route; sales-dashboard producers wired in both status PATCH + pitch cascade handlers; simulate-ingest extended with three-event timeline sweep. Closes the dependency D2 was officially blocked on.
- **2026-05-10** PR #51 merged: D2 — `withLearning(...)` can source learning context from NERVE. `/api/read/decisions/learning-context` HMAC endpoint live; `NerveLearningClient` + extracted pure formatter; `LearningContextSource` interface on `withLearning` with safe fallback to local store. Pi swap is one block in `src/index.ts`, deferred to autumn pipeline restart.
- **2026-05-10** PR #49 merged: D1 — first read side of the self-learning loop. `/api/read/strategies` + `/api/read/lead-profiles/winning-features` HMAC-signed GET endpoints under a new `api/read` middleware exemption; companion `get-ingest.sh` helper; build-demo skill consults both before generating and biases output toward champion combinations
- **2026-05-10** **Phase A complete.** Seven Tier 1 ingest streams live in prod, all HMAC-secured, all idempotent on caller-supplied natural keys, all probed by simulate-ingest.sh
- **2026-05-10** PR #47 merged: A5 — site QA results ingest (schema, migration 11_qa_results, route, store; Pi siteQaAgent autumn)
- **2026-05-10** A3 producer wired: build-demo skill writes demo-artefact.json sidecar and posts to NERVE via post-ingest.sh
- **2026-05-10** PR #46 merged: A3 — demo HTML artefacts ingest (schema, migration 10_demo_artefacts, route, store; soft FKs to A1 + A2 chain)
- **2026-05-10** A2 + A4 producer wired: `spec-site-brief` skill writes brief.json + brand-analysis.json + lead-profile.json sidecars and posts each to NERVE via `~/.claude/scripts/nerve/post-ingest.sh`. Noose & Needle backfill verified end-to-end against prod
- **2026-05-10** PR #44 merged: ingest validators accept null on optional fields (regression: simulate-ingest.sh sweeps an explicit-null lead-profile)
- **2026-05-10** PR #43 merged: A2 — site briefs + brand analysis ingest (schema, migration 9_site_briefs, two HMAC routes, two Prisma stores, simulate-ingest.sh extended)
- **2026-05-10** PR #42 merged: A6 — API spend ledger ingest (schema, migration, route, store, runtime spendReporter wired into aiComposer/brandIntelligence/leadScoutAgent)
- **2026-05-10** PR #41 merged: A1 — composer workbench iterations ingest (schema, migration, route, store, workbench server.ts wired)
- **2026-05-10** PR #40 merged: A4 — lead profile snapshots ingest (schema, migration 7_lead_profiles, route, store; Pi-side activation deferred to autumn)
- **2026-05-10** Verified end-to-end prod pitch ingest via `simulate-pitch.sh` (HTTP 200, episode flipped pending → closed) — task #25
- **2026-05-10** PR #38 merged: NERVE build runs `prisma migrate deploy` on every deploy
- **2026-05-10** PR #36 merged: full SL-MAS Phases 1–10 + NERVE Pipeline pages + NERVE-native Postgres migration
- **2026-05-10** Bulk smoke fixture seeded into NERVE Postgres (10 demos / 7 design combos / £1,750)
- **2026-05-10** NERVE pitch ingest writes outcomes locally (no Pi roundtrip) — task #22
- **2026-05-10** Sales-dashboard `/api/admin/demo-decision` repointed at NERVE — task #23
- **2026-05-10** Vercel cron registered for nightly StrategyRanker — task #24
- **2026-05-10** NERVE Pipeline pages query Prisma directly (dropped runtime-api.ts HTTP wrappers) — task #21
- **2026-05-10** Move SL-MAS route handlers to NERVE API — task #20
- **2026-05-10** Migrate SL-MAS data layer to NERVE Postgres (8 tables + 6 store classes) — task #19
- **2026-05-09** SL-MAS smoke verified locally; Pi-runtime + Tailscale Funnel path abandoned in favour of NERVE-native Postgres
- **2026-05-08** Phase 12 — NERVE Pipeline section first cut (HTTP-fetched, since superseded)
- **2026-05-08** Phase 11 — Friday dashboard prototype in MC inline HTML (kept as fallback)
- **2026-05-08** Phase 10 — A/B harness + ModelRegistry stubs
- **2026-05-08** Phase 9 — Dynamic Planner with failure classification
- **2026-05-08** Phase 8 — LLMCritic + CriticFactory
- **2026-05-08** Phase 7 — StrategicMemory + nightly StrategyRanker
- **2026-05-08** Phase 6 — AttributionEngine
- **2026-05-08** Phase 4 — WorkingMemory + AgentCapabilityRegistry
- **2026-05-08** Phase 3 — Episodic memory + HeuristicCritic + ReflectionLoop
- **2026-05-08** Phase 2 — Decision tagging + manual /build-demo
- **2026-05-08** Phase 1 — Outcome bridge (NERVE PitchLog → DecisionStore)

---

## Auto-update mechanism (deferred — not yet wired)

Once we have multiple Claude sessions actually working this in parallel, three options for keeping this doc fresh without manual edits:

1. **Commit-message convention.** Each PR description includes `Closes <TASK_ID>`. A simple `npm run roadmap:status` script scans `git log` since the last roadmap update, finds matching task IDs, flips checkboxes, appends to Done log. Run via `/finish` skill at end of session.

2. **Pre-merge GitHub Action.** Action parses PR description, edits roadmap, commits to the PR branch. Merge brings the doc forward atomically with the work.

3. **Manual `/finish` prompt.** Simplest. The skill asks "did you close any roadmap tasks?" and edits the doc inline.

Recommend (3) for v1 since it's instant; (2) when 2+ agents are concurrent.
