# NERVE — /api/read/qa-results/by-outcome

## What changed

- `apps/nerve/src/lib/sl-mas/qaResultStore.ts` — new `QaByOutcomeSummary`
  type + `byOutcome(vertical?)` method. Raw SQL via `prisma.$queryRaw`
  picks the latest QA per artefact (DISTINCT ON), joins to the latest
  `lead_assignment_events.status` per lead, optionally filters by
  `demo_artefacts.vertical`. Aggregation runs in Node:
  - Scores bucketed into `closed | rejected | pitched_pending |
    visited_no_pitch | no_visit` via a normalising switch.
  - Each bucket carries `n`, `score_mean`, `score_p50` (median).
  - `sample_size_warning` populated until at least one bucket reaches
    n>=10.
- `apps/nerve/src/app/api/read/qa-results/by-outcome/route.ts` — new
  HMAC-signed GET endpoint mirroring `/api/read/strategies` and
  `/api/read/demo-artefacts/brief-drift`. Optional `vertical` query
  param; returns the full summary.

## Response shape

```json
{
  "vertical": "hospitality",
  "buckets": {
    "closed":           { "n": 0, "score_mean": null, "score_p50": null },
    "rejected":         { "n": 5, "score_mean": 87,   "score_p50": 88 },
    "pitched_pending":  { "n": 2, "score_mean": 90,   "score_p50": 90 },
    "visited_no_pitch": { "n": 1, "score_mean": 85,   "score_p50": 85 },
    "no_visit":         { "n": 4, "score_mean": 91,   "score_p50": 92 }
  },
  "sample_size_warning": "n<10 for every bucket; results not statistically meaningful yet",
  "generated_at": "2026-05-15T22:55:00.000Z"
}
```

`sample_size_warning` is `null` once at least one bucket has n>=10.

## Outcome bucketing rules

`LeadAssignmentEvent.status` uses the AssignmentStatus enum (from
`knowledge/contracts/shared-enums.md`):

| status | bucket | rationale |
|---|---|---|
| `sold` | `closed` | the win — the loop's target signal |
| `rejected` | `rejected` | terminal lost |
| `pitched` | `pitched_pending` | pitched but no resolution yet |
| `visited` | `visited_no_pitch` | visited but never pitched |
| `new` / no events | `no_visit` | not visited, or no assignment at all |

## Why

QA scores have been landing in `qa_results` since the auto-QA producer
in `/build-demo` shipped. Outcomes have been landing in
`lead_assignment_events` since Phase B1. Nothing joined the two. This
endpoint closes that loop so the AI layer can answer "do high-QA demos
close better than low-QA demos?" without ad-hoc SQL.

With zero closed leads in the warehouse today, the endpoint will return
mostly nulls. That's fine — the loop activates the moment the first
`status=sold` event lands.

## Stack
Next.js 14 App Router + Prisma 5 raw SQL (no schema change). HMAC
signing helper already exists.

## Integrations
- NERVE only. No external APIs, no cost change.
- Consumed by future AI agents and the dashboard. The producer side
  doesn't read this — it consults `/api/read/strategies` and
  `/winning-features` for forward-looking signal.

## How to verify

1. `cd apps/nerve && npx tsc --noEmit` — clean (verified locally)
2. Local dev: set `OUTCOME_INGEST_ALLOW_UNSIGNED=true` in `.env.local`,
   run `npm run dev`, hit
   `http://localhost:4400/api/read/qa-results/by-outcome?vertical=hospitality`.
   Confirm the response shape matches the spec above.
3. Post-deploy: hit the live endpoint via the nerve read helper:
   ```bash
   ~/.claude/scripts/nerve/get-ingest.sh /api/read/qa-results/by-outcome "vertical=hospitality"
   ```
4. Expected for vertical=hospitality on current warehouse: Blackbird's
   QA score (100/100 after the em-dash fix) lands in `no_visit` —
   because the lead has no `lead_assignment_events` rows yet. As the
   first leads are assigned and worked, scores migrate into the other
   buckets.
5. Test all-verticals rollup with no `vertical` param.
6. HMAC failure path: hit the endpoint without `x-read-signature` in
   production mode, confirm 401.

## Known issues

- Until at least one `lead_assignment_events` row exists for a lead with
  a QA result, that lead's score lands in `no_visit`. The current
  warehouse has 4-ish QA rows and zero assignment events; the entire
  response will be in `no_visit` until the first lead is actually
  assigned to an SP.
- The "latest QA per artefact" picks the most recent score even if it
  was a rebuild iteration (e.g. Blackbird ran v1 99/100 then v2 100/100
  after fixing em-dashes). Using only the latest is correct — we care
  about the score of the demo that's actually being pitched, not the
  iteration history.
- Multi-assignment leads (one lead, multiple SP assignments over time)
  collapse to the single latest event. If we later want
  per-assignment stats we'll need a separate endpoint keyed on
  `assignment_id` instead of `lead_id`.
- The bucketing maps `pitched` to `pitched_pending` for now. Once
  `pitch_log.outcome` is wired into the cascade, `pitched_pending`
  should split into `pitched_closed` and `pitched_rejected` — but that
  needs the pitch outcome to flow back into `lead_assignment_events`
  first.
