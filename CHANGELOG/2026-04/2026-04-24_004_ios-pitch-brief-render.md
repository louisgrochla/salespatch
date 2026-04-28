# iOS render for the pitch-brief sales fields

## What changed

**Modified files**
- `apps/ios/SalesFlow/SalesFlow/Models.swift`
  - `Lead` (SwiftData) + `LeadDTO` gain 7 new fields matching the Vercel admin-upload shape:
    `hook`, `opener`, `demoMoments`, `specificObjections`, `closeScript`, `nextVisitReason`, `painPointsExtended`.
  - New `ObjectionPair { objection, response }` struct.
  - Computed `Lead.isPassBrief` checks whether `hook` begins with `PASS` — Claude's "already has a site, no sale here" signal.
  - `LeadDTO.CodingKeys` maps snake_case keys from `/api/leads` → camelCase on Swift.
  - `LeadDTO.toModel()` passes all seven fields through.
- `apps/ios/SalesFlow/SalesFlow/LeadsView.swift`
  - `syncLeads` mirror updates the new fields so admin edits propagate on pull-to-refresh.
- `apps/ios/SalesFlow/SalesFlow/LeadDetailView.swift`
  - **Prepare tab**: new THE HOOK card (signal @ 0.12 fill, signal @ 0.4 border, display 19pt); WHAT'S COSTING THEM MONEY bullet list; optional free-text CONTEXT card (pain_points_extended); DON'T MENTION renamed from "Avoid these topics" to match web.
  - **Pitch tab**: new FIRST LINE AT THE DOOR card with signal 3pt left border + italic quote; WHAT TO TAP DURING THE DEMO arrow-prefixed cards; Objection cards now render as "They say" (amber) / "You say" (signal) paired within a single card; ASK FOR THE SALE card (signal @ 0.10 fill, 0.35 border, quoted display); IF TODAY'S A NO subtle recovery card.
  - **PASS state**: if `lead.isPassBrief`, Prepare shows a single amber warning card ("/ SKIP THIS LEAD") and all other tactical sections are suppressed — the rep moves on instead of pitching.
  - Demo-moments arrow-prefixed section (`demoMomentsSection`) replaces the old generic sparkle-bullet list.

## Why

Downstream of the Vercel admin session that added 7 fields to `lead_assignments.notes`, the iOS app now reads + renders them with styling matching the web brand system. Generic hardcoded objection handlers only surface as labelled fallbacks when the admin hasn't provided tailored ones.

## Stack

- SwiftUI, SwiftData
- Vercel Next.js backend (`salesflow-sigma`)
- Supabase `lead_assignments.notes` JSONB

## Integrations

- `GET https://salesflow-sigma.vercel.app/api/leads` — list response now carries the 7 new keys (if admin has populated them)
- `GET /api/leads/:id` — same, detail endpoint

## How to verify

1. `xcrun simctl erase <uuid>` + reinstall + launch
2. Sign in with `/ USE DEMO ACCOUNT` OR a real user assigned a lead via `/admin`
3. Use the admin portal at `https://salesflow-sigma.vercel.app/admin` (password `salesflow2026`) to upload the minimum valid test payload from the handover (Fable Books). Assign to the current user.
4. Pull-to-refresh the iOS Leads list → tap the new lead
5. **Prepare tab** should show: THE HOOK → WHAT'S COSTING THEM MONEY bullets → services → trust signals → top reviews → don't mention
6. **Pitch tab** should show: FIRST LINE AT THE DOOR (quoted, signal left-border) → Show client demo button → WHAT TO TAP DURING THE DEMO (arrow bullets) → Pricing → Objections (They say / You say paired cards) → ASK FOR THE SALE → IF TODAY'S A NO
7. To verify the PASS state: upload a brief with `"hook": "PASS — existing site at https://example.co.uk is already functional."` and everything else null. Prepare tab should show one amber "Skip this lead" card and nothing else.

## Known issues / deferred

- Section order spans two iOS tabs (Prepare / Pitch) instead of the web's single long scroll. The handover recommends matching the web's hierarchy; the tabbed split is retained because the sales rep uses Pitch *while* showing the demo and Prepare *before* walking in — physical separation beats a single long scroll on a small phone.
- `description`, `hero_headline`, `cta_text`, `brand_colours` are still stored server-side but unread by iOS — they're demo-generator inputs, not rep-facing.
