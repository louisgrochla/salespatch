import Foundation

// MARK: — APIClient
//
// Talks to the sales-dashboard Next.js API at
// https://salesflow-sigma.vercel.app/api. All endpoints wrap responses in
// `{ data: ... }` (`ApiSuccess<T>` on the server side), which we peel here.
//
// Auth: tokens come back from /auth/login, /auth/signup, /auth/demo and are
// sent on subsequent requests via `Authorization: Bearer <token>` —
// `resolveUserFromRequest` on the server accepts that as the mobile path.
//
// Override the base URL at launch (e.g. to hit `vercel dev` on a laptop) by
// setting `UserDefaults.standard.string(forKey: "apiBaseURL")` before the
// first request.

final class APIClient {
    static let shared = APIClient()

    private let defaultBaseURL = "https://salesflow-sigma.vercel.app/api"

    private var baseURL: String {
        UserDefaults.standard.string(forKey: "apiBaseURL") ?? defaultBaseURL
    }

    // Sales-dashboard (Next.js) base URL — different host from mobile-api.
    // Used for customer-facing payment endpoints (`/api/payments/*`) which
    // live in the dashboard app. Same Bearer token (HMAC over SD_SECRET) works
    // on both hosts.
    #if targetEnvironment(simulator)
    private let dashboardBaseURL = "http://localhost:4300"
    #else
    private let dashboardBaseURL = "https://salespatch.co.uk"
    #endif

    var token: String?

