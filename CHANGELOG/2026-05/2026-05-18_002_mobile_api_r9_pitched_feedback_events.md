# mobile-api — R9 pitched + feedback visit_events

**Date:** 2026-05-18
**Scope:** Complete the R9 producer wire-up by emitting `pitched` and
`feedback` visit_events from the remaining lead-touching handlers, so
NERVE's /leads ops view `feedbackCount` column can flip off the
Supabase fallback and SP intel/pitch notes flow into the RAG vault.
**Branch:** `feat/mobile-api-r9-pitched-feedback-events`
**Base branch:** `main`
**Follows:** `2026-05-18_001_mobile_api_r9_visit_event_producer.md`
(arrived + departed from /visits handlers).

## What changed

### Files

- **Modified** `apps/mobile-api/src/routes/leads.ts`:
  - Import `forwardVisitEventToNerve` + `buildVisitEventId` from the
    R9 forwarder helper (shared with the visits wire-up).
  - `PATCH /leads/:id/status` — when the new status is `pitched`,
    fire a `pitched` visit_event with current GPS. Other status
    transitions don't map cleanly to a visit_event type.
  - `POST /leads/:id/intel` — when the SP wrote any free-form
    intel (notes, objection, competitor mentioned, sentiment, best
    follow-up time, price discussed), fire a `feedback` visit_event.
    The text is a joined human-readable form; structured fields ride
    along in `metadata`. `interest_level` maps to `rating`
    (cold=1, warm=3, hot=5).
  - `POST /leads/:id/pitch` — alongside the existing
    `nerve-forwarder`-based pitch ingest, emit a `pitched`
    visit_event (with `duration_minutes` rounded from
    `pitch_duration_seconds`) for any outcome except `not_pitched`,
    plus a `feedback` visit_event when the SP wrote free-form
    content on the questionnaire. `gut_feel_close_pct` maps to
    `rating` (linear bucketing into 1-5).

### Mapping summary

| Handler | Event type | When | feedback text | rating source |
|---|---|---|---|---|
| `PATCH /leads/:id/status` | `pitched` | `status === 'pitched'` | — | — |
| `POST /leads/:id/intel` | `feedback` | any intel field populated | joined notes + objection + competitor + sentiment + best_time + price | `interest_level` |
| `POST /leads/:id/pitch` | `pitched` | `outcome !== 'not_pitched'` | — | — |
| `POST /leads/:id/pitch` | `feedback` | notes / first_response / competitor / objections / demo_reaction present | joined text | `gut_feel_close_pct` |

All four emissions reuse the existing
`apps/mobile-api/src/nerve-visit-forwarder.ts` (HMAC fire-and-forget,
silent no-op when `OUTCOME_INGEST_SECRET` is unset).

### Idempotency

`event_id` is `${assignmentId}:${type}:${occurred_at_no_punct}`. Two
sources can emit the same logical `pitched` event for the same
assignment (PATCH /status then POST /pitch), and that's intentional —
they have distinct `occurred_at` timestamps, so they live as two
audit rows on the append-only visit_events table. Replays from a
flaky producer collide on `event_id` and NERVE returns
`inserted: false`.

## Why

R9's first PR wired the visits half (arrived/departed). The /leads
ops view's `feedbackCount` column was still falling back to Supabase
because no producer was emitting `feedback`, and the SP's
in-the-field intel never reached `/ask`. This commit closes both
gaps so NERVE becomes the source of truth for the full SP-touched
timeline.

## Stack

- Express 4 (existing)
- HMAC-SHA256 via the existing `nerve-visit-forwarder.ts`
- No new dependencies.

## Integrations

- Outbound: same as the first R9 PR —
  `NERVE_VISIT_EVENT_URL` / `OUTCOME_INGEST_SECRET`.
- No new env vars.

## How to verify

Programmatic:

```bash
cd apps/mobile-api && npx tsc --noEmit
# 4 pre-existing payments.ts errors only (unrelated; same on main).
```

End-to-end against a NERVE preview:

1. `PATCH /leads/:id/status { status: "pitched", lat, lng }` →
   NERVE `visit_events` gains a `pitched` row tagged
   `metadata.via = "patch-status"`.
2. `POST /leads/:id/intel { notes: "owner wants menu photos refreshed", interest_level: "warm" }`
   → NERVE gains a `feedback` row with `rating = 3`, `feedback`
   containing the joined text, and an embedded chunk surfaces in
   `/leads/<slug>` chat ("what did the SP say about the menu
   photos?").
3. `POST /leads/:id/pitch` (any outcome ≠ `not_pitched`) →
   NERVE gains a `pitched` row + a `feedback` row if the
   questionnaire had any free-form content. `duration_minutes` is
   populated on the `pitched` row when `pitch_duration_seconds` was
   provided.
4. `/leads` ops view: the touched lead's `feedbackCount` cell now
   counts NERVE feedback rows, not Supabase. `/ask` scoped to the
   lead surfaces the new chunks.

## Known issues

- The two pitch-side emissions (`pitched` + `feedback`) share the
  same `occurred_at = pitchedAt`. Different `type` segments keep the
  `event_id`s distinct, but anyone querying by `occurred_at` will see
  the two rows clustered. That's fine for the dissertation timeline
  but worth flagging.
- `gut_feel_close_pct` → `rating` mapping is `ceil(pct/20)`. A 0%
  pitch becomes `rating = 1` (vs `null`) — the SP explicitly judged
  the lead as cold, so we preserve that signal.
- The Supabase fallback in `apps/nerve/src/lib/sl-mas/leadOpsQuery.ts`
  is still in place. Per the R9 audit follow-up, it's a one-line
  removal once we're confident every active lead has at least one
  NERVE-mirrored event. Wait a few weeks.
