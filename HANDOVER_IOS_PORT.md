# Handover — Port SalesFlow web design to iOS

Paste this whole file into a fresh Claude Code thread to continue.

---

## Where we are

**Just shipped** (on branch `claude/charming-nobel-35ebf6`, live at `https://salesflow-sigma.vercel.app`):

- New React landing at `/` + 25 static design pages at `/site/*.html`
- Apply form → signup → dashboard flow working end-to-end
- Demo account (`Demo Account` / PIN `0000`) via `/api/auth/demo`
- Full dashboard re-skin in a shared brand system (warm ink + signal gold + Geist display + JetBrains Mono eyebrows)
- Admin portal at `/admin` (password: `salesflow2026`) with:
  - Create contractor accounts
  - Create leads with rich pitch-hook JSON + live preview
  - Drag-drop JSON brief + HTML demo handoff from Claude Desktop
  - Copy-prompt button with the full Claude Desktop handoff spec

**Stack**: Next.js 14.2 + Supabase (prod) / SQLite (local) dual-mode. Deployed to Vercel project `salesflow`.

---

## The task

Port the same design identity to the existing iOS SwiftUI app at `apps/ios/SalesFlow/`. Can't reuse code (different stack) — need to translate design tokens, typography, components, and layout patterns.

User already has a SwiftUI app with these key files:
- `MainTabView.swift` — tab bar root
- `LeadsView.swift`, `LeadsMapView.swift` — contractor-facing screens
- `LoginView.swift`, `PINKeypadView.swift` — auth
- `PayoutsView.swift`, `ProfileView.swift`
- `ClientPresentationView.swift` — lead detail
- `AppearanceStore.swift` — existing theming
- `DESIGN_NOTES.md`, `AUDIT.md`, `CONTEXT.md` — existing design docs to reconcile

User wants the iOS app to look and feel like the re-skinned web dashboard. Native where it matters (tab bar, haptics, SF Symbols) but visually consistent.

---

## The design system — exact tokens

### Colours (use these values unchanged)

```
ink          rgb(20, 20, 19)    — page background
cream        rgb(248, 244, 238) — primary text / primary button fill
creamDim     rgb(210, 200, 185) — secondary text
creamMuted   rgb(210, 200, 185 / 0.55) — tertiary text, eyebrow non-accent
signal       rgb(184, 134, 11)  — the gold accent — one colour for EVERY accent
signalSoft   rgb(184, 134, 11 / 0.08) — tinted accent-card backgrounds
amber        rgb(220, 150, 80)  — "pitched" status, warning tone
bgCard       rgb(28, 26, 23)    — chips, inputs, subtle cards
bgStrong     rgb(30, 28, 25)    — tables, strong cards (one tick lighter)
bgHover      rgb(36, 33, 29)    — row hover
line         rgb(255, 255, 255 / 0.08) — borders
line2        rgb(255, 255, 255 / 0.05) — inner dividers
err          rgb(255, 138, 128) — error states
```

### Status colours (map across app)

```
new       rgb(140, 160, 200)   — steel blue
visited   creamDim              — dim cream
pitched   rgb(220, 150, 80)    — warm amber
sold      signal                — gold (money = gold)
rejected  rgb(120, 115, 108)   — muted grey
```

### Typography

- **Display** (headings): Geist Medium → iOS equivalent = SF Pro Display (`.system` default). Bundle Geist as `.ttf` for exact fidelity if it matters.
- **Body**: Inter Tight → SF Pro Text is the clean native fallback.
- **Mono** (eyebrows, metadata, data-heavy labels): JetBrains Mono → SF Mono is fine.
- **Eyebrow format**: `/ SECTION NAME` in uppercase, letter-spacing `0.14em` (tracking ~2 in SwiftUI), mono font, 10.5pt.
- **Display headline format**: large Geist with a signal-gold accent phrase at the end. e.g. "Leads on your **patch.**" — the period is part of the accent.
- **Letter-spacing**: display headings `-0.03em`, body neutral.

### Spacing / radii

