import Foundation

// MARK: — APIClient
final class APIClient {
    static let shared = APIClient()

    // Simulator → localhost, device → Mac via Tailscale (dev), Pi (production)
    // To switch to production: change device URL to http://100.93.24.14:4350
    #if targetEnvironment(simulator)
    private let baseURL = "http://localhost:4350"
    #else
    private let baseURL = "http://100.66.206.3:4350"  // Mac Tailscale IP (dev)
    #endif

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

    // MARK: — Auth
    func login(name: String, pin: String) async throws -> LoginResponse {
        struct Body: Encodable { let name: String; let pin: String }
        let data = try await request(path: "/auth/login", method: "POST", body: Body(name: name, pin: pin))
        return try decoder.decode(LoginResponse.self, from: data)
    }

    func checkNameAvailable(name: String) async throws -> Bool {
        let encoded = name.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? name
        let data = try await request(path: "/auth/check-name?name=\(encoded)")
        struct Response: Decodable { let available: Bool }
        return try decoder.decode(Response.self, from: data).available
    }

    func signup(name: String, pin: String, phone: String, area: String) async throws -> LoginResponse {
        struct Body: Encodable { let name: String; let pin: String; let phone: String; let area_postcode: String }
        let data = try await request(path: "/auth/register", method: "POST", body: Body(name: name, pin: pin, phone: phone, area_postcode: area))
        return try decoder.decode(LoginResponse.self, from: data)
    }

    // MARK: — Training / Academy
    func fetchTrainingUnits() async throws -> [TrainingUnit] {
        let data = try await request(path: "/training")
        return try decoder.decode(TrainingUnitsResponse.self, from: data).units
    }

    func fetchTrainingUnit(id: String) async throws -> TrainingUnitDetailResponse {
        let data = try await request(path: "/training/\(id)")
        return try decoder.decode(TrainingUnitDetailResponse.self, from: data)
    }

    func startTrainingUnit(id: String) async throws {
        _ = try await request(path: "/training/\(id)/start", method: "POST")
    }

    func respondToScenario(unitId: String, lessonIndex: Int, scenarioId: String, option: String, score: Int) async throws {
        struct Body: Encodable { let lesson_index: Int; let scenario_id: String; let selected_option: String; let score: Int }
        _ = try await request(path: "/training/\(unitId)/respond", method: "POST",
                              body: Body(lesson_index: lessonIndex, scenario_id: scenarioId, selected_option: option, score: score))
    }

    func completeTrainingUnit(id: String) async throws {
        _ = try await request(path: "/training/\(id)/complete", method: "POST")
    }

    // MARK: — Leads
    func fetchLeads() async throws -> [LeadDTO] {
        let data = try await request(path: "/leads")
        return try decoder.decode(LeadsResponse.self, from: data).leads
    }

    func fetchLead(id: String) async throws -> LeadDTO {
        let data = try await request(path: "/leads/\(id)")
        return try decoder.decode(LeadDTO.self, from: data)
    }

    func updateLeadStatus(id: String, status: String, lat: Double? = nil, lng: Double? = nil) async throws {
        let body = StatusUpdateRequest(status: status, lat: lat, lng: lng)
        _ = try await request(path: "/leads/\(id)/status", method: "PATCH", body: body)
    }

    func postVisit(id: String, action: String, lat: Double, lng: Double) async throws {
        let body = VisitRequest(action: action, lat: lat, lng: lng)
        _ = try await request(path: "/leads/\(id)/visit", method: "POST", body: body)
    }

    func uploadPhoto(leadId: String, imageData: Data, category: String, lat: Double?, lng: Double?) async throws {
        guard let url = URL(string: baseURL + "/leads/\(leadId)/photos") else { throw URLError(.badURL) }
        let boundary = "Boundary-\(UUID().uuidString)"
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if let tok = token { req.setValue("Bearer \(tok)", forHTTPHeaderField: "Authorization") }

        var body = Data()
        func append(_ string: String) { body.append(Data(string.utf8)) }
        // category field
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"category\"\r\n\r\n")
        append("\(category)\r\n")
        // photo field
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"photo\"; filename=\"photo.jpg\"\r\n")
        append("Content-Type: image/jpeg\r\n\r\n")
        body.append(imageData)
        append("\r\n--\(boundary)--\r\n")
        req.httpBody = body

        let (_, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw SalesFlowError.server("Photo upload failed")
        }
    }

    // MARK: — Leaderboard
    func fetchLeaderboard(period: String = "alltime") async throws -> [LeaderboardEntry] {
        let data = try await request(path: "/leaderboard?period=\(period)")
        return try decoder.decode(LeaderboardResponse.self, from: data).rankings
    }

    // MARK: — Stats
    func fetchStats() async throws -> Stats {
        let data = try await request(path: "/stats")
        return try decoder.decode(Stats.self, from: data)
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

// MARK: — Error type
enum SalesFlowError: LocalizedError {
    case server(String)
    case offline

    var errorDescription: String? {
        switch self {
        case .server(let msg): return msg
        case .offline: return "You are offline. Changes will sync when you reconnect."
        }
    }
}
