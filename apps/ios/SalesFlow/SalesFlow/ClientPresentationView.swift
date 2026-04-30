import SwiftUI
import WebKit

// MARK: — ClientPresentationView
// Full-screen client-facing mode. Zero app chrome visible.
// The owner sees only their demo site + a "Get This Website" CTA.
// Salesman exits via the small corner button.

struct ClientPresentationView: View {
    let domain: String
    let businessName: String
    let leadAssignmentId: String

    @Environment(\.dismiss) private var dismiss
    @StateObject private var network = NetworkMonitor.shared
    @State private var isLoading = true
    @State private var showExitConfirm = false
    @State private var showCTASheet = false
    @State private var showShareSheet = false
    @State private var isCached = false
    @State private var isCaching = false

    // Public host for the customer-facing preview page. Always salespatch.co.uk
    // regardless of build target — customers scan from their own phone, never
    // from localhost.
    private static let publicShareHost = "https://salespatch.co.uk"

    // The URL we share / encode in the QR. Routes the customer through
    // /preview/<assignment-id>, which lazily creates the Stripe Checkout
    // session on first load (no eager iOS roundtrip needed).
    private var shareURL: String {
        "\(Self.publicShareHost)/preview/\(leadAssignmentId)"
    }

    // Sold-detection: poll lead status every 3s while share sheet is up.
    // When status flips to 'sold', show the celebratory paid state.
    @State private var pollingTask: Task<Void, Never>?
    @State private var isPaid = false
    @State private var commissionEarnedPence: Int?

