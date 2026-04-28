import SwiftUI
import SwiftData

// MARK: — LeadsView
//
// Layout: PageHero → MetricRibbon (Queue / Visited / Pitched / Sold) →
// filter pills → lead list. Matches /dashboard on the web.
//
// Background comes from `BrandBackground` mounted in MainTabView; this view
// just lays content on a transparent scroll container.

struct LeadsView: View {
    @Environment(\.modelContext) private var modelContext
    @Query private var leads: [Lead]
    @EnvironmentObject private var authStore: AuthStore

    @State private var stats: Stats = .empty
    @State private var selectedFilter: String = "all"
    @State private var isRefreshing = false
    @State private var isOffline = false
    @State private var searchText = ""
    @State private var showSearch = false
    @State private var showLeaderboard = false

    private let filters = ["all", "new", "visited", "pitched", "rejected"]

    private var activeLeads: [Lead] {
        leads.filter { $0.status.lowercased() != "sold" }
    }

    private var filteredLeads: [Lead] {
        var result = activeLeads
        if selectedFilter != "all" {
            result = result.filter { $0.status.lowercased() == selectedFilter }
        }
        if !searchText.isEmpty {
            let q = searchText.lowercased()
            result = result.filter {
                $0.businessName.lowercased().contains(q) ||
                $0.businessType.lowercased().contains(q) ||
                $0.postcode.lowercased().contains(q)
            }
        }
        return result
    }

    private var followUpLeads: [Lead] {
        filteredLeads.filter { $0.followUpAt != nil && ($0.followUpAt ?? .distantPast) > .now }
    }

