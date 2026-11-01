import SwiftUI
import WatchKit

// Екрани годинника (§9): вертикальні сторінки Сьогодні → Таймер → Зустрічі,
// «+» угорі відкриває аркуш Витрата / Завдання / Нотатка.

let flowiAccent = Color(red: 0x7C / 255, green: 0x3A / 255, blue: 0xED / 255)
let flowiTimeAccent = Color(red: 0x63 / 255, green: 0x66 / 255, blue: 0xF1 / 255)

extension Color {
  /// `#RRGGBB` → Color; некоректне значення → nil.
  init?(hex: String?) {
    guard var s = hex?.trimmingCharacters(in: .whitespaces), !s.isEmpty else { return nil }
    if s.hasPrefix("#") { s.removeFirst() }
    guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
    self.init(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
  }
}

/// SF Symbol зі знімка або запасний, якщо такого символу немає.
func symbolName(_ name: String?, fallback: String) -> String {
  guard let name, !name.isEmpty, UIImage(systemName: name) != nil else { return fallback }
  return name
}

// MARK: - Root

struct RootView: View {
  @EnvironmentObject private var store: WatchStore

  var body: some View {
    NavigationStack {
      Group {
        if store.isSignedOut {
          SignedOutView()
        } else if store.snapshot == nil {
          VStack(spacing: 8) {
            ProgressView()
            Text(store.t("Loading…")).font(.footnote).foregroundStyle(.secondary)
          }
          .flowiPage(store.t("Today"))
        } else {
          TabView {
            TodayPage()
            TimerPage()
            MeetingsPage()
          }
          .tabViewStyle(.verticalPage)
        }
      }
    }
    .sheet(isPresented: $store.showAdd) {
      AddSheet().environmentObject(store)
    }
    .overlay(alignment: .bottom) {
      if let toast = store.toast {
        Text(toast)
          .font(.footnote)
          .multilineTextAlignment(.center)
          .padding(.horizontal, 10)
          .padding(.vertical, 6)
          .background(.ultraThickMaterial, in: Capsule())
          .padding(.bottom, 4)
          .transition(.opacity)
          .onTapGesture { store.toast = nil }
      }
    }
    .animation(.easeInOut(duration: 0.2), value: store.toast)
  }
}

private struct PageChrome: ViewModifier {
  @EnvironmentObject private var store: WatchStore
  let title: String

  func body(content: Content) -> some View {
    content
      .navigationTitle(title)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button {
            store.showAdd = true
          } label: {
            Image(systemName: "plus")
          }
          .accessibilityLabel(store.t("Add"))
        }
      }
  }
}

extension View {
  func flowiPage(_ title: String) -> some View { modifier(PageChrome(title: title)) }
}

struct SignedOutView: View {
  @EnvironmentObject private var store: WatchStore

  var body: some View {
    ScrollView {
      VStack(spacing: 10) {
        Image(systemName: "iphone.and.arrow.forward")
          .font(.system(size: 34))
          .foregroundStyle(flowiAccent)
        Text(store.t("Open Flowi on iPhone"))
          .font(.headline)
          .multilineTextAlignment(.center)
        Text(store.t("Sign in on iPhone and keep it nearby — the watch connects automatically."))
          .font(.footnote)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
      }
      .padding(.top, 8)
    }
    .navigationTitle("Flowi")
  }
}

// MARK: - Today

struct TodayPage: View {
  @EnvironmentObject private var store: WatchStore

