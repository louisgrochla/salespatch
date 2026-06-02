# ADR-0015: Post-sale fulfilment state machine — DEFERRED

**Status**: Accepted (deferred — track via NERVE notes for now)
**Date**: 2026-06-02
**Author**: System

## Context

The first real beta sale closed in June 2026 (Chatty Patty, £250, verbal close — Stripe deferred to "right before launch"). This surfaced a gap nobody had built around: **there is no operator-facing state for post-sale fulfilment work** — uploading new client photos, doing final touches, deploying the paid site, marking it live, handing over.

The NORTH STAR (`memory/north_star_flow.md`) describes this as **Phase 3 (Fulfilment Pipeline)** triggered by £350 Stripe payment, followed by **Phase 4 (Client Portal)** — all fully automated. The beta bypasses that path entirely (manual demos, SPs/founder selling in person, negotiated prices, deferred payment), so none of Phase 3/4 ever fires.

What the schema today *can* express:

| State | How |
|---|---|
| Pre-sale stages | `AssignmentStatus = new \| visited \| pitched` |
| Sold | `AssignmentStatus = sold` + `sold_at` timestamp |
| Sold-unpaid | `status = 'sold' AND paid_at IS NULL` (via Tier 2 PR #136) |
| Paid | `paid_at IS NOT NULL` (set by Stripe webhook) |

What it cannot express: where the fulfilment work *is* (todo / in progress / live), what was changed in a revision, who's blocked on what, when the deploy went out, when handover happened.

## Decision

**Do not build a `fulfillment_status` state machine right now.** For the foreseeable beta (< 20 closed deals), track post-sale fulfilment via the existing **NERVE notes feature** (`/notes/new?scope=lead&relatedSlug=<slug>`) and the **demo-revision** mechanism (`/nerve-demo-revision`, PR #135).

Specifically:
- Each sold lead gets one founder note with a fulfilment checklist (photos pending / payment pending / deployed / handover).
- Demo edits flow through `/nerve-demo-revision` (which already creates an append-only audit row in `demo_artefacts` with `metadata.revision_reason`).
- Sold-unpaid is queryable via the `(sold_at, paid_at)` tuple — no new column required.

## Rationale

A real fulfilment state machine would mean:

1. **Extending `AssignmentStatus`** with new values (e.g. `fulfilling`, `live`). The enum is defined in **5 places** across the monorepo (`apps/sales-dashboard/src/lib/types.ts`, `apps/admin-panel/src/lib/types.ts`, `apps/mobile-api/src/routes/leads.ts` hardcoded, `apps/ios/SalesFlow/.../Models.swift`, `supabase/sales-dashboard-tables.sql` CHECK constraint, plus `knowledge/contracts/shared-enums.md`). Cross-contract change with iOS app coordination cost.
2. **Or a parallel column** (`fulfillment_status`) — same blast radius (5 apps must agree) without the upside of being on the canonical status field.
3. **A UI surface** in admin-panel and/or NERVE for the founder to advance state through the lifecycle.
4. **Wiring producers** (auto-advance when deploy completes, when domain registers, etc.).

At n=1–10 beta sales, the marginal benefit over a structured NERVE note is small: the founder *is* the fulfilment system, and a checklist note is the same content with zero coordination cost. The roadmap principle (`memory/feedback_leverage_principle.md`) deprioritises low-day-1-leverage infrastructure during beta.

## Consequences

**Trade-offs accepted:**
- Fulfilment progress is **not queryable across the cohort** (each lead's status lives in free-text markdown). Acceptable while n is small.
- **No iOS visibility** of post-sale state for the SP (they see `status='sold'` and stop). Acceptable — beta SPs aren't doing fulfilment.
- **No automation hooks** off fulfilment transitions (e.g. trigger deploy when status flips to `live`). Beta deploys are manual.

**Preserved:**
- The sold-unpaid pattern works end-to-end (Tier 2 PR #136 fixed the five `status='sold' === paid` conflations across `payments.ts`, the webhook, `/preview`, `/onboarding`).
- Every demo edit lands in NERVE as a new artefact via `/nerve-demo-revision` — audit trail intact.
- The £25/mo subscription is correctly suppressed for negotiated flat-one-time deals (PR #136).

## When to revisit

Build the fulfilment state machine when **any one** of the following holds:

- **Volume**: ≥ 20 closed beta deals — note-based tracking starts to fray.
- **Incident**: a deferred-payment or post-sale fulfilment screw-up that costs > £200 or a client.
- **Phase 3 automation**: the moment we wire any post-payment automation (Vercel deploy, domain register, etc.), it needs a state field to gate on.
- **SP visibility**: the iOS app gains a "your sold deals in fulfilment" view.

At that point, the right shape is likely a **separate `fulfillment_status` column** on `lead_assignments` (not extending `AssignmentStatus`) — keeps the SP-facing status surface clean and avoids the 5-app enum cascade. Suggested values: `pending` / `building` / `awaiting_payment` / `awaiting_client` / `live` / `handover_complete`.

## What this ADR does NOT cover

- The Tier 2 work itself (negotiated flat-one-time + sold-vs-paid guards) — that landed in PR #136 and the contract notes are updated in `knowledge/entities/entity-lead.md` and `knowledge/domain/payment-flow.md`.
- Mid-engagement notes between B1 (visit/pitch) and B4 (onboarding) — that's roadmap task **F3** (independent track).
- Client portal (NORTH STAR Phase 4) — far horizon, out of scope.

## References

- NORTH STAR: `memory/north_star_flow.md` (Phase 3 + Phase 4)
- Beta plan: `memory/beta_launch_plan.md`
- Tier 2 PR: [#136](https://github.com/louisgrochla/salespatch/pull/136) — sold-vs-paid + flat-one-time
- Demo revision PR: [#135](https://github.com/louisgrochla/salespatch/pull/135) — `/nerve-demo-revision`
- Roadmap F3 (mid-engagement notes): `NERVE-ROADMAP.md`
- Contract notes: `knowledge/entities/entity-lead.md`, `knowledge/domain/payment-flow.md`
