import SwiftUI
import SwiftData

// MARK: — PayoutsView
//
// Hero earnings block with signal-gold total → metric ribbon → next payout
// → commission terms → confirmed sales / pipeline lists.

struct PayoutsView: View {
    @EnvironmentObject private var authStore: AuthStore
    @Query private var leads: [Lead]
    @State private var stats: Stats = .empty

    /// All leads the SP claimed as a sale (status sold / closed_now /
    /// closed_followup). These are CLAIMED, not necessarily verified.
    private var claimedSoldLeads: [Lead] {
        leads.filter { lead in
            let s = lead.status.lowercased()
            return s == "sold" || s == "closed_now" || s == "closed_followup"
        }
    }
    /// Confirmed = sale claimed AND payment lands (paidAt set by the
    /// Stripe webhook → server → next /leads fetch).
    private var confirmedLeads: [Lead] {
        claimedSoldLeads.filter { $0.paidAt != nil }
    }
    /// Projected = SP claimed sold but money hasn't been verified.
    private var projectedLeads: [Lead] {
        claimedSoldLeads.filter { $0.paidAt == nil }
    }
    private var pitchedLeads: [Lead] { leads.filter { $0.status == "pitched" } }

    // Source of truth = the user's commission_amount_pence on sales_users,
    // delivered to us via /api/auth/me. Falls back to £150 (current default)
    // if missing from the legacy session.
    private var commissionPounds: Double {
        Double((authStore.currentUser?.commissionAmountPence ?? 15000)) / 100
    }
    private var commissionDisplay: String { "£\(Int(commissionPounds))" }
    /// Banked = sum of actual payment commissions (paidAt set). Only
    /// money that's actually been verified counts toward "earned".
    private var totalEarned: Double {
        confirmedLeads.reduce(0) { sum, lead in
            sum + Double(lead.commissionAmountPence ?? Int(commissionPounds * 100)) / 100
        }
    }
    private var projectedAmount: Double { Double(projectedLeads.count) * commissionPounds }
    private var pipelineAmount: Double { Double(pitchedLeads.count) * commissionPounds }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    hero
                    ribbon
                    nextPayoutSection
                    commissionSection
                    if !confirmedLeads.isEmpty { confirmedSection }
                    if !projectedLeads.isEmpty { projectedSection }
                    if !pitchedLeads.isEmpty { pipelineSection }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 48)
            }
            .scrollContentBackground(.hidden)
            .background(Color.clear)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Brand.ink, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
        }
        .task { await fetchStats() }
    }

    // ───────────── Hero ─────────────

    private var hero: some View {
        PageHero(
            eyebrow: "Earnings",
            title: "£\(Int(totalEarned))",
            accent: totalEarned > 0 ? "banked." : nil,
            sub: heroSubtitle,
            size: Brand.Font.displayXL
        ) {
            PageMeta("Friday payout", nextFridayString)
        }
    }

    private var heroSubtitle: String {
        var parts: [String] = []
        if !confirmedLeads.isEmpty { parts.append("\(confirmedLeads.count) confirmed") }
        if !projectedLeads.isEmpty { parts.append("£\(Int(projectedAmount)) projected") }
        if !pitchedLeads.isEmpty { parts.append("£\(Int(pipelineAmount)) pipeline") }
        return parts.isEmpty ? "No sales yet — go pitch." : parts.joined(separator: " · ")
    }

    // ───────────── Metric ribbon ─────────────

    private var ribbon: some View {
        MetricRibbon {
            StatCell(label: "Confirmed", value: "\(confirmedLeads.count)", accent: true)
            StatDivider()
            StatCell(label: "Projected", value: "\(projectedLeads.count)")
            StatDivider()
            StatCell(label: "Per sale",  value: commissionDisplay)
            StatDivider()
            StatCell(label: "Payout",    value: "Fri")
        }
    }

    // ───────────── Next payout ─────────────

    private var nextPayoutSection: some View {
        BrandSection(eyebrow: "Next payout") {
            let nextFriday = nextFridayDate()
            let daysUntil = Calendar.current.dateComponents([.day], from: .now, to: nextFriday).day ?? 0
            let soon = daysUntil <= 1

            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(nextFriday.formatted(.dateTime.weekday(.wide).day().month()))
                        .font(Brand.Font.display(20, weight: .medium))
                        .tracking(Brand.Tracking.subhead)
                        .foregroundStyle(Brand.cream)
                    Text((daysUntil == 0 ? "Today" : "In \(daysUntil) day\(daysUntil == 1 ? "" : "s")").uppercased())
                        .font(Brand.Font.mono(10))
                        .tracking(Brand.Tracking.eyebrow)
                        .foregroundStyle(soon ? Brand.signal : Brand.creamMuted)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 6) {
                    Text("£\(Int(totalEarned))")
                        .font(Brand.Font.display(24, weight: .medium).monospacedDigit())
                        .tracking(Brand.Tracking.display)
                        .foregroundStyle(confirmedLeads.isEmpty ? Brand.creamDim : Brand.cream)
                    Text(confirmedLeads.isEmpty ? "NOTHING CONFIRMED" : "\(confirmedLeads.count) CONFIRMED")
                        .font(Brand.Font.mono(10))
                        .tracking(Brand.Tracking.eyebrow)
                        .foregroundStyle(Brand.creamMuted)
                }
            }
            .brandCard()
        }
    }

    // ───────────── Commission terms ─────────────

    private var commissionSection: some View {
        BrandSection(eyebrow: "Commission terms") {
            VStack(alignment: .leading, spacing: 14) {
                termRow(icon: "sterlingsign.circle", label: "\(commissionDisplay) flat per confirmed sale", highlight: true)
                termRow(icon: "calendar", label: "Weekly payout every Friday")
                termRow(icon: "person.badge.key", label: "Self-employed — no targets, no minimums")
                termRow(icon: "clock", label: "Payment within 3 working days of verification")
                termRow(icon: "checkmark.shield", label: "Sale verified by GPS check-in + status update")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .brandCard()
        }
    }

    private func termRow(icon: String, label: String, highlight: Bool = false) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 13))
                .foregroundStyle(highlight ? Brand.signal : Brand.creamMuted)
                .frame(width: 18)
            Text(label)
                .font(Brand.Font.body(Brand.Font.bodySmall, weight: highlight ? .medium : .regular))
                .foregroundStyle(highlight ? Brand.cream : Brand.creamDim)
        }
    }

    // ───────────── Confirmed sales ─────────────

    private var confirmedSection: some View {
        BrandSection(eyebrow: "Confirmed · payment verified") {
            VStack(spacing: 8) {
                ForEach(confirmedLeads) { lead in
                    SaleRow(lead: lead, amount: commissionDisplay, highlight: true)
                }
            }
        }
    }

    /// Projected sales — SP claimed sold but no payment lands yet.
    /// Surfaced separately so the SP knows the money isn't banked yet,
    /// and to keep the dissertation's "what counts as a sale" boundary
    /// auditable.
    private var projectedSection: some View {
        BrandSection(eyebrow: "Projected · awaiting payment") {
            VStack(spacing: 8) {
                ForEach(projectedLeads) { lead in
                    SaleRow(lead: lead, amount: commissionDisplay, highlight: false)
                }
            }
        }
    }

    private var pipelineSection: some View {
        BrandSection(eyebrow: "Pipeline · pitched, not closed") {
            VStack(spacing: 8) {
                ForEach(pitchedLeads) { lead in
                    SaleRow(lead: lead, amount: commissionDisplay, highlight: false)
                }
            }
        }
    }

    // ───────────── Helpers ─────────────

    private var nextFridayString: String {
        let fmt = DateFormatter()
        fmt.dateFormat = "d MMM"
        return fmt.string(from: nextFridayDate())
    }

    private func nextFridayDate() -> Date {
        var components = DateComponents()
        components.weekday = 6 // Friday
        return Calendar.current.nextDate(after: .now, matching: components, matchingPolicy: .nextTime) ?? .now
    }

    @MainActor
    private func fetchStats() async {
        if let s = try? await APIClient.shared.fetchStats() { stats = s }
    }
}

