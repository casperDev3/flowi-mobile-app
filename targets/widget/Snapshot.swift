import Foundation
import HealthKit

/// Спільна App Group застосунку й віджета (app.json → ios.entitlements).
let flowiAppGroup = "group.com.casper3.f-tracking-app"
/// Той самий ключ, що WIDGET_SNAPSHOT_KEY у utils/widgetSnapshot.ts.
let flowiSnapshotKey = "flowi_widget_snapshot_v1"
let flowiStepsGoal = 10000

/// Дзеркало `WidgetSnapshot` з utils/widgetSnapshot.ts (v1).
struct FlowiSnapshot: Codable {
  struct Finance: Codable {
    var currency: String
    var symbol: String
    var decimals: Int
    var income: Double
    var expense: Double
  }
  struct Steps: Codable {
    var value: Double
    var goal: Double
  }
  struct Tasks: Codable {
    var done: Int
    var total: Int
  }
  struct Running: Codable {
    var label: String
    var startedAt: String
    var count: Int
  }
  struct Time: Codable {
    var trackedSec: Double
    var running: Running?
  }

  var v: Int
  var generatedAt: String
  var day: String
  var lang: String
  var authed: Bool
  var finance: Finance
  var steps: Steps
  var tasks: Tasks
  var time: Time

  static let empty = FlowiSnapshot(
    v: 1, generatedAt: "", day: "", lang: FlowiSnapshot.deviceLang, authed: false,
    finance: Finance(currency: "UAH", symbol: "₴", decimals: 2, income: 0, expense: 0),
    steps: Steps(value: 0, goal: Double(flowiStepsGoal)),
    tasks: Tasks(done: 0, total: 0),
    time: Time(trackedSec: 0, running: nil)
  )

  /// Демо-дані для галереї віджетів (placeholder).
  static let preview = FlowiSnapshot(
    v: 1, generatedAt: "", day: FlowiSnapshot.dayKey(Date()), lang: FlowiSnapshot.deviceLang, authed: true,
    finance: Finance(currency: "UAH", symbol: "₴", decimals: 2, income: 1200, expense: 450),
    steps: Steps(value: 6400, goal: Double(flowiStepsGoal)),
    tasks: Tasks(done: 5, total: 8),
    time: Time(trackedSec: 2 * 3600 + 15 * 60, running: nil)
  )

  static var deviceLang: String {
    let code = Locale.preferredLanguages.first ?? "uk"
    return code.hasPrefix("en") ? "en" : "uk"
  }

  static func dayKey(_ date: Date) -> String {
    let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
  }

  static func load() -> FlowiSnapshot? {
    guard let defaults = UserDefaults(suiteName: flowiAppGroup) else { return nil }
    let data: Data?
    if let string = defaults.string(forKey: flowiSnapshotKey) {
      data = string.data(using: .utf8)
    } else {
      data = defaults.data(forKey: flowiSnapshotKey)
    }
    guard let data else { return nil }
    return try? JSONDecoder().decode(FlowiSnapshot.self, from: data)
  }

  /// Знімок за ІНШУ добу (застосунок не відкривали після півночі) — числа
  /// обнуляються; таймер, що йде, лишається (він не привʼязаний до доби).
  func normalized(for now: Date) -> FlowiSnapshot {
    guard day != FlowiSnapshot.dayKey(now) else { return self }
    var copy = self
    copy.finance.income = 0
    copy.finance.expense = 0
    copy.steps.value = 0
    copy.tasks = Tasks(done: 0, total: 0)
    copy.time.trackedSec = 0
    return copy
  }

  var runningStartedAt: Date? {
    guard let running = time.running else { return nil }
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = f.date(from: running.startedAt) { return d }
    f.formatOptions = [.withInternetDateTime]
    return f.date(from: running.startedAt)
  }
}

/// Кроки за сьогодні напряму з HealthKit (HKStatisticsQuery, cumulativeSum).
/// nil — HealthKit недоступний, дозволу немає або пристрій заблоковано.
enum FlowiHealth {
  static func todaySteps(now: Date = Date()) async -> Double? {
    guard HKHealthStore.isHealthDataAvailable(),
          let type = HKQuantityType.quantityType(forIdentifier: .stepCount) else { return nil }
    let store = HKHealthStore()
    let start = Calendar.current.startOfDay(for: now)
    let predicate = HKQuery.predicateForSamples(withStart: start, end: now, options: .strictStartDate)
    return await withCheckedContinuation { (continuation: CheckedContinuation<Double?, Never>) in
      let query = HKStatisticsQuery(
        quantityType: type,
        quantitySamplePredicate: predicate,
        options: .cumulativeSum
      ) { _, statistics, error in
        if error != nil {
          continuation.resume(returning: nil)
          return
        }
        continuation.resume(returning: statistics?.sumQuantity()?.doubleValue(for: .count()) ?? 0)
      }
      store.execute(query)
    }
  }
}
