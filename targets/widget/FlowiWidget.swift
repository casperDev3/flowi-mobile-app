import SwiftUI
import WidgetKit

// MARK: - Timeline

struct FlowiEntry: TimelineEntry {
  let date: Date
  let snapshot: FlowiSnapshot
  /// Кроки: більше з HealthKit і знімка застосунку.
  let steps: Double
  let action: FlowiAction
}

struct FlowiProvider: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> FlowiEntry {
    FlowiEntry(date: Date(), snapshot: .preview, steps: FlowiSnapshot.preview.steps.value, action: .task)
  }

  func snapshot(for configuration: FlowiWidgetIntent, in context: Context) async -> FlowiEntry {
    if context.isPreview && FlowiSnapshot.load() == nil {
      return FlowiEntry(date: Date(), snapshot: .preview, steps: FlowiSnapshot.preview.steps.value,
                        action: configuration.action)
    }
    return await makeEntry(configuration: configuration, family: context.family)
  }

  func timeline(for configuration: FlowiWidgetIntent, in context: Context) async -> Timeline<FlowiEntry> {
    let entry = await makeEntry(configuration: configuration, family: context.family)
    let now = entry.date
    // Кроки йдуть самі собою — оновлюємось кожні 15 хв і обовʼязково після
    // півночі, щоб не показувати вчорашні числа.
    let quarter = now.addingTimeInterval(15 * 60)
    let midnight = Calendar.current.startOfDay(for: now).addingTimeInterval(24 * 3600 + 5)
    return Timeline(entries: [entry], policy: .after(min(quarter, midnight)))
  }

  private func makeEntry(configuration: FlowiWidgetIntent, family: WidgetFamily) async -> FlowiEntry {
    let now = Date()
    let snapshot = (FlowiSnapshot.load() ?? .empty).normalized(for: now)
    var steps = snapshot.steps.value
    // HealthKit питаємо лише для великого розміру — кільця є тільки там.
    if family == .systemLarge, snapshot.authed, let hk = await FlowiHealth.todaySteps(now: now) {
      steps = max(steps, hk)
    }
    return FlowiEntry(date: now, snapshot: snapshot, steps: steps, action: configuration.action)
  }
}

// MARK: - Formatting

enum FlowiFormat {
  static func compact(_ value: Double, _ s: FlowiStrings) -> String {
    let abs = Swift.abs(value)
    let f = NumberFormatter()
    f.locale = s.locale
    f.numberStyle = .decimal
    if abs >= 10_000 {
      f.maximumFractionDigits = abs >= 100_000 ? 0 : 1
      let text = f.string(from: NSNumber(value: abs / 1000)) ?? "\(Int(abs / 1000))"
      return "\(text)\(s.lang == "en" ? "" : " ")\(s.thousandShort)"
    }
    f.maximumFractionDigits = abs.rounded() == abs ? 0 : (abs < 100 ? 2 : 0)
    return f.string(from: NSNumber(value: abs)) ?? "\(Int(abs))"
  }

  static func signedMoney(_ value: Double, symbol: String, _ s: FlowiStrings) -> String {
    let sign = value > 0 ? "+" : (value < 0 ? "−" : "")
    return "\(sign)\(compact(value, s))\(symbol)"
  }

  static func duration(_ seconds: Double, _ s: FlowiStrings) -> String {
    let total = Int(max(0, seconds)) / 60
    let h = total / 60
    let m = total % 60
    if h == 0 { return "\(m)\(s.minutesShort)" }
    return m == 0 ? "\(h)\(s.hoursShort)" : "\(h)\(s.hoursShort) \(m)\(s.minutesShort)"
  }
}

// MARK: - Palette

enum FlowiColor {
  static let income = Color(red: 0x10 / 255, green: 0xB9 / 255, blue: 0x81 / 255)   // #10B981
  static let expense = Color(red: 0xEF / 255, green: 0x44 / 255, blue: 0x44 / 255)  // #EF4444
  static let steps = Color(red: 0x10 / 255, green: 0xB9 / 255, blue: 0x81 / 255)
  static let tasks = Color(red: 0x63 / 255, green: 0x66 / 255, blue: 0xF1 / 255)    // #6366F1
  static let time = Color(red: 0xF5 / 255, green: 0x9E / 255, blue: 0x0B / 255)     // #F59E0B
  static let background = Color("$widgetBackground")
}

