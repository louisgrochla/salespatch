import SwiftUI

// MARK: — LoginView
// Warm ink background, display wordmark with signal-gold dot, brand inputs.
// Matches `/login` on web — PIN is part of the UX (not a password).

struct LoginView: View {
    @EnvironmentObject private var authStore: AuthStore

    @State private var name: String = ""
    @State private var pin: String = ""
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showSignUp = false
    @FocusState private var focusedField: Field?

    private enum Field { case name, pin }

    var body: some View {
        ZStack {
            BrandBackground()

            VStack(alignment: .leading, spacing: 32) {
                Spacer(minLength: 0)

                wordmark

                VStack(alignment: .leading, spacing: 16) {
                    LabeledField(label: "Name") {
                        TextField("your name", text: $name)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($focusedField, equals: .name)
                    }

                    LabeledField(label: "PIN") {
                        SecureField("••••", text: $pin)
                            .keyboardType(.numberPad)
                            .focused($focusedField, equals: .pin)
                    }

                    if let error = errorMessage {
                        HStack(spacing: 6) {
                            Image(systemName: "exclamationmark.circle")
                                .font(.system(size: 12))
                            Text(error)
                                .font(Brand.Font.body(Brand.Font.bodySmall))
                        }
                        .foregroundStyle(Brand.err)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                    }

                    Button(action: signIn) {
                        HStack(spacing: 8) {
                            if isLoading {
                                ProgressView().tint(Brand.ink).scaleEffect(0.85)
                            } else {
                                Text("Sign in")
                                Image(systemName: "arrow.right").font(.system(size: 13, weight: .semibold))
                            }
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(PrimaryButtonStyle(size: .lg))
                    .opacity(canSignIn ? 1 : 0.45)
                    .disabled(!canSignIn || isLoading)
                    .animation(.easeInOut(duration: 0.15), value: canSignIn)
                    .padding(.top, 8)
                }
                .brandCard(padding: 24)

                VStack(spacing: 10) {
                    Button { showSignUp = true } label: {
                        HStack(spacing: 4) {
                            Text("Don't have an account?")
                                .foregroundStyle(Brand.creamMuted)
                            Text("Create one")
                                .foregroundStyle(Brand.signal)
                        }
                        .font(Brand.Font.body(Brand.Font.bodySmall))
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)

                    Button(action: signInAsDemo) {
                        Text("/ USE DEMO ACCOUNT")
                            .font(Brand.Font.mono(10))
                            .tracking(Brand.Tracking.eyebrow)
                            .foregroundStyle(Brand.creamMuted)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                    .disabled(isLoading)
                }

                Spacer(minLength: 0)

                Text("/ INDEPENDENT CONTRACTOR PLATFORM · NOT MONITORED")
                    .font(Brand.Font.mono(10))
                    .tracking(Brand.Tracking.eyebrow)
                    .foregroundStyle(Brand.creamMuted)
                    .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 48)
            .frame(maxWidth: 440)
        }
        .preferredColorScheme(.dark)
        .onAppear { focusedField = .name }
        .fullScreenCover(isPresented: $showSignUp) {
            SignUpView()
                .environmentObject(authStore)
                .environmentObject(AppearanceStore.shared)
        }
        .animation(.easeInOut(duration: 0.2), value: errorMessage)
    }

    // ───────────── Wordmark ─────────────

    private var wordmark: some View {
        VStack(alignment: .leading, spacing: 12) {
            Eyebrow(text: "Welcome back", accent: true)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text("SalesFlow")
                    .font(Brand.Font.display(40, weight: .semibold))
                    .tracking(Brand.Tracking.display)
                    .foregroundStyle(Brand.cream)
                Circle()
                    .fill(Brand.signal)
                    .frame(width: 8, height: 8)
                    .offset(y: -4)
            }
            Text("Sign in to your patch.")
                .font(Brand.Font.body(Brand.Font.bodySmall))
                .foregroundStyle(Brand.creamDim)
        }
    }

    // ───────────── Logic ─────────────

    private var canSignIn: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && !pin.isEmpty
    }

    private func signIn() {
        errorMessage = nil
        isLoading = true
        focusedField = nil
        BrandHaptics.tap()
        Task {
            do {
                try await authStore.signIn(name: name.trimmingCharacters(in: .whitespaces).lowercased(), pin: pin)
                if BiometricManager.shared.canUseBiometrics && !authStore.biometricEnabled {
                    authStore.pendingBiometricPrompt = true
                }
            } catch {
                withAnimation { errorMessage = error.localizedDescription }
            }
            isLoading = false
        }
    }

    private func signInAsDemo() {
        errorMessage = nil
        isLoading = true
        focusedField = nil
        BrandHaptics.tap()
        Task {
            do {
                try await authStore.signInAsDemo()
            } catch {
                withAnimation { errorMessage = error.localizedDescription }
            }
            isLoading = false
        }
    }
}

#Preview {
    LoginView()
        .environmentObject(AuthStore.shared)
}