    var body: some View {
        ZStack(alignment: .top) {

            // ── Full-screen web view ─────────────────────────────────────
            ClientWebView(domain: domain, isLoading: $isLoading, network: network)
                .ignoresSafeArea()

            // ── Loading shimmer ──────────────────────────────────────────
            if isLoading {
                ZStack {
                    Color.black.ignoresSafeArea()
                    VStack(spacing: 16) {
                        ProgressView()
                            .tint(.white)
                            .scaleEffect(1.2)
                        Text("Loading \(businessName)…")
                            .font(.system(size: 14))
                            .foregroundStyle(.white.opacity(0.5))
                    }
                }
                .transition(.opacity)
            }

            // ── Top chrome — minimal, unobtrusive ───────────────────────
            VStack(spacing: 0) {
                HStack(alignment: .center) {
                    // Exit button — small, top-left, semi-transparent
                    Button(action: { showExitConfirm = true }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.7))
                            .frame(width: 34, height: 34)
                            .background(.black.opacity(0.45))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)

                    Spacer()

                    // Business name pill — centred
                    VStack(spacing: 3) {
                        Text(businessName)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(.white)

                        // Cache/connectivity status indicator
                        HStack(spacing: 4) {
                            Circle()
                                .fill(network.isOnline ? Color(hex: "#3D9E5F") : (isCached ? Color(hex: "#B8922A") : Color(hex: "#C0392B")))
                                .frame(width: 5, height: 5)
                            Text(network.isOnline ? "Live" : (isCached ? "Offline · cached" : "No connection"))
                                .font(.system(size: 10))
                                .foregroundStyle(.white.opacity(0.5))
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(.black.opacity(0.45))
                    .clipShape(Capsule())

                    Spacer()

                    // Cache button (salesman can force-cache while online)
                    if network.isOnline && !isCached {
                        Button(action: { Task { await forceCache() } }) {
                            Image(systemName: isCaching ? "arrow.triangle.2.circlepath" : "arrow.down.circle")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(.white.opacity(0.6))
                                .frame(width: 34, height: 34)
                                .background(.black.opacity(0.45))
                                .clipShape(Circle())
                                .rotationEffect(isCaching ? .degrees(360) : .degrees(0))
                                .animation(isCaching ? .linear(duration: 1).repeatForever(autoreverses: false) : .default, value: isCaching)
                        }
                        .buttonStyle(.plain)
                    } else {
                        Color.clear.frame(width: 34, height: 34)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 56) // below status bar
                .padding(.bottom, 12)

                Spacer()
            }

            // ── Floating share button — bottom right ──────────────────────
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    Button(action: {
                        // Fire-and-forget: warm the Stripe session so the customer
                        // doesn't wait on first scan + lock attribution metadata.
                        // The QR URL itself is deterministic — we don't depend on
                        // this call succeeding to share.
                        Task.detached {
                            _ = try? await APIClient.shared.createCheckout(leadId: leadAssignmentId)
                        }
                        showShareSheet = true
                    }) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 50, height: 50)
                            .background(.black.opacity(0.55))
                            .clipShape(Circle())
                            .overlay(Circle().stroke(.white.opacity(0.15), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .padding(.trailing, 20)
                    .padding(.bottom, 48)
                }
            }
        }
        // Hide navigation chrome but keep status bar (time/battery visible)
        .navigationBarHidden(true)
        .ignoresSafeArea()
        .animation(.easeInOut(duration: 0.2), value: isLoading)
        .task {
            // Bundled sites count as "cached" — always available
            let hasBundled = DemoSiteCache.shared.bundledURL(for: domain) != nil
            let hasDownloaded = await DemoSiteCache.shared.isCached(domain: domain)
            isCached = hasBundled || hasDownloaded
            // Background-download full site if online and not yet downloaded
            if network.isOnline && !hasDownloaded {
                await forceCache()
            }
        }

        // Exit confirmation
        .confirmationDialog("Exit demo?", isPresented: $showExitConfirm, titleVisibility: .visible) {
            Button("Exit to Dashboard", role: .destructive) { dismiss() }
            Button("Stay in Demo", role: .cancel) {}
        } message: {
            Text("The client won't see the dashboard.")
        }

        // "Get This Website" sheet
        .sheet(isPresented: $showCTASheet) {
            GetWebsiteSheet(businessName: businessName)
        }

        // Share sheet — always shares the salespatch.co.uk/preview URL so the
        // customer lands on our payment page (not the raw Supabase demo URL).
        .sheet(isPresented: $showShareSheet, onDismiss: { stopPolling() }) {
            DemoShareSheet(
                businessName: businessName,
                demoURL: shareURL
            )
            .onAppear { startPolling() }
        }

        // Celebratory paid overlay — full-screen "✓ Paid · £X" state once the
        // webhook has flipped the lead to sold and the polling task picked it
        // up. Auto-dismisses the share sheet first.
        .fullScreenCover(isPresented: $isPaid) {
            PaidCelebrationView(
                businessName: businessName,
                commissionPence: commissionEarnedPence ?? 0,
                onClose: {
                    isPaid = false
                    dismiss()
                }
            )
        }
    }

    // MARK: — Polling

    private func startPolling() {
        pollingTask?.cancel()
        pollingTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 3_000_000_000) // 3s
                guard !Task.isCancelled else { break }
                if let r = try? await APIClient.shared.fetchLeadStatus(id: leadAssignmentId),
                   r.status == "sold" {
                    await MainActor.run {
                        commissionEarnedPence = r.commission_amount_pence
                            ?? Int(((r.commission_amount ?? 0) * 100).rounded())
                        showShareSheet = false   // dismiss QR sheet
                        isPaid = true            // present celebration
                    }
                    break
                }
            }
        }
    }

    private func stopPolling() {
        pollingTask?.cancel()
        pollingTask = nil
    }

    private func forceCache() async {
        isCaching = true
        await DemoSiteCache.shared.cache(domain: domain)
        isCached = await DemoSiteCache.shared.isCached(domain: domain)
        isCaching = false
    }
}

// MARK: — Get Website Sheet
// Shown when owner taps the CTA. Salesman captures their interest.

private struct GetWebsiteSheet: View {
    let businessName: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()