// MARK: - Ring

struct FlowiRing<Center: View>: View {
  /// Сегменти по колу: частка (0…1) і колір, по черзі від 12 години.
  let segments: [(Double, Color)]
  let track: Color
  let lineWidth: CGFloat
  @ViewBuilder let center: () -> Center

  var body: some View {
    ZStack {
      Circle().stroke(track, lineWidth: lineWidth)
      ForEach(Array(arcs.enumerated()), id: \.offset) { _, arc in
        Circle()
          .trim(from: arc.from, to: arc.to)
          .stroke(arc.color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
          .rotationEffect(.degrees(-90))
      }
      center()
        .padding(lineWidth + 2)
        .minimumScaleFactor(0.5)
        .lineLimit(1)
    }
  }

  private var arcs: [(from: CGFloat, to: CGFloat, color: Color)] {
    var start = 0.0
    var out: [(from: CGFloat, to: CGFloat, color: Color)] = []
    for (fraction, color) in segments {
      let f = min(max(fraction, 0), 1 - start)
      guard f > 0.001 else { continue }
      out.append((CGFloat(start), CGFloat(start + f), color))
      start += f
    }
    return out
  }
}

struct RingTile<Center: View>: View {
  let title: String
  let caption: String
  let url: URL
  let segments: [(Double, Color)]
  @ViewBuilder let center: () -> Center
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    Link(destination: url) {
      VStack(spacing: 4) {
        FlowiRing(
          segments: segments,
          track: scheme == .dark ? Color.white.opacity(0.12) : Color.black.opacity(0.08),
          lineWidth: 7,
          center: center
        )
        .frame(width: 60, height: 60)
        Text(title)
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(.primary)
          .lineLimit(1)
        Text(caption)
          .font(.system(size: 9.5, weight: .medium))
          .foregroundStyle(.secondary)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
      }
      .frame(maxWidth: .infinity)
    }
  }
}

// MARK: - Action button

struct ActionButton: View {
  let action: FlowiAction
  let strings: FlowiStrings
  var compact = false

  var body: some View {
    Link(destination: action.url) {
      HStack(spacing: 8) {
        Image(systemName: action.symbol)
          .font(.system(size: compact ? 15 : 17, weight: .semibold))
          .foregroundStyle(action.tint)
          .frame(width: 22)
        Text(action.title(strings))
          .font(.system(size: compact ? 12.5 : 13.5, weight: .semibold))
          .foregroundStyle(.primary)
          .lineLimit(2)
          .minimumScaleFactor(0.8)
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 10)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .fill(action.tint.opacity(0.14))
      )
    }
  }
}

struct ActionGrid: View {
  let strings: FlowiStrings
  var spacing: CGFloat = 8

  var body: some View {
    VStack(spacing: spacing) {
      HStack(spacing: spacing) {
        ActionButton(action: .task, strings: strings)
        ActionButton(action: .expense, strings: strings)
      }
      HStack(spacing: spacing) {
        ActionButton(action: .event, strings: strings)
        ActionButton(action: .note, strings: strings)
      }
    }
  }
}

// MARK: - Sizes

struct SmallView: View {
  let entry: FlowiEntry

  var body: some View {
    let strings = FlowiStrings(lang: entry.snapshot.lang)
    let action = entry.action
    VStack(alignment: .leading, spacing: 8) {
      ZStack {
        Circle().fill(action.tint.opacity(0.16))
        Image(systemName: action.symbol)
          .font(.system(size: 26, weight: .semibold))
          .foregroundStyle(action.tint)
      }
      .frame(width: 54, height: 54)
      Spacer(minLength: 0)
      Text(action.title(strings))
        .font(.system(size: 17, weight: .bold))
        .foregroundStyle(.primary)
        .lineLimit(2)
        .minimumScaleFactor(0.8)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .widgetURL(action.url)
  }
}

struct MediumView: View {
  let entry: FlowiEntry

  var body: some View {
    ActionGrid(strings: FlowiStrings(lang: entry.snapshot.lang))
  }
}

struct LargeView: View {
  let entry: FlowiEntry

