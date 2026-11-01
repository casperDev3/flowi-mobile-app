import AppIntents
import SwiftUI
import WidgetKit

// MARK: - Configuration

/// Що показує круглий віджет заблокованого екрана. rawValue — стабільний
/// ідентифікатор у конфігурації (spec §8.2), не перейменовувати.
enum FlowiLockContent: String, AppEnum, CaseIterable {
  case ringTasks
  case ringSteps
  case ringFinance
  case ringTime
  case actionTask
  case actionExpense
  case actionEvent
  case actionNote

  static let typeDisplayRepresentation: TypeDisplayRepresentation = TypeDisplayRepresentation(name: "Вміст")
  static let caseDisplayRepresentations: [FlowiLockContent: DisplayRepresentation] = [
    .ringTasks: DisplayRepresentation(title: "Кільце: завдання"),
    .ringSteps: DisplayRepresentation(title: "Кільце: кроки"),
    .ringFinance: DisplayRepresentation(title: "Кільце: фінанси"),
    .ringTime: DisplayRepresentation(title: "Кільце: час"),
    .actionTask: DisplayRepresentation(title: "Дія: завдання"),
    .actionExpense: DisplayRepresentation(title: "Дія: витрата"),
    .actionEvent: DisplayRepresentation(title: "Дія: подія"),
    .actionNote: DisplayRepresentation(title: "Дія: нотатка"),
  ]

  /// Дія замість кільця; nil — це кільце.
  var action: FlowiAction? {
    switch self {
    case .actionTask: return .task
    case .actionExpense: return .expense
    case .actionEvent: return .event
    case .actionNote: return .note
    default: return nil
    }
  }
}

/// Конфігурація віджета заблокованого екрана. Параметр має сенс лише для
/// круглого розміру — прямокутний і рядковий показують фіксований вміст.
struct FlowiLockIntent: WidgetConfigurationIntent {
  static let title: LocalizedStringResource = "Flowi на заблокованому екрані"
  static let description = IntentDescription("Оберіть кільце або дію для круглого віджета.")

  @Parameter(title: "Вміст", default: .ringTasks)
  var content: FlowiLockContent

  init() {}

  init(content: FlowiLockContent) {
    self.content = content
  }

  static var parameterSummary: some ParameterSummary {
    When(widgetFamily: .equalTo, .accessoryCircular) {
      Summary { \.$content }
    } otherwise: {
      Summary()
    }
  }
}

// MARK: - Timeline

struct FlowiLockEntry: TimelineEntry {
  let date: Date
  let snapshot: FlowiSnapshot
  /// Кроки: більше з HealthKit і знімка застосунку.
  let steps: Double
  let content: FlowiLockContent
}

struct FlowiLockProvider: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> FlowiLockEntry {
    FlowiLockEntry(date: Date(), snapshot: .preview, steps: FlowiSnapshot.preview.steps.value, content: .ringTasks)
  }

  func snapshot(for configuration: FlowiLockIntent, in context: Context) async -> FlowiLockEntry {
    if context.isPreview && FlowiSnapshot.load() == nil {
      return FlowiLockEntry(date: Date(), snapshot: .preview, steps: FlowiSnapshot.preview.steps.value,
                            content: configuration.content)
    }
    return await makeEntry(configuration: configuration, family: context.family)
  }

  func timeline(for configuration: FlowiLockIntent, in context: Context) async -> Timeline<FlowiLockEntry> {
    let entry = await makeEntry(configuration: configuration, family: context.family)
    let now = entry.date
    let midnight = Calendar.current.startOfDay(for: now).addingTimeInterval(24 * 3600 + 5)
    // Початок і кінець найближчої зустрічі та північ — окремі записи таймлайна:
    // вони спрацюють, навіть коли система відкладе перезавантаження (бюджет),
    // тож рядок «далі» не застаріває. Перезавантаження — та сама політика, що в
    // домашнього віджета (15 хв / північ).
    let boundaries = (entry.snapshot.meetingBoundaries(after: now).map { $0.addingTimeInterval(1) } + [midnight])
      .filter { $0 > now && $0 <= midnight }
    let entries = [entry] + Set(boundaries).sorted().map { Self.entry(entry, at: $0) }
    return Timeline(entries: entries, policy: .after(min(now.addingTimeInterval(15 * 60), midnight)))
  }

  /// Той самий знімок у момент `date`: після півночі числа обнуляються.
  static func entry(_ base: FlowiLockEntry, at date: Date) -> FlowiLockEntry {
    let snapshot = base.snapshot.normalized(for: date)
    let sameDay = FlowiSnapshot.dayKey(date) == FlowiSnapshot.dayKey(base.date)
    return FlowiLockEntry(date: date, snapshot: snapshot, steps: sameDay ? base.steps : snapshot.steps.value,
                          content: base.content)
  }

  private func makeEntry(configuration: FlowiLockIntent, family: WidgetFamily) async -> FlowiLockEntry {
    let now = Date()
    let snapshot = (FlowiSnapshot.load() ?? .empty).normalized(for: now)
    var steps = snapshot.steps.value
    // HealthKit — лише коли кільце кроків справді показане. На заблокованому
    // пристрої HealthKit недоступний (nil) — тоді число зі знімка.
    if family == .accessoryCircular, configuration.content == .ringSteps, snapshot.authed,
       let hk = await FlowiHealth.todaySteps(now: now) {
      steps = max(steps, hk)
    }
    return FlowiLockEntry(date: now, snapshot: snapshot, steps: steps, content: configuration.content)
  }
}

