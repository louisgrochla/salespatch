import SwiftUI
import CoreLocation

// MARK: — PostPitchView
//
// Three-stage post-pitch questionnaire. Visual language follows
// DESIGN_NOTES.md (Theme tokens, card surfaces, accent on selected
// states). Designed for one-handed thumb use in the field — every
// tap target ≥ 44pt, vertical stacks instead of cramped horizontal
// chip rows.
//
// Stage 1 — required (5 inputs, ~15s)
// Stage 2 — conditional (only branches relevant to the chosen outcome)
// Stage 3 — optional (notes, gut-feel slider, first response, competitor)
//
// On submit the payload is enqueued to PitchQueue (SwiftData) and the
// sheet dismisses immediately. Network call runs in the background
// and retries on app foreground.

struct PostPitchView: View {
    let assignmentId: String
    let businessName: String
    let demoVersion: String?
    let pitchStartedAt: Date?
    let onSubmitted: (PostPitchResult) -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var locationManager = LocationManager()

    @State private var stage: Int = 0

    // Stage 1
    @State private var outcome: PitchOutcome? = nil
    @State private var decisionMakerPresent: Bool? = nil
    @State private var demoShown: Bool? = nil
    @State private var interestLevel: InterestLevel? = nil
    @State private var consentToRecord: Bool = false

    // Stage 2
    @State private var demoReaction: DemoReaction? = nil
    @State private var objections: Set<ObjectionTag> = []
    @State private var objectionOther: String = ""
    @State private var agreedPrice: String = "350"
    @State private var paymentMethod: PaymentMethod? = nil
    @State private var bestFollowupTime: FollowupTime? = nil
    @State private var agreedNextStep: AgreedNextStep? = nil

    // Stage 3
    @State private var notes: String = ""
    @State private var gutFeelClosePct: Double = 50
    @State private var firstResponsePhrase: String = ""
    @State private var competitorMentioned: String = ""

    @State private var errorMessage: String? = nil

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.background.ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        header

                        Group {
                            if stage == 0 { stage1Required }
                            else if stage == 1 { stage2Conditional }
                            else if stage == 2 { stage3Optional }
                        }

