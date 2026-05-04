import SwiftUI

// MARK: — FollowupSheet
//
// Modal for scheduling / editing / clearing a follow-up reminder on
// a lead. Used from LeadDetailView's Follow Up tab. Also used as a
// fallback when the post-pitch questionnaire's "follow-up time" chip
// resolves to a concrete date — the SP can confirm or override it.

struct FollowupSheet: View {
    let assignmentId: String
    let businessName: String
    let initialDate: Date?
    let initialNote: String?
    let onSaved: (Date?, String?) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var selectedDate: Date
    @State private var note: String
    @State private var saving = false
    @State private var error: String?

    init(
        assignmentId: String,
        businessName: String,
        initialDate: Date?,
        initialNote: String?,
        onSaved: @escaping (Date?, String?) -> Void
    ) {
        self.assignmentId = assignmentId
        self.businessName = businessName
        self.initialDate = initialDate
        self.initialNote = initialNote
        self.onSaved = onSaved
        let defaultDate = initialDate
            ?? Calendar.current.date(byAdding: .day, value: 3, to: .now)
            ?? .now
        _selectedDate = State(initialValue: defaultDate)
        _note = State(initialValue: initialNote ?? "")
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Brand.ink.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        header
                        quickPickRow
                        datePickerCard
                        noteCard
                        if let error {
                            Text(error)
                                .font(Brand.Font.mono(11))
                                .foregroundStyle(Brand.err)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .padding(.bottom, 130)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .overlay(alignment: .bottom) { stickyBar }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("/ FOLLOW UP")
                        .font(Brand.Font.mono(Brand.Font.eyebrow, weight: .medium))
                        .tracking(Brand.Tracking.eyebrow)
                        .foregroundStyle(Brand.signal)
                    Text(businessName)
                        .font(Brand.Font.display(24, weight: .medium))
                        .tracking(Brand.Tracking.display)
                        .foregroundStyle(Brand.cream)
                }
                Spacer()
                Button("Cancel") { dismiss() }
                    .font(Brand.Font.mono(Brand.Font.meta))
                    .tracking(Brand.Tracking.meta)
                    .foregroundStyle(Brand.creamMuted)
            }
        }
    }

    private var quickPickRow: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("/ QUICK PICK")
                .font(Brand.Font.mono(Brand.Font.eyebrow, weight: .medium))
                .tracking(Brand.Tracking.eyebrow)
                .foregroundStyle(Brand.signal)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                quickPickChip("Tomorrow", days: 1)
                quickPickChip("In 3 days", days: 3)
                quickPickChip("Next week", days: 7)
                quickPickChip("Next month", days: 30)
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: Brand.Radius.card).fill(Brand.bgStrong))
        .overlay(RoundedRectangle(cornerRadius: Brand.Radius.card).strokeBorder(Brand.line, lineWidth: 1))
    }

    private func quickPickChip(_ title: String, days: Int) -> some View {
        let date = Calendar.current.date(byAdding: .day, value: days, to: .now) ?? .now
        let selected = Calendar.current.isDate(selectedDate, inSameDayAs: date)
        return Button {
            BrandHaptics.tap()
            selectedDate = date
        } label: {
            VStack(spacing: 4) {
                Text(title)
                    .font(Brand.Font.body(14, weight: .medium))
                Text(date.formatted(.dateTime.day().month()))
                    .font(Brand.Font.mono(10))
                    .tracking(Brand.Tracking.meta)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .foregroundStyle(selected ? Brand.ink : Brand.cream)
            .background(RoundedRectangle(cornerRadius: 10).fill(selected ? Brand.cream : Brand.bgCard))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(selected ? Color.clear : Brand.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private var datePickerCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("/ EXACT DATE & TIME")
                .font(Brand.Font.mono(Brand.Font.eyebrow, weight: .medium))
                .tracking(Brand.Tracking.eyebrow)
                .foregroundStyle(Brand.signal)
            DatePicker(
                "Follow-up at",
                selection: $selectedDate,
                in: Date.now...,
                displayedComponents: [.date, .hourAndMinute]
            )
            .datePickerStyle(.graphical)
            .tint(Brand.signal)
            .colorScheme(.dark)
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: Brand.Radius.card).fill(Brand.bgStrong))
        .overlay(RoundedRectangle(cornerRadius: Brand.Radius.card).strokeBorder(Brand.line, lineWidth: 1))
    }

    private var noteCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("/ NOTE")
                .font(Brand.Font.mono(Brand.Font.eyebrow, weight: .medium))
                .tracking(Brand.Tracking.eyebrow)
                .foregroundStyle(Brand.signal)
            Text("What to remember when you call back?")
                .font(Brand.Font.body(13))
                .foregroundStyle(Brand.creamMuted)
            TextField("e.g. ask for Amy after 11am, decision-maker on Thursdays", text: $note, axis: .vertical)
                .lineLimit(2...4)
                .font(Brand.Font.body(14))
                .foregroundStyle(Brand.cream)
                .padding(12)
                .background(Brand.bgCard)
                .clipShape(RoundedRectangle(cornerRadius: Brand.Radius.input))
                .overlay(RoundedRectangle(cornerRadius: Brand.Radius.input).strokeBorder(Brand.line, lineWidth: 1))
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: Brand.Radius.card).fill(Brand.bgStrong))
        .overlay(RoundedRectangle(cornerRadius: Brand.Radius.card).strokeBorder(Brand.line, lineWidth: 1))
    }

    @ViewBuilder
    private var stickyBar: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Brand.line).frame(height: 1)
            HStack(spacing: 10) {
                if initialDate != nil {
                    Button {
                        BrandHaptics.tap()
                        clear()
                    } label: {
                        Text("Clear")
                            .font(Brand.Font.mono(11, weight: .medium))
                            .tracking(Brand.Tracking.eyebrow)
                            .foregroundStyle(Brand.err)
                            .frame(maxWidth: .infinity)
                            .frame(height: 50)
                            .background(Capsule().fill(Brand.bgCard))
                            .overlay(Capsule().strokeBorder(Brand.err.opacity(0.4), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .disabled(saving)
                }

                Button {
                    save()
                } label: {
                    HStack(spacing: 6) {
                        if saving {
                            ProgressView().scaleEffect(0.7).tint(Brand.ink)
                        } else {
                            Image(systemName: "calendar.badge.plus").font(.system(size: 13))
                        }
                        Text(initialDate == nil ? "Schedule" : "Save")
                            .font(Brand.Font.body(15, weight: .semibold))
                    }
                    .foregroundStyle(Brand.ink)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(Capsule().fill(Brand.cream))
                }
                .buttonStyle(.plain)
                .disabled(saving)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(
                ZStack {
                    Brand.ink.opacity(0.96)
                    Rectangle().fill(.ultraThinMaterial).opacity(0.4)
                }
                .ignoresSafeArea(edges: .bottom)
            )
        }
    }

    private func save() {
        saving = true
        error = nil
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let noteToSave: String? = trimmed.isEmpty ? nil : trimmed
        let dateToSave = selectedDate
        Task {
            do {
                try await APIClient.shared.scheduleFollowup(
                    assignmentId: assignmentId,
                    at: dateToSave,
                    note: noteToSave
                )
                await MainActor.run {
                    saving = false
                    onSaved(dateToSave, noteToSave)
                    dismiss()
                }
            } catch {
                await MainActor.run {
                    saving = false
                    self.error = "Couldn't save — \(error.localizedDescription)"
                }
            }
        }
    }

    private func clear() {
        saving = true
        error = nil
        Task {
            do {
                try await APIClient.shared.scheduleFollowup(
                    assignmentId: assignmentId,
                    at: nil,
                    note: nil
                )
                await MainActor.run {
                    saving = false
                    onSaved(nil, nil)
                    dismiss()
                }
            } catch {
                await MainActor.run {
                    saving = false
                    self.error = "Couldn't clear — \(error.localizedDescription)"
                }
            }
        }
    }
}
