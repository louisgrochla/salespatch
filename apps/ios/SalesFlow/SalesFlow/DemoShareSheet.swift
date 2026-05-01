import SwiftUI
import CoreImage.CIFilterBuiltins
import MessageUI

// MARK: — DemoShareSheet
// Bottom sheet triggered from the demo preview screen.
// Three options: QR Code (expands inline), AirDrop, Email.

struct DemoShareSheet: View {
    let businessName: String
    let demoURL: String

    @Environment(\.dismiss) private var dismiss
    @State private var qrExpanded = false
    @State private var showAirDrop = false
    @State private var showMailComposer = false
    @State private var showQRFullScreen = false
    @State private var mailNotAvailable = false

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.background.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 10) {
                        // ── QR Code Card ──────────────────────────────────────
                        QROptionCard(
                            isExpanded: $qrExpanded,
                            businessName: businessName,
                            demoURL: demoURL,
                            onFullScreen: { showQRFullScreen = true }
                        )

                        // ── AirDrop Card ──────────────────────────────────────
                        ShareOptionCard(
                            icon: "airplayaudio",
                            title: "AirDrop",
                            subtitle: "Share wirelessly to a nearby device"
                        ) {
                            showAirDrop = true
                        }

                        // ── Email Card ────────────────────────────────────────
                        ShareOptionCard(
                            icon: "envelope",
                            title: "Email",
                            subtitle: "Send the demo link to the owner"
                        ) {
                            if MFMailComposeViewController.canSendMail() {
                                showMailComposer = true
                            } else {
                                mailNotAvailable = true
                            }
                        }

                        // ── Cancel ────────────────────────────────────────────
                        Button(action: { dismiss() }) {
                            Text("Cancel")
                                .font(.system(size: 16))
                                .foregroundStyle(Theme.textMuted)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 4)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    // Drag handle styled as title area
                    VStack(spacing: 4) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Theme.border)
                            .frame(width: 36, height: 4)
                        Text("Share Demo")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Theme.textPrimary)
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.hidden) // using custom handle above
        // AirDrop / native share sheet
        .sheet(isPresented: $showAirDrop) {
            ActivityShareSheet(items: [URL(string: demoURL) ?? demoURL as Any])
        }
        // Mail composer
        .sheet(isPresented: $showMailComposer) {
            MailComposerView(
                subject: "Your website demo is ready — \(businessName)",
                body: "Hi,\n\nHere's a preview of your new website: \(demoURL)\n\nLet me know what you think!\n\nSalesFlow"
            )
        }
        // Full-screen QR
        .fullScreenCover(isPresented: $showQRFullScreen) {
            QRCodeView(businessName: businessName, demoURL: demoURL)
        }
        // Mail not set up alert
        .alert("Mail Not Available", isPresented: $mailNotAvailable) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Please set up a Mail account in Settings to send emails.")
        }
    }
}

// MARK: — QROptionCard
// The primary card. Tapping expands it inline to show the QR code.

private struct QROptionCard: View {
    @Binding var isExpanded: Bool
    let businessName: String
    let demoURL: String
    let onFullScreen: () -> Void

    @State private var saveSuccess = false

    var body: some View {
        VStack(spacing: 0) {
            // Header row — always visible
            Button(action: { withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { isExpanded.toggle() } }) {
                HStack(spacing: 14) {
                    iconBox(systemName: "qrcode", color: Theme.accent)

                    VStack(alignment: .leading, spacing: 3) {
                        Text("QR Code")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Theme.textPrimary)
                        Text("Let them scan directly from your screen")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.textMuted)
                    }

                    Spacer()

                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.textMuted)
                }
                .padding(16)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            // Expanded content
            if isExpanded {
                Divider()
                    .background(Theme.border)

                VStack(spacing: 16) {
                    Text(businessName)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.textSecondary)

                    // QR code image
                    QRCodeImage(content: demoURL, size: 200)
                        .clipShape(RoundedRectangle(cornerRadius: 8))

                    Text(demoURL)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(Theme.textMuted)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)

