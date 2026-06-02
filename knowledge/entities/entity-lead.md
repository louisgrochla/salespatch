---
tags: [entity, lead, assignment, core]
related: [../domain/lead-lifecycle.md, ../contracts/shared-enums.md]
---

# Entity: Lead / Lead Assignment

The central business object. A "lead" is a business profile; a "lead assignment" binds a lead to a salesperson with status tracking.

## Canonical Fields (SQLite `lead_assignments` table)

| Field | Type | Notes |
|---|---|---|
| id | text PK | UUID, called `assignment_id` in TypeScript |
| lead_id | text | Slug identifier for the business |
| user_id | text FK | References `sales_users.id` |
| status | text | new/visited/pitched/sold/rejected |
| assigned_at | timestamp | When assigned |
| visited_at | timestamp | When first visited |
| pitched_at | timestamp | When demo was shown |
| sold_at | timestamp | When sale closed |
| rejected_at | timestamp | When declined |
| rejection_reason | text | Optional: price, not_interested, has_website, wrong_person, timing, other |
| notes | text | JSON blob — contains enriched business data (description, services, reviews, brand info) |
| commission_amount | real | Final commission for this sale |
| agreed_price_pence | integer | Negotiated flat one-time price (pence). NULL = use default £299 setup + £25/mo model. Set by pitch cascade on `closed_now`/`closed_followup`. When set, payment view + Stripe Checkout use this as the setup fee AND the webhook skips creating the recurring subscription. |
| paid_at | timestamptz | Set ONLY by Stripe webhook on `checkout.session.completed`. Strictly stronger than `sold_at` — sold-unpaid = `sold_at IS NOT NULL AND paid_at IS NULL`. Every "already done" guard in the payment flow keys on this, not `status='sold'`. |
| location_lat/lng | real | GPS coordinates of visit |
| follow_up_at | timestamp | Scheduled follow-up |
| follow_up_note | text | Follow-up context |
| contact_name | text | Decision-maker name |
| contact_role | text | Decision-maker title |

## Representations Across Apps

**sales-dashboard** (`apps/sales-dashboard/src/lib/types.ts`):
- `LeadAssignment` — core assignment fields
- `LeadCard` — list view (assignment + business profile fields)
- `LeadDetail extends LeadCard` — full view (adds enrichment: services, reviews, brand, brief data)

**admin-panel** (`apps/admin-panel/src/lib/types.ts`):
- `LeadRow` — compact view with `assigned_to_name`/`assigned_to_id` from JOIN

**iOS** (`apps/ios/salesflow/salesflow/Models.swift`):
- `Lead` @Model — SwiftData persistent model. JSON-encoded arrays for services, reviews, badges.
- `LeadDTO` — API response DTO, converted to Lead on sync.

**mobile-api** (`apps/mobile-api/src/routes/leads.ts`):
- No dedicated type — uses inline `Record<string, unknown>` from DB queries.

## Business Data in `notes` JSON

The `notes` column stores a JSON blob with enriched business intelligence:
- `description`, `services[]`, `pain_points[]`, `opening_hours[]`
- `best_reviews[]` (author, rating, text)
- `brand_colours` (Record of colour name → hex)
- `trust_badges[]`, `avoid_topics[]`, `hero_headline`, `cta_text`
- `logo_filename`, `gallery_filenames[]`

This data comes from the brand intelligence agent and is used to generate talking points for the salesperson.
