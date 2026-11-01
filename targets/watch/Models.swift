import Foundation

// Моделі контракту docs/specs/watch-lockscreen-v1.md: DeviceAction / ActionResult (§2)
// і WatchTodaySnapshot v1 (§4). Ключі JSON — рівно як у специфікації. Дати — рядки ISO,
// усе толерантне до відсутніх полів: зіпсований елемент масиву відкидається, а не валить знімок.

// MARK: - JSON value

enum JSONValue: Codable, Equatable {
  case string(String)
  case number(Double)
  case bool(Bool)
  case object([String: JSONValue])
  case array([JSONValue])
  case null

  init(from decoder: Decoder) throws {
    let c = try decoder.singleValueContainer()
    if c.decodeNil() {
      self = .null
    } else if let b = try? c.decode(Bool.self) {
      self = .bool(b)
    } else if let n = try? c.decode(Double.self) {
      self = .number(n)
    } else if let s = try? c.decode(String.self) {
      self = .string(s)
    } else if let a = try? c.decode([JSONValue].self) {
      self = .array(a)
    } else {
      self = .object(try c.decode([String: JSONValue].self))
    }
  }

  func encode(to encoder: Encoder) throws {
    var c = encoder.singleValueContainer()
    switch self {
    case .string(let s): try c.encode(s)
    case .number(let n): try c.encode(n)
    case .bool(let b): try c.encode(b)
    case .object(let o): try c.encode(o)
    case .array(let a): try c.encode(a)
    case .null: try c.encodeNil()
    }
  }

  var stringValue: String? { if case .string(let s) = self { return s }; return nil }
  var doubleValue: Double? { if case .number(let n) = self { return n }; return nil }
  var boolValue: Bool? { if case .bool(let b) = self { return b }; return nil }
}

// MARK: - Lossy decoding

private struct Failable<T: Decodable>: Decodable {
  let value: T?
  init(from decoder: Decoder) throws { value = try? T(from: decoder) }
}

extension KeyedDecodingContainer {
  /// Масив, у якому зіпсовані елементи пропускаються; відсутній/null → [].
  func lossy<T: Decodable>(_ type: T.Type, _ key: Key) -> [T] {
    let items = (try? decodeIfPresent([Failable<T>].self, forKey: key)) ?? nil
    return (items ?? []).compactMap { $0.value }
  }

  /// Рядок, що міг прийти числом (наприклад user.id).
  func lenientString(_ key: Key) -> String? {
    if let s = try? decodeIfPresent(String.self, forKey: key) { return s }
    if let i = try? decodeIfPresent(Int.self, forKey: key) { return String(i) }
    return nil
  }
}

// MARK: - DeviceAction (§2)

enum ActionType {
  static let taskComplete = "task_complete"
  static let taskCreate = "task_create"
  static let timerStart = "timer_start"
  static let timerStop = "timer_stop"
  static let expenseCreate = "expense_create"
  static let habitCheck = "habit_check"
  static let noteCreate = "note_create"
}

struct DeviceAction: Codable, Equatable, Identifiable {
  var id: String
  var type: String
  var at: String
  var tz: String?
  var day: String?
  var source: String?
  var payload: [String: JSONValue]

  /// Нова дія годинника: UUID v4 у нижньому регістрі, `at` — зараз (UTC з мс),
  /// `tz`/`day` — пояс і локальний день годинника (обов'язкові для watch, §2.3).
  static func make(_ type: String, _ payload: [String: JSONValue], now: Date = Date()) -> DeviceAction {
    DeviceAction(
      id: UUID().uuidString.lowercased(),
      type: type,
      at: FlowiDate.iso(now),
      tz: TimeZone.current.identifier,
      day: FlowiDate.dayKey(now),
      source: "watch",
      payload: payload
    )
  }

  func string(_ key: String) -> String? { payload[key]?.stringValue }
  func bool(_ key: String) -> Bool? { payload[key]?.boolValue }
  var atDate: Date { FlowiDate.parse(at) ?? Date() }
}

struct ActionResult: Codable, Equatable {
  struct Record: Codable, Equatable {
    var collection: String?
    var local_id: String?
  }
  var id: String
  var status: String  // applied | duplicate | rejected | retry
  var reason: String?
  var record: Record?

  /// applied/duplicate/rejected — дію знято з черги; retry — лишається.
  var isFinal: Bool { status != "retry" }
}

/// Відповідь на дії — однакова від телефону (ack, §6.1) і сервера (§5.4).
struct ActionsResponse: Decodable {
  var results: [ActionResult]
  var snapshot: WatchSnapshot?

  enum CodingKeys: String, CodingKey { case results, snapshot }

  init(results: [ActionResult], snapshot: WatchSnapshot?) {
    self.results = results
    self.snapshot = snapshot
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    results = c.lossy(ActionResult.self, .results)
    snapshot = try? c.decodeIfPresent(WatchSnapshot.self, forKey: .snapshot)
  }
}

// MARK: - WatchTodaySnapshot v1 (§4)

struct WUser: Codable, Equatable {
  var id: String?
  var name: String?

  enum CodingKeys: String, CodingKey { case id, name }

  init(id: String?, name: String?) {
    self.id = id
    self.name = name
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = c.lenientString(.id)
    name = try? c.decodeIfPresent(String.self, forKey: .name)
  }
}

struct WTask: Codable, Equatable, Identifiable {
  var id: String
  var title: String?
  var projectId: String?
  var projectName: String?
  var deadline: String?
  var hasTime: Bool?
  var overdue: Bool?
  var done: Bool?
  var canComplete: Bool?
  var timerId: String?
  var recurring: Bool?

  var isDone: Bool { done == true }
}

