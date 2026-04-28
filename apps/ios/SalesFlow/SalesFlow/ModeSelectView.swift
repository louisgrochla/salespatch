import SwiftUI
import SwiftData

// MARK: — ModeSelectView
// First screen after login. Splits into dashboard / client-demo / academy
// modes. Warm ink background inherited from BrandBackground.

struct ModeSelectView: View {
    @EnvironmentObject private var authStore: AuthStore
    @State private var showClientPicker = false
    @State private var presentationLead: Lead? = nil
    @State private var logoAppeared = false
    @State private var buttonsAppeared = false
    @State private var footerAppeared = false

    var body: some View {
        ZStack {
            BrandBackground()

            VStack(spacing: 0) {
                Spacer()

                wordmark
                    .opacity(logoAppeared ? 1 : 0)
                    .offset(y: logoAppeared ? 0 : 10)
                    .padding(.bottom, 56)

                modeButtons
                    .padding(.horizontal, 24)
                    .opacity(buttonsAppeared ? 1 : 0)
                    .offset(y: buttonsAppeared ? 0 : 12)

                Spacer()

                Button {
                    BrandHaptics.tap()
                    authStore.signOut()
                } label: {
                    Text("/ SIGN OUT")
                        .font(Brand.Font.mono(10))
                        .tracking(Brand.Tracking.eyebrow)
                        .foregroundStyle(Brand.creamMuted)
                }
                .opacity(footerAppeared ? 1 : 0)
                .padding(.bottom, 36)
            }
        }
        .preferredColorScheme(.dark)
        .onAppear {
            withAnimation(.easeOut(duration: 0.45))          { logoAppeared = true }
            withAnimation(.easeOut(duration: 0.45).delay(0.12)) { buttonsAppeared = true }
            withAnimation(.easeOut(duration: 0.35).delay(0.3))  { footerAppeared = true }
        }
        .sheet(isPresented: $showClientPicker) {
            ClientLeadPickerView(onSelect: { lead in
                showClientPicker = false
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                    presentationLead = lead
                }
            })
        }
        .fullScreenCover(item: $presentationLead) { lead in
            if let domain = lead.demoSiteDomain {
                ClientPresentationView(
                    domain: domain,
                    businessName: lead.businessName,
                    leadAssignmentId: lead.assignmentId
                )
            }
        }
    }

    // ───────────── Wordmark ─────────────

    private var wordmark: some View {
        VStack(spacing: 14) {
            Eyebrow(text: greeting, accent: true)

            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text("SalesFlow")
                    .font(Brand.Font.display(36, weight: .semibold))
                    .tracking(Brand.Tracking.display)
                    .foregroundStyle(Brand.cream)
                Circle().fill(Brand.signal).frame(width: 7, height: 7).offset(y: -2)
            }

            Text("What are you doing today?")
                .font(Brand.Font.body(Brand.Font.bodySmall))
                .foregroundStyle(Brand.creamDim)
        }
    }

    private var greeting: String {
        if let name = authStore.currentUser?.name {
            return "Hi \(name.capitalized.split(separator: " ").first.map(String.init) ?? name.capitalized)"
        }
        return "Welcome back"
    }

    // ───────────── Mode buttons ─────────────

    private var modeButtons: some View {
        VStack(spacing: 12) {
            NavigationLink {
                MainTabView().navigationBarHidden(true)
            } label: {
                ModeRow(
                    icon: "rectangle.grid.1x2",
                    title: "My dashboard",
                    subtitle: "Leads, map, payouts, profile",
                    accent: false
                )
            }
            .simultaneousGesture(TapGesture().onEnded { BrandHaptics.tap() })

            Button {
                BrandHaptics.tap(.medium)
                showClientPicker = true
            } label: {
                ModeRow(
                    icon: "iphone",
                    title: "Show client demo",
                    subtitle: "Full-screen site preview for the owner",
                    accent: true
                )
            }

            NavigationLink {
                AcademyPathView()
            } label: {
                ModeRow(
                    icon: "book.closed",
                    title: "Sales Academy",
                    subtitle: "Training, scripts, and scenarios",
                    accent: false
                )
            }
            .simultaneousGesture(TapGesture().onEnded { BrandHaptics.tap() })
        }
        .buttonStyle(ModePressStyle())
    }
}

// MARK: — ModeRow

private struct ModeRow: View {
    let icon: String
    let title: String
    let subtitle: String
    let accent: Bool

    var body: some View {
        HStack(spacing: 16) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(accent ? Brand.signalSoft : Brand.bgCard)
                    .frame(width: 50, height: 50)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .strokeBorder(accent ? Brand.signalBorder : Brand.line, lineWidth: 1)
                    )
                Image(systemName: icon)
                    .font(.system(size: 19, weight: .medium))
                    .foregroundStyle(accent ? Brand.signal : Brand.creamDim)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(Brand.Font.display(16, weight: .medium))
                    .foregroundStyle(Brand.cream)
                Text(subtitle)
                    .font(Brand.Font.body(Brand.Font.caption))
                    .foregroundStyle(Brand.creamMuted)
            }

            Spacer(minLength: 0)

            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(accent ? Brand.signal.opacity(0.7) : Brand.creamMuted)
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: Brand.Radius.card, style: .continuous)
                .fill(Brand.bgStrong)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Brand.Radius.card, style: .continuous)
                .strokeBorder(accent ? Brand.signalBorder : Brand.line, lineWidth: 1)
        )
    }
}

private struct ModePressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

// MARK: — ClientLeadPickerView

struct ClientLeadPickerView: View {
    let onSelect: (Lead) -> Void
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Query private var allLeads: [Lead]

    private var demoLeads: [Lead] {
        allLeads.filter { $0.hasDemoSite && $0.demoSiteDomain != nil }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                BrandBackground()

                if demoLeads.isEmpty {
                    EmptyState(
                        eyebrow: "No demos",
                        title: "No demo sites available.",
                        sub: "Leads with demo sites will appear here."
                    )
                    .padding(.horizontal, 20)
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 20) {
                            Eyebrow(text: "Select a business to demo", accent: true)
                            VStack(spacing: 8) {
                                ForEach(demoLeads) { lead in
                                    Button {
                                        BrandHaptics.tap(.medium)
                                        onSelect(lead)
                                    } label: {
                                        pickerRow(lead)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                        .padding(20)
                    }
                    .scrollContentBackground(.hidden)
                    .background(Color.clear)
                }
            }
            .navigationTitle("Client Demo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Brand.ink, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(Brand.signal)
                }
            }
        }
        .preferredColorScheme(.dark)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func pickerRow(_ lead: Lead) -> some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Brand.bgCard)
                    .frame(width: 44, height: 44)
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .strokeBorder(Brand.line, lineWidth: 1)
                    )
                Text(lead.businessName.prefix(2).uppercased())
                    .font(Brand.Font.mono(12, weight: .semibold))
                    .foregroundStyle(Brand.creamDim)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(lead.businessName)
                    .font(Brand.Font.display(15, weight: .medium))
                    .foregroundStyle(Brand.cream)
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
            Spacer(minLength: 0)
            Image(systemName: "play.circle.fill")
                .font(.system(size: 22))
                .foregroundStyle(Brand.signal)
        }
        .brandCard()
    }
}

#Preview {
    ZStack {
        BrandBackground()
        NavigationStack {
            ModeSelectView()
                .environmentObject(AuthStore.shared)
                .environmentObject(AppearanceStore.shared)
        }
    }
    .preferredColorScheme(.dark)
}