  var body: some View {
    let snapshot = store.snapshot
    let tasks = snapshot?.tasks ?? []
    let habits = snapshot?.habits ?? []
    let counts = snapshot?.taskCounts
    List {
      Section {
        if tasks.isEmpty {
          Text(store.t("No tasks for today"))
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
        ForEach(tasks) { task in
          TaskRow(task: task)
            .swipeActions(edge: .leading) {
              if task.canComplete == true && !task.isDone {
                Button {
                  store.completeTask(task)
                } label: {
                  Label(store.t("Complete"), systemImage: "checkmark")
                }
                .tint(.green)
              }
            }
            .swipeActions(edge: .trailing) {
              if !task.isDone && task.timerId == nil {
                Button {
                  store.startTaskTimer(task)
                } label: {
                  Label(store.t("Start timer"), systemImage: "play.fill")
                }
                .tint(flowiTimeAccent)
              }
            }
        }
        TextFieldLink(prompt: Text(store.t("Task title"))) {
          Label(store.t("New task"), systemImage: "plus.circle.fill")
            .foregroundStyle(flowiAccent)
        } onSubmit: { text in
          store.createTask(text)
        }
      } header: {
        HStack {
          Text(store.t("Tasks"))
          Spacer()
          if let total = counts?.total, total > 0 {
            Text("\(counts?.done ?? 0)/\(total)").monospacedDigit()
          }
        }
      }

      if !habits.isEmpty {
        Section(store.t("Habits")) {
          ForEach(habits) { habit in
            HabitRow(habit: habit)
          }
        }
      }

      if !store.queue.isEmpty {
        Label(String(format: store.t("Waiting to sync: %d"), store.queue.count), systemImage: "arrow.triangle.2.circlepath")
          .font(.footnote)
          .foregroundStyle(.secondary)
          .listRowBackground(Color.clear)
      }
    }
    .flowiPage(store.t("Today"))
  }
}

struct TaskRow: View {
  @EnvironmentObject private var store: WatchStore
  let task: WTask

  var body: some View {
    HStack(alignment: .top, spacing: 8) {
      if task.canComplete == true && !task.isDone {
        Button {
          store.completeTask(task)
        } label: {
          Image(systemName: "circle")
            .font(.title3)
            .foregroundStyle(task.overdue == true ? .red : flowiAccent)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(store.t("Complete"))
      } else {
        Image(systemName: task.isDone ? "checkmark.circle.fill" : "lock.circle")
          .font(.title3)
          .foregroundStyle(task.isDone ? Color.green : Color.secondary)
      }
      NavigationLink {
        TaskDetailView(taskId: task.id)
      } label: {
        TaskRowLabel(task: task)
      }
    }
  }
}

private struct TaskRowLabel: View {
  @EnvironmentObject private var store: WatchStore
  let task: WTask

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(task.title ?? "")
        .lineLimit(2)
        .strikethrough(task.isDone)
        .foregroundStyle(task.isDone ? .secondary : .primary)
      if let line = TaskFormat.subtitle(task, store: store) {
        Text(line)
          .font(.caption2)
          .foregroundStyle(task.overdue == true && !task.isDone ? .red : .secondary)
          .lineLimit(1)
      }
      if let timerId = task.timerId,
         let timer = store.snapshot?.timers?.active.first(where: { $0.id == timerId }) {
        Label {
          Text(timer.startDate, style: .timer).monospacedDigit()
        } icon: {
          Image(systemName: "timer")
        }
        .font(.caption2)
        .foregroundStyle(flowiTimeAccent)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

enum TaskFormat {
  @MainActor
  static func subtitle(_ task: WTask, store: WatchStore) -> String? {
    var parts: [String] = []
    if task.overdue == true && !task.isDone {
      parts.append(store.t("Overdue"))
    } else if task.hasTime == true, let date = FlowiDate.parse(task.deadline) {
      parts.append(date.formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(L10n.locale(store.lang))))
    }
    if let project = task.projectName, !project.isEmpty { parts.append(project) }
    return parts.isEmpty ? nil : parts.joined(separator: " · ")
  }
}

struct TaskDetailView: View {
  @EnvironmentObject private var store: WatchStore
  @Environment(\.dismiss) private var dismiss
  let taskId: String

  var body: some View {
    let task = store.snapshot?.tasks.first(where: { $0.id == taskId })
    ScrollView {
      if let task {
        VStack(alignment: .leading, spacing: 8) {
          Text(task.title ?? "").font(.headline)
          if let line = TaskFormat.subtitle(task, store: store) {
            Text(line).font(.footnote).foregroundStyle(task.overdue == true && !task.isDone ? .red : .secondary)
          }
          if task.canComplete == true && !task.isDone {
            Button {
              store.completeTask(task)
              dismiss()
            } label: {
              Label(store.t("Complete"), systemImage: "checkmark")
            }
            .tint(.green)
          }
          if !task.isDone {
            if let timerId = task.timerId,
               let timer = store.snapshot?.timers?.active.first(where: { $0.id == timerId }) {
              Text(timer.startDate, style: .timer)
                .font(.title3.monospacedDigit())
                .foregroundStyle(flowiTimeAccent)
              Button(role: .destructive) {
                store.stopTimer(timer)
              } label: {
                Label(store.t("Stop"), systemImage: "stop.fill")
              }
            } else {
              Button {
                store.startTaskTimer(task)
              } label: {
                Label(store.t("Start timer"), systemImage: "play.fill")
              }
              .tint(flowiTimeAccent)
            }
          }
        }
      } else {
        Text(store.t("Not found")).foregroundStyle(.secondary)
      }
    }
  }
}

struct HabitRow: View {
  @EnvironmentObject private var store: WatchStore
  let habit: WHabit

