import SwiftUI
import CoreLocation

// MARK: — PostPitchView
//
// Editorial dark + signal-gold post-pitch questionnaire. Visual
// language matches the rest of the app — Brand tokens (cream on ink,
// mono eyebrows like "/ OUTCOME", gold accent, capsule chips, card
// surfaces with Brand.line borders). 3-stage flow:
//
//   Stage 1 — required (~15s): outcome, decision-maker, demo, interest, consent
//   Stage 2 — conditional: branches relevant to the chosen outcome
//   Stage 3 — optional: notes, gut-feel slider, first response, competitor
//
// On submit the payload is enqueued to PitchQueue and the sheet
// dismisses immediately. Network call runs in the background.

struct PostPitchView: View {
    let assignmentId: String
    let businessName: String
    let demoVersion: String?
    let pitchStartedAt: Date?
    /// Frozen duration captured by LeadDetailView at the moment the visit
    /// ended (or status changed). When non-nil this is used verbatim as
    /// the pitch_duration_seconds on submit, and the timer at the top
    /// stops counting up. `nil` means the questionnaire was opened
    /// without a tracked visit (manual status change with no timer).
    let frozenDurationSeconds: Int?
    let onSubmitted: (PostPitchResult) -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var locationManager = LocationManager()

    @State private var stage: Int = 0
    /// Gate answer: did the SP actually deliver a pitch?
    /// nil → gate screen still shown
    /// true → full questionnaire (3 stages)
    /// false → fast why-not-pitched flow + auto-follow-up
    @State private var pitchDelivered: Bool? = nil

