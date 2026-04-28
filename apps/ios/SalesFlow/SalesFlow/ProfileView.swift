import SwiftUI

// MARK: — ProfileView
//
// User card → performance ribbon → grouped rows for permissions, support,
// legal, sign out. Re-skinned in the brand system. No appearance toggle —
// the app is dark-only by design (see MainTabView).

struct ProfileView: View {
    @EnvironmentObject private var authStore: AuthStore
    @State private var showSignOutAlert = false
    @State private var showHelp = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    hero
                    userCard
                    performanceRibbon
                    permissionsSection
                    supportSection
                    legalSection
                    signOutRow
                    versionLine
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
            .sheet(isPresented: $showHelp) { HelpView() }
            .alert("Sign out", isPresented: $showSignOutAlert) {
                Button("Sign out", role: .destructive) { authStore.signOut() }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("You'll need your PIN to sign back in.")
            }
        }
    }

    // ───────────── Hero ─────────────

    private var hero: some View {
        PageHero(
            eyebrow: "Profile",
            title: "Your",
            accent: "patch.",
            sub: "Contractor profile, permissions, and support.",
            size: Brand.Font.displayLG
        )
    }

    // ───────────── User card ─────────────

    private var userCard: some View {
        let user = authStore.currentUser
        return HStack(alignment: .center, spacing: 16) {
            ZStack {
                Circle()
                    .fill(Brand.bgCard)
                    .frame(width: 56, height: 56)
                    .overlay(Circle().strokeBorder(Brand.line, lineWidth: 1))
                Text((user?.name.prefix(1) ?? "?").uppercased())
                    .font(Brand.Font.display(22, weight: .semibold))
                    .foregroundStyle(Brand.cream)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text((user?.name ?? "Contractor").capitalized)
                    .font(Brand.Font.display(20, weight: .medium))
                    .tracking(Brand.Tracking.subhead)
                    .foregroundStyle(Brand.cream)

                if let contractorNum = user?.contractorNumber {
                    Button {
                        BrandHaptics.success()
                        UIPasteboard.general.string = contractorNum
                    } label: {
                        HStack(spacing: 5) {
                            Text(contractorNum)
                                .font(Brand.Font.mono(12))
                                .foregroundStyle(Brand.signal)
                            Image(systemName: "doc.on.doc")
                                .font(.system(size: 9))
                                .foregroundStyle(Brand.signal.opacity(0.7))
                        }
                    }
                    .buttonStyle(.plain)
                }

                HStack(spacing: 6) {
                    Text((user?.role?.uppercased() ?? "FIELD CONTRACTOR"))
                        .font(Brand.Font.mono(10))
                        .tracking(Brand.Tracking.eyebrow)
                        .foregroundStyle(Brand.creamMuted)
                    Circle().fill(Brand.signal).frame(width: 4, height: 4)
                    Text("ACTIVE")
                        .font(Brand.Font.mono(10))
                        .tracking(Brand.Tracking.eyebrow)
                        .foregroundStyle(Brand.signal)
                }
            }
            Spacer(minLength: 0)
        }
        .brandCard()
    }

    // ───────────── Performance ribbon ─────────────

    private var performanceRibbon: some View {
        BrandSection(eyebrow: "Performance") {
            MetricRibbon {
                StatCell(label: "This week", value: "—")
                StatDivider()
                StatCell(label: "Per sale",  value: "£50")
                StatDivider()
                StatCell(label: "Payout",    value: "Fri")
            }
        }
    }

    // ───────────── Grouped sections ─────────────

    private var permissionsSection: some View {
        groupedSection(eyebrow: "Permissions", rows: [
            GroupedRow(icon: "bell",     label: "Notifications",   action: openSettings),
            GroupedRow(icon: "location", label: "Location access", action: openSettings),
            GroupedRow(icon: "camera",   label: "Camera access",   action: openSettings),
        ])
    }

    private var supportSection: some View {
        groupedSection(eyebrow: "Support", rows: [
            GroupedRow(icon: "questionmark.circle", label: "How to use this app", action: { showHelp = true }),
            GroupedRow(icon: "doc.text",            label: "Contractor agreement", action: {}),
            GroupedRow(icon: "envelope",            label: "Contact support", action: {
                if let url = URL(string: "mailto:support@salesflow.app") { UIApplication.shared.open(url) }
            }),
        ])
    }

    private var legalSection: some View {
        groupedSection(eyebrow: "Legal", rows: [
            GroupedRow(icon: "hand.raised",    label: "Privacy policy",  action: {}),
            GroupedRow(icon: "doc.plaintext",  label: "Terms of service", action: {}),
        ])
    }

    private func groupedSection(eyebrow: String, rows: [GroupedRow]) -> some View {
        BrandSection(eyebrow: eyebrow) {
            VStack(spacing: 0) {
                ForEach(rows.indices, id: \.self) { i in
                    rows[i]
                    if i < rows.count - 1 {
                        Rectangle().fill(Brand.line2).frame(height: 1)
                            .padding(.leading, 52)
                    }
                }
            }
            .brandCard(padding: 0)
        }
    }

    // ───────────── Sign out ─────────────

    private var signOutRow: some View {
        Button {
            BrandHaptics.tap()
            showSignOutAlert = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "rectangle.portrait.and.arrow.right")
                    .font(.system(size: 14))
                    .foregroundStyle(Brand.err)
                    .frame(width: 22)
                Text("Sign out")
                    .font(Brand.Font.body(Brand.Font.body))
                    .foregroundStyle(Brand.err)
                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: Brand.Radius.card, style: .continuous)
                    .fill(Brand.bgStrong)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Brand.Radius.card, style: .continuous)
                    .strokeBorder(Brand.err.opacity(0.25), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private var versionLine: some View {
        Text("SALESFLOW V1.0 · BUILD 1 · INDEPENDENT CONTRACTOR PLATFORM")
            .font(Brand.Font.mono(10))
            .tracking(Brand.Tracking.eyebrow)
            .foregroundStyle(Brand.creamMuted)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.top, 12)
    }

    // ───────────── Helpers ─────────────

    private func openSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }
}