                VStack(alignment: .leading, spacing: 0) {
                    // Header
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Perfect.")
                            .font(.system(size: 32, weight: .bold))
                            .foregroundStyle(.white)
                        Text("Here's how \(businessName) gets online in 48 hours.")
                            .font(.system(size: 16))
                            .foregroundStyle(.white.opacity(0.6))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 32)
                    .padding(.bottom, 32)

                    // Steps
                    VStack(spacing: 0) {
                        StepRow(number: "01", title: "We finalise your design today", detail: "You've already seen it — we just personalise the copy and photos.")
                        stepDivider
                        StepRow(number: "02", title: "Goes live within 48 hours", detail: "We handle everything. Domain, hosting, mobile-optimised. You don't touch a thing.")
                        stepDivider
                        StepRow(number: "03", title: "£299 one-off, £29/month hosting", detail: "No hidden fees. Cancel any time. Most businesses see their first new customer within a week.")
                    }
                    .background(Color(hex: "#0a0a0a"))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color(hex: "#333333"), lineWidth: 1)
                    )
                    .padding(.horizontal, 24)

                    Spacer()

                    // Action
                    VStack(spacing: 10) {
                        Button(action: { dismiss() }) {
                            HStack(spacing: 8) {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.system(size: 14))
                                Text("They're interested — mark as Pitched")
                                    .font(.system(size: 15, weight: .semibold))
                            }
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(Color(hex: "#0070F3"))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                        .buttonStyle(.plain)

                        Button("Not right now") { dismiss() }
                            .font(.system(size: 14))
                            .foregroundStyle(Color(hex: "#666666"))
                    }
                    .padding(.horizontal, 24)
                    .padding(.bottom, 32)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: { dismiss() }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Color(hex: "#666666"))
                    }
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private var stepDivider: some View {
        Rectangle()
            .fill(Color(hex: "#333333"))
            .frame(height: 1)
            .padding(.horizontal, 16)
    }
}

private struct StepRow: View {
    let number: String
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Text(number)
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .foregroundStyle(Color(hex: "#0070F3"))
                .frame(width: 26, height: 26)
                .background(Color(hex: "#0070F3").opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color(hex: "#0070F3").opacity(0.2), lineWidth: 1)
                )

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                Text(detail)
                    .font(.system(size: 13))
                    .foregroundStyle(Color(hex: "#999999"))
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer()
        }
        .padding(16)
    }
}

// MARK: — ClientWebView
// Loads bundled HTML first (instant, offline-safe), falls back to live URL.

private struct ClientWebView: UIViewRepresentable {
    let domain: String
    @Binding var isLoading: Bool
    @ObservedObject var network: NetworkMonitor

