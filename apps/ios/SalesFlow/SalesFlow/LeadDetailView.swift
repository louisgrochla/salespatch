import SwiftUI
import Combine
import SwiftData
import CoreLocation
import MapKit

// MARK: — LeadDetailView
//
// Layout: PageHero → pill-tab selector (Overview / Prepare / Pitch /
// Follow-up) → tab content → sticky bottom action bar. The demo preview
// is the "wow" moment; it opens full-screen via `ClientPresentationView`.

struct LeadDetailView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var authStore: AuthStore
    let lead: Lead

    @State private var selectedTab: Int = 0
    @State private var showStatusPicker = false
    @State private var isUpdatingStatus = false
    @State private var errorMessage: String?
    @State private var showClientPresentation = false

    @State private var visitActive = false
    @State private var visitStartTime: Date?
    @State private var visitDuration: TimeInterval = 0
    @State private var visitTimer: Timer?
    @State private var showPostPitch = false
    /// Pitch duration captured at the moment the questionnaire opens.
    /// Frozen so the timer at the top of the modal doesn't keep
    /// counting while the SP fills the form.
    @State private var frozenPitchDuration: Int?
    @State private var pitchToast: String?
    @State private var showFollowupSheet = false
    @StateObject private var locationManager = LocationManager()

    private let tabs = ["Overview", "Prepare", "Pitch", "Follow Up"]
    private let statuses = ["new", "visited", "pitched", "sold", "rejected"]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                topBar
                hero
                tabBar
                Group {
                    switch selectedTab {
                    case 0: overviewTab
                    case 1: prepareTab
                    case 2: pitchTab
                    case 3: followUpTab
                    default: EmptyView()
                    }
                }
                .transition(.opacity.combined(with: .move(edge: .trailing)))
                .id(selectedTab) // forces transition on tab change
                // Horizontal swipe between tabs. simultaneousGesture so
                // the parent ScrollView still owns vertical scroll.
                // High horizontal-vs-vertical ratio prevents accidental
                // swipes during normal scrolling.
                .simultaneousGesture(
                    DragGesture(minimumDistance: 30)
                        .onEnded { value in
                            let h = value.translation.width
                            let v = abs(value.translation.height)
                            guard abs(h) > 60, abs(h) > v * 1.8 else { return }
                            if h < 0, selectedTab < tabs.count - 1 {
                                withAnimation(.easeInOut(duration: 0.22)) { selectedTab += 1 }
                                BrandHaptics.tap()
                            } else if h > 0, selectedTab > 0 {
                                withAnimation(.easeInOut(duration: 0.22)) { selectedTab -= 1 }
                                BrandHaptics.tap()
                            }
                        }
                )
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)
            .padding(.bottom, 84) // clear the compact sticky bar
        }
        .scrollContentBackground(.hidden)
        .background(Color.clear)
        .toolbar(.hidden, for: .navigationBar)
        .overlay(alignment: .bottom) { stickyActionBar }
        .task(id: lead.assignmentId) {
            await fetchDetail()
            await geocodeIfNeeded()
        }
        // Mounted at root so the sticky-bar "Show demo" button works from
        // any tab — when this lived inside pitchTab it only fired once
        // pitchTab was the visible tab, causing a confusing no-op-then-
        // open-on-tab-switch behaviour.
        .fullScreenCover(isPresented: $showClientPresentation) {
            if let domain = lead.demoSiteDomain {
                ClientPresentationView(
                    domain: domain,
                    businessName: lead.businessName,
                    leadAssignmentId: lead.assignmentId
                )
            }
        }
        .sheet(isPresented: $showFollowupSheet) {
            FollowupSheet(
                assignmentId: lead.assignmentId,
                businessName: lead.businessName,
                initialDate: lead.followUpAt,
                initialNote: nil
            ) { date, _ in
                lead.followUpAt = date
                try? modelContext.save()
                pitchToast = date == nil ? "Follow-up cleared" : "Follow-up scheduled"
            }
        }
        .sheet(isPresented: $showPostPitch) {
            PostPitchView(
                assignmentId: lead.assignmentId,
                businessName: lead.businessName,
                demoVersion: lead.demoSiteDomain,
                pitchStartedAt: visitStartTime,
                frozenDurationSeconds: frozenPitchDuration
            ) { result in
                // The pitch lands in the local SwiftData queue first; it
                // syncs in the background. We never block the UI on
                // network. Toast reflects optimistic state.
                if let nerveId = result.nervePitchId {
                    pitchToast = "Pitch logged · NERVE \(nerveId.prefix(8))…"
                } else if result.forwardError == "queued" {
                    pitchToast = "Pitch saved · syncing in background"
                } else if !result.forwarded {
                    pitchToast = "Pitch saved offline · will sync when online"
                } else {
                    pitchToast = "Pitch logged"
                }
                Task { await fetchDetail() }
            }
        }
        .confirmationDialog("Update Status", isPresented: $showStatusPicker, titleVisibility: .visible) {
            ForEach(statuses, id: \.self) { s in
                Button(Brand.statusLabel(for: s)) {
                    BrandHaptics.tap()
                    updateStatus(s)
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .alert("Error", isPresented: .constant(errorMessage != nil), actions: {
            Button("OK") { errorMessage = nil }
        }, message: { Text(errorMessage ?? "") })
    }

    // ───────────── Custom top bar (replaces system nav bar) ─────────────

    /// Compact back chevron + eyebrow. Scrolls with content — no dedicated
    /// nav-bar chrome. Tapping the chevron pops the stack.
    private var topBar: some View {
        HStack(spacing: 10) {
            Button {
                BrandHaptics.tap()
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Brand.cream)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(Brand.bgCard))
                    .overlay(Circle().strokeBorder(Brand.line, lineWidth: 1))
            }
            .buttonStyle(.plain)

            Text("/ LEAD")
                .font(Brand.Font.mono(10))
                .tracking(Brand.Tracking.eyebrow)
                .foregroundStyle(Brand.creamMuted)

            Spacer()
        }
        .padding(.top, 4)
    }

    // ───────────── Hero ─────────────

    private var hero: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: lead.businessIcon)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Brand.signal)
                .frame(width: 36, height: 36)
                .background(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .fill(Brand.signalSoft)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .strokeBorder(Brand.signalBorder, lineWidth: 1)
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(lead.businessType.uppercased())
                    .font(Brand.Font.mono(9))
                    .tracking(Brand.Tracking.eyebrow)
                    .foregroundStyle(Brand.creamMuted)
                    .lineLimit(1)

                Text(lead.businessName)
                    .font(Brand.Font.display(18, weight: .medium))
                    .tracking(-0.3)
                    .foregroundStyle(Brand.cream)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)

                let postcode = lead.postcode.trimmingCharacters(in: .whitespaces)
                let hasRating = (lead.googleRating ?? 0) > 0
                if !postcode.isEmpty || hasRating {
                    HStack(spacing: 5) {
                        if !postcode.isEmpty {
                            Text(postcode)
                                .font(Brand.Font.mono(10.5))
                                .foregroundStyle(Brand.creamDim)
                        }
                        if hasRating, let rating = lead.googleRating {
                            if !postcode.isEmpty { dotInline }
                            HStack(spacing: 2) {
                                Image(systemName: "star.fill").font(.system(size: 8))
                                Text(String(format: "%.1f", rating))
                                    .font(Brand.Font.mono(10.5))
                                if let n = lead.googleReviewCount {
                                    Text("(\(n))")
                                        .font(Brand.Font.mono(10))
                                        .foregroundStyle(Brand.creamMuted)
                                }
                            }
                            .foregroundStyle(Brand.creamDim)
                        }
                    }
                    .lineLimit(1)
                }
            }

            Spacer(minLength: 8)

            StatusPill(status: lead.status)
        }
    }

    private var dotInline: some View {
        Circle().fill(Brand.line).frame(width: 3, height: 3)
    }

    // ───────────── Tab bar ─────────────

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(tabs.indices, id: \.self) { i in
                    BrandChip(
                        label: tabs[i],
                        active: selectedTab == i
                    ) {
                        BrandHaptics.tap()
                        withAnimation(.easeInOut(duration: 0.18)) { selectedTab = i }
                    }
                }
            }
        }
    }

    // ───────────── Overview ─────────────

    private var overviewTab: some View {
        VStack(alignment: .leading, spacing: 12) {
            if hasAnyAction { quickActions }
            if hasGeocodableAddress { mapCard }
            if hasInfoRows { infoCard }
            visitCard
            if !lead.openingHoursArray.isEmpty { openingHoursCard }
        }
    }

    private var hasAnyAction: Bool {
        lead.phone != nil || hasGeocodableAddress || (lead.hasDemoSite && lead.demoSiteDomain != nil)
    }

    private var hasInfoRows: Bool {
        addressLine != nil || lead.phone != nil || lead.contactPerson != nil
    }

    private var hasGeocodableAddress: Bool {
        !lead.address.trimmingCharacters(in: .whitespaces).isEmpty ||
        !lead.postcode.trimmingCharacters(in: .whitespaces).isEmpty
    }

    /// Combined "Address, Postcode" string, or nil if both parts are blank.
    private var addressLine: String? {
        let a = lead.address.trimmingCharacters(in: .whitespaces)
        let p = lead.postcode.trimmingCharacters(in: .whitespaces)
        if a.isEmpty && p.isEmpty { return nil }
        if a.isEmpty { return p }
        if p.isEmpty { return a }
        return "\(a), \(p)"
    }

    // Quick-action chip row: Call / Directions / Copy / Share
    private var quickActions: some View {
        HStack(spacing: 8) {
            if let phone = lead.phone,
               let url = URL(string: "tel:\(phone.filter { $0.isNumber })") {
                QuickActionButton(icon: "phone.fill", label: "Call", accent: true) {
                    BrandHaptics.tap()
                    UIApplication.shared.open(url)
                }
            }
            QuickActionButton(icon: "arrow.triangle.turn.up.right.diamond.fill", label: "Route") {
                BrandHaptics.tap()
                openMaps()
            }
            QuickActionButton(icon: "doc.on.doc.fill", label: "Copy") {
                BrandHaptics.success()
                UIPasteboard.general.string = "\(lead.address), \(lead.postcode)"
            }
            if lead.hasDemoSite, let domain = lead.demoSiteDomain {
                QuickActionButton(icon: "square.and.arrow.up.fill", label: "Share") {
                    BrandHaptics.tap()
                    shareDemo(domain: domain)
                }
            }
        }
    }

    private var mapCard: some View {
        Group {
            if let coord = leadCoordinate {
                MapCard(name: lead.businessName, coordinate: coord, onTap: openMaps)
            } else {
                HStack(spacing: 10) {
                    Image(systemName: "mappin.and.ellipse")
                        .font(.system(size: 13))
                        .foregroundStyle(Brand.signal)
                    Text("Tap Route to open in Apple Maps")
                        .font(Brand.Font.body(Brand.Font.caption))
                        .foregroundStyle(Brand.creamMuted)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .brandCard(padding: 0)
            }
        }
    }

    private var leadCoordinate: CLLocationCoordinate2D? {
        guard let lat = lead.cachedLat, let lng = lead.cachedLng else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    private func openMaps() {
        let q = "\(lead.businessName), \(lead.address), \(lead.postcode)"
            .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        if let url = URL(string: "http://maps.apple.com/?q=\(q)&daddr=\(q)") {
            UIApplication.shared.open(url)
        }
    }

    private func shareDemo(domain: String) {
        guard let url = URL(string: "https://\(domain)") else { return }
        let av = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let root = scene.windows.first?.rootViewController else { return }
        root.present(av, animated: true)
    }

    private var infoCard: some View {
        VStack(spacing: 0) {
            let rows = availableInfoRows()
            ForEach(rows.indices, id: \.self) { i in
                rows[i]
                if i < rows.count - 1 { rowDivider }
            }
        }
        .brandCard(padding: 0)
    }

    private func availableInfoRows() -> [AnyView] {
        var out: [AnyView] = []
        if let line = addressLine {
            out.append(AnyView(infoRow(label: "Address", value: line, mono: true)))
        }
        if let phone = lead.phone {
            out.append(AnyView(infoRow(label: "Phone", value: phone, mono: true, trailing: {
                if let url = URL(string: "tel:\(phone.filter { $0.isNumber })") {
                    Link(destination: url) {
                        HStack(spacing: 4) {
                            Image(systemName: "phone.fill").font(.system(size: 10))
                            Text("CALL")
                                .font(Brand.Font.mono(9.5))
                                .tracking(Brand.Tracking.eyebrow)
                        }
                        .foregroundStyle(Brand.signal)
                    }
                }
            })))
        }
        if let contact = lead.contactPerson {
            out.append(AnyView(infoRow(
                label: "Contact",
                value: lead.contactRole.map { "\(contact), \($0)" } ?? contact
            )))
        }
        return out
    }

    @ViewBuilder
    private func infoRow<Trailing: View>(
        label: String,
        value: String,
        mono: Bool = false,
        @ViewBuilder trailing: () -> Trailing = { EmptyView() }
    ) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(label.uppercased())
                .font(Brand.Font.mono(9.5))
                .tracking(Brand.Tracking.eyebrow)
                .foregroundStyle(Brand.creamMuted)
                .frame(width: 70, alignment: .leading)

            Text(value)
                .font(mono ? Brand.Font.mono(13) : Brand.Font.body(13))
                .foregroundStyle(Brand.cream)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 8)

            trailing()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    private var visitCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Text("/ VISIT")
                    .font(Brand.Font.mono(9.5))
                    .tracking(Brand.Tracking.eyebrow)
                    .foregroundStyle(Brand.signal)
                if visitActive {
                    Text("· LIVE")
                        .font(Brand.Font.mono(9.5))
                        .tracking(Brand.Tracking.eyebrow)
                        .foregroundStyle(Brand.signal)
                }
                Spacer()
                if visitActive {
                    Text(formatDuration(visitDuration))
                        .font(Brand.Font.mono(13, weight: .medium).monospacedDigit())
                        .foregroundStyle(Brand.cream)
                }
            }

            if visitActive {
                Button("End visit") { endVisit() }
                    .buttonStyle(GhostButtonStyle())
                    .frame(maxWidth: .infinity)
            } else {
                Button {
                    BrandHaptics.tap(.medium)
                    startVisit()
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "location.fill").font(.system(size: 11))
                        Text("I'm here — start visit")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryButtonStyle(size: .md))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .brandCard(padding: 14)
    }

    private var openingHoursCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("/ HOURS")
                .font(Brand.Font.mono(9.5))
                .tracking(Brand.Tracking.eyebrow)
                .foregroundStyle(Brand.signal)

            VStack(alignment: .leading, spacing: 4) {
                ForEach(lead.openingHoursArray, id: \.self) { entry in
                    Text(entry)
                        .font(Brand.Font.mono(11.5))
                        .foregroundStyle(Brand.creamDim)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .brandCard(padding: 14)
    }

    // ───────────── Prepare ─────────────

    private var prepareTab: some View {
        VStack(alignment: .leading, spacing: 20) {
            if lead.isPassBrief {
                passCard(lead.hook ?? "")
            } else {
                if let hook = lead.hook, !hook.isEmpty {
                    hookCard(hook)
                }
                if !lead.painPointsArray.isEmpty {
                    bulletSection(eyebrow: "What's costing them money", icon: "bolt.fill", items: lead.painPointsArray, tint: Brand.signal)
                }
                if let extended = lead.painPointsExtended, !extended.isEmpty {
                    painContextCard(extended)
                }
                if !lead.servicesArray.isEmpty {
                    bulletSection(eyebrow: "Services offered", icon: "minus", items: lead.servicesArray, tint: Brand.creamDim)
                }
                if !lead.trustBadgesArray.isEmpty {
                    bulletSection(eyebrow: "Trust signals", icon: "checkmark", items: lead.trustBadgesArray, tint: Brand.signal)
                }
                if !lead.bestReviewsArray.isEmpty { reviewsSection }
                if !lead.avoidTopicsArray.isEmpty {
                    bulletSection(eyebrow: "Don't mention", icon: "xmark", items: lead.avoidTopicsArray, tint: Brand.err)
                }
                if lead.hook == nil && lead.painPointsArray.isEmpty &&
                   lead.servicesArray.isEmpty && lead.trustBadgesArray.isEmpty && lead.bestReviewsArray.isEmpty {
                    EmptyState(
                        eyebrow: "No intel",
                        title: "Nothing on file yet.",
                        sub: "Pull to refresh on the Leads screen to pick up the latest enrichment."
                    )
                }
            }
        }
    }

    /// The single sharpest angle to open with — gold-bordered display card,
    /// the largest sales-brief text on the page. Match web brief styling:
    /// signal @ 0.12 fill + signal @ 0.4 border.
    private func hookCard(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("/ THE HOOK")
                .font(Brand.Font.mono(9.5))
                .tracking(Brand.Tracking.eyebrow)
                .foregroundStyle(Brand.signal)
            Text(text)
                .font(Brand.Font.display(19, weight: .medium))
                .tracking(-0.3)
                .foregroundStyle(Brand.cream)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: Brand.Radius.card, style: .continuous)
                .fill(Brand.signal.opacity(0.12))
        )
        .overlay(
            RoundedRectangle(cornerRadius: Brand.Radius.card, style: .continuous)
                .strokeBorder(Brand.signal.opacity(0.4), lineWidth: 1)
        )
    }

    /// PASS state — the business already has a modern site, no sale to make.
    /// Distinct warning style so the rep skips rather than pitches.
    private func passCard(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "hand.raised.fill")
                    .font(.system(size: 11))
                Text("/ SKIP THIS LEAD")
                    .font(Brand.Font.mono(9.5))
                    .tracking(Brand.Tracking.eyebrow)
            }
            .foregroundStyle(Brand.amber)

            Text(text)
                .font(Brand.Font.display(17, weight: .medium))
                .foregroundStyle(Brand.cream)
                .fixedSize(horizontal: false, vertical: true)

            Text("Mark it rejected and move on to the next patch. No pitch needed.")
                .font(Brand.Font.body(Brand.Font.caption))
                .foregroundStyle(Brand.creamDim)
                .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: Brand.Radius.card, style: .continuous)
                .fill(Brand.amber.opacity(0.10))
        )
        .overlay(
            RoundedRectangle(cornerRadius: Brand.Radius.card, style: .continuous)
                .strokeBorder(Brand.amber.opacity(0.35), lineWidth: 1)
        )
    }

    /// Free-text pain context — only rendered when `pain_points_extended` is
    /// provided. Sits below the bullet list.
    private func painContextCard(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("/ CONTEXT")
                .font(Brand.Font.mono(9.5))
                .tracking(Brand.Tracking.eyebrow)
                .foregroundStyle(Brand.creamMuted)
            Text(text)
                .font(Brand.Font.body(Brand.Font.bodySmall))
                .foregroundStyle(Brand.creamDim)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .brandCard(padding: 14)
    }

    private func bulletSection(eyebrow: String, icon: String, items: [String], tint: Color) -> some View {
        BrandSection(eyebrow: eyebrow) {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(items, id: \.self) { item in
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: icon)
                            .font(.system(size: 10, weight: .medium))
                            .foregroundStyle(tint)
                            .frame(width: 22, height: 22)
                            .background(tint.opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                        Text(item)
                            .font(Brand.Font.body(Brand.Font.bodySmall))
                            .foregroundStyle(Brand.creamDim)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .brandCard()
        }
    }

    private var reviewsSection: some View {
        BrandSection(eyebrow: "Top reviews") {
            VStack(alignment: .leading, spacing: 14) {
                ForEach(lead.bestReviewsArray.indices, id: \.self) { i in
                    let review = lead.bestReviewsArray[i]
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 4) {
                            ForEach(0..<min(review.rating, 5), id: \.self) { _ in
                                Image(systemName: "star.fill")
                                    .font(.system(size: 9))
                                    .foregroundStyle(Brand.signal)
                            }
                            Text("— \(review.author.uppercased())")
                                .font(Brand.Font.mono(10))
                                .tracking(Brand.Tracking.eyebrow)
                                .foregroundStyle(Brand.creamMuted)
                        }
                        Text("\u{201C}\(review.text)\u{201D}")
                            .font(Brand.Font.body(Brand.Font.bodySmall))
                            .italic()
                            .foregroundStyle(Brand.creamDim)
                    }
                    if i < lead.bestReviewsArray.count - 1 {
                        Rectangle().fill(Brand.line2).frame(height: 1)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .brandCard()
        }
    }

    // ───────────── Pitch ─────────────

    private var pitchTab: some View {
        VStack(alignment: .leading, spacing: 20) {
            if let opener = lead.opener, !opener.isEmpty { openerCard(opener) }

            if lead.hasDemoSite, lead.demoSiteDomain != nil {
                Button {
                    BrandHaptics.tap(.medium)
                    showClientPresentation = true
                } label: {
                    HStack(spacing: 14) {
                        Image(systemName: "iphone")
                            .font(.system(size: 18, weight: .medium))
                            .foregroundStyle(Brand.ink)
                            .frame(width: 40, height: 40)
                            .background(Circle().fill(Brand.ink.opacity(0.12)))
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Show client demo")
                                .font(Brand.Font.display(16, weight: .medium))
                                .foregroundStyle(Brand.ink)
                            Text("FULL-SCREEN · HIDES DASHBOARD")
                                .font(Brand.Font.mono(10))
                                .tracking(Brand.Tracking.eyebrow)
                                .foregroundStyle(Brand.ink.opacity(0.6))
                        }
                        Spacer()
                        Image(systemName: "arrow.up.forward")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(Brand.ink.opacity(0.7))
                    }
                    .padding(16)
                    .background(
                        RoundedRectangle(cornerRadius: Brand.Radius.card, style: .continuous)
                            .fill(Brand.cream)
                    )
                }
                .buttonStyle(.plain)
            }

            if !lead.demoMomentsArray.isEmpty {
                demoMomentsSection
            }

            BrandSection(eyebrow: "Pricing") {
                VStack(spacing: 0) {
                    priceRow("Website build", "£299")
                    rowDivider
                    priceRow("Monthly hosting", "£29/mo")
                    rowDivider
                    priceRow("Domain & SSL", "Included")
                    rowDivider
                    priceRow("Your commission", "£\((authStore.currentUser?.commissionAmountPence ?? 15000) / 100)", highlight: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .brandCard(padding: 8)
            }

            objectionsSection

            if let close = lead.closeScript, !close.isEmpty { closeCard(close) }
            if let nxt = lead.nextVisitReason, !nxt.isEmpty { nextVisitCard(nxt) }
        }
    }

    /// Exact opening line to say at the door. Quoted, display font, with a
    /// signal-gold left border to read like a note stuck on the jamb.
    private func openerCard(_ text: String) -> some View {
        HStack(spacing: 0) {
            Rectangle()
                .fill(Brand.signal)
                .frame(width: 3)

            VStack(alignment: .leading, spacing: 8) {
                Text("/ FIRST LINE AT THE DOOR")
                    .font(Brand.Font.mono(9.5))
                    .tracking(Brand.Tracking.eyebrow)
                    .foregroundStyle(Brand.signal)
                Text("\u{201C}\(text)\u{201D}")
                    .font(Brand.Font.display(16, weight: .medium))
                    .italic()
                    .foregroundStyle(Brand.cream)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(
            RoundedRectangle(cornerRadius: Brand.Radius.card, style: .continuous)
                .fill(Brand.bgStrong)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Brand.Radius.card, style: .continuous)
                .strokeBorder(Brand.line, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Brand.Radius.card, style: .continuous))
    }

    /// The ask — gold-tinted card. Match the hook card's signal-tint style
    /// but a touch softer since it's the tactical companion, not the frame.
    private func closeCard(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("/ ASK FOR THE SALE")
                .font(Brand.Font.mono(9.5))
                .tracking(Brand.Tracking.eyebrow)
                .foregroundStyle(Brand.signal)
            Text("\u{201C}\(text)\u{201D}")
                .font(Brand.Font.display(15, weight: .medium))
                .italic()
                .foregroundStyle(Brand.cream)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: Brand.Radius.card, style: .continuous)
                .fill(Brand.signal.opacity(0.10))
        )
        .overlay(
            RoundedRectangle(cornerRadius: Brand.Radius.card, style: .continuous)
                .strokeBorder(Brand.signal.opacity(0.35), lineWidth: 1)
        )
    }

    /// Recovery line if today's a no. Subtle card, muted body.
    private func nextVisitCard(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("/ IF TODAY'S A NO")
                .font(Brand.Font.mono(9.5))
                .tracking(Brand.Tracking.eyebrow)
                .foregroundStyle(Brand.creamMuted)
            Text(text)
                .font(Brand.Font.body(Brand.Font.bodySmall))
                .foregroundStyle(Brand.creamDim)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .brandCard(padding: 14)
    }

    /// Objection handlers — tailored per lead from the admin brief when
    /// available, otherwise fall back to the generic starter set. Each pair
    /// is rendered as "They say" (amber) + "You say" (signal).
    private var objectionsSection: some View {
        let pairs: [ObjectionPair] = lead.specificObjectionsArray.isEmpty
            ? genericObjections
            : lead.specificObjectionsArray
        let eyebrow = lead.specificObjectionsArray.isEmpty ? "Objections (generic)" : "Objections for this owner"
        return BrandSection(eyebrow: eyebrow) {
            VStack(spacing: 8) {
                ForEach(pairs.indices, id: \.self) { i in
                    objectionPairCard(pairs[i])
                }
            }
        }
    }

    private func objectionPairCard(_ pair: ObjectionPair) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 5) {
                Text("/ THEY SAY")
                    .font(Brand.Font.mono(9))
                    .tracking(Brand.Tracking.eyebrow)
                    .foregroundStyle(Brand.amber)
                Text("\u{201C}\(pair.objection)\u{201D}")
                    .font(Brand.Font.body(Brand.Font.bodySmall))
                    .italic()
                    .foregroundStyle(Brand.cream)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Rectangle().fill(Brand.line2).frame(height: 1)
            VStack(alignment: .leading, spacing: 5) {
                Text("/ YOU SAY")
                    .font(Brand.Font.mono(9))
                    .tracking(Brand.Tracking.eyebrow)
                    .foregroundStyle(Brand.signal)
                Text(pair.response)
                    .font(Brand.Font.body(Brand.Font.bodySmall))
                    .foregroundStyle(Brand.creamDim)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .brandCard(padding: 14)
    }

    /// Arrow-prefixed cards for the demo-walkthrough beats. Each item is
    /// its own card so the rep can tap-check while walking the owner
    /// through the site.
    private var demoMomentsSection: some View {
        BrandSection(eyebrow: "What to tap during the demo") {
            VStack(spacing: 6) {
                ForEach(lead.demoMomentsArray, id: \.self) { moment in
                    HStack(alignment: .top, spacing: 12) {
                        Text("\u{2192}")
                            .font(Brand.Font.display(16, weight: .semibold))
                            .foregroundStyle(Brand.signal)
                            .frame(width: 20, alignment: .leading)
                        Text(moment)
                            .font(Brand.Font.body(Brand.Font.bodySmall))
                            .foregroundStyle(Brand.cream)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .brandCard(padding: 12)
                }
            }
        }
    }

    private var genericObjections: [ObjectionPair] {
        [
            .init(objection: "I already have a website",
                  response: "Ask to see it. If it's not mobile-optimised or ranking locally, that's your opening."),
            .init(objection: "It's too expensive",
                  response: "One new customer a month covers it. Most businesses see ROI within 30 days."),
            .init(objection: "I need to think about it",
                  response: "What specifically is holding you back — price, timing, or the value?"),
            .init(objection: "I don't have time to deal with this",
                  response: "We handle everything. Approve the design, it goes live.")
        ]
    }

    private var rowDivider: some View {
        Rectangle().fill(Brand.line2).frame(height: 1)
    }

    private func priceRow(_ label: String, _ value: String, highlight: Bool = false) -> some View {
        HStack {
            Text(label)
                .font(Brand.Font.body(Brand.Font.bodySmall, weight: highlight ? .medium : .regular))
                .foregroundStyle(highlight ? Brand.cream : Brand.creamDim)
            Spacer()
            Text(value)
                .font(Brand.Font.mono(Brand.Font.bodySmall, weight: highlight ? .semibold : .regular))
                .foregroundStyle(highlight ? Brand.signal : Brand.cream)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
    }

    private func objectionRow(_ objection: String, _ response: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "exclamationmark.bubble")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Brand.signal)
                .frame(width: 22, height: 22)
                .background(Brand.signalSoft)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                .padding(.top, 2)
            VStack(alignment: .leading, spacing: 6) {
                Text(objection)
                    .font(Brand.Font.display(14, weight: .medium))
                    .foregroundStyle(Brand.cream)
                Text(response)
                    .font(Brand.Font.body(Brand.Font.bodySmall))
                    .foregroundStyle(Brand.creamDim)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
    }

    // ───────────── Follow up ─────────────

    private var followUpTab: some View {
        VStack(alignment: .leading, spacing: 20) {
            BrandSection(eyebrow: "Reminder") {
                Button {
                    BrandHaptics.tap()
                    showFollowupSheet = true
                } label: {
                    HStack(spacing: 12) {
                        if let date = lead.followUpAt {
                            Image(systemName: "calendar")
                                .font(.system(size: 18, weight: .medium))
                                .foregroundStyle(Brand.signal)
                                .frame(width: 36, height: 36)
                                .background(RoundedRectangle(cornerRadius: 9).fill(Brand.signalSoft))
                                .overlay(RoundedRectangle(cornerRadius: 9).strokeBorder(Brand.signalBorder, lineWidth: 1))
                            VStack(alignment: .leading, spacing: 3) {
                                Text(date.formatted(date: .long, time: .shortened))
                                    .font(Brand.Font.display(15, weight: .medium))
                                    .foregroundStyle(Brand.cream)
                                Text(countdownLabel(date).uppercased())
                                    .font(Brand.Font.mono(10, weight: .medium))
                                    .tracking(Brand.Tracking.eyebrow)
                                    .foregroundStyle(countdownColor(date))
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "pencil")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(Brand.creamMuted)
                        } else {
                            Image(systemName: "calendar.badge.plus")
                                .font(.system(size: 18, weight: .medium))
                                .foregroundStyle(Brand.creamMuted)
                                .frame(width: 36, height: 36)
                                .background(RoundedRectangle(cornerRadius: 9).fill(Brand.bgCard))
                                .overlay(RoundedRectangle(cornerRadius: 9).strokeBorder(Brand.line, lineWidth: 1))
                            VStack(alignment: .leading, spacing: 3) {
                                Text("Schedule follow-up")
                                    .font(Brand.Font.display(15, weight: .medium))
                                    .foregroundStyle(Brand.cream)
                                Text("Pick a date & time — we'll remind you")
                                    .font(Brand.Font.mono(10))
                                    .tracking(Brand.Tracking.eyebrow)
                                    .foregroundStyle(Brand.creamMuted)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(Brand.creamMuted)
                        }
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: Brand.Radius.card).fill(Brand.bgStrong))
                    .overlay(RoundedRectangle(cornerRadius: Brand.Radius.card).strokeBorder(Brand.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }

            if let contact = lead.contactPerson {
                BrandSection(eyebrow: "Point of contact") {
                    HStack(spacing: 14) {
                        ZStack {
                            Circle().fill(Brand.bgCard).frame(width: 40, height: 40)
                                .overlay(Circle().strokeBorder(Brand.line, lineWidth: 1))
                            Text(contact.prefix(1).uppercased())
                                .font(Brand.Font.display(15, weight: .semibold))
                                .foregroundStyle(Brand.cream)
                        }
                        VStack(alignment: .leading, spacing: 4) {
                            Text(contact)
                                .font(Brand.Font.display(15, weight: .medium))
                                .foregroundStyle(Brand.cream)
                            if let role = lead.contactRole {
                                Text(role)
                                    .font(Brand.Font.body(Brand.Font.caption))
                                    .foregroundStyle(Brand.creamDim)
                            }
                        }
                        Spacer()
                        if let phone = lead.phone,
                           let url = URL(string: "tel:\(phone.filter { $0.isNumber })") {
                            Link(destination: url) {
                                Image(systemName: "phone.fill")
                                    .font(.system(size: 15))
                                    .foregroundStyle(Brand.signal)
                                    .frame(width: 40, height: 40)
                                    .background(Circle().fill(Brand.signalSoft))
                                    .overlay(Circle().strokeBorder(Brand.signalBorder, lineWidth: 1))
                            }
                        }
                    }
                    .brandCard()
                }
            }

            EmptyState(
                eyebrow: "Notes",
                title: "Nothing logged yet.",
                sub: "Conversation history and notes will appear here after visits."
            )
        }
    }

    // ───────────── Sticky bottom action bar ─────────────

    @ViewBuilder
    private var stickyActionBar: some View {
        VStack(spacing: 0) {
            if let toast = pitchToast {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(Brand.signal)
                    Text(toast)
                        .font(Brand.Font.mono(11))
                        .foregroundStyle(Brand.cream)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(Brand.bgCard)
                .onAppear {
                    Task {
                        try? await Task.sleep(nanoseconds: 4_000_000_000)
                        await MainActor.run { pitchToast = nil }
                    }
                }
            }

            HStack(spacing: 10) {
                if hasPrimaryAction {
                    Button {
                        BrandHaptics.tap()
                        showStatusPicker = true
                    } label: {
                        updateStatusLabel
                    }
                    .buttonStyle(GhostButtonStyle(size: .sm))
                    .disabled(isUpdatingStatus)

                    primaryActionButton
                } else {
                    Button {
                        BrandHaptics.tap()
                        showStatusPicker = true
                    } label: {
                        updateStatusLabel
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(PrimaryButtonStyle(size: .sm))
                    .disabled(isUpdatingStatus)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 0)
        }
        .background(
            ZStack {
                Brand.ink.opacity(0.92)
                Rectangle().fill(.ultraThinMaterial)
            }
            .ignoresSafeArea(edges: .bottom)
            .overlay(alignment: .top) {
                Rectangle().fill(Brand.line).frame(height: 1)
            }
        )
    }

    private var hasPrimaryAction: Bool {
        (lead.hasDemoSite && lead.demoSiteDomain != nil) || lead.phone != nil
    }

    @ViewBuilder
    private var updateStatusLabel: some View {
        HStack(spacing: 6) {
            if isUpdatingStatus {
                ProgressView().scaleEffect(0.7).tint(Brand.cream)
            } else {
                Text("UPDATE STATUS")
                    .font(Brand.Font.mono(11))
                    .tracking(Brand.Tracking.eyebrow)
            }
        }
    }

    @ViewBuilder
    private var primaryActionButton: some View {
        if lead.hasDemoSite, lead.demoSiteDomain != nil {
            Button {
                BrandHaptics.tap(.medium)
                showClientPresentation = true
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: "iphone")
                        .font(.system(size: 12, weight: .medium))
                    Text("Show demo")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(PrimaryButtonStyle(size: .sm))
        } else if let phone = lead.phone,
                  let url = URL(string: "tel:\(phone.filter { $0.isNumber })") {
            Link(destination: url) {
                HStack(spacing: 5) {
                    Image(systemName: "phone.fill").font(.system(size: 12))
                    Text("Call")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(PrimaryButtonStyle(size: .sm))
        }
    }

    // ───────────── Helpers ─────────────

    private func relativeDate(_ date: Date) -> String {
        let days = Calendar.current.dateComponents([.day], from: .now, to: date).day ?? 0
        if days == 0 { return "Today" }
        if days == 1 { return "Tomorrow" }
        if days < 0 { return "\(abs(days)) days ago" }
        return "In \(days) days"
    }

    /// Countdown label that prefers hours when the follow-up is within
    /// today's window, days otherwise. "Overdue" when past.
    private func countdownLabel(_ date: Date) -> String {
        let now = Date.now
        if date < now {
            let dc = Calendar.current.dateComponents([.day, .hour], from: date, to: now)
            let d = dc.day ?? 0, h = dc.hour ?? 0
            if d > 0 { return "Overdue · \(d)d" }
            if h > 0 { return "Overdue · \(h)h" }
            return "Overdue"
        }
        let dc = Calendar.current.dateComponents([.day, .hour], from: now, to: date)
        let d = dc.day ?? 0, h = dc.hour ?? 0
        if d == 0 && h == 0 { return "In under an hour" }
        if d == 0 { return "In \(h)h" }
        if d == 1 { return "Tomorrow" }
        return "In \(d) days"
    }

    private func countdownColor(_ date: Date) -> Color {
        let now = Date.now
        if date < now { return Brand.err }
        let hours = Calendar.current.dateComponents([.hour], from: now, to: date).hour ?? 0
        if hours <= 24 { return Brand.signal }
        return Brand.creamMuted
    }

    /// Every status the picker offers triggers the questionnaire — the
    /// questionnaire is the single source of truth for capturing what
    /// happened on a visit. Its outcome chips cover the full status
    /// space:
    ///   - closed_now / closed_followup → sold
    ///   - follow_up                    → pitched
    ///   - rejected                     → rejected
    ///   - not_pitched                  → visited (or stays where it was)
    /// Picking "new" resets without a questionnaire (rare — used to undo).
    private static let questionnaireStatuses: Set<String> = ["visited", "pitched", "sold", "rejected"]

    private func updateStatus(_ newStatus: String) {
        // If the new status is one that warrants the questionnaire,
        // freeze the pitch duration NOW (before async network) so the
        // modal shows a stable timer reading.
        if Self.questionnaireStatuses.contains(newStatus) {
            if let start = visitStartTime {
                frozenPitchDuration = Int(Date().timeIntervalSince(start))
            } else {
                frozenPitchDuration = nil
            }
            // Stop the running timer if a visit is active — the visit
            // is over either way.
            if visitActive {
                visitTimer?.invalidate()
                visitTimer = nil
                visitActive = false
                locationManager.stopUpdating()
            }
            // Open the questionnaire. The submit handler cascades the
            // status to whatever outcome the SP picked, so we don't
            // PATCH /leads/:id/status here — the pitch route does it.
            showPostPitch = true
            return
        }

        isUpdatingStatus = true
        let id = lead.assignmentId
        let lat = locationManager.location?.coordinate.latitude
        let lng = locationManager.location?.coordinate.longitude
        Task {
            do {
                try await APIClient.shared.updateLeadStatus(id: id, status: newStatus, lat: lat, lng: lng)
                lead.status = newStatus
                lead.pendingStatusUpdate = nil
                try? modelContext.save()
            } catch {
                lead.pendingStatusUpdate = newStatus
                lead.pendingLat = lat
                lead.pendingLng = lng
                lead.status = newStatus
                try? modelContext.save()
            }
            isUpdatingStatus = false
        }
    }

    private func startVisit() {
        visitActive = true
        visitStartTime = .now
        locationManager.startUpdating()
        let id = lead.assignmentId
        let lat = locationManager.location?.coordinate.latitude ?? 0
        let lng = locationManager.location?.coordinate.longitude ?? 0
        Task { try? await APIClient.shared.postVisit(id: id, action: "start", lat: lat, lng: lng) }
        visitTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            if let start = visitStartTime {
                visitDuration = Date.now.timeIntervalSince(start)
            }
        }
    }

    private func endVisit() {
        visitTimer?.invalidate()
        visitTimer = nil
        visitActive = false
        let id = lead.assignmentId
        let lat = locationManager.location?.coordinate.latitude ?? 0
        let lng = locationManager.location?.coordinate.longitude ?? 0
        Task { try? await APIClient.shared.postVisit(id: id, action: "end", lat: lat, lng: lng) }
        locationManager.stopUpdating()
        // No auto-fire here — the questionnaire opens when the SP
        // explicitly changes status to pitched/sold/rejected via the
        // sticky-bar status picker. That gives them a "visited but
        // didn't pitch" path without forcing the modal.
    }

    /// Fetches the detail payload from /api/leads/:id and merges the rich
    /// sales-brief fields into the local SwiftData record. The list
    /// endpoint (used by LeadsView) returns a compact row without
    /// services, trust_badges, hook, opener, etc. — so a detail fetch on
    /// screen open is how those fields ever reach the UI.
    @MainActor
    private func fetchDetail() async {
        do {
            let dto = try await APIClient.shared.fetchLead(id: lead.assignmentId)
            let enc = JSONEncoder()
            func encode<T: Encodable>(_ val: T?) -> String? {
                guard let v = val, let d = try? enc.encode(v) else { return nil }
                return String(data: d, encoding: .utf8)
            }

            if lead.pendingStatusUpdate == nil { lead.status = dto.status }
            if let n = dto.businessName  { lead.businessName = n }
            if let t = dto.businessType  { lead.businessType = t }
            if let p = dto.postcode      { lead.postcode = p }
            if let a = dto.address       { lead.address = a }
            lead.phone              = dto.phone ?? lead.phone
            lead.googleRating       = dto.googleRating ?? lead.googleRating
            lead.googleReviewCount  = dto.googleReviewCount ?? lead.googleReviewCount
            lead.hasDemoSite        = dto.hasDemoSite
            lead.demoSiteDomain     = dto.demoSiteDomain ?? lead.demoSiteDomain
            lead.hasWebsite         = dto.hasWebsite ?? lead.hasWebsite
            lead.contactPerson      = dto.contactPerson ?? lead.contactPerson
            lead.contactRole        = dto.contactRole ?? lead.contactRole
            // Payment confirmation — set by Stripe webhook in prod.
            // Rebuild Date from ISO8601 string so the Payouts view
            // flips this lead from Projected to Confirmed automatically.
            if let raw = dto.paidAt {
                lead.paidAt = ISO8601DateFormatter().date(from: raw) ?? lead.paidAt
            }
            if let pence = dto.commissionAmountPence {
                lead.commissionAmountPence = pence
            }

            // Rich content (list endpoint strips these out)
            lead.openingHours       = encode(dto.openingHours) ?? lead.openingHours
            lead.services           = encode(dto.services) ?? lead.services
            lead.trustBadges        = encode(dto.trustBadges) ?? lead.trustBadges
            lead.avoidTopics        = encode(dto.avoidTopics) ?? lead.avoidTopics
            lead.bestReviews        = encode(dto.bestReviews) ?? lead.bestReviews

            // Sales brief
            lead.hook               = dto.hook ?? lead.hook
            lead.opener             = dto.opener ?? lead.opener
            lead.demoMoments        = encode(dto.demoMoments) ?? lead.demoMoments
            lead.specificObjections = encode(dto.specificObjections) ?? lead.specificObjections
            lead.closeScript        = dto.closeScript ?? lead.closeScript
            lead.nextVisitReason    = dto.nextVisitReason ?? lead.nextVisitReason
            lead.painPointsExtended = dto.painPointsExtended ?? lead.painPointsExtended
            lead.painPoints         = encode(dto.painPoints) ?? lead.painPoints

            lead.lastSyncedAt = .now
            try? modelContext.save()

            // Persist admin-uploaded demo HTML so it renders offline.
            // ClientPresentationView's localURLSync picks this up first.
            //
            // The admin has two upload paths:
            //   1. Inline HTML blob in `demo_site_html`      — save directly
            //   2. File upload to Supabase Storage, URL stashed in
            //      `demo_site_domain` (starts with http[s]://)  — fetch + save
            if let domain = dto.demoSiteDomain ?? lead.demoSiteDomain {
                if let html = dto.demoSiteHtml, !html.isEmpty {
                    DemoSiteCache.shared.saveHTML(html, for: domain)
                } else if domain.lowercased().hasPrefix("http") {
                    Task.detached { await DemoSiteCache.shared.cacheFromURL(domain) }
                }
            }
        } catch {
            if !(error is CancellationError),
               !(error is URLError && (error as? URLError)?.code == .cancelled) {
                NSLog("[LeadDetailView] fetchDetail failed: %@", "\(error)")
            }
        }
    }

    @MainActor
    private func geocodeIfNeeded() async {
        guard lead.cachedLat == nil || lead.cachedLng == nil else { return }
        let address = lead.address.trimmingCharacters(in: .whitespaces)
        let postcode = lead.postcode.trimmingCharacters(in: .whitespaces)
        guard !address.isEmpty || !postcode.isEmpty else { return }
        let parts = [address, postcode, "UK"].filter { !$0.isEmpty }
        let query = parts.joined(separator: ", ")
        let geocoder = CLGeocoder()
        if let placemarks = try? await geocoder.geocodeAddressString(query),
           let loc = placemarks.first?.location?.coordinate {
            lead.cachedLat = loc.latitude
            lead.cachedLng = loc.longitude
            try? modelContext.save()
        }
    }

    private func formatDuration(_ interval: TimeInterval) -> String {
        let m = Int(interval) / 60
        let s = Int(interval) % 60
        return String(format: "%02d:%02d", m, s)
    }
}

// MARK: — QuickActionButton

private struct QuickActionButton: View {
    let icon: String
    let label: String
    var accent: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .medium))
                Text(label.uppercased())
                    .font(Brand.Font.mono(9))
                    .tracking(Brand.Tracking.eyebrow)
            }
            .foregroundStyle(accent ? Brand.signal : Brand.creamDim)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(accent ? Brand.signalSoft : Brand.bgStrong)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(accent ? Brand.signalBorder : Brand.line, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: — MapCard

private struct MapCard: View {
    let name: String
    let coordinate: CLLocationCoordinate2D
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            ZStack(alignment: .topTrailing) {
                Map(initialPosition: .camera(MapCamera(
                    centerCoordinate: coordinate,
                    distance: 600
                ))) {
                    Marker(name, coordinate: coordinate)
                        .tint(Brand.signal)
                }
                .disabled(true)
                .frame(height: 140)
                .clipShape(RoundedRectangle(cornerRadius: Brand.Radius.card, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Brand.Radius.card, style: .continuous)
                        .strokeBorder(Brand.line, lineWidth: 1)
                )

                HStack(spacing: 4) {
                    Image(systemName: "arrow.up.forward")
                        .font(.system(size: 9, weight: .semibold))
                    Text("MAPS")
                        .font(Brand.Font.mono(9))
                        .tracking(Brand.Tracking.eyebrow)
                }
                .foregroundStyle(Brand.ink)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Capsule().fill(Brand.cream))
                .padding(12)
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: — Demo Viewer (unchanged)
struct DemoViewerView: View {
    let domain: String
    let businessName: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            WebViewContainer(urlString: "https://\(domain)")
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle(businessName)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button(action: share) {
                            Image(systemName: "square.and.arrow.up")
                        }
                        .foregroundStyle(Brand.signal)
                    }
                }
        }
    }

    private func share() {
        guard let url = URL(string: "https://\(domain)") else { return }
        let av = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let root = scene.windows.first?.rootViewController else { return }
        root.present(av, animated: true)
    }
}

// MARK: — LocationManager (unchanged)
@MainActor
final class LocationManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    @Published var location: CLLocation?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    }

    func startUpdating() {
        manager.requestWhenInUseAuthorization()
        manager.startUpdatingLocation()
    }

    func stopUpdating() { manager.stopUpdatingLocation() }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        Task { @MainActor in self.location = loc }
    }
}

#Preview {
    let lead = Lead(
        assignmentId: "preview-1",
        businessName: "The Coffee House",
        businessType: "Café",
        address: "12 High Street",
        postcode: "SW1A 1AA",
        phone: "020 7946 0321",
        googleRating: 4.7,
        googleReviewCount: 134,
        hasDemoSite: true,
        demoSiteDomain: "thecoffeehouse.demo.co.uk",
        status: "pitched",
        followUpAt: Calendar.current.date(byAdding: .day, value: 3, to: .now),
        contactPerson: "James",
        contactRole: "Owner",
        openingHours: "[\"Mon-Fri: 08:00-18:00\",\"Thu-Fri: 08:00-20:00\",\"Sat: 09:00-17:00\",\"Sun: Closed\"]",
        services: "[\"Espresso drinks\",\"Pastries & cakes\",\"Takeaway cups\",\"Loyalty card\"]",
        bestReviews: "[{\"author\":\"Sarah M\",\"rating\":5,\"text\":\"Best flat white in London — absolute must visit!\"},{\"author\":\"Tom K\",\"rating\":5,\"text\":\"Lovely atmosphere, great staff, never disappoints.\"}]",
        trustBadges: "[\"Google Guaranteed\",\"5-star rated\",\"Family run since 2008\"]",
        avoidTopics: "[\"Previous web agency\",\"Online reviews\"]"
    )
    return ZStack {
        BrandBackground()
        NavigationStack {
            LeadDetailView(lead: lead)
        }
        .modelContainer(for: Lead.self, inMemory: true)
        .environmentObject(AuthStore.shared)
    }
    .preferredColorScheme(.dark)
}
