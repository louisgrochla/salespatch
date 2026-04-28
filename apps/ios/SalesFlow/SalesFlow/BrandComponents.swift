import SwiftUI

// MARK: — BrandComponents
// SwiftUI translations of the web primitives in
// apps/sales-dashboard/src/lib/brand.tsx. Each primitive maps 1:1 onto the
// corresponding React component so layouts stay trivial to port.
//
//   Web              →  SwiftUI
//   PageHero          →  PageHero
//   Section           →  BrandSection
//   Card              →  .brandCard() modifier
//   Eyebrow           →  Eyebrow
//   Row               →  BrandRow
//   Chip              →  BrandChip
//   PrimaryButton     →  PrimaryButtonStyle (ButtonStyle)
//   GhostButton       →  GhostButtonStyle (ButtonStyle)
//   StatCell          →  StatCell
//   EmptyState        →  EmptyState
//   Input / Textarea  →  .brandInput() modifier

// ───────────────────────── Eyebrow ─────────────────────────

/// "/ UPPERCASE" mono label. Signal-gold when `accent`, muted cream otherwise.
struct Eyebrow: View {
    let text: String
    var accent: Bool = false

    var body: some View {
        Text("/ \(text.uppercased())")
            .font(Brand.Font.mono(Brand.Font.eyebrow))
            .tracking(Brand.Tracking.eyebrow)
            .foregroundStyle(accent ? Brand.signal : Brand.creamMuted)
    }
}

// ───────────────────────── DisplayHeadline ─────────────────────────

/// Large Geist-style headline with optional signal-gold accent phrase trailing
/// (e.g. "Leads on your " + "patch." in gold).
struct DisplayHeadline: View {
    let title: String
    var accent: String? = nil
    var size: CGFloat = Brand.Font.displayXL

    var body: some View {
        (
            Text(title)
                .foregroundStyle(Brand.cream)
            + Text(accent.map { " \($0)" } ?? "")
                .foregroundStyle(Brand.signal)
        )
        .font(Brand.Font.display(size, weight: .medium))
        .tracking(Brand.Tracking.display)
        .lineSpacing(0)
        .fixedSize(horizontal: false, vertical: true)
    }
}

// ───────────────────────── PageHero ─────────────────────────

/// Eyebrow + display headline + optional sub-line + right-aligned mono slot.
/// Used at the top of every screen.
struct PageHero<Right: View>: View {
    let eyebrow: String?
    let title: String
    let accent: String?
    let sub: String?
    let size: CGFloat
    let right: Right

    init(
        eyebrow: String? = nil,
        title: String,
        accent: String? = nil,
        sub: String? = nil,
        size: CGFloat = Brand.Font.displayLG,
        @ViewBuilder right: () -> Right
    ) {
        self.eyebrow = eyebrow
        self.title = title
        self.accent = accent
        self.sub = sub
        self.size = size
        self.right = right()
    }

    var body: some View {
        HStack(alignment: .top, spacing: 24) {
            VStack(alignment: .leading, spacing: 8) {
                if let eyebrow {
                    Eyebrow(text: eyebrow, accent: true)
                }
                DisplayHeadline(title: title, accent: accent, size: size)
                if let sub {
                    Text(sub)
                        .font(Brand.Font.body(Brand.Font.caption))
                        .foregroundStyle(Brand.creamDim)
                }
            }
            Spacer(minLength: 0)
            right
        }
    }
}

extension PageHero where Right == EmptyView {
    init(
        eyebrow: String? = nil,
        title: String,
        accent: String? = nil,
        sub: String? = nil,
        size: CGFloat = Brand.Font.displayLG
    ) {
        self.init(eyebrow: eyebrow, title: title, accent: accent, sub: sub, size: size) {
            EmptyView()
        }
    }
}

// ───────────────────────── PageMeta ─────────────────────────

/// Right-aligned mono uppercase meta block (e.g. "Louis · 24 Apr") used as
/// the `right` slot of PageHero.
struct PageMeta: View {
    let lines: [String]

    init(_ lines: String...) {
        self.lines = lines
    }

    var body: some View {
        VStack(alignment: .trailing, spacing: 4) {
            ForEach(lines, id: \.self) { line in
                Text(line.uppercased())
                    .font(Brand.Font.mono(Brand.Font.meta))
                    .tracking(Brand.Tracking.meta)
                    .foregroundStyle(Brand.creamMuted)
            }
        }
    }
}

// ───────────────────────── BrandSection ─────────────────────────

/// Eyebrow → optional display sub-heading → children.
struct BrandSection<Content: View>: View {
    let eyebrow: String?
    let title: String?
    let content: Content

    init(eyebrow: String? = nil, title: String? = nil, @ViewBuilder content: () -> Content) {
        self.eyebrow = eyebrow
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let eyebrow {
                Eyebrow(text: eyebrow, accent: true)
            }
            if let title {
                Text(title)
                    .font(Brand.Font.display(Brand.Font.displaySM, weight: .medium))
                    .tracking(Brand.Tracking.subhead)
                    .foregroundStyle(Brand.cream)
            }
            content
        }
    }
}

