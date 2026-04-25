import SwiftUI

// MARK: — PaidCelebrationView
//
// Full-screen "✓ Paid · £X" celebratory state. Triggered when the lead
// flips to status='sold' while the QR sheet is up (polling in
// ClientPresentationView). Salesperson can close confidently and end
// the conversation with a clean handshake.

struct PaidCelebrationView: View {
    let businessName: String
    let commissionPence: Int
    let onClose: () -> Void

    @State private var pulse = false
    @State private var showWallet = false

    private var commissionPounds: String {
        let pounds = Double(commissionPence) / 100
        if pounds.rounded() == pounds {
            return "£\(Int(pounds))"
        }
        return String(format: "£%.2f", pounds)
    }

    var body: some View {
        ZStack {
            // Dark backdrop
            Color(hex: "#0F0E0C").ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                // ── Tick mark with pulse ──────────────────────────────────
                ZStack {
                    Circle()
                        .fill(Color(hex: "#B8860B").opacity(0.16))
                        .frame(width: 140, height: 140)
                        .scaleEffect(pulse ? 1.18 : 1.0)
                        .opacity(pulse ? 0 : 1)
                    Circle()
                        .fill(Color(hex: "#B8860B").opacity(0.22))
                        .frame(width: 96, height: 96)
                    Image(systemName: "checkmark")
                        .font(.system(size: 38, weight: .semibold))
                        .foregroundStyle(Color(hex: "#FAF8F5"))
                }
                .onAppear {
                    withAnimation(.easeOut(duration: 1.4).repeatForever(autoreverses: false)) {
                        pulse = true
                    }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
                        withAnimation(.spring(response: 0.6, dampingFraction: 0.75)) {
                            showWallet = true
                        }
                    }
                }

                // ── Headline ──────────────────────────────────────────────
                VStack(spacing: 8) {
                    Text("Paid")
                        .font(.system(size: 56, weight: .semibold))
                        .foregroundStyle(Color(hex: "#FAF8F5"))
                        .tracking(-1.5)

                    Text(businessName.isEmpty ? "Customer" : businessName)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Color(hex: "#9A9489"))
                        .textCase(.uppercase)
                        .tracking(2.4)
                }

                // ── Commission earned ──────────────────────────────────────
                if showWallet {
                    HStack(spacing: 10) {
                        Text("+ \(commissionPounds)")
                            .font(.system(size: 28, weight: .semibold, design: .rounded))
                            .foregroundStyle(Color(hex: "#B8860B"))
                        Text("in your wallet")
                            .font(.system(size: 15))
                            .foregroundStyle(Color(hex: "#D4CFC4"))
                    }
                    .padding(.horizontal, 22)
                    .padding(.vertical, 12)
                    .background(Color(hex: "#1A1814"))
                    .clipShape(Capsule())
                    .overlay(
                        Capsule().stroke(Color(hex: "#B8860B").opacity(0.3), lineWidth: 1)
                    )
                    .transition(.scale.combined(with: .opacity))
                }

                Spacer()

                // ── Close button ──────────────────────────────────────────
                Button(action: onClose) {
                    Text("Done — back to dashboard")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Color(hex: "#0F0E0C"))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Color(hex: "#FAF8F5"))
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 28)
                .padding(.bottom, 40)
            }
        }
    }
}

#Preview {
    PaidCelebrationView(
        businessName: "Barber & Co",
        commissionPence: 15000,
        onClose: {}
    )
}