// MARK: — Grouped row

private struct GroupedRow: View {
    let icon: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: {
            BrandHaptics.tap()
            action()
        }) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 14))
                    .foregroundStyle(Brand.creamDim)
                    .frame(width: 22)
                Text(label)
                    .font(Brand.Font.body(Brand.Font.body))
                    .foregroundStyle(Brand.cream)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Brand.creamMuted)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: — Help view

struct HelpView: View {
    @Environment(\.dismiss) private var dismiss

    private let steps: [(String, String, String)] = [
        ("01", "Get your leads", "Your assigned businesses appear in the Leads tab. Each card shows the status, rating, and whether a demo is ready."),
        ("02", "Prepare before you visit", "Tap any lead and go to the Prepare tab for talking points, customer reviews, trust signals, and topics to avoid."),
        ("03", "Tap 'I'm here' on arrival", "This starts visit tracking and logs your GPS position for payout verification."),
        ("04", "Show the demo site", "In the Pitch tab, tap 'Show client demo' to walk them through the website on your phone."),
        ("05", "Update the status", "After each interaction, update the status: Visited, Pitched, Sold, or Rejected."),
        ("06", "Collect your commission", "£50 lands every Friday for each confirmed sale. No targets. No minimums."),
    ]

    var body: some View {
        NavigationStack {
            ZStack {
                BrandBackground()
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        PageHero(
                            eyebrow: "How it works",
                            title: "Six steps,",
                            accent: "every lead.",
                            size: Brand.Font.displayLG
                        )

                        VStack(spacing: 10) {
                            ForEach(steps, id: \.0) { step in
                                HStack(alignment: .top, spacing: 14) {
                                    Text(step.0)
                                        .font(Brand.Font.mono(12, weight: .semibold))
                                        .foregroundStyle(Brand.signal)
                                        .frame(width: 32, height: 32)
                                        .background(Brand.signalSoft)
                                        .clipShape(RoundedRectangle(cornerRadius: 8))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 8)
                                                .strokeBorder(Brand.signalBorder, lineWidth: 1)
                                        )

                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(step.1)
                                            .font(Brand.Font.display(16, weight: .medium))
                                            .foregroundStyle(Brand.cream)
                                        Text(step.2)
                                            .font(Brand.Font.body(Brand.Font.bodySmall))
                                            .foregroundStyle(Brand.creamDim)
                                            .fixedSize(horizontal: false, vertical: true)
                                    }
                                    Spacer(minLength: 0)
                                }
                                .brandCard()
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 24)
                }
                .scrollContentBackground(.hidden)
                .background(Color.clear)
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(Brand.signal)
                        .font(Brand.Font.body(Brand.Font.body, weight: .medium))
                }
            }
            .toolbarBackground(Brand.ink, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
        }
        .preferredColorScheme(.dark)
    }
}

#Preview {
    ZStack {
        BrandBackground()
        ProfileView()
            .environmentObject(AuthStore.shared)
            .environmentObject(AppearanceStore.shared)
    }
    .preferredColorScheme(.dark)
}