    private var regularLeads: [Lead] {
        filteredLeads.filter { $0.followUpAt == nil || ($0.followUpAt ?? .distantPast) <= .now }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    hero
                    ribbon
                    filterStrip
                    if showSearch { searchField }
                    content
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)
                .padding(.bottom, 48)
            }
            .scrollContentBackground(.hidden)
            .background(Color.clear)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Brand.ink, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { showLeaderboard = true } label: {
                        Image(systemName: "trophy.fill")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(Brand.signal)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        BrandHaptics.tap()
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showSearch.toggle()
                            if !showSearch { searchText = "" }
                        }
                    } label: {
                        Image(systemName: showSearch ? "xmark" : "magnifyingglass")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(Brand.creamDim)
                    }
                }
            }
            .sheet(isPresented: $showLeaderboard) {
                LeaderboardView()
            }
            .refreshable { await loadData() }
        }
        .task { await loadData() }
    }

    // ───────────── Hero ─────────────

    private var hero: some View {
        PageHero(
            eyebrow: "Today",
            title: "Leads on your",
            accent: "patch.",
            sub: heroSub,
            size: 26
        ) {
            PageMeta(userName, todayString)
        }
    }

    private var heroSub: String {
        let earned = Int(stats.earned)
        return "\(leads.count) assigned · £\(earned) earned this month"
    }

    private var userName: String {
        authStore.currentUser?.name ?? ""
    }

    private var todayString: String {
        let fmt = DateFormatter()
        fmt.dateFormat = "d MMM yyyy"
        return fmt.string(from: .now)
    }

    // ───────────── Metric ribbon ─────────────

    private var ribbon: some View {
        MetricRibbon {
            StatCell(label: "Queue",   value: "\(stats.queue)")
            StatDivider()
            StatCell(label: "Visited", value: "\(stats.visited)")
            StatDivider()
            StatCell(label: "Pitched", value: "\(stats.pitched)")
            StatDivider()
            StatCell(label: "Sold",    value: "\(stats.sold)", accent: true)
        }
    }

    // ───────────── Filters ─────────────

    private var filterStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(filters, id: \.self) { filter in
                    BrandChip(
                        label: filter == "all" ? "All" : Brand.statusLabel(for: filter),
                        count: counts[filter] ?? 0,
                        active: selectedFilter == filter
                    ) {
                        BrandHaptics.tap()
                        withAnimation(.easeInOut(duration: 0.18)) { selectedFilter = filter }
                    }
                }
            }
        }
    }

    private var counts: [String: Int] {
        var map = ["all": activeLeads.count]
        for f in filters where f != "all" {
            map[f] = leads.filter { $0.status.lowercased() == f }.count
        }
        return map
    }

    // ───────────── Search ─────────────

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14))
                .foregroundStyle(Brand.creamMuted)
            TextField("Name, type, or postcode", text: $searchText)
                .foregroundStyle(Brand.cream)
                .tint(Brand.signal)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            if !searchText.isEmpty {
                Button { withAnimation { searchText = "" } } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(Brand.creamMuted)
                }
                .buttonStyle(.plain)
            }
        }
        .brandInput()
        .transition(.move(edge: .top).combined(with: .opacity))
    }

    // ───────────── Content ─────────────

    @ViewBuilder
    private var content: some View {
        if filteredLeads.isEmpty && !isRefreshing {
            EmptyState(
                eyebrow: isOffline ? "Offline" : "Queue is quiet",
                title: isOffline ? "Can't reach the server." : searchText.isEmpty ? "No leads yet." : "No matches.",
                sub: isOffline ? "Pull to retry."
                   : searchText.isEmpty ? "They appear as the system assigns them to your patch."
                   : "Try a different search."
            )
        } else {
            VStack(alignment: .leading, spacing: 24) {
                if !followUpLeads.isEmpty {
                    leadGroup(title: "Follow up", leads: followUpLeads)
                }
                if !regularLeads.isEmpty {
                    leadGroup(
                        title: followUpLeads.isEmpty ? "Your book" : "Other leads",
                        leads: regularLeads
                    )
                }
                endOfListFooter
            }
        }
    }

    /// Signs off the list so a short book of leads doesn't leave a giant
    /// void above the tab bar. Also gives a refresh hint.
    private var endOfListFooter: some View {
        VStack(spacing: 8) {
            Text("/ \(filteredLeads.count) ACTIVE · PULL TO REFRESH")
                .font(Brand.Font.mono(10))
                .tracking(Brand.Tracking.eyebrow)
                .foregroundStyle(Brand.creamMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 20)
    }

    private func leadGroup(title: String, leads: [Lead]) -> some View {
        BrandSection(eyebrow: title) {
            VStack(spacing: 6) {
                ForEach(leads) { lead in
                    NavigationLink {
                        LeadDetailView(lead: lead)
                    } label: {
                        LeadRow(lead: lead)
                    }
                    .buttonStyle(LeadRowPress())
                }
            }
        }
    }

    // ───────────── Data ─────────────

    @MainActor
    private func loadData() async {
        isRefreshing = true
        defer { isRefreshing = false }

        // Sequential fetches — simpler cancellation semantics than
        // `async let` tuple. Errors on each are handled independently so
        // a transient blip on one endpoint doesn't nuke both.

        var networkHit = false

        do {
            let fetchedStats = try await APIClient.shared.fetchStats()
            stats = fetchedStats
            networkHit = true
        } catch {
            if !isCancellation(error) {
                NSLog("[LeadsView] stats failed: type=%@ err=%@", String(describing: type(of: error)), "\(error)")
            }
        }

        do {
            let fetchedLeads = try await APIClient.shared.fetchLeads()
            networkHit = true
            syncLeads(fetchedLeads)
            Task.detached(priority: .background) {
                for dto in fetchedLeads {
                    if let domain = dto.demoSiteDomain, dto.hasDemoSite {
                        await DemoSiteCache.shared.cache(domain: domain)
                    }
                }
            }
        } catch {
            if isCancellation(error) { return }
            NSLog("[LeadsView] leads failed: type=%@ err=%@", String(describing: type(of: error)), "\(error)")
            if !networkHit { isOffline = true }
            return
        }

        isOffline = false
    }

    private func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if let url = error as? URLError, url.code == .cancelled { return true }
        return false
    }

    /// Mark-and-sweep sync: upsert everything in the response, then delete
    /// any local assignments not in it. Keeps pending offline status writes
    /// intact so un-synced work isn't clobbered.
    private func syncLeads(_ dtos: [LeadDTO]) {
        let serverIds = Set(dtos.map(\.id))

        for dto in dtos {
            let id = dto.id
            let fetchDescriptor = FetchDescriptor<Lead>(
                predicate: #Predicate { $0.assignmentId == id }
            )
            if let existing = try? modelContext.fetch(fetchDescriptor).first {
                if existing.pendingStatusUpdate == nil { existing.status = dto.status }
                existing.contactPerson = dto.contactPerson
                existing.contactRole = dto.contactRole
                // Refresh sales-brief fields so admin edits propagate on pull-to-refresh
                let fresh = dto.toModel()
                existing.hook = fresh.hook
                existing.painPoints = fresh.painPoints
                existing.opener = fresh.opener
                existing.demoMoments = fresh.demoMoments
                existing.specificObjections = fresh.specificObjections
                existing.closeScript = fresh.closeScript
                existing.nextVisitReason = fresh.nextVisitReason
                existing.painPointsExtended = fresh.painPointsExtended
                existing.lastSyncedAt = Date.now
            } else {
                modelContext.insert(dto.toModel())
            }
        }

        // Sweep: drop any local lead the server no longer assigns to us.
        // Respect pending offline writes — those haven't made it to the
        // server yet so don't delete them.
        if let all = try? modelContext.fetch(FetchDescriptor<Lead>()) {
            for lead in all where !serverIds.contains(lead.assignmentId) && lead.pendingStatusUpdate == nil {
                modelContext.delete(lead)
            }
        }

        try? modelContext.save()
    }
}