    private var decoder: JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }

    // ───────────── Envelope ─────────────

    private struct Envelope<T: Decodable>: Decodable {
        let data: T
    }

    // ───────────── Low-level request ─────────────

    private func request(
        path: String,
        method: String = "GET",
        body: (any Encodable)? = nil
    ) async throws -> Data {
        guard let url = URL(string: baseURL + path) else {
            throw URLError(.badURL)
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let tok = token {
            req.setValue("Bearer \(tok)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            req.httpBody = try JSONEncoder().encode(body)
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        if !(200..<300).contains(http.statusCode) {
            let msg = (try? decoder.decode(APIError.self, from: data))?.error ?? "HTTP \(http.statusCode)"
            throw SalesFlowError.server(msg)
        }
        return data
    }

    /// Hits an endpoint, decodes `{ data: T }` and returns `T`.
    private func requestEnvelope<T: Decodable>(
        path: String,
        method: String = "GET",
        body: (any Encodable)? = nil
    ) async throws -> T {
        let data = try await request(path: path, method: method, body: body)
        return try decoder.decode(Envelope<T>.self, from: data).data
    }

    // ───────────── Auth ─────────────

    struct LoginPayload: Decodable {
        let user: User?
        let token: String
    }

    func login(name: String, pin: String) async throws -> LoginPayload {
        struct Body: Encodable { let name: String; let pin: String }
        return try await requestEnvelope(
            path: "/auth/login",
            method: "POST",
            body: Body(name: name, pin: pin)
        )
    }

    /// Idempotent demo login — creates / updates the "Demo Account" user and
    /// returns a valid session. Used in DEBUG bootstrapping and from the
    /// "Use demo account" button.
    func demoLogin() async throws -> LoginPayload {
        return try await requestEnvelope(path: "/auth/demo", method: "POST")
    }

    func signup(name: String, pin: String, phone: String, area: String) async throws -> LoginPayload {
        struct Body: Encodable {
            let name: String
            let pin: String
            let phone: String
            let area_postcode: String
        }
        return try await requestEnvelope(
            path: "/auth/signup",
            method: "POST",
            body: Body(name: name, pin: pin, phone: phone, area_postcode: area)
        )
    }

    /// No separate name-check endpoint on the server; signup returns 409 if
    /// the name is taken. This stub keeps existing call sites compiling.
    func checkNameAvailable(name: String) async throws -> Bool { true }

    func fetchMe() async throws -> User {
        return try await requestEnvelope(path: "/auth/me")
    }

    // ───────────── Leads ─────────────

    func fetchLeads() async throws -> [LeadDTO] {
        return try await requestEnvelope(path: "/leads")
    }

    func fetchLead(id: String) async throws -> LeadDTO {
        return try await requestEnvelope(path: "/leads/\(id)")
    }

    func updateLeadStatus(id: String, status: String, lat: Double? = nil, lng: Double? = nil) async throws {
        struct Body: Encodable {
            let status: String
            let location_lat: Double?
            let location_lng: Double?
        }
        _ = try await request(
            path: "/leads/\(id)/status",
            method: "PATCH",
            body: Body(status: status, location_lat: lat, location_lng: lng)
        )
    }

    /// No `/leads/{id}/visit` endpoint on the web API — visit tracking on the
    /// server is inferred from the `visited_at` timestamp set when status
    /// transitions to `visited`. We keep the signature so existing call
    /// sites compile; the local timer still drives UX.
    func postVisit(id: String, action: String, lat: Double, lng: Double) async throws {
        // Intentionally no-op.
    }

    // ───────────── Stats ─────────────

    func fetchStats() async throws -> Stats {
        return try await requestEnvelope(path: "/stats")
    }

    // ───────────── Training / Leaderboard / Photos ─────────────
    //
    // These endpoints exist in the old OpenClaw runtime but not in the
    // Vercel API. They throw so the dependent screens show a clear error
    // rather than silently failing. Re-implement when the server catches up.

    func fetchTrainingUnits() async throws -> [TrainingUnit] {
        throw SalesFlowError.unavailable
    }

    func fetchTrainingUnit(id: String) async throws -> TrainingUnitDetailResponse {
        throw SalesFlowError.unavailable
    }

    func startTrainingUnit(id: String) async throws {
        throw SalesFlowError.unavailable
    }

    func respondToScenario(unitId: String, lessonIndex: Int, scenarioId: String, option: String, score: Int) async throws {
        throw SalesFlowError.unavailable
    }

    func completeTrainingUnit(id: String) async throws {
        throw SalesFlowError.unavailable
    }

    func fetchLeaderboard(period: String = "alltime") async throws -> [LeaderboardEntry] {
        throw SalesFlowError.unavailable
    }

    func uploadPhoto(leadId: String, imageData: Data, category: String, lat: Double?, lng: Double?) async throws {
        throw SalesFlowError.unavailable
    }

    // MARK: — Payments
    // Eager Stripe Checkout session creation. Body is { lead_id }, where
    // lead_id is the lead_assignment.id. Backend creates (or reuses) an
    // active session and returns the customer-facing preview URL plus the
    // direct Stripe Checkout URL.
    //
    // Hits the sales-dashboard host (dashboardBaseURL), NOT the mobile-api.
    // Returns: preview_url, checkout_url, session_id, session_expires_at.
    func createCheckout(leadId: String) async throws -> CreateCheckoutResponse {
        guard let url = URL(string: dashboardBaseURL + "/api/payments/create-checkout") else {
            throw URLError(.badURL)
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let tok = token {
            req.setValue("Bearer \(tok)", forHTTPHeaderField: "Authorization")
        }
        struct Body: Encodable { let lead_id: String }
        req.httpBody = try JSONEncoder().encode(Body(lead_id: leadId))

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        if !(200..<300).contains(http.statusCode) {
            let msg = (try? decoder.decode(APIError.self, from: data))?.error ?? "HTTP \(http.statusCode)"
            throw SalesFlowError.server(msg)
        }
        return try decoder.decode(CreateCheckoutResponse.self, from: data)
    }
}

// MARK: — Payments DTO

struct CreateCheckoutResponse: Decodable {
    let preview_url: String
    let checkout_url: String
    let session_id: String
    let session_expires_at: String
}

struct LeadStatusResponse: Decodable {
    let status: String                      // 'new' | 'visited' | 'pitched' | 'sold' | 'rejected'
    let sold_at: String?
    let commission_amount: Double?          // legacy, in pounds
    let commission_amount_pence: Int?       // canonical, in pence
}

extension APIClient {
    /// Slim status poll — used during the QR sheet to detect the sold
    /// transition. Hits the sales-dashboard so it sees the latest webhook
    /// state (mobile-api's SQLite copy lags).
    func fetchLeadStatus(id: String) async throws -> LeadStatusResponse {
        guard let url = URL(string: dashboardBaseURL + "/api/leads/\(id)/status") else {
            throw URLError(.badURL)
        }
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        if let tok = token {
            req.setValue("Bearer \(tok)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        if !(200..<300).contains(http.statusCode) {
            let msg = (try? decoder.decode(APIError.self, from: data))?.error ?? "HTTP \(http.statusCode)"
            throw SalesFlowError.server(msg)
        }
        return try decoder.decode(LeadStatusResponse.self, from: data)
    }
}

// MARK: — Errors

enum SalesFlowError: LocalizedError {
    case server(String)
    case offline
    case unavailable

    var errorDescription: String? {
        switch self {
        case .server(let msg): return msg
        case .offline:         return "You're offline. Changes will sync when you reconnect."
        case .unavailable:     return "This feature isn't available on the current server yet."
        }
    }
}