  var body: some View {
    let done = habit.doneToday == true
    let color = Color(hex: habit.color) ?? .green
    Button {
      store.setHabit(habit, done: !done)
    } label: {
      HStack(spacing: 8) {
        Image(systemName: symbolName(habit.icon, fallback: "circle.dashed"))
          .foregroundStyle(color)
          .frame(width: 22)
        Text(habit.title ?? "")
          .lineLimit(2)
          .frame(maxWidth: .infinity, alignment: .leading)
        if let streak = habit.streak, streak > 0 {
          HStack(spacing: 1) {
            Image(systemName: "flame.fill")
            Text("\(streak)").monospacedDigit()
          }
          .font(.caption2)
          .foregroundStyle(.orange)
        }
        Image(systemName: done ? "checkmark.circle.fill" : "circle")
          .foregroundStyle(done ? color : .secondary)
      }
    }
  }
}

// MARK: - Timer

struct TimerPage: View {
  @EnvironmentObject private var store: WatchStore

  var body: some View {
    let timers = store.snapshot?.timers
    let active = timers?.active ?? []
    List {
      Section {
        if active.isEmpty {
          Text(store.t("No running timers"))
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
        ForEach(active) { timer in
          VStack(alignment: .leading, spacing: 4) {
            Text(timer.label ?? "")
              .lineLimit(2)
            if let project = timer.projectName, !project.isEmpty {
              Text(project).font(.caption2).foregroundStyle(.secondary)
            }
            Text(timer.startDate, style: .timer)
              .font(.title3.monospacedDigit())
              .foregroundStyle(flowiTimeAccent)
            Button(role: .destructive) {
              store.stopTimer(timer)
            } label: {
              Label(store.t("Stop"), systemImage: "stop.fill")
            }
          }
          .padding(.vertical, 2)
        }
      } header: {
        Text(store.t("Running"))
      }

      Section {
        TimelineView(.periodic(from: .now, by: 30)) { context in
          let running = active.reduce(0.0) { $0 + max(0, context.date.timeIntervalSince($1.startDate)) }
          HStack {
            Text(store.t("Tracked today"))
            Spacer()
            Text(L10n.duration((timers?.trackedTodaySec ?? 0) + running, lang: store.lang))
              .monospacedDigit()
              .foregroundStyle(flowiTimeAccent)
          }
          .font(.footnote)
        }
      }

      Section(store.t("Start without task")) {
        TextFieldLink(prompt: Text(store.t("What are you doing?"))) {
          Label(store.t("New timer"), systemImage: "play.circle.fill")
            .foregroundStyle(flowiTimeAccent)
        } onSubmit: { text in
          store.startAdHocTimer(text)
        }
        ForEach(Array((timers?.recentLabels ?? []).prefix(3)), id: \.self) { label in
          Button {
            store.startAdHocTimer(label)
          } label: {
            Label(label, systemImage: "clock.arrow.circlepath")
              .lineLimit(1)
          }
        }
      }
    }
    .flowiPage(store.t("Timer"))
  }
}

// MARK: - Meetings

struct MeetingsPage: View {
  @EnvironmentObject private var store: WatchStore