// MARK: - Circular

struct LockCircularView: View {
  let entry: FlowiLockEntry

  var body: some View {
    if let action = entry.content.action {
      ZStack {
        AccessoryWidgetBackground()
        Image(systemName: action.symbol)
          .font(.system(size: 24, weight: .semibold))
          .widgetAccentable()
      }
      .widgetURL(action.url)
      .accessibilityLabel(action.title(FlowiStrings(lang: entry.snapshot.lang)))
    } else {
      ring
    }
  }

  @ViewBuilder
  private var ring: some View {
    let snap = entry.snapshot
    let s = FlowiStrings(lang: snap.lang)
    let authed = snap.authed
    ZStack {
      AccessoryWidgetBackground()
      FlowiRing(segments: authed ? segments(snap) : [], track: Color.white.opacity(0.25), lineWidth: 5) {
        VStack(spacing: 0) {
          Image(systemName: symbol)
            .font(.system(size: 10, weight: .semibold))
            .widgetAccentable()
          if authed {
            centerValue(snap, s)
          } else {
            Text("—")
              .font(.system(size: 13, weight: .bold, design: .rounded))
          }
        }
      }
      .padding(2)
    }
    .widgetURL(link)
  }

  private var symbol: String {
    switch entry.content {
    case .ringSteps: return "figure.walk"
    case .ringFinance: return "creditcard.fill"
    case .ringTime: return "timer"
    default: return "checkmark"
    }
  }

  private var link: URL {
    switch entry.content {
    case .ringSteps: return FlowiLinks.steps
    case .ringFinance: return FlowiLinks.finance
    case .ringTime: return FlowiLinks.time
    default: return FlowiLinks.tasks
    }
  }

  /// Та сама математика, що в кілець великого домашнього віджета.
  private func segments(_ snap: FlowiSnapshot) -> [(Double, Color)] {
    switch entry.content {
    case .ringSteps:
      return [(entry.steps / max(snap.steps.goal, 1), FlowiColor.steps)]
    case .ringFinance:
      let flow = snap.finance.income + snap.finance.expense
      return flow > 0
        ? [(snap.finance.income / flow, FlowiColor.income), (snap.finance.expense / flow, FlowiColor.expense)]
        : []
    case .ringTime:
      return [(snap.runningStartedAt != nil ? 1 : snap.time.trackedSec / (8 * 3600), FlowiColor.time)]
    default:
      let t = snap.tasks
      return t.total > 0 ? [(Double(t.done) / Double(t.total), FlowiColor.tasks)] : []
    }
  }

  @ViewBuilder
  private func centerValue(_ snap: FlowiSnapshot, _ s: FlowiStrings) -> some View {
    switch entry.content {
    case .ringSteps:
      Text(FlowiFormat.compact(entry.steps, s))
        .font(.system(size: 12, weight: .bold, design: .rounded))
    case .ringFinance:
      Text(FlowiFormat.signedMoney(snap.finance.income - snap.finance.expense, symbol: snap.finance.symbol, s))
        .font(.system(size: 11, weight: .bold, design: .rounded))
    case .ringTime:
      if let startedAt = snap.runningStartedAt {
        Text(startedAt, style: .timer)
          .font(.system(size: 10, weight: .bold, design: .rounded).monospacedDigit())
          .multilineTextAlignment(.center)
      } else {
        Text(FlowiFormat.duration(snap.time.trackedSec, s))
          .font(.system(size: 11, weight: .bold, design: .rounded))
      }
    default:
      Text("\(snap.tasks.done)/\(snap.tasks.total)")
        .font(.system(size: 13, weight: .bold, design: .rounded))
    }
  }
}

// MARK: - Rectangular

struct LockRectangularView: View {
  let entry: FlowiLockEntry

