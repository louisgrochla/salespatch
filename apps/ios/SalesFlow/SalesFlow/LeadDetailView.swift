import SwiftUI
import Combine
import SwiftData
import CoreLocation
import MapKit

// MARK: — LeadDetailView
struct LeadDetailView: View {
    @Environment(\.modelContext) private var modelContext
    let lead: Lead

    @State private var selectedTab = 0
    @State private var showStatusPicker = false
    @State private var isUpdatingStatus = false
    @State private var errorMessage: String?
    @State private var showClientPresentation = false

    // Visit tracking
    @State private var visitActive = false
    @State private var visitStartTime: Date?
    @State private var visitDuration: TimeInterval = 0
    @State private var visitTimer: Timer?
    @StateObject private var locationManager = LocationManager()

    private let tabs = ["Overview", "Prepare", "Pitch", "Follow Up"]
    private let statuses = ["new", "visited", "pitched", "sold", "rejected"]

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            SubtleGridBackground().ignoresSafeArea()

            VStack(spacing: 0) {
                // Business header strip
                businessHeader
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(Theme.surface)
                    .overlay(alignment: .bottom) {
                        Rectangle().fill(Theme.borderSubtle).frame(height: Theme.borderWidth)
                    }

                // Segmented tabs
                HStack(spacing: 0) {
                    ForEach(tabs.indices, id: \.self) { i in
                        Button {
                            withAnimation(.easeInOut(duration: 0.15)) { selectedTab = i }
                        } label: {
                            VStack(spacing: 0) {
                                Text(tabs[i])
                                    .font(.system(size: 13, weight: selectedTab == i ? .semibold : .regular))
                                    .foregroundStyle(selectedTab == i ? Theme.textPrimary : Theme.textMuted)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 10)
                                Rectangle()
                                    .fill(selectedTab == i ? Theme.accent : Color.clear)
                                    .frame(height: 2)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .background(Theme.surface)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(Theme.borderSubtle).frame(height: Theme.borderWidth)
                }

                // Content
                ScrollView {
                    Group {
                        switch selectedTab {
                        case 0: overviewTab
                        case 1: prepareTab
                        case 2: pitchTab
                        case 3: followUpTab
                        default: EmptyView()
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                    .padding(.bottom, 40)
                }
            }
        }
        .navigationTitle(lead.businessName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Theme.surface, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showStatusPicker = true } label: {
                    StatusBadge(status: lead.status)
                }
            }
        }
        .confirmationDialog("Update Status", isPresented: $showStatusPicker, titleVisibility: .visible) {
            ForEach(statuses, id: \.self) { s in
                Button(Theme.statusLabel(for: s)) { updateStatus(s) }
            }
            Button("Cancel", role: .cancel) {}
        }
        .alert("Error", isPresented: .constant(errorMessage != nil), actions: {
            Button("OK") { errorMessage = nil }
        }, message: { Text(errorMessage ?? "") })
    }

    // MARK: — Business header strip