    func makeCoordinator() -> Coordinator { Coordinator(isLoading: $isLoading) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.bounces = false
        webView.scrollView.showsVerticalScrollIndicator = false
        webView.scrollView.showsHorizontalScrollIndicator = false
        webView.backgroundColor = .black
        webView.isOpaque = false

        // Load synchronously in makeUIView — avoids async race with SwiftUI
        loadContent(into: webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        // No-op: content loaded once in makeUIView
    }

    private func loadContent(into webView: WKWebView) {
        // 1. Try bundled HTML file first — always available, instant
        if let bundledURL = DemoSiteCache.shared.bundledURL(for: domain) {
            let dir = bundledURL.deletingLastPathComponent()
            webView.loadFileURL(bundledURL, allowingReadAccessTo: dir)
            return
        }
        // 2. Try downloaded cache
        if let cachedURL = DemoSiteCache.shared.localURLSync(for: domain) {
            let dir = cachedURL.deletingLastPathComponent()
            webView.loadFileURL(cachedURL, allowingReadAccessTo: dir)
            return
        }
        // 3. Live URL if online — short timeout so an unresolvable domain
        //    (common for test leads) fails fast instead of spinning 30s.
        //    Handle both "bare.domain.com" and a full "https://…" URL
        //    (admin may stash the Supabase Storage URL directly).
        if network.isOnline {
            let urlString = domain.lowercased().hasPrefix("http")
                ? domain
                : "https://\(domain)"
            if let url = URL(string: urlString) {
                var req = URLRequest(url: url)
                req.timeoutInterval = 8
                webView.load(req)
                return
            }
        }
        // 4. Nothing available
        webView.loadHTMLString(notAvailableHTML, baseURL: nil)
    }

    private var notAvailableHTML: String {
        """
        <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>
          body{background:rgb(20,20,19);color:rgb(210,200,185);
            font-family:-apple-system,sans-serif;
            display:flex;align-items:center;justify-content:center;
            height:100vh;margin:0;flex-direction:column;gap:12px;
            text-align:center;padding:40px;}
          h2{color:rgb(248,244,238);font-size:22px;margin:0;letter-spacing:-0.02em;}
          p{font-size:14px;max-width:300px;line-height:1.5;margin:0;}
          .tag{font-family:ui-monospace,monospace;font-size:10px;letter-spacing:0.14em;
            color:rgb(184,134,11);text-transform:uppercase;}
        </style></head><body>
        <div class="tag">/ DEMO UNAVAILABLE</div>
        <h2>This demo hasn't been uploaded yet.</h2>
        <p>Ask admin to upload the HTML for this lead via the web portal.
          The demo will then render even with no signal.</p>
        </body></html>
        """
    }

    class Coordinator: NSObject, WKNavigationDelegate {
        @Binding var isLoading: Bool
        private weak var lastWebView: WKWebView?
        private var hasFallenBack = false

        init(isLoading: Binding<Bool>) { _isLoading = isLoading }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation _: WKNavigation!) {
            lastWebView = webView
            isLoading = true
        }
        func webView(_ webView: WKWebView, didFinish _: WKNavigation!) {
            isLoading = false
            hasFallenBack = false
        }
        func webView(_ webView: WKWebView, didFail _: WKNavigation!, withError _: Error) {
            showFallback(in: webView)
        }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation _: WKNavigation!, withError _: Error) {
            showFallback(in: webView)
        }

        /// When the live URL fails (DNS miss / timeout / 404 with no body),
        /// the webview is otherwise left blank and shows as black. Replace
        /// with a clear "demo unavailable" page.
        private func showFallback(in webView: WKWebView) {
            guard !hasFallenBack else { isLoading = false; return }
            hasFallenBack = true
            webView.loadHTMLString(ClientWebView.fallbackHTML, baseURL: nil)
            // isLoading stays true until the fallback load finishes —
            // didFinish will flip it false.
        }
    }

    /// Static fallback HTML — separate from instance-level `notAvailableHTML`
    /// so the Coordinator (which doesn't have a ClientPresentationView
    /// reference) can use it directly.
    fileprivate static let fallbackHTML: String = """
    <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      body{background:rgb(20,20,19);color:rgb(210,200,185);
        font-family:-apple-system,sans-serif;
        display:flex;align-items:center;justify-content:center;
        height:100vh;margin:0;flex-direction:column;gap:12px;
        text-align:center;padding:40px;}
      h2{color:rgb(248,244,238);font-size:22px;margin:0;letter-spacing:-0.02em;}
      p{font-size:14px;max-width:300px;line-height:1.5;margin:0;}
      .tag{font-family:ui-monospace,monospace;font-size:10px;letter-spacing:0.14em;
        color:rgb(184,134,11);text-transform:uppercase;}
    </style></head><body>
    <div class="tag">/ DEMO UNAVAILABLE</div>
    <h2>This demo hasn't been uploaded yet.</h2>
    <p>Ask admin to upload the HTML for this lead via the web portal.
      The demo will then render even with no signal.</p>
    </body></html>
    """
}

#Preview {
    ClientPresentationView(
        domain: "barber-co.salesflow.site",
        businessName: "Barber & Co",
        leadAssignmentId: "preview-lead-id"
    )
}
