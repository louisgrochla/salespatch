import SwiftUI
import SwiftData

// MARK: — ModeSelectView
// First screen after login. Always dark. Splits into dashboard or client demo mode.

struct ModeSelectView: View {
    @EnvironmentObject private var authStore: AuthStore
    @EnvironmentObject private var appearanceStore: AppearanceStore
    @State private var showClientPicker = false
    @State private var presentationLead: Lead? = nil
    @State private var logoAppeared = false
    @State private var buttonsAppeared = false
    @State private var footerAppeared = false

    // Hard-coded dark — this screen is always dark regardless of system setting
    private let bg        = Color(hex: "#000000")
    private let cardBg    = Color(hex: "#0a0a0a")
    private let elevBg    = Color(hex: "#111111")
    private let borderClr = Color(hex: "#333333")
    private let txtMuted  = Color(hex: "#666666")
    private let txtDim    = Color(hex: "#444444")
    private let txtSec    = Color(hex: "#999999")
    private let accentClr = Color(hex: "#0071E3")

    var body: some View {
        ZStack {
            bg.ignoresSafeArea()

            // Subtle glow
            RadialGradient(
                colors: [accentClr.opacity(0.06), .clear],
                center: .top,
                startRadius: 10,
                endRadius: 350
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // ── Wordmark ──────────────────────────────────
                VStack(spacing: 12) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 14)
                            .fill(.white.opacity(0.05))
                            .frame(width: 56, height: 56)

                        RoundedRectangle(cornerRadius: 12)
                            .fill(.white)
                            .frame(width: 44, height: 44)
                            .shadow(color: .white.opacity(0.12), radius: 16, y: 4)
                            .overlay(
                                Image(systemName: "chart.line.uptrend.xyaxis")
                                    .font(.system(size: 20, weight: .medium))
                                    .foregroundStyle(Color(hex: "#f59e0b"))
                            )
                    }
                    .padding(.bottom, 4)

                    Text("SalesFlow")
                        .font(.system(size: 26, weight: .bold))
                        .tracking(-0.8)
                        .foregroundStyle(.white)

                    Text("What are you doing today?")
                        .font(.system(size: 15))
                        .foregroundStyle(txtMuted)
                }
                .opacity(logoAppeared ? 1 : 0)
                .offset(y: logoAppeared ? 0 : 10)
                .padding(.bottom, 48)

                // ── Mode buttons ──────────────────────────────
                VStack(spacing: 12) {

                    // Dashboard
                    NavigationLink(destination: MainTabView().navigationBarHidden(true).preferredColorScheme(appearanceStore.preference.colorScheme)) {
                        ModeButtonRow(
                            icon: "rectangle.grid.1x2",
                            iconBg: elevBg,
                            iconBorderColor: borderClr,
                            iconColor: txtSec,
                            title: "My Dashboard",
                            subtitle: "Leads, map, payouts, profile",
                            cardBg: cardBg,
                            borderColor: borderClr,
                            arrowColor: txtDim
                        )
                    }
                    .buttonStyle(ModeButtonStyle())

                    // Client demo
                    Button(action: { showClientPicker = true }) {
                        ModeButtonRow(
                            icon: "iphone",
                            iconBg: accentClr.opacity(0.12),
                            iconBorderColor: accentClr.opacity(0.3),
                            iconColor: accentClr,
                            title: "Show Client Demo",
                            subtitle: "Full-screen site preview for the owner",
                            cardBg: cardBg,
                            borderColor: accentClr.opacity(0.2),
                            arrowColor: accentClr.opacity(0.5)
                        )
                    }
                    .buttonStyle(ModeButtonStyle())

                    // Sales Academy
                    let greenAccent = Color(hex: "#059669")
                    NavigationLink(destination: AcademyPathView()) {
                        ModeButtonRow(
                            icon: "book.closed",
                            iconBg: greenAccent.opacity(0.12),
                            iconBorderColor: greenAccent.opacity(0.3),
                            iconColor: greenAccent,
                            title: "Sales Academy",
                            subtitle: "Training, scripts, and scenarios",
                            cardBg: cardBg,
                            borderColor: greenAccent.opacity(0.2),
                            arrowColor: greenAccent.opacity(0.5)
                        )
                    }
                    .buttonStyle(ModeButtonStyle())
                }
                .padding(.horizontal, 24)
                .opacity(buttonsAppeared ? 1 : 0)
                .offset(y: buttonsAppeared ? 0 : 12)

                Spacer()