                        if let errorMessage {
                            Text(errorMessage)
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.statusRejected)
                                .padding(.top, 4)
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 8)
                    .padding(.bottom, 120)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .overlay(alignment: .bottom) { stickyBar }
        }
        .interactiveDismissDisabled(stage > 0)
    }

    // ── Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("POST-PITCH")
                        .font(.system(size: 11, weight: .semibold))
                        .tracking(1.6)
                        .foregroundStyle(Theme.textMuted)
                    Text(businessName)
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundStyle(Theme.textPrimary)
                }
                Spacer()
                Button("Cancel") { dismiss() }
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.textSecondary)
            }

            HStack(spacing: 8) {
                ForEach(0..<3, id: \.self) { i in
                    Capsule()
                        .fill(i <= stage ? Theme.accent : Theme.border)
                        .frame(height: 3)
                }
            }
            .padding(.top, 4)

            HStack(spacing: 12) {
                Text(stageTitle)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.textSecondary)
                Spacer()
                if let dur = currentDurationLabel {
                    Label(dur, systemImage: "timer")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textMuted)
                }
            }
        }
    }

    private var stageTitle: String {
        switch stage {
        case 0: return "Stage 1 of 3 · the essentials"
        case 1: return "Stage 2 of 3 · context"
        case 2: return "Stage 3 of 3 · texture (all optional)"
        default: return ""
        }
    }

    private var currentDurationLabel: String? {
        guard let start = pitchStartedAt else { return nil }
        let s = Int(Date().timeIntervalSince(start))
        return formatSeconds(s)
    }

    private func formatSeconds(_ s: Int) -> String {
        let m = s / 60, r = s % 60
        return m == 0 ? "\(s)s" : "\(m)m \(r)s"
    }

    // ── Stage 1: required

    private var stage1Required: some View {
        VStack(spacing: 12) {
            outcomeCard
            yesNoCard(label: "Decision-maker present?", value: $decisionMakerPresent)
            yesNoCard(label: "Demo shown?", value: $demoShown)
            interestCard
            consentCard
        }
    }

    private var stage1Complete: Bool {
        outcome != nil
            && decisionMakerPresent != nil
            && demoShown != nil
            && interestLevel != nil
    }

    private var outcomeCard: some View {
        sectionCard(label: "Outcome", required: true) {
            VStack(spacing: 8) {
                outcomeRow(.closedNow, title: "Closed now", subtitle: "Paid in full today", icon: "checkmark.circle.fill", tint: Theme.statusSold)
                outcomeRow(.closedFollowup, title: "Closed (follow-up)", subtitle: "Yes — payment after pitch", icon: "checkmark.circle", tint: Theme.statusSold)
                outcomeRow(.followUp, title: "Follow up", subtitle: "Interested, more chat needed", icon: "arrow.uturn.right", tint: Theme.statusPitched)
                outcomeRow(.rejected, title: "Rejected", subtitle: "Said no", icon: "xmark.circle", tint: Theme.statusRejected)
                outcomeRow(.notPitched, title: "Not pitched", subtitle: "Couldn't pitch — wrong contact, closed, etc.", icon: "minus.circle", tint: Theme.textMuted)
            }
        }
    }

    private func outcomeRow(_ value: PitchOutcome, title: String, subtitle: String, icon: String, tint: Color) -> some View {
        let selected = outcome == value
        return Button {
            BrandHaptics.tap()
            outcome = value
        } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(selected ? .white : tint)
                    .frame(width: 36, height: 36)
                    .background(selected ? tint : tint.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.textPrimary)
                    Text(subtitle)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textSecondary)
                        .lineLimit(2)
                }
                Spacer(minLength: 0)
                if selected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Theme.accent)
                }
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Theme.surfaceElevated)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(selected ? Theme.accent : Theme.border, lineWidth: selected ? 1.5 : 1)
            )
        }
        .buttonStyle(.plain)
    }

    private func yesNoCard(label: String, value: Binding<Bool?>) -> some View {
        sectionCard(label: label, required: true) {
            HStack(spacing: 8) {
                segmentedButton(title: "Yes", icon: "checkmark", selected: value.wrappedValue == true) {
                    value.wrappedValue = true
                }
                segmentedButton(title: "No", icon: "xmark", selected: value.wrappedValue == false) {
                    value.wrappedValue = false
                }
            }
        }
    }

    private func segmentedButton(title: String, icon: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: { BrandHaptics.tap(); action() }) {
            HStack(spacing: 6) {
                Image(systemName: icon).font(.system(size: 13, weight: .semibold))
                Text(title).font(.system(size: 15, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 44)
            .foregroundStyle(selected ? Color.white : Theme.textPrimary)
            .background(selected ? Theme.accent : Theme.surfaceElevated)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(selected ? Color.clear : Theme.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    private var interestCard: some View {
        sectionCard(label: "Interest level", required: true) {
            HStack(spacing: 8) {
                interestButton(.cold, "Cold", "snowflake")
                interestButton(.warm, "Warm", "thermometer.medium")
                interestButton(.hot, "Hot", "flame.fill")
            }
        }
    }

    private func interestButton(_ value: InterestLevel, _ title: String, _ icon: String) -> some View {
        let selected = interestLevel == value
        return Button {
            BrandHaptics.tap()
            interestLevel = value
        } label: {
            VStack(spacing: 4) {
                Image(systemName: icon).font(.system(size: 16, weight: .medium))
                Text(title).font(.system(size: 13, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 56)
            .foregroundStyle(selected ? Color.white : Theme.textPrimary)
            .background(selected ? Theme.accent : Theme.surfaceElevated)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(selected ? Color.clear : Theme.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    private var consentCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "checkmark.shield.fill")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(Color(hex: "#5B7B9D"))
                    .frame(width: 36, height: 36)
                    .background(Color(hex: "#5B7B9D").opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                VStack(alignment: .leading, spacing: 3) {
                    Text("Consent to record")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.textPrimary)
                    Text("Required for dissertation analysis. Without it the pitch saves but is excluded from research.")
                        .font(.system(size: 12.5))
                        .foregroundStyle(Theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                Toggle("", isOn: $consentToRecord)
                    .labelsHidden()
                    .tint(Theme.accent)
            }
        }
        .padding(14)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(Theme.border, lineWidth: 1)
        )
    }

    // ── Stage 2: conditional

    @ViewBuilder
    private var stage2Conditional: some View {
        VStack(spacing: 12) {
            if demoShown == true {
                sectionCard(label: "Demo reaction") {
                    VStack(spacing: 8) {
                        demoReactionRow(.loved, "Loved it", "heart.fill", Theme.statusSold)
                        demoReactionRow(.liked, "Liked it", "hand.thumbsup.fill", Theme.accent)
                        demoReactionRow(.neutral, "Neutral", "minus.circle", Theme.textMuted)
                        demoReactionRow(.unimpressed, "Unimpressed", "hand.thumbsdown", Theme.statusRejected)
                    }
                }
            }

            if outcome == .rejected || outcome == .followUp {
                sectionCard(label: "Objections", subtitle: "Tap all that apply") {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                        ForEach(ObjectionTag.allCases, id: \.self) { tag in
                            objectionChip(tag)
                        }
                    }
                    if objections.contains(.other) {
                        TextField("What else?", text: $objectionOther)
                            .textFieldStyle(.plain)
                            .padding(12)
                            .background(Theme.surfaceElevated)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Theme.border, lineWidth: 1))
                            .padding(.top, 8)
                    }
                }
            }

            if outcome == .closedNow || outcome == .closedFollowup {
                sectionCard(label: "Agreed price") {
                    HStack(spacing: 4) {
                        Text("£")
                            .font(.system(size: 18, weight: .medium))
                            .foregroundStyle(Theme.textSecondary)
                        TextField("350", text: $agreedPrice)
                            .keyboardType(.decimalPad)
                            .font(.system(size: 18, weight: .medium))
                            .foregroundStyle(Theme.textPrimary)
                    }
                    .padding(14)
                    .background(Theme.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Theme.border, lineWidth: 1))
                }

                sectionCard(label: "Payment") {
                    HStack(spacing: 8) {
                        segmentedButton(title: "Paid now", icon: "creditcard.fill", selected: paymentMethod == .paidNow) { paymentMethod = .paidNow }
                        segmentedButton(title: "Pay later", icon: "calendar", selected: paymentMethod == .willPayFollowup) { paymentMethod = .willPayFollowup }
                    }
                }
            }

            if outcome == .followUp || outcome == .closedFollowup {
                sectionCard(label: "Follow up when") {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                        followupChip(.tomorrow, "Tomorrow")
                        followupChip(.thisWeek, "This week")
                        followupChip(.nextWeek, "Next week")
                        followupChip(.nextMonth, "Next month")
                    }
                }
                sectionCard(label: "Next step") {
                    VStack(spacing: 8) {
                        nextStepRow(.spWillCall, "I'll call them", "phone.arrow.up.right")
                        nextStepRow(.customerWillCall, "They'll call me", "phone.arrow.down.left")
                        nextStepRow(.sentLink, "Sent demo link", "link")
                        nextStepRow(.scheduledMeeting, "Scheduled meeting", "calendar.badge.plus")
                    }
                }
            }

            if !stage2HasAnyContent {
                emptyStageCard
            }
        }
    }

    private var stage2HasAnyContent: Bool {
        demoShown == true
            || outcome == .rejected
            || outcome == .followUp
            || outcome == .closedNow
            || outcome == .closedFollowup
    }

    private var emptyStageCard: some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 20))
                .foregroundStyle(Theme.statusSold)
            VStack(alignment: .leading, spacing: 2) {
                Text("Nothing else needed")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
                Text("Tap Next to add optional notes, or Submit to ship.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.textSecondary)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Theme.border, lineWidth: 1))
    }

    private func demoReactionRow(_ value: DemoReaction, _ title: String, _ icon: String, _ tint: Color) -> some View {
        let selected = demoReaction == value
        return Button {
            BrandHaptics.tap()
            demoReaction = value
        } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(selected ? .white : tint)
                    .frame(width: 32, height: 32)
                    .background(selected ? tint : tint.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
                Spacer()
                if selected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Theme.accent)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Theme.surfaceElevated)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(selected ? Theme.accent : Theme.border, lineWidth: selected ? 1.5 : 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    private func objectionChip(_ tag: ObjectionTag) -> some View {
        let selected = objections.contains(tag)
        return Button {
            BrandHaptics.tap()
            if selected { objections.remove(tag) } else { objections.insert(tag) }
        } label: {
            Text(tag.label)
                .font(.system(size: 13, weight: .medium))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .foregroundStyle(selected ? .white : Theme.textPrimary)
                .background(selected ? Theme.accent : Theme.surfaceElevated)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(selected ? Color.clear : Theme.border, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    private func followupChip(_ value: FollowupTime, _ title: String) -> some View {
        let selected = bestFollowupTime == value
        return Button {
            BrandHaptics.tap()
            bestFollowupTime = value
        } label: {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .foregroundStyle(selected ? .white : Theme.textPrimary)
                .background(selected ? Theme.accent : Theme.surfaceElevated)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(selected ? Color.clear : Theme.border, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    private func nextStepRow(_ value: AgreedNextStep, _ title: String, _ icon: String) -> some View {
        let selected = agreedNextStep == value
        return Button {
            BrandHaptics.tap()
            agreedNextStep = value
        } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(selected ? .white : Theme.accent)
                    .frame(width: 32, height: 32)
                    .background(selected ? Theme.accent : Theme.accent.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
                Spacer()
                if selected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Theme.accent)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Theme.surfaceElevated)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(selected ? Theme.accent : Theme.border, lineWidth: selected ? 1.5 : 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    // ── Stage 3: optional gold

    private var stage3Optional: some View {
        VStack(spacing: 12) {
            sectionCard(label: "Notes", subtitle: "Anything notable in one sentence") {
                TextField("e.g. owner was distracted", text: $notes, axis: .vertical)
                    .lineLimit(2...4)
                    .padding(12)
                    .background(Theme.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Theme.border, lineWidth: 1))
                    .foregroundStyle(Theme.textPrimary)
            }

            sectionCard(
                label: "Gut-feel close probability",
                subtitle: "Calibrates over time. Pick where you'd bet."
            ) {
                VStack(spacing: 10) {
                    HStack {
                        Text("0%").font(.system(size: 11)).foregroundStyle(Theme.textMuted)
                        Spacer()
                        Text("\(Int(gutFeelClosePct))%")
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundStyle(Theme.accent)
                            .monospacedDigit()
                        Spacer()
                        Text("100%").font(.system(size: 11)).foregroundStyle(Theme.textMuted)
                    }
                    Slider(value: $gutFeelClosePct, in: 0...100, step: 1)
                        .tint(Theme.accent)
                }
            }

            sectionCard(label: "First response", subtitle: "What did they say first?") {
                TextField("\"oh we already have someone\"", text: $firstResponsePhrase)
                    .padding(12)
                    .background(Theme.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Theme.border, lineWidth: 1))
                    .foregroundStyle(Theme.textPrimary)
            }

            sectionCard(label: "Competitor mentioned", subtitle: "Wix, Square, my nephew…") {
                TextField("Optional", text: $competitorMentioned)
                    .padding(12)
                    .background(Theme.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Theme.border, lineWidth: 1))
                    .foregroundStyle(Theme.textPrimary)
            }
        }
    }

    // ── Sticky bar

    @ViewBuilder
    private var stickyBar: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Theme.border).frame(height: 1)
            HStack(spacing: 10) {
                if stage > 0 {
                    Button("Back") {
                        BrandHaptics.tap()
                        stage -= 1
                    }
                    .frame(height: 50)
                    .frame(maxWidth: .infinity)
                    .foregroundStyle(Theme.textPrimary)
                    .background(Theme.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Theme.border, lineWidth: 1))
                }

                if stage < 2 {
                    Button(stage == 0 ? "Next" : (stage2HasAnyContent ? "Next" : "Skip")) {
                        BrandHaptics.tap()
                        stage += 1
                    }
                    .frame(height: 50)
                    .frame(maxWidth: .infinity)
                    .foregroundStyle(.white)
                    .font(.system(size: 16, weight: .semibold))
                    .background(stage == 0 && !stage1Complete ? Theme.textMuted : Theme.accent)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .disabled(stage == 0 && !stage1Complete)
                } else {
                    Button {
                        submit()
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "paperplane.fill").font(.system(size: 14))
                            Text("Submit pitch").font(.system(size: 16, weight: .semibold))
                        }
                        .frame(height: 50)
                        .frame(maxWidth: .infinity)
                        .foregroundStyle(.white)
                        .background(Theme.accent)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 12)
            .padding(.bottom, 12)
            .background(Theme.surface.opacity(0.95))
        }
    }

    // ── Section card helper

    @ViewBuilder
    private func sectionCard<Content: View>(
        label: String,
        subtitle: String? = nil,
        required: Bool = false,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Text(label)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
                if required {
                    Text("·")
                        .foregroundStyle(Theme.textMuted)
                    Text("required")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(Theme.textMuted)
                }
                Spacer(minLength: 0)
            }
            if let subtitle {
                Text(subtitle)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textSecondary)
                    .padding(.top, -6)
            }
            content()
        }
        .padding(14)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(Theme.border, lineWidth: 1)
        )
    }

    // ── Submit

    private func submit() {
        guard let outcome else { return }
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

        let queuedId = PitchQueue.shared.enqueue(
            assignmentId: assignmentId,
            businessName: businessName,
            payload: payload
        )
        BrandHaptics.tap(.medium)

        let pendingResult = PostPitchResult(
            pitchId: queuedId,
            pitchAttemptNumber: 1,
            forwarded: false,
            nervePitchId: nil,
            qualityFlag: nil,
            forwardError: "queued"
        )
        onSubmitted(pendingResult)
        dismiss()
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
        case .tooExpensive: return "Too expensive"
        case .needToThink: return "Need to think"
        case .alreadyHaveOne: return "Already have one"
        case .wrongPerson: return "Wrong person"
        case .wrongTime: return "Wrong time"
        case .dontTrust: return "Don't trust"
        case .didntUnderstand: return "Didn't get it"
        case .wantsFeaturesWeDontHave: return "Wants more features"
        case .other: return "Other"
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
