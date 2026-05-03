import Foundation
import SwiftData
import Combine

// MARK: — PendingPitch (SwiftData persistent queue)
//
// Every post-pitch questionnaire submission is written here BEFORE the
// network call. That way:
//   - The submit feels instant (UI dismisses immediately)
//   - Bad signal in shops never loses data
//   - Background flush sweeps the queue when the network returns
//
// On successful POST the row is deleted. On failure it stays for retry.

@Model
final class PendingPitch {
    @Attribute(.unique) var id: String
    var assignmentId: String
    var businessName: String
    /// JSON-encoded APIClient.PitchPayload
    var payloadJson: String
    var createdAt: Date
    var lastTriedAt: Date?
    var lastError: String?
    var retryCount: Int

    init(
        id: String = UUID().uuidString,
        assignmentId: String,
        businessName: String,
        payloadJson: String,
        createdAt: Date = .now,
        lastTriedAt: Date? = nil,
        lastError: String? = nil,
        retryCount: Int = 0
    ) {
        self.id = id
        self.assignmentId = assignmentId
        self.businessName = businessName
        self.payloadJson = payloadJson
        self.createdAt = createdAt
        self.lastTriedAt = lastTriedAt
        self.lastError = lastError
        self.retryCount = retryCount
    }
}

// MARK: — PitchQueue actor
//
// Single-writer access pattern: any caller can `enqueue` or `flush`,
// the actor serialises work and walks the SwiftData store. Public
// `pendingCount` lets the UI show a badge.

@MainActor
final class PitchQueue: ObservableObject {
    static let shared = PitchQueue()

    @Published private(set) var pendingCount: Int = 0
    @Published private(set) var isFlushing: Bool = false

    private var modelContext: ModelContext?
    private var flushTask: Task<Void, Never>?

    private init() {}

    func bind(_ context: ModelContext) {
        self.modelContext = context
        refreshCount()
    }

    /// Save a pitch to the queue and immediately attempt to send it.
    /// Returns the PendingPitch id so the caller can track its outcome.
    @discardableResult
    func enqueue(
        assignmentId: String,
        businessName: String,
        payload: APIClient.PitchPayload
    ) -> String {
        guard let modelContext else { return "" }
        let id = UUID().uuidString
        let json = (try? JSONEncoder().encode(payload)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        let pending = PendingPitch(
            id: id,
            assignmentId: assignmentId,
            businessName: businessName,
            payloadJson: json
        )
        modelContext.insert(pending)
        try? modelContext.save()
        refreshCount()
        // Kick off a flush in the background — the UI doesn't wait.
        flush()
        return id
    }

    /// Walk every queued pitch and try to send each. Successful ones
    /// are deleted; failures stay with their lastError stamped.
    func flush() {
        flushTask?.cancel()
        flushTask = Task { [weak self] in
            guard let self else { return }
            await self.runFlush()
        }
    }

    private func runFlush() async {
        guard !isFlushing, let modelContext else { return }
        isFlushing = true
        defer {
            isFlushing = false
            refreshCount()
        }

        let descriptor = FetchDescriptor<PendingPitch>(sortBy: [SortDescriptor(\.createdAt, order: .forward)])
        guard let queue = try? modelContext.fetch(descriptor) else { return }

        for pending in queue {
            // Decode the payload back into a typed PitchPayload.
            guard
                let data = pending.payloadJson.data(using: .utf8),
                let payload = try? JSONDecoder().decode(APIClient.PitchPayload.self, from: data)
            else {
                // Corrupt entry — drop it rather than block the queue.
                modelContext.delete(pending)
                continue
            }

            pending.lastTriedAt = .now
            pending.retryCount += 1

            do {
                _ = try await APIClient.shared.recordPitch(
                    assignmentId: pending.assignmentId,
                    payload: payload
                )
                modelContext.delete(pending)
            } catch {
                pending.lastError = error.localizedDescription
                // Stop the flush on first failure — likely the network
                // is gone, no point hammering the rest of the queue.
                break
            }
        }
        try? modelContext.save()
    }

    private func refreshCount() {
        guard let modelContext else { return }
        let descriptor = FetchDescriptor<PendingPitch>()
        pendingCount = (try? modelContext.fetchCount(descriptor)) ?? 0
    }
}

// MARK: — Codable conformance for the PitchPayload
//
// PitchPayload is declared as `Encodable` only; we extend it to
// `Decodable` here so the queue can round-trip it through JSON.

extension APIClient.PitchPayload: Decodable {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        outcome = try c.decode(String.self, forKey: .outcome)
        pitch_duration_seconds = try c.decodeIfPresent(Int.self, forKey: .pitch_duration_seconds)
        demo_version = try c.decodeIfPresent(String.self, forKey: .demo_version)
        decision_maker_present = try c.decodeIfPresent(Bool.self, forKey: .decision_maker_present)
        demo_shown = try c.decodeIfPresent(Bool.self, forKey: .demo_shown)
        interest_level = try c.decodeIfPresent(String.self, forKey: .interest_level)
        consent_to_record = try c.decode(Bool.self, forKey: .consent_to_record)
        demo_reaction = try c.decodeIfPresent(String.self, forKey: .demo_reaction)
        agreed_price = try c.decodeIfPresent(Double.self, forKey: .agreed_price)
        payment_method = try c.decodeIfPresent(String.self, forKey: .payment_method)
        best_followup_time = try c.decodeIfPresent(String.self, forKey: .best_followup_time)
        agreed_next_step = try c.decodeIfPresent(String.self, forKey: .agreed_next_step)
        objections = try c.decodeIfPresent([String].self, forKey: .objections)
        gut_feel_close_pct = try c.decodeIfPresent(Int.self, forKey: .gut_feel_close_pct)
        first_response_phrase = try c.decodeIfPresent(String.self, forKey: .first_response_phrase)
        competitor_mentioned = try c.decodeIfPresent(String.self, forKey: .competitor_mentioned)
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
        gps_lat = try c.decodeIfPresent(Double.self, forKey: .gps_lat)
        gps_lng = try c.decodeIfPresent(Double.self, forKey: .gps_lng)
        pitched_at = try c.decode(String.self, forKey: .pitched_at)
    }

    private enum CodingKeys: String, CodingKey {
        case outcome
        case pitch_duration_seconds
        case demo_version
        case decision_maker_present
        case demo_shown
        case interest_level
        case consent_to_record
        case demo_reaction
        case agreed_price
        case payment_method
        case best_followup_time
        case agreed_next_step
        case objections
        case gut_feel_close_pct
        case first_response_phrase
        case competitor_mentioned
        case notes
        case gps_lat
        case gps_lng
        case pitched_at
    }
}