  var body: some View {
    let snap = entry.snapshot
    let s = FlowiStrings(lang: snap.lang)
    if snap.authed {
      VStack(alignment: .leading, spacing: 2) {
        headline(snap, s)
        tasksGauge(snap, s)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .widgetURL(headlineURL(snap))
    } else {
      VStack(alignment: .leading, spacing: 2) {
        Text("Flowi")
          .font(.headline)
          .widgetAccentable()
        Text(s.signedOut)
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .widgetURL(FlowiLinks.tasks)
    }
  }

  private enum Headline {
    case meeting(FlowiSnapshot.Next.Meeting)
    case task(FlowiSnapshot.Next.Task)
    case none
  }

  /// Зустріч — якщо вона раніша за дедлайн завдання або в завдання немає часу.
  private func pick(_ snap: FlowiSnapshot) -> Headline {
    let meeting = snap.upcomingMeeting(at: entry.date)
    let task = snap.next?.task
    if let meeting {
      guard let task else { return .meeting(meeting) }
      guard task.hasTime, let deadline = task.deadlineDate, let start = meeting.startDate else {
        return .meeting(meeting)
      }
      return start <= deadline ? .meeting(meeting) : .task(task)
    }
    if let task { return .task(task) }
    return .none
  }

  private func headlineURL(_ snap: FlowiSnapshot) -> URL {
    switch pick(snap) {
    case .meeting: return URL(string: "ftrackingapp:///calendar")!
    default: return FlowiLinks.tasks
    }
  }

  @ViewBuilder
  private func headline(_ snap: FlowiSnapshot, _ s: FlowiStrings) -> some View {
    switch pick(snap) {
    case .meeting(let meeting):
      Label {
        Text(meeting.title).font(.headline).lineLimit(1)
      } icon: {
        Image(systemName: "calendar")
      }
      .widgetAccentable()
      Text(meetingCaption(meeting, s))
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(1)
    case .task(let task):
      Label {
        Text(task.title).font(.headline).lineLimit(1)
      } icon: {
        Image(systemName: task.overdue ? "exclamationmark.circle" : "circle")
      }
      .widgetAccentable()
      Text(taskCaption(task, s))
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(1)
    case .none:
      Text("Flowi")
        .font(.headline)
        .widgetAccentable()
      Text(s.nothingPlanned)
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
  }

  private func meetingCaption(_ meeting: FlowiSnapshot.Next.Meeting, _ s: FlowiStrings) -> String {
    var parts: [String] = []
    if let start = meeting.startDate {
      if start <= entry.date {
        parts.append(s.now)
      } else if Calendar.current.isDate(start, inSameDayAs: entry.date) {
        parts.append(FlowiLockFormat.time(start, s))
      } else {
        parts.append("\(s.tomorrow) \(FlowiLockFormat.time(start, s))")
      }
    }
    if let location = meeting.location, !location.isEmpty { parts.append(location) }
    return parts.joined(separator: " · ")
  }

  private func taskCaption(_ task: FlowiSnapshot.Next.Task, _ s: FlowiStrings) -> String {
    if task.overdue { return s.overdue }
    if task.hasTime, let deadline = task.deadlineDate { return FlowiLockFormat.time(deadline, s) }
    return s.today
  }

  private func tasksGauge(_ snap: FlowiSnapshot, _ s: FlowiStrings) -> some View {
    let done = snap.tasks.done
    let total = snap.tasks.total
    return HStack(spacing: 6) {
      Gauge(value: Double(done), in: 0...Double(max(total, 1))) {
        Text(s.tasks)
      }
      .gaugeStyle(.accessoryLinearCapacity)
      .widgetAccentable()
      Text("\(done)/\(total)")
        .font(.system(size: 12, weight: .semibold, design: .rounded).monospacedDigit())
    }
  }
}

// MARK: - Inline

struct LockInlineView: View {
  let entry: FlowiLockEntry

  var body: some View {
    let snap = entry.snapshot
    let s = FlowiStrings(lang: snap.lang)
    if !snap.authed {
      Text(s.signedOut)
    } else if let startedAt = snap.runningStartedAt {
      Text("\(snap.tasks.done)/\(snap.tasks.total) \(s.tasksOfDay) · ⏱ ") + Text(startedAt, style: .timer)
    } else {
      Text("\(snap.tasks.done)/\(snap.tasks.total) \(s.tasksOfDay) · ⏱ \(FlowiFormat.duration(snap.time.trackedSec, s))")
    }
  }
}

enum FlowiLockFormat {
  static func time(_ date: Date, _ s: FlowiStrings) -> String {
    let f = DateFormatter()
    f.locale = s.locale
    f.dateFormat = "HH:mm"
    return f.string(from: date)
  }
}

// MARK: - Widget

struct FlowiLockWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: FlowiLockEntry

  var body: some View {
    Group {
      switch family {
      case .accessoryCircular: LockCircularView(entry: entry)
      case .accessoryInline: LockInlineView(entry: entry)
      default: LockRectangularView(entry: entry)
      }
    }
    .containerBackground(for: .widget) { Color.clear }
  }
}

struct FlowiLockWidget: Widget {
  let kind = "FlowiLockWidget"

  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: kind, intent: FlowiLockIntent.self, provider: FlowiLockProvider()) { entry in
      FlowiLockWidgetView(entry: entry)
    }
    .configurationDisplayName("Flowi")
    .description("Кільце дня або швидка дія, найближча подія та прогрес завдань.")
    .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
  }
}
