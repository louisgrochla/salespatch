# Post-pitch questionnaire — iOS → mobile-api → NERVE

**Date:** 2026-05-03
**Branch:** `claude/nice-kare-edfa44`
**Commits:** `e5736e8` (NERVE), `07e205c` (mobile-api), `612459c` (iOS)

## What changed

End-to-end pipeline for capturing structured post-pitch data and
landing it in NERVE. Closes the long-standing gap where iOS pitches
left no useful trace beyond a status flag.

### NERVE — schema + API + UI

- **Migration `4_pitch_questionnaire`** (additive): adds 16 new columns
  to `PitchLog` plus six new enums (`InterestLevel`, `DemoReaction`,
  `PaymentMethod`, `FollowupTime`, `AgreedNextStep`, `PitchQualityFlag`),
  three new `PitchOutcome` values (`closed_now`, `closed_followup`,
  `not_pitched`), and three new indexes (`qualityFlag`,
  `decisionMakerPresent`, `interestLevel`). Legacy `closed` value
  retained for back-compat.
- **`/api/ingest/pitch`**: accepts both Supabase webhook envelopes and
  flat mobile-api bodies; reads snake_case + camelCase for every field;
  computes `qualityFlag` server-side from one rule (`excluded` if
  `!consentToRecord` OR `outcome=not_pitched` OR `pitchDuration<30s`,
  else `ok`). Tracks `source` field as `webhook` / `mobile-api` /
  `manual` for audit. Embedding metadata enriched with the new
  questionnaire fields so `/ask` queries can ask about decision-maker
  presence, interest level, demo reaction, etc.
- **`/sales/[id]` detail view**: rebuilt into four sections — facts,
  questionnaire (with conditional fields hidden when irrelevant),
  texture (gut-feel slider, first-response phrase, competitor, notes),
  and location (GPS link to OpenStreetMap when present). Quality flag
  badged at the top so excluded rows are obvious to the founder.
- **`PitchForm`**: outcome dropdown updated to expose all five new
  values plus the legacy `closed` option.
- **Status pill**: rendered correctly for all outcomes; `closed_now`
  and `closed_followup` both styled as the existing `closed` colour.

### mobile-api — pitches table + endpoint + NERVE relay

- **New SQLite table `pitches`** mirroring NERVE's PitchLog
  questionnaire fields. Indexed by `user_id`, `lead_id`,
  `assignment_id`, and `forwarded_to_nerve_at` (for retry queries).
- **`POST /leads/:id/pitch`**: validates outcome + every enum,
  computes `pitch_attempt_number` from local pitch history,
  denormalises lead context (name, type, sector, postcode) for
  forwarding, persists the row, cascades the `lead_assignments.status`
  (sold/rejected/visited/pitched) to match the new outcome semantics,
  and writes an audit row to `sales_activity_log`.
