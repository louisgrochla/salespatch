## 2026-03-30 — LeadsView editorial redesign (Theme-aligned)

### What changed
- `apps/ios/salesflow/salesflow/LeadsView.swift` — redesigned the Leads screen to use the shared `Theme` surfaces/borders, replaced the animated scroll layout with a native `List` + section header, and restyled stats/filter/search + lead cards to feel more editorial and less “vibe coded”.

### Why
The previous UI hardcoded a light/colored palette and card/badge styling inconsistent with the rest of the iOS app, making the screen look less professional and harder to scan.

### Stack
SwiftUI, SwiftData (SwiftUI `@Query`), SwiftUI `NavigationStack` / `List`

### Integrations
Reuses existing `APIClient` calls (`fetchStats`, `fetchLeads`) for data; no new external integrations added.

### How to verify
1. Open the iOS app -> `Leads` tab.
2. Confirm the updated stats header, filter chips, and search bar styling.
3. Confirm lead rows render as Theme-aligned cards with status badges + demo/follow-up indicators.
4. Pull to refresh still works.

### Known issues
- I couldn’t fully run an iOS build in this environment due to Xcode simulator/DerivedData permission issues, so please do a quick manual compile/run in Xcode to confirm there are no SwiftUI build-time issues.