                // Sign out
                Button(action: { authStore.signOut() }) {
                    Text("Sign out")
                        .font(.system(size: 13))
                        .foregroundStyle(txtDim)
                }
                .opacity(footerAppeared ? 1 : 0)
                .padding(.bottom, 36)
            }
        }
        .preferredColorScheme(.dark)
        .onAppear {
            withAnimation(.easeOut(duration: 0.45)) {
                logoAppeared = true
            }
            withAnimation(.easeOut(duration: 0.45).delay(0.12)) {
                buttonsAppeared = true
            }
            withAnimation(.easeOut(duration: 0.35).delay(0.3)) {
                footerAppeared = true
            }
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
                ClientPresentationView(domain: domain, businessName: lead.businessName, leadAssignmentId: lead.id)
            }
        }
    }
}

// MARK: — ModeButtonRow

private struct ModeButtonRow: View {
    let icon: String
    let iconBg: Color
    let iconBorderColor: Color
    let iconColor: Color
    let title: String
    let subtitle: String
    let cardBg: Color
    let borderColor: Color
    let arrowColor: Color

    var body: some View {
        HStack(spacing: 16) {
            ZStack {
                RoundedRectangle(cornerRadius: 12)
                    .fill(iconBg)
                    .frame(width: 50, height: 50)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(iconBorderColor, lineWidth: 1)
                    )
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundStyle(iconColor)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                Text(subtitle)
                    .font(.system(size: 13))
                    .foregroundStyle(Color(hex: "#666666"))
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(arrowColor)
        }
        .padding(18)
        .background(cardBg)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(
                    LinearGradient(
                        colors: [borderColor.opacity(0.8), borderColor.opacity(0.3)],
                        startPoint: .top,
                        endPoint: .bottom
                    ),
                    lineWidth: 1
                )
        )
    }
}

// MARK: — ModeButtonStyle (press feedback)

private struct ModeButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .opacity(configuration.isPressed ? 0.8 : 1.0)
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
                Color.black.ignoresSafeArea()

                if demoLeads.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "globe.desk")
                            .font(.system(size: 36, weight: .thin))
                            .foregroundStyle(Color(hex: "#333333"))
                        Text("No demo sites available")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Color(hex: "#999999"))
                        Text("Leads with demo sites will appear here")
                            .font(.system(size: 13))
                            .foregroundStyle(Color(hex: "#555555"))
                    }
                } else {
                    List {
                        Section {
                            ForEach(demoLeads) { lead in
                                Button(action: { onSelect(lead) }) {
                                    HStack(spacing: 14) {
                                        ZStack {
                                            RoundedRectangle(cornerRadius: 10)
                                                .fill(Color(hex: "#111111"))
                                                .frame(width: 42, height: 42)
                                                .overlay(
                                                    RoundedRectangle(cornerRadius: 10)
                                                        .stroke(Color(hex: "#333333"), lineWidth: 1)
                                                )
                                            Text(lead.businessName.prefix(2).uppercased())
                                                .font(.system(size: 13, weight: .bold, design: .monospaced))
                                                .foregroundStyle(Color(hex: "#666666"))
                                        }

                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(lead.businessName)
                                                .font(.system(size: 15, weight: .semibold))
                                                .foregroundStyle(.white)
                                            HStack(spacing: 4) {
                                                Text(lead.businessType)
                                                    .font(.system(size: 12))
                                                    .foregroundStyle(Color(hex: "#666666"))
                                                Text("\u{00B7}")
                                                    .foregroundStyle(Color(hex: "#444444"))
                                                Text(lead.postcode)
                                                    .font(.system(size: 11, design: .monospaced))
                                                    .foregroundStyle(Color(hex: "#555555"))
                                            }
                                        }

                                        Spacer()

                                        Image(systemName: "play.circle.fill")
                                            .font(.system(size: 24))
                                            .foregroundStyle(Color(hex: "#0071E3"))
                                    }
                                    .padding(.vertical, 4)
                                }
                                .buttonStyle(.plain)
                                .listRowBackground(Color(hex: "#0a0a0a"))
                                .listRowSeparatorTint(Color(hex: "#1a1a1a"))
                            }
                        } header: {
                            Text("Select a business to demo")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(Color(hex: "#555555"))
                                .tracking(0.5)
                                .textCase(.uppercase)
                        }
                    }
                    .listStyle(.insetGrouped)
                    .scrollContentBackground(.hidden)
                }
            }
            .navigationTitle("Client Demo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(Color(hex: "#0071E3"))
                }
            }
        }
        .preferredColorScheme(.dark)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

#Preview {
    NavigationStack {
        ModeSelectView()
            .environmentObject(AuthStore.shared)
    }
}