  var body: some View {
    // Секції — за поточною датою годинника, не за `day` знімка: кешований знімок,
    // що пережив північ, інакше підписав би вчорашні зустрічі як «Сьогодні».
    let today = FlowiDate.dayKey(Date())
    let tomorrow = FlowiDate.tomorrowKey()
    let all = store.snapshot?.meetings ?? []
    let todays = all.filter { $0.date == today }
    let later = all.filter { $0.date == tomorrow }
    let meetings = todays + later
    List {
      if meetings.isEmpty {
        Text(store.t("No meetings today or tomorrow"))
          .font(.footnote)
          .foregroundStyle(.secondary)
      }
      if !todays.isEmpty {
        Section(store.t("Today")) {
          ForEach(todays) { MeetingRow(meeting: $0) }
        }
      }
      if !later.isEmpty {
        Section(store.t("Tomorrow")) {
          ForEach(later) { MeetingRow(meeting: $0) }
        }
      }
    }
    .flowiPage(store.t("Meetings"))
  }
}

struct MeetingRow: View {
  let meeting: WMeeting

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(meeting.time ?? "")
        .font(.caption.monospacedDigit().weight(.semibold))
        .foregroundStyle(flowiAccent)
      Text(meeting.title ?? "")
        .lineLimit(2)
      if let location = meeting.location, !location.isEmpty {
        Label(location, systemImage: "mappin")
          .font(.caption2)
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
    }
  }
}

// MARK: - Add sheet

struct AddSheet: View {
  @EnvironmentObject private var store: WatchStore

  var body: some View {
    NavigationStack {
      List {
        NavigationLink {
          ExpenseKeypadView()
        } label: {
          Label(store.t("Expense"), systemImage: "creditcard.fill")
        }
        TextFieldLink(prompt: Text(store.t("Task title"))) {
          Label(store.t("Task"), systemImage: "checkmark.circle.fill")
        } onSubmit: { text in
          guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
          store.createTask(text)
          finish()
        }
        TextFieldLink(prompt: Text(store.t("Note text"))) {
          Label(store.t("Note"), systemImage: "square.and.pencil")
        } onSubmit: { text in
          guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
          store.createNote(text)
          finish()
        }
      }
      .navigationTitle(store.t("Add"))
    }
  }

  private func finish() {
    store.showAdd = false
    store.showToast(store.t("Saved"), success: true)
  }
}

// MARK: - Expense: keypad → category → account

struct ExpenseKeypadView: View {
  @EnvironmentObject private var store: WatchStore
  @State private var text = ""
  @State private var goNext = false

  private var accounts: [WAccount] { store.snapshot?.finance?.accounts ?? [] }
  private var account: WAccount? { ExpenseDefaults.account(store) }
  private var maxDecimals: Int { min(account?.decimals ?? 2, 2) }
  private var separator: String { store.lang == "en" ? "." : "," }
  private var amount: Double { Double(text.replacingOccurrences(of: ",", with: ".")) ?? 0 }

  var body: some View {
    Group {
      if accounts.isEmpty {
        Text(store.t("No accounts — add one in Flowi on iPhone"))
          .font(.footnote)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
      } else {
        VStack(spacing: 4) {
          HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text(text.isEmpty ? "0" : text)
              .font(.title2.monospacedDigit().weight(.semibold))
              .foregroundStyle(text.isEmpty ? .secondary : .primary)
              .lineLimit(1)
              .minimumScaleFactor(0.5)
            Text(account?.symbol ?? "")
              .font(.headline)
              .foregroundStyle(.secondary)
          }
          .frame(maxWidth: .infinity, alignment: .trailing)
          Grid(horizontalSpacing: 4, verticalSpacing: 4) {
            ForEach([["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], [separator, "0", "⌫"]], id: \.self) { row in
              GridRow {
                ForEach(row, id: \.self) { key in
                  KeypadKey(key: key) { tap(key) }
                }
              }
            }
          }
        }
      }
    }
    .navigationTitle(store.t("Expense"))
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button {
          goNext = true
        } label: {
          Image(systemName: "arrow.right")
        }
        .disabled(amount <= 0)
        .accessibilityLabel(store.t("Next"))
      }
    }
    .navigationDestination(isPresented: $goNext) {
      ExpenseCategoryView(amount: amount)
    }
  }