// ───────────────────────── Card modifier ─────────────────────────

/// Warm-black rounded card surface, optionally tinted with the signal accent.
struct BrandCardModifier: ViewModifier {
    var accent: Bool = false
    var padding: CGFloat = Brand.Spacing.cardPadding

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(
                RoundedRectangle(cornerRadius: Brand.Radius.card, style: .continuous)
                    .fill(accent ? Brand.signalSoft : Brand.bgStrong)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Brand.Radius.card, style: .continuous)
                    .strokeBorder(accent ? Brand.signalBorder : Brand.line, lineWidth: 1)
            )
    }
}

extension View {
    /// Wrap view in a warm-black card — pass `accent: true` for the signal-tinted variant.
    func brandCard(accent: Bool = false, padding: CGFloat = Brand.Spacing.cardPadding) -> some View {
        modifier(BrandCardModifier(accent: accent, padding: padding))
    }
}

// ───────────────────────── Row ─────────────────────────

/// Label-above-value pair for info cards. Set `mono: true` when the value is
/// data-heavy (postcode, rating, date).
struct BrandRow: View {
    let label: String
    let value: String
    var mono: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Eyebrow(text: label)
            Text(value)
                .font(mono ? Brand.Font.mono(Brand.Font.bodySmall) : Brand.Font.body(Brand.Font.bodySmall))
                .tracking(mono ? Brand.Tracking.meta : 0)
                .foregroundStyle(Brand.cream)
                .multilineTextAlignment(.leading)
        }
    }
}

// ───────────────────────── Chip ─────────────────────────

