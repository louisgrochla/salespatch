# iOS accounts — kill auto-login, real credentials only

## What changed

**Modified files**
- `apps/ios/SalesFlow/SalesFlow/AuthStore.swift`
  - Removed `debugDemoLogin()` + offline-fallback fake user. DEBUG builds no longer auto-authenticate on launch.
  - Added `signInAsDemo()` — opt-in, hits `/api/auth/demo` only when the user explicitly taps the new button.
- `apps/ios/SalesFlow/SalesFlow/LoginView.swift`
  - Under the "Create one" link, added a small `/ USE DEMO ACCOUNT` mono link that calls `signInAsDemo()`. Kept hairline styling so it reads as a testing affordance, not a product feature.

## Why

The web admin portal (`/admin`) now creates contractor accounts + assigns leads to them. The app should match: users log in with the name + PIN the admin set for them, and see the leads the admin assigned. A fake auto-login masked whether real auth was working and short-circuited the admin-assignment flow.

## Stack

- SwiftUI, URLSession
- Vercel Next.js backend (`salesflow-sigma`)
- Supabase (prod) for user rows + lead_assignments

## Integrations

- `POST /api/auth/login` — name + PIN → session token (used by the main Sign-in button)
- `POST /api/auth/demo` — idempotent demo session (used by the "Use demo account" link)
- `POST /api/auth/signup` — still wired via SignUpView → `authStore.signUp()`

## How to verify

1. `xcrun simctl erase <uuid>` + reinstall
2. Launch — app lands on LoginView ("/ WELCOME BACK" eyebrow, Name + PIN fields)
3. Path A — real account: admin creates a contractor in `/admin` with name `jane`, PIN `1234`. Type those into LoginView → sign in → LeadsView shows leads admin assigned to Jane.
4. Path B — demo: tap `/ USE DEMO ACCOUNT` → instantly signed in as "Demo Account" via `/api/auth/demo`.
5. Path C — signup: tap "Create one" → full 10-step SignUpView → hits `/api/auth/signup` → lands authenticated.

## Known issues

- **Keychain persists across reinstalls on iOS sim.** A stale session token from pre-cutover will bypass LoginView; `simctl erase` clears it. On real devices, a sign-out resets it.
- Demo-lead seeding on Vercel is still empty (flagged in `002_ios-vercel-api-cutover.md`) — demo login works, but the Demo Account has zero leads assigned. Use the admin panel to assign leads manually for visual QA.