                    // Action buttons
                    HStack(spacing: 10) {
                        Button(action: {
                            saveQRToPhotos()
                        }) {
                            Label(saveSuccess ? "Saved!" : "Save to Photos", systemImage: saveSuccess ? "checkmark" : "square.and.arrow.down")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(saveSuccess ? Theme.statusSold : Theme.textPrimary)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .background(Theme.surfaceElevated)
                                .clipShape(RoundedRectangle(cornerRadius: Theme.radiusButton))
                                .overlay(
                                    RoundedRectangle(cornerRadius: Theme.radiusButton)
                                        .stroke(saveSuccess ? Theme.statusSold.opacity(0.4) : Theme.border, lineWidth: 1)
                                )
                        }
                        .buttonStyle(.plain)

                        Button(action: onFullScreen) {
                            Label("Full Screen", systemImage: "arrow.up.left.and.arrow.down.right")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(Theme.accent)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .background(Theme.accent.opacity(0.1))
                                .clipShape(RoundedRectangle(cornerRadius: Theme.radiusButton))
                                .overlay(
                                    RoundedRectangle(cornerRadius: Theme.radiusButton)
                                        .stroke(Theme.accent.opacity(0.25), lineWidth: 1)
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusCard))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radiusCard)
                .stroke(isExpanded ? Theme.accent.opacity(0.3) : Theme.border, lineWidth: 1)
        )
    }

    private func saveQRToPhotos() {
        guard let image = generateQRUIImage(content: demoURL, size: 400) else { return }
        UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)
        withAnimation { saveSuccess = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            withAnimation { saveSuccess = false }
        }
    }
}

// MARK: — ShareOptionCard
// Reusable tappable card for AirDrop and Email options.

private struct ShareOptionCard: View {
    let icon: String
    let title: String
    let subtitle: String
    let action: () -> Void

    @State private var pressed = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                iconBox(systemName: icon, color: Theme.textSecondary)

                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.textPrimary)
                    Text(subtitle)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textMuted)
                }

                Spacer()

                Image(systemName: "arrow.up.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.textMuted)
            }
            .padding(16)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radiusCard))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radiusCard)
                    .stroke(Theme.border, lineWidth: 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: Theme.radiusCard))
        }
        .buttonStyle(.plain)
    }
}

// MARK: — Shared icon box builder

private func iconBox(systemName: String, color: Color) -> some View {
    ZStack {
        RoundedRectangle(cornerRadius: 8)
            .fill(color.opacity(0.1))
            .frame(width: 42, height: 42)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(color.opacity(0.2), lineWidth: 1)
            )
        Image(systemName: systemName)
            .font(.system(size: 18))
            .foregroundStyle(color)
    }
}

// MARK: — QRCodeImage
// SwiftUI view that generates and renders a QR code using CoreImage.

struct QRCodeImage: View {
    let content: String
    let size: CGFloat

    var body: some View {
        if let uiImage = generateQRUIImage(content: content, size: size) {
            Image(uiImage: uiImage)
                .interpolation(.none)
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size)
        } else {
            // Fallback placeholder
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.white)
                .frame(width: size, height: size)
                .overlay(
                    Text("QR")
                        .font(.system(size: 24, weight: .bold, design: .monospaced))
                        .foregroundStyle(.black)
                )
        }
    }
}

// MARK: — QR generation helper (free function, reusable)

func generateQRUIImage(content: String, size: CGFloat) -> UIImage? {
    let context = CIContext()
    let filter = CIFilter.qrCodeGenerator()
    filter.correctionLevel = "M"
    guard let data = content.data(using: .isoLatin1) else { return nil }
    filter.setValue(data, forKey: "inputMessage")
    guard let ciImage = filter.outputImage else { return nil }

    // Scale up to requested size with integer scaling to keep pixels crisp
    let scaleX = size / ciImage.extent.width
    let scaleY = size / ciImage.extent.height
    let scaled = ciImage.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))

    guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else { return nil }
    return UIImage(cgImage: cgImage)
}

// MARK: — ActivityShareSheet (UIActivityViewController wrapper)

struct ActivityShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

// MARK: — MailComposerView (MFMailComposeViewController wrapper)

struct MailComposerView: UIViewControllerRepresentable {
    let subject: String
    let body: String
    @Environment(\.dismiss) private var dismiss

    func makeCoordinator() -> Coordinator { Coordinator(dismiss: dismiss) }

    func makeUIViewController(context: Context) -> MFMailComposeViewController {
        let vc = MFMailComposeViewController()
        vc.mailComposeDelegate = context.coordinator
        vc.setSubject(subject)
        vc.setMessageBody(body, isHTML: false)
        return vc
    }

    func updateUIViewController(_ uiViewController: MFMailComposeViewController, context: Context) {}

    class Coordinator: NSObject, MFMailComposeViewControllerDelegate {
        let dismiss: DismissAction
        init(dismiss: DismissAction) { self.dismiss = dismiss }

        func mailComposeController(_ controller: MFMailComposeViewController,
                                   didFinishWith result: MFMailComposeResult,
                                   error: Error?) {
            dismiss()
        }
    }
}

// MARK: — Preview

#Preview {
    Color.black.ignoresSafeArea()
        .sheet(isPresented: .constant(true)) {
            DemoShareSheet(
                businessName: "Barber & Co",
                demoURL: "https://barber-co.salesflow.site"
            )
        }
        .preferredColorScheme(.dark)
}