    private var businessHeader: some View {
        HStack(alignment: .center, spacing: 14) {
            // Initials avatar — slate blue per DESIGN_NOTES
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color(hex: "#5B7B9D").opacity(0.1))
                    .frame(width: 44, height: 44)
                Text(lead.businessName.prefix(2).uppercased())
                    .font(.system(size: 14, weight: .bold, design: .monospaced))
                    .foregroundStyle(Color(hex: "#5B7B9D"))
            }

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(lead.businessType)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textSecondary)
                    if let rating = lead.googleRating {
                        Text("·").foregroundStyle(Theme.textMuted).font(.system(size: 12))
                        HStack(spacing: 3) {
                            Image(systemName: "star.fill")
                                .font(.system(size: 9))
                                .foregroundStyle(Color(hex: "#9B8B6B"))
                            Text(String(format: "%.1f", rating))
                                .font(.system(size: 11, weight: .medium, design: .monospaced))
                                .foregroundStyle(Theme.textSecondary)
                            if let n = lead.googleReviewCount {
                                Text("(\(n))")
                                    .font(.system(size: 11))
                                    .foregroundStyle(Theme.textMuted)
                            }
                        }
                    }
                }
                Text("\(lead.address), \(lead.postcode)")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textMuted)
                    .lineLimit(1)
            }
            Spacer()
        }
    }

    // MARK: — Overview tab

    private var overviewTab: some View {
        VStack(spacing: 12) {
            // Info card
            DetailCard {
                VStack(alignment: .leading, spacing: 0) {
                    cardLabel("Business Info")
                    VStack(alignment: .leading, spacing: 10) {
                        DetailRow(icon: "building.2", label: "Type", value: lead.businessType)
                        DetailRow(icon: "mappin", label: "Address", value: "\(lead.address), \(lead.postcode)")
                        if let phone = lead.phone {
                            HStack(alignment: .top, spacing: 8) {
                                Image(systemName: "phone")
                                    .font(.system(size: 13))
                                    .foregroundStyle(Theme.textMuted)
                                    .frame(width: 20)
                                Text("Phone")
                                    .font(.system(size: 12))
                                    .foregroundStyle(Theme.textMuted)
                                    .frame(width: 60, alignment: .leading)
                                Link(phone, destination: URL(string: "tel:\(phone.filter { $0.isNumber })")!)
                                    .font(.system(size: 13))
                                    .foregroundStyle(Theme.accent)
                                Spacer()
                            }
                        }
                        if let contact = lead.contactPerson {
                            DetailRow(
                                icon: "person",
                                label: "Contact",
                                value: lead.contactRole.map { "\(contact), \($0)" } ?? contact
                            )
                        }
                    }
                }
            }

            // Status card
            DetailCard {
                VStack(alignment: .leading, spacing: 10) {
                    cardLabel("Status")
                    Button { showStatusPicker = true } label: {
                        HStack(spacing: 10) {
                            Circle()
                                .fill(Theme.statusColor(for: lead.status))
                                .frame(width: 8, height: 8)
                            Text(Theme.statusLabel(for: lead.status))
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(Theme.textPrimary)
                            Spacer()
                            if isUpdatingStatus {
                                ProgressView().scaleEffect(0.75)
                            } else {
                                Image(systemName: "chevron.up.chevron.down")
                                    .font(.system(size: 11))
                                    .foregroundStyle(Theme.textMuted)
                            }
                        }
                        .padding(10)
                        .background(Theme.surfaceElevated)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusButton))
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.radiusButton)
                                .stroke(Theme.border, lineWidth: Theme.borderWidth)
                        )
                    }
                    .buttonStyle(.plain)
                    .disabled(isUpdatingStatus)
                }
            }

            // Visit card
            visitCard

            // Opening hours
            if !lead.openingHoursArray.isEmpty {
                openingHoursCard
            }
        }
    }

    private var visitCard: some View {
        DetailCard {
            VStack(alignment: .leading, spacing: 10) {
                cardLabel("Visit Tracking")
                if visitActive {
                    HStack(alignment: .center) {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Circle()
                                    .fill(Theme.statusSold)
                                    .frame(width: 6, height: 6)
                                Text("Visit in progress")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(Theme.statusSold)
                            }
                            Text(formatDuration(visitDuration))
                                .font(.system(size: 26, weight: .bold, design: .monospaced))
                                .foregroundStyle(Theme.textPrimary)
                        }
                        Spacer()
                        Button("Leave") { endVisit() }
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.statusRejected)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 9)
                            .background(Theme.statusRejected.opacity(0.10))
                            .clipShape(RoundedRectangle(cornerRadius: Theme.radiusButton))
                            .overlay(
                                RoundedRectangle(cornerRadius: Theme.radiusButton)
                                    .stroke(Theme.statusRejected.opacity(0.35), lineWidth: Theme.borderWidth)
                            )
                    }
                } else {
                    Button(action: startVisit) {
                        HStack(spacing: 8) {
                            Image(systemName: "location.fill")
                                .font(.system(size: 12))
                            Text("I'm Here — Start Visit")
                                .font(.system(size: 14, weight: .semibold))
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .background(Theme.accent)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusButton))
                    }
                    .buttonStyle(.plain)
                    Text("Tap when you're at the business. GPS position will be logged.")
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.textMuted)
                }
            }
        }
    }

    private var openingHoursCard: some View {
        DetailCard {
            VStack(alignment: .leading, spacing: 10) {
                cardLabel("Opening Hours")
                ForEach(lead.openingHoursArray, id: \.self) { entry in
                    Text(entry)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(Theme.textSecondary)
                }
            }
        }
    }

    // MARK: — Prepare tab

    private var prepareTab: some View {
        VStack(spacing: 12) {
            if !lead.servicesArray.isEmpty {
                BulletCard(
                    title: "Services Offered",
                    items: lead.servicesArray,
                    icon: "minus",
                    accentColor: Color(hex: "#7B7B9D")   // muted lavender
                )
            }
            if !lead.trustBadgesArray.isEmpty {
                BulletCard(
                    title: "Trust Signals",
                    items: lead.trustBadgesArray,
                    icon: "checkmark",
                    accentColor: Color(hex: "#6B8F7B")    // sage green
                )
            }
            if !lead.bestReviewsArray.isEmpty {
                reviewsCard
            }
            if !lead.avoidTopicsArray.isEmpty {
                BulletCard(
                    title: "Avoid These Topics",
                    items: lead.avoidTopicsArray,
                    icon: "xmark",
                    accentColor: Color(hex: "#B06060")    // muted rose
                )
            }
            if lead.servicesArray.isEmpty && lead.trustBadgesArray.isEmpty && lead.bestReviewsArray.isEmpty {
                emptyCard("No intelligence available for this business yet. Pull to refresh on the Leads screen.")
            }
        }
    }

    private var reviewsCard: some View {
        DetailCard {
            VStack(alignment: .leading, spacing: 12) {
                cardLabel("Top Reviews")
                ForEach(lead.bestReviewsArray.indices, id: \.self) { i in
                    let review = lead.bestReviewsArray[i]
                    VStack(alignment: .leading, spacing: 5) {
                        HStack(spacing: 2) {
                            ForEach(0..<min(review.rating, 5), id: \.self) { _ in
                                Image(systemName: "star.fill")
                                    .font(.system(size: 9))
                                    .foregroundStyle(Color(hex: "#9B8B6B"))
                            }
                            Text("— \(review.author)")
                                .font(.system(size: 10))
                                .foregroundStyle(Theme.textMuted)
                        }
                        Text("\"\(review.text)\"")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.textSecondary)
                            .italic()
                    }
                    if i < lead.bestReviewsArray.count - 1 {
                        Rectangle().fill(Theme.border).frame(height: Theme.borderWidth)
                    }
                }
            }
        }
    }

    // MARK: — Pitch tab

    private var pitchTab: some View {
        VStack(spacing: 12) {
            // Client presentation button
            if lead.hasDemoSite, let domain = lead.demoSiteDomain {
                // Primary action — prominent, full width
                Button(action: { showClientPresentation = true }) {
                    HStack(spacing: 12) {
                        ZStack {
                            Circle()
                                .fill(.white.opacity(0.12))
                                .frame(width: 38, height: 38)
                            Image(systemName: "iphone")
                                .font(.system(size: 16, weight: .medium))
                                .foregroundStyle(.white)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Show Client Demo")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(.white)
                            Text("Full-screen · hides dashboard")
                                .font(.system(size: 12))
                                .foregroundStyle(.white.opacity(0.6))
                        }
                        Spacer()
                        Image(systemName: "arrow.up.forward.app")
                            .font(.system(size: 14))
                            .foregroundStyle(.white.opacity(0.7))
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(Theme.accent)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusCard))
                }
                .buttonStyle(.plain)
                .fullScreenCover(isPresented: $showClientPresentation) {
                    ClientPresentationView(domain: domain, businessName: lead.businessName, leadAssignmentId: lead.id)
                }
            }

            // Pricing breakdown
            DetailCard {
                VStack(alignment: .leading, spacing: 12) {
                    cardLabel("Pricing")
                    VStack(spacing: 8) {
                        PriceRow(label: "Website build", value: "£299")
                        dividerThin
                        PriceRow(label: "Monthly hosting", value: "£29/mo")
                        dividerThin
                        PriceRow(label: "Domain & SSL", value: "Included")
                        dividerThin
                        PriceRow(label: "Your commission", value: "£50", highlight: true)
                    }
                }
            }

            // Objections
            DetailCard {
                VStack(alignment: .leading, spacing: 12) {
                    cardLabel("Objection Handlers")
                    ObjectionRow(
                        objection: "\"I already have a website\"",
                        response: "Ask to see it. If it's not mobile-optimised or ranking locally, that's your opening."
                    )
                    dividerThin
                    ObjectionRow(
                        objection: "\"It's too expensive\"",
                        response: "One new customer a month covers it. Most businesses see ROI within 30 days."
                    )
                    dividerThin
                    ObjectionRow(
                        objection: "\"I need to think about it\"",
                        response: "What specifically is holding you back — price, timing, or the value?"
                    )
                    dividerThin
                    ObjectionRow(
                        objection: "\"I don't have time to deal with this\"",
                        response: "We handle everything. You don't touch it. Just approve the design and it goes live."
                    )
                }
            }
        }
    }

    private var dividerThin: some View {
        Rectangle().fill(Theme.border).frame(height: Theme.borderWidth)
    }

    // MARK: — Follow Up tab

    private var followUpTab: some View {
        VStack(spacing: 12) {
            // Reminder
            DetailCard {
                VStack(alignment: .leading, spacing: 10) {
                    cardLabel("Reminder")
                    if let date = lead.followUpAt {
                        HStack(spacing: 10) {
                            Image(systemName: "calendar")
                                .font(.system(size: 16))
                                .foregroundStyle(Theme.accent)
                                .frame(width: 22)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(date.formatted(date: .long, time: .omitted))
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(Theme.textPrimary)
                                Text(relativeDate(date))
                                    .font(.system(size: 12))
                                    .foregroundStyle(Theme.textMuted)
                            }
                        }
                    } else {
                        HStack(spacing: 8) {
                            Image(systemName: "calendar.badge.plus")
                                .foregroundStyle(Theme.textMuted)
                            Text("No follow-up scheduled")
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.textMuted)
                        }
                    }
                }
            }

            // Contact
            if let contact = lead.contactPerson {
                DetailCard {
                    VStack(alignment: .leading, spacing: 10) {
                        cardLabel("Point of Contact")
                        HStack(spacing: 12) {
                            ZStack {
                                Circle()
                                    .fill(Theme.surfaceElevated)
                                    .frame(width: 40, height: 40)
                                    .overlay(Circle().stroke(Theme.border, lineWidth: Theme.borderWidth))
                                Text(contact.prefix(1).uppercased())
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundStyle(Theme.textSecondary)
                            }
                            VStack(alignment: .leading, spacing: 3) {
                                Text(contact)
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(Theme.textPrimary)
                                if let role = lead.contactRole {
                                    Text(role)
                                        .font(.system(size: 12))
                                        .foregroundStyle(Theme.textSecondary)
                                }
                            }
                            Spacer()
                            if let phone = lead.phone,
                               let url = URL(string: "tel:\(phone.filter { $0.isNumber })") {
                                Link(destination: url) {
                                    Image(systemName: "phone.fill")
                                        .font(.system(size: 16))
                                        .foregroundStyle(Theme.accent)
                                        .frame(width: 40, height: 40)
                                        .background(Theme.accent.opacity(0.10))
                                        .clipShape(Circle())
                                }
                            }
                        }
                    }
                }
            }

            // Notes placeholder
            emptyCard("Conversation history and notes will appear here after visits are logged.")
        }
    }

    // MARK: — Helpers

    private func cardLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(Theme.textMuted)
            .tracking(0.6)
            .textCase(.uppercase)
            .padding(.bottom, 2)
    }

    private func emptyCard(_ message: String) -> some View {
        DetailCard {
            Text(message)
                .font(.system(size: 13))
                .foregroundStyle(Theme.textMuted)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func relativeDate(_ date: Date) -> String {
        let days = Calendar.current.dateComponents([.day], from: .now, to: date).day ?? 0
        if days == 0 { return "Today" }
        if days == 1 { return "Tomorrow" }
        if days < 0 { return "\(abs(days)) days ago" }
        return "In \(days) days"
    }

    private func updateStatus(_ newStatus: String) {
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
    }

    private func formatDuration(_ interval: TimeInterval) -> String {
        let m = Int(interval) / 60
        let s = Int(interval) % 60
        return String(format: "%02d:%02d", m, s)
    }
}

// MARK: — Sub-components

struct DetailCard<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            content.padding(16)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusCard))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radiusCard)
                .stroke(Theme.border, lineWidth: Theme.borderWidth)
        )
    }
}