- Card radius: `16` (matches Tailwind `rounded-2xl`)
- Chip / pill radius: fully rounded (Capsule)
- Input radius: `12`
- Card padding: `20`
- Section gap: `32`

---

## Component patterns to port

Web primitives live in `apps/sales-dashboard/src/lib/brand.tsx`. Port each as a SwiftUI view or `ViewModifier`:

| Web primitive | What it does | iOS translation |
|---|---|---|
| `PageHero` | eyebrow + display headline + sub + right slot | `struct PageHero: View` |
| `Section` | eyebrow → optional title → children | `struct BrandSection<Content>: View` |
| `Card` | warm-black rounded surface, optional signal tint | `ViewModifier` or `struct BrandCard` |
| `Eyebrow` | `/ UPPERCASE` mono tag | `struct Eyebrow: View` |
| `Row` | label-above-value pair | re-use in lists |
| `Chip` | pill with active state (signal fill when selected) | `struct BrandChip: View` |
| `PrimaryButton` | cream fill, ink text, capsule | `ButtonStyle` |
| `GhostButton` | transparent, line border, cream text | `ButtonStyle` |
| `StatCell` | giant display number + mono label | horizontal VStack, signal colour when accented |
| `EmptyState` | eyebrow + display + sub + optional CTA | `struct EmptyState: View` |
| `Input`, `Textarea` | dark-filled input with signal focus | use `TextField` + modifier |

### Layout patterns

1. **Page hero block**: `/ EYEBROW` → `HeadingText` + signal accent → sub-line in creamDim → right-aligned mono meta (e.g., username + date). Replicate on every screen (Leads, Payouts, Profile, Settings).

2. **Metric ribbon**: a single rounded card subdivided into 2–4 cells with hairline dividers. Each cell: huge Geist number on top, mono uppercase label below. The "sold" / "earned" cell goes signal-gold when > 0.

3. **Rows with mono metadata**: primary value in Geist, metadata (postcode, rating, date) in SF Mono with letter-spacing. Makes data-heavy screens feel like a terminal view without being ugly.

4. **Status pills**: signal-dot + uppercase mono label in the status colour. Used for lead status, referral status, document status.

5. **Action cards** (admin only): icon-free, eyebrow + title + sub, clickable — matches the "Create new contractor / Hand out a lead / Upload demo" cards on `/admin`.

---

## Background system

Every screen sits on top of:

1. **Ink base** (`rgb(20, 20, 19)`).
2. **Fixed 72px line grid** with white 0.022 alpha lines, masked by a radial gradient centred at top-15% so the grid fades at the edges.
3. **Warm radial glow** at the top of the viewport (`rgb(184, 134, 11 / 0.12)` radial from centre-top).

SwiftUI implementation: `ZStack { InkBase; GridPattern.masked(radialMask); TopGlow; content }`. Apply once at tab-view root; every screen inherits.

---

## iOS-specific adaptations (don't copy the web 1:1)

- **Navigation**: use native `TabView` (user already has `MainTabView`). Style the tab bar with ink background + signal tint on selected.
- **Haptics**: `UIImpactFeedbackGenerator(style: .soft)` on filter-tab switches, status transitions. Cheap feel-upgrade.
- **Status bar**: force `.preferredColorScheme(.dark)` at root.
- **Sticky bottom actions** (the web has these on lead detail): use `.safeAreaInset(edge: .bottom)` so it respects the home indicator.
- **SF Symbols**: replace lucide-react icons (`phone`, `star`, `checkmark.circle`, `location`) with native SF Symbols — free, tintable, auto-dynamic.
- **List rows**: `.scrollContentBackground(.hidden)` + manual background so the warm ink stays consistent.
- **Dynamic type**: wrap font sizes in `@ScaledMetric` for accessibility.
- **Pull to refresh** on the leads list — native `.refreshable` modifier.

---

## Screen-by-screen mapping