// MARK: — LeadRow

private struct LeadRow: View {
    let lead: Lead

    private var isRejected: Bool { lead.status.lowercased() == "rejected" }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            icon
            VStack(alignment: .leading, spacing: 2) {
                Text(lead.businessType.uppercased())
                    .font(Brand.Font.mono(8.5))
                    .tracking(Brand.Tracking.eyebrow)
                    .foregroundStyle(Brand.creamMuted)
                    .lineLimit(1)

                Text(lead.businessName)
                    .font(Brand.Font.display(14, weight: .medium))
                    .tracking(-0.3)
                    .foregroundStyle(Brand.cream)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)

                metadataLine
                    .padding(.top, 1)
            }
            Spacer(minLength: 0)

            VStack(alignment: .trailing, spacing: 4) {
                StatusPill(status: lead.status)
                if lead.hasDemoSite {
                    HStack(spacing: 3) {
                        Image(systemName: "globe")
                            .font(.system(size: 8))
                        Text("DEMO")
                            .font(Brand.Font.mono(9))
                            .tracking(Brand.Tracking.eyebrow)
                    }
                    .foregroundStyle(Brand.signal)
                }
            }
        }
        .brandCard(padding: 12)
        .opacity(isRejected ? 0.55 : 1)
        .contentShape(Rectangle())
    }

    private var icon: some View {
        Image(systemName: lead.businessIcon)
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(Brand.signal)
            .frame(width: 30, height: 30)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Brand.signalSoft)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(Brand.signalBorder, lineWidth: 1)
            )
    }

    private var metadataLine: some View {
        HStack(spacing: 6) {
            Text(lead.postcode)
                .font(Brand.Font.mono(9.5))
                .foregroundStyle(Brand.creamDim)
                .lineLimit(1)
                .fixedSize()

            if let rating = lead.googleRating, rating > 0 {
                dot
                HStack(spacing: 2) {
                    Image(systemName: "star.fill")
                        .font(.system(size: 7.5))
                    Text(String(format: "%.1f", rating))
                        .font(Brand.Font.mono(9.5))
                }
                .foregroundStyle(Brand.creamDim)
                .lineLimit(1)
                .fixedSize()
            }

            if let followUp = lead.followUpAt, followUp > .now {
                dot
                Text(followUpLabel(followUp).uppercased())
                    .font(Brand.Font.mono(8.5))
                    .tracking(Brand.Tracking.eyebrow)
                    .foregroundStyle(Brand.amber)
                    .lineLimit(1)
                    .fixedSize()
            }

            Spacer(minLength: 0)
        }
    }

    private var dot: some View {
        Circle()
            .fill(Brand.line)
            .frame(width: 3, height: 3)
    }

    private func followUpLabel(_ date: Date) -> String {
        let days = Calendar.current.dateComponents([.day], from: .now, to: date).day ?? 0
        if days == 0 { return "Today" }
        if days == 1 { return "Tomorrow" }
        return "in \(days)d"
    }
}