    // Why-not-pitched (used when pitchDelivered == false)
    @State private var notPitchedReason: NotPitchedReason? = nil
    @State private var notPitchedOther: String = ""
    @State private var autoFollowup: Bool = true

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
        ZStack {
            Brand.ink.ignoresSafeArea()

            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        // Anchor — used to reset scroll position on view change.
                        Color.clear.frame(height: 0).id("top")
                        header
                        // Gate first: "did you actually pitch?" Only show
                        // progress dots once they've answered yes (entered
                        // the multi-stage flow).
                        if pitchDelivered == true {
                            progressDots
                        }
                        Group {
                            if pitchDelivered == nil {
                                gateScreen
                            } else if pitchDelivered == false {
                                notPitchedScreen
                            } else if stage == 0 {
                                stage1Required
                            } else if stage == 1 {
                                stage2Conditional
                            } else if stage == 2 {
                                stage3Optional
                            }
                        }
                        if let errorMessage {
                            Text(errorMessage)
                                .font(Brand.Font.mono(11))
                                .foregroundStyle(Brand.err)
                                .padding(.top, 4)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .padding(.bottom, 130)
                }
                .onChange(of: stage) { _, _ in
                    withAnimation(.easeOut(duration: 0.25)) {
                        proxy.scrollTo("top", anchor: .top)
                    }
                }
                .onChange(of: pitchDelivered) { _, _ in
                    withAnimation(.easeOut(duration: 0.25)) {
                        proxy.scrollTo("top", anchor: .top)
                    }
                }
            }
        }
        .interactiveDismissDisabled(stage > 0 || pitchDelivered != nil)
        .overlay(alignment: .bottom) { stickyBar }
    }

    // ── Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("/ POST-PITCH")
                        .font(Brand.Font.mono(Brand.Font.eyebrow, weight: .medium))
                        .tracking(Brand.Tracking.eyebrow)
                        .foregroundStyle(Brand.signal)
                    Text(businessName)
                        .font(Brand.Font.display(28, weight: .medium))
                        .tracking(Brand.Tracking.display)
                        .foregroundStyle(Brand.cream)
                        .lineLimit(2)
                }
                Spacer(minLength: 0)
                Button {
                    BrandHaptics.tap()
                    dismiss()
                } label: {
                    Text("Cancel")
                        .font(Brand.Font.mono(Brand.Font.meta))
                        .tracking(Brand.Tracking.meta)
                        .foregroundStyle(Brand.creamMuted)
                }
            }

            HStack(spacing: 8) {
                Text(stageEyebrow)
                    .font(Brand.Font.mono(Brand.Font.eyebrowSm, weight: .medium))
                    .tracking(Brand.Tracking.eyebrow)
                    .foregroundStyle(Brand.creamMuted)
                if let dur = currentDurationLabel {
                    Text("·")
                        .foregroundStyle(Brand.creamMuted)
                    Text(dur)
                        .font(Brand.Font.mono(Brand.Font.meta).monospacedDigit())
                        .foregroundStyle(Brand.creamDim)
                }
                Spacer()
            }
            .padding(.top, 4)
        }
    }

    private var progressDots: some View {
        HStack(spacing: 6) {
            ForEach(0..<3, id: \.self) { i in
                RoundedRectangle(cornerRadius: 1)
                    .fill(i <= stage ? Brand.signal : Brand.line)
                    .frame(height: 2)
            }
        }
    }

    private var stageEyebrow: String {
        if pitchDelivered == nil { return "" }
        if pitchDelivered == false { return "DIDN'T PITCH · LOG WHY" }
        switch stage {
        case 0: return "STAGE 1 / 3 · ESSENTIALS"
        case 1: return "STAGE 2 / 3 · CONTEXT"
        case 2: return "STAGE 3 / 3 · OPTIONAL"
        default: return ""
        }
    }

    private var currentDurationLabel: String? {
        // Prefer the frozen duration captured when the visit ended /
        // status changed — keeps the displayed time stable while the
        // SP fills the questionnaire. Falls back to live ticking only
        // if no frozen value was supplied.
        if let frozen = frozenDurationSeconds {
            return formatDuration(frozen)
        }
        guard let start = pitchStartedAt else { return nil }
        return formatDuration(Int(Date().timeIntervalSince(start)))
    }

    private func formatDuration(_ s: Int) -> String {
        let m = s / 60, r = s % 60
        return m == 0 ? "\(s)s" : "\(m)m \(r)s"
    }

    // ── Stage 1: required

    private var stage1Required: some View {
        VStack(spacing: 14) {
            outcomeCard
            yesNoCard(eyebrow: "/ DECISION-MAKER", question: "Were you speaking to the decision-maker?", value: $decisionMakerPresent)
            yesNoCard(eyebrow: "/ DEMO SHOWN", question: "Did they actually see the demo?", value: $demoShown)
            interestCard
            consentCard
        }
    }

    private var stage1Complete: Bool {
        outcome != nil && decisionMakerPresent != nil && demoShown != nil && interestLevel != nil
    }

    /// Stage 2 mandatory fields per outcome. The Next/Submit buttons
    /// are disabled until these are answered for the chosen branch.
    /// Follow-up cases (rejected / follow_up / closed_followup) require
    /// the SP to explicitly say WHEN to come back — that's the field
    /// that makes follow-ups actually actionable.
    private var stage2Complete: Bool {
        guard let outcome else { return false }
        if outcome == .rejected || outcome == .followUp {
            // At least one objection must be picked so the SP commits to
            // a reason. "other" requires the free-text too.
            if objections.isEmpty { return false }
            if objections.contains(.other),
               objectionOther.trimmingCharacters(in: .whitespaces).isEmpty {
                return false
            }
        }
        if outcome == .followUp || outcome == .closedFollowup {
            // Mandatory: when to follow up + agreed next step.
            if bestFollowupTime == nil { return false }
            if agreedNextStep == nil { return false }
        }
        if outcome == .closedNow || outcome == .closedFollowup {
            // Mandatory: payment method.
            if paymentMethod == nil { return false }
        }
        return true
    }

    private var outcomeCard: some View {
        sectionCard(eyebrow: "/ OUTCOME", required: true) {
            VStack(spacing: 8) {
                outcomeRow(.closedNow, title: "Closed now", subtitle: "Paid in full today", icon: "sterlingsign.circle.fill")
                outcomeRow(.closedFollowup, title: "Closed (follow-up)", subtitle: "Yes — payment after pitch", icon: "checkmark.seal.fill")
                outcomeRow(.followUp, title: "Follow up", subtitle: "Interested, more chat needed", icon: "arrow.uturn.right.circle")
                outcomeRow(.rejected, title: "Rejected", subtitle: "Said no", icon: "xmark.circle")
                outcomeRow(.notPitched, title: "Not pitched", subtitle: "Wrong contact / closed / no time", icon: "minus.circle")
            }
        }
    }

    private func outcomeRow(_ value: PitchOutcome, title: String, subtitle: String, icon: String) -> some View {
        let selected = outcome == value
        return Button {
            BrandHaptics.tap()
            outcome = value
        } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(selected ? Brand.signal : Brand.creamDim)
                    .frame(width: 36, height: 36)
                    .background(
                        RoundedRectangle(cornerRadius: 9)
                            .fill(selected ? Brand.signalSoft : Brand.bgCard)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 9)
                            .strokeBorder(selected ? Brand.signalBorder : Brand.line, lineWidth: 1)
                    )
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(Brand.Font.body(15, weight: .medium))
                        .foregroundStyle(Brand.cream)
                    Text(subtitle)
                        .font(Brand.Font.mono(Brand.Font.meta))
                        .foregroundStyle(Brand.creamMuted)
                }
                Spacer(minLength: 0)
                if selected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(Brand.signal)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(selected ? Brand.signalSoft : Brand.bgCard)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(selected ? Brand.signalBorder : Brand.line, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private func yesNoCard(eyebrow: String, question: String, value: Binding<Bool?>) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Text(eyebrow)
                    .font(Brand.Font.mono(Brand.Font.eyebrow, weight: .medium))
                    .tracking(Brand.Tracking.eyebrow)
                    .foregroundStyle(Brand.signal)
                Text("·").foregroundStyle(Brand.creamMuted)
                Text("REQUIRED")
                    .font(Brand.Font.mono(9.5))
                    .tracking(Brand.Tracking.eyebrow)
                    .foregroundStyle(Brand.creamMuted)
            }
            Text(question)
                .font(Brand.Font.body(14))
                .foregroundStyle(Brand.creamDim)
            HStack(spacing: 10) {
                yesNoPill(title: "Yes", icon: "checkmark", selected: value.wrappedValue == true) {
                    value.wrappedValue = true
                }
                yesNoPill(title: "No", icon: "xmark", selected: value.wrappedValue == false) {
                    value.wrappedValue = false
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: Brand.Radius.card)
                .fill(Brand.bgStrong)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Brand.Radius.card)
                .strokeBorder(Brand.line, lineWidth: 1)
        )
    }

    private func yesNoPill(title: String, icon: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button {
            BrandHaptics.tap()
            action()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .semibold))
                Text(title)
                    .font(Brand.Font.body(15, weight: .medium))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 46)
            .foregroundStyle(selected ? Brand.ink : Brand.cream)
            .background(
                Capsule().fill(selected ? Brand.cream : Brand.bgCard)
            )
            .overlay(
                Capsule().strokeBorder(selected ? Color.clear : Brand.line, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private var interestCard: some View {
        sectionCard(eyebrow: "/ INTEREST LEVEL", required: true) {
            HStack(spacing: 10) {
                interestPill(.cold, "Cold", "snowflake")
                interestPill(.warm, "Warm", "thermometer.medium")
                interestPill(.hot, "Hot", "flame.fill")
            }
        }
    }

    private func interestPill(_ value: InterestLevel, _ title: String, _ icon: String) -> some View {
        let selected = interestLevel == value
        return Button {
            BrandHaptics.tap()
            interestLevel = value
        } label: {
            VStack(spacing: 6) {
                Image(systemName: icon).font(.system(size: 16, weight: .medium))
                Text(title)
                    .font(Brand.Font.mono(11, weight: .medium))
                    .tracking(Brand.Tracking.meta)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 64)
            .foregroundStyle(selected ? Brand.ink : Brand.cream)
            .background(
                RoundedRectangle(cornerRadius: 12).fill(selected ? Brand.cream : Brand.bgCard)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12).strokeBorder(selected ? Color.clear : Brand.line, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private var consentCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                Text("/ CONSENT")
                    .font(Brand.Font.mono(Brand.Font.eyebrow, weight: .medium))
                    .tracking(Brand.Tracking.eyebrow)
                    .foregroundStyle(Brand.signal)
                Text("·").foregroundStyle(Brand.creamMuted)
                Text("REQUIRED FOR DISSERTATION")
                    .font(Brand.Font.mono(9.5))
                    .tracking(Brand.Tracking.eyebrow)
                    .foregroundStyle(Brand.creamMuted)
            }

            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Consent to record")
                        .font(Brand.Font.body(15, weight: .medium))
                        .foregroundStyle(Brand.cream)
                    Text("Without consent the pitch saves but is excluded from research data.")
                        .font(Brand.Font.body(13))
                        .foregroundStyle(Brand.creamMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                Toggle("", isOn: $consentToRecord)
                    .labelsHidden()
                    .tint(Brand.signal)
            }
            .padding(.top, 12)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: Brand.Radius.card)
                .fill(consentToRecord ? Brand.signalSoft : Brand.bgStrong)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Brand.Radius.card)
                .strokeBorder(consentToRecord ? Brand.signalBorder : Brand.line, lineWidth: 1)
        )
    }

    // ── Stage 2: conditional

    @ViewBuilder
    private var stage2Conditional: some View {
        VStack(spacing: 14) {
            if demoShown == true {
                sectionCard(eyebrow: "/ DEMO REACTION") {
                    VStack(spacing: 8) {
                        demoReactionRow(.loved, "Loved it", "heart.fill")
                        demoReactionRow(.liked, "Liked it", "hand.thumbsup.fill")
                        demoReactionRow(.neutral, "Neutral", "minus.circle")
                        demoReactionRow(.unimpressed, "Unimpressed", "hand.thumbsdown")
                    }
                }
            }

            if outcome == .rejected || outcome == .followUp {
                sectionCard(eyebrow: "/ OBJECTIONS", subtitle: "Tap all that apply") {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                        ForEach(ObjectionTag.allCases, id: \.self) { tag in
                            objectionChip(tag)
                        }
                    }
                    if objections.contains(.other) {
                        TextField("What else?", text: $objectionOther)
                            .textFieldStyle(.plain)
                            .font(Brand.Font.body(14))
                            .foregroundStyle(Brand.cream)
                            .padding(12)
                            .background(Brand.bgCard)
                            .clipShape(RoundedRectangle(cornerRadius: Brand.Radius.input))
                            .overlay(RoundedRectangle(cornerRadius: Brand.Radius.input).strokeBorder(Brand.line, lineWidth: 1))
                            .padding(.top, 8)
                    }
                }
            }

            if outcome == .closedNow || outcome == .closedFollowup {
                sectionCard(eyebrow: "/ AGREED PRICE") {
                    HStack(spacing: 6) {
                        Text("£")
                            .font(Brand.Font.display(20, weight: .medium))
                            .foregroundStyle(Brand.creamDim)
                        TextField("350", text: $agreedPrice)
                            .keyboardType(.decimalPad)
                            .font(Brand.Font.display(20, weight: .medium).monospacedDigit())
                            .foregroundStyle(Brand.cream)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .background(Brand.bgCard)
                    .clipShape(RoundedRectangle(cornerRadius: Brand.Radius.input))
                    .overlay(RoundedRectangle(cornerRadius: Brand.Radius.input).strokeBorder(Brand.line, lineWidth: 1))
                }

                sectionCard(eyebrow: "/ PAYMENT") {
                    HStack(spacing: 10) {
                        yesNoPill(title: "Paid now", icon: "creditcard.fill", selected: paymentMethod == .paidNow) { paymentMethod = .paidNow }
                        yesNoPill(title: "Pay later", icon: "calendar", selected: paymentMethod == .willPayFollowup) { paymentMethod = .willPayFollowup }
                    }
                }
            }

            if outcome == .followUp || outcome == .closedFollowup {
                sectionCard(eyebrow: "/ FOLLOW UP WHEN") {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                        followupChip(.tomorrow, "Tomorrow")
                        followupChip(.thisWeek, "This week")
                        followupChip(.nextWeek, "Next week")
                        followupChip(.nextMonth, "Next month")
                    }
                }
                sectionCard(eyebrow: "/ NEXT STEP") {
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
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(Brand.signal)
            VStack(alignment: .leading, spacing: 2) {
                Text("No extra context needed")
                    .font(Brand.Font.body(14, weight: .medium))
                    .foregroundStyle(Brand.cream)
                Text("Tap Next to add optional notes — or Submit to ship.")
                    .font(Brand.Font.mono(Brand.Font.meta))
                    .foregroundStyle(Brand.creamMuted)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: Brand.Radius.card).fill(Brand.bgStrong))
        .overlay(RoundedRectangle(cornerRadius: Brand.Radius.card).strokeBorder(Brand.line, lineWidth: 1))
    }

    private func demoReactionRow(_ value: DemoReaction, _ title: String, _ icon: String) -> some View {
        let selected = demoReaction == value
        return Button {
            BrandHaptics.tap()
            demoReaction = value
        } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(selected ? Brand.signal : Brand.creamDim)
                    .frame(width: 32, height: 32)
                    .background(RoundedRectangle(cornerRadius: 8).fill(selected ? Brand.signalSoft : Brand.bgCard))
                    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(selected ? Brand.signalBorder : Brand.line, lineWidth: 1))
                Text(title)
                    .font(Brand.Font.body(15, weight: .medium))
                    .foregroundStyle(Brand.cream)
                Spacer()
                if selected {
                    Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)).foregroundStyle(Brand.signal)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 12).fill(selected ? Brand.signalSoft : Brand.bgCard))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(selected ? Brand.signalBorder : Brand.line, lineWidth: 1))
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
                .font(Brand.Font.body(13, weight: .medium))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .foregroundStyle(selected ? Brand.ink : Brand.cream)
                .background(
                    RoundedRectangle(cornerRadius: 10).fill(selected ? Brand.cream : Brand.bgCard)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 10).strokeBorder(selected ? Color.clear : Brand.line, lineWidth: 1)
                )
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
                .font(Brand.Font.body(14, weight: .medium))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .foregroundStyle(selected ? Brand.ink : Brand.cream)
                .background(
                    RoundedRectangle(cornerRadius: 10).fill(selected ? Brand.cream : Brand.bgCard)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 10).strokeBorder(selected ? Color.clear : Brand.line, lineWidth: 1)
                )
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
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(selected ? Brand.signal : Brand.creamDim)
                    .frame(width: 32, height: 32)
                    .background(RoundedRectangle(cornerRadius: 8).fill(selected ? Brand.signalSoft : Brand.bgCard))
                    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(selected ? Brand.signalBorder : Brand.line, lineWidth: 1))
                Text(title)
                    .font(Brand.Font.body(15, weight: .medium))
                    .foregroundStyle(Brand.cream)
                Spacer()
                if selected {
                    Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)).foregroundStyle(Brand.signal)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 12).fill(selected ? Brand.signalSoft : Brand.bgCard))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(selected ? Brand.signalBorder : Brand.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    // ── Stage 3: optional gold

    private var stage3Optional: some View {
        VStack(spacing: 14) {
            sectionCard(eyebrow: "/ NOTES", subtitle: "Anything notable in one sentence") {
                TextField("e.g. owner was distracted", text: $notes, axis: .vertical)
                    .lineLimit(2...4)
                    .font(Brand.Font.body(14))
                    .foregroundStyle(Brand.cream)
                    .padding(12)
                    .background(Brand.bgCard)
                    .clipShape(RoundedRectangle(cornerRadius: Brand.Radius.input))
                    .overlay(RoundedRectangle(cornerRadius: Brand.Radius.input).strokeBorder(Brand.line, lineWidth: 1))
            }

            sectionCard(eyebrow: "/ GUT-FEEL CLOSE", subtitle: "Where would you bet right now?") {
                VStack(spacing: 12) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("0%")
                            .font(Brand.Font.mono(10))
                            .foregroundStyle(Brand.creamMuted)
                        Spacer()
                        Text("\(Int(gutFeelClosePct))%")
                            .font(Brand.Font.display(34, weight: .medium).monospacedDigit())
                            .tracking(-0.5)
                            .foregroundStyle(Brand.signal)
                        Spacer()
                        Text("100%")
                            .font(Brand.Font.mono(10))
                            .foregroundStyle(Brand.creamMuted)
                    }
                    Slider(value: $gutFeelClosePct, in: 0...100, step: 1)
                        .tint(Brand.signal)
                }
            }

            sectionCard(eyebrow: "/ FIRST RESPONSE", subtitle: "What did they say first?") {
                TextField("\"oh we already have someone\"", text: $firstResponsePhrase)
                    .font(Brand.Font.body(14))
                    .foregroundStyle(Brand.cream)
                    .padding(12)
                    .background(Brand.bgCard)
                    .clipShape(RoundedRectangle(cornerRadius: Brand.Radius.input))
                    .overlay(RoundedRectangle(cornerRadius: Brand.Radius.input).strokeBorder(Brand.line, lineWidth: 1))
            }

            sectionCard(eyebrow: "/ COMPETITOR", subtitle: "Wix, Square, the nephew…") {
                TextField("Optional", text: $competitorMentioned)
                    .font(Brand.Font.body(14))
                    .foregroundStyle(Brand.cream)
                    .padding(12)
                    .background(Brand.bgCard)
                    .clipShape(RoundedRectangle(cornerRadius: Brand.Radius.input))
                    .overlay(RoundedRectangle(cornerRadius: Brand.Radius.input).strokeBorder(Brand.line, lineWidth: 1))
            }
        }
    }

    // ── Sticky bar

    @ViewBuilder
    private var stickyBar: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Brand.line).frame(height: 1)
            HStack(spacing: 10) {
                // Gate screen: no buttons here — the two big tap-targets
                // ARE the action. Hide the sticky bar entirely.
                if pitchDelivered == nil {
                    EmptyView()
                } else if pitchDelivered == false {
                    // Not-pitched flow: Back to gate + Submit.
                    Button {
                        BrandHaptics.tap()
                        pitchDelivered = nil
                    } label: {
                        Text("Back")
                            .font(Brand.Font.mono(11, weight: .medium))
                            .tracking(Brand.Tracking.eyebrow)
                            .foregroundStyle(Brand.cream)
                            .frame(maxWidth: .infinity)
                            .frame(height: 50)
                            .background(Capsule().fill(Brand.bgCard))
                            .overlay(Capsule().strokeBorder(Brand.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)

                    Button {
                        submitNotPitched()
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "paperplane.fill").font(.system(size: 13))
                            Text("Log visit")
                                .font(Brand.Font.body(15, weight: .semibold))
                        }
                        .foregroundStyle(notPitchedComplete ? Brand.ink : Brand.creamMuted)
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(Capsule().fill(notPitchedComplete ? Brand.cream : Brand.bgCard))
                    }
                    .buttonStyle(.plain)
                    .disabled(!notPitchedComplete)
                } else {
                    // Full questionnaire (pitchDelivered == true).
                    if stage > 0 {
                        Button {
                            BrandHaptics.tap()
                            stage -= 1
                        } label: {
                            Text("Back")
                                .font(Brand.Font.mono(11, weight: .medium))
                                .tracking(Brand.Tracking.eyebrow)
                                .foregroundStyle(Brand.cream)
                                .frame(maxWidth: .infinity)
                                .frame(height: 50)
                                .background(Capsule().fill(Brand.bgCard))
                                .overlay(Capsule().strokeBorder(Brand.line, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    } else {
                        // Stage 0 with the gate already answered: Back
                        // returns to the gate.
                        Button {
                            BrandHaptics.tap()
                            pitchDelivered = nil
                        } label: {
                            Text("Back")
                                .font(Brand.Font.mono(11, weight: .medium))
                                .tracking(Brand.Tracking.eyebrow)
                                .foregroundStyle(Brand.cream)
                                .frame(maxWidth: .infinity)
                                .frame(height: 50)
                                .background(Capsule().fill(Brand.bgCard))
                                .overlay(Capsule().strokeBorder(Brand.line, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }

                    if stage < 2 {
                        let nextDisabled = (stage == 0 && !stage1Complete) || (stage == 1 && !stage2Complete)
                        Button {
                            BrandHaptics.tap()
                            stage += 1
                        } label: {
                            Text(stage == 0 ? "Next" : (stage2HasAnyContent ? "Next" : "Skip"))
                                .font(Brand.Font.body(15, weight: .semibold))
                                .foregroundStyle(nextDisabled ? Brand.creamMuted : Brand.ink)
                                .frame(maxWidth: .infinity)
                                .frame(height: 50)
                                .background(Capsule().fill(nextDisabled ? Brand.bgCard : Brand.cream))
                        }
                        .buttonStyle(.plain)
                        .disabled(nextDisabled)
                    } else {
                        Button {
                            submit()
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "paperplane.fill").font(.system(size: 13))
                                Text("Submit pitch")
                                    .font(Brand.Font.body(15, weight: .semibold))
                            }
                            .foregroundStyle(Brand.ink)
                            .frame(maxWidth: .infinity)
                            .frame(height: 50)
                            .background(Capsule().fill(Brand.cream))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 12)
            .background(
                ZStack {
                    Brand.ink.opacity(0.96)
                    Rectangle().fill(.ultraThinMaterial).opacity(0.4)
                }
                .ignoresSafeArea(edges: .bottom)
            )
        }
    }

    // ── Section card helper

    @ViewBuilder
    private func sectionCard<Content: View>(
        eyebrow: String,
        subtitle: String? = nil,
        required: Bool = false,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Text(eyebrow)
                    .font(Brand.Font.mono(Brand.Font.eyebrow, weight: .medium))
                    .tracking(Brand.Tracking.eyebrow)
                    .foregroundStyle(Brand.signal)
                if required {
                    Text("·").foregroundStyle(Brand.creamMuted)
                    Text("REQUIRED")
                        .font(Brand.Font.mono(9.5))
                        .tracking(Brand.Tracking.eyebrow)
                        .foregroundStyle(Brand.creamMuted)
                }
                Spacer(minLength: 0)
            }
            if let subtitle {
                Text(subtitle)
                    .font(Brand.Font.body(13))
                    .foregroundStyle(Brand.creamMuted)
                    .padding(.top, -4)
            }
            content()
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: Brand.Radius.card).fill(Brand.bgStrong)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Brand.Radius.card).strokeBorder(Brand.line, lineWidth: 1)
        )
    }

    // ── Gate: "Did you manage to pitch?"

    private var gateScreen: some View {
        VStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Did you manage to pitch?")
                    .font(Brand.Font.display(20, weight: .medium))
                    .foregroundStyle(Brand.cream)
                Text("If yes, we'll capture the rich detail. If no, we'll log it quickly and put a follow-up on your calendar.")
                    .font(Brand.Font.body(14))
                    .foregroundStyle(Brand.creamMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: Brand.Radius.card).fill(Brand.bgStrong))
            .overlay(RoundedRectangle(cornerRadius: Brand.Radius.card).strokeBorder(Brand.line, lineWidth: 1))

            gateButton(
                title: "Yes, I pitched",
                subtitle: "Closed, follow-up, or rejected — capture the detail",
                icon: "checkmark.circle.fill",
                accent: true
            ) {
                BrandHaptics.tap(.medium)
                pitchDelivered = true
            }

            gateButton(
                title: "No, didn't pitch",
                subtitle: "Wrong contact, shop closed, ran out of time",
                icon: "minus.circle",
                accent: false
            ) {
                BrandHaptics.tap()
                pitchDelivered = false
            }
        }
    }

    private func gateButton(
        title: String,
        subtitle: String,
        icon: String,
        accent: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 22, weight: .medium))
                    .foregroundStyle(accent ? Brand.signal : Brand.creamDim)
                    .frame(width: 48, height: 48)
                    .background(
                        RoundedRectangle(cornerRadius: 12).fill(accent ? Brand.signalSoft : Brand.bgCard)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 12).strokeBorder(accent ? Brand.signalBorder : Brand.line, lineWidth: 1)
                    )
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(Brand.Font.body(17, weight: .semibold))
                        .foregroundStyle(Brand.cream)
                    Text(subtitle)
                        .font(Brand.Font.body(13))
                        .foregroundStyle(Brand.creamMuted)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Brand.creamMuted)
            }
            .padding(16)
            .background(RoundedRectangle(cornerRadius: Brand.Radius.card).fill(Brand.bgStrong))
            .overlay(
                RoundedRectangle(cornerRadius: Brand.Radius.card)
                    .strokeBorder(accent ? Brand.signalBorder : Brand.line, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    // ── Not pitched: simple why + auto-follow-up

    private var notPitchedScreen: some View {
        VStack(spacing: 14) {
            sectionCard(eyebrow: "/ WHY NOT", required: true) {
                VStack(spacing: 8) {
                    notPitchedRow(.wrongPerson, "Wrong contact", "Decision-maker wasn't there", "person.fill.questionmark")
                    notPitchedRow(.shopClosed, "Shop was closed", "Or out of business", "lock.fill")
                    notPitchedRow(.tooBusy, "They were too busy", "Customers in / mid-task", "clock.fill")
                    notPitchedRow(.wrongTime, "Wrong time of day", "Try again later or another day", "calendar")
                    notPitchedRow(.notReady, "I wasn't ready", "Need more prep on this lead", "exclamationmark.triangle")
                    notPitchedRow(.other, "Something else", "Tell us what", "text.bubble")
                }
                if notPitchedReason == .other {
                    TextField("What happened?", text: $notPitchedOther, axis: .vertical)
                        .lineLimit(2...4)
                        .font(Brand.Font.body(14))
                        .foregroundStyle(Brand.cream)
                        .padding(12)
                        .background(Brand.bgCard)
                        .clipShape(RoundedRectangle(cornerRadius: Brand.Radius.input))
                        .overlay(RoundedRectangle(cornerRadius: Brand.Radius.input).strokeBorder(Brand.line, lineWidth: 1))
                        .padding(.top, 8)
                }
            }

            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Text("/ AUTO FOLLOW-UP")
                        .font(Brand.Font.mono(Brand.Font.eyebrow, weight: .medium))
                        .tracking(Brand.Tracking.eyebrow)
                        .foregroundStyle(Brand.signal)
                }
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Schedule a follow-up")
                            .font(Brand.Font.body(15, weight: .medium))
                            .foregroundStyle(Brand.cream)
                        Text(autoFollowup ? "Tomorrow at 10am — we'll remind you to come back." : "No reminder will be set. You can add one manually later.")
                            .font(Brand.Font.body(13))
                            .foregroundStyle(Brand.creamMuted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 8)
                    Toggle("", isOn: $autoFollowup)
                        .labelsHidden()
                        .tint(Brand.signal)
                }
                .padding(.top, 12)
            }
            .padding(16)
            .background(RoundedRectangle(cornerRadius: Brand.Radius.card).fill(autoFollowup ? Brand.signalSoft : Brand.bgStrong))
            .overlay(RoundedRectangle(cornerRadius: Brand.Radius.card).strokeBorder(autoFollowup ? Brand.signalBorder : Brand.line, lineWidth: 1))
        }
    }

    private func notPitchedRow(_ value: NotPitchedReason, _ title: String, _ subtitle: String, _ icon: String) -> some View {
        let selected = notPitchedReason == value
        return Button {
            BrandHaptics.tap()
            notPitchedReason = value
        } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(selected ? Brand.signal : Brand.creamDim)
                    .frame(width: 32, height: 32)
                    .background(RoundedRectangle(cornerRadius: 8).fill(selected ? Brand.signalSoft : Brand.bgCard))
                    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(selected ? Brand.signalBorder : Brand.line, lineWidth: 1))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(Brand.Font.body(15, weight: .medium))
                        .foregroundStyle(Brand.cream)
                    Text(subtitle)
                        .font(Brand.Font.mono(Brand.Font.meta))
                        .foregroundStyle(Brand.creamMuted)
                }
                Spacer(minLength: 0)
                if selected {
                    Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)).foregroundStyle(Brand.signal)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 12).fill(selected ? Brand.signalSoft : Brand.bgCard))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(selected ? Brand.signalBorder : Brand.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private var notPitchedComplete: Bool {
        guard let reason = notPitchedReason else { return false }
        if reason == .other && notPitchedOther.trimmingCharacters(in: .whitespaces).isEmpty {
            return false
        }
        return true
    }

    // ── Submit (full questionnaire branch)

    private func submit() {
        guard let outcome else { return }
        errorMessage = nil

        // Use the frozen duration if we have it (visit ended / status
        // changed while we were filling the form). Otherwise compute
        // from the start time as a last resort.
        let durationSeconds: Int? = frozenDurationSeconds
            ?? pitchStartedAt.map { Int(Date().timeIntervalSince($0)) }
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

        // If the SP picked a follow-up window, also schedule a real
        // calendar date on the lead so the Follow Up tab shows the
        // countdown. Best-effort — failure here doesn't block the
        // pitch submit (the queue already has the pitch payload).
        if let bestFollowupTime, let followupDate = followupTimeToDate(bestFollowupTime) {
            Task {
                try? await APIClient.shared.scheduleFollowup(
                    assignmentId: assignmentId,
                    at: followupDate,
                    note: trimmedOrNil(notes) ?? "Follow up after pitch"
                )
            }
        }

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

    /// Submit path for the "didn't pitch" branch — short, one chip + an
    /// auto-follow-up toggle. Outcome is forced to .notPitched and the
    /// reason becomes the lone objection.
    private func submitNotPitched() {
        guard let reason = notPitchedReason else { return }

        let durationSeconds: Int? = frozenDurationSeconds
            ?? pitchStartedAt.map { Int(Date().timeIntervalSince($0)) }
        let location = locationManager.location?.coordinate

        // Pack the reason into the objections array so NERVE has the
        // structured why. "other" carries the free text after the colon.
        var reasons: [String] = []
        if reason == .other {
            let trimmed = notPitchedOther.trimmingCharacters(in: .whitespacesAndNewlines)
            reasons.append("other:" + trimmed)
        } else {
            reasons.append(reason.rawValue)
        }

        let payload = APIClient.PitchPayload(
            outcome: PitchOutcome.notPitched.rawValue,
            pitch_duration_seconds: durationSeconds,
            demo_version: demoVersion,
            decision_maker_present: reason == .wrongPerson ? false : nil,
            demo_shown: false,
            interest_level: nil,
            consent_to_record: false, // nothing was recorded
            demo_reaction: nil,
            agreed_price: nil,
            payment_method: nil,
            best_followup_time: autoFollowup ? FollowupTime.tomorrow.rawValue : nil,
            agreed_next_step: autoFollowup ? AgreedNextStep.spWillCall.rawValue : nil,
            objections: reasons,
            gut_feel_close_pct: nil,
            first_response_phrase: nil,
            competitor_mentioned: nil,
            notes: "Did not pitch — \(reason.label)",
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

        if autoFollowup {
            // Tomorrow 10am, with a note explaining why.
            let cal = Calendar.current
            if let target = cal.date(byAdding: .day, value: 1, to: .now) {
                var comps = cal.dateComponents([.year, .month, .day], from: target)
                comps.hour = 10
                comps.minute = 0
                if let date = cal.date(from: comps) {
                    let note = "Couldn't pitch — \(reason.label.lowercased()). Try again."
                    Task {
                        try? await APIClient.shared.scheduleFollowup(
                            assignmentId: assignmentId,
                            at: date,
                            note: note
                        )
                    }
                }
            }
        }

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

    /// Convert the relative-time chip into a concrete date so the
    /// Follow Up tab can show a real countdown. Pinned to 10am local
    /// time on the target day — a sensible default for a callback.
    private func followupTimeToDate(_ when: FollowupTime) -> Date? {
        let cal = Calendar.current
        let days: Int
        switch when {
        case .tomorrow:  days = 1
        case .thisWeek:  days = 3
        case .nextWeek:  days = 7
        case .nextMonth: days = 30
        }
        guard let target = cal.date(byAdding: .day, value: days, to: .now) else { return nil }
        var comps = cal.dateComponents([.year, .month, .day], from: target)
        comps.hour = 10
        comps.minute = 0
        return cal.date(from: comps)
    }
}

// MARK: — Enums

/// Why a visit ended without a pitch. Maps into the objections array
/// on the not_pitched payload so NERVE can stratify rejections vs
/// "wrong contact" vs "shop closed" cleanly.
enum NotPitchedReason: String, CaseIterable {
    case wrongPerson  = "wrong_person"
    case shopClosed   = "shop_closed"
    case tooBusy      = "too_busy"
    case wrongTime    = "wrong_time"
    case notReady     = "not_ready"
    case other        = "other"

    var label: String {
        switch self {
        case .wrongPerson: return "Wrong contact"
        case .shopClosed:  return "Shop closed"
        case .tooBusy:     return "They were too busy"
        case .wrongTime:   return "Wrong time of day"
        case .notReady:    return "I wasn't ready"
        case .other:       return "Something else"
        }
    }
}

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
