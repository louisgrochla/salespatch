import Foundation
import SwiftUI
import Network
import Combine

// MARK: — DemoSiteCache
// Downloads and stores demo sites locally for offline viewing.
// Each site is cached under Caches/demosites/<domain>/
// Assets (CSS, JS, images) are downloaded and URL-rewritten in the HTML.

actor DemoSiteCache {
    static let shared = DemoSiteCache()

    private let cacheRoot: URL = {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let root = caches.appendingPathComponent("demosites", isDirectory: true)
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root
    }()

    private var inProgress: Set<String> = []

    // MARK: — Public API

    /// Returns the best local URL for a domain:
    /// 1. Downloaded cache (most up-to-date)
    /// 2. Bundled HTML file (always available, no network needed)
    /// 3. nil (need network)
    func localURL(for domain: String) -> URL? {
        // Check downloaded cache first
        let cached = siteDir(for: domain).appendingPathComponent("index.html")
        if FileManager.default.fileExists(atPath: cached.path) { return cached }
        // Fall back to bundled demo
        return bundledURL(for: domain)
    }

    /// Returns the URL of a bundled HTML file for a domain, if one exists.
    nonisolated func bundledURL(for domain: String) -> URL? {
        // Map domain prefix to bundled filename
        // e.g. "barber-co.salesflow.site" -> "barber-co"
        let filename = domain.components(separatedBy: ".").first ?? domain
        return Bundle.main.url(forResource: filename, withExtension: "html")
    }

    /// Caches the site if not already cached. Safe to call multiple times.
    func cache(domain: String) async {
        guard !inProgress.contains(domain) else { return }
        guard localURL(for: domain) == nil else { return } // already cached
        inProgress.insert(domain)
        defer { inProgress.remove(domain) }

        await downloadSite(domain: domain)
    }

    /// Force-refreshes the cache for a domain (call when online after a stale cache).
    func refresh(domain: String) async {
        clearCache(for: domain)
        await downloadSite(domain: domain)
    }

    /// Save a pre-built HTML blob (uploaded via admin) directly to the cache.
    /// This is the primary offline path — admin-uploaded HTML bypasses the
    /// live-domain scrape entirely, so the demo works the moment the lead
    /// detail is fetched even on the worst signal.
    ///
    /// Safe to call repeatedly — each call overwrites the file with the
    /// latest blob from the server, so admin edits propagate on next
    /// detail fetch.
    nonisolated func saveHTML(_ html: String, for domain: String) {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let dir = caches
            .appendingPathComponent("demosites", isDirectory: true)
            .appendingPathComponent(Self.cacheKey(for: domain), isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let indexPath = dir.appendingPathComponent("index.html")
        try? html.write(to: indexPath, atomically: true, encoding: .utf8)
    }

    /// True if a local cache exists for this domain.
    func isCached(domain: String) -> Bool {
        localURL(for: domain) != nil
    }

    /// Synchronous (non-actor-isolated) check of the downloaded cache only.
    /// Safe to call from UIKit/makeUIView context.
    nonisolated func localURLSync(for domain: String) -> URL? {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let index = caches
            .appendingPathComponent("demosites")
            .appendingPathComponent(Self.cacheKey(for: domain))
            .appendingPathComponent("index.html")
        return FileManager.default.fileExists(atPath: index.path) ? index : nil
    }

    /// Filesystem-safe key derived from a domain or URL. Replaces every
    /// non-alphanumeric character with `_` so URLs like
    /// `https://project.supabase.co/storage/v1/object/public/demo-sites/11fable.html`
    /// still map to a single deterministic directory name.
    nonisolated static func cacheKey(for domain: String) -> String {
        let allowed = CharacterSet.alphanumerics
        let raw = domain.unicodeScalars.map { allowed.contains($0) ? Character($0) : "_" }
        return String(raw).prefix(200).description
    }

    /// Fetches HTML from a URL (typically a Supabase Storage public URL
    /// stashed in `demo_site_domain`) and saves it to the local cache.
    /// Idempotent — safe to call every time the lead detail opens.
    nonisolated func cacheFromURL(_ urlString: String) async {
        guard let url = URL(string: urlString) else { return }
        var req = URLRequest(url: url)
        req.timeoutInterval = 10
        guard let (data, response) = try? await URLSession.shared.data(for: req) else { return }
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) { return }
        guard let html = String(data: data, encoding: .utf8)
                       ?? String(data: data, encoding: .isoLatin1)
        else { return }
        saveHTML(html, for: urlString)
    }

    /// Removes cached files for a domain.
    func clearCache(for domain: String) {
        let dir = siteDir(for: domain)
        try? FileManager.default.removeItem(at: dir)
    }

    // MARK: — Download

    private func downloadSite(domain: String) async {
        let url = URL(string: "https://\(domain)")!
        let dir = siteDir(for: domain)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

        // 1. Fetch main HTML
        guard let (htmlData, _) = try? await URLSession.shared.data(from: url),
              var html = String(data: htmlData, encoding: .utf8) ?? String(data: htmlData, encoding: .isoLatin1)
        else { return }

        // 2. Extract and download assets
        let assetURLs = extractAssetURLs(from: html, base: url)
        var urlToLocal: [String: String] = [:]

        await withTaskGroup(of: (String, String?)?.self) { group in
            for assetURL in assetURLs {
                group.addTask {
                    guard let (data, _) = try? await URLSession.shared.data(from: assetURL) else {
                        return nil
                    }
                    let filename = self.safeFilename(for: assetURL)
                    let localPath = dir.appendingPathComponent(filename)
                    try? data.write(to: localPath)
                    return (assetURL.absoluteString, filename)
                }
            }
            for await result in group {
                if let (original, local) = result {
                    urlToLocal[original] = local
                }
            }
        }

        // 3. Rewrite HTML asset references to relative local paths
        for (original, local) in urlToLocal {
            html = html.replacingOccurrences(of: original, with: local)
            // Also rewrite protocol-relative URLs
            if original.hasPrefix("https://") {
                html = html.replacingOccurrences(
                    of: original.replacingOccurrences(of: "https://", with: "//"),
                    with: local
                )
            }
        }

        // 4. Write rewritten HTML
        let indexPath = dir.appendingPathComponent("index.html")
        try? html.write(to: indexPath, atomically: true, encoding: .utf8)
    }

    // MARK: — Asset extraction

    private func extractAssetURLs(from html: String, base: URL) -> [URL] {
        var urls: [URL] = []

        // Patterns that reference external assets
        let patterns = [
            #"href=[\"']([^\"']+\.css[^\"']*)[\"']"#,
            #"src=[\"']([^\"']+\.js[^\"']*)[\"']"#,
            #"src=[\"']([^\"']+\.(?:png|jpg|jpeg|gif|webp|svg|ico)[^\"']*)[\"']"#,
            #"url\([\"']?([^\"')]+\.(?:png|jpg|jpeg|gif|webp|svg|woff2?|ttf|eot)[^\"')]*)[\"']?\)"#,
        ]

        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) else { continue }
            let range = NSRange(html.startIndex..., in: html)
            let matches = regex.matches(in: html, range: range)
            for match in matches {
                guard let captureRange = Range(match.range(at: 1), in: html) else { continue }
                let raw = String(html[captureRange])
                if let resolved = resolveURL(raw, base: base) {
                    urls.append(resolved)
                }
            }
        }

        return Array(Set(urls)) // deduplicate
    }

    private func resolveURL(_ raw: String, base: URL) -> URL? {
        if raw.hasPrefix("data:") || raw.hasPrefix("#") { return nil }
        if raw.hasPrefix("http://") || raw.hasPrefix("https://") {
            return URL(string: raw)
        }
        if raw.hasPrefix("//") {
            return URL(string: "https:" + raw)
        }
        return URL(string: raw, relativeTo: base)?.absoluteURL
    }

    nonisolated private func safeFilename(for url: URL) -> String {
        // Turn the URL path into a safe flat filename
        let path = url.path.replacingOccurrences(of: "/", with: "_")
        let query = url.query.map { "_\($0)" } ?? ""
        let raw = (path + query)
            .replacingOccurrences(of: "?", with: "_")
            .replacingOccurrences(of: "&", with: "_")
            .replacingOccurrences(of: "=", with: "_")
        // Preserve extension
        let ext = url.pathExtension.isEmpty ? "" : ""
        let _ = ext
        return String(raw.prefix(120))
    }

    private func siteDir(for domain: String) -> URL {
        cacheRoot.appendingPathComponent(Self.cacheKey(for: domain), isDirectory: true)
    }
}

// MARK: — Network monitor

final class NetworkMonitor: ObservableObject {
    static let shared = NetworkMonitor()
    @Published private(set) var isOnline = true

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "NetworkMonitor")

    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                self?.isOnline = path.status == .satisfied
            }
        }
        monitor.start(queue: queue)
    }
}