// MARK: — Sale row

private struct SaleRow: View {
    let lead: Lead
    let amount: String
    let highlight: Bool

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                Text(lead.businessName)
                    .font(Brand.Font.display(15, weight: .medium))
                    .tracking(-0.2)
                    .foregroundStyle(Brand.cream)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text(lead.businessType.uppercased())
                        .font(Brand.Font.mono(10))
                        .tracking(Brand.Tracking.eyebrow)
                        .foregroundStyle(Brand.creamMuted)
                    Circle().fill(Brand.line).frame(width: 3, height: 3)
                    Text(lead.postcode)
                        .font(Brand.Font.mono(11))
                        .foregroundStyle(Brand.creamDim)
                }
            }
            Spacer()
            Text(amount)
                .font(Brand.Font.display(18, weight: .semibold).monospacedDigit())
                .foregroundStyle(highlight ? Brand.signal : Brand.creamDim)
        }
        .brandCard()
    }
}

#Preview {
    let config = ModelConfiguration(isStoredInMemoryOnly: true)
    let container = try! ModelContainer(for: Lead.self, configurations: config)
    let ctx = container.mainContext

    let sold1 = Lead(assignmentId: "p-101", businessName: "Barber & Co", businessType: "Barber Shop",
                     address: "12 High St", postcode: "E1 6RF", status: "sold")
    let sold2 = Lead(assignmentId: "p-102", businessName: "Pixel Print Shop", businessType: "Print & Copy",
                     address: "33 Brick Lane", postcode: "E1 6PU", status: "sold")
    let pitched = Lead(assignmentId: "p-103", businessName: "Lotus Thai Kitchen", businessType: "Restaurant",
                       address: "88 Old Street", postcode: "EC1V 9AN",
                       status: "pitched",
                       followUpAt: Calendar.current.date(byAdding: .day, value: 2, to: .now),
                       contactPerson: "Mai", contactRole: "Owner")
    ctx.insert(sold1); ctx.insert(sold2); ctx.insert(pitched)

    return ZStack {
        BrandBackground()
        PayoutsView()
            .modelContainer(container)
            .environmentObject(AuthStore.shared)
    }
    .preferredColorScheme(.dark)
}