  var body: some View {
    let snap = entry.snapshot
    let s = FlowiStrings(lang: snap.lang)
    VStack(spacing: 12) {
      HStack {
        Text("Flowi")
          .font(.system(size: 13, weight: .bold))
          .foregroundStyle(Color.accentColor)
        Text(s.today)
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(.secondary)
        Spacer()
      }
      if snap.authed {
        rings(snap, s)
      } else {
        Text(s.signedOut)
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(.secondary)
          .frame(maxWidth: .infinity, minHeight: 96)
      }
      ActionGrid(strings: s)
    }
  }

  @ViewBuilder
  private func rings(_ snap: FlowiSnapshot, _ s: FlowiStrings) -> some View {
    let income = snap.finance.income
    let expense = snap.finance.expense
    let flow = income + expense
    let net = income - expense
    let stepsGoal = max(snap.steps.goal, 1)
    let tasks = snap.tasks
    let startedAt = snap.runningStartedAt

    HStack(alignment: .top, spacing: 4) {
      // 1. Фінанси сьогодні: дохід (зелений) проти витрат (червоний).
      RingTile(
        title: s.finance,
        caption: "+\(FlowiFormat.compact(income, s)) · −\(FlowiFormat.compact(expense, s))",
        url: FlowiLinks.finance,
        segments: flow > 0 ? [(income / flow, FlowiColor.income), (expense / flow, FlowiColor.expense)] : []
      ) {
        Text(FlowiFormat.signedMoney(net, symbol: snap.finance.symbol, s))
          .font(.system(size: 12, weight: .bold, design: .rounded))
          .foregroundStyle(net < 0 ? FlowiColor.expense : (net > 0 ? FlowiColor.income : .primary))
      }
      // 2. Кроки проти цілі.
      RingTile(
        title: s.steps,
        caption: "\(s.ofGoal) \(FlowiFormat.compact(stepsGoal, s))",
        url: FlowiLinks.steps,
        segments: [(entry.steps / stepsGoal, FlowiColor.steps)]
      ) {
        Text(FlowiFormat.compact(entry.steps, s))
          .font(.system(size: 13, weight: .bold, design: .rounded))
      }
      // 3. Завершеність дня — лише завдання.
      RingTile(
        title: s.tasks,
        caption: s.today,
        url: FlowiLinks.tasks,
        segments: tasks.total > 0 ? [(Double(tasks.done) / Double(tasks.total), FlowiColor.tasks)] : []
      ) {
        Text("\(tasks.done)/\(tasks.total)")
          .font(.system(size: 14, weight: .bold, design: .rounded))
      }
      // 4. Час: живий таймер або записане сьогодні (кільце — частка 8-годинного дня).
      RingTile(
        title: s.time,
        caption: startedAt != nil ? (snap.time.running?.label.isEmpty == false ? snap.time.running!.label : s.running) : s.today,
        url: FlowiLinks.time,
        segments: [(startedAt != nil ? 1 : snap.time.trackedSec / (8 * 3600), FlowiColor.time)]
      ) {
        if let startedAt {
          Text(startedAt, style: .timer)
            .font(.system(size: 11, weight: .bold, design: .rounded).monospacedDigit())
            .multilineTextAlignment(.center)
        } else {
          Text(FlowiFormat.duration(snap.time.trackedSec, s))
            .font(.system(size: 12, weight: .bold, design: .rounded))
        }
      }
    }
  }
}

struct FlowiWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: FlowiEntry

  var body: some View {
    Group {
      switch family {
      case .systemSmall: SmallView(entry: entry)
      case .systemLarge: LargeView(entry: entry)
      default: MediumView(entry: entry)
      }
    }
    .containerBackground(FlowiColor.background, for: .widget)
  }
}

// MARK: - Widget

struct FlowiWidget: Widget {
  let kind = "FlowiWidget"

  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: kind, intent: FlowiWidgetIntent.self, provider: FlowiProvider()) { entry in
      FlowiWidgetView(entry: entry)
    }
    .configurationDisplayName("Flowi")
    .description("Швидкі дії, а у великому розмірі — кільця дня.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}

@main
struct FlowiWidgetBundle: WidgetBundle {
  var body: some Widget {
    FlowiWidget()
  }
}
