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
            // Send the raw JSON we stored at enqueue time. No round-trip
            // back through Decodable — the body is already a verbatim
            // copy of what JSONEncoder produced from the original
            // typed payload.
            guard let data = pending.payloadJson.data(using: .utf8) else {
                modelContext.delete(pending)
                continue
            }

            pending.lastTriedAt = .now
            pending.retryCount += 1

            do {
                _ = try await APIClient.shared.recordPitchRaw(
                    assignmentId: pending.assignmentId,
                    jsonBody: data
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
        // Use fetch().count rather than fetchCount() for iOS 17 compat —
        // fetchCount is iOS 18+. The queue stays small (single SP, few
        // pending pitches at most), so the full fetch is fine.
        let descriptor = FetchDescriptor<PendingPitch>()
        pendingCount = (try? modelContext.fetch(descriptor).count) ?? 0
    }
}

// (No Decodable extension on PitchPayload — the queue stores the raw
// JSON string verbatim and re-sends it via APIClient.recordPitchRaw,
// avoiding cross-file Codable synthesis on a nested type which trips
// the Swift compiler.)
