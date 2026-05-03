import SwiftUI
import CoreLocation

// MARK: — PostPitchView
//
// Three-stage post-pitch questionnaire shown after the salesperson
// taps "Complete pitch" on a lead detail view. Designed to be quick:
// rejections take ~15 seconds, closes ~45 seconds. Anything the phone
// already knows (GPS, demo version, duration) is auto-captured rather
// than asked.
//
// Stage 1 — required (5 chips): outcome, decision-maker, demo shown,
// interest level, consent.
// Stage 2 — conditional: shows only branches relevant to the chosen
// outcome (objections, demo reaction, agreed price, follow-up time…).
// Stage 3 — optional gold (dismissable): notes, gut-feel, first
// response phrase, competitor.
//
// On submit POSTs to /leads/:id/pitch via APIClient.recordPitch.
// The mobile-api persists the row locally and forwards to NERVE.

struct PostPitchView: View {
    let assignmentId: String
    let businessName: String
    let demoVersion: String?
    let pitchStartedAt: Date?
    let onSubmitted: (PostPitchResult) -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var locationManager = LocationManager()

    // Stage progression — start at 0, advance via "Next".
    @State private var stage: Int = 0

    // ── Stage 1 (required)
    @State private var outcome: PitchOutcome? = nil
    @State private var decisionMakerPresent: Bool? = nil
    @State private var demoShown: Bool? = nil
    @State private var interestLevel: InterestLevel? = nil
    @State private var consentToRecord: Bool = false

    // ── Stage 2 (conditional)
    @State private var demoReaction: DemoReaction? = nil
    @State private var objections: Set<ObjectionTag> = []
    @State private var objectionOther: String = ""
    @State private var agreedPrice: String = "350"
    @State private var paymentMethod: PaymentMethod? = nil
    @State private var bestFollowupTime: FollowupTime? = nil
    @State private var agreedNextStep: AgreedNextStep? = nil

    // ── Stage 3 (optional)
    @State private var notes: String = ""
    @State private var gutFeelClosePct: Double = 50
    @State private var firstResponsePhrase: String = ""
    @State private var competitorMentioned: String = ""

    // ── Submission state
    @State private var submitting = false
    @State private var errorMessage: String? = nil

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    header

                    if stage == 0 { stage1Required }
                    if stage == 1 { stage2Conditional }
                    if stage == 2 { stage3Optional }

