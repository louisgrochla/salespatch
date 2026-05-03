import SwiftUI
import SwiftData

@main
struct SalesFlowApp: App {
    @StateObject private var authStore = AuthStore.shared
    @StateObject private var appearanceStore = AppearanceStore.shared

    @Environment(\.scenePhase) private var scenePhase

    var sharedModelContainer: ModelContainer = {
        let schema = Schema([Lead.self, PendingPitch.self])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)
        do {
            return try ModelContainer(for: schema, configurations: [config])
        } catch {
            fatalError("Could not create ModelContainer: \(error)")
        }
    }()

    var body: some Scene {
        WindowGroup {
            Group {
                if authStore.isAuthenticated {
                    if authStore.isUnlocked {
                        NavigationStack {
                            ModeSelectView()
                        }
                    } else {
                        UnlockView()
                    }
                } else {
                    LoginView()
                }
            }
            .environmentObject(authStore)
            .environmentObject(appearanceStore)
            .preferredColorScheme(appearanceStore.preference.colorScheme)
            // Biometric enable prompt after first login/signup
            .alert(
                "Enable \(BiometricManager.shared.biometricLabel)?",
                isPresented: $authStore.pendingBiometricPrompt
            ) {
                Button("Enable") { authStore.biometricEnabled = true }
                Button("Not Now", role: .cancel) {}
            } message: {
                Text("Unlock SalesFlow quickly with \(BiometricManager.shared.biometricLabel) next time.")
            }
            .task {
                // Bind the PitchQueue to the shared model container so any
                // view can enqueue submissions and the background flush
                // walks the same SwiftData store.
                PitchQueue.shared.bind(sharedModelContainer.mainContext)
                PitchQueue.shared.flush()
            }
            .onChange(of: scenePhase) { _, newPhase in
                if newPhase == .active {
                    // Network may have come back while the app was
                    // backgrounded — sweep the queue.
                    PitchQueue.shared.flush()
                }
            }
        }
        .modelContainer(sharedModelContainer)
    }
}

// MARK: — Unlock gate (biometric / PIN fallback)

struct UnlockView: View {
    @EnvironmentObject private var authStore: AuthStore
    @State private var showPINFallback = false
    @State private var biometricFailed = false

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Logo
                RoundedRectangle(cornerRadius: 20)
                    .fill(Theme.accent)
                    .frame(width: 64, height: 64)
                    .overlay(
                        Text("S")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundStyle(.white)
                    )

                if let user = authStore.currentUser {
                    Text("Hi, \(user.name.capitalized)")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(Theme.textPrimary)
                        .padding(.top, 16)
                }

                if showPINFallback {
                    PINKeypadView(
                        title: "Enter your PIN",
                        pinLength: authStore.storedPIN?.count ?? 4,
                        onComplete: { pin in
                            if authStore.storedPIN == pin {
                                authStore.unlock()
                                return true
                            }
                            return false
                        }
                    )
                    .padding(.top, 32)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
                } else {
                    VStack(spacing: 16) {
                        if biometricFailed {
                            Text("Authentication failed")
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.statusRejected)
                                .padding(.top, 12)
                        }

                        Button(action: attemptBiometric) {
                            HStack(spacing: 8) {
                                Image(systemName: BiometricManager.shared.biometricIcon)
                                    .font(.system(size: 18))
                                Text("Unlock with \(BiometricManager.shared.biometricLabel)")
                                    .font(.system(size: 15, weight: .semibold))
                            }
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .frame(height: 52)
                            .background(Theme.accent)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                        }
                        .padding(.horizontal, 40)
                        .padding(.top, 24)

                        Button("Use PIN instead") {
                            withAnimation(.easeInOut(duration: 0.25)) {
                                showPINFallback = true
                            }
                        }
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Theme.textSecondary)
                        .padding(.top, 4)
                    }
                }

                Spacer()
                Spacer()
            }
        }
        .onAppear {
            if BiometricManager.shared.canUseBiometrics && authStore.biometricEnabled {
                attemptBiometric()
            } else {
                showPINFallback = true
            }
        }
        .animation(.easeInOut(duration: 0.2), value: biometricFailed)
    }

    private func attemptBiometric() {
        biometricFailed = false
        Task {
            let success = await BiometricManager.shared.authenticate(
                reason: "Unlock SalesFlow"
            )
            await MainActor.run {
                if success {
                    authStore.unlock()
                } else {
                    biometricFailed = true
                }
            }
        }
    }
}