// MARK: — Row press style

private struct LeadRowPress: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

// MARK: — Preview

extension Stats {
    static let seeded = Stats(queue: 8, visited: 3, pitched: 2, sold: 1, rejected: nil,
                              earned: 350, visitsToday: nil, salesToday: nil,
                              visitsThisWeek: nil, salesThisWeek: nil, totalCommission: nil)
}

private func seededLead(
    id: String, name: String, type: String, address: String, postcode: String,
    status: String, rating: Double?, reviewCount: Int?, phone: String?,
    hasDemoSite: Bool, contact: String? = nil, role: String? = nil, followUpDays: Int? = nil
) -> Lead {
    Lead(
        assignmentId: id, businessName: name, businessType: type,
        address: address, postcode: postcode, phone: phone,
        googleRating: rating, googleReviewCount: reviewCount,
        hasDemoSite: hasDemoSite,
        demoSiteDomain: hasDemoSite ? "\(name.lowercased().replacing(" ", with: "-")).salesflow.site" : nil,
        status: status,
        followUpAt: followUpDays.map { Calendar.current.date(byAdding: .day, value: $0, to: .now) } ?? nil,
        contactPerson: contact, contactRole: role, openingHours: nil,
        services: "[\"Example service\"]",
        bestReviews: "[{\"author\":\"A\",\"rating\":5,\"text\":\"Great\"}]",
        trustBadges: "[\"5★ Google\"]", avoidTopics: "[]"
    )
}

#Preview {
    let config = ModelConfiguration(isStoredInMemoryOnly: true)
    let container = try! ModelContainer(for: Lead.self, configurations: config)
    let ctx = container.mainContext
    [
        seededLead(id: "1", name: "Barber & Co", type: "Barber Shop", address: "12 High St", postcode: "E1 6RF", status: "new", rating: 4.7, reviewCount: 83, phone: nil, hasDemoSite: true),
        seededLead(id: "2", name: "Lotus Thai Kitchen", type: "Restaurant", address: "88 Old St", postcode: "EC1V 9AN", status: "pitched", rating: 4.9, reviewCount: 211, phone: nil, hasDemoSite: true, followUpDays: 2),
        seededLead(id: "3", name: "The Rusty Spoon", type: "Cafe", address: "4 Market Lane", postcode: "EC2A 3AB", status: "visited", rating: 4.2, reviewCount: 44, phone: nil, hasDemoSite: false),
        seededLead(id: "4", name: "Pixel Print Shop", type: "Print & Copy", address: "33 Brick Lane", postcode: "E1 6PU", status: "sold", rating: 4.5, reviewCount: 19, phone: nil, hasDemoSite: true),
        seededLead(id: "5", name: "Crunch Gym", type: "Fitness Centre", address: "1 City Rd", postcode: "EC1Y 1AG", status: "new", rating: 3.9, reviewCount: 62, phone: nil, hasDemoSite: false),
        seededLead(id: "6", name: "Blooms Florist", type: "Florist", address: "7 Camden Passage", postcode: "N1 8EA", status: "new", rating: 4.8, reviewCount: 57, phone: nil, hasDemoSite: true),
        seededLead(id: "7", name: "Nova Nails & Beauty", type: "Beauty Salon", address: "22 Wardour St", postcode: "W1F 8ZT", status: "visited", rating: 4.4, reviewCount: 96, phone: nil, hasDemoSite: true, followUpDays: 1),
        seededLead(id: "8", name: "Ironworks Coffee", type: "Specialty Coffee Bar", address: "14 Bermondsey St", postcode: "SE1 3TQ", status: "rejected", rating: 4.6, reviewCount: 128, phone: nil, hasDemoSite: false),
    ].forEach { ctx.insert($0) }
    return ZStack {
        BrandBackground()
        LeadsView()
            .modelContainer(container)
            .environmentObject(AuthStore.shared)
            .environmentObject(AppearanceStore.shared)
    }
    .preferredColorScheme(.dark)
}