struct SectionHeader: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(Theme.textMuted)
            .tracking(0.6)
            .textCase(.uppercase)
    }
}

struct DetailRow: View {
    let icon: String
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 13))
                .foregroundStyle(Theme.textMuted)
                .frame(width: 20)
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(Theme.textMuted)
                .frame(width: 60, alignment: .leading)
            Text(value)
                .font(.system(size: 13))
                .foregroundStyle(Theme.textPrimary)
            Spacer()
        }
    }
}

struct StatusBadge: View {
    let status: String

    var body: some View {
        Text(Theme.statusLabel(for: status))
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(Theme.statusColor(for: status))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Theme.statusColor(for: status).opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay(
                RoundedRectangle(cornerRadius: 6)
                    .stroke(Theme.statusColor(for: status).opacity(0.3), lineWidth: Theme.borderWidth)
            )
    }
}

private struct BulletCard: View {
    let title: String
    let items: [String]
    let icon: String
    var accentColor: Color = Color(hex: "#5B7B9D")

    var body: some View {
        DetailCard {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader(title: title)
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(items, id: \.self) { item in
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: icon)
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(accentColor)
                                .frame(width: 20, height: 20)
                                .background(accentColor.opacity(0.1))
                                .clipShape(RoundedRectangle(cornerRadius: 5))
                            Text(item)
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.textSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct PriceRow: View {
    let label: String
    let value: String
    var highlight: Bool = false

    var body: some View {
        HStack {
            Text(label)
                .font(.system(size: 13, weight: highlight ? .semibold : .regular))
                .foregroundStyle(highlight ? Theme.textPrimary : Theme.textSecondary)
            Spacer()
            Text(value)
                .font(.system(size: 13, weight: highlight ? .bold : .regular, design: .monospaced))
                .foregroundStyle(highlight ? Color(hex: "#6B8F7B") : Theme.textPrimary)
        }
    }
}

private struct ObjectionRow: View {
    let objection: String
    let response: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.bubble")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Color(hex: "#9B8B6B"))
                .frame(width: 22, height: 22)
                .background(Color(hex: "#9B8B6B").opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 5))
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 4) {
                Text(objection)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
                Text(response)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.textSecondary)
            }
        }
    }
}

// MARK: — Demo Viewer
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
                        .foregroundStyle(Theme.accent)
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

// MARK: — LocationManager
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
    return NavigationStack {
        LeadDetailView(lead: lead)
    }
    .modelContainer(for: Lead.self, inMemory: true)
    .environmentObject(AuthStore.shared)
}