- **`nerve-forwarder.ts`**: HMAC-SHA256-signs the payload with
  `NERVE_PITCH_SECRET` (matching NERVE's `SUPABASE_WEBHOOK_SECRET`)
  and POSTs to `NERVE_PITCH_URL` (default
  `https://nerve.salespatch.co.uk/api/ingest/pitch`). On success,
  `forwarded_to_nerve_at` is stamped on the row. On failure,
  `forward_error` is recorded but the request still returns 200 with
  `forwarded: false` — local data is never lost, retry is queued via
  the indexed `forwarded_to_nerve_at IS NULL` query.

### iOS — modal + APIClient + LeadDetailView wiring

- **New `PostPitchView.swift`**: 3-stage questionnaire sheet.
  - Stage 1 (required, ~10s): outcome chip row, decision-maker
    yes/no, demo-shown yes/no, interest-level chip row, consent
    toggle. Cannot proceed until all five answered.
  - Stage 2 (conditional): branches appear only when relevant —
    demo reaction (if demo shown), objections multi-select grid (if
    rejected/follow-up), agreed price + payment method (if closed),
    best follow-up time + agreed next step (if follow-up). Empty
    state ("nothing extra needed — tap Next") when no branch applies.
  - Stage 3 (optional gold): notes one-liner, gut-feel close %
    slider 0–100, "what did they say first?" text, competitor
    mentioned. Submit available even with all blank.
  - Auto-captures GPS via `LocationManager`; pulls `pitch_duration_seconds`
    from the existing `visitStartTime`. Pitch attempt number computed
    server-side from history.
- **`APIClient.recordPitch(assignmentId:payload:)`**: typed
  `PitchPayload` struct + decoded `PostPitchResult` returning NERVE
  pitch id and `qualityFlag` so the SP knows whether the row made
  it through.
- **`LeadDetailView`**: sticky action bar swaps "UPDATE STATUS"
  for "COMPLETE PITCH" while a visit is live; tapping it opens the
  questionnaire sheet. On submit, an inline toast confirms NERVE
  forward (or "queued for retry" if forward failed).

## Why

Pitch data was the biggest analytical gap in the platform. The
existing iOS flow only captured a status flag (`pitched/sold/rejected`),
losing every signal that matters: who was actually pitched (decision-
maker?), did the demo land, what objections came up, what was the
agreed follow-up. Without that, neither the operations dashboard nor
the dissertation can stratify outcomes meaningfully.

The questionnaire is the single capture point for the whole platform.
NERVE's `qualityFlag` rule means dissertation queries automatically
filter to research-grade rows (consented, ≥30s, real outcome) while
operational queries see everything — one column, one source of truth.

## Stack

- **NERVE**: Next.js 14 App Router, Prisma 5, Postgres (Neon) +
  pgvector, Zod for body validation, OpenAI text-embedding-3-small
  for indexing.
- **mobile-api**: Express on Node 20, better-sqlite3 (shared DB at
  `../mission-control/mission-control.db`), `crypto.createHmac` for
  signing, native `fetch` for forwarding.
- **iOS**: SwiftUI, `LocationManager` for GPS, native `URLSession`
  via `APIClient`. SwiftData for offline-resilient `lead.status`.

## Integrations

- **mobile-api → NERVE** via HMAC-signed POST. Requires
  `NERVE_PITCH_SECRET` (= NERVE's `SUPABASE_WEBHOOK_SECRET`) and
  optionally `NERVE_PITCH_URL` for non-prod targeting.
- **iOS → mobile-api** at the configured `apiBaseURL`
  (`UserDefaults` override; defaults to the Vercel sales-dashboard
  host). For local testing point at `http://localhost:4350`.
- **NERVE → OpenAI** for embeddings (silently no-ops without key).

## How to verify

End-to-end (after applying the migration):
1. NERVE: `cd apps/nerve && npm run db:deploy` — applies
   `4_pitch_questionnaire` to Neon.
2. mobile-api: `npm run dev` (port 4350). Set
   `NERVE_PITCH_SECRET=<same-as-NERVE-SUPABASE_WEBHOOK_SECRET>` in
   the shell.
3. iOS: open SalesFlow simulator, point at mobile-api via
   `UserDefaults` `apiBaseURL = "http://localhost:4350"`.
4. Open any lead → tap "I'm here — start visit" → tap
   "COMPLETE PITCH" in the sticky bar → fill the 3-stage flow →
   Submit. Toast confirms NERVE forward.
5. Open `http://localhost:4400/sales/<id>` in NERVE — every
   questionnaire field renders, plus the GPS link, plus the
   `qualityFlag` badge.

Smoke test without iOS:
```bash
curl -sS -X POST http://localhost:4400/api/ingest/pitch \
  -H "Content-Type: application/json" \
  -H "x-supabase-signature: $(echo -n "$BODY" | openssl dgst -sha256 -hmac "$NERVE_SECRET" | cut -d' ' -f2)" \
  -d "$BODY"
```
where `$BODY` is a flat mobile-api shape with all the new fields.

## Known issues / out of scope

- **Migration not yet applied to Neon** at commit time — code is
  feature-complete, schema is queued. Run `npm run db:deploy` when
  ready. The agent was permission-blocked from applying.
- **Sales-dashboard does not yet have `/leads/:id/pitch`**. iOS
  prod points at the Vercel sales-dashboard host; until the same
  endpoint lands there, prod iOS will hit a 404. Local dev works
  fine via the mobile-api `apiBaseURL` override.
- **No retry job yet** for failed NERVE forwards. The
  `forwarded_to_nerve_at IS NULL` query is indexed and ready; a
  small cron job picking up unforwarded rows can be added when
  needed.
- **Objection enum values are baked into the iOS app**. Adding a
  new objection requires an iOS rebuild. Acceptable for the beta
  (the list was carefully chosen); could move to a server-fed
  enum endpoint later.
- **`other` objection captured as `other:<text>`** in the
  objections array. NERVE's `ObjectionTag` table doesn't yet
  parse the prefix — currently shows up as a single tag string.
  Easy to extend the ingest route to split it.
- **iOS Swift code not compile-checked from this session** — the
  agent has no xcodebuild access. User should rebuild in Xcode
  to confirm.
