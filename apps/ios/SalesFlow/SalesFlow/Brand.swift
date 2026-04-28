import SwiftUI

// MARK: — SalesFlow Brand System
// Source of truth: apps/sales-dashboard/src/lib/brand.tsx
// Warm ink base, signal-gold accent, SF Pro display, SF Mono eyebrows.
//
// The iOS app is dark-only by design. `Color` values here are absolute
// (no adaptive light variant) — pair with `.preferredColorScheme(.dark)`
// at the root.
//
// Migration note: this supersedes `Theme.swift`. Prefer `Brand.*` in new
// code; Theme.swift remains while legacy call-sites get migrated.

enum Brand {
    // ───────────── Core surfaces ─────────────
    /// Page background — warm ink (`rgb(20, 20, 19)`).
    static let ink         = Color(r: 20,  g: 20,  b: 19)
    /// Chip / input / subtle card (`rgb(28, 26, 23)`).
    static let bgCard      = Color(r: 28,  g: 26,  b: 23)
    /// Strong card / table surface (`rgb(30, 28, 25)`).
    static let bgStrong    = Color(r: 30,  g: 28,  b: 25)
    /// Row hover / pressed (`rgb(36, 33, 29)`).
    static let bgHover     = Color(r: 36,  g: 33,  b: 29)

    // ───────────── Type colours ─────────────
    /// Primary text / primary-button fill (`rgb(248, 244, 238)`).
    static let cream       = Color(r: 248, g: 244, b: 238)
    /// Secondary text (`rgb(210, 200, 185)`).
    static let creamDim    = Color(r: 210, g: 200, b: 185)
    /// Tertiary / eyebrow non-accent (`rgb(210, 200, 185 / 0.55)`).
    static let creamMuted  = Color(r: 210, g: 200, b: 185, a: 0.55)

    // ───────────── Accent ─────────────
    /// Signal gold — the single brand accent (`rgb(184, 134, 11)`).
    static let signal       = Color(r: 184, g: 134, b: 11)
    /// Tinted accent-card background (`signal @ 0.08`).
    static let signalSoft   = Color(r: 184, g: 134, b: 11, a: 0.08)
    /// Accent border (`signal @ 0.25`).
    static let signalBorder = Color(r: 184, g: 134, b: 11, a: 0.25)

    // ───────────── Status palette ─────────────
    /// Warm amber — pitched status / warning tone (`rgb(220, 150, 80)`).
    static let amber       = Color(r: 220, g: 150, b: 80)
    /// Error state text (`rgb(255, 138, 128)`).
    static let err         = Color(r: 255, g: 138, b: 128)

    // ───────────── Dividers ─────────────
    /// Primary border (`white @ 0.08`).
    static let line        = Color.white.opacity(0.08)
    /// Inner divider (`white @ 0.05`).
    static let line2       = Color.white.opacity(0.05)

    // ───────────── Grid overlay ─────────────
    /// Background grid line colour (`white @ 0.022`).
    static let gridLine    = Color.white.opacity(0.022)
    /// Top warm glow (`signal @ 0.12`).
    static let topGlow     = Color(r: 184, g: 134, b: 11, a: 0.12)

    // ───────────── Lead status ─────────────
    /// Steel blue — unvisited lead.
    static let statusNew      = Color(r: 140, g: 160, b: 200)
    /// Dim cream — visited.
    static let statusVisited  = creamDim
    /// Warm amber — pitched.
    static let statusPitched  = amber
    /// Signal gold — sold (money = gold).
    static let statusSold     = signal
    /// Muted grey — rejected (`rgb(120, 115, 108)`).
    static let statusRejected = Color(r: 120, g: 115, b: 108)
}

