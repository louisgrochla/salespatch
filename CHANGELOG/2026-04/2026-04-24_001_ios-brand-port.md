# iOS brand port — SalesFlow SwiftUI re-skin

## What changed

**New files**
- `apps/ios/SalesFlow/SalesFlow/Brand.swift` — design tokens (colours, typography, spacing, status palette)
- `apps/ios/SalesFlow/SalesFlow/BrandBackground.swift` — warm ink base + 72pt line grid + signal-gold top glow
- `apps/ios/SalesFlow/SalesFlow/BrandComponents.swift` — SwiftUI primitives mirroring `apps/sales-dashboard/src/lib/brand.tsx` (PageHero, PageMeta, BrandSection, Eyebrow, DisplayHeadline, brandCard modifier, BrandRow, BrandChip, StatusPill, PrimaryButtonStyle, GhostButtonStyle, StatCell, MetricRibbon, StatDivider, EmptyState, brandInput modifier, LabeledField, BrandHaptics)

**Modified files**
- `apps/ios/SalesFlow/SalesFlow/MainTabView.swift` — BrandBackground applied at tab root, `.preferredColorScheme(.dark)` forced, tab tint = signal gold
- `apps/ios/SalesFlow/SalesFlow/LeadsView.swift` — PageHero → MetricRibbon → BrandChip filters → brandCard lead rows with StatusPill
- `apps/ios/SalesFlow/SalesFlow/LeadDetailView.swift` — full rewrite: PageHero → pill tabs → brandCard sections → sticky bottom action bar via `.safeAreaInset`
- `apps/ios/SalesFlow/SalesFlow/LoginView.swift` — warm ink wordmark + LabeledField + PrimaryButtonStyle
- `apps/ios/SalesFlow/SalesFlow/PayoutsView.swift` — signal-gold earnings hero + MetricRibbon + brand-styled rows
- `apps/ios/SalesFlow/SalesFlow/ProfileView.swift` — PageHero + brandCard user card + MetricRibbon + grouped rows; HelpView re-skinned
- `apps/ios/SalesFlow/SalesFlow/LeadsMapView.swift` — `StatusBadge` → `StatusPill` (keeps legacy map screen compiling)

## Why

Port the SalesFlow brand identity (warm ink + signal gold + editorial Geist display + JetBrains-mono eyebrows) from the re-skinned web dashboard to the SwiftUI app, so the native app reads as the same product as `salesflow-sigma.vercel.app/dashboard`. Follows the exact plan in `HANDOVER_IOS_PORT.md` (source in `charming-nobel-35ebf6` worktree).

## Stack

- SwiftUI (iOS 26.2 deployment target)
- SwiftData (unchanged — Lead model untouched)
- SF Pro Display + SF Mono (native analogues for Geist / JetBrains Mono)
- Canvas + RadialGradient for the line-grid + warm top-glow layers

## Integrations

- No external services touched
- `APIClient` / `AuthStore` / `DemoSiteCache` / `LocationManager` all preserved
- `ClientPresentationView` full-screen demo flow integration preserved
- `AppearanceStore` is no longer consumed by the re-skinned views (dark-only by design); still injected by callers to avoid environment-object crashes in un-ported screens (SignUpView, LeaderboardView, etc.)

## How to verify

1. Open `apps/ios/SalesFlow/salesflow.xcodeproj` in Xcode
2. Build + run in iPhone 15 simulator
3. Sign in with demo account (`Demo Account` / PIN `0000`)
4. Each tab should show: warm ink background, 72pt faded grid, warm top glow, mono eyebrow + large display headline, signal-gold accents
5. Leads → pull-to-refresh works; filter chips light up gold; lead cards show status pill + DEMO badge
6. Lead detail → four pill tabs; "Show demo" button opens `ClientPresentationView`; sticky bottom action bar hovers above home indicator
7. Payouts → £amount is signal-gold when totalEarned > 0; "banked." accent phrase appears
8. Profile → user card + performance ribbon + grouped rows; sign-out row reads in err tone
9. Swift typecheck (`swiftc -typecheck` against the whole `SalesFlow/*.swift` set) passes locally with no errors or warnings

## Known issues / deferred

- **Un-ported legacy screens**: `SignUpView`, `LeadsMapView`, `LeaderboardView`, `AcademyPathView`, `AcademyLessonView`, `ModeSelectView`, `QRCodeView`, `PINKeypadView` still reference `Theme.*` tokens. They'll render in the muted `Theme` palette on top of the new warm ink BrandBackground — visually inconsistent until re-skinned. Low priority; the handover explicitly prioritised Leads / Lead detail / Login / Payouts / Profile.
- **`Theme.swift` not yet deleted**: keeps the legacy screens compiling. Remove in a follow-up commit once everything is migrated.
- **`AppearanceStore` is now dead weight** for the re-skinned views; it stays injected for the legacy screens. Can be removed once they're ported and `AppearanceStore` is unused.
- **No on-device verification**: Pi deployment in CLAUDE.md is for the TypeScript runtime, not the iOS app. User must build + run in Xcode to see the port.
- **Geist font not bundled**: relying on SF Pro Display. Handover said start with SF Pro; bundle Geist only if pixel-perfect parity is requested.
