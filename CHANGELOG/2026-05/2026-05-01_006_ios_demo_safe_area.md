# 2026-05-01 — iOS demo viewer respects safe-area top

## What changed
- `apps/ios/SalesFlow/SalesFlow/ClientPresentationView.swift` — `ClientWebView` now injects a tiny `WKUserScript` that adds `body { padding-top: env(safe-area-inset-top); }` at document start. Pushes any sticky / fixed top element in the demo HTML below the iPhone status bar / Dynamic Island.

## Why
Demo HTML emitted by the `build-demo` skill uses `viewport-fit=cover` so the hero photo bleeds edge-to-edge in mobile Safari. In our WKWebView that meant sticky nav bars (e.g. Café 100's "Order direct" pill) rendered at `top: 0` — UNDER the iPhone status bar — and collided visually with our own chrome (X button + "Business · Live" pill). User reported it as "the header bar when scrolling, same thing with all demos but does show in web view."

## Stack
- Swift / SwiftUI / WebKit (WKUserScript injection at `.atDocumentStart`)
- No demo HTML changes — fix runs entirely on the iOS client side

## Integrations
- None. Pure rendering fix.

## How to verify
1. Rebuild iOS app in Xcode (`festive-nash-3dfa23` worktree) and install on a Dynamic Island device (iPhone 14 Pro+).
2. Open any lead → Pitch tab → Show client demo.
3. Top of demo (sticky nav with logo + CTA button) should now sit cleanly below the iPhone clock, no longer overlapping with the X close button.
4. Hero photo no longer bleeds *under* the notch on iOS — small visual cost, traded for legibility.
5. Web view (Safari, Chrome on desktop) is unaffected — the user script only runs inside our iOS WKWebView.

## Known issues
- Hero photos that were designed to bleed edge-to-edge under the notch will now show ~50pt of empty body-bg above them on iOS only. Acceptable for the beta.
- Doesn't touch the iOS app's own chrome positioning (X + Live pill row). Currently uses a hardcoded 56pt top padding which is close to but not exactly the safe-area-top on every device. Polish for later.