// MARK: — Typography
extension Brand {
    /// Typography scale + font resolvers.
    ///
    /// Web uses Geist / Inter Tight / JetBrains Mono. iOS defaults to native
    /// SF Pro / SF Mono — bundle Geist as `.ttf` only if pixel-perfect parity
    /// is required later.
    enum Font {
        // Display sizes (match web brand.tsx)
        static let displayXL:   CGFloat = 44  // PageHero size=lg
        static let displayLG:   CGFloat = 36  // PageHero size=md
        static let displayMD:   CGFloat = 34  // StatCell value
        static let displaySM:   CGFloat = 22  // Section / EmptyState title

        // Body sizes
        static let body:        CGFloat = 15
        static let bodySmall:   CGFloat = 14
        static let caption:     CGFloat = 12

        // Mono eyebrow sizes
        static let eyebrow:     CGFloat = 10.5
        static let eyebrowSm:   CGFloat = 10
        static let meta:        CGFloat = 11

        /// Display (SF Pro rounded → nearest native analogue of Geist).
        static func display(_ size: CGFloat, weight: SwiftUI.Font.Weight = .medium) -> SwiftUI.Font {
            .system(size: size, weight: weight, design: .default)
        }

        /// Body text (SF Pro Text fallback for Inter Tight).
        static func body(_ size: CGFloat = body, weight: SwiftUI.Font.Weight = .regular) -> SwiftUI.Font {
            .system(size: size, weight: weight, design: .default)
        }

        /// Monospace (SF Mono fallback for JetBrains Mono).
        static func mono(_ size: CGFloat = eyebrow, weight: SwiftUI.Font.Weight = .regular) -> SwiftUI.Font {
            .system(size: size, weight: weight, design: .monospaced)
        }
    }

    /// Letter-spacing values converted to SwiftUI point-tracking.
    ///
    /// CSS `em` is relative to font-size; SwiftUI `tracking()` is absolute
    /// points. These are tuned per font-size to mirror web fidelity.
    enum Tracking {
        /// Mono eyebrow (`0.14em` at 10.5pt ≈ 1.5pt).
        static let eyebrow: CGFloat = 1.5
        /// Mono meta (`0.14em` at 11pt ≈ 1.55pt).
        static let meta: CGFloat = 1.5
        /// Display headline (`-0.03em` at 34–44pt ≈ -1 to -1.3pt).
        static let display: CGFloat = -1.0
        /// Section subheading (`-0.025em` at 22pt ≈ -0.55pt).
        static let subhead: CGFloat = -0.55
        /// Body tight.
        static let body: CGFloat = 0
    }
}

// MARK: — Geometry
extension Brand {
    enum Radius {
        /// Card radius (`rounded-2xl`).
        static let card:   CGFloat = 16
        /// Input radius.
        static let input:  CGFloat = 12
        /// Button / chip — use `Capsule()` instead.
        static let button: CGFloat = 999
    }

    enum Spacing {
        /// Standard card padding.
        static let cardPadding: CGFloat = 20
        /// Section-to-section gap.
        static let sectionGap:  CGFloat = 32
        /// Inline group gap.
        static let inlineGap:   CGFloat = 12
    }

    /// Background grid cell size (matches web `72px 72px`).
    static let gridSize: CGFloat = 72
}

// MARK: — Status helpers
extension Brand {
    static func statusColor(for status: String) -> Color {
        switch status.lowercased() {
        case "new":      return statusNew
        case "visited":  return statusVisited
        case "pitched":  return statusPitched
        case "sold":     return statusSold
        case "rejected": return statusRejected
        default:         return creamMuted
        }
    }

    static func statusLabel(for status: String) -> String {
        switch status.lowercased() {
        case "new":      return "New"
        case "visited":  return "Visited"
        case "pitched":  return "Pitched"
        case "sold":     return "Sold"
        case "rejected": return "Rejected"
        default:         return status.capitalized
        }
    }
}

// MARK: — Color integer-RGB helper
extension Color {
    /// Build a Color from 0-255 sRGB components — matches web `rgb(r g b)` tokens.
    fileprivate init(r: Int, g: Int, b: Int, a: Double = 1.0) {
        self.init(.sRGB, red: Double(r) / 255, green: Double(g) / 255, blue: Double(b) / 255, opacity: a)
    }
}