  private func tap(_ key: String) {
    WKInterfaceDevice.current().play(.click)
    if key == "⌫" {
      if !text.isEmpty { text.removeLast() }
      return
    }
    if key == separator {
      guard maxDecimals > 0, !text.contains(separator) else { return }
      text = (text.isEmpty ? "0" : text) + separator
      return
    }
    if let range = text.range(of: separator) {
      guard text[range.upperBound...].count < maxDecimals else { return }
    } else {
      guard text.count < 9 else { return }
      if text == "0" { text = "" }
    }
    text += key
  }
}

private struct KeypadKey: View {
  let key: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Group {
        if key == "⌫" {
          Image(systemName: "delete.left")
        } else {
          Text(key).font(.title3.monospacedDigit())
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Color.gray.opacity(0.25), in: RoundedRectangle(cornerRadius: 8))
    }
    .buttonStyle(.plain)
  }
}

enum ExpenseDefaults {
  /// Рахунок за замовчуванням: останній використаний на годиннику, інакше defaultAccountId знімка.
  @MainActor
  static func account(_ store: WatchStore) -> WAccount? {
    let accounts = store.snapshot?.finance?.accounts ?? []
    if let last = store.lastAccountId, let match = accounts.first(where: { $0.id == last }) { return match }
    if let def = store.snapshot?.finance?.defaultAccountId, let match = accounts.first(where: { $0.id == def }) { return match }
    return accounts.first
  }
}

struct ExpenseCategoryView: View {
  @EnvironmentObject private var store: WatchStore
  let amount: Double

  var body: some View {
    let categories = Array((store.snapshot?.finance?.categories ?? []).prefix(6))
    ScrollView {
      LazyVGrid(columns: [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)], spacing: 6) {
        ForEach(categories, id: \.self) { category in
          NavigationLink {
            ExpenseConfirmView(amount: amount, category: category)
          } label: {
            VStack(spacing: 3) {
              Image(systemName: symbolName(category.icon, fallback: "ellipsis.circle.fill"))
                .font(.title3)
              Text(category.name)
                .font(.caption2)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(Color(red: 0x0E / 255, green: 0xA5 / 255, blue: 0xE9 / 255).opacity(0.22), in: RoundedRectangle(cornerRadius: 10))
          }
          .buttonStyle(.plain)
        }
      }
    }
    .navigationTitle(store.t("Category"))
  }
}

struct ExpenseConfirmView: View {
  @EnvironmentObject private var store: WatchStore
  let amount: Double
  let category: WCategory
  @State private var accountId: String = ""

  var body: some View {
    let accounts = store.snapshot?.finance?.accounts ?? []
    let account = accounts.first(where: { $0.id == accountId }) ?? ExpenseDefaults.account(store)
    // Точність — обраного рахунку (могли перемкнути на рахунок без копійок).
    let rounded = WatchStore.roundedAmount(amount, account: account)
    List {
      VStack(alignment: .leading, spacing: 2) {
        Text(Self.format(rounded, account: account, lang: store.lang))
          .font(.title3.monospacedDigit().weight(.semibold))
        Label(category.name, systemImage: symbolName(category.icon, fallback: "ellipsis.circle.fill"))
          .font(.footnote)
          .foregroundStyle(.secondary)
      }
      .listRowBackground(Color.clear)
      if account != nil, rounded <= 0 {
        Text(store.t("Amount is too small for this account"))
          .font(.footnote)
          .foregroundStyle(.orange)
          .listRowBackground(Color.clear)
      }
      if accounts.count > 1 {
        Picker(store.t("Account"), selection: $accountId) {
          ForEach(accounts) { item in
            Text(item.name ?? item.id).tag(item.id)
          }
        }
        .pickerStyle(.navigationLink)
      } else if let account {
        LabeledContent(store.t("Account"), value: account.name ?? "")
      }
      Button {
        guard let account else { return }
        guard store.createExpense(amount: amount, category: category.name, account: account) else {
          store.showToast(store.t("Amount is too small for this account"))
          return
        }
        store.showAdd = false
        store.showToast(store.t("Saved"), success: true)
      } label: {
        Label(store.t("Save"), systemImage: "checkmark")
          .frame(maxWidth: .infinity)
      }
      .tint(.green)
      .disabled(account == nil || rounded <= 0)
    }
    .navigationTitle(store.t("Account"))
    .onAppear {
      if accountId.isEmpty { accountId = ExpenseDefaults.account(store)?.id ?? "" }
    }
  }

  static func format(_ amount: Double, account: WAccount?, lang: String) -> String {
    let decimals = account?.decimals ?? 2
    let style = FloatingPointFormatStyle<Double>.number
      .precision(.fractionLength(0...max(0, decimals)))
      .locale(L10n.locale(lang))
    let symbol = account?.symbol ?? account?.currency ?? ""
    return "\(amount.formatted(style)) \(symbol)"
  }
}