struct WCounts: Codable, Equatable {
  var done: Int?
  var total: Int?
}

struct WHabit: Codable, Equatable, Identifiable {
  var id: String
  var title: String?
  var icon: String?
  var color: String?
  var doneToday: Bool?
  var streak: Int?
}

struct WTimer: Codable, Equatable, Identifiable {
  var id: String
  var label: String?
  var startedAt: String?
  var taskId: String?
  var meetingId: String?
  var projectName: String?

  var startDate: Date { FlowiDate.parse(startedAt) ?? Date() }
}

struct WTimers: Codable, Equatable {
  var active: [WTimer]
  var trackedTodaySec: Double?
  var recentLabels: [String]

  enum CodingKeys: String, CodingKey { case active, trackedTodaySec, recentLabels }

  init(active: [WTimer] = [], trackedTodaySec: Double? = 0, recentLabels: [String] = []) {
    self.active = active
    self.trackedTodaySec = trackedTodaySec
    self.recentLabels = recentLabels
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    active = c.lossy(WTimer.self, .active)
    trackedTodaySec = try? c.decodeIfPresent(Double.self, forKey: .trackedTodaySec)
    recentLabels = c.lossy(String.self, .recentLabels)
  }
}

struct WCategory: Codable, Equatable, Hashable {
  var name: String
  var icon: String?
}

struct WAccount: Codable, Equatable, Identifiable, Hashable {
  var id: String
  var name: String?
  var currency: String?
  var symbol: String?
  var decimals: Int?
  var kind: String?
}

struct WFinance: Codable, Equatable {
  var categories: [WCategory]
  var accounts: [WAccount]
  var defaultAccountId: String?

  enum CodingKeys: String, CodingKey { case categories, accounts, defaultAccountId }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    categories = c.lossy(WCategory.self, .categories)
    accounts = c.lossy(WAccount.self, .accounts)
    defaultAccountId = try? c.decodeIfPresent(String.self, forKey: .defaultAccountId)
  }
}

struct WMeeting: Codable, Equatable, Identifiable {
  var key: String
  var meetingId: String?
  var title: String?
  var date: String?
  var time: String?
  var durationMinutes: Double?
  var startsAt: String?
  var location: String?

  var id: String { key }
}

struct WatchSnapshot: Codable, Equatable {
  var v: Int?
  var source: String?
  var generatedAt: String?
  var day: String?
  var tz: String?
  var lang: String?
  var user: WUser?
  var tasks: [WTask]
  var taskCounts: WCounts?
  var habits: [WHabit]
  var timers: WTimers?
  var finance: WFinance?
  var meetings: [WMeeting]

  enum CodingKeys: String, CodingKey {
    case v, source, generatedAt, day, tz, lang, user, tasks, taskCounts, habits, timers, finance, meetings
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    v = try? c.decodeIfPresent(Int.self, forKey: .v)
    source = try? c.decodeIfPresent(String.self, forKey: .source)
    generatedAt = try? c.decodeIfPresent(String.self, forKey: .generatedAt)
    day = try? c.decodeIfPresent(String.self, forKey: .day)
    tz = try? c.decodeIfPresent(String.self, forKey: .tz)
    lang = try? c.decodeIfPresent(String.self, forKey: .lang)
    user = try? c.decodeIfPresent(WUser.self, forKey: .user)
    tasks = c.lossy(WTask.self, .tasks)
    taskCounts = try? c.decodeIfPresent(WCounts.self, forKey: .taskCounts)
    habits = c.lossy(WHabit.self, .habits)
    timers = try? c.decodeIfPresent(WTimers.self, forKey: .timers)
    finance = try? c.decodeIfPresent(WFinance.self, forKey: .finance)
    meetings = c.lossy(WMeeting.self, .meetings)
  }

  var generatedDate: Date { FlowiDate.parse(generatedAt) ?? .distantPast }

  /// «Новіший знімок перемагає» (§4): порівнюємо generatedAt; інший користувач — завжди заміна.
  func isNewer(than other: WatchSnapshot?) -> Bool {
    guard let other else { return true }
    if let a = user?.id, let b = other.user?.id, a != b { return true }
    return generatedDate >= other.generatedDate
  }

  static func decode(json: String) -> WatchSnapshot? {
    guard let data = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(WatchSnapshot.self, from: data)
  }
}

// MARK: - Dates

enum FlowiDate {
  // ISO8601DateFormatter потокобезпечний (документація Foundation).
  nonisolated(unsafe) private static let withMs: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    f.timeZone = TimeZone(identifier: "UTC")
    return f
  }()

  nonisolated(unsafe) private static let plain: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
  }()

  /// ISO-8601 UTC з мілісекундами (`2026-10-18T09:12:33.120Z`).
  static func iso(_ date: Date) -> String { withMs.string(from: date) }

  static func parse(_ string: String?) -> Date? {
    guard let string, !string.isEmpty else { return nil }
    return withMs.date(from: string) ?? plain.date(from: string)
  }

  /// Локальний `YYYY-MM-DD`.
  static func dayKey(_ date: Date, calendar: Calendar = .current) -> String {
    let c = calendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
  }

  /// Дедлайн «на сьогодні без часу» (§3.2): локальний полудень, як ISO UTC.
  static func localNoon(_ date: Date = Date(), calendar: Calendar = .current) -> String {
    let noon = calendar.date(bySettingHour: 12, minute: 0, second: 0, of: date) ?? date
    return iso(noon)
  }

  static func tomorrowKey(_ date: Date = Date(), calendar: Calendar = .current) -> String {
    dayKey(calendar.date(byAdding: .day, value: 1, to: date) ?? date, calendar: calendar)
  }
}