| Web page | iOS file to update | Notes |
|---|---|---|
| `/` landing | Keep web — users hit this outside the app |
| `/site/apply.html` | `LoginView` or a new `ApplyView` | 6-step form; can stay web-first if you prefer |
| `/site/login.html` (or real `/login`) | `LoginView` + `PINKeypadView` | Re-skin with Brand tokens, keep the PIN flow |
| `/dashboard` | `LeadsView` | Header → 4-stat ribbon → filter pills → lead list |
| `/lead/[id]` | `ClientPresentationView` or new `LeadDetailView` | Two-column on iPad, stacked on iPhone; pitch-hook cards, demo WKWebView, sticky action bar |
| `/payouts` | `PayoutsView` | Big wallet card with signal £ amount, history list |
| `/profile` | `ProfileView` | Initials chip, performance ribbon, contact rows |
| `/admin/*` | _Don't port_ | Admin stays on web — you use it from your laptop |

---

## Starting order (minimise wasted work)

1. **Create `apps/ios/SalesFlow/SalesFlow/Brand.swift`** with all tokens above. Don't touch any views yet.
2. **Create `BrandBackground.swift`** with the line-grid + radial glow. Apply to `MainTabView` as `ZStack { BrandBackground(); TabView { … } }`.
3. **Create `BrandComponents.swift`** with the ViewModifiers / view structs (Card, Eyebrow, DisplayHeadline, PrimaryButtonStyle, GhostButtonStyle, Chip, StatCell, EmptyState).
4. **Re-skin `LeadsView.swift`** first — it's the most-seen screen. Using the primitives, it should shrink, not grow.
5. **Re-skin `LeadDetailView` / `ClientPresentationView`** next — this is the "wow" screen that sells the brand.
6. **Login / Payouts / Profile** after.
7. Throughout: replace `Color(hex: "#xxxxxx")` with `Brand.xxxx` references. Search for old colour literals and kill them.

Each step should be a focused commit. Typecheck + build after each screen — easier to catch regressions.

---

## Reference files to read before starting

The new thread should read these in order:

1. `apps/sales-dashboard/src/lib/brand.tsx` — the source of truth for every primitive.
2. `apps/sales-dashboard/src/components/AppShell.tsx` — how the background + nav layer together.
3. `apps/sales-dashboard/src/app/dashboard/page.tsx` — page hero + ribbon + filter + list pattern.
4. `apps/sales-dashboard/src/app/lead/[id]/page.tsx` — two-column brief layout, sticky action bar, brand-colour demo preview.
5. `apps/sales-dashboard/public/site/apply.html` — the dark-theme scoping example (trust pills, reassure banners, step progression).
6. `apps/ios/SalesFlow/DESIGN_NOTES.md` — existing iOS design notes to reconcile with.
7. `apps/ios/SalesFlow/SalesFlow/MainTabView.swift` — current shell to modify.
8. `apps/ios/SalesFlow/SalesFlow/LeadsView.swift` — first target for re-skin.

---

## Gotchas / decisions already made

- **One accent colour only**: signal gold (`rgb(184, 134, 11)`). Don't introduce additional accents (blue/green/purple) except for the four status colours listed above.
- **No emojis in UI** unless asked. SF Symbols only.
- **Cards are opaque** (`rgb(28, 26, 23)` or `rgb(30, 28, 25)`), not translucent. The line grid behind them should NOT show through — that was a bug we already fixed on web.
- **Geist vs SF Pro**: start with SF Pro. Only bundle Geist if the user specifically asks for pixel-perfect parity.
- **iOS dark mode only**: force `.preferredColorScheme(.dark)`. No light-mode support — the brand is intentionally dark throughout.
- **Haptics are part of the brand**: the web feels responsive via hover states; iOS equivalent is soft haptics on taps.

---

## Commit convention

Match what's already on the branch:

```
feat(ios): port brand tokens + background to SwiftUI
feat(ios): re-skin LeadsView in new brand
feat(ios): sticky action bar on lead detail with haptic feedback
```

Sign commits with the existing co-author trailer if using Claude Code.

---

## When done

The iOS app should visually read as the same product as `https://salesflow-sigma.vercel.app/dashboard` — same colour story, same typography hierarchy, same "editorial" feel. Not a wrapper around the web, but a native app that clearly comes from the same house.