/// Rounded pill for chip rows / filter bars. Signal-gold when active.
struct BrandChip: View {
    let label: String
    var count: Int? = nil
    var active: Bool = false
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Text(label)
                    .font(Brand.Font.body(13, weight: active ? .medium : .regular))
                    .foregroundStyle(active ? .white : Brand.creamDim)
                if let count {
                    Text("\(count)")
                        .font(Brand.Font.mono(11))
                        .foregroundStyle(active ? Color.white.opacity(0.7) : Brand.creamMuted)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(
                Capsule().fill(active ? Brand.signal : Color.clear)
            )
            .overlay(
                Capsule().strokeBorder(active ? Color.clear : Brand.line, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

// ───────────────────────── StatusPill ─────────────────────────

/// Signal-dot + uppercase mono status label. Used for lead status, referral,
/// document state — matches the web `LeadStatusBadge`.
struct StatusPill: View {
    let status: String

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(Brand.statusColor(for: status))
                .frame(width: 6, height: 6)
            Text(Brand.statusLabel(for: status).uppercased())
                .font(Brand.Font.mono(10))
                .tracking(Brand.Tracking.eyebrow)
                .foregroundStyle(Brand.statusColor(for: status))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(
            Capsule().fill(Brand.bgCard)
        )
        .overlay(
            Capsule().strokeBorder(Brand.line, lineWidth: 1)
        )
    }
}

// ───────────────────────── Buttons ─────────────────────────

/// Cream-on-ink primary CTA — capsule, ink text on cream fill.
struct PrimaryButtonStyle: ButtonStyle {
    var size: Size = .md

    enum Size { case sm, md, lg }

    func makeBody(configuration: Configuration) -> some View {
        let (hPad, vPad, fontSize): (CGFloat, CGFloat, CGFloat) = {
            switch size {
            case .sm: return (16, 8,  13)
            case .md: return (20, 12, 14)
            case .lg: return (24, 14, 15)
            }
        }()
        configuration.label
            .font(Brand.Font.body(fontSize, weight: .medium))
            .foregroundStyle(Brand.ink)
            .padding(.horizontal, hPad)
            .padding(.vertical, vPad)
            .background(Capsule().fill(Brand.cream))
            .opacity(configuration.isPressed ? 0.85 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// Transparent capsule with hairline border. Secondary action.
struct GhostButtonStyle: ButtonStyle {
    var size: PrimaryButtonStyle.Size = .md

    func makeBody(configuration: Configuration) -> some View {
        let (hPad, vPad, fontSize): (CGFloat, CGFloat, CGFloat) = {
            switch size {
            case .sm: return (16, 8,  13)
            case .md: return (20, 12, 14)
            case .lg: return (24, 14, 15)
            }
        }()
        configuration.label
            .font(Brand.Font.body(fontSize))
            .foregroundStyle(Brand.cream)
            .padding(.horizontal, hPad)
            .padding(.vertical, vPad)
            .background(Capsule().fill(Color.clear))
            .overlay(Capsule().strokeBorder(Brand.line, lineWidth: 1))
            .opacity(configuration.isPressed ? 0.7 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

// ───────────────────────── StatCell ─────────────────────────

/// Giant display number on top, mono uppercase label below. Lives inside a
/// `MetricRibbon`.
struct StatCell: View {
    let label: String
    let value: String
    var accent: Bool = false
    var prefix: String? = nil

    private var show: Bool {
        accent && !value.isEmpty && value != "0" && value != "£0"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                if let prefix {
                    Text(prefix)
                        .foregroundStyle(show ? Brand.signal : Brand.creamDim)
                }
                Text(value)
                    .foregroundStyle(show ? Brand.signal : Brand.cream)
            }
            .font(Brand.Font.display(26, weight: .medium))
            .tracking(Brand.Tracking.display)
            .lineLimit(1)
            .minimumScaleFactor(0.6)

            Text(label.uppercased())
                .font(Brand.Font.mono(9.5))
                .tracking(1.2)
                .foregroundStyle(Brand.creamMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
    }
}

// ───────────────────────── MetricRibbon ─────────────────────────

/// Single rounded card subdivided into 2–4 StatCells with hairline dividers.
/// On iPhone narrow widths the cells wrap via LazyVGrid.
struct MetricRibbon<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        HStack(spacing: 0) {
            content
        }
        .background(
            RoundedRectangle(cornerRadius: Brand.Radius.card, style: .continuous)
                .fill(Brand.bgStrong)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Brand.Radius.card, style: .continuous)
                .strokeBorder(Brand.line, lineWidth: 1)
        )
    }
}

/// Thin vertical separator to place between StatCells inside a MetricRibbon.
struct StatDivider: View {
    var body: some View {
        Rectangle()
            .fill(Brand.line)
            .frame(width: 1)
            .padding(.vertical, 12)
    }
}

// ───────────────────────── EmptyState ─────────────────────────

/// Eyebrow + display headline + optional sub-line + optional CTA. Wrap in a
/// card for framing, or drop into a ScrollView as-is.
struct EmptyState<Action: View>: View {
    let eyebrow: String?
    let title: String
    let sub: String?
    let action: Action

    init(
        eyebrow: String? = nil,
        title: String,
        sub: String? = nil,
        @ViewBuilder action: () -> Action
    ) {
        self.eyebrow = eyebrow
        self.title = title
        self.sub = sub
        self.action = action()
    }

    var body: some View {
        VStack(spacing: 12) {
            if let eyebrow {
                Eyebrow(text: eyebrow, accent: true)
            }
            Text(title)
                .font(Brand.Font.display(Brand.Font.displaySM, weight: .medium))
                .tracking(Brand.Tracking.subhead)
                .foregroundStyle(Brand.cream)
                .multilineTextAlignment(.center)
            if let sub {
                Text(sub)
                    .font(Brand.Font.body(Brand.Font.bodySmall))
                    .foregroundStyle(Brand.creamDim)
                    .multilineTextAlignment(.center)
            }
            action
                .padding(.top, 12)
        }
        .frame(maxWidth: .infinity)
        .brandCard(padding: 32)
    }
}

extension EmptyState where Action == EmptyView {
    init(eyebrow: String? = nil, title: String, sub: String? = nil) {
        self.init(eyebrow: eyebrow, title: title, sub: sub) { EmptyView() }
    }
}

// ───────────────────────── Input ─────────────────────────

/// Dark-filled input surface. Pair with `TextField`/`SecureField` content.
///
///   TextField("Email", text: $email)
///       .brandInput()
struct BrandInputModifier: ViewModifier {
    var error: Bool = false

    func body(content: Content) -> some View {
        content
            .font(Brand.Font.body(Brand.Font.body))
            .foregroundStyle(Brand.cream)
            .tint(Brand.signal)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: Brand.Radius.input, style: .continuous)
                    .fill(Brand.bgCard)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Brand.Radius.input, style: .continuous)
                    .strokeBorder(error ? Brand.err : Brand.line, lineWidth: 1)
            )
    }
}

extension View {
    /// Apply dark-card styling to a `TextField` / `SecureField` / `TextEditor`.
    func brandInput(error: Bool = false) -> some View {
        modifier(BrandInputModifier(error: error))
    }
}

// ───────────────────────── LabeledField ─────────────────────────

/// Mono uppercase label above a brand-styled input + optional hint / error.
struct LabeledField<Field: View>: View {
    let label: String
    var hint: String? = nil
    var error: String? = nil
    @ViewBuilder let field: () -> Field

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Eyebrow(text: label)
            field()
                .brandInput(error: error != nil)
            if let error {
                Text(error)
                    .font(Brand.Font.body(Brand.Font.caption))
                    .foregroundStyle(Brand.err)
            } else if let hint {
                Text(hint)
                    .font(Brand.Font.body(Brand.Font.caption))
                    .foregroundStyle(Brand.creamMuted)
            }
        }
    }
}

// ───────────────────────── Haptics ─────────────────────────

/// Soft impact — use on filter-tab switches, status transitions, CTA taps.
enum BrandHaptics {
    static func tap(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .soft) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }

    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
}
