---
tags: [api, routes, endpoints, apps]
related: [../architecture/app-overview.md, ../architecture/cross-app-communication.md]
---

# API Surface

Which app serves which endpoints. All use JSON request/response bodies.

## Sales Dashboard (Next.js App Router, port 4300)

Auth:
- `POST /api/auth/login` — name + PIN → token
- `POST /api/auth/signup` — create new salesperson
- `POST /api/auth/logout` — clear session cookie
- `GET /api/auth/me` — current user info

Leads:
- `GET /api/leads` — list salesperson's assigned leads
- `GET /api/leads/:id` — full lead detail with enrichment
- `PATCH /api/leads/:id/status` — update lead status
- `POST /api/leads/:id/intel` — generate talking points
- `GET /api/leads/:id/brief` — get sales brief

Payments:
- `POST /api/payments/create-checkout` — Stripe checkout session
- `POST /api/payments/webhook` — Stripe webhook handler
- `POST /api/payments/connect-onboard` — Stripe Connect onboarding

Demos:
- `GET /api/demo-site/[slug]` — serve demo from Supabase
- `GET /api/demo-preview/[id]` — preview demo
- `POST /api/demo-links` — create shareable link
- `GET /api/demo-links/:code` — get link by code

Other:
- `GET /api/stats` — salesperson dashboard stats
- `GET /api/activity` — activity feed
- `POST /api/activity` — log activity
- `/api/admin/*` — admin upload, assign, auth (separate auth)

## Mobile API (Express, port 4350)

Same domain as sales-dashboard but different framework. iOS app hits this.

- `POST /auth/login`, `POST /auth/register`, `GET /auth/me`
- `GET /leads`, `GET /leads/:id`, `PATCH /leads/:id/status`
- `POST /leads/:id/intel`, `GET /leads/:id/brief`
- `POST /visits`, `GET /visits/:id` (visit sessions)
- `POST /photos`, `GET /photos/:id` (lead photos)
- `POST /payments/checkout-url`, `GET /payments/status/:demo_id`, `POST /payments/connect-onboard`
- `GET /training/units`, `GET /training/units/:id`, `POST /training/progress`, `POST /training/responses`
- `POST /sync`, `GET /sync/status` (offline sync)
- `GET /health`

## Admin Panel (Next.js App Router, port 4400)

- `POST /api/auth/login` — admin login (role-based, not PIN)
- `GET /api/leads` — all leads across all salespeople
- `GET /api/stats` — team-wide statistics
- `GET /api/team` — list salespeople with computed stats
- `PATCH /api/team/:id` — update salesperson settings

## NERVE (Next.js App Router, deployed to Vercel as nerve.salespatch.co.uk)

Read endpoints (all GET, HMAC-signed via `OUTCOME_INGEST_SECRET` in
`x-read-signature`):

- `GET /api/read/lead-bundle?slug=` — full lead aggregate
- `GET /api/read/pending-assignments` — lightweight queue
- `GET /api/read/notes?scope=&relatedSlug=&tag=&q=`
- `GET /api/read/strategies?vertical=&region=&status=`
- `GET /api/read/business-identity/lookup?name=&postcode=`
- `GET /api/read/lead-profiles/winning-features?vertical=`
- `GET /api/read/qa-results/by-outcome?vertical=`
- `GET /api/read/qa-visual/by-lead?lead_id=&limit=`
- `GET /api/read/qa-visual/baselines?vertical=`
- `GET /api/read/demo-artefacts/brief-drift?vertical=`
- `GET /api/read/decisions/learning-context?agent_id=&limit=`

RAG (POST, HMAC-signed via `OUTCOME_INGEST_SECRET` in `x-read-signature`):

- `POST /api/search` — ranked chunks for a query + optional filter
- `POST /api/ask` — RAG → Claude answer with sources, optional `leadSlug` scope

See `./rag-api.md` for the full request/response schemas of the RAG endpoints.

Ingest endpoints (POST, HMAC-signed; ingest secret depends on producer):

- `POST /api/ingest/pitch`, `lead-profile`, `lead-assignment`, `site-brief`, `brand-analysis`, `demo-artefact`, `pitch-brief`, `qa-result`, `qa-visual-result`, `composer-iteration`, `stripe-event`, `salesperson-event`, `onboarding-response`, `decision`, `outcome`, `changelog`, `notes`, `business-fact`, `spend`

Public:

- `GET /api/public/demo/[slug]` — serves a demo artefact's HTML (no auth)
- `GET /api/public/metrics` — aggregate KPIs (no auth)

## How iOS Communicates

iOS app → mobile-api (Express). Uses Bearer token auth. Base URL configured in `APIClient.swift`. Does NOT talk to sales-dashboard or admin-panel directly.