                    if let errorMessage {
                        Text(errorMessage)
                            .font(Brand.Font.mono(11))
                            .foregroundStyle(Color(hex: "#C0392B"))
                            .padding(.top, 4)
                    }
                }
                .padding(20)
                .padding(.bottom, 100)
            }
            .background(Brand.ink.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .overlay(alignment: .bottom) { stickyBar }
        }
        .interactiveDismissDisabled(stage > 0 || submitting)
    }

    // ── Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("/ POST-PITCH")
                    .font(Brand.Font.mono(10))
                    .tracking(Brand.Tracking.eyebrow)
                    .foregroundStyle(Brand.creamMuted)
                Spacer()
                Button("Cancel") { dismiss() }
                    .font(Brand.Font.mono(11))
                    .foregroundStyle(Brand.creamMuted)
                    .disabled(submitting)
            }
            Text(businessName)
                .font(Brand.Font.display(22, weight: .medium))
                .foregroundStyle(Brand.cream)
            HStack(spacing: 6) {
                stageDot(0); stageDot(1); stageDot(2)
                Spacer()
                if let dur = currentDurationLabel {
                    Text(dur)
                        .font(Brand.Font.mono(10))
                        .foregroundStyle(Brand.creamMuted)
                }
            }
            .padding(.top, 8)
        }
    }

    @ViewBuilder
    private func stageDot(_ i: Int) -> some View {
        Circle()
            .fill(i <= stage ? Brand.cream : Brand.line)
            .frame(width: 6, height: 6)
    }

    private var currentDurationLabel: String? {
        guard let start = pitchStartedAt else { return nil }
        let s = Int(Date().timeIntervalSince(start))
        return "\(s)s pitch"
    }

    // ── Stage 1: required

    private var stage1Required: some View {
        VStack(alignment: .leading, spacing: 20) {
            chipGroup(label: "Outcome (required)") {
                outcomeChip(.closedNow,        "closed now")
                outcomeChip(.closedFollowup,   "closed (follow-up)")
                outcomeChip(.followUp,         "follow up")
                outcomeChip(.rejected,         "rejected")
                outcomeChip(.notPitched,       "not pitched")
            }

            ynRow(label: "Decision-maker present?", value: $decisionMakerPresent)
            ynRow(label: "Demo shown?",             value: $demoShown)

            chipGroup(label: "Interest level") {
                interestChip(.cold, "cold")
                interestChip(.warm, "warm")
                interestChip(.hot,  "hot")
            }

            VStack(alignment: .leading, spacing: 8) {
                Toggle(isOn: $consentToRecord) {
                    Text("Consent to record (required for research data)")
                        .font(Brand.Font.body(13))
                        .foregroundStyle(Brand.cream)
                }
                .tint(Brand.cream)
                Text("Without consent the pitch saves but is excluded from dissertation analysis.")
                    .font(Brand.Font.mono(10))
                    .foregroundStyle(Brand.creamMuted)
            }
            .padding(12)
            .background(Brand.bgCard)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private var stage1Complete: Bool {
        outcome != nil && decisionMakerPresent != nil && demoShown != nil && interestLevel != nil
    }

    // ── Stage 2: conditional

    @ViewBuilder
    private var stage2Conditional: some View {
        VStack(alignment: .leading, spacing: 20) {
            if demoShown == true {
                chipGroup(label: "Demo reaction") {
                    demoReactionChip(.loved,       "loved")
                    demoReactionChip(.liked,       "liked")
                    demoReactionChip(.neutral,     "neutral")
                    demoReactionChip(.unimpressed, "unimpressed")
                }
            }

            if outcome == .rejected || outcome == .followUp {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Objections (tap all that apply)")
                        .font(Brand.Font.mono(11))
                        .tracking(Brand.Tracking.eyebrow)
                        .foregroundStyle(Brand.creamMuted)

                    FlexibleChips(items: ObjectionTag.allCases, label: { $0.label }, isSelected: { objections.contains($0) }) { tag in
                        if objections.contains(tag) { objections.remove(tag) } else { objections.insert(tag) }
                    }

                    if objections.contains(.other) {
                        TextField("Other (specify)", text: $objectionOther)
                            .textFieldStyle(.plain)
                            .padding(10)
                            .background(Brand.bgCard)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                            .foregroundStyle(Brand.cream)
                    }
                }
            }

            if outcome == .closedNow || outcome == .closedFollowup {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Agreed price")
                        .font(Brand.Font.mono(11))
                        .tracking(Brand.Tracking.eyebrow)
                        .foregroundStyle(Brand.creamMuted)
                    HStack {
                        Text("£").foregroundStyle(Brand.creamMuted)
                        TextField("350", text: $agreedPrice)
                            .keyboardType(.decimalPad)
                            .foregroundStyle(Brand.cream)
                    }
                    .padding(10)
                    .background(Brand.bgCard)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                chipGroup(label: "Payment") {
                    paymentChip(.paidNow,         "paid now")
                    paymentChip(.willPayFollowup, "will pay follow-up")
                }
            }

            if outcome == .followUp || outcome == .closedFollowup {
                chipGroup(label: "When to follow up") {
                    followupTimeChip(.tomorrow,  "tomorrow")
                    followupTimeChip(.thisWeek,  "this week")
                    followupTimeChip(.nextWeek,  "next week")
                    followupTimeChip(.nextMonth, "next month")
                }

                chipGroup(label: "Agreed next step") {
                    nextStepChip(.spWillCall,        "I'll call them")
                    nextStepChip(.customerWillCall,  "they'll call me")
                    nextStepChip(.sentLink,          "sent demo link")
                    nextStepChip(.scheduledMeeting,  "scheduled meeting")
                }
            }

            if !stage2HasAnyContent {
                Text("Nothing extra needed for this outcome — tap Next.")
                    .font(Brand.Font.mono(11))
                    .foregroundStyle(Brand.creamMuted)
                    .padding(.top, 8)
            }
        }
    }

    private var stage2HasAnyContent: Bool {
        demoShown == true || outcome == .rejected || outcome == .followUp ||
        outcome == .closedNow || outcome == .closedFollowup
    }

    // ── Stage 3: optional gold

    private var stage3Optional: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Anything notable in one sentence")
                    .font(Brand.Font.mono(11))
                    .tracking(Brand.Tracking.eyebrow)
                    .foregroundStyle(Brand.creamMuted)
                TextField("e.g. owner was distracted by his kid", text: $notes, axis: .vertical)
                    .lineLimit(2...4)
                    .padding(10)
                    .background(Brand.bgCard)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .foregroundStyle(Brand.cream)
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Gut-feel close probability")
                        .font(Brand.Font.mono(11))
                        .tracking(Brand.Tracking.eyebrow)
                        .foregroundStyle(Brand.creamMuted)
                    Spacer()
                    Text("\(Int(gutFeelClosePct))%")
                        .font(Brand.Font.mono(13))
                        .foregroundStyle(Brand.cream)
                }
                Slider(value: $gutFeelClosePct, in: 0...100, step: 1)
                    .tint(Brand.cream)
                Text("Calibrates over time — useful for self-coaching and dissertation analysis.")
                    .font(Brand.Font.mono(10))
                    .foregroundStyle(Brand.creamMuted)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("What did they say first?")
                    .font(Brand.Font.mono(11))
                    .tracking(Brand.Tracking.eyebrow)
                    .foregroundStyle(Brand.creamMuted)
                TextField("\"oh we already have someone\"", text: $firstResponsePhrase)
                    .padding(10)
                    .background(Brand.bgCard)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .foregroundStyle(Brand.cream)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Competitor mentioned")
                    .font(Brand.Font.mono(11))
                    .tracking(Brand.Tracking.eyebrow)
                    .foregroundStyle(Brand.creamMuted)
                TextField("Wix, Square, my nephew, …", text: $competitorMentioned)
                    .padding(10)
                    .background(Brand.bgCard)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .foregroundStyle(Brand.cream)
            }
        }
    }

    // ── Sticky action bar

    @ViewBuilder
    private var stickyBar: some View {
        HStack(spacing: 10) {
            if stage > 0 {
                Button("Back") {
                    BrandHaptics.tap()
                    stage -= 1
                }
                .buttonStyle(GhostButtonStyle(size: .sm))
                .disabled(submitting)
            }

            if stage < 2 {
                Button(stage == 0 ? "Next" : (stage2HasAnyContent ? "Next" : "Skip")) {
                    BrandHaptics.tap()
                    stage += 1
                }
                .buttonStyle(PrimaryButtonStyle(size: .sm))
                .frame(maxWidth: .infinity)
                .disabled(stage == 0 ? !stage1Complete : false)
            } else {
                Button {
                    submit()
                } label: {
                    HStack(spacing: 6) {
                        if submitting { ProgressView().scaleEffect(0.7).tint(Brand.ink) }
                        Text(submitting ? "Submitting…" : "Submit pitch")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryButtonStyle(size: .sm))
                .disabled(submitting)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 12)
        .background(
            ZStack {
                Brand.ink.opacity(0.92)
                Rectangle().fill(.ultraThinMaterial)
            }
            .ignoresSafeArea(edges: .bottom)
            .overlay(alignment: .top) {
                Rectangle().fill(Brand.line).frame(height: 1)
            }
        )
    }

    // ── Chip helpers

    @ViewBuilder
    private func chipGroup<Content: View>(label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(label)
                .font(Brand.Font.mono(11))
                .tracking(Brand.Tracking.eyebrow)
                .foregroundStyle(Brand.creamMuted)
            HStack(spacing: 8) {
                content()
            }
        }
    }

    private func chip(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(Brand.Font.mono(12))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(selected ? Brand.cream : Brand.bgCard)
                .foregroundStyle(selected ? Brand.ink : Brand.cream)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .strokeBorder(selected ? Color.clear : Brand.line, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }

    private func outcomeChip(_ value: PitchOutcome, _ label: String) -> some View {
        chip(label, selected: outcome == value) { outcome = value }
    }
    private func interestChip(_ value: InterestLevel, _ label: String) -> some View {
        chip(label, selected: interestLevel == value) { interestLevel = value }
    }
    private func demoReactionChip(_ value: DemoReaction, _ label: String) -> some View {
        chip(label, selected: demoReaction == value) { demoReaction = value }
    }
    private func paymentChip(_ value: PaymentMethod, _ label: String) -> some View {
        chip(label, selected: paymentMethod == value) { paymentMethod = value }
    }
    private func followupTimeChip(_ value: FollowupTime, _ label: String) -> some View {
        chip(label, selected: bestFollowupTime == value) { bestFollowupTime = value }
    }
    private func nextStepChip(_ value: AgreedNextStep, _ label: String) -> some View {
        chip(label, selected: agreedNextStep == value) { agreedNextStep = value }
    }

    private func ynRow(label: String, value: Binding<Bool?>) -> some View {
        HStack {
            Text(label)
                .font(Brand.Font.body(13))
                .foregroundStyle(Brand.cream)
            Spacer()
            HStack(spacing: 8) {
                chip("Yes", selected: value.wrappedValue == true)  { value.wrappedValue = true }
                chip("No",  selected: value.wrappedValue == false) { value.wrappedValue = false }
            }
        }
    }

    // ── Submit

    private func submit() {
        guard let outcome else { return }
        submitting = true
        errorMessage = nil

        let durationSeconds: Int? = pitchStartedAt.map { Int(Date().timeIntervalSince($0)) }
        let location = locationManager.location?.coordinate
        let priceValue = Double(agreedPrice.replacingOccurrences(of: ",", with: "."))

        var allObjections = objections.filter { $0 != .other }.map { $0.rawValue }
        if objections.contains(.other), !objectionOther.trimmingCharacters(in: .whitespaces).isEmpty {
            allObjections.append("other:" + objectionOther.trimmingCharacters(in: .whitespaces))
        }

        let payload = APIClient.PitchPayload(
            outcome: outcome.rawValue,
            pitch_duration_seconds: durationSeconds,
            demo_version: demoVersion,
            decision_maker_present: decisionMakerPresent,
            demo_shown: demoShown,
            interest_level: interestLevel?.rawValue,
            consent_to_record: consentToRecord,
            demo_reaction: demoReaction?.rawValue,
            agreed_price: (outcome == .closedNow || outcome == .closedFollowup) ? priceValue : nil,
            payment_method: paymentMethod?.rawValue,
            best_followup_time: bestFollowupTime?.rawValue,
            agreed_next_step: agreedNextStep?.rawValue,
            objections: allObjections.isEmpty ? nil : allObjections,
            gut_feel_close_pct: Int(gutFeelClosePct),
            first_response_phrase: trimmedOrNil(firstResponsePhrase),
            competitor_mentioned: trimmedOrNil(competitorMentioned),
            notes: trimmedOrNil(notes),
            gps_lat: location?.latitude,
            gps_lng: location?.longitude,
            pitched_at: ISO8601DateFormatter().string(from: pitchStartedAt ?? Date())
        )

        Task {
            do {
                let result = try await APIClient.shared.recordPitch(assignmentId: assignmentId, payload: payload)
                BrandHaptics.tap(.medium)
                await MainActor.run {
                    submitting = false
                    onSubmitted(result)
                    dismiss()
                }
            } catch {
                await MainActor.run {
                    submitting = false
                    errorMessage = "Couldn't save pitch — \(error.localizedDescription). Try again?"
                }
            }
        }
    }

    private func trimmedOrNil(_ s: String) -> String? {
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }
}

// MARK: — Enums

enum PitchOutcome: String, CaseIterable {
    case closedNow       = "closed_now"
    case closedFollowup  = "closed_followup"
    case followUp        = "follow_up"
    case rejected        = "rejected"
    case notPitched      = "not_pitched"
}

enum InterestLevel: String, CaseIterable {
    case cold, warm, hot
}

enum DemoReaction: String, CaseIterable {
    case loved, liked, neutral, unimpressed
}

enum PaymentMethod: String, CaseIterable {
    case paidNow         = "paid_now"
    case willPayFollowup = "will_pay_followup"
}

enum FollowupTime: String, CaseIterable {
    case tomorrow
    case thisWeek  = "this_week"
    case nextWeek  = "next_week"
    case nextMonth = "next_month"
}

enum AgreedNextStep: String, CaseIterable {
    case spWillCall       = "sp_will_call"
    case customerWillCall = "customer_will_call"
    case sentLink         = "sent_link"
    case scheduledMeeting = "scheduled_meeting"
}

enum ObjectionTag: String, CaseIterable {
    case tooExpensive          = "too_expensive"
    case needToThink           = "need_to_think"
    case alreadyHaveOne        = "already_have_one"
    case wrongPerson           = "wrong_person"
    case wrongTime             = "wrong_time"
    case dontTrust             = "dont_trust"
    case didntUnderstand       = "didnt_understand"
    case wantsFeaturesWeDontHave = "wants_features_we_dont_have"
    case other                 = "other"

    var label: String {
        switch self {
        case .tooExpensive: return "too expensive"
        case .needToThink: return "need to think"
        case .alreadyHaveOne: return "already have one"
        case .wrongPerson: return "wrong person"
        case .wrongTime: return "wrong time"
        case .dontTrust: return "don't trust"
        case .didntUnderstand: return "didn't understand"
        case .wantsFeaturesWeDontHave: return "wants features we don't have"
        case .other: return "other"
        }
    }
}

// MARK: — Result returned to caller

struct PostPitchResult {
    let pitchId: String
    let pitchAttemptNumber: Int
    let forwarded: Bool
    let nervePitchId: String?
    let qualityFlag: String?
    let forwardError: String?
}

// MARK: — Flexible chip wrap (for objections)

private struct FlexibleChips<T: Hashable>: View {
    let items: [T]
    let label: (T) -> String
    let isSelected: (T) -> Bool
    let onTap: (T) -> Void

    var body: some View {
        // Single-line wrapped layout via FlowLayout if available; otherwise
        // a simple lazy grid keeps it scrolling neatly.
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: 8)], alignment: .leading, spacing: 8) {
            ForEach(items, id: \.self) { item in
                Button {
                    onTap(item)
                } label: {
                    Text(label(item))
                        .font(Brand.Font.mono(11))
                        .frame(maxWidth: .infinity)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 6)
                        .background(isSelected(item) ? Brand.cream : Brand.bgCard)
                        .foregroundStyle(isSelected(item) ? Brand.ink : Brand.cream)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                        .overlay(
                            RoundedRectangle(cornerRadius: 6)
                                .strokeBorder(isSelected(item) ? Color.clear : Brand.line, lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }
}
